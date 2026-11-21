/** Explicit local snapshot attestations. A digest proves byte identity, not accessibility. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { validateLedger, validDay, validText, validId, plain } from './review-ledger-contract.mjs';
import { replay } from './review-ledger-engine.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const KEYS = ['schemaVersion', 'snapshotId', 'createdOn', 'ledgerHash', 'previousHash', 'source', 'licence', 'retrievedOn', 'verificationTier'];
const TIERS = new Set(['unknown', 'self-reported', 'documented', 'field-observed']);
const OWN = Object.prototype.hasOwnProperty;

/** Sort object keys recursively; input is already constrained by ledger schema. */
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!plain(value)) throw new TypeError('UNSUPPORTED_VALUE');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
export function sha256(value) { return createHash('sha256').update(canonical(value), 'utf8').digest('hex'); }
export function equalDigest(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !HASH.test(a) || !HASH.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
export function validateAttestation(attestation, ledger, { today = '2026-11-20' } = {}) {
  const issues = [];
  if (!plain(attestation)) return { ok: false, issues: [{ code: 'OBJECT_REQUIRED' }] };
  for (const field of Object.keys(attestation)) if (!KEYS.includes(field)) issues.push({ code: 'EXTRA_FIELD', field });
  for (const field of KEYS) if (!OWN.call(attestation, field)) issues.push({ code: 'MISSING_FIELD', field });
  if (attestation.schemaVersion !== 1) issues.push({ code: 'VERSION_INVALID' });
  if (!validId(attestation.snapshotId)) issues.push({ code: 'SNAPSHOT_ID_INVALID' });
  if (!validDay(attestation.createdOn) || attestation.createdOn > today) issues.push({ code: 'CREATION_DATE_INVALID' });
  if (!HASH.test(attestation.ledgerHash ?? '')) issues.push({ code: 'HASH_INVALID' });
  if (attestation.previousHash !== null && !HASH.test(attestation.previousHash ?? '')) issues.push({ code: 'PREVIOUS_HASH_INVALID' });
  if (!validText(attestation.source, 500)) issues.push({ code: 'SOURCE_REQUIRED' });
  if (!validText(attestation.licence, 200)) issues.push({ code: 'LICENCE_REQUIRED' });
  if (!validDay(attestation.retrievedOn) || attestation.retrievedOn > today) issues.push({ code: 'RETRIEVAL_DATE_INVALID' });
  if (!TIERS.has(attestation.verificationTier)) issues.push({ code: 'TIER_INVALID' });
  const checked = validateLedger(ledger, { today });
  if (!checked.ok) issues.push(...checked.issues.map(item => ({ code: 'LEDGER_' + item.code })));
  if (checked.ok) {
    const history = replay(checked.value, { today });
    if (!history.ok) issues.push(...history.issues.map(item => ({ code: 'HISTORY_' + item.code })));
    if (!equalDigest(attestation.ledgerHash, sha256(checked.value))) issues.push({ code: 'HASH_MISMATCH' });
    const latest = [...checked.value.observations.map(x => x.retrievedOn), ...checked.value.events.map(x => x.retrievedOn)].sort().at(-1);
    if (latest && attestation.createdOn < latest) issues.push({ code: 'SNAPSHOT_PREDATES_EVIDENCE' });
  }
  return { ok: issues.length === 0, issues, value: issues.length ? null : { ...attestation } };
}
export function attest(ledger, { snapshotId, createdOn = '2026-11-20', previousHash = null, source, licence, retrievedOn = createdOn, verificationTier = 'unknown', today = createdOn } = {}) {
  const checked = validateLedger(ledger, { today });
  if (!checked.ok) return { ok: false, issues: checked.issues };
  const value = { schemaVersion: 1, snapshotId, createdOn, ledgerHash: sha256(checked.value), previousHash, source, licence, retrievedOn, verificationTier };
  const verified = validateAttestation(value, checked.value, { today });
  return verified.ok ? { ok: true, issues: [], value } : verified;
}
export function reviewChain(snapshots, { today = '2026-11-20' } = {}) {
  if (!Array.isArray(snapshots) || snapshots.length > 10000) return { ok: false, issues: [{ code: 'INVALID_SNAPSHOTS' }] };
  const issues = [], seen = new Set(), history = [];
  let prior = null;
  for (const [index, snapshot] of snapshots.entries()) {
    if (!plain(snapshot) || !plain(snapshot.attestation)) { issues.push({ code: 'INVALID_ENTRY', index }); continue; }
    const check = validateAttestation(snapshot.attestation, snapshot.ledger, { today });
    issues.push(...check.issues.map(item => ({ ...item, index })));
    const record = snapshot.attestation;
    if (seen.has(record.snapshotId)) issues.push({ code: 'DUPLICATE_SNAPSHOT', index });
    seen.add(record.snapshotId);
    if (index === 0 && record.previousHash !== null) issues.push({ code: 'GENESIS_PREVIOUS_NOT_NULL', index });
    if (index > 0 && (!prior || !equalDigest(record.previousHash, prior.ledgerHash))) issues.push({ code: 'CHAIN_BREAK', index });
    if (prior && record.createdOn < prior.createdOn) issues.push({ code: 'DATE_OUT_OF_ORDER', index });
    history.push({ snapshotId: record.snapshotId, createdOn: record.createdOn, ledgerHash: record.ledgerHash, status: check.ok ? 'matched' : 'invalid' });
    prior = record;
  }
  return { ok: issues.length === 0, issues, history, count: snapshots.length, lastHash: prior?.ledgerHash ?? null };
}
