/** Evidence triage for human review, never an accessibility or eligibility decision. */
import { validDate, CATEGORIES, toDisplay } from './offline-dossier-contract.mjs';
export const REVIEW_CODES = Object.freeze([
  'FILE_UNAVAILABLE', 'FILE_MISMATCH', 'UNKNOWN_EVIDENCE', 'UNKNOWN_TIER',
  'STALE_EVIDENCE', 'MISSING_EXPECTED_CATEGORY'
]);
export function ageInDays(retrievedOn, today) {
  if (!validDate(retrievedOn) || !validDate(today)) throw Error('INVALID_DATE');
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${retrievedOn}T00:00:00Z`)) / 86_400_000);
}
export function reviewOptions(options = {}) {
  const { today = '2026-11-20', staleAfterDays = 365, expectedPlaces = [], expectedCategories = [] } = options;
  if (!validDate(today) || !Number.isSafeInteger(staleAfterDays) || staleAfterDays < 1 || staleAfterDays > 3650 ||
    !Array.isArray(expectedPlaces) || !Array.isArray(expectedCategories) ||
    expectedPlaces.length > 2000 || expectedCategories.length > CATEGORIES.length ||
    expectedPlaces.some(x => typeof x !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(x)) ||
    expectedCategories.some(x => !CATEGORIES.includes(x)) ||
    new Set(expectedPlaces).size !== expectedPlaces.length ||
    new Set(expectedCategories).size !== expectedCategories.length) throw Error('INVALID_REVIEW_OPTIONS');
  return { today, staleAfterDays, expectedPlaces, expectedCategories };
}
export function finding(id, code, placeId, category, details = {}) {
  return { id, code, placeId, category, ...details };
}
export function reviewDossier(audit, options = {}) {
  const { today, staleAfterDays, expectedPlaces, expectedCategories } = reviewOptions(options);
  if (!audit || !Array.isArray(audit.results)) throw Error('INVALID_AUDIT');
  const findings = [], known = new Map();
  for (const result of audit.results) {
    const item = result.item;
    if (!item || typeof item.id !== 'string' || typeof item.placeId !== 'string' || !CATEGORIES.includes(item.category)) throw Error('INVALID_AUDIT');
    const coverageKey = `${item.placeId}\u0000${item.category}`;
    known.set(coverageKey, (known.get(coverageKey) ?? 0) + 1);
    if (['MISSING', 'UNSAFE', 'READ_ERROR'].includes(result.status)) findings.push(finding(item.id, 'FILE_UNAVAILABLE', item.placeId, item.category, { fileStatus: result.status }));
    if (['SIZE_MISMATCH', 'HASH_MISMATCH'].includes(result.status)) findings.push(finding(item.id, 'FILE_MISMATCH', item.placeId, item.category, { fileStatus: result.status }));
    if (item.status === 'unknown') findings.push(finding(item.id, 'UNKNOWN_EVIDENCE', item.placeId, item.category));
    if (item.verificationTier === 'unknown') findings.push(finding(item.id, 'UNKNOWN_TIER', item.placeId, item.category));
    const age = ageInDays(item.retrievedOn, today);
    if (age > staleAfterDays) findings.push(finding(item.id, 'STALE_EVIDENCE', item.placeId, item.category, { ageDays: age }));
  }
  // Only explicit user-supplied expectations create missing-coverage findings.
  for (const placeId of expectedPlaces) {
    for (const category of expectedCategories) {
      if (!known.has(`${placeId}\u0000${category}`)) findings.push(finding(null, 'MISSING_EXPECTED_CATEGORY', placeId, category));
    }
  }
  findings.sort((a,b) => (a.placeId.localeCompare(b.placeId,'en') || a.category.localeCompare(b.category,'en') ||
    (a.id ?? '').localeCompare(b.id ?? '', 'en') || a.code.localeCompare(b.code,'en')));
  const counts = Object.fromEntries(REVIEW_CODES.map(code => [code, 0]));
  for (const item of findings) counts[item.code]++;
  return { today, staleAfterDays, counts, findings, total: findings.length,
    // No representation of accessibility status or eligibility is calculated.
    humanReviewRequired: findings.length > 0 };
}
export function compareReviews(previous, current) {
  if (!previous || !current || !Array.isArray(previous.findings) || !Array.isArray(current.findings)) throw Error('INVALID_REVIEW');
  const key = x => [x.id ?? 'UNKNOWN',x.placeId,x.category,x.code].join('|');
  const past = new Map(previous.findings.map(x => [key(x),x]));
  const present = new Map(current.findings.map(x => [key(x),x]));
  const appeared = [...present].filter(([id]) => !past.has(id)).map(([,v]) => v);
  const cleared = [...past].filter(([id]) => !present.has(id)).map(([,v]) => v);
  const continuing = [...present].filter(([id]) => past.has(id)).map(([,v]) => v);
  return { appeared, cleared, continuing, counts: { appeared: appeared.length, cleared: cleared.length, continuing: continuing.length } };
}
export function reviewText(review, language='en') {
  if (!['en','fr'].includes(language)) throw Error('INVALID_LANGUAGE');
  const fr = language === 'fr';
  const colon = fr ? '\u00a0:' : ':', semicolon = fr ? '\u202f;' : ';';
  const title = fr ? 'Points à examiner' : 'Review findings';
  const warning = fr ? 'Ces points n’établissent pas l’accessibilité d’un lieu.' : 'These findings do not establish whether a place is accessible.';
  const lines = review.findings.map(x => `${x.placeId} | ${x.category} | ${x.id ?? 'UNKNOWN'} | ${x.code}${x.ageDays !== undefined ? ` | ${x.ageDays}` : ''}`);
  return `${title}${colon} ${review.total}${semicolon}\n${lines.join('\n')}\n${warning}\n`;
}
export function reviewJson(review) {
  return { today: review.today, total: review.total, counts: review.counts,
    findings: review.findings.map(x => ({ ...x, evidence: toDisplay('unknown') })) };
}
