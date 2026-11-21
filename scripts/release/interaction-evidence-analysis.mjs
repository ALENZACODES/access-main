/** Report what the observations say. Never infer that a route or real place is accessible. */
import { KINDS, RESULTS, UNKNOWN, validate, problem } from './interaction-evidence-contract.mjs';
export const REVIEW_CODES = Object.freeze([
  'UNKNOWN_RESULT', 'UNKNOWN_TIER', 'MISSING_DIGEST', 'OLD_EVIDENCE',
  'TOUCH_UNDER_44', 'FOCUS_NOT_VISIBLE', 'NO_ACCESSIBLE_NAME',
  'KEYBOARD_UNREACHABLE', 'NOT_ANNOUNCED', 'RECORDED_FAILURE',
  'MISSING_KIND', 'MISSING_LANGUAGE', 'CONFLICT',
]);
export function index(snapshot) {
  const map = new Map();
  for (const route of snapshot.routes) for (const check of route.checks) {
    map.set(`${route.language}|${route.path}|${check.id}`, { route, check });
  }
  return map;
}
export function group(snapshot) {
  return [...snapshot.routes].sort((a, b) => a.path.localeCompare(b.path, 'en') || a.language.localeCompare(b.language, 'en'));
}
export function elapsed(from, today) {
  const a = Date.parse(`${from}T00:00:00.000Z`), b = Date.parse(`${today}T00:00:00.000Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b - a) / 86_400_000) : null;
}
export function findingsFor(check, today) {
  const out = [];
  if (check.result === UNKNOWN) out.push('UNKNOWN_RESULT');
  if (check.verificationTier === UNKNOWN) out.push('UNKNOWN_TIER');
  if (!check.digest) out.push('MISSING_DIGEST');
  if ((elapsed(check.retrievedOn, today) ?? 0) > 365) out.push('OLD_EVIDENCE');
  if (check.kind === 'touch-target' && check.width !== undefined && check.height !== undefined && (check.width < 44 || check.height < 44)) out.push('TOUCH_UNDER_44');
  if (check.kind === 'focus' && check.focusVisible === false) out.push('FOCUS_NOT_VISIBLE');
  if (check.kind === 'accessible-name' && !check.accessibleName) out.push('NO_ACCESSIBLE_NAME');
  if (check.kind === 'keyboard' && check.keyboardReachable === false) out.push('KEYBOARD_UNREACHABLE');
  if (['screen-reader', 'status-message'].includes(check.kind) && check.announced === false) out.push('NOT_ANNOUNCED');
  if (check.result === 'FAIL') out.push('RECORDED_FAILURE');
  return out;
}
export function coverage(snapshot, { today = '2026-11-21' } = {}) {
  const valid = validate(snapshot, { today });
  if (!valid.ok) return { ok: false, issues: valid.issues };
  const counts = Object.fromEntries(RESULTS.map(key => [key, 0]));
  const byKind = Object.fromEntries(KINDS.map(key => [key, { PASS: 0, FAIL: 0, UNKNOWN: 0 }]));
  const byLanguage = { en: { PASS: 0, FAIL: 0, UNKNOWN: 0 }, fr: { PASS: 0, FAIL: 0, UNKNOWN: 0 } };
  const reviews = [], observations = [], routes = group(valid.value);
  const identified = new Set();
  for (const route of routes) for (const check of route.checks) {
    counts[check.result] += 1;
    byKind[check.kind][check.result] += 1;
    byLanguage[route.language][check.result] += 1;
    const key = `${route.language}|${route.path}|${check.id}`;
    identified.add(`${route.language}|${route.path}|${check.kind}`);
    const codes = findingsFor(check, today);
    for (const code of codes) reviews.push({ key, code, kind: check.kind, language: route.language, path: route.path, id: check.id });
    observations.push({ key, kind: check.kind, result: check.result, path: route.path, language: route.language, id: check.id, source: check.source, licence: check.licence, retrievedOn: check.retrievedOn, verificationTier: check.verificationTier });
  }
  const missing = [];
  const paths = [...new Set(routes.map(r => r.path))].sort();
  for (const path of paths) for (const language of ['en', 'fr']) {
    const route = routes.find(r => r.path === path && r.language === language);
    if (!route) { missing.push({ path, language, kind: UNKNOWN, code: 'MISSING_LANGUAGE' }); continue; }
    for (const kind of KINDS) if (!identified.has(`${language}|${path}|${kind}`)) missing.push({ path, language, kind, code: 'MISSING_KIND' });
  }
  reviews.push(...missing.map(row => ({ ...row, key: `${row.language}|${row.path}|${row.kind}`, id: UNKNOWN })));
  reviews.sort((a, b) => a.key.localeCompare(b.key, 'en') || a.code.localeCompare(b.code, 'en'));
  observations.sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return {
    ok: true, value: {
      capturedOn: valid.value.capturedOn, counts, byKind, byLanguage, routeCount: routes.length,
      checkCount: observations.length, paths, reviews, observations, missing,
      warning: 'Recorded checks are observations, not a general accessibility determination.',
    }, issues: [],
  };
}
export function duplicatesAcrossRoutes(snapshot) {
  const seen = new Map(), conflicts = [];
  for (const route of snapshot.routes) for (const row of route.checks) {
    const key = `${route.language}|${route.path}|${row.kind}`;
    const prior = seen.get(key) ?? [];
    for (const a of prior) if (a.result !== row.result) conflicts.push({ path: route.path, language: route.language, kind: row.kind, firstId: a.id, secondId: row.id, code: 'CONFLICT' });
    prior.push(row); seen.set(key, prior);
  }
  return conflicts.sort((a, b) => a.path.localeCompare(b.path) || a.firstId.localeCompare(b.firstId));
}
export function analyze(snapshot, options = {}) {
  const result = coverage(snapshot, options);
  if (!result.ok) return result;
  const conflicts = duplicatesAcrossRoutes(snapshot);
  return { ok: true, value: { ...result.value, conflicts, reviews: [...result.value.reviews, ...conflicts.map(c => ({ ...c, key: `${c.language}|${c.path}|${c.kind}`, id: c.secondId }))].sort((a, b) => a.key.localeCompare(b.key) || a.code.localeCompare(b.code)) }, issues: [] };
}
export function selectReview(report, { language = null, kind = null, code = null, path = null } = {}) {
  if (!report?.ok) return [];
  return report.value.reviews.filter(x => (!language || x.language === language) && (!kind || x.kind === kind) && (!code || x.code === code) && (!path || x.path === path));
}
export function explainIssue(code) {
  return REVIEW_CODES.includes(code) ? code : problem('UNRECOGNISED_REVIEW_CODE', code);
}
