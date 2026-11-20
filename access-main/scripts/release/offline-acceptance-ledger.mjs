import { Buffer } from 'node:buffer';
/**
 * Offline release acceptance ledger: a deterministic index of test observations.
 * No status here asserts accessibility of a physical venue or confirms a claim.
 * It describes a reviewer-provided test result and the source that reported it.
 * No clock, network, persistence, or user profile is accessed by this module.
 */
import { createHash } from 'node:crypto';
import { validDate, validId, safeUrl, privateKeyIssues } from '../../../scripts/release/offline-review-queue.mjs';

export const LEDGER_VERSION = 1;
export const ACCEPTANCE_KINDS = Object.freeze([
  'keyboard', 'screen-reader', 'focus-visible', 'touch-target',
  'language-en', 'language-fr', 'offline-navigation', 'offline-data',
  'source-provenance', 'licence-attribution', 'claim-unknown',
  'privacy-storage', 'privacy-export', 'asset-integrity',
]);
export const ACCEPTANCE_STATES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const ACCEPTANCE_LIMITS = Object.freeze({
  maxRoutes: 500, maxChecks: 20_000, maxIssues: 500,
  maxText: 1024, maxId: 128, maxBytes: 8_000_000,
});
const KIND = new Set(ACCEPTANCE_KINDS);
const STATE = new Set(ACCEPTANCE_STATES);
const EVIDENCE_KEYS = new Set(['source', 'licence', 'retrievedOn', 'tier', 'runId', 'artifactSha256']);
const CHECK_KEYS = new Set(['id', 'kind', 'state', 'label', 'evidence', 'reviewItemId', 'note']);
const ROUTE_KEYS = new Set(['id', 'path', 'label', 'checks']);
const ROOT_KEYS = new Set(['version', 'capturedOn', 'routes']);
const TRANSLATION_KEYS = new Set(['en', 'fr']);
const HEX64 = /^[a-f0-9]{64}$/i;
const ROUTE_PATH = /^\/(?:[a-z0-9._~!$&'()*+,;=:@%-]+(?:\/[a-z0-9._~!$&'()*+,;=:@%-]+)*)?$/i;
const FORBIDDEN_DIRECT = new Set(['__proto__', 'prototype', 'constructor']);

function issue(code, path) { return Object.freeze({ code, path }); }
function pointer(value) { return String(value).replace(/~/g, '~0').replace(/\//g, '~1'); }
function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function fields(value, allowed, path, output) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key) || FORBIDDEN_DIRECT.has(key)) {
      output.push(issue('EXTRA_FIELD', `${path}/${pointer(key)}`));
    }
  }
}
function limitOptions(options) {
  const result = { ...ACCEPTANCE_LIMITS };
  for (const key of Object.keys(result)) {
    if (options[key] !== undefined) {
      if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > result[key]) {
        return null;
      }
      result[key] = options[key];
    }
  }
  return result;
}
function text(value, max = ACCEPTANCE_LIMITS.maxText) {
  return typeof value === 'string' && value.length <= max &&
    value.trim().length > 0 && ![...value].some((c) => {
      const cp = c.codePointAt(0);
      return cp < 32 || cp === 127;
    });
}
function frenchCopyIssues(value, path) {
  const problems = [];
  if (typeof value !== 'string') return [issue('TRANSLATION_REQUIRED', path)];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === ':' && i > 0 && value[i - 1] !== '\u00A0') {
      problems.push(issue('FR_COLON', `${path}/${i}`));
    }
    if (';!?'.includes(char) && i > 0 && value[i - 1] !== '\u202F') {
      problems.push(issue('FR_NARROW', `${path}/${i}`));
    }
    if (char === '«' && value[i + 1] !== '\u202F') {
      problems.push(issue('FR_GUILLEMET', `${path}/${i}`));
    }
    if (char === '»' && value[i - 1] !== '\u202F') {
      problems.push(issue('FR_GUILLEMET', `${path}/${i}`));
    }
    if (char === "'" && /[A-Za-zÀ-ÿ]/.test(value[i - 1] ?? '') &&
        /[A-Za-zÀ-ÿ]/.test(value[i + 1] ?? '')) {
      problems.push(issue('FR_APOSTROPHE', `${path}/${i}`));
    }
  }
  return problems;
}

export function validateAcceptanceText(value, path = '/label') {
  const problems = [];
  if (!plain(value)) return [issue('TRANSLATION_REQUIRED', path)];
  fields(value, TRANSLATION_KEYS, path, problems);
  if (!text(value.en)) problems.push(issue('EN_REQUIRED', `${path}/en`));
  if (!text(value.fr)) problems.push(issue('FR_REQUIRED', `${path}/fr`));
  if (text(value.fr)) problems.push(...frenchCopyIssues(value.fr, `${path}/fr`));
  return problems;
}

