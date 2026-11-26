import { Buffer } from 'node:buffer';
/** Strict manifest contract for manually supplied release dependency inventories. */
export const UNKNOWN = 'UNKNOWN';
export const MAX_INPUT_BYTES = 2_097_152;
export const MAX_ASSETS = 4096;
export const MAX_EDGES = 32768;
export const KINDS = Object.freeze(['html', 'script', 'style', 'image', 'font', 'data', 'worker', 'other']);
export const TIERS = Object.freeze(['UNKNOWN', 'source-documented', 'operator-reported', 'reviewed-record']);
export const LOCALES = Object.freeze(['en', 'fr', 'both', 'none']);
const SHA = /^[0-9a-f]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const ROOT_KEYS = Object.freeze(['version', 'createdOn', 'assets']);
const ASSET_KEYS = Object.freeze(['id', 'path', 'sha256', 'bytes', 'kind', 'locale', 'entry', 'dependsOn', 'source', 'licence', 'retrievedOn', 'tier']);
const MAX_SIZE = 50 * 1024 * 1024;
const issue = (code, path, detail = '') => ({ code, path, detail });
export const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export function dateValid(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const stamp = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === value;
}
export function cleanText(value, limit = 512) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= limit &&
    [...value].every(char => {
      const point = char.codePointAt(0);
      return point >= 32 && point !== 127 && point !== 0x2028 && point !== 0x2029;
    });
}
export function safePath(value) {
  if (!cleanText(value, 256) || value.includes('\\') || value.includes('?') || value.includes('#') || value.includes('%')) return false;
  if (value.startsWith('/') || value.startsWith('.') || value.includes('//') || value.includes(':')) return false;
  const segments = value.split('/');
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..' &&
    /^[a-zA-Z0-9_@][a-zA-Z0-9._@+()-]*$/u.test(segment));
}
export function safeId(value) { return typeof value === 'string' && ID.test(value); }
export function fields(value, allowed, path, issues) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(issue('UNKNOWN_FIELD', `${path}.${key}`));
}
export function checkAsset(value, path = '$.assets[0]', today = '9999-12-31') {
  const issues = [];
  if (!isPlain(value)) return [issue('ASSET_OBJECT_REQUIRED', path)];
  fields(value, ASSET_KEYS, path, issues);
  if (!safeId(value.id)) issues.push(issue('INVALID_ID', `${path}.id`));
  if (!safePath(value.path)) issues.push(issue('INVALID_PATH', `${path}.path`));
  if (typeof value.sha256 !== 'string' || !SHA.test(value.sha256)) issues.push(issue('INVALID_SHA256', `${path}.sha256`));
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > MAX_SIZE) issues.push(issue('INVALID_BYTES', `${path}.bytes`));
  if (!KINDS.includes(value.kind)) issues.push(issue('INVALID_KIND', `${path}.kind`));
  if (!LOCALES.includes(value.locale)) issues.push(issue('INVALID_LOCALE', `${path}.locale`));
  if (typeof value.entry !== 'boolean') issues.push(issue('INVALID_ENTRY', `${path}.entry`));
  if (!Array.isArray(value.dependsOn)) issues.push(issue('DEPENDENCIES_REQUIRED', `${path}.dependsOn`));
  else {
    if (value.dependsOn.length > MAX_ASSETS) issues.push(issue('TOO_MANY_DEPENDENCIES', `${path}.dependsOn`));
    const seen = new Set();
    for (let i = 0; i < value.dependsOn.length; i += 1) {
      const dep = value.dependsOn[i];
      if (!safeId(dep)) issues.push(issue('INVALID_DEPENDENCY', `${path}.dependsOn[${i}]`));
      else if (seen.has(dep)) issues.push(issue('DUPLICATE_DEPENDENCY', `${path}.dependsOn[${i}]`));
      else seen.add(dep);
    }
    if (safeId(value.id) && seen.has(value.id)) issues.push(issue('SELF_DEPENDENCY', `${path}.dependsOn`));
  }
  if (!cleanText(value.source, 512)) issues.push(issue('SOURCE_REQUIRED', `${path}.source`));
  if (!cleanText(value.licence, 120)) issues.push(issue('LICENCE_REQUIRED', `${path}.licence`));
  if (!dateValid(value.retrievedOn)) issues.push(issue('INVALID_RETRIEVAL_DATE', `${path}.retrievedOn`));
  else if (value.retrievedOn > today) issues.push(issue('FUTURE_RETRIEVAL_DATE', `${path}.retrievedOn`));
  if (!TIERS.includes(value.tier)) issues.push(issue('INVALID_TIER', `${path}.tier`));
  if (value.entry && !['html', 'script', 'worker'].includes(value.kind)) issues.push(issue('ENTRY_KIND_MISMATCH', `${path}.entry`));
  return issues;
}
export function checkManifest(value, { today = '9999-12-31' } = {}) {
  const issues = [];
  if (!isPlain(value)) return { ok: false, issues: [issue('MANIFEST_OBJECT_REQUIRED', '$')] };
  fields(value, ROOT_KEYS, '$', issues);
  if (value.version !== 1) issues.push(issue('VERSION_UNSUPPORTED', '$.version'));
  if (!dateValid(value.createdOn)) issues.push(issue('INVALID_CREATED_ON', '$.createdOn'));
  else if (value.createdOn > today) issues.push(issue('FUTURE_CREATED_ON', '$.createdOn'));
  if (!Array.isArray(value.assets)) issues.push(issue('ASSETS_REQUIRED', '$.assets'));
  else {
    if (value.assets.length > MAX_ASSETS) issues.push(issue('ASSET_CAP_EXCEEDED', '$.assets'));
    const seenIds = new Set();
    const seenPaths = new Set();
    let edges = 0;
    for (let i = 0; i < Math.min(value.assets.length, MAX_ASSETS + 1); i += 1) {
      const asset = value.assets[i];
      issues.push(...checkAsset(asset, `$.assets[${i}]`, today));
      if (!isPlain(asset)) continue;
      if (safeId(asset.id)) {
        if (seenIds.has(asset.id)) issues.push(issue('DUPLICATE_ID', `$.assets[${i}].id`));
        seenIds.add(asset.id);
      }
      if (safePath(asset.path)) {
        if (seenPaths.has(asset.path)) issues.push(issue('DUPLICATE_PATH', `$.assets[${i}].path`));
        seenPaths.add(asset.path);
      }
      if (Array.isArray(asset.dependsOn)) edges += asset.dependsOn.length;
    }
    if (edges > MAX_EDGES) issues.push(issue('EDGE_CAP_EXCEEDED', '$.assets'));
    for (let i = 0; i < Math.min(value.assets.length, MAX_ASSETS + 1); i += 1) {
      const asset = value.assets[i];
      if (!isPlain(asset) || !Array.isArray(asset.dependsOn)) continue;
      for (const dep of asset.dependsOn) if (safeId(dep) && !seenIds.has(dep)) issues.push(issue('UNRESOLVED_DEPENDENCY', `$.assets[${i}].dependsOn`, dep));
    }
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: {
    version: 1, createdOn: value.createdOn,
    assets: [...value.assets].map(asset => ({ ...asset, dependsOn: [...asset.dependsOn] })).sort((a, b) => a.id.localeCompare(b.id)),
  }, issues: [] };
}
export function parseManifest(raw, options = {}) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_INPUT_BYTES) return { ok: false, issues: [issue('INPUT_SIZE_INVALID', '$')] };
  try { return checkManifest(JSON.parse(raw), options); }
  catch { return { ok: false, issues: [issue('JSON_INVALID', '$')] }; }
}
export function formatIssues(issues) {
  return [...issues].sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
}
