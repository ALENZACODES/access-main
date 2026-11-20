/** Compare two validated local interaction sets. Every changed observation is reviewable. */
import { analyze, compareStatus, coverage } from './input-continuity-analysis.mjs';
import { fingerprint } from './input-continuity-contract.mjs';

export const CHANGE_KINDS = Object.freeze(['session-added', 'session-removed', 'status', 'recorded-outcome', 'trace-bytes', 'rule', 'source', 'licence', 'retrieval-date', 'tier', 'coverage-lost', 'coverage-added']);
const change = (kind, id, before, after, priority = 'review') => ({ kind, id, before, after, priority });
export function sessionChanges(before, after) {
 const a = new Map(before.reviews.map(x => [x.id, x]));
 const b = new Map(after.reviews.map(x => [x.id, x]));
 const changes = [];
 for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
  const old = a.get(id), next = b.get(id);
  if (!old) { changes.push(change('session-added', id, null, next.status)); continue; }
  if (!next) { changes.push(change('session-removed', id, old.status, null, 'block')); continue; }
  if (old.status !== next.status) changes.push(change('status', id, old.status, next.status, compareStatus(old.status, next.status) === 'regressed' ? 'block' : 'review'));
  if (old.recorded !== next.recorded) changes.push(change('recorded-outcome', id, old.recorded, next.recorded, compareStatus(old.recorded, next.recorded) === 'regressed' ? 'block' : 'review'));
  if (old.digest !== next.digest) changes.push(change('trace-bytes', id, old.digest, next.digest));
  for (const rule of Object.keys(old.rules)) if (old.rules[rule] !== next.rules[rule]) changes.push(change('rule', `${id}:${rule}`, old.rules[rule], next.rules[rule], compareStatus(old.rules[rule], next.rules[rule]) === 'regressed' ? 'block' : 'review'));
  for (const [field, kind] of [['source','source'],['licence','licence'],['retrievedOn','retrieval-date'],['tier','tier']]) {
   if (old.provenance[field] !== next.provenance[field]) changes.push(change(kind, id, old.provenance[field], next.provenance[field]));
  }
 }
 return changes;
}
export function compare(beforeDoc, afterDoc, options = {}) {
 const before = analyze(beforeDoc, options), after = analyze(afterDoc, options);
 if (!before.ok || !after.ok) return { ok: false, issues: [...before.issues.map(x => ({ ...x, side: 'before' })), ...after.issues.map(x => ({ ...x, side: 'after' }))], changes: [], summary: null };
 const changes = sessionChanges(before, after);
 const prev = coverage(beforeDoc, [], options), next = coverage(afterDoc, [], options);
 const first = new Set(prev.missing.map(x => [x.language, x.task, x.input, x.network].join('|')));
 const second = new Set(next.missing.map(x => [x.language, x.task, x.input, x.network].join('|')));
 for (const key of [...second].filter(x => !first.has(x)).sort()) changes.push(change('coverage-lost', key, 'recorded', 'UNKNOWN', 'block'));
 for (const key of [...first].filter(x => !second.has(x)).sort()) changes.push(change('coverage-added', key, 'UNKNOWN', 'recorded'));
 changes.sort((a, b) => [a.id, a.kind].join('|').localeCompare([b.id, b.kind].join('|')));
 return { ok: true, issues: [], changes, summary: { total: changes.length, blocking: changes.filter(x => x.priority === 'block').length, review: changes.filter(x => x.priority === 'review').length, before: before.fingerprint, after: after.fingerprint, digest: fingerprint(changes) } };
}
