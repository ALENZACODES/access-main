/**
 * Offline release retention register. A release record documents what was
 * retained or removed; it cannot certify accessibility or evidence accuracy.
 * There are no clock, network, storage, or user-identity side effects.
 */
import { createHash } from 'node:crypto';

export const RETENTION_VERSION = 1;
export const RETENTION_STATES = Object.freeze(['present', 'quarantined', 'withdrawn', 'retired']);
export const RETENTION_EVENTS = Object.freeze([
  'quarantine', 'restore', 'withdraw', 'retire', 'note',
]);
export const RETENTION_KINDS = Object.freeze([
  'script', 'style', 'document', 'image', 'font', 'dataset', 'translation',
]);
export const RETENTION_TIERS = Object.freeze([0, 1, 2, 3, 4, 'E']);
export const RETENTION_CLAIMS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const RETENTION_LICENCES = Object.freeze([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
  'OGL-Canada-2.0', 'OGL-Ontario-1.0', 'MIT', 'Apache-2.0',
]);
export const RETENTION_LIMITS = Object.freeze({
  records: 20_000, events: 256, references: 64, text: 2_048,
  path: 512, input: 8_000_000, problems: 512, depth: 24,
});
const states = new Set(RETENTION_STATES);
const events = new Set(RETENTION_EVENTS);
const kinds = new Set(RETENTION_KINDS);
const tiers = new Set(RETENTION_TIERS);
const claims = new Set(RETENTION_CLAIMS);
const licences = new Set(RETENTION_LICENCES);
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const reserved = new Set(['__proto__', 'constructor', 'prototype']);
const privateNames = new Set([
  'password', 'token', 'apikey', 'secret', 'cookie', 'session', 'credential',
  'email', 'phone', 'address', 'personname', 'birthdate', 'healthcard',
  'diagnosis', 'medication', 'prescription', 'locationhistory', 'gps',
]);
const keys = Object.freeze({
  root: ['version', 'records'],
  record: ['id', 'path', 'kind', 'digest', 'bytes', 'state', 'claims', 'source',
    'licence', 'retrievedOn', 'tier', 'labels', 'references', 'events'],
  event: ['action', 'on', 'reason'],
  labels: ['en', 'fr'],
});

