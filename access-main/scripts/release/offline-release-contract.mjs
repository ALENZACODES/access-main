import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
/** Offline release evidence contract. Pure checks; never verifies a physical place. */
import { createHash } from 'node:crypto';
import { isOpenLicence, isValidDate } from '../../../scripts/release/site-audit.mjs';

export const CONTRACT_VERSION = 1;
export const CLAIM_VALUES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const EVIDENCE_TIERS = Object.freeze([0, 1, 2, 3, 4, 'E']);
export const MAX_ITEMS = 20000;
export const MAX_STRING = 4096;
export const MAX_REFERENCES = 64;
export const MAX_DEPTH = 32;
export const MAX_INPUT_BYTES = 8_000_000;
export const CLAIM_FIELDS = Object.freeze([
  'stepFreeEntrance', 'accessibleEntrance', 'accessibleParking',
  'accessibleWashroom', 'accessibleWashrooms', 'accessibleToilet',
  'liftAvailable', 'elevator', 'ramp', 'automaticDoor', 'stepFree',
  'accessibleSeating', 'doorWidth', 'turningSpace', 'clearWidth',
  'transferSpace', 'threshold', 'accessibleRoute',
]);
export const RESOURCE_KINDS = Object.freeze([
  'html', 'script', 'style', 'image', 'font', 'manifest', 'json',
  'translation', 'service-worker', 'offline-document', 'other',
]);
export const RESOURCE_POLICIES = Object.freeze(['precache', 'runtime-local', 'not-cached']);
export const ENTRY_STATES = Object.freeze(['included', 'omitted', 'withdrawn']);
export const REVIEW_STATES = Object.freeze(['pending', 'reviewed', 'blocked']);
const CLAIM_SET = new Set(CLAIM_VALUES);
const TIER_SET = new Set(EVIDENCE_TIERS);
const FIELD_SET = new Set(CLAIM_FIELDS);
const KIND_SET = new Set(RESOURCE_KINDS);
const CACHE_SET = new Set(RESOURCE_POLICIES);
const ENTRY_SET = new Set(ENTRY_STATES);
const REVIEW_SET = new Set(REVIEW_STATES);
const PRIVATE = new Set([
  'password', 'secret', 'token', 'apikey', 'accesstoken',
  'healthcard', 'ohip', 'diagnosis', 'medications', 'medication',
  'prescription', 'email', 'emailaddress', 'phonenumber', 'phone',
  'birthdate', 'personname', 'locationhistory', 'gps', 'cookie',
  'session', 'socialinsurancenumber',
]);
const UNSAFE_PROPERTIES = new Set(['__proto__', 'prototype', 'constructor']);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const HEX = /^[0-9a-f]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TEXT_KEYS = new Set(['en', 'fr']);
const SOURCE_KEYS = new Set(['id', 'title', 'url', 'licence', 'retrievedOn', 'tier', 'sourceDate', 'review']);
const ASSET_KEYS = new Set(['id', 'path', 'kind', 'size', 'sha256', 'cache', 'state', 'dependsOn', 'label']);
const CLAIM_KEYS = new Set(['id', 'recordId', 'field', 'state', 'sourceIds', 'label', 'observationOn']);
const RELEASE_KEYS = new Set(['version', 'releaseId', 'createdOn', 'sources', 'assets', 'claims', 'locale', 'notice']);
const LOCALE_KEYS = new Set(['en', 'fr']);

