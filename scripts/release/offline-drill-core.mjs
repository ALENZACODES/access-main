/**
 * Offline Degradation Drill: deterministic inspection of captured application
 * states. No network access and no environmental measurements are inferred.
 * Results describe supplied observations, not facilities or people.
 */
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { isOpenLicence, isValidDate } from './site-audit.mjs';

export const DRILL_VERSION = 1;
export const CAPTURE_STATES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const NETWORK_STATES = Object.freeze(['offline', 'limited', 'online', 'UNKNOWN']);
export const STORAGE_STATES = Object.freeze(['ready', 'blocked', 'UNKNOWN']);
export const INTERACTION_STATES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const CAPTURE_LOCALES = Object.freeze(['en', 'fr']);
export const CONTROL_ROLES = Object.freeze(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'textbox', 'combobox']);
export const GATE_RULES = Object.freeze([
  'SOURCE_METADATA', 'UNKNOWN_PRESERVED', 'LOCAL_ASSET', 'OFFLINE_SHELL',
  'KEYBOARD_REACHABLE', 'FOCUS_VISIBLE', 'TARGET_SIZE', 'LANGUAGE_COPY',
  'PRIVACY_LIMIT', 'CONSENT_BOUNDARY', 'NETWORK_DISCLOSURE', 'STORAGE_DISCLOSURE',
]);
export const DRILL_LIMITS = Object.freeze({
  maxBytes: 8_000_000, maxCaptures: 300, maxItems: 2_000,
  maxIssues: 2_000, maxText: 4_096, maxDepth: 24, maxPath: 512,
});
const STATE = new Set(CAPTURE_STATES);
const NETWORK = new Set(NETWORK_STATES);
const STORAGE = new Set(STORAGE_STATES);
const INTERACTION = new Set(INTERACTION_STATES);
const LOCALES = new Set(CAPTURE_LOCALES);
const ROLES = new Set(CONTROL_ROLES);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA = /^[a-f0-9]{64}$/i;
const ASCII_CONTROL = /[\u0000-\u001f\u007f]/u;
const PRIVATE = new Set([
  'email', 'phone', 'phonenumber', 'personname', 'fullname', 'firstname',
  'lastname', 'streetaddress', 'postaladdress', 'dateofbirth', 'birthdate',
  'healthcard', 'healthnumber', 'ohip', 'diagnosis', 'medication',
  'prescription', 'password', 'token', 'accesstoken', 'refreshtoken',
  'sessionid', 'sessioncookie', 'apikey', 'secret', 'gps', 'geolocation',
  'locationhistory', 'coordinates', 'latitude', 'longitude',
]);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

