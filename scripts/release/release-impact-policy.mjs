/** Explicit human review policies. Never promotes missing evidence to PASS. */
import { UNKNOWN, checkManifest, dateValid } from './release-impact-contract.mjs';
import { graphReview, indexAssets } from './release-impact-graph.mjs';
import { compareManifest } from './release-impact-delta.mjs';
export const PRIORITIES = Object.freeze(['critical', 'review', 'information']);
export const POLICY = Object.freeze({
  CYCLE: 'critical', DISAPPEARED_ENTRY: 'critical', MISSING_LOCALE_ENTRY: 'review',
  ORPHAN: 'review', UNKNOWN_TIER: 'review', OLD_SOURCE: 'review',
  REMOVED_ASSET: 'review', CHANGED_ASSET: 'review', SOURCE_CHANGED: 'review',
  ASSET_ADDED: 'information', NO_ENTRIES: 'review', EXCESSIVE_BUNDLE_BYTES: 'review',
  UNMATCHED_LOCALE: 'review', UNMATCHED_DEPENDENCY: 'review',
});
const code = value => POLICY[value] ?? 'information';
const issue = (id, finding, path = '$', info = '') => ({ id, finding, path, info, priority: code(finding) });
const order = (a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
  `${a.id}:${a.finding}`.localeCompare(`${b.id}:${b.finding}`);
export function sourceAge(retrievedOn, today) {
  if (!dateValid(retrievedOn) || !dateValid(today)) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${retrievedOn}T00:00:00Z`)) / 86_400_000);
}
export function reviewManifest(value, { today = '9999-12-31', oldDays = 365, maxBytes = 4_141_875 } = {}) {
  if (!dateValid(today) || !Number.isSafeInteger(oldDays) || oldDays < 0 || oldDays > 36500 ||
    !Number.isSafeInteger(maxBytes) || maxBytes < 0) return { ok: false, issues: [{ code: 'POLICY_ARGUMENT_INVALID', path: '$' }] };
  const checked = checkManifest(value, { today });
  if (!checked.ok) return checked;
  const graph = graphReview(checked.value).value;
  const issues = [];
  for (const cycle of graph.cycles) issues.push(issue(cycle[0], 'CYCLE', 'dependsOn', cycle.join(' | ')));
  for (const id of graph.orphans) issues.push(issue(id, 'ORPHAN'));
  for (const asset of checked.value.assets) {
    if (asset.tier === UNKNOWN) issues.push(issue(asset.id, 'UNKNOWN_TIER', 'tier'));
    if (sourceAge(asset.retrievedOn, today) > oldDays) issues.push(issue(asset.id, 'OLD_SOURCE', 'retrievedOn'));
    if (asset.entry && asset.locale === 'none') issues.push(issue(asset.id, 'UNMATCHED_LOCALE', 'locale'));
  }
  if (graph.roots.length === 0) issues.push(issue('manifest', 'NO_ENTRIES'));
  const bytes = checked.value.assets.reduce((total, asset) => total + asset.bytes, 0);
  if (bytes > maxBytes) issues.push(issue('manifest', 'EXCESSIVE_BUNDLE_BYTES', 'bytes', `${bytes}`));
  const locales = new Set(checked.value.assets.filter(asset => asset.entry).map(asset => asset.locale));
  if (!locales.has('en') && !locales.has('both')) issues.push(issue('manifest', 'MISSING_LOCALE_ENTRY', 'en'));
  if (!locales.has('fr') && !locales.has('both')) issues.push(issue('manifest', 'MISSING_LOCALE_ENTRY', 'fr'));
  return { ok: true, value: { issues: issues.sort(order), counts: {
    critical: issues.filter(item => item.priority === 'critical').length,
    review: issues.filter(item => item.priority === 'review').length,
    information: issues.filter(item => item.priority === 'information').length,
  }, assets: checked.value.assets.length, bytes, warning: 'Manual review only. UNKNOWN remains UNKNOWN.' }, issues: [] };
}
export function reviewDelta(before, after, options = {}) {
  const comparison = compareManifest(before, after, options);
  if (!comparison.ok) return comparison;
  const issues = [];
  for (const item of comparison.value.items) {
    if (item.kind === 'removed') issues.push(issue(item.id, item.impactedEntries.length ? 'DISAPPEARED_ENTRY' : 'REMOVED_ASSET'));
    if (item.kind === 'added') issues.push(issue(item.id, 'ASSET_ADDED'));
    if (item.kind === 'changed') issues.push(issue(item.id, 'CHANGED_ASSET'));
  }
  for (const source of comparison.value.provenance) issues.push(issue(source.id, 'SOURCE_CHANGED'));
  for (const item of comparison.value.orphanChanges.added) issues.push(issue(item, 'ORPHAN'));
  for (const item of comparison.value.cycles.after) issues.push(issue(item[0], 'CYCLE'));
  return { ok: true, value: { items: issues.sort(order),
    counts: Object.fromEntries(PRIORITIES.map(priority => [priority, issues.filter(item => item.priority === priority).length])),
    warning: 'A changed artifact has not been shown to be safe or accessible.' }, issues: [] };
}
export function filterReview(result, { priority, finding, id } = {}) {
  if (result?.ok !== true) return [];
  return (result.value.issues ?? result.value.items ?? []).filter(item =>
    (priority === undefined || item.priority === priority) &&
    (finding === undefined || item.finding === finding) &&
    (id === undefined || item.id === id));
}
export function planManualTasks(review) {
  if (review?.ok !== true) return [];
  const items = review.value.issues ?? review.value.items ?? [];
  return items.map((row, index) => ({
    taskId: `release-review-${String(index + 1).padStart(4, '0')}`,
    assetId: row.id, concern: row.finding, priority: row.priority, status: 'OPEN',
    action: row.finding === 'OLD_SOURCE' ? 'seek-current-source' :
      row.finding === 'UNKNOWN_TIER' ? 'request-provenance' : 'inspect-release-artifact',
  }));
}
export function dependencyHealth(value) {
  const checked = checkManifest(value);
  if (!checked.ok) return checked;
  const byId = indexAssets(checked.value);
  return { ok: true, value: checked.value.assets.map(asset => ({
    id: asset.id, upstream: asset.dependsOn.length,
    bytes: asset.bytes,
    unresolved: asset.dependsOn.filter(dep => !byId.has(dep)).length,
    provenance: asset.tier === UNKNOWN ? UNKNOWN : 'recorded',
  })), issues: [] };
}
