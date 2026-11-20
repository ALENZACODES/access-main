/**
 * A typed-in-spirit, plain-JavaScript contract for *recorded* accessibility checks.
 * A recorded PASS is never a statement about a physical place or a live session.
 * There is no browser, clock, geocoder, network request or background task here.
 */
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';
import { isOpenLicence, isValidDate } from './site-audit.mjs';

export const REGRESSION_VERSION = 1;
export const OUTCOMES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const LOCALES = Object.freeze(['en', 'fr']);
export const NETWORK_MODES = Object.freeze(['online', 'offline', 'limited', 'UNKNOWN']);
export const STORAGE_MODES = Object.freeze(['ready', 'blocked', 'full', 'UNKNOWN']);
export const CHECK_CATEGORIES = Object.freeze([
  'keyboard', 'focus', 'screen-reader', 'target', 'locale', 'offline',
  'storage', 'privacy', 'provenance', 'navigation',
]);
export const REGRESSION_LIMITS = Object.freeze({
  maxBytes: 8_000_000,
  maxRuns: 2_500,
  maxChecksPerRun: 150,
  maxIssues: 1_000,
  maxText: 2_048,
  maxDepth: 28,
  maxPath: 256,
  maxProofs: 15_000,
});
const RESULT_SET = new Set(OUTCOMES);
const LOCALE_SET = new Set(LOCALES);
const NETWORK_SET = new Set(NETWORK_MODES);
const STORAGE_SET = new Set(STORAGE_MODES);
const CATEGORY_SET = new Set(CHECK_CATEGORIES);
const ID = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,95}$/u;
const HASH = /^[0-9a-f]{64}$/iu;
const PRIVATE = new Set([
  'email', 'phone', 'phonenumber', 'firstname', 'lastname', 'fullname',
  'personname', 'streetaddress', 'postaladdress', 'postalcode', 'dateofbirth',
  'birthdate', 'healthcard', 'ohip', 'diagnosis', 'medication', 'prescription',
  'password', 'token', 'apikey', 'secret', 'session', 'cookie',
  'sessioncookie', 'locationhistory', 'gps', 'latitude', 'longitude',
  'coordinates', 'ipaddress', 'privatekey', 'bearertoken',
]);
const PROTOTYPE_FIELDS = new Set(['__proto__', 'prototype', 'constructor']);
const ROOT_KEYS = new Set(['version', 'releaseId', 'capturedOn', 'runs']);
const RUN_KEYS = new Set([
  'id', 'route', 'locale', 'network', 'storage', 'viewport', 'checks',
]);
const VIEWPORT_KEYS = new Set(['width', 'height']);
const CHECK_KEYS = new Set([
  'id', 'category', 'outcome', 'label', 'source', 'licence', 'retrievedOn',
  'tier', 'artifactSha256', 'targetWidth', 'targetHeight', 'notes',
]);
const TRANSLATION_KEYS = new Set(['en', 'fr']);
const DEFAULT_TODAY = null;

export function problem(code, path) {
  return Object.freeze({ code, path });
}

