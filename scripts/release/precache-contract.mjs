/**
 * Conservative offline precache inventory contract. The App owns the input;
 * this module never fetches sources or infers whether a location is accessible.
 * A passed check means only that the recorded bytes meet this contract.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { isOpenLicence, isValidDate } from './site-audit.mjs';

export const PRECACHE_CONTRACT_VERSION = 1;
export const PRECACHE_CHUNK_LIMIT = 524_288;
export const PRECACHE_MAX_DOCUMENT_BYTES = 8_000_000;
export const PRECACHE_MAX_ITEMS = 4096;
export const PRECACHE_MAX_REFERENCES = 64;
export const PRECACHE_MAX_ASSET_BYTES = 50_000_000;
export const PRECACHE_STATES = Object.freeze(['PRESENT', 'MISSING', 'UNKNOWN']);
export const PRECACHE_KINDS = Object.freeze(['script', 'style', 'font', 'image', 'page', 'data', 'manifest']);
export const PRECACHE_GROUPS = Object.freeze(['shell', 'offline-pack', 'route', 'optional']);
export const PRECACHE_LOCALES = Object.freeze(['en', 'fr', 'neutral']);
const STATES = new Set(PRECACHE_STATES);
const KINDS = new Set(PRECACHE_KINDS);
const GROUPS = new Set(PRECACHE_GROUPS);
const LOCALES = new Set(PRECACHE_LOCALES);
const TIERS = new Set([0, 1, 2, 3, 4, 'E']);
const HEX = /^[0-9a-f]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const HIDDEN = new Set(['password', 'token', 'apikey', 'secret', 'cookie', 'session', 'email', 'phone', 'healthcard', 'diagnosis', 'medication', 'locationhistory']);
const CONTRACT_FIELDS = new Set(['version', 'releaseId', 'retrievedOn', 'assets']);
const ASSET_FIELDS = new Set(['id', 'path', 'kind', 'group', 'locale', 'state', 'bytes', 'sha256', 'source', 'licence', 'retrievedOn', 'tier', 'dependsOn', 'label']);

function issue(code, path) { return Object.freeze({ code, path }); }
function escaped(value) { return String(value).replace(/~/g, '~0').replace(/\//g, '~1'); }
export function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function safeIdentifier(value) {
  return typeof value === 'string' && ID.test(value) && !RESERVED.has(value.toLowerCase());
}
export function safeAssetPath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1024) return false;
  if (value !== value.trim() || value.startsWith('/') || value.includes('\\') || value.includes('//')) return false;
  if (value.includes('?') || value.includes('#') || value.includes('%') || value.includes(':')) return false;
  if ([...value].some(ch => ch.codePointAt(0) < 32 || ch.codePointAt(0) === 127)) return false;
  const segments = value.split('/');
  return segments.every(part => part.length > 0 && part !== '.' && part !== '..' && !part.startsWith('.'));
}
export function safeSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if ([...value].some(ch => ch.codePointAt(0) <= 32)) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]' || /^127\./u.test(host)) return false;
    return true;
  } catch { return false; }
}
export function safeLabel(value) {
  return plainObject(value) && Object.keys(value).length === 2 &&
    ['en', 'fr'].every(lang => typeof value[lang] === 'string' && value[lang].trim() &&
      value[lang].length <= 512 && ![...'\r\n\t'].some(char => value[lang].includes(char)));
}
export function frenchCopyIssues(value, path) {
  const errors = [];
  if (typeof value !== 'string') return [issue('FR_TEXT', path)];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === ':' && i > 0 && value[i - 1] !== '\u00A0') errors.push(issue('FR_COLON', `${path}/${i}`));
    if (';!?'.includes(ch) && i > 0 && value[i - 1] !== '\u202F') errors.push(issue('FR_NARROW', `${path}/${i}`));
    if (ch === '«' && value[i + 1] !== '\u202F') errors.push(issue('FR_QUOTES', `${path}/${i}`));
    if (ch === '»' && value[i - 1] !== '\u202F') errors.push(issue('FR_QUOTES', `${path}/${i}`));
    if (ch === "'" && i > 0 && /[\p{L}]/u.test(value[i - 1] ?? '') && /[\p{L}]/u.test(value[i + 1] ?? '')) {
      errors.push(issue('FR_APOSTROPHE', `${path}/${i}`));
    }
  }
  return errors;
}
export function privateKeyIssues(value, path = '', seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object') return [];
  if (depth > 24) return [issue('DEPTH_LIMIT', path || '/')];
  if (seen.has(value)) return [issue('CYCLE', path || '/')];
  seen.add(value);
  const errors = [];
  const pairs = Array.isArray(value) ? value.map((item, idx) => [String(idx), item]) : Object.entries(value);
  for (const [key, child] of pairs) {
    const where = `${path}/${escaped(key)}`;
    const simplified = key.toLowerCase().replace(/[-_]/g, '');
    if (HIDDEN.has(simplified) || RESERVED.has(key)) errors.push(issue('PRIVATE_FIELD', where));
    else errors.push(...privateKeyIssues(child, where, seen, depth + 1));
  }
  seen.delete(value);
  return errors;
}
export function exactDay(value) { return isValidDate(value); }
export function isKnownTier(value) { return TIERS.has(value); }
export function assetIssues(asset, path = '/asset', options = {}) {
  if (!plainObject(asset)) return [issue('ASSET_OBJECT', path)];
  const errors = [];
  for (const key of Object.keys(asset)) if (!ASSET_FIELDS.has(key)) errors.push(issue('ASSET_EXTRA', `${path}/${escaped(key)}`));
  if (!safeIdentifier(asset.id)) errors.push(issue('ASSET_ID', `${path}/id`));
  if (!safeAssetPath(asset.path)) errors.push(issue('ASSET_PATH', `${path}/path`));
  if (!KINDS.has(asset.kind)) errors.push(issue('ASSET_KIND', `${path}/kind`));
  if (!GROUPS.has(asset.group)) errors.push(issue('ASSET_GROUP', `${path}/group`));
  if (!LOCALES.has(asset.locale)) errors.push(issue('ASSET_LOCALE', `${path}/locale`));
  if (!STATES.has(asset.state)) errors.push(issue('ASSET_STATE', `${path}/state`));
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 0 || asset.bytes > PRECACHE_MAX_ASSET_BYTES) {
    errors.push(issue('ASSET_BYTES', `${path}/bytes`));
  }
  if (typeof asset.sha256 !== 'string' || !HEX.test(asset.sha256)) errors.push(issue('ASSET_HASH', `${path}/sha256`));
  if (!safeSourceUrl(asset.source)) errors.push(issue('ASSET_SOURCE', `${path}/source`));
  if (!isOpenLicence(asset.licence)) errors.push(issue('ASSET_LICENCE', `${path}/licence`));
  if (!exactDay(asset.retrievedOn) || exactDay(options.today) && asset.retrievedOn > options.today) {
    errors.push(issue('ASSET_DATE', `${path}/retrievedOn`));
  }
  if (!isKnownTier(asset.tier)) errors.push(issue('ASSET_TIER', `${path}/tier`));
  if (!safeLabel(asset.label)) errors.push(issue('ASSET_LABEL', `${path}/label`));
  else errors.push(...frenchCopyIssues(asset.label.fr, `${path}/label/fr`));
  if (!Array.isArray(asset.dependsOn) || asset.dependsOn.length > PRECACHE_MAX_REFERENCES ||
      asset.dependsOn.some(id => !safeIdentifier(id))) errors.push(issue('ASSET_DEPENDENCIES', `${path}/dependsOn`));
  if (asset.group === 'offline-pack' && Number.isSafeInteger(asset.bytes) && asset.bytes > PRECACHE_CHUNK_LIMIT) {
    errors.push(issue('OFFLINE_CHUNK_LIMIT', `${path}/bytes`));
  }
  return errors;
}
export function inspectPrecache(input, options = {}) {
  if (!plainObject(input)) return { ok: false, errors: [issue('DOCUMENT_OBJECT', '/')], assets: [] };
  if (input.version !== PRECACHE_CONTRACT_VERSION || !safeIdentifier(input.releaseId) ||
      !exactDay(input.retrievedOn) || !Array.isArray(input.assets)) {
    return { ok: false, errors: [issue('DOCUMENT_SHAPE', '/')], assets: [] };
  }
  if (input.assets.length > PRECACHE_MAX_ITEMS) {
    return { ok: false, errors: [issue('DOCUMENT_ITEM_LIMIT', '/assets')], assets: [] };
  }
  const errors = privateKeyIssues(input);
  for (const key of Object.keys(input)) if (!CONTRACT_FIELDS.has(key)) errors.push(issue('DOCUMENT_EXTRA', `/${escaped(key)}`));
  const ids = new Set();
  const paths = new Set();
  for (const [idx, asset] of input.assets.entries()) {
    errors.push(...assetIssues(asset, `/assets/${idx}`, options));
    if (plainObject(asset) && safeIdentifier(asset.id)) {
      if (ids.has(asset.id)) errors.push(issue('DUPLICATE_ID', `/assets/${idx}/id`));
      ids.add(asset.id);
    }
    if (plainObject(asset) && safeAssetPath(asset.path)) {
      if (paths.has(asset.path)) errors.push(issue('DUPLICATE_PATH', `/assets/${idx}/path`));
      paths.add(asset.path);
    }
  }
  const byId = new Map(input.assets.filter(a => plainObject(a) && safeIdentifier(a.id)).map(a => [a.id, a]));
  for (const [idx, asset] of input.assets.entries()) {
    if (!plainObject(asset) || !Array.isArray(asset.dependsOn) || asset.dependsOn.length > PRECACHE_MAX_REFERENCES) continue;
    const local = new Set();
    for (const [refIndex, id] of asset.dependsOn.entries()) {
      if (local.has(id)) errors.push(issue('DUPLICATE_REFERENCE', `/assets/${idx}/dependsOn/${refIndex}`));
      local.add(id);
      if (id === asset.id) errors.push(issue('SELF_REFERENCE', `/assets/${idx}/dependsOn/${refIndex}`));
      else if (!byId.has(id)) errors.push(issue('MISSING_REFERENCE', `/assets/${idx}/dependsOn/${refIndex}`));
    }
  }
  // The graph walker is iterative, so a long source list cannot overflow the call stack.
  const colour = new Map();
  for (const id of byId.keys()) {
    if (colour.has(id)) continue;
    const stack = [{ id, offset: 0 }];
    colour.set(id, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const refs = byId.get(frame.id)?.dependsOn ?? [];
      if (!Array.isArray(refs) || refs.length > PRECACHE_MAX_REFERENCES) { colour.set(frame.id, 2); stack.pop(); continue; }
      if (frame.offset >= refs.length) { colour.set(frame.id, 2); stack.pop(); continue; }
      const ref = refs[frame.offset++];
      if (!byId.has(ref)) continue;
      if (colour.get(ref) === 1) errors.push(issue('REFERENCE_CYCLE', `/assets/${frame.id}/dependsOn`));
      else if (!colour.has(ref)) { colour.set(ref, 1); stack.push({ id: ref, offset: 0 }); }
    }
  }
  return { ok: errors.length === 0, errors, assets: errors.length ? [] : input.assets };
}
export function parsePrecache(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > PRECACHE_MAX_DOCUMENT_BYTES) {
    return { ok: false, errors: [issue('INPUT_LIMIT', '/')], assets: [] };
  }
  try { return inspectPrecache(JSON.parse(text), options); }
  catch { return { ok: false, errors: [issue('INPUT_JSON', '/')], assets: [] }; }
}
export function canonicalPrecache(input, options = {}) {
  const check = inspectPrecache(input, options);
  if (!check.ok) return { ok: false, errors: check.errors, text: null };
  const sorted = [...input.assets].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const assets = sorted.map(asset => ({
    id: asset.id, path: asset.path, kind: asset.kind, group: asset.group,
    locale: asset.locale, state: asset.state, bytes: asset.bytes,
    sha256: asset.sha256, source: asset.source, licence: asset.licence,
    retrievedOn: asset.retrievedOn, tier: asset.tier,
    dependsOn: [...asset.dependsOn].sort(), label: { en: asset.label.en, fr: asset.label.fr },
  }));
  return { ok: true, errors: [], text: JSON.stringify({ version: PRECACHE_CONTRACT_VERSION,
    releaseId: input.releaseId, retrievedOn: input.retrievedOn, assets }) + '\n' };
}
export function precacheFingerprint(input, options = {}) {
  const canonical = canonicalPrecache(input, options);
  if (!canonical.ok) return { ok: false, errors: canonical.errors, hash: null };
  return { ok: true, errors: [], hash: createHash('sha256').update(canonical.text, 'utf8').digest('hex') };
}
