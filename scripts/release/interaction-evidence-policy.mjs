/** Human-review planning only. A passed observation does not establish WCAG conformance. */
import { validate, KINDS, LANGUAGES, UNKNOWN, problem } from './interaction-evidence-contract.mjs';
import { analyze, elapsed } from './interaction-evidence-analysis.mjs';
import { compare } from './interaction-evidence-delta.mjs';
export const PRIORITY = Object.freeze(['critical', 'review', 'information']);
export const RULES = Object.freeze({
  RECORDED_FAILURE: 'critical', TOUCH_UNDER_44: 'critical', FOCUS_NOT_VISIBLE: 'critical',
  KEYBOARD_UNREACHABLE: 'critical', NO_ACCESSIBLE_NAME: 'critical', NOT_ANNOUNCED: 'critical',
  CONFLICT: 'critical', MISSING_LANGUAGE: 'review', MISSING_KIND: 'review',
  OLD_EVIDENCE: 'review', UNKNOWN_RESULT: 'review', UNKNOWN_TIER: 'review',
  MISSING_DIGEST: 'information',
});
export function priority(code) { return RULES[code] ?? 'information'; }
export function queue(snapshot, { today = '2026-11-21' } = {}) {
  const checked = analyze(snapshot, { today });
  if (!checked.ok) return checked;
  const items = checked.value.reviews.map(entry => ({ ...entry, priority: priority(entry.code) }));
  items.sort((a, b) => PRIORITY.indexOf(a.priority) - PRIORITY.indexOf(b.priority) ||
    a.path.localeCompare(b.path, 'en') || a.language.localeCompare(b.language, 'en') ||
    a.kind.localeCompare(b.kind, 'en') || a.code.localeCompare(b.code, 'en'));
  const counts = Object.fromEntries(PRIORITY.map(key => [key, 0]));
  for (const item of items) counts[item.priority] += 1;
  return { ok: true, value: { items, counts, total: items.length, today, caution: 'Items are prompts for human review, not accessibility certifications.' }, issues: [] };
}
export function routeMatrix(snapshot, { today = '2026-11-21' } = {}) {
  const checked = validate(snapshot, { today });
  if (!checked.ok) return checked;
  const paths = [...new Set(checked.value.routes.map(r => r.path))].sort();
  const cells = [];
  for (const path of paths) for (const language of LANGUAGES) for (const kind of KINDS) {
    const route = checked.value.routes.find(r => r.path === path && r.language === language);
    const rows = route ? route.checks.filter(row => row.kind === kind) : [];
    const status = !rows.length ? UNKNOWN : rows.some(x => x.result === 'FAIL') ? 'FAIL' :
      rows.some(x => x.result === UNKNOWN) ? UNKNOWN : 'PASS';
    cells.push({ path, language, kind, status, count: rows.length, sourceCount: new Set(rows.map(r => r.source)).size });
  }
  return { ok: true, value: { paths, cells, missing: cells.filter(x => x.count === 0),
    conflicts: cells.filter(x => x.count > 1 && x.status !== 'PASS'),
    caution: 'Matrix cells combine recorded checks only; absent checks stay UNKNOWN.' }, issues: [] };
}
export function staleEvidence(snapshot, { today = '2026-11-21', maxDays = 365 } = {}) {
  if (!Number.isInteger(maxDays) || maxDays < 0 || maxDays > 3650) return { ok: false, issues: [problem('MAX_DAYS', 'maxDays')] };
  const checked = validate(snapshot, { today });
  if (!checked.ok) return checked;
  const entries = [];
  for (const route of checked.value.routes) for (const row of route.checks) {
    const age = elapsed(row.retrievedOn, today);
    if (age !== null && age > maxDays) entries.push({ path: route.path, language: route.language, id: row.id, retrievedOn: row.retrievedOn, age, source: row.source, licence: row.licence, verificationTier: row.verificationTier });
  }
  entries.sort((a, b) => b.age - a.age || a.id.localeCompare(b.id));
  return { ok: true, value: entries, issues: [] };
}
export function comparePriorities(before, after, { today = '2026-11-21' } = {}) {
  const delta = compare(before, after, { today });
  if (!delta.ok) return delta;
  const a = queue(before, { today }), b = queue(after, { today });
  if (!a.ok || !b.ok) return { ok: false, issues: [...(a.issues ?? []), ...(b.issues ?? [])] };
  const from = new Set(a.value.items.map(x => `${x.key}|${x.code}`));
  const to = new Set(b.value.items.map(x => `${x.key}|${x.code}`));
  const introduced = b.value.items.filter(x => !from.has(`${x.key}|${x.code}`));
  const resolved = a.value.items.filter(x => !to.has(`${x.key}|${x.code}`));
  return { ok: true, value: { before: a.value.counts, after: b.value.counts, introduced, resolved,
    regressions: delta.value.regressions, indeterminate: delta.value.indeterminate,
    caution: 'A closed review item is not proof that an accessibility condition changed.' }, issues: [] };
}
export function filterQueue(report, { priority: level = null, kind = null, language = null, path = null } = {}) {
  if (!report?.ok) return [];
  return report.value.items.filter(item => (!level || item.priority === level) && (!kind || item.kind === kind) &&
    (!language || item.language === language) && (!path || item.path === path));
}
export function humanTasks(snapshot, { today = '2026-11-21' } = {}) {
  const result = queue(snapshot, { today });
  if (!result.ok) return result;
  const tasks = result.value.items.map((item, n) => ({
    id: `review-${String(n + 1).padStart(4, '0')}`, path: item.path,
    language: item.language, checkId: item.id, type: item.kind,
    concern: item.code, priority: item.priority,
    action: item.code === 'UNKNOWN_RESULT' || item.code === 'MISSING_KIND' ? 'collect-evidence' :
      item.code === 'OLD_EVIDENCE' ? 'request-new-source' : 'inspect-record',
    status: 'OPEN',
  }));
  return { ok: true, value: tasks, issues: [] };
}
