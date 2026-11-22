/** Strict, read-only interchange contract for manually captured interaction checks. */
import { Buffer } from 'node:buffer';
export const VERSION = 1;
export const UNKNOWN = 'UNKNOWN';
export const KINDS = Object.freeze(['touch-target', 'focus', 'accessible-name', 'keyboard', 'screen-reader', 'status-message']);
export const RESULTS = Object.freeze(['PASS', 'FAIL', UNKNOWN]);
export const TIERS = Object.freeze([UNKNOWN, 'self-reported', 'documented', 'field-observed']);
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const LIMITS = Object.freeze({ bytes: 6_000_000, routes: 256, checks: 8_000, text: 1_500, issues: 1_000 });
const ID = /^[a-z0-9][a-z0-9._:-]{0,95}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[a-f0-9]{64}$/;
const KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DOCUMENT_FIELDS = ['schemaVersion', 'capturedOn', 'routes'];
const ROUTE_FIELDS = ['id', 'path', 'language', 'checks'];
const CHECK_FIELDS = ['id', 'kind', 'result', 'source', 'licence', 'retrievedOn', 'verificationTier', 'note', 'width', 'height', 'focusVisible', 'accessibleName', 'keyboardReachable', 'announced', 'digest'];
const OBSERVED = Object.freeze({
  'touch-target': ['width', 'height'], focus: ['focusVisible'],
  'accessible-name': ['accessibleName'], keyboard: ['keyboardReachable'],
  'screen-reader': ['announced'], 'status-message': ['announced'],
});
export function problem(code, path) { return { code, path }; }
export function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function day(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, date] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const d = new Date(0); d.setUTCHours(0, 0, 0, 0); d.setUTCFullYear(year, month - 1, date);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === date;
}
export function text(value, max = LIMITS.text) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value &&
    ![...value].some(character => { const code = character.codePointAt(0); return code < 32 || code === 127 || code === 0xfffd; });
}
export function id(value) { return typeof value === 'string' && ID.test(value) && !KEYS.has(value); }
export function routePath(value) {
  return text(value, 160) && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') &&
    !value.includes('?') && !value.includes('#') && !value.includes('%') && value.split('/').every(part => part !== '.' && part !== '..') &&
    !value.includes('//');
}
export function unexpected(value, allowed, path) {
  return Object.keys(value).filter(key => !allowed.includes(key) || KEYS.has(key)).map(key => problem('UNRECOGNISED_FIELD', `${path}.${key}`));
}
export function checkObservation(row, path, today) {
  if (!plain(row)) return { value: null, issues: [problem('CHECK_OBJECT', path)] };
  const issues = unexpected(row, CHECK_FIELDS, path);
  if (!id(row.id)) issues.push(problem('CHECK_ID', `${path}.id`));
  if (!KINDS.includes(row.kind)) issues.push(problem('CHECK_KIND', `${path}.kind`));
  if (!RESULTS.includes(row.result)) issues.push(problem('CHECK_RESULT', `${path}.result`));
  if (!text(row.source, 500)) issues.push(problem('SOURCE_REQUIRED', `${path}.source`));
  if (!text(row.licence, 150)) issues.push(problem('LICENCE_REQUIRED', `${path}.licence`));
  if (!day(row.retrievedOn) || row.retrievedOn > today) issues.push(problem('RETRIEVED_ON', `${path}.retrievedOn`));
  if (!TIERS.includes(row.verificationTier)) issues.push(problem('VERIFICATION_TIER', `${path}.verificationTier`));
  if (row.note !== undefined && !text(row.note, 900)) issues.push(problem('NOTE', `${path}.note`));
  if (row.digest !== undefined && (typeof row.digest !== 'string' || !SHA.test(row.digest))) issues.push(problem('DIGEST', `${path}.digest`));
  const allowed = OBSERVED[row.kind] ?? [];
  for (const field of ['width', 'height', 'focusVisible', 'accessibleName', 'keyboardReachable', 'announced']) {
    if (row[field] !== undefined && !allowed.includes(field)) issues.push(problem('MEASUREMENT_KIND', `${path}.${field}`));
  }
  if (row.kind === 'touch-target') {
    const w = row.width, h = row.height;
    if ((w === undefined) !== (h === undefined)) issues.push(problem('MEASUREMENT_PAIR', path));
    for (const field of ['width', 'height']) {
      if (row[field] !== undefined && (!Number.isFinite(row[field]) || row[field] < 0 || row[field] > 5000)) issues.push(problem('MEASUREMENT_SIZE', `${path}.${field}`));
    }
  }
  for (const field of ['focusVisible', 'keyboardReachable', 'announced']) {
    if (row[field] !== undefined && typeof row[field] !== 'boolean') issues.push(problem('MEASUREMENT_BOOLEAN', `${path}.${field}`));
  }
  if (row.accessibleName !== undefined && !(row.kind === 'accessible-name' && row.result === 'FAIL' && row.accessibleName === '') && !text(row.accessibleName, 400)) issues.push(problem('MEASUREMENT_NAME', `${path}.accessibleName`));
  const observed = allowed.length > 0 && allowed.every(key => row[key] !== undefined);
  if (row.result === 'PASS' && !observed) issues.push(problem('UNSUPPORTED_PASS', path));
  if (row.result === 'PASS' && row.kind === 'touch-target' && (row.width < 44 || row.height < 44)) issues.push(problem('UNSUPPORTED_PASS', path));
  if (row.result === 'PASS' && ['focus', 'keyboard', 'screen-reader', 'status-message'].includes(row.kind)) {
    const field = allowed[0]; if (row[field] !== true) issues.push(problem('UNSUPPORTED_PASS', path));
  }
  if (row.result === 'FAIL' && !observed) issues.push(problem('UNSUPPORTED_FAIL', path));
  if (row.result === 'FAIL' && row.kind === 'touch-target' && row.width >= 44 && row.height >= 44) issues.push(problem('UNSUPPORTED_FAIL', path));
  if (row.result === 'FAIL' && ['focus', 'keyboard', 'screen-reader', 'status-message'].includes(row.kind)) {
    const field = allowed[0]; if (row[field] !== false) issues.push(problem('UNSUPPORTED_FAIL', path));
  }
  if (row.result === 'FAIL' && row.kind === 'accessible-name' && row.accessibleName !== '') issues.push(problem('UNSUPPORTED_FAIL', path));
  // An UNKNOWN result is never silently changed by a positive observation.
  if (issues.length) return { value: null, issues };
  return { value: Object.fromEntries(CHECK_FIELDS.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])), issues: [] };
}
export function checkRoute(row, index, today) {
  const path = `routes[${index}]`;
  if (!plain(row)) return { value: null, issues: [problem('ROUTE_OBJECT', path)] };
  const issues = unexpected(row, ROUTE_FIELDS, path);
  if (!id(row.id)) issues.push(problem('ROUTE_ID', `${path}.id`));
  if (!routePath(row.path)) issues.push(problem('ROUTE_PATH', `${path}.path`));
  if (!LANGUAGES.includes(row.language)) issues.push(problem('LANGUAGE', `${path}.language`));
  if (!Array.isArray(row.checks) || row.checks.length > LIMITS.checks) {
    issues.push(problem('CHECK_LIST', `${path}.checks`)); return { value: null, issues };
  }
  const seen = new Set(), checks = [];
  for (let i = 0; i < row.checks.length; i++) {
    const result = checkObservation(row.checks[i], `${path}.checks[${i}]`, today);
    issues.push(...result.issues);
    if (!result.value) continue;
    if (seen.has(result.value.id)) issues.push(problem('DUPLICATE_CHECK', `${path}.checks[${i}].id`));
    seen.add(result.value.id); checks.push(result.value);
    if (issues.length > LIMITS.issues) break;
  }
  return { value: issues.length ? null : { id: row.id, path: row.path, language: row.language, checks }, issues: issues.slice(0, LIMITS.issues) };
}
export function validate(input, { today = '2026-11-21' } = {}) {
  if (!day(today)) return { ok: false, issues: [problem('INVALID_TODAY', '$')] };
  if (!plain(input)) return { ok: false, issues: [problem('ROOT_OBJECT', '$')] };
  const issues = unexpected(input, DOCUMENT_FIELDS, '$');
  if (input.schemaVersion !== VERSION) issues.push(problem('VERSION', 'schemaVersion'));
  if (!day(input.capturedOn) || input.capturedOn > today) issues.push(problem('CAPTURED_ON', 'capturedOn'));
  if (!Array.isArray(input.routes) || input.routes.length > LIMITS.routes) {
    issues.push(problem('ROUTE_LIST', 'routes')); return { ok: false, issues };
  }
  const seen = new Set(), routeKeys = new Set(), routes = [];
  let count = 0;
  for (let i = 0; i < input.routes.length; i++) {
    const result = checkRoute(input.routes[i], i, today);
    issues.push(...result.issues);
    if (!result.value) continue;
    const route = result.value, key = `${route.language}|${route.path}`;
    if (seen.has(route.id)) issues.push(problem('DUPLICATE_ROUTE', `routes[${i}].id`));
    if (routeKeys.has(key)) issues.push(problem('DUPLICATE_PATH_LANGUAGE', `routes[${i}].path`));
    seen.add(route.id); routeKeys.add(key); routes.push(route); count += route.checks.length;
    if (count > LIMITS.checks) issues.push(problem('CHECK_LIMIT', 'routes'));
    if (issues.length > LIMITS.issues) break;
  }
  if (issues.length) return { ok: false, issues: issues.slice(0, LIMITS.issues) };
  return { ok: true, value: { schemaVersion: VERSION, capturedOn: input.capturedOn, routes }, issues: [] };
}
export function parse(raw, options = {}) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > LIMITS.bytes) return { ok: false, issues: [problem('INPUT_SIZE', '$')] };
  let value;
  try { value = JSON.parse(raw); } catch { return { ok: false, issues: [problem('INVALID_JSON', '$')] }; }
  return validate(value, options);
}
export function example() {
  return { schemaVersion: VERSION, capturedOn: '2026-11-21', routes: [
    { id: 'fictional-route-en', path: '/fictional', language: 'en', checks: [
      { id: 'fictional-button', kind: 'touch-target', result: UNKNOWN, source: 'Illustrative fixture only', licence: 'CC0-1.0', retrievedOn: '2026-11-21', verificationTier: UNKNOWN },
    ] },
  ] };
}
