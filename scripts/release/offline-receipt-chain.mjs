/** Offline audit receipt chain: deterministic, fail-closed verification of handoffs. */
import { createHash, timingSafeEqual } from 'node:crypto';

export const UNKNOWN = 'UNKNOWN';
export const MAX_BYTES = 6_000_000;
export const MAX_RECEIPTS = 5000;
const HEX = /^[a-f0-9]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CATEGORIES = new Set(['inventory', 'change', 'review', 'handoff']);
const TIERS = new Set(['unknown', 'self-reported', 'documented', 'field-observed']);
const STATES = new Set(['unknown', 'reported', 'not-reported']);
const FIELDS = ['id', 'kind', 'placeId', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'previous', 'payloadHash', 'note'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const fail = (code, path) => ({ code, path });

export function validDay(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function cleanText(value, max = 500) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && ![...value].some(char => {
    const code = char.codePointAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
}
export function stable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  throw new TypeError('UNSUPPORTED_CANONICAL_VALUE');
}
export const digest = value => createHash('sha256').update(stable(value), 'utf8').digest('hex');
export function sameHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !HEX.test(left) || !HEX.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
export function receiptBody(receipt) {
  return Object.fromEntries(FIELDS.map(k => [k, receipt[k] ?? null]));
}
export const receiptHash = receipt => digest(receiptBody(receipt));

export function validateReceipt(input, index, today) {
  const path = `receipts[${index}]`, issues = [];
  if (!object(input)) return { issues: [fail('OBJECT_REQUIRED', path)], value: null };
  for (const key of Object.keys(input)) if (![...FIELDS, 'hash'].includes(key)) issues.push(fail('UNRECOGNISED_FIELD', `${path}.${key}`));
  for (const name of ['id', 'placeId']) if (!cleanText(input[name], 128) || !KEY.test(input[name])) issues.push(fail('INVALID_ID', `${path}.${name}`));
  if (!CATEGORIES.has(input.kind)) issues.push(fail('INVALID_KIND', `${path}.kind`));
  if (!STATES.has(input.status)) issues.push(fail('INVALID_STATUS', `${path}.status`));
  if (!cleanText(input.source)) issues.push(fail('SOURCE_REQUIRED', `${path}.source`));
  if (!cleanText(input.licence, 200)) issues.push(fail('LICENCE_REQUIRED', `${path}.licence`));
  if (!validDay(input.retrievedOn) || input.retrievedOn > today) issues.push(fail('INVALID_RETRIEVED_ON', `${path}.retrievedOn`));
  if (!TIERS.has(input.verificationTier)) issues.push(fail('INVALID_TIER', `${path}.verificationTier`));
  if (input.previous !== null && !(typeof input.previous === 'string' && HEX.test(input.previous))) issues.push(fail('INVALID_PREVIOUS', `${path}.previous`));
  if (!HEX.test(input.payloadHash ?? '')) issues.push(fail('INVALID_PAYLOAD_HASH', `${path}.payloadHash`));
  if (own(input, 'note') && input.note !== null && !cleanText(input.note, 1000)) issues.push(fail('INVALID_NOTE', `${path}.note`));
  if (!HEX.test(input.hash ?? '')) issues.push(fail('INVALID_HASH', `${path}.hash`));
  if (issues.length) return { issues, value: null };
  const receipt = { ...receiptBody(input), hash: input.hash };
  if (!sameHash(receiptHash(receipt), receipt.hash)) issues.push(fail('HASH_MISMATCH', `${path}.hash`));
  return { issues, value: issues.length ? null : receipt };
}
export function parseChain(raw, { today = '2026-11-20' } = {}) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return { ok: false, issues: [fail('INPUT_TOO_LARGE', '$')] };
  if (!validDay(today)) return { ok: false, issues: [fail('INVALID_TODAY', '$')] };
  let input;
  try { input = JSON.parse(raw); } catch { return { ok: false, issues: [fail('INVALID_JSON', '$')] }; }
  if (!object(input)) return { ok: false, issues: [fail('ROOT_OBJECT_REQUIRED', '$')] };
  const issues = [];
  for (const key of Object.keys(input)) if (!['schemaVersion', 'receipts'].includes(key)) issues.push(fail('UNRECOGNISED_FIELD', key));
  if (input.schemaVersion !== 1) issues.push(fail('INVALID_SCHEMA', 'schemaVersion'));
  if (!Array.isArray(input.receipts) || input.receipts.length > MAX_RECEIPTS) issues.push(fail('INVALID_RECEIPTS', 'receipts'));
  if (issues.length) return { ok: false, issues };
  const rows = [], ids = new Set(), hashes = new Set();
  input.receipts.forEach((item, i) => {
    const check = validateReceipt(item, i, today);
    issues.push(...check.issues);
    if (!check.value) return;
    if (ids.has(item.id)) issues.push(fail('DUPLICATE_ID', `receipts[${i}].id`));
    if (hashes.has(item.hash)) issues.push(fail('DUPLICATE_HASH', `receipts[${i}].hash`));
    ids.add(item.id); hashes.add(item.hash);
    const expectedPrevious = rows.length ? rows[rows.length - 1].hash : null;
    if (item.previous !== expectedPrevious) issues.push(fail('CHAIN_BREAK', `receipts[${i}].previous`));
    rows.push(check.value);
  });
  if (issues.length) return { ok: false, issues };
  return { ok: true, issues: [], value: { schemaVersion: 1, receipts: rows } };
}
export function appendReceipt(chain, data, { today = '2026-11-20' } = {}) {
  const previous = chain.receipts.at(-1)?.hash ?? null;
  const raw = { ...data, previous };
  const candidate = { ...receiptBody(raw), hash: receiptHash(raw) };
  const checked = validateReceipt(candidate, chain.receipts.length, today);
  if (checked.issues.length) return { ok: false, issues: checked.issues };
  const next = { schemaVersion: 1, receipts: [...chain.receipts, candidate] };
  return parseChain(JSON.stringify(next), { today });
}
export function summarize(chain) {
  const counts = { total: chain.receipts.length, unknown: 0, reported: 0, 'not-reported': 0 };
  const kinds = { inventory: 0, change: 0, review: 0, handoff: 0 };
  for (const receipt of chain.receipts) { counts[receipt.status]++; kinds[receipt.kind]++; }
  return { counts, kinds, head: chain.receipts.at(-1)?.hash ?? null, oldestRetrievedOn: chain.receipts.reduce((date, r) => !date || r.retrievedOn < date ? r.retrievedOn : date, null) };
}
export function compareChains(before, after) {
  const common = Math.min(before.receipts.length, after.receipts.length);
  let prefix = 0;
  while (prefix < common && before.receipts[prefix].hash === after.receipts[prefix].hash) prefix++;
  return { commonPrefix: prefix, appended: after.receipts.slice(prefix).map(r => r.id), removed: before.receipts.slice(prefix).map(r => r.id), diverged: prefix < common, beforeHead: before.receipts.at(-1)?.hash ?? null, afterHead: after.receipts.at(-1)?.hash ?? null };
}
