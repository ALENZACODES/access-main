/** Deterministic change attribution for two validated snapshots. */
import { validate, UNKNOWN } from './interaction-evidence-contract.mjs';
import { analyze, index } from './interaction-evidence-analysis.mjs';
export const CHANGE_FIELDS = Object.freeze(['kind', 'result', 'source', 'licence', 'retrievedOn', 'verificationTier', 'note', 'width', 'height', 'focusVisible', 'accessibleName', 'keyboardReachable', 'announced', 'digest']);
export const CHANGE_KINDS = Object.freeze(['added', 'removed', 'changed', 'unchanged']);
export function changesFor(before, after) {
  return CHANGE_FIELDS.filter(key => (before?.[key] ?? null) !== (after?.[key] ?? null));
}
export function compare(before, after, { today = '2026-11-21' } = {}) {
  const left = validate(before, { today }), right = validate(after, { today });
  const issues = [];
  if (!left.ok) issues.push(...left.issues.map(issue => ({ ...issue, path: `before.${issue.path}` })));
  if (!right.ok) issues.push(...right.issues.map(issue => ({ ...issue, path: `after.${issue.path}` })));
  if (issues.length) return { ok: false, issues };
  const a = index(left.value), b = index(right.value);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x.localeCompare(y, 'en'));
  const counts = Object.fromEntries(CHANGE_KINDS.map(k => [k, 0]));
  const changes = [];
  for (const key of keys) {
    const old = a.get(key)?.check ?? null, next = b.get(key)?.check ?? null;
    let kind;
    if (!old) kind = 'added';
    else if (!next) kind = 'removed';
    else kind = changesFor(old, next).length ? 'changed' : 'unchanged';
    counts[kind] += 1;
    changes.push({ key, kind, fields: old && next ? changesFor(old, next) : [], before: old, after: next });
  }
  const oldReport = analyze(left.value, { today }), newReport = analyze(right.value, { today });
  const regressions = [], improvements = [], indeterminate = [];
  for (const item of changes) {
    const from = item.before?.result ?? UNKNOWN, to = item.after?.result ?? UNKNOWN;
    const pair = { key: item.key, from, to, kind: item.kind };
    if (from === 'PASS' && to === 'FAIL') regressions.push(pair);
    else if (from === 'FAIL' && to === 'PASS') improvements.push(pair);
    else if (item.kind !== 'unchanged' && (from === UNKNOWN || to === UNKNOWN)) indeterminate.push(pair);
  }
  const beforeFlags = new Set(oldReport.value.reviews.map(f => `${f.key}|${f.code}`));
  const afterFlags = new Set(newReport.value.reviews.map(f => `${f.key}|${f.code}`));
  const introduced = [...afterFlags].filter(key => !beforeFlags.has(key)).sort();
  const resolved = [...beforeFlags].filter(key => !afterFlags.has(key)).sort();
  return { ok: true, value: { counts, changes, regressions, improvements, indeterminate, introduced, resolved,
    beforeDate: left.value.capturedOn, afterDate: right.value.capturedOn,
    warning: 'A recorded PASS is not proof that an entire route or location is accessible.' }, issues: [] };
}
export function changedOnly(result) { return result.ok ? result.value.changes.filter(x => x.kind !== 'unchanged') : []; }
export function regressionsOnly(result) { return result.ok ? result.value.regressions : []; }
export function summarizeChanges(result) {
  if (!result.ok) return { ok: false, issues: result.issues };
  const v = result.value;
  return { ok: true, value: { ...v.counts, regressions: v.regressions.length, improvements: v.improvements.length,
    indeterminate: v.indeterminate.length, introduced: v.introduced.length, resolved: v.resolved.length }, issues: [] };
}
