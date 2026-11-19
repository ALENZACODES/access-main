/**
 * Offline, unbranded evidence handoff contract.
 * This is a transport and review contract; it cannot establish that a place
 * is accessible and never replaces a missing state with YES or NO.
 * The contract does not contact a network, persist data or read the clock.
 */
export const HANDOFF_VERSION = 1;
export const HANDOFF_STATES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const HANDOFF_DECISIONS = Object.freeze(['PENDING', 'NEEDS_SOURCE', 'DEFERRED', 'REVIEWED', 'DISMISSED']);
export const HANDOFF_PRIORITIES = Object.freeze(['NORMAL', 'FOLLOW_UP', 'URGENT_REVIEW']);
export const HANDOFF_TIERS = Object.freeze([0, 1, 2, 3, 4, 'E']);
export const HANDOFF_LICENCES = Object.freeze([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
  'OGL-Canada-2.0', 'OGL-Ontario-1.0', 'MIT', 'Apache-2.0',
]);
export const HANDOFF_LIMITS = Object.freeze({
  maxBytes: 5_000_000, maxEntries: 10_000, maxEvents: 50_000,
  maxSources: 20_000, maxText: 4096, maxId: 128, maxIssues: 500,
  maxDepth: 28, maxLinks: 32,
});
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const PRIVATE = new Set([
  'email', 'emailaddress', 'phone', 'phonenumber', 'password', 'passphrase',
  'token', 'accesstoken', 'refreshtoken', 'apikey', 'secret', 'session', 'cookie',
  'healthcard', 'healthcardnumber', 'ohip', 'diagnosis', 'prescription',
  'medication', 'medications', 'birthdate', 'dateofbirth', 'locationhistory',
  'personname', 'fullname', 'patient', 'patientid', 'personaladdress',
]);

export function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function pointerEscape(value) {
  return String(value).replace(/~/gu, '~0').replace(/\//gu, '~1');
}

export function makeIssue(code, path, detail) {
  return Object.freeze({ code, path, detail });
}

export function safeId(value, maxId = HANDOFF_LIMITS.maxId) {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= maxId && ID.test(value);
}

export function validDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function isSafeHttps(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return false;
  if (hasUnsafeCharacters(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    if (url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
    if (/^(?:127\.|10\.|192\.168\.|0\.|169\.254\.)/u.test(host)) return false;
    if (host === '[::1]' || host === '[::]') return false;
    return true;
  } catch {
    return false;
  }
}

export function hasUnsafeCharacters(value) {
  if (typeof value !== 'string') return true;
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point < 32 || point === 127 || point === 0xfffd) return true;
  }
  return false;
}

export function safeDisplayText(value, limit = HANDOFF_LIMITS.maxText) {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= limit && value.trim() === value &&
    Boolean(value.trim()) && !hasUnsafeCharacters(value) &&
    !/[<>]/u.test(value);
}

export function validBilingualText(value, limit = HANDOFF_LIMITS.maxText) {
  return isPlainRecord(value) && Object.keys(value).sort().join(',') === 'en,fr' &&
    safeDisplayText(value.en, limit) && safeDisplayText(value.fr, limit);
}

export function validateFrenchText(value, path) {
  if (typeof value !== 'string') return [makeIssue('FR_TEXT_REQUIRED', path, 'French text is required')];
  const issues = [];
  if (/(?:^|[^\u00a0]):/gu.test(value.replace(/https:\/\/[^\s]+/gu, 'URL'))) {
    issues.push(makeIssue('FR_COLON_SPACE', path, 'Colon requires U+00A0'));
  }
  if (/(?<!\u202f)[;!?]/gu.test(value)) {
    issues.push(makeIssue('FR_NARROW_SPACE', path, 'Punctuation requires U+202F'));
  }
  if (/«(?!\u202f)|(?<!\u202f)»/gu.test(value)) {
    issues.push(makeIssue('FR_GUILLEMET_SPACE', path, 'Guillemets require U+202F inside'));
  }
  if (/\b(?:l|d|j|n|c|s|qu|jusqu|lorsqu|puisqu|aujourd)'(?=\p{L})/giu.test(value)) {
    issues.push(makeIssue('FR_APOSTROPHE', path, 'French elision requires typographic apostrophe'));
  }
  return issues;
}

export function normalisePrivateKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/gu, '');
}

