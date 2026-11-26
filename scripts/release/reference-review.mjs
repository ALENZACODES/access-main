/** Deterministic offline review of manually recorded external references. No network checks. */
import { UNKNOWN, entryKey, canonicalDestination, trackingParameters, validDate, validateManifest } from './reference-contract.mjs';
export const CATEGORIES = Object.freeze(['uncertain', 'age', 'language', 'destination', 'tracking', 'duplicate', 'context']);
export const SEVERITIES = Object.freeze(['review', 'caution', 'info']);
const MS_DAY = 86_400_000;
export function elapsedDays(earlier, later) {
  if (!validDate(earlier) || !validDate(later)) return null;
  return Math.floor((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / MS_DAY);
}
function finding(entry, code, severity, category, detail = '') {
  return { id: entryKey(entry), code, severity, category, detail };
}
export function reviewReferences(value, { today = '2026-11-21', staleDays = 180 } = {}) {
  const valid = validateManifest(value, { today });
  if (!valid.ok) return { ok: false, problems: valid.problems };
  if (!Number.isInteger(staleDays) || staleDays < 1 || staleDays > 3650) return { ok: false, problems: ['staleDays:RANGE'] };
  const findings = [];
  const entries = [...value.references].sort((a, b) => entryKey(a).localeCompare(entryKey(b), 'en'));
  const byDestination = new Map();
  const paired = new Map();
  const routes = new Map();
  for (const entry of entries) {
    if (!routes.has(entry.route)) routes.set(entry.route, []);
    routes.get(entry.route).push(entry);
    const normalized = canonicalDestination(entry.destination);
    const destinationKey = `${entry.route}|${entry.locale}|${normalized}`;
    if (!byDestination.has(destinationKey)) byDestination.set(destinationKey, []);
    byDestination.get(destinationKey).push(entry);
    if (entry.pairId !== undefined) {
      const pairKey = `${entry.route}|${entry.pairId}`;
      if (!paired.has(pairKey)) paired.set(pairKey, []);
      paired.get(pairKey).push(entry);
    }
    if (entry.status === UNKNOWN) findings.push(finding(entry, 'STATUS_UNKNOWN', 'review', 'uncertain'));
    if (entry.tier === UNKNOWN) findings.push(finding(entry, 'TIER_UNKNOWN', 'review', 'uncertain'));
    if (entry.status === 'UNAVAILABLE') findings.push(finding(entry, 'UNAVAILABLE_RECORDED', 'caution', 'destination'));
    const age = elapsedDays(entry.retrievedOn, today);
    if (age !== null && age > staleDays) findings.push(finding(entry, 'RETRIEVAL_STALE', 'review', 'age', String(age)));
    const observationAge = entry.observedOn && elapsedDays(entry.observedOn, today);
    if (observationAge !== undefined && observationAge !== null && observationAge > staleDays) findings.push(finding(entry, 'OBSERVATION_STALE', 'review', 'age', String(observationAge)));
    if (entry.observedOn && entry.observedOn < entry.retrievedOn) findings.push(finding(entry, 'OBSERVATION_BEFORE_SOURCE', 'caution', 'context'));
    if (entry.source === entry.destination) findings.push(finding(entry, 'SOURCE_EQUALS_DESTINATION', 'info', 'context'));
    const trackers = trackingParameters(entry.destination);
    if (trackers.length) findings.push(finding(entry, 'TRACKING_PARAMETERS', 'caution', 'tracking', trackers.join(', ')));
    if (entry.purpose === 'licence' && !/licen[cs]e|copyright|terms|creativecommons|opensource|spdx/iu.test(entry.destination)) findings.push(finding(entry, 'LICENCE_LINK_CONTEXT', 'info', 'context'));
  }
  for (const group of byDestination.values()) {
    if (group.length > 1) for (const entry of group) findings.push(finding(entry, 'DESTINATION_DUPLICATED', 'info', 'duplicate', String(group.length)));
  }
  for (const group of paired.values()) {
    const en = group.filter(entry => entry.locale === 'en');
    const fr = group.filter(entry => entry.locale === 'fr');
    if (!en.length || !fr.length) for (const entry of group) findings.push(finding(entry, 'PAIR_LANGUAGE_MISSING', 'review', 'language'));
    if (en.length > 1 || fr.length > 1) for (const entry of group) findings.push(finding(entry, 'PAIR_LANGUAGE_DUPLICATED', 'caution', 'language'));
    if (en.length && fr.length && en[0].purpose !== fr[0].purpose) for (const entry of group) findings.push(finding(entry, 'PAIR_PURPOSE_DIFFERS', 'caution', 'language'));
    if (en.length && fr.length && canonicalDestination(en[0].destination) !== canonicalDestination(fr[0].destination)) for (const entry of group) findings.push(finding(entry, 'PAIR_DESTINATION_DIFFERS', 'info', 'language'));
  }
  findings.sort((a, b) => a.id.localeCompare(b.id, 'en') || a.code.localeCompare(b.code, 'en') || a.detail.localeCompare(b.detail, 'en'));
  const count = { review: 0, caution: 0, info: 0 };
  for (const item of findings) count[item.severity] += 1;
  const routeList = [...routes].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([path, members]) => ({ path, total: members.length, english: members.filter(e => e.locale === 'en').length, french: members.filter(e => e.locale === 'fr').length, unknown: members.filter(e => e.status === UNKNOWN).length }));
  return { ok: true, value: { schemaVersion: 1, capturedOn: value.capturedOn, reviewedOn: today, total: entries.length, counts: count, routes: routeList, findings } };
}
export function queueForReview(report) {
  if (!report || !Array.isArray(report.findings)) return [];
  const order = { review: 0, caution: 1, info: 2 };
  return [...report.findings].sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id, 'en') || a.code.localeCompare(b.code, 'en'));
}
export function findingsByCategory(report) {
  const out = Object.fromEntries(CATEGORIES.map(key => [key, []]));
  if (!report || !Array.isArray(report.findings)) return out;
  for (const finding of report.findings) if (out[finding.category]) out[finding.category].push(finding);
  return out;
}