export function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function pointer(segment) {
  return String(segment).replace(/~/gu, '~0').replace(/\//gu, '~1');
}

export function normalKey(key) {
  return key.toLowerCase().replace(/[-_]/gu, '');
}

export function hasControl(value) {
  return [...value].some((character) => {
    const ordinal = character.codePointAt(0);
    return ordinal < 32 || ordinal === 127;
  });
}

export function safeIdentifier(value) {
  return typeof value === 'string' && ID.test(value) &&
    !PROTOTYPE_FIELDS.has(value.toLowerCase());
}

export function safeText(value, max = REGRESSION_LIMITS.maxText) {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= max && !hasControl(value) && !/[<>]/u.test(value);
}

export function safeRoute(value) {
  if (value === '/') return true;
  if (typeof value !== 'string' || value.length > REGRESSION_LIMITS.maxPath ||
    !value.startsWith('/') || value.startsWith('//') || hasControl(value)) return false;
  if (value.includes('\\') || value.includes('?') || value.includes('#') ||
    value.includes('%') || value.includes('//')) return false;
  return value.split('/').every((part, index) => index === 0 ||
    (part !== '.' && part !== '..' && /^[a-zA-Z0-9._~-]+$/u.test(part)));
}

export function safeHttps(value) {
  if (typeof value !== 'string' || value.length > REGRESSION_LIMITS.maxText ||
    hasControl(value)) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username ||
      parsed.password || parsed.hash) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') ||
      host === '0.0.0.0' || host === '[::1]' || /^127\./u.test(host) ||
      /^10\./u.test(host) || /^192\.168\./u.test(host) ||
      /^169\.254\./u.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function dateIssues(value, path, today = DEFAULT_TODAY) {
  const issues = [];
  if (!isValidDate(value)) issues.push(problem('DATE_INVALID', path));
  else if (today && isValidDate(today) && value > today) {
    issues.push(problem('FUTURE_DATE', path));
  }
  return issues;
}

export function frenchCopyIssues(value, path) {
  const issues = [];
  if (typeof value !== 'string') return [problem('TEXT_INVALID', path)];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === ':' && i > 0 && value[i - 1] !== '\u00a0') {
      issues.push(problem('FR_COLON', `${path}/${i}`));
    }
    if (';!?'.includes(char) && i > 0 && value[i - 1] !== '\u202f') {
      issues.push(problem('FR_NARROW', `${path}/${i}`));
    }
    if (char === '«' && value[i + 1] !== '\u202f') {
      issues.push(problem('FR_GUILLEMET', `${path}/${i}`));
    }
    if (char === '»' && value[i - 1] !== '\u202f') {
      issues.push(problem('FR_GUILLEMET', `${path}/${i}`));
    }
    if (char === "'" && /[a-zA-ZÀ-ÿ]/u.test(value[i - 1] ?? '') &&
      /[a-zA-ZÀ-ÿ]/u.test(value[i + 1] ?? '')) {
      issues.push(problem('FR_APOSTROPHE', `${path}/${i}`));
    }
  }
  return issues;
}

export function pairIssues(value, path) {
  if (!plainObject(value)) return [problem('PAIR_REQUIRED', path)];
  const issues = [];
  for (const language of LOCALES) {
    if (!safeText(value[language])) {
      issues.push(problem('LOCALE_TEXT_REQUIRED', `${path}/${language}`));
    }
  }
  for (const key of Object.keys(value)) {
    if (!TRANSLATION_KEYS.has(key)) {
      issues.push(problem('LOCALE_EXTRA', `${path}/${pointer(key)}`));
    }
  }
  if (safeText(value.fr)) issues.push(...frenchCopyIssues(value.fr, `${path}/fr`));
  return issues;
}

export function privateFields(value, path = '', options = {}) {
  const maximum = options.maxDepth ?? REGRESSION_LIMITS.maxDepth;
  const visited = new WeakSet();
  const issues = [];
  const stack = [{ value, path, depth: 0 }];
  while (stack.length > 0 && issues.length < REGRESSION_LIMITS.maxIssues) {
    const current = stack.pop();
    if (current.value === null || typeof current.value !== 'object') continue;
    if (visited.has(current.value)) {
      issues.push(problem('CYCLIC_DATA', current.path || '/'));
      continue;
    }
    visited.add(current.value);
    if (current.depth >= maximum) {
      issues.push(problem('DEPTH_LIMIT', current.path || '/'));
      continue;
    }
    const entries = Array.isArray(current.value) ?
      current.value.map((child, index) => [String(index), child]) :
      Object.entries(current.value);
    for (const [key, child] of entries) {
      const location = `${current.path}/${pointer(key)}`;
      if (PRIVATE.has(normalKey(key)) || PROTOTYPE_FIELDS.has(key)) {
        issues.push(problem('PRIVATE_FIELD', location));
      } else if (child !== null && typeof child === 'object') {
        stack.push({ value: child, path: location, depth: current.depth + 1 });
      }
    }
  }
  return issues;
}

export function extraKeys(object, allowed, path) {
  if (!plainObject(object)) return [];
  return Object.keys(object).filter((key) => !allowed.has(key)).map((key) =>
    problem('EXTRA_FIELD', `${path}/${pointer(key)}`));
}

export function viewportIssues(value, path) {
  if (!plainObject(value)) return [problem('VIEWPORT_INVALID', path)];
  const issues = extraKeys(value, VIEWPORT_KEYS, path);
  for (const key of ['width', 'height']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 200 || value[key] > 8_192) {
      issues.push(problem('VIEWPORT_DIMENSION', `${path}/${key}`));
    }
  }
  return issues;
}