export function problem(code, path, detail = '') {
  return { code, path, detail };
}
export function pointer(segment) {
  return String(segment).replace(/~/gu, '~0').replace(/\//gu, '~1');
}
export function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
export function safeIdentifier(value) {
  return typeof value === 'string' && ID.test(value) && !UNSAFE_PROPERTIES.has(value.toLowerCase());
}
export function safeText(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING &&
    value.trim().length > 0 && ![...value].some((character) => {
      const code = character.codePointAt(0);
      return code < 32 && code !== 10 || code === 127;
    });
}
export function validDay(value) {
  if (typeof value !== 'string' || !DATE.test(value) || !isValidDate(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1 && year <= 9999;
}
export function safeHttpsUrl(value) {
  if (!safeText(value) || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    if (url.hash || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) return false;
    if (url.hostname === '[::1]' || /^127\./u.test(url.hostname) || /^0\./u.test(url.hostname)) return false;
    return ![...value].some((character) => character.codePointAt(0) < 32);
  } catch {
    return false;
  }
}
export function safeAssetPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return false;
  if (value.startsWith('/') || value.startsWith('.') || value.includes('\\') || value.includes('?') || value.includes('#')) return false;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) return false;
  const parts = value.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..' &&
    ![...part].some((character) => character.codePointAt(0) < 32 || character === '%'));
}
export function frenchTextIssues(value, path) {
  if (!safeText(value)) return [problem('TEXT_REQUIRED', path)];
  const issues = [];
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const previous = value[index - 1];
    const next = value[index + 1];
    if (current === ':' && previous !== '\u00A0') issues.push(problem('FR_COLON_NBSP', `${path}/${index}`));
    if (';!?'.includes(current) && previous !== '\u202F') issues.push(problem('FR_NARROW_SPACE', `${path}/${index}`));
    if (current === '«' && next !== '\u202F') issues.push(problem('FR_GUILLEMET', `${path}/${index}`));
    if (current === '»' && previous !== '\u202F') issues.push(problem('FR_GUILLEMET', `${path}/${index}`));
    if (current === "'" && /[a-zA-ZÀ-ÿ]/u.test(previous ?? '') && /[a-zA-ZÀ-ÿ]/u.test(next ?? '')) {
      issues.push(problem('FR_APOSTROPHE', `${path}/${index}`));
    }
  }
  return issues;
}
export function textPairIssues(value, path) {
  if (!plainObject(value)) return [problem('TEXT_PAIR_REQUIRED', path)];
  const issues = [];
  for (const key of Object.keys(value)) {
    if (!TEXT_KEYS.has(key)) issues.push(problem('TEXT_KEY_UNEXPECTED', `${path}/${pointer(key)}`));
  }
  if (!safeText(value.en)) issues.push(problem('TEXT_EN_REQUIRED', `${path}/en`));
  issues.push(...frenchTextIssues(value.fr, `${path}/fr`));
  return issues;
}
export function privatePaths(value, path = '', seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object') return [];
  if (depth > MAX_DEPTH) return [problem('DEPTH_LIMIT', path || '/')];
  if (seen.has(value)) return [problem('CYCLIC_INPUT', path || '/')];
  seen.add(value);
  const problems = [];
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}/${pointer(key)}`;
    const normal = key.toLowerCase().replace(/[-_]/gu, '');
    if (PRIVATE.has(normal) || UNSAFE_PROPERTIES.has(key)) problems.push(problem('PRIVATE_FIELD', next));
    else problems.push(...privatePaths(child, next, seen, depth + 1));
  }
  seen.delete(value);
  return problems;
}
export function unknownKeys(value, allowed, path) {
  if (!plainObject(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key))
    .map((key) => problem('UNEXPECTED_FIELD', `${path}/${pointer(key)}`));
}
export function sourceIssues(source, path, today) {
  if (!plainObject(source)) return [problem('SOURCE_OBJECT', path)];
  const issues = unknownKeys(source, SOURCE_KEYS, path);
  if (!safeIdentifier(source.id)) issues.push(problem('SOURCE_ID', `${path}/id`));
  if (!safeText(source.title)) issues.push(problem('SOURCE_TITLE', `${path}/title`));
  if (!safeHttpsUrl(source.url)) issues.push(problem('SOURCE_URL', `${path}/url`));
  if (!isOpenLicence(source.licence)) issues.push(problem('SOURCE_LICENCE', `${path}/licence`));
  if (!validDay(source.retrievedOn)) issues.push(problem('SOURCE_RETRIEVED', `${path}/retrievedOn`));
  if (validDay(today) && validDay(source.retrievedOn) && source.retrievedOn > today) {
    issues.push(problem('SOURCE_FUTURE', `${path}/retrievedOn`));
  }
  if (!TIER_SET.has(source.tier)) issues.push(problem('SOURCE_TIER', `${path}/tier`));
  if (source.sourceDate !== undefined && !validDay(source.sourceDate)) {
    issues.push(problem('SOURCE_DATE', `${path}/sourceDate`));
  }
  if (validDay(source.sourceDate) && validDay(source.retrievedOn) && source.sourceDate > source.retrievedOn) {
    issues.push(problem('SOURCE_DATE_ORDER', `${path}/sourceDate`));
  }
  if (source.review !== undefined && !REVIEW_SET.has(source.review)) {
    issues.push(problem('SOURCE_REVIEW', `${path}/review`));
  }
  return issues;
}
export function assetIssues(asset, path) {
  if (!plainObject(asset)) return [problem('ASSET_OBJECT', path)];
  const issues = unknownKeys(asset, ASSET_KEYS, path);
  if (!safeIdentifier(asset.id)) issues.push(problem('ASSET_ID', `${path}/id`));
  if (!safeAssetPath(asset.path)) issues.push(problem('ASSET_PATH', `${path}/path`));
  if (!KIND_SET.has(asset.kind)) issues.push(problem('ASSET_KIND', `${path}/kind`));
  if (!Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > 50_000_000) {
    issues.push(problem('ASSET_SIZE', `${path}/size`));
  }
  if (typeof asset.sha256 !== 'string' || !HEX.test(asset.sha256)) {
    issues.push(problem('ASSET_DIGEST', `${path}/sha256`));
  }
  if (!CACHE_SET.has(asset.cache)) issues.push(problem('ASSET_CACHE', `${path}/cache`));
  if (!ENTRY_SET.has(asset.state)) issues.push(problem('ASSET_STATE', `${path}/state`));
  if (asset.label !== undefined) issues.push(...textPairIssues(asset.label, `${path}/label`));
  if (!Array.isArray(asset.dependsOn) || asset.dependsOn.length > MAX_REFERENCES ||
      asset.dependsOn.some((value) => !safeIdentifier(value))) {
    issues.push(problem('ASSET_DEPENDENCIES', `${path}/dependsOn`));
  }
  if (Array.isArray(asset.dependsOn) && new Set(asset.dependsOn).size !== asset.dependsOn.length) {
    issues.push(problem('ASSET_DUPLICATE_DEPENDENCY', `${path}/dependsOn`));
  }
  return issues;
}
export function claimIssues(claim, path) {
  if (!plainObject(claim)) return [problem('CLAIM_OBJECT', path)];
  const issues = unknownKeys(claim, CLAIM_KEYS, path);
  if (!safeIdentifier(claim.id)) issues.push(problem('CLAIM_ID', `${path}/id`));
  if (!safeIdentifier(claim.recordId)) issues.push(problem('CLAIM_RECORD', `${path}/recordId`));
  if (!FIELD_SET.has(claim.field)) issues.push(problem('CLAIM_FIELD', `${path}/field`));
  if (!CLAIM_SET.has(claim.state)) issues.push(problem('CLAIM_STATE', `${path}/state`));
  if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length > MAX_REFERENCES ||
      claim.sourceIds.some((value) => !safeIdentifier(value))) {
    issues.push(problem('CLAIM_SOURCES', `${path}/sourceIds`));
  }
  if (Array.isArray(claim.sourceIds) && new Set(claim.sourceIds).size !== claim.sourceIds.length) {
    issues.push(problem('CLAIM_DUPLICATE_SOURCE', `${path}/sourceIds`));
  }
  if (claim.label !== undefined) issues.push(...textPairIssues(claim.label, `${path}/label`));
  if (claim.observationOn !== undefined && !validDay(claim.observationOn)) {
    issues.push(problem('CLAIM_OBSERVATION_DATE', `${path}/observationOn`));
  }
  return issues;
}
export function assetCycles(assets) {
  const graph = new Map(assets.map((asset) => [asset.id, asset.dependsOn]));
  const visiting = new Set();
  const visited = new Set();
  const errors = [];
  function visit(id, trail) {
    if (visiting.has(id)) {
      errors.push(problem('ASSET_DEPENDENCY_CYCLE', `/assets/${pointer(id)}`, [...trail, id].join(' > ')));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) if (graph.has(dependency)) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) visit(id, []);
  return errors;
}
export function releaseIssues(document, options = {}) {
  const issues = privatePaths(document);
  if (!plainObject(document)) return [...issues, problem('RELEASE_OBJECT', '/')];
  issues.push(...unknownKeys(document, RELEASE_KEYS, ''));
  if (document.version !== CONTRACT_VERSION) issues.push(problem('RELEASE_VERSION', '/version'));
  if (!safeIdentifier(document.releaseId)) issues.push(problem('RELEASE_ID', '/releaseId'));
  if (!validDay(document.createdOn)) issues.push(problem('RELEASE_DATE', '/createdOn'));
  if (validDay(options.today) && validDay(document.createdOn) && document.createdOn > options.today) {
    issues.push(problem('RELEASE_FUTURE', '/createdOn'));
  }
  if (!plainObject(document.locale) || Object.keys(document.locale).some((key) => !LOCALE_KEYS.has(key)) ||
      document.locale.en !== true || document.locale.fr !== true) {
    issues.push(problem('RELEASE_LOCALES', '/locale'));
  }
  issues.push(...textPairIssues(document.notice, '/notice'));
  const arrays = [['sources', sourceIssues], ['assets', assetIssues], ['claims', claimIssues]];
  for (const [name, validator] of arrays) {
    const list = document[name];
    if (!Array.isArray(list) || list.length > MAX_ITEMS) {
      issues.push(problem('RELEASE_LIST', `/${name}`));
      continue;
    }
    const ids = new Set();
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      issues.push(...validator(item, `/${name}/${index}`, options.today));
      if (safeIdentifier(item?.id)) {
        if (ids.has(item.id)) issues.push(problem('DUPLICATE_ID', `/${name}/${index}/id`));
        ids.add(item.id);
      }
    }
  }
  const sources = new Map((Array.isArray(document.sources) ? document.sources : [])
    .filter((source) => safeIdentifier(source?.id)).map((source) => [source.id, source]));
  const assets = new Map((Array.isArray(document.assets) ? document.assets : [])
    .filter((asset) => safeIdentifier(asset?.id)).map((asset) => [asset.id, asset]));
  for (const [index, claim] of (Array.isArray(document.claims) ? document.claims : []).entries()) {
    if (!plainObject(claim) || !Array.isArray(claim.sourceIds)) continue;
    for (const id of claim.sourceIds) {
      if (!sources.has(id)) issues.push(problem('CLAIM_MISSING_SOURCE', `/claims/${index}/sourceIds`, String(id)));
    }
    if (claim.state !== 'UNKNOWN' && claim.sourceIds.length === 0) {
      issues.push(problem('CLAIM_UNSOURCED', `/claims/${index}/sourceIds`));
    }
    if (claim.state !== 'UNKNOWN' && claim.sourceIds.some((id) => sources.get(id)?.review === 'blocked')) {
      issues.push(problem('CLAIM_BLOCKED_SOURCE', `/claims/${index}/sourceIds`));
    }
    if (validDay(claim.observationOn) && claim.sourceIds.some((id) =>
      validDay(sources.get(id)?.retrievedOn) && claim.observationOn > sources.get(id).retrievedOn)) {
      issues.push(problem('CLAIM_AFTER_RETRIEVAL', `/claims/${index}/observationOn`));
    }
  }
  for (const [index, asset] of (Array.isArray(document.assets) ? document.assets : []).entries()) {
    if (!plainObject(asset) || !Array.isArray(asset.dependsOn)) continue;
    for (const id of asset.dependsOn) {
      if (!assets.has(id)) issues.push(problem('ASSET_MISSING_DEPENDENCY', `/assets/${index}/dependsOn`, String(id)));
      else if (asset.state === 'included' && assets.get(id)?.state !== 'included') {
        issues.push(problem('ASSET_DEPENDENCY_UNAVAILABLE', `/assets/${index}/dependsOn`, String(id)));
      }
    }
  }
  const cleanAssets = Array.isArray(document.assets) ? document.assets.filter((asset) =>
    plainObject(asset) && safeIdentifier(asset.id) && Array.isArray(asset.dependsOn)) : [];
  issues.push(...assetCycles(cleanAssets));
  if (Array.isArray(document.assets)) {
    const paths = new Set();
    for (const [index, asset] of document.assets.entries()) {
      if (!safeAssetPath(asset?.path)) continue;
      if (paths.has(asset.path)) issues.push(problem('ASSET_DUPLICATE_PATH', `/assets/${index}/path`));
      paths.add(asset.path);
    }
  }
  const maximum = Number.isSafeInteger(options.maxIssues) && options.maxIssues > 0
    ? Math.min(options.maxIssues, 1000) : 1000;
  return issues.slice(0, maximum);
}
export function inspectRelease(document, options = {}) {
  const issues = releaseIssues(document, options);
  const ok = issues.length === 0;
  return { ok, issues, release: ok ? document : null, summary: ok ? releaseSummary(document) : null };
}
export function releaseSummary(document) {
  const states = Object.fromEntries(CLAIM_VALUES.map((state) => [state, 0]));
  const caches = Object.fromEntries(RESOURCE_POLICIES.map((state) => [state, 0]));
  const kinds = Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, 0]));
  const entries = Object.fromEntries(ENTRY_STATES.map((state) => [state, 0]));
  for (const claim of document.claims) states[claim.state] += 1;
  for (const asset of document.assets) {
    caches[asset.cache] += 1;
    kinds[asset.kind] += 1;
    entries[asset.state] += 1;
  }
  const totalBytes = document.assets.filter((asset) => asset.state === 'included')
    .reduce((sum, asset) => sum + asset.size, 0);
  return { sources: document.sources.length, assets: document.assets.length,
    claims: document.claims.length, states, caches, kinds, entries, totalBytes };
}
export function canonicalRelease(document) {
  return {
    version: document.version,
    releaseId: document.releaseId,
    createdOn: document.createdOn,
    locale: { en: true, fr: true },
    notice: { en: document.notice.en, fr: document.notice.fr },
    sources: [...document.sources].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    assets: [...document.assets].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    claims: [...document.claims].sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
}
export function fingerprintRelease(document, options = {}) {
  const check = inspectRelease(document, options);
  if (!check.ok) return { ok: false, fingerprint: null, issues: check.issues };
  const body = JSON.stringify(canonicalRelease(document));
  if (Buffer.byteLength(body, 'utf8') > MAX_INPUT_BYTES) {
    return { ok: false, fingerprint: null, issues: [problem('FINGERPRINT_LIMIT', '/')] };
  }
  return { ok: true, issues: [], fingerprint: `sha256:${createHash('sha256').update(body).digest('hex')}` };
}
export function parseRelease(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) {
    return { ok: false, issues: [problem('INPUT_LIMIT', '/')], release: null, summary: null };
  }
  try {
    return inspectRelease(JSON.parse(text), options);
  } catch {
    return { ok: false, issues: [problem('INVALID_JSON', '/')], release: null, summary: null };
  }
}
export function serializeRelease(document, options = {}) {
  const check = inspectRelease(document, options);
  return check.ok ? { ok: true, issues: [], text: JSON.stringify(canonicalRelease(document), null, 2) + '\n' } :
    { ok: false, issues: check.issues, text: null };
}
