/** Offline, read-only evidence inventory contract. No network access or inferred site facts. */
export const UNKNOWN = 'UNKNOWN';
export const TIERS = Object.freeze(['unknown', 'self-reported', 'documented', 'field-observed']);
export const MAX_RECORDS = 10000;
export const MAX_STRING = 2000;
export const MAX_BYTES = 6_000_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TYPES = Object.freeze(['entrance', 'washroom', 'parking', 'path', 'lift', 'door', 'other']);
const STATUS = Object.freeze(['unknown', 'reported', 'not-reported']);
const OWN = Object.prototype.hasOwnProperty;
export function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function day(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function string(value, max = MAX_STRING) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && !Array.from(value).some(character => { const code = character.charCodeAt(0); return code <= 31 && code !== 9 && code !== 10 && code !== 13; });
}
export function issue(code, path) { return { code, path }; }
export function validateRecord(value, index, today) {
  const prefix = `records[${index}]`;
  const issues = [];
  if (!plain(value)) return { value: null, issues: [issue('OBJECT_REQUIRED', prefix)] };
  const permitted = new Set(['id', 'placeId', 'type', 'label', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'note']);
  for (const key of Object.keys(value)) if (!permitted.has(key)) issues.push(issue('UNRECOGNISED_FIELD', `${prefix}.${key}`));
  if (!string(value.id, 128) || !ID.test(value.id)) issues.push(issue('INVALID_ID', `${prefix}.id`));
  if (!string(value.placeId, 128) || !ID.test(value.placeId)) issues.push(issue('INVALID_PLACE_ID', `${prefix}.placeId`));
  if (!TYPES.includes(value.type)) issues.push(issue('INVALID_TYPE', `${prefix}.type`));
  if (!string(value.label, 150)) issues.push(issue('INVALID_LABEL', `${prefix}.label`));
  if (!STATUS.includes(value.status)) issues.push(issue('INVALID_STATUS', `${prefix}.status`));
  if (!string(value.source, 500)) issues.push(issue('SOURCE_REQUIRED', `${prefix}.source`));
  if (!string(value.licence, 200)) issues.push(issue('LICENCE_REQUIRED', `${prefix}.licence`));
  if (!day(value.retrievedOn) || value.retrievedOn > today) issues.push(issue('INVALID_RETRIEVAL_DATE', `${prefix}.retrievedOn`));
  if (!TIERS.includes(value.verificationTier)) issues.push(issue('INVALID_VERIFICATION_TIER', `${prefix}.verificationTier`));
  if (OWN.call(value, 'note') && !string(value.note, 1000)) issues.push(issue('INVALID_NOTE', `${prefix}.note`));
  // Unknown must remain unknown, regardless of the evidence tier or text of the note.
  if (issues.length) return { value: null, issues };
  return { value: { id: value.id, placeId: value.placeId, type: value.type, label: value.label, status: value.status, source: value.source, licence: value.licence, retrievedOn: value.retrievedOn, verificationTier: value.verificationTier, ...(value.note === undefined ? {} : { note: value.note }) }, issues: [] };
}
export function parse(text, { today = '2026-11-20' } = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) return { ok: false, issues: [issue('INPUT_TOO_LARGE', '$')] };
  if (!day(today)) return { ok: false, issues: [issue('INVALID_TODAY', '$')] };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, issues: [issue('INVALID_JSON', '$')] }; }
  if (!plain(data)) return { ok: false, issues: [issue('ROOT_OBJECT_REQUIRED', '$')] };
  const issues = [];
  const allowed = new Set(['schemaVersion', 'records']);
  for (const key of Object.keys(data)) if (!allowed.has(key)) issues.push(issue('UNRECOGNISED_FIELD', key));
  if (data.schemaVersion !== 1) issues.push(issue('INVALID_SCHEMA_VERSION', 'schemaVersion'));
  if (!Array.isArray(data.records) || data.records.length > MAX_RECORDS) issues.push(issue('INVALID_RECORDS', 'records'));
  if (issues.length) return { ok: false, issues };
  const seen = new Set(), records = [];
  for (let i = 0; i < data.records.length; i++) {
    const r = validateRecord(data.records[i], i, today);
    issues.push(...r.issues);
    if (!r.value) continue;
    if (seen.has(r.value.id)) issues.push(issue('DUPLICATE_ID', `records[${i}].id`));
    seen.add(r.value.id);
    records.push(r.value);
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { schemaVersion: 1, records }, issues: [] };
}
export function publicExample() {
  return { schemaVersion: 1, records: [{ id: 'example-1', placeId: 'fictional-place', type: 'entrance', label: 'Example entrance', status: 'unknown', source: 'Example only; not a real-place observation', licence: 'CC0-1.0', retrievedOn: '2026-11-20', verificationTier: 'unknown' }] };
}
