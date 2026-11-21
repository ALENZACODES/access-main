/**
 * A deliberately narrow interchange contract for manually recorded offline
 * installation, update and rollback rehearsals. An observation is not a
 * statement about the accessibility of a physical place. A missing observation
 * is UNKNOWN, not a pass. No browser or network API is called by this module.
 */
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

export const REHEARSAL_VERSION = 1;
export const RESULTS = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const CONDITIONS = Object.freeze(['online', 'offline', 'limited', 'UNKNOWN']);
export const LOCALES = Object.freeze(['en', 'fr']);
export const PHASES = Object.freeze([
  'initial-install', 'warm-start', 'update-found', 'update-staged',
  'activate-update', 'restart-offline', 'rollback-requested', 'rollback-complete',
]);
export const EVENT_KINDS = Object.freeze([
  'shell-request', 'shell-response', 'manifest-read', 'asset-request',
  'asset-response', 'update-check', 'staging-complete', 'activation',
  'restart', 'rollback', 'focus-check', 'keyboard-check', 'announcement-check',
  'storage-check', 'error',
]);
export const LIMITS = Object.freeze({
  maxBytes: 6_000_000, maxSessions: 250, maxEvents: 12_000,
  maxEventsPerSession: 400, maxAssets: 2_000, maxString: 2_048,
  maxDepth: 28, maxIssues: 1_000,
});
const STATES = new Set(RESULTS);
const NETWORK = new Set(CONDITIONS);
const PHASE = new Set(PHASES);
const EVENTS = new Set(EVENT_KINDS);
const LANG = new Set(LOCALES);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
const HEX = /^[0-9a-f]{64}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BAD_KEYS = new Set([
  'password', 'secret', 'token', 'accesstoken', 'refreshtoken',
  'apikey', 'cookie', 'sessioncookie', 'email', 'phonenumber',
  'phone', 'fullname', 'firstname', 'lastname', 'address', 'postalcode',
  'healthcard', 'ohip', 'diagnosis', 'medication', 'medicalhistory',
  'birthdate', 'gps', 'geolocation', 'latitude', 'longitude',
  'locationhistory', 'coordinates',
]);
const LICENCES = new Set([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
  'OGL-Canada-2.0', 'OGL-Ontario-1.0', 'MIT', 'Apache-2.0',
]);
const TIERS = new Set([0, 1, 2, 3, 4, 'E']);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