export function checkIssues(value, path, today) {
  if (!plainObject(value)) return [problem('CHECK_INVALID', path)];
  const issues = extraKeys(value, CHECK_KEYS, path);
  if (!safeIdentifier(value.id)) issues.push(problem('CHECK_ID', `${path}/id`));
  if (!CATEGORY_SET.has(value.category)) issues.push(problem('CHECK_CATEGORY', `${path}/category`));
  if (!RESULT_SET.has(value.outcome)) issues.push(problem('CHECK_OUTCOME', `${path}/outcome`));
  issues.push(...pairIssues(value.label, `${path}/label`));
  if (!safeHttps(value.source)) issues.push(problem('SOURCE_URL', `${path}/source`));
  if (!isOpenLicence(value.licence)) issues.push(problem('SOURCE_LICENCE', `${path}/licence`));
  issues.push(...dateIssues(value.retrievedOn, `${path}/retrievedOn`, today));
  if (![0, 1, 2, 3, 4, 'E'].includes(value.tier)) {
    issues.push(problem('SOURCE_TIER', `${path}/tier`));
  }
  if (value.artifactSha256 !== undefined &&
    (typeof value.artifactSha256 !== 'string' || !HASH.test(value.artifactSha256))) {
    issues.push(problem('ARTIFACT_HASH', `${path}/artifactSha256`));
  }
  if (value.targetWidth !== undefined || value.targetHeight !== undefined) {
    if (value.category !== 'target') issues.push(problem('TARGET_CATEGORY', path));
    for (const key of ['targetWidth', 'targetHeight']) {
      if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 20_000) {
        issues.push(problem('TARGET_DIMENSION', `${path}/${key}`));
      }
    }
    if (value.category === 'target' && value.outcome === 'PASS' &&
      (value.targetWidth < 44 || value.targetHeight < 44)) {
      issues.push(problem('TARGET_PASS_CONTRADICTION', path));
    }
  } else if (value.category === 'target' && value.outcome === 'PASS') {
    issues.push(problem('TARGET_MEASUREMENT_REQUIRED', path));
  }
  if (value.notes !== undefined && !safeText(value.notes)) {
    issues.push(problem('NOTES_INVALID', `${path}/notes`));
  }
  return issues;
}

export function runIssues(value, path, today) {
  if (!plainObject(value)) return [problem('RUN_INVALID', path)];
  const issues = extraKeys(value, RUN_KEYS, path);
  if (!safeIdentifier(value.id)) issues.push(problem('RUN_ID', `${path}/id`));
  if (!safeRoute(value.route)) issues.push(problem('RUN_ROUTE', `${path}/route`));
  if (!LOCALE_SET.has(value.locale)) issues.push(problem('RUN_LOCALE', `${path}/locale`));
  if (!NETWORK_SET.has(value.network)) issues.push(problem('RUN_NETWORK', `${path}/network`));
  if (!STORAGE_SET.has(value.storage)) issues.push(problem('RUN_STORAGE', `${path}/storage`));
  issues.push(...viewportIssues(value.viewport, `${path}/viewport`));
  if (!Array.isArray(value.checks) || value.checks.length === 0 ||
    value.checks.length > REGRESSION_LIMITS.maxChecksPerRun) {
    issues.push(problem('RUN_CHECKS', `${path}/checks`));
    return issues;
  }
  const seen = new Set();
  for (let i = 0; i < value.checks.length; i += 1) {
    const check = value.checks[i];
    issues.push(...checkIssues(check, `${path}/checks/${i}`, today));
    if (safeIdentifier(check?.id)) {
      if (seen.has(check.id)) issues.push(problem('DUPLICATE_CHECK', `${path}/checks/${i}/id`));
      seen.add(check.id);
    }
  }
  return issues;
}

