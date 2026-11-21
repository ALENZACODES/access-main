/** Schema for user-invoked, offline release-evidence dossiers. Never infers physical accessibility. */
export const MAX_MANIFEST_BYTES = 2_000_000;
export const MAX_ITEMS = 5000;
export const MAX_ASSET_BYTES = 10_000_000;
export const UNKNOWN = 'UNKNOWN';
export const TIERS = Object.freeze(['unknown', 'self-reported', 'documented', 'field-observed']);
export const CATEGORIES = Object.freeze(['entrance', 'washroom', 'parking', 'path', 'lift', 'door', 'other']);
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const ALLOWED = new Set(['schemaVersion', 'items']);
const ITEM_FIELDS = new Set(['id', 'path', 'sha256', 'bytes', 'placeId', 'category', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'note']);
export function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function safeText(value, max = 1000) {
  return typeof value === 'string' && value.length > 0 && value.length <= max &&
    value.trim() === value && [...value].every(c => {
      const n = c.codePointAt(0);
      return n >= 32 && n !== 127 && n !== 0x2028 && n !== 0x2029;
    });
}
export function safeRelativePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 400 || value.startsWith('/') || value.includes('\\')) return false;
  if (!/^[A-Za-z0-9._/-]+$/u.test(value)) return false;
  const parts = value.split('/');
  if (parts.some(x => !x || x === '.' || x === '..' || x.startsWith('.'))) return false;
  return parts.every(x => x.length <= 128);
}
export function issue(code, path) { return Object.freeze({ code, path }); }
export function validateItem(value, index, today) {
  const path = `items[${index}]`;
  if (!isPlain(value)) return { value: null, issues: [issue('ITEM_OBJECT_REQUIRED', path)] };
  const errors = [];
  for (const key of Object.keys(value)) if (!ITEM_FIELDS.has(key)) errors.push(issue('UNRECOGNISED_FIELD', `${path}.${key}`));
  if (!safeText(value.id, 128) || !ID.test(value.id)) errors.push(issue('INVALID_ID', `${path}.id`));
  if (!safeRelativePath(value.path)) errors.push(issue('UNSAFE_PATH', `${path}.path`));
  if (typeof value.sha256 !== 'string' || !HASH.test(value.sha256)) errors.push(issue('INVALID_HASH', `${path}.sha256`));
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > MAX_ASSET_BYTES) errors.push(issue('INVALID_BYTES', `${path}.bytes`));
  if (!safeText(value.placeId, 128) || !ID.test(value.placeId)) errors.push(issue('INVALID_PLACE_ID', `${path}.placeId`));
  if (!CATEGORIES.includes(value.category)) errors.push(issue('INVALID_CATEGORY', `${path}.category`));
  if (!['unknown', 'reported', 'not-reported'].includes(value.status)) errors.push(issue('INVALID_STATUS', `${path}.status`));
  if (!safeText(value.source, 500)) errors.push(issue('SOURCE_REQUIRED', `${path}.source`));
  if (!safeText(value.licence, 200)) errors.push(issue('LICENCE_REQUIRED', `${path}.licence`));
  if (!validDate(value.retrievedOn) || value.retrievedOn > today) errors.push(issue('INVALID_RETRIEVED_ON', `${path}.retrievedOn`));
  if (!TIERS.includes(value.verificationTier)) errors.push(issue('INVALID_TIER', `${path}.verificationTier`));
  if (Object.hasOwn(value, 'note') && !safeText(value.note, 1000)) errors.push(issue('INVALID_NOTE', `${path}.note`));
  if (errors.length) return { value: null, issues: errors };
  return { value: { id: value.id, path: value.path, sha256: value.sha256, bytes: value.bytes,
    placeId: value.placeId, category: value.category, status: value.status,
    source: value.source, licence: value.licence, retrievedOn: value.retrievedOn,
    verificationTier: value.verificationTier, ...(value.note === undefined ? {} : { note: value.note }) }, issues: [] };
}
export function parseDossier(text, { today = '2026-11-20' } = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_MANIFEST_BYTES) return { ok: false, issues: [issue('MANIFEST_TOO_LARGE', '$')] };
  if (!validDate(today)) return { ok: false, issues: [issue('INVALID_TODAY', '$')] };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, issues: [issue('INVALID_JSON', '$')] }; }
  if (!isPlain(data)) return { ok: false, issues: [issue('ROOT_OBJECT_REQUIRED', '$')] };
  const errors = [];
  for (const key of Object.keys(data)) if (!ALLOWED.has(key)) errors.push(issue('UNRECOGNISED_FIELD', key));
  if (data.schemaVersion !== 1) errors.push(issue('INVALID_SCHEMA_VERSION', 'schemaVersion'));
  if (!Array.isArray(data.items) || data.items.length > MAX_ITEMS) errors.push(issue('INVALID_ITEMS', 'items'));
  if (errors.length) return { ok: false, issues: errors };
  const seenIds = new Set(), seenPaths = new Set(), items = [];
  for (let i = 0; i < data.items.length; i++) {
    const result = validateItem(data.items[i], i, today);
    errors.push(...result.issues);
    if (!result.value) continue;
    if (seenIds.has(result.value.id)) errors.push(issue('DUPLICATE_ID', `items[${i}].id`));
    if (seenPaths.has(result.value.path)) errors.push(issue('DUPLICATE_PATH', `items[${i}].path`));
    seenIds.add(result.value.id);
    seenPaths.add(result.value.path);
    items.push(result.value);
  }
  if (errors.length) return { ok: false, issues: errors };
  return { ok: true, issues: [], value: { schemaVersion: 1, items } };
}
export function toDisplay(status) { return status === 'unknown' ? UNKNOWN : status; }
export function exampleDossier(hash, bytes) {
  return { schemaVersion: 1, items: [{ id: 'example-1', path: 'sample.txt', sha256: hash, bytes,
    placeId: 'fictional-location', category: 'entrance', status: 'unknown',
    source: 'Fictional example supplied for testing only', licence: 'CC0-1.0',
    retrievedOn: '2026-11-20', verificationTier: 'unknown' }] };
}