function issue(code, path, severity = 'error') {
  return Object.freeze({ code, path, severity });
}
export function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
export function pointer(text) {
  return String(text).replaceAll('~', '~0').replaceAll('/', '~1');
}
export function goodId(value) {
  return typeof value === 'string' && ID.test(value) && !RESERVED.has(value.toLowerCase());
}
export function goodText(value, limit = DRILL_LIMITS.maxText) {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= limit && !ASCII_CONTROL.test(value);
}
export function safeHttps(value) {
  if (!goodText(value, 2_048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username &&
      !url.password && !url.hash && url.hostname !== 'localhost' &&
      !url.hostname.endsWith('.localhost') &&
      !/^127\./u.test(url.hostname) && url.hostname !== '[::1]';
  } catch { return false; }
}
export function localPath(value) {
  if (typeof value !== 'string' || !value || value.length > DRILL_LIMITS.maxPath ||
    ASCII_CONTROL.test(value) || value.includes('\\') || value.includes('?') ||
    value.includes('#') || value.startsWith('/') || value.startsWith('//')) return false;
  const parts = value.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..' &&
    !part.includes(':') && !part.includes('%') && !part.includes('<'));
}
export function deepPrivateKeys(value, prefix = '', maxDepth = DRILL_LIMITS.maxDepth) {
  const problems = [];
  const seen = new WeakSet();
  const stack = [{ value, prefix, depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    if (!current || !current.value || typeof current.value !== 'object') continue;
    if (current.depth > maxDepth) {
      problems.push(issue('DEPTH_LIMIT', current.prefix || '/'));
      continue;
    }
    if (seen.has(current.value)) {
      problems.push(issue('CYCLE', current.prefix || '/'));
      continue;
    }
    seen.add(current.value);
    const pairs = Array.isArray(current.value) ?
      current.value.map((entry, index) => [String(index), entry]) : Object.entries(current.value);
    for (const [key, entry] of pairs) {
      const path = `${current.prefix}/${pointer(key)}`;
      const simple = key.toLowerCase().replaceAll('_', '').replaceAll('-', '');
      if (PRIVATE.has(simple) || RESERVED.has(key)) {
        problems.push(issue('PRIVATE_FIELD', path));
      } else {
        stack.push({ value: entry, prefix: path, depth: current.depth + 1 });
      }
    }
  }
  return problems;
}
export function goodFrenchCopy(value) {
  if (!goodText(value)) return false;
  if (/(?:^|[^\p{L}])(?:l|d|j|n|c|s|qu|jusqu|lorsqu)'(?=\p{L})/iu.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === ':' && i > 0 && value[i - 1] !== '\u00A0') return false;
    if (';!?'.includes(c) && i > 0 && value[i - 1] !== '\u202F') return false;
    if (c === '«' && value[i + 1] !== '\u202F') return false;
    if (c === '»' && value[i - 1] !== '\u202F') return false;
  }
  return true;
}
export function goodPair(value) {
  return object(value) && Object.keys(value).length === 2 &&
    goodText(value.en) && goodFrenchCopy(value.fr);
}
export function provenanceIssues(value, path = '/provenance', today) {
  if (!object(value)) return [issue('SOURCE_METADATA', path)];
  const problems = [];
  if (!safeHttps(value.source)) problems.push(issue('SOURCE_URL', `${path}/source`));
  if (!isOpenLicence(value.licence)) problems.push(issue('SOURCE_LICENCE', `${path}/licence`));
  if (!isValidDate(value.retrievedOn) || isValidDate(today) && value.retrievedOn > today) {
    problems.push(issue('SOURCE_DATE', `${path}/retrievedOn`));
  }
  if (![0, 1, 2, 3, 4, 'E'].includes(value.tier)) {
    problems.push(issue('SOURCE_TIER', `${path}/tier`));
  }
  if (Object.keys(value).some((key) => !['source', 'licence', 'retrievedOn', 'tier', 'sourceDate'].includes(key))) {
    problems.push(issue('SOURCE_EXTRA', path));
  }
  if (value.sourceDate !== undefined && (!isValidDate(value.sourceDate) ||
    isValidDate(value.retrievedOn) && value.sourceDate > value.retrievedOn)) {
    problems.push(issue('SOURCE_OBSERVED_DATE', `${path}/sourceDate`));
  }
  return problems;
}
function sourceRecordIssues(value, path, today) {
  if (!object(value)) return [issue('SOURCE_INVALID', path)];
  const problems = [];
  if (!goodId(value.id)) problems.push(issue('SOURCE_ID', `${path}/id`));
  if (!goodPair(value.title)) problems.push(issue('SOURCE_TITLE', `${path}/title`));
  problems.push(...provenanceIssues(value.provenance, `${path}/provenance`, today));
  const allowed = new Set(['id', 'title', 'provenance']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) {
    problems.push(issue('SOURCE_EXTRA', `${path}/${pointer(key)}`));
  }
  return problems;
}
function controlIssues(value, path) {
  if (!object(value)) return [issue('CONTROL_INVALID', path)];
  const problems = [];
  if (!goodId(value.id)) problems.push(issue('CONTROL_ID', `${path}/id`));
  if (!ROLES.has(value.role)) problems.push(issue('CONTROL_ROLE', `${path}/role`));
  if (!goodPair(value.name)) problems.push(issue('LANGUAGE_COPY', `${path}/name`));
  if (!INTERACTION.has(value.keyboard)) problems.push(issue('CONTROL_KEYBOARD', `${path}/keyboard`));
  if (!INTERACTION.has(value.focus)) problems.push(issue('CONTROL_FOCUS', `${path}/focus`));
  if (!object(value.target) || !Number.isFinite(value.target.width) ||
    !Number.isFinite(value.target.height) || value.target.width < 0 ||
    value.target.height < 0 || value.target.width > 10_000 || value.target.height > 10_000) {
    problems.push(issue('CONTROL_TARGET', `${path}/target`));
  }
  const allowed = new Set(['id', 'role', 'name', 'keyboard', 'focus', 'target']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) {
    problems.push(issue('CONTROL_EXTRA', `${path}/${pointer(key)}`));
  }
  return problems;
}
function assetIssues(value, path) {
  if (!object(value)) return [issue('ASSET_INVALID', path)];
  const problems = [];
  if (!localPath(value.path)) problems.push(issue('ASSET_PATH', `${path}/path`));
  if (!STATE.has(value.available)) problems.push(issue('ASSET_STATE', `${path}/available`));
  if (typeof value.shell !== 'boolean') problems.push(issue('ASSET_SHELL', `${path}/shell`));
  if (value.sha256 !== null && (typeof value.sha256 !== 'string' || !SHA.test(value.sha256))) {
    problems.push(issue('ASSET_DIGEST', `${path}/sha256`));
  }
  const allowed = new Set(['path', 'available', 'shell', 'sha256']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) {
    problems.push(issue('ASSET_EXTRA', `${path}/${pointer(key)}`));
  }
  return problems;
}
function claimIssues(value, path) {
  if (!object(value)) return [issue('CLAIM_INVALID', path)];
  const problems = [];
  if (!goodId(value.id)) problems.push(issue('CLAIM_ID', `${path}/id`));
  if (!goodPair(value.label)) problems.push(issue('LANGUAGE_COPY', `${path}/label`));
  if (!STATE.has(value.state)) problems.push(issue('CLAIM_STATE', `${path}/state`));
  if (!goodId(value.sourceId)) problems.push(issue('CLAIM_SOURCE', `${path}/sourceId`));
  const allowed = new Set(['id', 'label', 'state', 'sourceId']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) {
    problems.push(issue('CLAIM_EXTRA', `${path}/${pointer(key)}`));
  }
  return problems;
}
export function captureIssues(value, path = '/captures/0', options = {}) {
  if (!object(value)) return [issue('CAPTURE_INVALID', path)];
  const problems = [];
  if (!goodId(value.id)) problems.push(issue('CAPTURE_ID', `${path}/id`));
  if (typeof value.route !== 'string' || !/^\/[a-z\d/_-]*$/i.test(value.route) ||
    value.route.includes('//')) problems.push(issue('CAPTURE_ROUTE', `${path}/route`));
  if (!LOCALES.has(value.locale)) problems.push(issue('CAPTURE_LOCALE', `${path}/locale`));
  if (!NETWORK.has(value.network)) problems.push(issue('CAPTURE_NETWORK', `${path}/network`));
  if (!STORAGE.has(value.storage)) problems.push(issue('CAPTURE_STORAGE', `${path}/storage`));
  if (!INTERACTION.has(value.shell)) problems.push(issue('CAPTURE_SHELL', `${path}/shell`));
  if (!INTERACTION.has(value.privacy)) problems.push(issue('CAPTURE_PRIVACY', `${path}/privacy`));
  if (!INTERACTION.has(value.consent)) problems.push(issue('CAPTURE_CONSENT', `${path}/consent`));
  if (!object(value.viewport) || !Number.isInteger(value.viewport.width) ||
    !Number.isInteger(value.viewport.height) || value.viewport.width < 240 ||
    value.viewport.width > 8_192 || value.viewport.height < 240 || value.viewport.height > 8_192) {
    problems.push(issue('CAPTURE_VIEWPORT', `${path}/viewport`));
  }
  problems.push(...provenanceIssues(value.provenance, `${path}/provenance`, options.today));
  for (const field of ['controls', 'assets', 'claims']) {
    const entries = value[field];
    if (!Array.isArray(entries) || entries.length > (options.maxItems ?? DRILL_LIMITS.maxItems)) {
      problems.push(issue('CAPTURE_COLLECTION', `${path}/${field}`));
      continue;
    }
    const ids = new Set();
    for (let index = 0; index < entries.length; index++) {
      const entryPath = `${path}/${field}/${index}`;
      const element = entries[index];
      if (field === 'controls') problems.push(...controlIssues(element, entryPath));
      if (field === 'assets') problems.push(...assetIssues(element, entryPath));
      if (field === 'claims') problems.push(...claimIssues(element, entryPath));
      const key = field === 'assets' ? element?.path : element?.id;
      if (typeof key === 'string') {
        if (ids.has(key)) problems.push(issue('DUPLICATE_ITEM', entryPath));
        ids.add(key);
      }
    }
  }
  const allowed = new Set(['id', 'route', 'locale', 'network', 'storage', 'shell',
    'privacy', 'consent', 'viewport', 'provenance', 'controls', 'assets', 'claims']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) {
    problems.push(issue('CAPTURE_EXTRA', `${path}/${pointer(key)}`));
  }
  return problems;
}
export function inspectDrill(value, options = {}) {
  const maxIssues = Number.isInteger(options.maxIssues) && options.maxIssues > 0 ?
    Math.min(options.maxIssues, DRILL_LIMITS.maxIssues) : DRILL_LIMITS.maxIssues;
  const problems = deepPrivateKeys(value);
  if (!object(value) || value.version !== DRILL_VERSION ||
    !Array.isArray(value.sources) || !Array.isArray(value.captures)) {
    return { ok: false, problems: [...problems, issue('DRILL_SHAPE', '/')].slice(0, maxIssues), document: null };
  }
  if (value.sources.length > DRILL_LIMITS.maxItems ||
    value.captures.length > DRILL_LIMITS.maxCaptures) {
    problems.push(issue('DRILL_LIMIT', '/'));
  }
  const sourceIds = new Set();
  const captureIds = new Set();
  for (const [index, source] of value.sources.slice(0, DRILL_LIMITS.maxItems).entries()) {
    const path = `/sources/${index}`;
    problems.push(...sourceRecordIssues(source, path, options.today));
    if (goodId(source?.id)) {
      if (sourceIds.has(source.id)) problems.push(issue('DUPLICATE_SOURCE', path));
      sourceIds.add(source.id);
    }
  }
  for (const [index, capture] of value.captures.slice(0, DRILL_LIMITS.maxCaptures).entries()) {
    const path = `/captures/${index}`;
    problems.push(...captureIssues(capture, path, options));
    if (goodId(capture?.id)) {
      if (captureIds.has(capture.id)) problems.push(issue('DUPLICATE_CAPTURE', path));
      captureIds.add(capture.id);
    }
    for (const [cIndex, claim] of (Array.isArray(capture?.claims) ? capture.claims : []).entries()) {
      if (goodId(claim?.sourceId) && !sourceIds.has(claim.sourceId) &&
        !value.sources.some((source) => source.id === claim.sourceId)) {
        problems.push(issue('CLAIM_SOURCE_MISSING', `${path}/claims/${cIndex}/sourceId`));
      }
    }
  }
  const allowed = new Set(['version', 'sources', 'captures']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) {
    problems.push(issue('DRILL_EXTRA', `/${pointer(key)}`));
  }
  const selected = problems.slice(0, maxIssues);
  return { ok: problems.length === 0, problems: selected, document: problems.length === 0 ? value : null };
}
export function parseDrill(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > DRILL_LIMITS.maxBytes) {
    return { ok: false, problems: [issue('INPUT_LIMIT', '/')], document: null };
  }
  try { return inspectDrill(JSON.parse(text), options); }
  catch { return { ok: false, problems: [issue('INPUT_JSON', '/')], document: null }; }
}
export function canonicalDrill(value, options = {}) {
  const result = inspectDrill(value, options);
  if (!result.ok) return { ok: false, problems: result.problems, document: null };
  const sortId = (a, b) => a.id.localeCompare(b.id, 'en');
  const captures = value.captures.map((capture) => ({
    ...capture,
    controls: [...capture.controls].sort(sortId),
    assets: [...capture.assets].sort((a, b) => a.path.localeCompare(b.path, 'en')),
    claims: [...capture.claims].sort(sortId),
  })).sort(sortId);
  const sources = [...value.sources].sort(sortId);
  return { ok: true, problems: [], document: { version: DRILL_VERSION, sources, captures } };
}
export function serializeDrill(value, options = {}) {
  const result = canonicalDrill(value, options);
  return { ok: result.ok, problems: result.problems,
    text: result.ok ? `${JSON.stringify(result.document, null, 2)}\n` : null };
}
