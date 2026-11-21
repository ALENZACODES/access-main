/**
 * P19 offline recovery trace contracts.
 * All observations are supplied by a human or test harness. Nothing here
 * visits a route, tests a physical location, or makes a live availability claim.
 */
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';

export const TRACE_VERSION = 1;
export const TRACE_OUTCOMES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const TRACE_MODES = Object.freeze(['offline', 'online', 'limited', 'UNKNOWN']);
export const TRACE_STEPS = Object.freeze(['action', 'failure', 'recovery', 'check']);
export const TRACE_CATEGORIES = Object.freeze([
  'keyboard', 'focus', 'announcement', 'storage', 'navigation',
  'download', 'cache', 'form', 'language', 'touch-target',
]);
export const TRACE_LIMITS = Object.freeze({
  bytes: 8_000_000, traces: 500, steps: 250, title: 512,
  path: 512, note: 2048, findings: 3000,
});
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const TIER_VALUES = new Set([0, 1, 2, 3, 4, 'E']);
const LICENCES = new Set([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
  'OGL-Canada-2.0', 'OGL-Ontario-1.0', 'MIT', 'Apache-2.0',
]);
const PRIVATE_KEYS = new Set([
  'email', 'phonenumber', 'phone', 'password', 'token', 'accesstoken',
  'refreshtoken', 'apikey', 'secret', 'cookie', 'session', 'birthdate',
  'healthcard', 'ohip', 'diagnosis', 'medication', 'prescription',
  'gps', 'latitude', 'longitude', 'locationhistory', 'personname',
]);
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DOCUMENT_KEYS = new Set(['version', 'releaseId', 'recordedOn', 'traces']);
const TRACE_KEYS = new Set(['id', 'route', 'locale', 'mode', 'category', 'label', 'source', 'steps']);
const SOURCE_KEYS = new Set(['source', 'licence', 'retrievedOn', 'tier', 'sourceDate']);
const STEP_KEYS = new Set(['id', 'at', 'kind', 'outcome', 'code', 'linkedTo', 'note']);