function evidenceIssues(value, path, capturedOn) {
  if (!plain(value)) return [issue('EVIDENCE_REQUIRED', path)];
  const problems = [];
  fields(value, EVIDENCE_KEYS, path, problems);
  if (!safeUrl(value.source)) problems.push(issue('SOURCE_INVALID', `${path}/source`));
  if (!['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
    'OGL-Canada-2.0', 'OGL-Canada-3.0', 'OGL-Ontario-1.0',
    'MIT', 'Apache-2.0'].includes(value.licence)) {
    problems.push(issue('LICENCE_INVALID', `${path}/licence`));
  }
  if (!validDate(value.retrievedOn) || validDate(capturedOn) && value.retrievedOn > capturedOn) {
    problems.push(issue('RETRIEVAL_INVALID', `${path}/retrievedOn`));
  }
  if (![0, 1, 2, 3, 4, 'E'].includes(value.tier)) {
    problems.push(issue('TIER_INVALID', `${path}/tier`));
  }
  if (!validId(value.runId)) problems.push(issue('RUN_ID_INVALID', `${path}/runId`));
  if (typeof value.artifactSha256 !== 'string' || !HEX64.test(value.artifactSha256)) {
    problems.push(issue('DIGEST_INVALID', `${path}/artifactSha256`));
  }
  return problems;
}

function checkIssues(value, path, capturedOn) {
  if (!plain(value)) return [issue('CHECK_INVALID', path)];
  const problems = [];
  fields(value, CHECK_KEYS, path, problems);
  if (!validId(value.id)) problems.push(issue('CHECK_ID_INVALID', `${path}/id`));
  if (!KIND.has(value.kind)) problems.push(issue('KIND_INVALID', `${path}/kind`));
  if (!STATE.has(value.state)) problems.push(issue('STATE_INVALID', `${path}/state`));
  problems.push(...validateAcceptanceText(value.label, `${path}/label`));
  problems.push(...evidenceIssues(value.evidence, `${path}/evidence`, capturedOn));
  if (value.reviewItemId !== undefined && !validId(value.reviewItemId)) {
    problems.push(issue('REVIEW_ID_INVALID', `${path}/reviewItemId`));
  }
  if (value.note !== undefined) problems.push(...validateAcceptanceText(value.note, `${path}/note`));
  return problems;
}

function routeIssues(value, path, capturedOn, limits, counter) {
  if (!plain(value)) return [issue('ROUTE_INVALID', path)];
  const problems = [];
  fields(value, ROUTE_KEYS, path, problems);
  if (!validId(value.id)) problems.push(issue('ROUTE_ID_INVALID', `${path}/id`));
  if (typeof value.path !== 'string' || value.path.length > 512 ||
    !ROUTE_PATH.test(value.path) || value.path.includes('..') || value.path.includes('//')) {
    problems.push(issue('ROUTE_PATH_INVALID', `${path}/path`));
  }
  problems.push(...validateAcceptanceText(value.label, `${path}/label`));
  if (!Array.isArray(value.checks)) return [...problems, issue('CHECKS_REQUIRED', `${path}/checks`)];
  counter.total += value.checks.length;
  if (value.checks.length > limits.maxChecks) problems.push(issue('CHECK_LIMIT', `${path}/checks`));
  const seen = new Set();
  for (let i = 0; i < Math.min(value.checks.length, limits.maxChecks); i += 1) {
    const check = value.checks[i];
    const here = `${path}/checks/${i}`;
    problems.push(...checkIssues(check, here, capturedOn));
    if (validId(check?.id)) {
      if (seen.has(check.id)) problems.push(issue('CHECK_DUPLICATE', `${here}/id`));
      seen.add(check.id);
    }
  }
  return problems;
}