export function issue(code, path, detail = '') {
  return { code, path, detail };
}
export function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
export function pointer(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}
export function goodId(value) {
  return typeof value === 'string' && ID.test(value) && !RESERVED.has(value);
}
export function goodDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function hasControls(value) {
  return [...value].some(character => {
    const number = character.codePointAt(0);
    return number <= 31 || number === 127;
  });
}
export function goodText(value, max = LIMITS.maxString) {
  return typeof value === 'string' && value.length > 0 && value.length <= max &&
    Boolean(value.trim()) && !hasControls(value) && !value.includes('\uFFFD');
}
export function safePath(value) {
  if (!goodText(value, 384) || value.includes('\\') || value.startsWith('/') ||
    value.startsWith('?') || value.startsWith('#') || value.includes('?') ||
    value.includes('#') || value.includes('%') || value.includes(':')) return false;
  const segments = value.split('/');
  return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..') &&
    !value.startsWith('//');
}
export function safeUrl(value) {
  if (!goodText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.hostname.endsWith('.localhost') &&
      !url.hash;
  } catch { return false; }
}
export function goodFrench(value) {
  if (typeof value !== 'string') return false;
  if (/\b(?:l|d|j|c|n|s|qu|jusqu|lorsqu|puisqu)'(?=\p{L})/iu.test(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === ':' && index !== 0 && value[index - 1] !== '\u00A0') return false;
    if (';!?'.includes(character) && index !== 0 && value[index - 1] !== '\u202F') return false;
    if (character === '«' && value[index + 1] !== '\u202F') return false;
    if (character === '»' && value[index - 1] !== '\u202F') return false;
  }
  return true;
}
export function textPair(value) {
  return object(value) && Object.keys(value).length === 2 &&
    goodText(value.en) && goodText(value.fr) && goodFrench(value.fr);
}
export function keyName(value) {
  return value.toLowerCase().replace(/[_-]/g, '');
}
/** Report paths only. No private field value is ever placed in a finding. */
export function privateIssues(value, path = '', visited = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return [];
  if (depth > LIMITS.maxDepth) return [issue('DEPTH_LIMIT', path || '/')];
  if (visited.has(value)) return [issue('CYCLIC_INPUT', path || '/')];
  visited.add(value);
  const found = [];
  const entries = Array.isArray(value) ? value.map((item, i) => [String(i), item]) : Object.entries(value);
  for (const [key, child] of entries) {
    const childPath = `${path}/${pointer(key)}`;
    if (BAD_KEYS.has(keyName(key)) || RESERVED.has(key)) {
      found.push(issue('PRIVATE_FIELD', childPath));
      continue;
    }
    found.push(...privateIssues(child, childPath, visited, depth + 1));
    if (found.length >= LIMITS.maxIssues) break;
  }
  visited.delete(value);
  return found.slice(0, LIMITS.maxIssues);
}
export function provenanceIssues(value, path, today) {
  if (!object(value)) return [issue('PROVENANCE_REQUIRED', path)];
  const found = [];
  if (!safeUrl(value.source)) found.push(issue('SOURCE_REQUIRED', `${path}/source`));
  if (!LICENCES.has(value.licence)) found.push(issue('LICENCE_REQUIRED', `${path}/licence`));
  if (!goodDay(value.retrievedOn)) found.push(issue('RETRIEVED_DATE', `${path}/retrievedOn`));
  if (!TIERS.has(value.tier)) found.push(issue('TIER_REQUIRED', `${path}/tier`));
  if (goodDay(value.retrievedOn) && goodDay(today) && value.retrievedOn > today) {
    found.push(issue('FUTURE_RETRIEVAL', `${path}/retrievedOn`));
  }
  for (const key of Object.keys(value)) {
    if (!['source', 'licence', 'retrievedOn', 'tier'].includes(key)) found.push(issue('PROVENANCE_EXTRA', `${path}/${pointer(key)}`));
  }
  return found;
}
export function assetIssues(value, path) {
  if (!object(value)) return [issue('ASSET_INVALID', path)];
  const found = [];
  if (!goodId(value.id)) found.push(issue('ASSET_ID', `${path}/id`));
  if (!safePath(value.path)) found.push(issue('ASSET_PATH', `${path}/path`));
  if (typeof value.sha256 !== 'string' || !HEX.test(value.sha256)) found.push(issue('ASSET_DIGEST', `${path}/sha256`));
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > 50_000_000) {
    found.push(issue('ASSET_BYTES', `${path}/bytes`));
  }
  if (!STATES.has(value.state)) found.push(issue('ASSET_STATE', `${path}/state`));
  if (!textPair(value.label)) found.push(issue('ASSET_LABEL', `${path}/label`));
  if (!Array.isArray(value.dependsOn) || value.dependsOn.length > 200 ||
      value.dependsOn.some(name => !goodId(name))) found.push(issue('ASSET_DEPENDENCIES', `${path}/dependsOn`));
  found.push(...provenanceIssues(value.provenance, `${path}/provenance`));
  for (const key of Object.keys(value)) {
    if (!['id', 'path', 'sha256', 'bytes', 'state', 'label', 'dependsOn', 'provenance'].includes(key)) {
      found.push(issue('ASSET_EXTRA', `${path}/${pointer(key)}`));
    }
  }
  return found;
}
export function eventIssues(value, path) {
  if (!object(value)) return [issue('EVENT_INVALID', path)];
  const found = [];
  if (!goodId(value.id)) found.push(issue('EVENT_ID', `${path}/id`));
  if (!EVENTS.has(value.kind)) found.push(issue('EVENT_KIND', `${path}/kind`));
  if (!Number.isSafeInteger(value.order) || value.order < 0) found.push(issue('EVENT_ORDER', `${path}/order`));
  if (!STATES.has(value.state)) found.push(issue('EVENT_STATE', `${path}/state`));
  if (value.assetId !== null && value.assetId !== undefined && !goodId(value.assetId)) {
    found.push(issue('EVENT_ASSET', `${path}/assetId`));
  }
  if (value.note !== undefined && !textPair(value.note)) found.push(issue('EVENT_NOTE', `${path}/note`));
  for (const key of Object.keys(value)) {
    if (!['id', 'kind', 'order', 'state', 'assetId', 'note'].includes(key)) {
      found.push(issue('EVENT_EXTRA', `${path}/${pointer(key)}`));
    }
  }
  return found;
}
export function sessionIssues(value, path, today) {
  if (!object(value)) return [issue('SESSION_INVALID', path)];
  const found = [];
  if (!goodId(value.id)) found.push(issue('SESSION_ID', `${path}/id`));
  if (!PHASE.has(value.phase)) found.push(issue('SESSION_PHASE', `${path}/phase`));
  if (!LANG.has(value.locale)) found.push(issue('SESSION_LOCALE', `${path}/locale`));
  if (!NETWORK.has(value.network)) found.push(issue('SESSION_NETWORK', `${path}/network`));
  if (!goodDay(value.recordedOn)) found.push(issue('SESSION_DATE', `${path}/recordedOn`));
  if (goodDay(today) && goodDay(value.recordedOn) && value.recordedOn > today) {
    found.push(issue('SESSION_FUTURE', `${path}/recordedOn`));
  }
  if (!textPair(value.label)) found.push(issue('SESSION_LABEL', `${path}/label`));
  if (!STATES.has(value.outcome)) found.push(issue('SESSION_OUTCOME', `${path}/outcome`));
  if (!Array.isArray(value.events) || value.events.length > LIMITS.maxEventsPerSession) {
    found.push(issue('SESSION_EVENTS', `${path}/events`));
  } else {
    const eventIds = new Set();
    let previous = -1;
    for (const [index, event] of value.events.entries()) {
      found.push(...eventIssues(event, `${path}/events/${index}`));
      if (goodId(event?.id) && eventIds.has(event.id)) found.push(issue('EVENT_DUPLICATE', `${path}/events/${index}/id`));
      eventIds.add(event?.id);
      if (Number.isSafeInteger(event?.order) && event.order <= previous) {
        found.push(issue('EVENT_OUT_OF_ORDER', `${path}/events/${index}/order`));
      }
      if (Number.isSafeInteger(event?.order)) previous = event.order;
    }
  }
  found.push(...provenanceIssues(value.provenance, `${path}/provenance`, today));
  for (const key of Object.keys(value)) {
    if (!['id', 'phase', 'locale', 'network', 'recordedOn', 'label', 'outcome', 'events', 'provenance'].includes(key)) {
      found.push(issue('SESSION_EXTRA', `${path}/${pointer(key)}`));
    }
  }
  return found;
}
export function validateRehearsal(value, options = {}) {
  const found = privateIssues(value);
  if (!object(value) || value.version !== REHEARSAL_VERSION ||
      !Array.isArray(value.assets) || !Array.isArray(value.sessions)) {
    return { ok: false, problems: [...found, issue('DOCUMENT_INVALID', '/')].slice(0, LIMITS.maxIssues) };
  }
  if (value.assets.length > LIMITS.maxAssets) found.push(issue('ASSET_LIMIT', '/assets'));
  if (value.sessions.length > LIMITS.maxSessions) found.push(issue('SESSION_LIMIT', '/sessions'));
  const total = value.sessions.reduce((count, session) => count + (Array.isArray(session?.events) ? session.events.length : 0), 0);
  if (total > LIMITS.maxEvents) found.push(issue('EVENT_LIMIT', '/sessions'));
  if (found.some(problem => ['ASSET_LIMIT', 'SESSION_LIMIT', 'EVENT_LIMIT', 'DEPTH_LIMIT', 'CYCLIC_INPUT'].includes(problem.code))) {
    return { ok: false, problems: found.slice(0, LIMITS.maxIssues) };
  }
  const assetIds = new Set();
  const paths = new Set();
  for (const [index, asset] of value.assets.entries()) {
    found.push(...assetIssues(asset, `/assets/${index}`));
    if (goodId(asset?.id) && assetIds.has(asset.id)) found.push(issue('DUPLICATE_ASSET', `/assets/${index}/id`));
    if (safePath(asset?.path) && paths.has(asset.path)) found.push(issue('DUPLICATE_PATH', `/assets/${index}/path`));
    assetIds.add(asset?.id);
    paths.add(asset?.path);
  }
  const sessionIds = new Set();
  for (const [index, session] of value.sessions.entries()) {
    found.push(...sessionIssues(session, `/sessions/${index}`, options.today));
    if (goodId(session?.id) && sessionIds.has(session.id)) found.push(issue('DUPLICATE_SESSION', `/sessions/${index}/id`));
    sessionIds.add(session?.id);
    if (Array.isArray(session?.events)) {
      for (const [eventIndex, event] of session.events.entries()) {
        if (event?.assetId && !assetIds.has(event.assetId)) {
          found.push(issue('EVENT_MISSING_ASSET', `/sessions/${index}/events/${eventIndex}/assetId`));
        }
      }
    }
  }
  for (const [index, asset] of value.assets.entries()) {
    if (!Array.isArray(asset?.dependsOn)) continue;
    for (const dependency of asset.dependsOn) {
      if (!assetIds.has(dependency)) found.push(issue('MISSING_DEPENDENCY', `/assets/${index}/dependsOn`));
      if (dependency === asset.id) found.push(issue('SELF_DEPENDENCY', `/assets/${index}/dependsOn`));
    }
  }
  for (const key of Object.keys(value)) {
    if (!['version', 'assets', 'sessions'].includes(key)) found.push(issue('DOCUMENT_EXTRA', `/${pointer(key)}`));
  }
  return { ok: found.length === 0, problems: found.slice(0, LIMITS.maxIssues) };
}
export function parseRehearsal(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > LIMITS.maxBytes) {
    return { ok: false, problems: [issue('INPUT_LIMIT', '/')], document: null };
  }
  let value;
  try { value = JSON.parse(text); }
  catch { return { ok: false, problems: [issue('JSON_INVALID', '/')], document: null }; }
  const result = validateRehearsal(value, options);
  return { ok: result.ok, problems: result.problems, document: result.ok ? value : null };
}
export function canonicalRehearsal(document) {
  const assets = [...document.assets].sort((a, b) => a.id.localeCompare(b.id, 'en'))
    .map(asset => ({ ...asset, dependsOn: [...asset.dependsOn].sort() }));
  const sessions = [...document.sessions].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return { version: REHEARSAL_VERSION, assets, sessions };
}
export function serializeRehearsal(value, options = {}) {
  const check = validateRehearsal(value, options);
  if (!check.ok) return { ok: false, problems: check.problems, text: null };
  const text = JSON.stringify(canonicalRehearsal(value), null, 2) + '\n';
  if (Buffer.byteLength(text, 'utf8') > LIMITS.maxBytes) return { ok: false, problems: [issue('OUTPUT_LIMIT', '/')], text: null };
  return { ok: true, problems: [], text };
}