export function problem(code, path) { return Object.freeze({ code, path }); }
export function pointer(value) { return String(value).replace(/~/gu, '~0').replace(/\//gu, '~1'); }
export function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value) && !RESERVED_KEYS.has(value);
}
export function validDay(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
export function cleanText(value, limit = TRACE_LIMITS.title) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit &&
    value.trim().length > 0 && [...value].every((character) => {
      const point = character.codePointAt(0);
      return point >= 32 && point !== 127 && point !== 0x2028 && point !== 0x2029;
    });
}
export function validSourceUrl(value) {
  if (!cleanText(value, 2048)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' ||
      host === '0.0.0.0' || /^127\./u.test(host)) return false;
    return true;
  } catch { return false; }
}
export function validRoute(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= TRACE_LIMITS.path &&
    value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') &&
    !value.includes('?') && !value.includes('#') &&
    value.split('/').every((segment) => segment !== '..' && segment !== '.') &&
    cleanText(value, TRACE_LIMITS.path);
}
export function frenchCopyIssues(text, path = '/fr') {
  if (!cleanText(text, TRACE_LIMITS.note)) return [problem('TEXT_INVALID', path)];
  const issues = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === ':' && index > 0 && text[index - 1] !== '\u00a0') {
      issues.push(problem('FR_COLON_SPACE', `${path}/${index}`));
    }
    if (';!?'.includes(character) && index > 0 && text[index - 1] !== '\u202f') {
      issues.push(problem('FR_NARROW_SPACE', `${path}/${index}`));
    }
    if (character === '«' && text[index + 1] !== '\u202f') {
      issues.push(problem('FR_GUILLEMET_SPACE', `${path}/${index}`));
    }
    if (character === '»' && text[index - 1] !== '\u202f') {
      issues.push(problem('FR_GUILLEMET_SPACE', `${path}/${index}`));
    }
    if (character === "'" && /[A-Za-zÀ-ÿ]/u.test(text[index - 1] ?? '') &&
      /[A-Za-zÀ-ÿ]/u.test(text[index + 1] ?? '')) {
      issues.push(problem('FR_APOSTROPHE', `${path}/${index}`));
    }
  }
  return issues;
}
export function bilingualIssues(value, path, limit = TRACE_LIMITS.note) {
  if (!plain(value) || Object.keys(value).length !== 2 ||
    !cleanText(value.en, limit) || !cleanText(value.fr, limit)) {
    return [problem('BILINGUAL_TEXT', path)];
  }
  return frenchCopyIssues(value.fr, `${path}/fr`);
}
export function privateKeyIssues(value, path = '/', seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return [];
  if (depth > 28) return [problem('DEPTH_LIMIT', path)];
  if (seen.has(value)) return [problem('CYCLIC_OBJECT', path)];
  seen.add(value);
  const issues = [];
  for (const [key, child] of Object.entries(value)) {
    const name = key.toLowerCase().replace(/[-_]/gu, '');
    const next = `${path === '/' ? '' : path}/${pointer(key)}`;
    if (PRIVATE_KEYS.has(name) || RESERVED_KEYS.has(key)) issues.push(problem('PRIVATE_FIELD', next));
    else issues.push(...privateKeyIssues(child, next, seen, depth + 1));
  }
  seen.delete(value);
  return issues;
}
export function extraKeys(value, allowed, path) {
  if (!plain(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key))
    .map((key) => problem('EXTRA_FIELD', `${path}/${pointer(key)}`));
}
export function sourceIssues(source, path, today) {
  if (!plain(source)) return [problem('SOURCE_REQUIRED', path)];
  const issues = extraKeys(source, SOURCE_KEYS, path);
  if (!validSourceUrl(source.source)) issues.push(problem('SOURCE_URL', `${path}/source`));
  if (!LICENCES.has(source.licence)) issues.push(problem('SOURCE_LICENCE', `${path}/licence`));
  if (!validDay(source.retrievedOn) || validDay(today) && source.retrievedOn > today) {
    issues.push(problem('SOURCE_RETRIEVED_ON', `${path}/retrievedOn`));
  }
  if (!TIER_VALUES.has(source.tier)) issues.push(problem('SOURCE_TIER', `${path}/tier`));
  if (source.sourceDate !== undefined && !validDay(source.sourceDate)) {
    issues.push(problem('SOURCE_DATE', `${path}/sourceDate`));
  }
  if (validDay(source.sourceDate) && validDay(source.retrievedOn) &&
    source.sourceDate > source.retrievedOn) issues.push(problem('SOURCE_DATE_ORDER', path));
  return issues;
}
export function stepIssues(step, path, recordedOn, seen) {
  if (!plain(step)) return [problem('STEP_INVALID', path)];
  const issues = extraKeys(step, STEP_KEYS, path);
  if (!validId(step.id)) issues.push(problem('STEP_ID', `${path}/id`));
  else if (seen.has(step.id)) issues.push(problem('STEP_DUPLICATE', `${path}/id`));
  else seen.add(step.id);
  if (!Number.isSafeInteger(step.at) || step.at < 0 || step.at > 10_000_000) {
    issues.push(problem('STEP_SEQUENCE', `${path}/at`));
  }
  if (!TRACE_STEPS.includes(step.kind)) issues.push(problem('STEP_KIND', `${path}/kind`));
  if (!TRACE_OUTCOMES.includes(step.outcome)) issues.push(problem('STEP_OUTCOME', `${path}/outcome`));
  if (!validId(step.code)) issues.push(problem('STEP_CODE', `${path}/code`));
  if (step.linkedTo !== undefined && !validId(step.linkedTo)) {
    issues.push(problem('STEP_LINK', `${path}/linkedTo`));
  }
  if (step.note !== undefined) issues.push(...bilingualIssues(step.note, `${path}/note`));
  if (!validDay(recordedOn)) issues.push(problem('RECORD_DATE', path));
  return issues;
}
export function traceIssues(trace, path, recordedOn, today) {
  if (!plain(trace)) return [problem('TRACE_INVALID', path)];
  const issues = extraKeys(trace, TRACE_KEYS, path);
  if (!validId(trace.id)) issues.push(problem('TRACE_ID', `${path}/id`));
  if (!validRoute(trace.route)) issues.push(problem('TRACE_ROUTE', `${path}/route`));
  if (!['en', 'fr'].includes(trace.locale)) issues.push(problem('TRACE_LOCALE', `${path}/locale`));
  if (!TRACE_MODES.includes(trace.mode)) issues.push(problem('TRACE_MODE', `${path}/mode`));
  if (!TRACE_CATEGORIES.includes(trace.category)) issues.push(problem('TRACE_CATEGORY', `${path}/category`));
  issues.push(...bilingualIssues(trace.label, `${path}/label`, TRACE_LIMITS.title));
  issues.push(...sourceIssues(trace.source, `${path}/source`, today));
  if (!Array.isArray(trace.steps) || trace.steps.length > TRACE_LIMITS.steps) {
    issues.push(problem('TRACE_STEPS', `${path}/steps`));
  } else {
    const seen = new Set();
    let last = -1;
    for (let index = 0; index < trace.steps.length; index += 1) {
      const step = trace.steps[index];
      const location = `${path}/steps/${index}`;
      issues.push(...stepIssues(step, location, recordedOn, seen));
      if (plain(step) && Number.isSafeInteger(step.at)) {
        if (step.at <= last) issues.push(problem('STEP_ORDER', location));
        last = step.at;
      }
    }
    const byId = new Map(trace.steps.filter((step) => plain(step) && validId(step.id))
      .map((step) => [step.id, step]));
    for (let index = 0; index < trace.steps.length; index += 1) {
      const step = trace.steps[index];
      if (!plain(step) || step.linkedTo === undefined) continue;
      const parent = byId.get(step.linkedTo);
      if (!parent || parent.at >= step.at || step.linkedTo === step.id) {
        issues.push(problem('BROKEN_STEP_LINK', `${path}/steps/${index}/linkedTo`));
      }
    }
  }
  return issues;
}
export function inspectTraceDocument(value, options = {}) {
  const issues = privateKeyIssues(value);
  if (!plain(value)) return { ok: false, problems: [...issues, problem('DOCUMENT_INVALID', '/')], traces: [] };
  if (value.version !== TRACE_VERSION) issues.push(problem('DOCUMENT_VERSION', '/version'));
  issues.push(...extraKeys(value, DOCUMENT_KEYS, ''));
  if (!validId(value.releaseId)) issues.push(problem('RELEASE_ID', '/releaseId'));
  if (!validDay(value.recordedOn) || validDay(options.today) && value.recordedOn > options.today) {
    issues.push(problem('RECORD_DATE', '/recordedOn'));
  }
  if (!Array.isArray(value.traces) || value.traces.length > TRACE_LIMITS.traces) {
    issues.push(problem('TRACES_INVALID', '/traces'));
    return { ok: false, problems: issues, traces: [] };
  }
  const seen = new Set();
  for (let index = 0; index < value.traces.length; index += 1) {
    const trace = value.traces[index];
    const path = `/traces/${index}`;
    issues.push(...traceIssues(trace, path, value.recordedOn, options.today));
    if (validId(trace?.id)) {
      if (seen.has(trace.id)) issues.push(problem('DUPLICATE_TRACE', `${path}/id`));
      seen.add(trace.id);
    }
    if (issues.length >= TRACE_LIMITS.findings) {
      issues.push(problem('FINDINGS_LIMIT', '/'));
      break;
    }
  }
  const ordered = [...value.traces].sort((a, b) =>
    String(a?.id).localeCompare(String(b?.id), 'en'));
  return { ok: issues.length === 0, problems: issues, traces: issues.length ? [] : ordered };
}
export function parseTraceDocument(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > TRACE_LIMITS.bytes) {
    return { ok: false, problems: [problem('INPUT_BYTES', '/')], traces: [] };
  }
  let value;
  try { value = JSON.parse(text); }
  catch { return { ok: false, problems: [problem('INVALID_JSON', '/')], traces: [] }; }
  return inspectTraceDocument(value, options);
}
export function canonicalTraceDocument(value, options = {}) {
  const check = inspectTraceDocument(value, options);
  if (!check.ok) return { ok: false, problems: check.problems, value: null };
  const traces = check.traces.map((trace) => ({
    id: trace.id, route: trace.route, locale: trace.locale, mode: trace.mode,
    category: trace.category, label: { en: trace.label.en, fr: trace.label.fr },
    source: {
      source: trace.source.source, licence: trace.source.licence,
      retrievedOn: trace.source.retrievedOn, tier: trace.source.tier,
      ...(trace.source.sourceDate === undefined ? {} : { sourceDate: trace.source.sourceDate }),
    },
    steps: trace.steps.map((step) => ({
      id: step.id, at: step.at, kind: step.kind, outcome: step.outcome,
      code: step.code,
      ...(step.linkedTo === undefined ? {} : { linkedTo: step.linkedTo }),
      ...(step.note === undefined ? {} : { note: { en: step.note.en, fr: step.note.fr } }),
    })),
  }));
  return { ok: true, problems: [], value: { version: TRACE_VERSION,
    releaseId: value.releaseId, recordedOn: value.recordedOn, traces } };
}
export function traceFingerprint(value, options = {}) {
  const result = canonicalTraceDocument(value, options);
  if (!result.ok) return { ok: false, problems: result.problems, hash: null };
  const text = JSON.stringify(result.value);
  if (Buffer.byteLength(text, 'utf8') > TRACE_LIMITS.bytes) {
    return { ok: false, problems: [problem('INPUT_BYTES', '/')], hash: null };
  }
  return { ok: true, problems: [],
    hash: `sha256:${createHash('sha256').update(text).digest('hex')}` };
}
