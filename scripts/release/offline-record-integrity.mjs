/**
 * Offline record integrity checks for exported, user-supplied accessibility data.
 *
 * This module is intentionally independent of network access, geocoders, and
 * assertions about physical places. Its findings describe the supplied file,
 * not the accessibility of a venue. No finding promotes Unknown to Yes.
 *
 * This is a reusable validator, not a mandatory release gate. Import it from a
 * caller that handles user consent and keeps private exports on the device.
 */

const MAX_RECORDS = 50_000;
const MAX_TEXT = 4_096;
const MAX_URL = 2_048;
const MAX_DEPTH = 32;
const UNKNOWN = 'unknown';
const PROVENANCE_FIELDS = ['source', 'licence', 'retrievedOn', 'verificationTier'];
const VALID_TIERS = new Set([
  'PROTOTYPE-UNVERIFIED', 'SEEDED-OPEN-DATA', 'COMMUNITY-REPORTED',
  'UNVERIFIED', 'VERIFIED',
]);
const POSITIVE = new Set(['yes', 'true', 'accessible', 'available', 'present']);
const NEGATIVE = new Set(['no', 'false', 'inaccessible', 'unavailable', 'absent']);
const UNKNOWN_VALUES = new Set(['unknown', 'not-known', 'not_provided', 'unspecified']);
const KNOWN_FLAGS = new Set(['yes', 'no', 'unknown']);
const PRIVATE_KEY = /(?:^|[_-])(?:email|phone|address|password|token|secret|api[_-]?key|session|cookie)(?:$|[_-])/i;

function issue(code, pointer, detail) {
  return { code, pointer, detail };
}

function pointerPart(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function hasControlCharacters(value) {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function safeSource(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL) return false;
  if (hasControlCharacters(value)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && Boolean(url.hostname) &&
        !url.username && !url.password;
    } catch {
      return false;
    }
  }
  // Printable citation names can identify books or user-provided documents.
  // They must not be interpreted as proof of an access feature.
  return !/[<>]/u.test(value) && value.trim().length >= 3;
}

function safeLicence(value) {
  return typeof value === 'string' && value.length <= 200 &&
    value.trim().length >= 2 && !/[<>]/u.test(value) && !hasControlCharacters(value);
}

function checkLocalePair(value, pointer, issues) {
  if (!plainObject(value)) {
    issues.push(issue('LOCALE_SHAPE', pointer, 'Expected { en, fr } text fields'));
    return;
  }
  for (const locale of ['en', 'fr']) {
    if (typeof value[locale] !== 'string' || !value[locale].trim() ||
        value[locale].length > MAX_TEXT) {
      issues.push(issue('LOCALE_MISSING', `${pointer}/${locale}`,
        'Non-empty, bounded translation required'));
    }
  }
  if (typeof value.fr === 'string') {
    const french = value.fr;
    // French UI punctuation in this product uses NBSP consistently.
    for (let i = 0; i < french.length; i++) {
      const char = french[i];
      if (':?!'.includes(char) && char !== '' && i > 0 && french[i - 1] !== '\u00a0') {
        // Skip URL punctuation, which belongs in data rather than translated UI.
        if (!/^https?:\/\//i.test(french)) {
          issues.push(issue('FR_NBSP', `${pointer}/fr`, 'Use U+00A0 before : ? !'));
          break;
        }
      }
    }
    if (/«(?!\u00a0)|(?<!\u00a0)»/u.test(french)) {
      issues.push(issue('FR_GUILLEMETS', `${pointer}/fr`, 'Use U+00A0 inside « »'));
    }
  }
}

function checkDeepShape(value, pointer, issues, depth, visited) {
  if (depth > MAX_DEPTH) {
    issues.push(issue('DEPTH', pointer, 'Nested content exceeds safe depth'));
    return;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT) issues.push(issue('TEXT_LENGTH', pointer, 'Field is too long'));
    return;
  }
  if (typeof value !== 'object') {
    issues.push(issue('UNSUPPORTED_VALUE', pointer, 'Only JSON values are allowed'));
    return;
  }
  if (visited.has(value)) {
    issues.push(issue('CYCLE', pointer, 'Cycles cannot be exported as JSON'));
    return;
  }
  visited.add(value);
  if (!Array.isArray(value) && !plainObject(value)) {
    issues.push(issue('OBJECT_SHAPE', pointer, 'Expected plain JSON object'));
  }
  {
    for (const [key, part] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        issues.push(issue('UNSAFE_KEY', `${pointer}/${pointerPart(key)}`, 'Unsafe object key'));
      }
      if (PRIVATE_KEY.test(key)) {
        issues.push(issue('PRIVATE_FIELD', `${pointer}/${pointerPart(key)}`,
          'Remove contact information and secrets before publishing'));
      }
      checkDeepShape(part, `${pointer}/${pointerPart(key)}`, issues, depth + 1, visited);
    }
  }
  visited.delete(value);
}

function normalizedStatus(value) {
  if (value === null || value === undefined) return UNKNOWN;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  if (POSITIVE.has(lowered)) return 'yes';
  if (NEGATIVE.has(lowered)) return 'no';
  if (UNKNOWN_VALUES.has(lowered)) return UNKNOWN;
  return null;
}

/**
 * Normalize a claim without inferring physical access from stale or absent data.
 * The caller can display the original source for any non-Unknown claim.
 */
export function conservativeClaim(value, { provenanceComplete = false } = {}) {
  const normalized = normalizedStatus(value);
  if (normalized === null || !provenanceComplete) return UNKNOWN;
  return normalized;
}