export function inspectPrivateKeys(value, root = '', limits = HANDOFF_LIMITS) {
  const issues = [];
  const seen = new WeakSet();
  function walk(node, path, depth) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) {
      issues.push(makeIssue('CYCLE', path, 'Cyclic data is not exportable'));
      return;
    }
    if (depth > limits.maxDepth) {
      issues.push(makeIssue('DEPTH', path, 'Maximum nesting depth exceeded'));
      return;
    }
    if (!isPlainRecord(node) && !Array.isArray(node)) {
      issues.push(makeIssue('OBJECT_TYPE', path, 'Only plain JSON objects are supported'));
      return;
    }
    seen.add(node);
    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}/${pointerEscape(key)}`;
      if (PRIVATE.has(normalisePrivateKey(key))) {
        issues.push(makeIssue('PRIVATE_FIELD', childPath, 'Private field is not permitted'));
      }
      walk(child, childPath, depth + 1);
    }
    seen.delete(node);
  }
  walk(value, root, 0);
  return issues;
}

export function handoffLimits(overrides = {}) {
  const result = { ...HANDOFF_LIMITS };
  if (!isPlainRecord(overrides)) return Object.freeze(result);
  for (const key of Object.keys(result)) {
    const value = overrides[key];
    if (Number.isSafeInteger(value) && value >= 0 && value <= result[key]) result[key] = value;
  }
  return Object.freeze(result);
}

export function validateSource(source, path, limits) {
  const issues = [];
  if (!isPlainRecord(source)) return [makeIssue('SOURCE_SHAPE', path, 'Source must be an object')];
  if (!safeId(source.id, limits.maxId)) issues.push(makeIssue('SOURCE_ID', `${path}/id`, 'Invalid source ID'));
  if (!safeDisplayText(source.title, limits.maxText)) {
    issues.push(makeIssue('SOURCE_TITLE', `${path}/title`, 'Source title is required'));
  }
  if (!isSafeHttps(source.url)) issues.push(makeIssue('SOURCE_URL', `${path}/url`, 'Public HTTPS citation is required'));
  if (!HANDOFF_LICENCES.includes(source.licence)) {
    issues.push(makeIssue('SOURCE_LICENCE', `${path}/licence`, 'Recognised open licence required'));
  }
  if (!validDay(source.retrievedOn)) {
    issues.push(makeIssue('SOURCE_DATE', `${path}/retrievedOn`, 'ISO retrieval date required'));
  }
  if (!HANDOFF_TIERS.includes(source.tier)) {
    issues.push(makeIssue('SOURCE_TIER', `${path}/tier`, 'Canonical source tier required'));
  }
  if (source.observedOn !== undefined && !validDay(source.observedOn)) {
    issues.push(makeIssue('OBSERVED_DATE', `${path}/observedOn`, 'ISO source observation date required'));
  }
  if (source.note !== undefined) {
    if (!validBilingualText(source.note, limits.maxText)) {
      issues.push(makeIssue('SOURCE_NOTE', `${path}/note`, 'EN/FR note is required'));
    } else issues.push(...validateFrenchText(source.note.fr, `${path}/note/fr`));
  }
  return issues;
}

export function validateClaim(claim, path, limits) {
  const issues = [];
  if (!isPlainRecord(claim)) return [makeIssue('CLAIM_SHAPE', path, 'Claim must be an object')];
  if (!safeId(claim.id, limits.maxId)) issues.push(makeIssue('CLAIM_ID', `${path}/id`, 'Invalid claim ID'));
  if (!safeId(claim.recordId, limits.maxId)) {
    issues.push(makeIssue('RECORD_ID', `${path}/recordId`, 'Stable record ID required'));
  }
  if (!safeId(claim.field, limits.maxId)) {
    issues.push(makeIssue('CLAIM_FIELD', `${path}/field`, 'Stable field name required'));
  }
  if (!HANDOFF_STATES.includes(claim.state)) {
    issues.push(makeIssue('CLAIM_STATE', `${path}/state`, 'YES, NO or UNKNOWN required'));
  }
  if (!validBilingualText(claim.label, limits.maxText)) {
    issues.push(makeIssue('CLAIM_LABEL', `${path}/label`, 'EN/FR label required'));
  } else issues.push(...validateFrenchText(claim.label.fr, `${path}/label/fr`));
  if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length > limits.maxLinks ||
    claim.sourceIds.some((value) => !safeId(value, limits.maxId))) {
    issues.push(makeIssue('CLAIM_SOURCES', `${path}/sourceIds`, 'List of source IDs required'));
  } else if (new Set(claim.sourceIds).size !== claim.sourceIds.length) {
    issues.push(makeIssue('CLAIM_SOURCE_DUPLICATE', `${path}/sourceIds`, 'Duplicate citation'));
  }
  if (claim.note !== undefined) {
    if (!validBilingualText(claim.note, limits.maxText)) {
      issues.push(makeIssue('CLAIM_NOTE', `${path}/note`, 'EN/FR note required'));
    } else issues.push(...validateFrenchText(claim.note.fr, `${path}/note/fr`));
  }
  return issues;
}

export function validateReviewEvent(event, path, limits) {
  const issues = [];
  if (!isPlainRecord(event)) return [makeIssue('EVENT_SHAPE', path, 'Review event must be an object')];
  if (!safeId(event.id, limits.maxId)) issues.push(makeIssue('EVENT_ID', `${path}/id`, 'Event ID required'));
  if (!safeId(event.claimId, limits.maxId)) {
    issues.push(makeIssue('EVENT_CLAIM', `${path}/claimId`, 'Claim ID required'));
  }
  if (!validDay(event.on)) issues.push(makeIssue('EVENT_DATE', `${path}/on`, 'ISO date required'));
  if (!HANDOFF_DECISIONS.includes(event.decision)) {
    issues.push(makeIssue('EVENT_DECISION', `${path}/decision`, 'Unknown review decision'));
  }
  if (!HANDOFF_PRIORITIES.includes(event.priority)) {
    issues.push(makeIssue('EVENT_PRIORITY', `${path}/priority`, 'Unknown review priority'));
  }
  if (event.reason !== undefined) {
    if (!validBilingualText(event.reason, limits.maxText)) {
      issues.push(makeIssue('EVENT_REASON', `${path}/reason`, 'EN/FR reason required'));
    } else issues.push(...validateFrenchText(event.reason.fr, `${path}/reason/fr`));
  }
  if (event.sourceIds !== undefined && (!Array.isArray(event.sourceIds) ||
    event.sourceIds.length > limits.maxLinks ||
    event.sourceIds.some((id) => !safeId(id, limits.maxId)))) {
    issues.push(makeIssue('EVENT_SOURCES', `${path}/sourceIds`, 'Invalid source reference list'));
  }
  return issues;
}

export function duplicateIds(values, path, maxIssues) {
  const issues = [];
  const seen = new Set();
  values.forEach((value, index) => {
    if (issues.length >= maxIssues) return;
    if (!isPlainRecord(value) || !safeId(value.id)) return;
    if (seen.has(value.id)) issues.push(makeIssue('DUPLICATE_ID', `${path}/${index}/id`, 'Duplicate ID'));
    seen.add(value.id);
  });
  return issues;
}

export function sourceReferences(document, limits) {
  const issues = [];
  const sourceIds = new Set(document.sources.map((source) => source?.id));
  for (const [index, claim] of document.claims.entries()) {
    if (!isPlainRecord(claim) || !Array.isArray(claim.sourceIds)) continue;
    const path = `/claims/${index}`;
    for (const id of claim.sourceIds) {
      if (!sourceIds.has(id)) issues.push(makeIssue('MISSING_SOURCE', `${path}/sourceIds`, 'Referenced source absent'));
      if (issues.length >= limits.maxIssues) return issues;
    }
    if (claim.state !== 'UNKNOWN' && claim.sourceIds.length === 0) {
      issues.push(makeIssue('UNSUPPORTED_CLAIM', path, 'Known state requires citation'));
    }
  }
  const claimIds = new Set(document.claims.map((claim) => claim?.id));
  for (const [index, event] of document.events.entries()) {
    if (!isPlainRecord(event)) continue;
    if (!claimIds.has(event.claimId)) issues.push(makeIssue('MISSING_CLAIM', `/events/${index}/claimId`, 'Referenced claim absent'));
    for (const id of event.sourceIds ?? []) {
      if (!sourceIds.has(id)) issues.push(makeIssue('MISSING_SOURCE', `/events/${index}/sourceIds`, 'Referenced source absent'));
      if (issues.length >= limits.maxIssues) return issues;
    }
  }
  return issues;
}

export function validateHandoff(document, overrides = {}) {
  const limits = handoffLimits(overrides);
  const issues = inspectPrivateKeys(document, '', limits);
  if (!isPlainRecord(document)) return { ok: false, issues: [makeIssue('DOCUMENT_SHAPE', '', 'Object expected'), ...issues], document: null };
  if (document.version !== HANDOFF_VERSION) issues.push(makeIssue('VERSION', '/version', 'Unsupported handoff version'));
  for (const [key, limit] of [['sources', limits.maxSources], ['claims', limits.maxEntries], ['events', limits.maxEvents]]) {
    if (!Array.isArray(document[key])) issues.push(makeIssue('COLLECTION', `/${key}`, 'Array required'));
    else if (document[key].length > limit) issues.push(makeIssue('COLLECTION_LIMIT', `/${key}`, 'Collection exceeds limit'));
  }
  if (issues.some((issue) => ['DOCUMENT_SHAPE', 'COLLECTION', 'COLLECTION_LIMIT'].includes(issue.code))) {
    return { ok: false, issues: issues.slice(0, limits.maxIssues), document: null };
  }
  document.sources.forEach((value, index) => issues.push(...validateSource(value, `/sources/${index}`, limits)));
  document.claims.forEach((value, index) => issues.push(...validateClaim(value, `/claims/${index}`, limits)));
  document.events.forEach((value, index) => issues.push(...validateReviewEvent(value, `/events/${index}`, limits)));
  issues.push(...duplicateIds(document.sources, '/sources', limits.maxIssues));
  issues.push(...duplicateIds(document.claims, '/claims', limits.maxIssues));
  issues.push(...duplicateIds(document.events, '/events', limits.maxIssues));
  issues.push(...sourceReferences(document, limits));
  if (document.generatedOn !== undefined && !validDay(document.generatedOn)) {
    issues.push(makeIssue('GENERATED_DATE', '/generatedOn', 'ISO date required'));
  }
  const sorted = issues.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  return { ok: sorted.length === 0, issues: sorted.slice(0, limits.maxIssues),
    document: sorted.length === 0 ? document : null };
}

export function parseHandoffJson(source, overrides = {}) {
  const limits = handoffLimits(overrides);
  if (typeof source !== 'string') return { ok: false, issues: [makeIssue('JSON_INPUT', '', 'JSON text required')], document: null };
  if (Buffer.byteLength(source, 'utf8') > limits.maxBytes) {
    return { ok: false, issues: [makeIssue('JSON_LIMIT', '', 'Input exceeds size limit')], document: null };
  }
  let value;
  try { value = JSON.parse(source); } catch {
    return { ok: false, issues: [makeIssue('JSON_PARSE', '', 'Invalid JSON')], document: null };
  }
  return validateHandoff(value, limits);
}

export function emptyHandoff() {
  return { version: HANDOFF_VERSION, sources: [], claims: [], events: [] };
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function safeClone(value) {
  return JSON.parse(JSON.stringify(value));
}
