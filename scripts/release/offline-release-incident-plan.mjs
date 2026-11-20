/** Pure release incident planning; results do not change or certify accessibility. */
import {
  INCIDENT_AREAS, INCIDENT_SEVERITIES, INCIDENT_STATUSES,
  inspectIncidentRegister, incidentFingerprint,
} from './offline-release-incidents.mjs';
import { assessIncidentRegression } from './offline-release-incident-delta.mjs';

const severityRank = Object.freeze({ critical: 0, high: 1, moderate: 2, low: 3 });
const openStatuses = new Set(['open', 'triaged', 'blocked']);
export const PLAN_VERSION = 1;
export const REVIEW_SCOPES = Object.freeze([
  'overall', 'keyboard', 'focus', 'screen-reader', 'touch-target',
  'colour-contrast', 'translation', 'offline', 'provenance', 'privacy', 'integrity',
]);
export const PLAN_DECISIONS = Object.freeze(['REVIEW_REQUIRED', 'NO_OPEN_ITEMS', 'INVALID_INPUT']);
function problem(code, path) { return { code, path }; }
function compareRows(a, b) {
  return severityRank[a.severity] - severityRank[b.severity] ||
    a.area.localeCompare(b.area, 'en') || a.id.localeCompare(b.id, 'en');
}
export function activeIncidentItems(register, options = {}) {
  const result = inspectIncidentRegister(register, options);
  if (!result.ok) return { ok: false, items: [], problems: result.problems };
  const items = register.incidents.filter((item) => openStatuses.has(item.status))
    .map((item) => ({
      id: item.id, area: item.area, severity: item.severity, status: item.status,
      title: item.title, sourceRefs: [...item.sourceRefs].sort(),
      retrievedOn: item.sources.map((source) => source.retrievedOn).sort().at(0),
      claimState: 'UNKNOWN',
    })).sort(compareRows);
  return { ok: true, items, problems: [] };
}
export function readinessByScope(register, options = {}) {
  const check = activeIncidentItems(register, options);
  if (!check.ok) return { ok: false, scopes: null, decision: 'INVALID_INPUT', problems: check.problems };
  const scopes = Object.fromEntries(REVIEW_SCOPES.map((scope) => [scope, {
    scope, open: 0, critical: 0, high: 0, moderate: 0, low: 0,
    blocked: 0, needsHumanReview: false, state: 'UNKNOWN',
  }]));
  for (const item of check.items) {
    for (const scope of ['overall', item.area]) {
      const row = scopes[scope];
      row.open += 1;
      row[item.severity] += 1;
      if (item.status === 'blocked') row.blocked += 1;
      row.needsHumanReview = true;
    }
  }
  return { ok: true, scopes, decision: check.items.length > 0 ? 'REVIEW_REQUIRED' : 'NO_OPEN_ITEMS',
    problems: [], claimState: 'UNKNOWN' };
}
export function reviewWorklist(register, options = {}) {
  const check = activeIncidentItems(register, options);
  if (!check.ok) return { ok: false, items: [], problems: check.problems };
  const area = options.area ?? null;
  if (area !== null && !INCIDENT_AREAS.includes(area)) {
    return { ok: false, items: [], problems: [problem('AREA_INVALID', '/area')] };
  }
  const severity = options.severity ?? null;
  if (severity !== null && !INCIDENT_SEVERITIES.includes(severity)) {
    return { ok: false, items: [], problems: [problem('SEVERITY_INVALID', '/severity')] };
  }
  const status = options.status ?? null;
  if (status !== null && !INCIDENT_STATUSES.includes(status)) {
    return { ok: false, items: [], problems: [problem('STATUS_INVALID', '/status')] };
  }
  const from = options.from ?? 0;
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    return { ok: false, items: [], problems: [problem('PAGE_INVALID', '/page')] };
  }
  const all = check.items.filter((item) =>
    (area === null || item.area === area) &&
    (severity === null || item.severity === severity) &&
    (status === null || item.status === status));
  return { ok: true, items: all.slice(from, from + limit), total: all.length,
    next: from + limit < all.length ? from + limit : null,
    problems: [], claimState: 'UNKNOWN' };
}
export function sourceReviewIndex(register, options = {}) {
  const check = inspectIncidentRegister(register, options);
  if (!check.ok) return { ok: false, index: null, problems: check.problems };
  const index = new Map();
  for (const incident of register.incidents) {
    for (const source of incident.sources) {
      const existing = index.get(source.source) ?? [];
      existing.push({ id: incident.id, status: incident.status, severity: incident.severity,
        retrievedOn: source.retrievedOn, tier: source.tier, licence: source.licence,
        claimState: 'UNKNOWN' });
      index.set(source.source, existing);
    }
  }
  const rows = [...index.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([source, incidents]) => ({ source, incidents: incidents.sort((a, b) => a.id.localeCompare(b.id, 'en')) }));
  return { ok: true, index: rows, problems: [] };
}
export function sourceWithdrawalImpact(register, sourceUrl, options = {}) {
  const looked = sourceReviewIndex(register, options);
  if (!looked.ok) return { ok: false, affected: [], problems: looked.problems };
  if (typeof sourceUrl !== 'string' || !sourceUrl.startsWith('https://')) {
    return { ok: false, affected: [], problems: [problem('SOURCE_INVALID', '/sourceUrl')] };
  }
  const row = looked.index.find((entry) => entry.source === sourceUrl);
  const affected = row?.incidents ?? [];
  return { ok: true, affected, count: affected.length,
    needsHumanReview: affected.length > 0, claimState: 'UNKNOWN', problems: [] };
}
export function incidentReleaseDecision(register, options = {}) {
  const ready = readinessByScope(register, options);
  if (!ready.ok) return { ok: false, decision: 'INVALID_INPUT', reasons: [], problems: ready.problems };
  const active = ready.scopes.overall;
  const reasons = [];
  if (active.critical > 0) reasons.push('OPEN_CRITICAL_INCIDENT');
  if (active.high > 0) reasons.push('OPEN_HIGH_INCIDENT');
  if (active.blocked > 0) reasons.push('BLOCKED_INCIDENT');
  if (active.moderate > 0) reasons.push('OPEN_MODERATE_INCIDENT');
  if (active.low > 0) reasons.push('OPEN_LOW_INCIDENT');
  return { ok: true, decision: active.open > 0 ? 'REVIEW_REQUIRED' : 'NO_OPEN_ITEMS',
    reasons, problems: [], disclaimer: 'NO_ACCESSIBILITY_CERTIFICATION',
    claimState: 'UNKNOWN',
    fingerprint: incidentFingerprint(register, options).fingerprint };
}
export function releaseRegressionDecision(previous, current, options = {}) {
  const now = incidentReleaseDecision(current, options);
  if (!now.ok) return { ok: false, decision: 'INVALID_INPUT', reasons: [], problems: now.problems };
  const delta = assessIncidentRegression(previous, current, options);
  if (!delta.ok) return { ok: false, decision: 'INVALID_INPUT', reasons: [], problems: delta.problems };
  const reasons = [...now.reasons, ...delta.reasons.map((item) => `${item.id}:${item.reason}`)];
  return { ok: true, decision: reasons.length ? 'REVIEW_REQUIRED' : 'NO_OPEN_ITEMS',
    reasons, problems: [], claimState: 'UNKNOWN' };
}
export function planReviewBatches(register, options = {}) {
  const result = reviewWorklist(register, { ...options, from: 0, limit: 500 });
  if (!result.ok) return { ok: false, batches: [], problems: result.problems };
  const batchSize = options.batchSize ?? 10;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    return { ok: false, batches: [], problems: [problem('BATCH_SIZE', '/batchSize')] };
  }
  // The worklist remains bounded; more than 500 items require an explicit later page.
  const batches = [];
  for (let index = 0; index < result.items.length; index += batchSize) {
    const items = result.items.slice(index, index + batchSize);
    batches.push({ batch: batches.length + 1, ids: items.map((item) => item.id),
      count: items.length, state: 'UNKNOWN' });
  }
  return { ok: true, batches, remainingAfterPage: result.total - result.items.length,
    problems: [], claimState: 'UNKNOWN' };
}
