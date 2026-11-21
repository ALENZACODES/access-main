/** Compare two recorded releases without modifying either source snapshot. */
import { createHash } from 'node:crypto';
import { analyzeRecoveryTraces } from './offline-recovery-trace-analysis.mjs';

export const CHANGE_KINDS = Object.freeze([
  'added', 'removed', 'outcome-changed', 'evidence-changed',
  'source-changed', 'licence-changed', 'date-changed', 'tier-changed',
  'route-changed', 'category-changed', 'locale-changed', 'mode-changed',
  'label-changed', 'unchanged',
]);
function signature(value) { return JSON.stringify(value); }
function hashOf(value) { return createHash('sha256').update(signature(value)).digest('hex'); }
export function traceDifferences(before, after) {
  const changes = [];
  if (before.state !== after.state) changes.push('outcome-changed');
  if (before.digest !== after.digest) changes.push('evidence-changed');
  if (before.source.source !== after.source.source) changes.push('source-changed');
  if (before.source.licence !== after.source.licence) changes.push('licence-changed');
  if (before.source.retrievedOn !== after.source.retrievedOn) changes.push('date-changed');
  if (before.source.tier !== after.source.tier) changes.push('tier-changed');
  if (before.route !== after.route) changes.push('route-changed');
  if (before.category !== after.category) changes.push('category-changed');
  if (before.locale !== after.locale) changes.push('locale-changed');
  if (before.mode !== after.mode) changes.push('mode-changed');
  if (signature(before.label) !== signature(after.label)) changes.push('label-changed');
  return changes.length ? changes : ['unchanged'];
}
export function compareRecoveryReleases(before, after, options = {}) {
  const previous = analyzeRecoveryTraces(before, options);
  const next = analyzeRecoveryTraces(after, options);
  const problems = [
    ...previous.problems.map((issue) => ({ ...issue, snapshot: 'before' })),
    ...next.problems.map((issue) => ({ ...issue, snapshot: 'after' })),
  ];
  if (problems.length) return { ok: false, problems, changes: [], summary: null };
  const a = new Map(previous.report.traces.map((trace) => [trace.id, trace]));
  const b = new Map(next.report.traces.map((trace) => [trace.id, trace]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort((left, right) => left.localeCompare(right));
  const changes = [];
  for (const id of ids) {
    const earlier = a.get(id);
    const later = b.get(id);
    const kinds = !earlier ? ['added'] : !later ? ['removed'] : traceDifferences(earlier, later);
    for (const kind of kinds) {
      changes.push({ id, kind, before: earlier?.state ?? null, after: later?.state ?? null,
        beforeHash: earlier ? hashOf({ source: earlier.source, digest: earlier.digest }) : null,
        afterHash: later ? hashOf({ source: later.source, digest: later.digest }) : null,
      });
    }
  }
  const meaningful = changes.filter((change) => change.kind !== 'unchanged');
  return { ok: true, problems: [], changes, summary: {
    before: a.size, after: b.size, changes: meaningful.length,
    added: changes.filter((entry) => entry.kind === 'added').length,
    removed: changes.filter((entry) => entry.kind === 'removed').length,
    uncertain: changes.filter((entry) => entry.after === 'UNKNOWN' && entry.kind !== 'unchanged').length,
    regressions: changes.filter((entry) => entry.before === 'PASS' && entry.after !== 'PASS').length,
  } };
}
export function reviewChange(change) {
  if (change.kind === 'removed') return 'review';
  if (change.before === 'PASS' && change.after === 'FAIL') return 'block';
  if (change.before === 'PASS' && change.after === 'UNKNOWN') return 'review';
  if (change.kind === 'unchanged') return 'information';
  return 'review';
}
export function changedTraceIds(result) {
  if (!result?.ok) return [];
  return [...new Set(result.changes.filter((change) => change.kind !== 'unchanged')
    .map((change) => change.id))].sort();
}
export function stableChangeSummary(result) {
  if (!result?.ok) return null;
  return {
    total: result.changes.length,
    categories: Object.fromEntries(CHANGE_KINDS.map((kind) => [kind,
      result.changes.filter((entry) => entry.kind === kind).length])),
  };
}