export function inspectRegressionSnapshot(value, options = {}) {
  const issues = [];
  const limits = { ...REGRESSION_LIMITS, ...options.limits };
  if (!plainObject(value)) return { ok: false, issues: [problem('SNAPSHOT_INVALID', '/')], snapshot: null };
  if (value.version !== REGRESSION_VERSION) issues.push(problem('VERSION_INVALID', '/version'));
  if (!safeIdentifier(value.releaseId)) issues.push(problem('RELEASE_ID', '/releaseId'));
  issues.push(...dateIssues(value.capturedOn, '/capturedOn', options.today));
  if (!Array.isArray(value.runs) || value.runs.length === 0 || value.runs.length > limits.maxRuns) {
    issues.push(problem('RUN_LIMIT', '/runs'));
    return { ok: false, issues, snapshot: null };
  }
  issues.push(...privateFields(value, '', limits));
  if (issues.length > 0) return { ok: false, issues, snapshot: null };
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, issues: [problem('SNAPSHOT_ENCODING', '/')], snapshot: null };
  }
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > limits.maxBytes) {
    issues.push(problem('SNAPSHOT_BYTES', '/'));
    return { ok: false, issues, snapshot: null };
  }
  issues.push(...extraKeys(value, ROOT_KEYS, ''));
  const ids = new Set();
  const keys = new Set();
  for (let i = 0; i < value.runs.length && issues.length < limits.maxIssues; i += 1) {
    const run = value.runs[i];
    issues.push(...runIssues(run, `/runs/${i}`, options.today));
    if (safeIdentifier(run?.id)) {
      if (ids.has(run.id)) issues.push(problem('DUPLICATE_RUN_ID', `/runs/${i}/id`));
      ids.add(run.id);
    }
    if (safeRoute(run?.route) && LOCALE_SET.has(run?.locale) &&
      NETWORK_SET.has(run?.network) && STORAGE_SET.has(run?.storage) &&
      Number.isSafeInteger(run?.viewport?.width) && Number.isSafeInteger(run?.viewport?.height)) {
      const scope = scopeKey(run);
      if (keys.has(scope)) issues.push(problem('DUPLICATE_SCOPE', `/runs/${i}`));
      keys.add(scope);
    }
  }
  if (issues.length > 0) return { ok: false, issues: issues.slice(0, limits.maxIssues), snapshot: null };
  return { ok: true, issues: [], snapshot: canonicalSnapshot(value) };
}

export function scopeKey(run) {
  return [run.route, run.locale, run.network, run.storage,
    String(run.viewport.width), String(run.viewport.height)].join('|');
}

export function checkKey(run, check) {
  return `${scopeKey(run)}|${check.id}`;
}

export function canonicalSnapshot(snapshot) {
  return {
    version: REGRESSION_VERSION,
    releaseId: snapshot.releaseId,
    capturedOn: snapshot.capturedOn,
    runs: snapshot.runs.map((run) => ({
      id: run.id, route: run.route, locale: run.locale,
      network: run.network, storage: run.storage,
      viewport: { width: run.viewport.width, height: run.viewport.height },
      checks: run.checks.map((check) => ({
        id: check.id, category: check.category, outcome: check.outcome,
        label: { en: check.label.en, fr: check.label.fr },
        source: check.source, licence: check.licence,
        retrievedOn: check.retrievedOn, tier: check.tier,
        ...(check.artifactSha256 === undefined ? {} : { artifactSha256: check.artifactSha256 }),
        ...(check.targetWidth === undefined ? {} : { targetWidth: check.targetWidth }),
        ...(check.targetHeight === undefined ? {} : { targetHeight: check.targetHeight }),
        ...(check.notes === undefined ? {} : { notes: check.notes }),
      })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
    })).sort((a, b) => scopeKey(a).localeCompare(scopeKey(b), 'en')),
  };
}

export function fingerprintSnapshot(snapshot, options = {}) {
  const result = inspectRegressionSnapshot(snapshot, options);
  if (!result.ok) return { ok: false, issues: result.issues, fingerprint: null };
  const raw = JSON.stringify(result.snapshot);
  const sha = createHash('sha256').update(raw, 'utf8').digest('hex');
  return { ok: true, issues: [], fingerprint: `sha256:${sha}` };
}

export function parseRegressionSnapshot(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > REGRESSION_LIMITS.maxBytes) {
    return { ok: false, issues: [problem('INPUT_BYTES', '/')], snapshot: null };
  }
  try {
    return inspectRegressionSnapshot(JSON.parse(text), options);
  } catch {
    return { ok: false, issues: [problem('INVALID_JSON', '/')], snapshot: null };
  }
}

export function serializeRegressionSnapshot(snapshot, options = {}) {
  const result = inspectRegressionSnapshot(snapshot, options);
  return result.ok ? { ok: true, issues: [], text: `${JSON.stringify(result.snapshot, null, 2)}\n` } :
    { ok: false, issues: result.issues, text: null };
}
