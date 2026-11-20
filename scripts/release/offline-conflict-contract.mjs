/**
 * Offline evidence disagreement contract. A contradiction is a reason to ask for
 * human review, never evidence that a physical accessibility fact is true.
 * No network, time source, persistence or identity fields are read here.
 */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

export const CONFLICT_VERSION = 1;
export const CLAIM_STATES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const REVIEW_STATES = Object.freeze(['open', 'needs-source', 'deferred', 'closed']);
export const TIER_VALUES = Object.freeze([0, 1, 2, 3, 4, 'E']);
export const CONFLICT_LIMITS = Object.freeze({
  bytes: 8_000_000, records: 12_000, notes: 2048, dependencies: 100,
  maxIssues: 2_000, maxId: 96, maxUrl: 2048, depth: 28,
});
const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
  'OGL-Canada-2.0', 'OGL-Ontario-1.0', 'MIT', 'Apache-2.0']);
const STATES = new Set(CLAIM_STATES);
const TIERS = new Set(TIER_VALUES);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u;
const CALENDAR = /^\d{4}-\d{2}-\d{2}$/u;
const FORBIDDEN_KEYS = new Set(['password', 'token', 'apikey', 'secret', 'cookie',
  'healthcard', 'ohip', 'diagnosis', 'medication', 'prescription',
  'locationhistory', 'coordinates', 'latitude', 'longitude', 'email',
  'phonenumber', 'fullname', 'personname', 'birthdate']);
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const EXPECTED = new Set(['version', 'asOf', 'records']);
const RECORD_KEYS = new Set(['id', 'subject', 'attribute', 'state', 'capturedOn',
  'source', 'licence', 'retrievedOn', 'tier', 'sourceDate', 'notes', 'relatedIds']);
const LOCALIZED = new Set(['en', 'fr']);

