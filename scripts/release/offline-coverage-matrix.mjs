/** On-demand, offline evidence coverage; coverage is not an accessibility determination. */
export const FEATURE_TYPES = Object.freeze(['entrance', 'washroom', 'parking', 'path', 'lift', 'door', 'other']);
export const TIERS = Object.freeze(['unknown', 'self-reported', 'documented', 'field-observed']);
export const STATES = Object.freeze(['unknown', 'reported', 'not-reported']);
export const UNKNOWN = 'UNKNOWN';
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/u;
const MAX_BYTES = 6_000_000;
const MAX_RECORDS = 10000;
const OWN = Object.prototype.hasOwnProperty;
const error = (code, path) => ({ code, path });
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
export function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function validText(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && [...value].every(ch => {
    const n = ch.codePointAt(0);
    return n >= 32 || n === 9 || n === 10 || n === 13;
  });
}
function validateRecord(x, i, today) {
  const p = `records[${i}]`, issues = [];
  if (!object(x)) return { issues: [error('RECORD_OBJECT', p)] };
  const allowed = new Set(['id', 'placeId', 'type', 'label', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'note']);
  for (const key of Object.keys(x)) if (!allowed.has(key)) issues.push(error('UNEXPECTED_FIELD', `${p}.${key}`));
  if (!validText(x.id, 128) || !ID.test(x.id)) issues.push(error('ID', `${p}.id`));
  if (!validText(x.placeId, 128) || !ID.test(x.placeId)) issues.push(error('PLACE_ID', `${p}.placeId`));
  if (!FEATURE_TYPES.includes(x.type)) issues.push(error('TYPE', `${p}.type`));
  if (!validText(x.label, 150)) issues.push(error('LABEL', `${p}.label`));
  if (!STATES.includes(x.status)) issues.push(error('STATUS', `${p}.status`));
  if (!validText(x.source, 500)) issues.push(error('SOURCE', `${p}.source`));
  if (!validText(x.licence, 200)) issues.push(error('LICENCE', `${p}.licence`));
  if (!validDate(x.retrievedOn) || x.retrievedOn > today) issues.push(error('RETRIEVED_ON', `${p}.retrievedOn`));
  if (!TIERS.includes(x.verificationTier)) issues.push(error('TIER', `${p}.verificationTier`));
  if (OWN.call(x, 'note') && !validText(x.note, 1000)) issues.push(error('NOTE', `${p}.note`));
  return { issues, value: issues.length ? null : { id: x.id, placeId: x.placeId, type: x.type, label: x.label, status: x.status, source: x.source, licence: x.licence, retrievedOn: x.retrievedOn, verificationTier: x.verificationTier, ...(x.note === undefined ? {} : { note: x.note }) } };
}
export function parseInventory(text, { today } = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) return { ok: false, issues: [error('SIZE', '$')] };
  if (!validDate(today)) return { ok: false, issues: [error('TODAY', '$')] };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, issues: [error('JSON', '$')] }; }
  if (!object(data)) return { ok: false, issues: [error('ROOT', '$')] };
  const issues = [], allowed = new Set(['schemaVersion', 'records']);
  for (const key of Object.keys(data)) if (!allowed.has(key)) issues.push(error('UNEXPECTED_FIELD', key));
  if (data.schemaVersion !== 1) issues.push(error('VERSION', 'schemaVersion'));
  if (!Array.isArray(data.records) || data.records.length > MAX_RECORDS) issues.push(error('RECORDS', 'records'));
  if (issues.length) return { ok: false, issues };
  const records = [], seen = new Set();
  data.records.forEach((x, i) => {
    const res = validateRecord(x, i, today);
    issues.push(...res.issues);
    if (!res.value) return;
    if (seen.has(res.value.id)) issues.push(error('DUPLICATE_ID', `records[${i}].id`));
    seen.add(res.value.id);
    records.push(res.value);
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: { schemaVersion: 1, records }, issues: [] };
}
export function matrix(inventory, { today, staleDays = 365, types = FEATURE_TYPES } = {}) {
  if (!validDate(today) || !Number.isInteger(staleDays) || staleDays < 0 || staleDays > 36500 || !Array.isArray(types) || !types.length || new Set(types).size !== types.length || types.some(t => !FEATURE_TYPES.includes(t))) throw new TypeError('INVALID_MATRIX_OPTIONS');
  const places = new Map();
  for (const rec of inventory.records) {
    if (!places.has(rec.placeId)) places.set(rec.placeId, new Map());
    const m = places.get(rec.placeId);
    if (!m.has(rec.type)) m.set(rec.type, []);
    m.get(rec.type).push(rec);
  }
  const days = (today, prior) => Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${prior}T00:00:00Z`)) / 86400000);
  const rows = [];
  for (const [placeId, features] of [...places].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    for (const type of types) {
      const records = (features.get(type) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
      const unknown = records.length === 0 || records.every(r => r.status === 'unknown');
      const stale = records.filter(r => days(today, r.retrievedOn) > staleDays).map(r => r.id);
      const unknownTier = records.filter(r => r.verificationTier === 'unknown').map(r => r.id);
      // A source is a claim, not a confirmation. No positive accessibility classification is derived.
      rows.push({ placeId, type, state: unknown ? 'unknown' : 'evidence-present', recordCount: records.length, recordIds: records.map(r => r.id), staleIds: stale, unknownTierIds: unknownTier, evidence: records.map(r => ({ id: r.id, status: r.status, source: r.source, licence: r.licence, retrievedOn: r.retrievedOn, verificationTier: r.verificationTier })) });
    }
  }
  const total = rows.length;
  const summary = { places: places.size, cells: total, unknownCells: rows.filter(r => r.state === 'unknown').length, evidencePresentCells: rows.filter(r => r.state === 'evidence-present').length, staleCells: rows.filter(r => r.staleIds.length > 0).length, unknownTierCells: rows.filter(r => r.unknownTierIds.length > 0).length };
  return { schemaVersion: 1, today, staleDays, types: [...types], summary, rows };
}