export function retentionIssue(code, path, detail = '') {
  return Object.freeze({ code, path, detail });
}
export function retentionObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function retentionDay(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}
export function retentionId(value) {
  return typeof value === 'string' && idPattern.test(value) &&
    !reserved.has(value.toLowerCase());
}
export function retentionPath(value) {
  if (typeof value !== 'string' || value.length > RETENTION_LIMITS.path || !value) return false;
  if (value.startsWith('/') || value.includes('\\') || value.includes('?') || value.includes('#')) return false;
  if (value.includes('%') || value.includes(':') || value.includes('//')) return false;
  if ([...value].some((char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment && segment !== '.' && segment !== '..' &&
    !reserved.has(segment.toLowerCase()));
}
export function retentionSource(value) {
  if (typeof value !== 'string' || value.length > RETENTION_LIMITS.text) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return false;
    if (parsed.hash || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(parsed.hostname)) return false;
    if (parsed.hostname === '[::1]' || parsed.hostname === '0.0.0.0') return false;
    return ![...value].some((c) => c.codePointAt(0) < 32);
  } catch {
    return false;
  }
}
export function retentionFrenchIssues(value, path = '/fr') {
  if (typeof value !== 'string') return [retentionIssue('TEXT_INVALID', path)];
  const result = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === ':' && i > 0 && value[i - 1] !== '\u00A0') {
      result.push(retentionIssue('FR_COLON', `${path}/${i}`));
    }
    if (';!?'.includes(char) && i > 0 && value[i - 1] !== '\u202F') {
      result.push(retentionIssue('FR_NARROW', `${path}/${i}`));
    }
    if (char === '«' && value[i + 1] !== '\u202F') {
      result.push(retentionIssue('FR_GUILLEMET', `${path}/${i}`));
    }
    if (char === '»' && value[i - 1] !== '\u202F') {
      result.push(retentionIssue('FR_GUILLEMET', `${path}/${i}`));
    }
    if (char === "'" && i > 0 && /[a-z]/i.test(value[i - 1]) &&
        /[a-z]/i.test(value[i + 1] ?? '')) {
      result.push(retentionIssue('FR_APOSTROPHE', `${path}/${i}`));
    }
  }
  return result;
}
function normalizedKey(key) { return key.toLowerCase().replace(/[-_]/g, ''); }
function pointer(key) { return String(key).replace(/~/g, '~0').replace(/\//g, '~1'); }
export function retentionPrivateIssues(value, path = '', seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return [];
  if (depth > RETENTION_LIMITS.depth) return [retentionIssue('DEPTH_LIMIT', path || '/')];
  if (seen.has(value)) return [retentionIssue('CYCLIC_INPUT', path || '/')];
  seen.add(value);
  const output = [];
  const entries = Array.isArray(value) ? value.map((item, i) => [String(i), item]) : Object.entries(value);
  for (const [key, child] of entries) {
    const current = `${path}/${pointer(key)}`;
    if (privateNames.has(normalizedKey(key)) || reserved.has(key)) {
      output.push(retentionIssue('PRIVATE_FIELD', current));
    } else {
      output.push(...retentionPrivateIssues(child, current, seen, depth + 1));
    }
  }
  seen.delete(value);
  return output;
}
function extraKeys(value, allowed, path) {
  if (!retentionObject(value)) return [];
  const accepted = new Set(allowed);
  return Object.keys(value).filter((name) => !accepted.has(name))
    .map((name) => retentionIssue('UNEXPECTED_FIELD', `${path}/${pointer(name)}`));
}
function properText(value) {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= RETENTION_LIMITS.text &&
    ![...value].some((char) => char.codePointAt(0) < 32);
}
function labelsIssues(value, path) {
  if (!retentionObject(value)) return [retentionIssue('LABELS_REQUIRED', path)];
  const issues = extraKeys(value, keys.labels, path);
  if (!properText(value.en)) issues.push(retentionIssue('LABEL_EN', `${path}/en`));
  if (!properText(value.fr)) issues.push(retentionIssue('LABEL_FR', `${path}/fr`));
  if (properText(value.fr)) issues.push(...retentionFrenchIssues(value.fr, `${path}/fr`));
  return issues;
}
function referencesIssues(value, path) {
  if (!Array.isArray(value) || value.length > RETENTION_LIMITS.references) {
    return [retentionIssue('REFERENCES_INVALID', path)];
  }
  const issues = [];
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const id = value[i];
    if (!retentionId(id)) issues.push(retentionIssue('REFERENCE_ID', `${path}/${i}`));
    else if (seen.has(id)) issues.push(retentionIssue('REFERENCE_DUPLICATE', `${path}/${i}`));
    seen.add(id);
  }
  return issues;
}
export function retentionTransition(state, action) {
  const transitions = {
    present: { quarantine: 'quarantined', withdraw: 'withdrawn', retire: 'retired' },
    quarantined: { restore: 'present', withdraw: 'withdrawn', retire: 'retired' },
    withdrawn: { restore: 'present', retire: 'retired' },
    retired: {},
  };
  return action === 'note' && states.has(state) ? state : transitions[state]?.[action] ?? null;
}
function eventsIssues(record, path, today) {
  if (!Array.isArray(record.events) || record.events.length > RETENTION_LIMITS.events) {
    return [retentionIssue('EVENTS_INVALID', path)];
  }
  const issues = [];
  let state = 'present';
  let previous = record.retrievedOn;
  for (const [index, event] of record.events.entries()) {
    const where = `${path}/${index}`;
    if (!retentionObject(event)) {
      issues.push(retentionIssue('EVENT_INVALID', where));
      continue;
    }
    issues.push(...extraKeys(event, keys.event, where));
    if (!events.has(event.action)) issues.push(retentionIssue('ACTION_INVALID', `${where}/action`));
    if (!retentionDay(event.on)) issues.push(retentionIssue('EVENT_DATE', `${where}/on`));
    if (retentionDay(event.on) && retentionDay(previous) && event.on < previous) {
      issues.push(retentionIssue('EVENT_ORDER', `${where}/on`));
    }
    if (retentionDay(event.on) && retentionDay(today) && event.on > today) {
      issues.push(retentionIssue('EVENT_FUTURE', `${where}/on`));
    }
    if (!properText(event.reason)) issues.push(retentionIssue('EVENT_REASON', `${where}/reason`));
    if (events.has(event.action)) {
      const next = retentionTransition(state, event.action);
      if (next === null) issues.push(retentionIssue('TRANSITION_INVALID', `${where}/action`));
      else state = next;
    }
    previous = event.on;
  }
  if (states.has(record.state) && record.state !== state) {
    issues.push(retentionIssue('EVENT_STATE_MISMATCH', path));
  }
  return issues;
}
export function retentionRecordIssues(value, path = '/records/0', options = {}) {
  if (!retentionObject(value)) return [retentionIssue('RECORD_INVALID', path)];
  const issues = extraKeys(value, keys.record, path);
  if (!retentionId(value.id)) issues.push(retentionIssue('RECORD_ID', `${path}/id`));
  if (!retentionPath(value.path)) issues.push(retentionIssue('ASSET_PATH', `${path}/path`));
  if (!kinds.has(value.kind)) issues.push(retentionIssue('ASSET_KIND', `${path}/kind`));
  if (typeof value.digest !== 'string' || !digestPattern.test(value.digest)) {
    issues.push(retentionIssue('ASSET_DIGEST', `${path}/digest`));
  }
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > 50_000_000) {
    issues.push(retentionIssue('ASSET_BYTES', `${path}/bytes`));
  }
  if (!states.has(value.state)) issues.push(retentionIssue('STATE_INVALID', `${path}/state`));
  if (!Array.isArray(value.claims) || value.claims.length > RETENTION_LIMITS.references ||
    value.claims.some((claim) => !claims.has(claim))) {
    issues.push(retentionIssue('CLAIMS_INVALID', `${path}/claims`));
  }
  if (!retentionSource(value.source)) issues.push(retentionIssue('SOURCE_INVALID', `${path}/source`));
  if (!licences.has(value.licence)) issues.push(retentionIssue('LICENCE_INVALID', `${path}/licence`));
  if (!retentionDay(value.retrievedOn)) issues.push(retentionIssue('RETRIEVED_INVALID', `${path}/retrievedOn`));
  if (retentionDay(options.today) && retentionDay(value.retrievedOn) && value.retrievedOn > options.today) {
    issues.push(retentionIssue('RETRIEVED_FUTURE', `${path}/retrievedOn`));
  }
  if (!tiers.has(value.tier)) issues.push(retentionIssue('TIER_INVALID', `${path}/tier`));
  issues.push(...labelsIssues(value.labels, `${path}/labels`));
  issues.push(...referencesIssues(value.references, `${path}/references`));
  issues.push(...eventsIssues(value, `${path}/events`, options.today));
  return issues;
}
export function retentionCheck(document, options = {}) {
  const problems = retentionPrivateIssues(document);
  if (!retentionObject(document) || document.version !== RETENTION_VERSION ||
      !Array.isArray(document.records)) {
    return { ok: false, problems: [...problems, retentionIssue('REGISTER_INVALID', '/')], records: null };
  }
  problems.push(...extraKeys(document, keys.root, ''));
  if (document.records.length > RETENTION_LIMITS.records) {
    problems.push(retentionIssue('RECORD_LIMIT', '/records'));
  }
  const ids = new Set();
  const paths = new Set();
  const records = new Map();
  for (const [index, record] of document.records.slice(0, RETENTION_LIMITS.records).entries()) {
    const where = `/records/${index}`;
    problems.push(...retentionRecordIssues(record, where, options));
    if (retentionId(record?.id)) {
      if (ids.has(record.id)) problems.push(retentionIssue('DUPLICATE_ID', `${where}/id`));
      ids.add(record.id);
      records.set(record.id, record);
    }
    if (retentionPath(record?.path)) {
      if (paths.has(record.path)) problems.push(retentionIssue('DUPLICATE_PATH', `${where}/path`));
      paths.add(record.path);
    }
  }
  for (const [id, record] of records) {
    for (const reference of Array.isArray(record.references) ? record.references : []) {
      if (reference === id) problems.push(retentionIssue('SELF_REFERENCE', `/records/${pointer(id)}`));
      else if (!records.has(reference)) problems.push(retentionIssue('REFERENCE_MISSING', `/records/${pointer(id)}/${pointer(reference)}`));
    }
  }
  const colour = new Map();
  const visit = (id, depth) => {
    if (depth > RETENTION_LIMITS.depth) {
      problems.push(retentionIssue('REFERENCE_DEPTH', `/records/${pointer(id)}`));
      return;
    }
    if (colour.get(id) === 1) {
      problems.push(retentionIssue('REFERENCE_CYCLE', `/records/${pointer(id)}`));
      return;
    }
    if (colour.get(id) === 2) return;
    colour.set(id, 1);
    for (const target of records.get(id)?.references ?? []) {
      if (records.has(target)) visit(target, depth + 1);
    }
    colour.set(id, 2);
  };
  for (const id of records.keys()) visit(id, 0);
  const unique = new Map();
  for (const item of problems) unique.set(`${item.code}\0${item.path}`, item);
  const sorted = [...unique.values()].sort((a, b) =>
    a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
  return { ok: sorted.length === 0, problems: sorted.slice(0, RETENTION_LIMITS.problems),
    records: sorted.length === 0 ? records : null };
}
export function retentionCanonical(document, options = {}) {
  const check = retentionCheck(document, options);
  if (!check.ok) return { ok: false, problems: check.problems, document: null };
  const records = [...document.records].sort((a, b) => a.id.localeCompare(b.id, 'en')).map((record) => ({
    ...record,
    labels: { en: record.labels.en, fr: record.labels.fr },
    references: [...record.references].sort((a, b) => a.localeCompare(b, 'en')),
    events: record.events.map((event) => ({ ...event })),
    claims: [...record.claims].sort((a, b) => a.localeCompare(b, 'en')),
  }));
  return { ok: true, problems: [], document: { version: RETENTION_VERSION, records } };
}
export function retentionFingerprint(document, options = {}) {
  const canonical = retentionCanonical(document, options);
  if (!canonical.ok) return { ok: false, problems: canonical.problems, fingerprint: null };
  const payload = JSON.stringify(canonical.document);
  if (Buffer.byteLength(payload, 'utf8') > RETENTION_LIMITS.input) {
    return { ok: false, problems: [retentionIssue('INPUT_LIMIT', '/')], fingerprint: null };
  }
  return { ok: true, problems: [], fingerprint: `sha256:${createHash('sha256').update(payload).digest('hex')}` };
}
export function retentionParse(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > RETENTION_LIMITS.input) {
    return { ok: false, problems: [retentionIssue('INPUT_LIMIT', '/')], document: null };
  }
  let document;
  try { document = JSON.parse(text); } catch {
    return { ok: false, problems: [retentionIssue('INVALID_JSON', '/')], document: null };
  }
  const check = retentionCheck(document, options);
  return { ok: check.ok, problems: check.problems, document: check.ok ? document : null };
}
export function retentionSerialize(document, options = {}) {
  const canonical = retentionCanonical(document, options);
  return { ok: canonical.ok, problems: canonical.problems,
    text: canonical.ok ? JSON.stringify(canonical.document, null, 2) + '\n' : null };
}
export function retentionChange(document, id, action, on, reason, options = {}) {
  const checked = retentionCheck(document, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, document };
  if (!retentionId(id) || !events.has(action) || !retentionDay(on) || !properText(reason)) {
    return { ok: false, problems: [retentionIssue('CHANGE_INVALID', '/')], document };
  }
  const record = checked.records.get(id);
  if (!record) return { ok: false, problems: [retentionIssue('RECORD_MISSING', `/records/${id}`)], document };
  const next = retentionTransition(record.state, action);
  if (!next) return { ok: false, problems: [retentionIssue('TRANSITION_INVALID', `/records/${id}`)], document };
  const last = record.events.at(-1)?.on ?? record.retrievedOn;
  if (on < last || retentionDay(options.today) && on > options.today) {
    return { ok: false, problems: [retentionIssue('EVENT_DATE', `/records/${id}`)], document };
  }
  const updated = { ...record, state: next,
    events: [...record.events, { action, on, reason }] };
  const candidate = { version: RETENTION_VERSION,
    records: document.records.map((item) => item.id === id ? updated : item) };
  const after = retentionCheck(candidate, options);
  if (!after.ok) return { ok: false, problems: after.problems, document };
  return { ok: true, problems: [], document: candidate };
}