export function validateAcceptanceLedger(value, options = {}) {
  const limits = limitOptions(options);
  if (limits === null) return { ok: false, problems: [issue('LIMIT_INVALID', '/')], ledger: null };
  const problems = privateKeyIssues(value).map((item) => issue(item.code, item.path));
  if (!plain(value)) return { ok: false, problems: [...problems, issue('LEDGER_INVALID', '/')], ledger: null };
  fields(value, ROOT_KEYS, '', problems);
  if (value.version !== LEDGER_VERSION) problems.push(issue('VERSION_INVALID', '/version'));
  if (!validDate(value.capturedOn) || validDate(options.today) && value.capturedOn > options.today) {
    problems.push(issue('CAPTURE_DATE_INVALID', '/capturedOn'));
  }
  if (!Array.isArray(value.routes)) {
    return { ok: false, problems: [...problems, issue('ROUTES_REQUIRED', '/routes')], ledger: null };
  }
  if (value.routes.length > limits.maxRoutes) problems.push(issue('ROUTE_LIMIT', '/routes'));
  const ids = new Set();
  const paths = new Set();
  const counter = { total: 0 };
  for (let i = 0; i < Math.min(value.routes.length, limits.maxRoutes); i += 1) {
    const route = value.routes[i];
    const here = `/routes/${i}`;
    problems.push(...routeIssues(route, here, value.capturedOn, limits, counter));
    if (validId(route?.id)) {
      if (ids.has(route.id)) problems.push(issue('ROUTE_DUPLICATE', `${here}/id`));
      ids.add(route.id);
    }
    if (typeof route?.path === 'string') {
      if (paths.has(route.path)) problems.push(issue('PATH_DUPLICATE', `${here}/path`));
      paths.add(route.path);
    }
  }
  if (counter.total > limits.maxChecks) problems.push(issue('TOTAL_CHECK_LIMIT', '/routes'));
  if (problems.length > limits.maxIssues) {
    return { ok: false, ledger: null, problems: [issue('ISSUE_LIMIT', '/'), ...problems.slice(0, limits.maxIssues)] };
  }
  return { ok: problems.length === 0, ledger: problems.length === 0 ? value : null, problems };
}

export function acceptanceSummary(ledger, options = {}) {
  const check = validateAcceptanceLedger(ledger, options);
  if (!check.ok) return { ok: false, problems: check.problems, summary: null };
  const states = { PASS: 0, FAIL: 0, UNKNOWN: 0 };
  const kinds = Object.fromEntries(ACCEPTANCE_KINDS.map((kind) => [kind, { PASS: 0, FAIL: 0, UNKNOWN: 0 }]));
  const routes = [];
  for (const route of ledger.routes) {
    const totals = { PASS: 0, FAIL: 0, UNKNOWN: 0 };
    for (const item of route.checks) {
      states[item.state] += 1;
      kinds[item.kind][item.state] += 1;
      totals[item.state] += 1;
    }
    routes.push({ id: route.id, path: route.path, states: totals,
      needsHumanReview: totals.FAIL + totals.UNKNOWN > 0 || route.checks.length === 0 });
  }
  routes.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { ok: true, problems: [], summary: {
    routeCount: routes.length, checks: states.PASS + states.FAIL + states.UNKNOWN,
    states, kinds, routes,
    needsHumanReview: routes.some((route) => route.needsHumanReview),
  } };
}

export function canonicalAcceptanceLedger(ledger, options = {}) {
  const result = validateAcceptanceLedger(ledger, options);
  if (!result.ok) return { ok: false, problems: result.problems, canonical: null };
  const routes = ledger.routes.map((route) => ({
    id: route.id, path: route.path,
    label: { en: route.label.en, fr: route.label.fr },
    checks: route.checks.map((check) => ({
      id: check.id, kind: check.kind, state: check.state,
      label: { en: check.label.en, fr: check.label.fr },
      evidence: {
        source: check.evidence.source, licence: check.evidence.licence,
        retrievedOn: check.evidence.retrievedOn, tier: check.evidence.tier,
        runId: check.evidence.runId, artifactSha256: check.evidence.artifactSha256,
      },
      ...(check.reviewItemId === undefined ? {} : { reviewItemId: check.reviewItemId }),
      ...(check.note === undefined ? {} : { note: { en: check.note.en, fr: check.note.fr } }),
    })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
  })).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return { ok: true, problems: [], canonical: { version: LEDGER_VERSION, capturedOn: ledger.capturedOn, routes } };
}

export function acceptanceFingerprint(ledger, options = {}) {
  const canonical = canonicalAcceptanceLedger(ledger, options);
  if (!canonical.ok) return { ok: false, problems: canonical.problems, fingerprint: null };
  const encoded = JSON.stringify(canonical.canonical);
  if (Buffer.byteLength(encoded, 'utf8') > ACCEPTANCE_LIMITS.maxBytes) {
    return { ok: false, problems: [issue('FINGERPRINT_LIMIT', '/')], fingerprint: null };
  }
  return { ok: true, problems: [], fingerprint:
    `sha256:${createHash('sha256').update(encoded, 'utf8').digest('hex')}` };
}

export function readAcceptanceLedger(input, options = {}) {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > ACCEPTANCE_LIMITS.maxBytes) {
    return { ok: false, problems: [issue('INPUT_LIMIT', '/')], ledger: null };
  }
  let value;
  try { value = JSON.parse(input); } catch { return { ok: false, problems: [issue('JSON_INVALID', '/')], ledger: null }; }
  return validateAcceptanceLedger(value, options);
}

export function serializeAcceptanceLedger(ledger, options = {}) {
  const result = canonicalAcceptanceLedger(ledger, options);
  if (!result.ok) return { ok: false, problems: result.problems, text: null };
  return { ok: true, problems: [], text: JSON.stringify(result.canonical, null, 2) + '\n' };
}
