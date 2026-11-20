/** Compare two self-contained evidence registers, never apply changes to them. */
import { validateRegister, canonicalRegister } from './offline-conflict-contract.mjs';
import { analyzeConflicts, evidenceSignature, provenanceKey } from './offline-conflict-analysis.mjs';

export const CHANGE_KINDS = Object.freeze([
  'added', 'removed', 'state', 'source', 'licence', 'date', 'tier',
  'capture', 'relations', 'notes', 'subject', 'attribute',
]);
const PRIORITY = Object.freeze({ block: 3, review: 2, information: 1 });
const cmp = (a, b) => a.localeCompare(b, 'en');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ids = records => new Map(records.map(record => [record.id, record]));
const sorted = entries => [...entries].sort(cmp);

export function recordDifferences(before, after) {
  const output = [];
  if (before.subject !== after.subject) output.push('subject');
  if (before.attribute !== after.attribute) output.push('attribute');
  if (before.state !== after.state) output.push('state');
  if (before.source !== after.source) output.push('source');
  if (before.licence !== after.licence) output.push('licence');
  if (before.retrievedOn !== after.retrievedOn || before.sourceDate !== after.sourceDate) output.push('date');
  if (before.tier !== after.tier) output.push('tier');
  if (before.capturedOn !== after.capturedOn) output.push('capture');
  if (!same(sorted(before.relatedIds ?? []), sorted(after.relatedIds ?? []))) output.push('relations');
  if (!same(before.notes ?? null, after.notes ?? null)) output.push('notes');
  return output;
}
export function classifyTransition(kind, before, after) {
  if (kind === 'removed') return 'block';
  if (kind === 'state') {
    if (after?.state === 'UNKNOWN') return 'block';
    if (before?.state === 'UNKNOWN') return 'review';
    if (before?.state !== after?.state) return 'block';
  }
  if (['source', 'licence', 'tier', 'subject', 'attribute'].includes(kind)) return 'review';
  if (kind === 'added') return 'review';
  return 'information';
}

export function compareRegisters(previous, current, options = {}) {
  const checks = [['previous', validateRegister(previous, options)],
    ['current', validateRegister(current, options)]];
  const problems = checks.flatMap(([name, check]) => check.problems.map(problem => ({ ...problem, register: name })));
  if (problems.length) return { ok: false, problems, changes: [], summary: null };
  const left = ids(previous.records);
  const right = ids(current.records);
  const all = sorted(new Set([...left.keys(), ...right.keys()]));
  const changes = [];
  for (const id of all) {
    const before = left.get(id);
    const after = right.get(id);
    const kinds = before === undefined ? ['added'] : after === undefined ? ['removed'] : recordDifferences(before, after);
    for (const kind of kinds) {
      changes.push({ id, kind, priority: classifyTransition(kind, before, after),
        subject: (after ?? before).subject, attribute: (after ?? before).attribute,
        before: before ? { state: before.state, signature: evidenceSignature(before),
          source: before.source, provenance: provenanceKey(before) } : null,
        after: after ? { state: after.state, signature: evidenceSignature(after),
          source: after.source, provenance: provenanceKey(after) } : null,
        outcome: 'UNKNOWN',
      });
    }
  }
  const earlier = analyzeConflicts(previous, options);
  const later = analyzeConflicts(current, options);
  const oldConflicts = new Set(earlier.conflicts.map(conflict =>
    `${conflict.kind}|${conflict.subject}|${conflict.attribute}|${conflict.recordIds.join(',')}`));
  const newConflicts = new Set(later.conflicts.map(conflict =>
    `${conflict.kind}|${conflict.subject}|${conflict.attribute}|${conflict.recordIds.join(',')}`));
  const summary = {
    recordsBefore: previous.records.length, recordsAfter: current.records.length,
    changes: changes.length,
    conflictCountBefore: earlier.conflicts.length,
    conflictCountAfter: later.conflicts.length,
    newlyRecordedConflicts: [...newConflicts].filter(item => !oldConflicts.has(item)).length,
    withdrawnConflicts: [...oldConflicts].filter(item => !newConflicts.has(item)).length,
    byKind: Object.fromEntries(CHANGE_KINDS.map(kind => [kind, changes.filter(item => item.kind === kind).length])),
    byPriority: Object.fromEntries(Object.keys(PRIORITY).map(priority =>
      [priority, changes.filter(item => item.priority === priority).length])),
  };
  return { ok: true, problems: [], changes, summary };
}

export function releaseReviewTasks(previous, current, options = {}) {
  const report = compareRegisters(previous, current, options);
  if (!report.ok) return { ok: false, problems: report.problems, tasks: [] };
  const tasks = report.changes.filter(change => change.priority !== 'information').map(change => ({
    type: 'human-review', reason: change.kind, id: change.id,
    subject: change.subject, attribute: change.attribute,
    priority: change.priority, state: 'UNKNOWN',
  })).sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority] ||
    cmp(a.subject, b.subject) || cmp(a.attribute, b.attribute) || cmp(a.id, b.id));
  return { ok: true, problems: [], tasks };
}

export function sameCanonicalRegister(before, after, options = {}) {
  const a = validateRegister(before, options);
  const b = validateRegister(after, options);
  if (!a.ok || !b.ok) return false;
  return same(canonicalRegister(before), canonicalRegister(after));
}