export const pointer = segment => String(segment).replace(/~/gu, '~0').replace(/\//gu, '~1');
export const issue = (code, path) => Object.freeze({ code, path });
export function isObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function validId(value) {
  return typeof value === 'string' && value.length <= CONFLICT_LIMITS.maxId &&
    IDENTIFIER.test(value) && !RESERVED.has(value.toLowerCase());
}
export function validDate(value) {
  if (typeof value !== 'string' || !CALENDAR.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function containsControl(value) {
  return [...String(value)].some(character => {
    const point = character.codePointAt(0);
    return point <= 31 || point === 127 || point === 0xfffd;
  });
}
export function safeUrl(value) {
  if (typeof value !== 'string' || !value || value.length > CONFLICT_LIMITS.maxUrl || containsControl(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]') return false;
    if (/^127\./u.test(hostname) || /^0\./u.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
export function frenchTextIssues(value, path) {
  if (typeof value !== 'string') return [issue('LOCALE_TEXT', path)];
  const problems = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const before = i > 0 ? value[i - 1] : null;
    const after = value[i + 1];
    if (char === ':' && before !== '\u00a0') problems.push(issue('FR_COLON', `${path}/${i}`));
    if (';!?'.includes(char) && before !== '\u202f') problems.push(issue('FR_NARROW', `${path}/${i}`));
    if (char === '«' && after !== '\u202f') problems.push(issue('FR_QUOTE', `${path}/${i}`));
    if (char === '»' && before !== '\u202f') problems.push(issue('FR_QUOTE', `${path}/${i}`));
  }
  if (/(?:^|\W)(?:l|d|c|j|n|s|qu)'(?=\p{L})/iu.test(value)) problems.push(issue('FR_APOSTROPHE', path));
  return problems;
}
export function localizedIssues(value, path) {
  const problems = [];
  if (!isObject(value) || Object.keys(value).length !== 2 ||
    Object.keys(value).some(key => !LOCALIZED.has(key))) return [issue('LOCALE_PAIR', path)];
  for (const lang of LOCALIZED) {
    const text = value[lang];
    if (typeof text !== 'string' || !text.trim() || text.length > CONFLICT_LIMITS.notes || containsControl(text)) {
      problems.push(issue('LOCALE_TEXT', `${path}/${lang}`));
    } else if (lang === 'fr') {
      problems.push(...frenchTextIssues(text, `${path}/${lang}`));
    }
  }
  return problems;
}
export function privacyIssues(value, path = '', depth = 0, active = new WeakSet()) {
  if (!value || typeof value !== 'object') return [];
  if (depth > CONFLICT_LIMITS.depth) return [issue('INPUT_DEPTH', path || '/')];
  if (active.has(value)) return [issue('INPUT_CYCLE', path || '/')];
  active.add(value);
  const problems = [];
  const entries = Array.isArray(value) ? value.map((item, idx) => [String(idx), item]) : Object.entries(value);
  for (const [key, child] of entries) {
    const here = `${path}/${pointer(key)}`;
    const normalized = key.replace(/[-_]/gu, '').toLowerCase();
    if (FORBIDDEN_KEYS.has(normalized) || RESERVED.has(key)) problems.push(issue('PRIVATE_FIELD', here));
    else problems.push(...privacyIssues(child, here, depth + 1, active));
  }
  active.delete(value);
  return problems;
}
export function recordIssues(value, path, asOf) {
  if (!isObject(value)) return [issue('RECORD_SHAPE', path)];
  const problems = [];
  for (const key of Object.keys(value)) if (!RECORD_KEYS.has(key)) problems.push(issue('RECORD_EXTRA', `${path}/${pointer(key)}`));
  for (const key of ['id', 'subject', 'attribute']) if (!validId(value[key])) problems.push(issue('RECORD_ID', `${path}/${key}`));
  if (!STATES.has(value.state)) problems.push(issue('RECORD_STATE', `${path}/state`));
  if (!validDate(value.capturedOn)) problems.push(issue('CAPTURE_DATE', `${path}/capturedOn`));
  else if (validDate(asOf) && value.capturedOn > asOf) problems.push(issue('FUTURE_CAPTURE', `${path}/capturedOn`));
  if (!safeUrl(value.source)) problems.push(issue('SOURCE_URL', `${path}/source`));
  if (!LICENCES.has(value.licence)) problems.push(issue('SOURCE_LICENCE', `${path}/licence`));
  if (!validDate(value.retrievedOn)) problems.push(issue('SOURCE_DATE', `${path}/retrievedOn`));
  else if (validDate(asOf) && value.retrievedOn > asOf) problems.push(issue('FUTURE_SOURCE', `${path}/retrievedOn`));
  if (!TIERS.has(value.tier)) problems.push(issue('SOURCE_TIER', `${path}/tier`));
  if (value.sourceDate !== undefined && !validDate(value.sourceDate)) problems.push(issue('OBSERVATION_DATE', `${path}/sourceDate`));
  if (validDate(value.retrievedOn) && validDate(value.sourceDate) && value.sourceDate > value.retrievedOn) {
    problems.push(issue('OBSERVATION_AFTER_SOURCE', `${path}/sourceDate`));
  }
  if (value.notes !== undefined) problems.push(...localizedIssues(value.notes, `${path}/notes`));
  if (value.relatedIds !== undefined) {
    if (!Array.isArray(value.relatedIds) || value.relatedIds.length > CONFLICT_LIMITS.dependencies ||
      value.relatedIds.some(id => !validId(id)) || new Set(value.relatedIds).size !== value.relatedIds.length) {
      problems.push(issue('RELATED_IDS', `${path}/relatedIds`));
    }
  }
  return problems;
}
export function validateRegister(value, options = {}) {
  if (!isObject(value) || value.version !== CONFLICT_VERSION || !Array.isArray(value.records)) {
    return { ok: false, problems: [issue('REGISTER_SHAPE', '/')], records: null };
  }
  if (value.records.length > CONFLICT_LIMITS.records) {
    return { ok: false, problems: [issue('RECORD_LIMIT', '/records')], records: null };
  }
  const problems = privacyIssues(value);
  if (!validDate(value.asOf)) problems.push(issue('REGISTER_DATE', '/asOf'));
  if (validDate(options.today) && validDate(value.asOf) && value.asOf > options.today) problems.push(issue('FUTURE_REGISTER', '/asOf'));
  for (const key of Object.keys(value)) if (!EXPECTED.has(key)) problems.push(issue('REGISTER_EXTRA', `/${pointer(key)}`));
  const ids = new Set();
  for (const [index, record] of value.records.entries()) {
    const here = `/records/${index}`;
    problems.push(...recordIssues(record, here, value.asOf));
    if (validId(record?.id)) {
      if (ids.has(record.id)) problems.push(issue('DUPLICATE_ID', `${here}/id`));
      ids.add(record.id);
    }
  }
  for (const [index, record] of value.records.entries()) {
    if (!Array.isArray(record?.relatedIds)) continue;
    for (const id of record.relatedIds) if (!ids.has(id)) problems.push(issue('RELATED_MISSING', `/records/${index}/relatedIds`));
    if (record.relatedIds.includes(record.id)) problems.push(issue('RELATED_SELF', `/records/${index}/relatedIds`));
  }
  const cap = options.maxIssues;
  if (Number.isSafeInteger(cap) && cap > 0 && problems.length > cap) {
    return { ok: false, problems: [...problems.slice(0, cap), issue('ISSUE_LIMIT', '/')], records: null };
  }
  return { ok: problems.length === 0, problems, records: problems.length ? null : value.records };
}
export function canonicalRegister(register) {
  return { version: CONFLICT_VERSION, asOf: register.asOf, records: [...register.records]
    .map(record => ({ id: record.id, subject: record.subject, attribute: record.attribute,
      state: record.state, capturedOn: record.capturedOn, source: record.source,
      licence: record.licence, retrievedOn: record.retrievedOn, tier: record.tier,
      ...(record.sourceDate === undefined ? {} : { sourceDate: record.sourceDate }),
      ...(record.notes === undefined ? {} : { notes: { en: record.notes.en, fr: record.notes.fr } }),
      relatedIds: [...(record.relatedIds ?? [])].sort(),
    })).sort((a, b) => a.id.localeCompare(b.id, 'en')) };
}
export function fingerprint(register, options = {}) {
  const checked = validateRegister(register, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, sha256: null };
  const text = JSON.stringify(canonicalRegister(register));
  return { ok: true, problems: [], sha256: createHash('sha256').update(text, 'utf8').digest('hex') };
}
export function parseRegister(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > CONFLICT_LIMITS.bytes) {
    return { ok: false, problems: [issue('INPUT_SIZE', '/')], value: null };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, problems: [issue('INVALID_JSON', '/')], value: null }; }
  const checked = validateRegister(parsed, options);
  return { ok: checked.ok, problems: checked.problems, value: checked.ok ? parsed : null };
}
export function serializeRegister(register, options = {}) {
  const checked = validateRegister(register, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, text: null };
  const output = JSON.stringify(canonicalRegister(register), null, 2) + '\n';
  if (Buffer.byteLength(output, 'utf8') > CONFLICT_LIMITS.bytes) return { ok: false, problems: [issue('INPUT_SIZE', '/')], text: null };
  return { ok: true, problems: [], text: output };
}
