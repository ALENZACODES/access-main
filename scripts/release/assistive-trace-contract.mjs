/**
 * Structured, local-only evidence for replaying assistive-technology journeys.
 * These records contain observations supplied by an operator, never claims about
 * the physical accessibility of a building or about an actual browser run.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';

export const TRACE_VERSION = 1;
export const TRACE_STATES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const TRACE_LOCALES = Object.freeze(['en', 'fr']);
export const TRACE_CHANNELS = Object.freeze(['keyboard', 'focus', 'announcement', 'offline', 'storage']);
export const TRACE_EVENT_TYPES = Object.freeze([
  'step-start', 'key', 'focus', 'announce', 'asset', 'storage', 'step-end',
]);
export const TRACE_LIMITS = Object.freeze({
  bytes: 8_000_000, journeys: 500, steps: 200, events: 20_000,
  string: 2_048, issues: 2_000, depth: 24,
});
const STATES = new Set(TRACE_STATES);
const LOCALES = new Set(TRACE_LOCALES);
const CHANNELS = new Set(TRACE_CHANNELS);
const EVENTS = new Set(TRACE_EVENT_TYPES);
const KEYS = new Set(['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const SHA = /^[a-f0-9]{64}$/i;
const OPEN_LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0', 'OGL-Canada-2.0', 'OGL-Ontario-1.0']);
const PRIVATE = new Set([
  'email', 'phone', 'phonenumber', 'personname', 'firstname', 'lastname',
  'address', 'streetaddress', 'postaladdress', 'password', 'passphrase',
  'token', 'apikey', 'secret', 'session', 'sessioncookie', 'healthcard',
  'medicalrecord', 'diagnosis', 'medication', 'prescription', 'geolocation',
  'gps', 'latitude', 'longitude', 'locationhistory', 'dateofbirth',
]);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

export function issue(code, path, level = 'error') {
  return { code, path, level };
}
export function pointer(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}
export function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function strictDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const stamp = new Date(0);
  stamp.setUTCHours(0, 0, 0, 0);
  stamp.setUTCFullYear(year, month - 1, day);
  return stamp.getUTCFullYear() === year && stamp.getUTCMonth() + 1 === month && stamp.getUTCDate() === day;
}
export function safeId(value) {
  return typeof value === 'string' && ID.test(value) && !RESERVED.has(value.toLowerCase());
}
export function safeString(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > TRACE_LIMITS.string) return false;
  return [...value].every((character) => {
    const code = character.codePointAt(0);
    return code >= 32 && code !== 127 && code !== 0x2028 && code !== 0x2029;
  });
}
export function safeUrl(value) {
  if (typeof value !== 'string' || !safeString(value) || value.length > 2_048) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host)) return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    return !parsed.hash;
  } catch { return false; }
}
export function frenchTextIssues(value, path) {
  if (!safeString(value)) return [issue('TEXT_INVALID', path)];
  const found = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === ':' && i > 0 && value[i - 1] !== '\u00A0') found.push(issue('FR_COLON', `${path}/${i}`));
    if (';!?'.includes(char) && i > 0 && value[i - 1] !== '\u202F') found.push(issue('FR_NARROW', `${path}/${i}`));
    if (char === '«' && value[i + 1] !== '\u202F') found.push(issue('FR_GUILLEMET', `${path}/${i}`));
    if (char === '»' && value[i - 1] !== '\u202F') found.push(issue('FR_GUILLEMET', `${path}/${i}`));
    if (char === "'" && i > 0 && /[A-Za-z]/.test(value[i - 1]) && /[A-Za-z]/.test(value[i + 1] ?? '')) {
      found.push(issue('FR_APOSTROPHE', `${path}/${i}`));
    }
  }
  return found;
}
export function bilingualIssues(value, path) {
  if (!plain(value) || Object.keys(value).sort().join('|') !== 'en|fr') return [issue('LANGUAGE_PAIR', path)];
  const problems = [];
  if (!safeString(value.en)) problems.push(issue('TEXT_EN', `${path}/en`));
  problems.push(...frenchTextIssues(value.fr, `${path}/fr`));
  return problems;
}
export function privateIssues(value, path = '', seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return [];
  if (depth > TRACE_LIMITS.depth) return [issue('DEPTH_LIMIT', path || '/')];
  if (seen.has(value)) return [issue('CYCLIC_INPUT', path || '/')];
  seen.add(value);
  const errors = [];
  const entries = Array.isArray(value) ? value.map((entry, index) => [String(index), entry]) : Object.entries(value);
  for (const [key, child] of entries) {
    const current = `${path}/${pointer(key)}`;
    const canonical = key.toLowerCase().replace(/[-_]/g, '');
    if (PRIVATE.has(canonical) || RESERVED.has(key)) errors.push(issue('PRIVATE_KEY', current));
    else errors.push(...privateIssues(child, current, seen, depth + 1));
    if (errors.length > TRACE_LIMITS.issues) break;
  }
  seen.delete(value);
  return errors;
}
export function sourceIssues(value, path, today) {
  if (!plain(value)) return [issue('SOURCE_REQUIRED', path)];
  const errors = [];
  if (!safeId(value.id)) errors.push(issue('SOURCE_ID', `${path}/id`));
  if (!safeString(value.title)) errors.push(issue('SOURCE_TITLE', `${path}/title`));
  if (!safeUrl(value.url)) errors.push(issue('SOURCE_URL', `${path}/url`));
  if (!OPEN_LICENCES.has(value.licence)) errors.push(issue('SOURCE_LICENCE', `${path}/licence`));
  if (!strictDate(value.retrievedOn) || strictDate(today) && value.retrievedOn > today) errors.push(issue('SOURCE_DATE', `${path}/retrievedOn`));
  if (![0, 1, 2, 3, 4, 'E'].includes(value.tier)) errors.push(issue('SOURCE_TIER', `${path}/tier`));
  if (value.digest !== undefined && (typeof value.digest !== 'string' || !SHA.test(value.digest))) errors.push(issue('SOURCE_DIGEST', `${path}/digest`));
  for (const key of Object.keys(value)) {
    if (!['id', 'title', 'url', 'licence', 'retrievedOn', 'tier', 'digest'].includes(key)) errors.push(issue('SOURCE_FIELD', `${path}/${pointer(key)}`));
  }
  return errors;
}
export function eventIssues(value, path) {
  if (!plain(value)) return [issue('EVENT_OBJECT', path)];
  const errors = [];
  if (!safeId(value.id)) errors.push(issue('EVENT_ID', `${path}/id`));
  if (!EVENTS.has(value.type)) errors.push(issue('EVENT_TYPE', `${path}/type`));
  if (!Number.isInteger(value.at) || value.at < 0 || value.at > 3_600_000) errors.push(issue('EVENT_AT', `${path}/at`));
  if (!safeId(value.stepId)) errors.push(issue('EVENT_STEP', `${path}/stepId`));
  if (!STATES.has(value.state)) errors.push(issue('EVENT_STATE', `${path}/state`));
  if (!safeId(value.sourceId)) errors.push(issue('EVENT_SOURCE', `${path}/sourceId`));
  if (value.type === 'key' && !KEYS.has(value.key)) errors.push(issue('EVENT_KEY', `${path}/key`));
  if (value.type === 'focus' && !safeId(value.target)) errors.push(issue('EVENT_FOCUS', `${path}/target`));
  if (value.type === 'announce') {
    errors.push(...bilingualIssues(value.message, `${path}/message`));
    if (!['polite', 'assertive', 'off', 'UNKNOWN'].includes(value.politeness)) errors.push(issue('EVENT_LIVE', `${path}/politeness`));
  }
  if (value.type === 'asset' && (!safeId(value.assetId) || !['present', 'missing', 'UNKNOWN'].includes(value.availability))) {
    errors.push(issue('EVENT_ASSET', path));
  }
  if (value.type === 'storage' && !['ready', 'blocked', 'full', 'UNKNOWN'].includes(value.storage)) errors.push(issue('EVENT_STORAGE', path));
  if (value.type === 'step-end' && !['complete', 'incomplete', 'UNKNOWN'].includes(value.outcome)) errors.push(issue('EVENT_OUTCOME', path));
  const fields = new Set(['id', 'type', 'at', 'stepId', 'state', 'sourceId', 'key', 'target', 'message', 'politeness', 'assetId', 'availability', 'storage', 'outcome']);
  for (const key of Object.keys(value)) if (!fields.has(key)) errors.push(issue('EVENT_FIELD', `${path}/${pointer(key)}`));
  return errors;
}
export function stepIssues(value, path) {
  if (!plain(value)) return [issue('STEP_OBJECT', path)];
  const errors = [];
  if (!safeId(value.id)) errors.push(issue('STEP_ID', `${path}/id`));
  errors.push(...bilingualIssues(value.label, `${path}/label`));
  if (!CHANNELS.has(value.channel)) errors.push(issue('STEP_CHANNEL', `${path}/channel`));
  if (!STATES.has(value.expected)) errors.push(issue('STEP_EXPECTED', `${path}/expected`));
  if (!Array.isArray(value.events) || value.events.length > TRACE_LIMITS.events) errors.push(issue('STEP_EVENTS', `${path}/events`));
  else {
    let last = -1;
    const ids = new Set();
    for (let i = 0; i < value.events.length; i += 1) {
      const event = value.events[i];
      const here = `${path}/events/${i}`;
      errors.push(...eventIssues(event, here));
      if (event && typeof event === 'object') {
        if (event.stepId !== value.id) errors.push(issue('EVENT_STEP_MISMATCH', here));
        if (Number.isInteger(event.at) && event.at < last) errors.push(issue('EVENT_ORDER', here));
        if (Number.isInteger(event.at)) last = event.at;
        if (ids.has(event.id)) errors.push(issue('EVENT_DUPLICATE', here));
        ids.add(event.id);
      }
      if (errors.length > TRACE_LIMITS.issues) break;
    }
  }
  for (const key of Object.keys(value)) if (!['id', 'label', 'channel', 'expected', 'events'].includes(key)) errors.push(issue('STEP_FIELD', `${path}/${pointer(key)}`));
  return errors;
}
export function journeyIssues(value, path, sourceIds) {
  if (!plain(value)) return [issue('JOURNEY_OBJECT', path)];
  const errors = [];
  if (!safeId(value.id)) errors.push(issue('JOURNEY_ID', `${path}/id`));
  if (!LOCALES.has(value.locale)) errors.push(issue('JOURNEY_LOCALE', `${path}/locale`));
  if (!['offline', 'online', 'limited', 'UNKNOWN'].includes(value.network)) errors.push(issue('JOURNEY_NETWORK', `${path}/network`));
  errors.push(...bilingualIssues(value.label, `${path}/label`));
  if (!Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > TRACE_LIMITS.steps) errors.push(issue('JOURNEY_STEPS', `${path}/steps`));
  else {
    const ids = new Set();
    for (let i = 0; i < value.steps.length; i += 1) {
      const step = value.steps[i];
      const here = `${path}/steps/${i}`;
      errors.push(...stepIssues(step, here));
      if (step && typeof step === 'object') {
        if (ids.has(step.id)) errors.push(issue('STEP_DUPLICATE', here));
        ids.add(step.id);
        if (Array.isArray(step.events)) for (const event of step.events) {
          if (event && !sourceIds.has(event.sourceId)) errors.push(issue('EVENT_SOURCE_MISSING', `${here}/events`));
        }
      }
      if (errors.length > TRACE_LIMITS.issues) break;
    }
  }
  for (const key of Object.keys(value)) if (!['id', 'locale', 'network', 'label', 'steps'].includes(key)) errors.push(issue('JOURNEY_FIELD', `${path}/${pointer(key)}`));
  return errors;
}
export function inspectTrace(value, options = {}) {
  if (!plain(value) || value.version !== TRACE_VERSION || !Array.isArray(value.sources) || !Array.isArray(value.journeys)) {
    return { ok: false, problems: [issue('DOCUMENT_SHAPE', '/')], document: null };
  }
  if (value.journeys.length > TRACE_LIMITS.journeys || value.sources.length > TRACE_LIMITS.journeys * 4) {
    return { ok: false, problems: [issue('DOCUMENT_LIMIT', '/')], document: null };
  }
  let totalEvents = 0;
  for (const journey of value.journeys) {
    if (!plain(journey) || !Array.isArray(journey.steps)) continue;
    if (journey.steps.length > TRACE_LIMITS.steps) return {
      ok: false, problems: [issue('JOURNEY_STEPS', '/journeys')], document: null,
    };
    for (const step of journey.steps) {
      if (!plain(step) || !Array.isArray(step.events)) continue;
      totalEvents += step.events.length;
      if (totalEvents > TRACE_LIMITS.events) return {
        ok: false, problems: [issue('DOCUMENT_EVENT_LIMIT', '/journeys')], document: null,
      };
    }
  }
  const errors = privateIssues(value);
  const ids = new Set();
  value.sources.forEach((source, index) => {
    const path = `/sources/${index}`;
    errors.push(...sourceIssues(source, path, options.today));
    if (source && typeof source === 'object') {
      if (ids.has(source.id)) errors.push(issue('SOURCE_DUPLICATE', path));
      ids.add(source.id);
    }
  });
  const journeys = new Set();
  value.journeys.forEach((journey, index) => {
    const path = `/journeys/${index}`;
    errors.push(...journeyIssues(journey, path, ids));
    if (journey && typeof journey === 'object') {
      if (journeys.has(journey.id)) errors.push(issue('JOURNEY_DUPLICATE', path));
      journeys.add(journey.id);
    }
  });
  for (const key of Object.keys(value)) if (!['version', 'sources', 'journeys', 'recordedOn'].includes(key)) errors.push(issue('DOCUMENT_FIELD', `/${pointer(key)}`));
  if (!strictDate(value.recordedOn) || strictDate(options.today) && value.recordedOn > options.today) errors.push(issue('DOCUMENT_DATE', '/recordedOn'));
  const sorted = errors.slice(0, TRACE_LIMITS.issues).sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
  return { ok: sorted.length === 0, problems: sorted, document: sorted.length ? null : value };
}
export function canonicalTrace(value, options = {}) {
  const check = inspectTrace(value, options);
  if (!check.ok) return { ok: false, problems: check.problems, text: null };
  const ordered = {
    version: TRACE_VERSION, recordedOn: value.recordedOn,
    sources: [...value.sources].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    journeys: [...value.journeys].sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
  return { ok: true, problems: [], text: JSON.stringify(ordered) };
}
export function fingerprintTrace(value, options = {}) {
  const canonical = canonicalTrace(value, options);
  if (!canonical.ok) return { ok: false, problems: canonical.problems, digest: null };
  return { ok: true, problems: [], digest: createHash('sha256').update(canonical.text).digest('hex') };
}
export function parseTrace(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > TRACE_LIMITS.bytes) return { ok: false, problems: [issue('INPUT_BYTES', '/')], document: null };
  try { return inspectTrace(JSON.parse(text), options); }
  catch { return { ok: false, problems: [issue('INPUT_JSON', '/')], document: null }; }
}
