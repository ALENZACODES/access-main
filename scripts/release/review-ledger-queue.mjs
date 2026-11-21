import { FEATURES, UNKNOWN, error, validDay } from './review-ledger-contract.mjs';
import { analyzeLedger } from './review-ledger-engine.mjs';
import { evidenceReconciliation } from './review-ledger-compare.mjs';

export function priorityFor(item, findings) {
  const codes = new Set(findings.map(x => x.code));
  let priority = 0;
  if (codes.has('CONFLICT')) priority += 50;
  if (codes.has('REVIEWED_WITH_CONFLICT')) priority += 35;
  if (codes.has('UNKNOWN_STATUS')) priority += 25;
  if (codes.has('OLD_EVIDENCE')) priority += 15;
  if (codes.has('UNOPENED_CASE')) priority += 15;
  if (codes.has('UNKNOWN_TIER')) priority += 8;
  if (codes.has('NO_DOCUMENT_HASH')) priority += 5;
  if (item.workflow.state === 'waiting') priority += 7;
  if (item.workflow.state === 'deferred') priority += 3;
  if (item.workflow.state === 'closed') priority = Math.max(0, priority - 10);
  return priority;
}
export function reviewQueue(ledger, { today = '2026-11-20', includeClosed = false, feature = null, placeId = null } = {}) {
  if (!validDay(today)) return { ok: false, issues: [error('TODAY_INVALID', '$')] };
  if (feature !== null && !FEATURES.includes(feature)) return { ok: false, issues: [error('FEATURE_INVALID', '$')] };
  const analysis = analyzeLedger(ledger, { today });
  if (!analysis.ok) return analysis;
  const reconciliation = evidenceReconciliation(ledger, { today });
  const rows = [];
  for (const item of analysis.cases) {
    if (!includeClosed && item.workflow.state === 'closed') continue;
    if (feature && item.feature !== feature) continue;
    if (placeId && item.placeId !== placeId) continue;
    const findings = reconciliation.findings.filter(x => x.id === item.id);
    rows.push({ id: item.id, placeId: item.placeId, feature: item.feature, state: item.workflow.state, decision: item.workflow.decision, status: item.statuses.status, conflict: item.statuses.hasConflict, evidenceCount: item.observationCount, priority: priorityFor(item, findings), findings: findings.map(x => x.code), lastDate: item.workflow.lastDate });
  }
  rows.sort((a, b) => b.priority - a.priority || a.lastDate.localeCompare(b.lastDate) || a.id.localeCompare(b.id));
  const counts = { total: rows.length, conflict: 0, unknown: 0, pending: 0, closed: 0 };
  for (const row of rows) {
    if (row.conflict) counts.conflict += 1;
    if (row.status === UNKNOWN) counts.unknown += 1;
    if (row.state !== 'closed') counts.pending += 1;
    else counts.closed += 1;
  }
  return { ok: true, rows, counts };
}
export function placeCoverage(ledger, { today = '2026-11-20', expectedFeatures = FEATURES } = {}) {
  if (!Array.isArray(expectedFeatures) || expectedFeatures.some(x => !FEATURES.includes(x)) || new Set(expectedFeatures).size !== expectedFeatures.length) return { ok: false, issues: [error('EXPECTED_FEATURES_INVALID', '$')] };
  const analysis = analyzeLedger(ledger, { today });
  if (!analysis.ok) return analysis;
  const places = [...new Set([...analysis.cases.map(x => x.placeId), ...ledger.observations.map(x => x.placeId)])].sort();
  const rows = [];
  for (const placeId of places) {
    const cases = analysis.cases.filter(x => x.placeId === placeId);
    const features = [];
    for (const feature of expectedFeatures) {
      const relevant = cases.filter(x => x.feature === feature);
      const statuses = new Set(relevant.map(x => x.statuses.status));
      const conflicting = relevant.some(x => x.statuses.hasConflict) || statuses.has('reported') && statuses.has('not-reported');
      const status = relevant.length === 0 || conflicting || statuses.has(UNKNOWN) || statuses.size !== 1 ? UNKNOWN : [...statuses][0];
      features.push({ feature, status, caseCount: relevant.length, conflicting, observed: relevant.length > 0 });
    }
    rows.push({ placeId, features, availableEvidenceCategories: features.filter(x => x.observed).length, unknownCategories: features.filter(x => x.status === UNKNOWN).length });
  }
  return { ok: true, rows, expectedFeatures: [...expectedFeatures] };
}
export function readinessChecklist(ledger, { today = '2026-11-20' } = {}) {
  const queue = reviewQueue(ledger, { today, includeClosed: true });
  if (!queue.ok) return queue;
  const coverage = placeCoverage(ledger, { today });
  if (!coverage.ok) return coverage;
  const reasons = [];
  if (queue.counts.pending) reasons.push({ code: 'OPEN_REVIEW_CASES', count: queue.counts.pending });
  if (queue.counts.conflict) reasons.push({ code: 'CONFLICTS_PRESENT', count: queue.counts.conflict });
  if (queue.counts.unknown) reasons.push({ code: 'UNKNOWN_PRESENT', count: queue.counts.unknown });
  const missing = coverage.rows.reduce((sum, place) => sum + place.features.filter(x => !x.observed).length, 0);
  if (missing) reasons.push({ code: 'MISSING_CATEGORIES', count: missing });
  return { ok: true, reviewComplete: queue.counts.pending === 0, evidenceComplete: missing === 0, reasons, notice: 'Completeness of a review is not a statement that any place is accessible.' };
}
export function categoryStatistics(ledger, { today = '2026-11-20' } = {}) {
  const analysis = analyzeLedger(ledger, { today });
  if (!analysis.ok) return analysis;
  const rows = FEATURES.map(feature => ({ feature, cases: 0, observations: 0, unknown: 0, conflicts: 0, open: 0 }));
  const byFeature = new Map(rows.map(x => [x.feature, x]));
  for (const item of analysis.cases) {
    const row = byFeature.get(item.feature);
    row.cases += 1;
    row.observations += item.observationCount;
    if (item.statuses.status === UNKNOWN) row.unknown += 1;
    if (item.statuses.hasConflict) row.conflicts += 1;
    if (item.workflow.state !== 'closed') row.open += 1;
  }
  return { ok: true, rows };
}
export function explainPriority(row) {
  if (!row) return [];
  const explanations = [];
  if (row.conflict) explanations.push('Conflicting reports require human review');
  if (row.status === UNKNOWN) explanations.push('Reported status remains UNKNOWN');
  if (row.findings.includes('OLD_EVIDENCE')) explanations.push('Evidence retrieval date is older than one year');
  if (row.findings.includes('UNKNOWN_TIER')) explanations.push('At least one verification tier is UNKNOWN');
  if (row.findings.includes('NO_DOCUMENT_HASH')) explanations.push('At least one observation has no document hash');
  if (row.state === 'new') explanations.push('Review case has not been opened');
  if (row.state === 'waiting') explanations.push('Additional evidence has been requested');
  if (row.state === 'deferred') explanations.push('Review has been deferred');
  return explanations;
}