export function inspectRecord(record, index = 0, { today = null } = {}) {
  const root = `/records/${index}`;
  const issues = [];
  if (!plainObject(record)) {
    return { issues: [issue('RECORD_SHAPE', root, 'Expected a plain record object')],
      normalized: null };
  }
  const missing = PROVENANCE_FIELDS.filter((key) =>
    typeof record[key] !== 'string' || !record[key].trim());
  for (const key of missing) {
    issues.push(issue('PROVENANCE_MISSING', `${root}/${key}`, `${key} is required`));
  }
  if (!missing.includes('source') && !safeSource(record.source)) {
    issues.push(issue('SOURCE_INVALID', `${root}/source`, 'Use a named source or safe HTTPS URL'));
  }
  if (!missing.includes('licence') && !safeLicence(record.licence)) {
    issues.push(issue('LICENCE_INVALID', `${root}/licence`, 'A clear bounded licence label is required'));
  }
  if (!missing.includes('retrievedOn') && !validDateOnly(record.retrievedOn)) {
    issues.push(issue('DATE_INVALID', `${root}/retrievedOn`, 'Use a real YYYY-MM-DD date'));
  }
  if (validDateOnly(record.retrievedOn) && validDateOnly(today) &&
      record.retrievedOn > today) {
    issues.push(issue('FUTURE_RETRIEVAL', `${root}/retrievedOn`,
      'Retrieval date must not be later than the assessment date'));
  }
  if (!missing.includes('verificationTier') && !VALID_TIERS.has(record.verificationTier)) {
    issues.push(issue('TIER_UNKNOWN', `${root}/verificationTier`, 'Unknown tier vocabulary'));
  }
  if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > 160) {
    issues.push(issue('ID_INVALID', `${root}/id`, 'A bounded, non-empty string id is required'));
  }
  if ('name' in record) checkLocalePair(record.name, `${root}/name`, issues);
  if ('description' in record) checkLocalePair(record.description, `${root}/description`, issues);
  const claims = plainObject(record.claims) ? record.claims : {};
  if ('claims' in record && !plainObject(record.claims)) {
    issues.push(issue('CLAIMS_SHAPE', `${root}/claims`, 'Expected an object of access claims'));
  }
  const sanitizedClaims = {};
  const claimProvenanceValid = !issues.some((finding) =>
    /^(PROVENANCE_MISSING|SOURCE_INVALID|LICENCE_INVALID|DATE_INVALID|FUTURE_RETRIEVAL|TIER_UNKNOWN)$/.test(finding.code));
  for (const [key, value] of Object.entries(claims)) {
    const pointer = `${root}/claims/${pointerPart(key)}`;
    const normalized = normalizedStatus(value);
    if (normalized === null) issues.push(issue('CLAIM_VALUE', pointer,
      'Expected yes, no or unknown; unsupported values become Unknown'));
    sanitizedClaims[key] = conservativeClaim(value,
      { provenanceComplete: claimProvenanceValid });
  }
  checkDeepShape(record, root, issues, 0, new WeakSet());
  // The normalized record is suitable for local rendering; it does not erase
  // issues, and callers must not publish a record with outstanding findings.
  return { issues, normalized: { ...record, claims: sanitizedClaims } };
}

/**
 * Inspects an already-parsed offline snapshot. This never fetches or repairs
 * records. The returned normalized data is a separate object from the input.
 */
export function inspectOfflineSnapshot(snapshot, { today = null } = {}) {
  const issues = [];
  if (!plainObject(snapshot)) {
    return { ok: false, issues: [issue('SNAPSHOT_SHAPE', '/', 'Expected a JSON object')],
      records: [] };
  }
  if (!Array.isArray(snapshot.records)) {
    return { ok: false, issues: [issue('RECORDS_REQUIRED', '/records',
      'Expected a records array')], records: [] };
  }
  if (snapshot.records.length > MAX_RECORDS) {
    return { ok: false, issues: [issue('RECORD_LIMIT', '/records',
      'Too many records for a local snapshot')], records: [] };
  }
  const seen = new Map();
  const records = [];
  for (const [index, record] of snapshot.records.entries()) {
    const result = inspectRecord(record, index, { today });
    issues.push(...result.issues);
    if (result.normalized) records.push(result.normalized);
    if (typeof record?.id === 'string' && record.id.trim()) {
      const previous = seen.get(record.id);
      if (previous !== undefined) {
        issues.push(issue('ID_DUPLICATE', `/records/${index}/id`,
          `Duplicate id also occurs at /records/${previous}/id`));
      } else seen.set(record.id, index);
    }
  }
  return { ok: issues.length === 0, issues, records };
}

export function parseOfflineSnapshot(text, options = {}) {
  if (typeof text !== 'string') {
    return { ok: false, issues: [issue('INPUT_TYPE', '/', 'Expected JSON text')], records: [] };
  }
  if (Buffer.byteLength(text, 'utf8') > 50 * 1024 * 1024) {
    return { ok: false, issues: [issue('INPUT_SIZE', '/', 'Snapshot exceeds 50 MB')],
      records: [] };
  }
  try {
    return inspectOfflineSnapshot(JSON.parse(text), options);
  } catch {
    return { ok: false, issues: [issue('JSON_PARSE', '/', 'Invalid JSON document')],
      records: [] };
  }
}

export const offlineRecordPolicy = Object.freeze({
  maxRecords: MAX_RECORDS,
  maxTextLength: MAX_TEXT,
  maxInputBytes: 50 * 1024 * 1024,
  requiredProvenance: [...PROVENANCE_FIELDS],
  verificationTiers: [...VALID_TIERS],
  statuses: [...KNOWN_FLAGS],
});
