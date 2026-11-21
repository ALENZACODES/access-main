/**
 * Consent-free, offline review queue for structured accessibility evidence.
 *
 * This module manages workflow state only. A review does not establish that
 * any place or service has an accessibility feature. All feature facts remain
 * in the originating record, and Unknown cannot be promoted by this queue.
 *
 * The queue contains no person names, addresses or other profile fields.
 * It never fetches URLs, runs timers, schedules work, or writes storage.
 */

export const REVIEW_QUEUE_VERSION = 1;
export const REVIEW_STATES = Object.freeze([
  'pending', 'needs-evidence', 'ready-for-human-review', 'deferred', 'closed',
]);
export const REVIEW_REASONS = Object.freeze([
  'unknown-claim', 'changed-claim', 'missing-evidence', 'stale-evidence',
  'conflicting-evidence', 'source-withdrawn', 'translation-review',
]);
export const REVIEW_ACTIONS = Object.freeze([
  'request-evidence', 'record-evidence', 'defer', 'reopen', 'close',
]);

const MAX_ITEMS = 20_000;
const MAX_HISTORY = 128;
const MAX_TEXT = 1024;
const MAX_ID = 128;
const MAX_LINK = 2048;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const OPEN_LICENCES = new Set([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
  'OGL-Canada-2.0', 'OGL-Canada-3.0', 'MIT', 'Apache-2.0',
]);
const STATUS = new Set(REVIEW_STATES);
const REASON = new Set(REVIEW_REASONS);
const ACTION = new Set(REVIEW_ACTIONS);
const CLAIM = new Set(['YES', 'NO', 'UNKNOWN']);
const TIER = new Set([0, 1, 2, 3, 4, 'E']);
const PRIVATE = new Set([
  'name', 'email', 'phone', 'address', 'healthcard', 'ohip', 'diagnosis',
  'medication', 'password', 'token', 'apikey', 'secret', 'cookie',
  'session', 'locationhistory', 'gps', 'birthdate',
]);
const PROTOCOL = new Set(['__proto__', 'constructor', 'prototype']);
const MESSAGES = Object.freeze({
  en: Object.freeze({
    title: 'Offline evidence review',
    caution: 'Review status is not a claim about real-world accessibility.',
    empty: 'No review items.',
    pending: 'Pending',
    'needs-evidence': 'Needs evidence',
    'ready-for-human-review': 'Ready for human review',
    deferred: 'Deferred',
    closed: 'Closed',
    source: 'Source',
    licence: 'Licence',
    retrieved: 'Retrieved',
    tier: 'Source tier',
    unknown: 'Unknown',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne des preuves',
    caution: 'Le statut d’examen ne confirme pas l’accessibilité réelle.',
    empty: 'Aucune fiche à examiner.',
    pending: 'En attente',
    'needs-evidence': 'Preuves nécessaires',
    'ready-for-human-review': 'Prêt pour un examen humain',
    deferred: 'Reporté',
    closed: 'Clos',
    source: 'Source',
    licence: 'Licence',
    retrieved: 'Consulté',
    tier: 'Niveau de la source',
    unknown: 'UNKNOWN',
  }),
});

function issue(code, path) {
  return { code, path };
}

export function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function validId(value) {
  return typeof value === 'string' && value.length <= MAX_ID && ID.test(value) &&
    !PROTOCOL.has(value.toLowerCase());
}

export function safeUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_LINK) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) return false;
    if (/^127\./.test(url.hostname) || url.hostname === '[::1]') return false;
    return ![...value].some((char) => char.codePointAt(0) < 32);
  } catch {
    return false;
  }
}

function canonicalKey(value) {
  return value.toLowerCase().replace(/[-_]/g, '');
}

/** A bounded walk returns paths, never private values. */
export function privateKeyIssues(value, path = '', seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return [];
  if (depth > 24) return [issue('DEPTH_LIMIT', path || '/')];
  if (seen.has(value)) return [issue('CYCLIC_DATA', path || '/')];
  seen.add(value);
  const problems = [];
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
  for (const [key, child] of entries) {
    const next = `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (PRIVATE.has(canonicalKey(key)) || PROTOCOL.has(key)) {
      problems.push(issue('PRIVATE_FIELD', next));
    } else {
      problems.push(...privateKeyIssues(child, next, seen, depth + 1));
    }
  }
  seen.delete(value);
  return problems;
}

export function validTranslation(value) {
  return plain(value) && Object.keys(value).length === 2 &&
    ['en', 'fr'].every((locale) => typeof value[locale] === 'string' &&
      value[locale].trim().length > 0 && value[locale].length <= MAX_TEXT);
}

/** Validate French typography in displayed copy, never URLs or schema tokens. */
export function frenchSpacingIssues(value, path) {
  if (typeof value !== 'string') return [issue('TRANSLATION_INVALID', path)];
  const problems = [];
  const apostrophe = /\b(?:l|d|j|n|c|s|qu|jusqu|lorsqu|puisqu|aujourd)'(?=\p{L})/giu;
  for (const match of value.matchAll(apostrophe)) {
    problems.push(issue('FR_APOSTROPHE', `${path}/${match.index}`));
  }
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === ':' && index > 0 && value[index - 1] !== '\u00A0') {
      problems.push(issue('FR_NBSP', `${path}/${index}`));
    }
    if (';!?'.includes(char) && index > 0 && value[index - 1] !== '\u202F') {
      problems.push(issue('FR_NARROW_NBSP', `${path}/${index}`));
    }
    if (char === '«' && value[index + 1] !== '\u202F') {
      problems.push(issue('FR_GUILLEMET', `${path}/${index}`));
    }
    if (char === '»' && value[index - 1] !== '\u202F') {
      problems.push(issue('FR_GUILLEMET', `${path}/${index}`));
    }
  }
  return problems;
}

function provenanceIssues(value, path, today) {
  const problems = [];
  if (!plain(value)) return [issue('PROVENANCE_REQUIRED', path)];
  if (typeof value.source !== 'string' || !safeUrl(value.source)) {
    problems.push(issue('SOURCE_REQUIRED', `${path}/source`));
  }
  if (!OPEN_LICENCES.has(value.licence)) {
    problems.push(issue('OPEN_LICENCE_REQUIRED', `${path}/licence`));
  }
  if (!validDate(value.retrievedOn) || validDate(today) && value.retrievedOn > today) {
    problems.push(issue('RETRIEVAL_DATE_REQUIRED', `${path}/retrievedOn`));
  }
  if (!TIER.has(value.tier)) problems.push(issue('TIER_REQUIRED', `${path}/tier`));
  if (value.sourceDate !== undefined && !validDate(value.sourceDate)) {
    problems.push(issue('SOURCE_DATE_INVALID', `${path}/sourceDate`));
  }
  if (value.sourceDate && validDate(value.sourceDate) &&
      validDate(value.retrievedOn) && value.sourceDate > value.retrievedOn) {
    problems.push(issue('SOURCE_AFTER_RETRIEVAL', `${path}/sourceDate`));
  }
  return problems;
}

function itemIssues(value, path, today) {
  if (!plain(value)) return [issue('ITEM_INVALID', path)];
  const problems = [];
  if (!validId(value.id)) problems.push(issue('ITEM_ID', `${path}/id`));
  if (!validId(value.recordId)) problems.push(issue('RECORD_ID', `${path}/recordId`));
  if (!validId(value.claimKey)) problems.push(issue('CLAIM_KEY', `${path}/claimKey`));
  if (!REASON.has(value.reason)) problems.push(issue('REASON_INVALID', `${path}/reason`));
  if (!STATUS.has(value.status)) problems.push(issue('STATUS_INVALID', `${path}/status`));
  if (!CLAIM.has(value.state)) problems.push(issue('CLAIM_INVALID', `${path}/state`));
  if (!validDate(value.createdOn)) problems.push(issue('CREATED_DATE', `${path}/createdOn`));
  if (validDate(today) && validDate(value.createdOn) && value.createdOn > today) {
    problems.push(issue('FUTURE_CREATION', `${path}/createdOn`));
  }
  if (!validTranslation(value.label)) problems.push(issue('LABEL_INVALID', `${path}/label`));
  else problems.push(...frenchSpacingIssues(value.label.fr, `${path}/label/fr`));
  problems.push(...provenanceIssues(value.provenance, `${path}/provenance`, today));
  if (!Array.isArray(value.history) || value.history.length > MAX_HISTORY) {
    problems.push(issue('HISTORY_INVALID', `${path}/history`));
  } else {
    let last = value.createdOn;
    for (let n = 0; n < value.history.length; n += 1) {
      const event = value.history[n];
      const here = `${path}/history/${n}`;
      if (!plain(event) || !ACTION.has(event.action) || !STATUS.has(event.to) ||
          !validDate(event.on)) {
        problems.push(issue('EVENT_INVALID', here));
        continue;
      }
      if (validDate(last) && event.on < last) problems.push(issue('EVENT_ORDER', here));
      if (validDate(today) && event.on > today) problems.push(issue('FUTURE_EVENT', here));
      last = event.on;
    }
  }
  return problems;
}

export function validateQueue(value, options = {}) {
  const today = options.today;
  const problems = privateKeyIssues(value);
  if (!plain(value) || value.version !== REVIEW_QUEUE_VERSION || !Array.isArray(value.items)) {
    return { ok: false, problems: [...problems, issue('QUEUE_INVALID', '/')] };
  }
  if (value.items.length > MAX_ITEMS) problems.push(issue('QUEUE_LIMIT', '/items'));
  const ids = new Set();
  for (let index = 0; index < Math.min(value.items.length, MAX_ITEMS); index += 1) {
    const item = value.items[index];
    const path = `/items/${index}`;
    problems.push(...itemIssues(item, path, today));
    if (validId(item?.id)) {
      if (ids.has(item.id)) problems.push(issue('DUPLICATE_ID', `${path}/id`));
      ids.add(item.id);
    }
  }
  const allowed = new Set(['version', 'items']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) problems.push(issue('QUEUE_EXTRA_FIELD', `/${key}`));
  }
  return { ok: problems.length === 0, problems };
}

export function newQueue() {
  return { version: REVIEW_QUEUE_VERSION, items: [] };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Queue mutation is atomic: never return a partly updated collection.
 * The caller must explicitly select a status action; evidence is not proof.
 */
export function addReview(queue, candidate, options = {}) {
  const before = validateQueue(queue, options);
  if (!before.ok) return { ok: false, queue, problems: before.problems };
  const item = {
    ...cloneJson(candidate),
    status: candidate.status ?? 'pending',
    history: candidate.history ?? [],
  };
  const proposed = { version: REVIEW_QUEUE_VERSION, items: [...queue.items, item] };
  const after = validateQueue(proposed, options);
  if (!after.ok) return { ok: false, queue, problems: after.problems };
  return { ok: true, queue: proposed, problems: [] };
}

const TRANSITIONS = Object.freeze({
  pending: Object.freeze({
    'request-evidence': 'needs-evidence',
    'record-evidence': 'ready-for-human-review',
    defer: 'deferred',
    close: 'closed',
  }),
  'needs-evidence': Object.freeze({
    'record-evidence': 'ready-for-human-review',
    defer: 'deferred',
    close: 'closed',
  }),
  'ready-for-human-review': Object.freeze({
    'request-evidence': 'needs-evidence',
    defer: 'deferred',
    close: 'closed',
  }),
  deferred: Object.freeze({
    reopen: 'pending',
    close: 'closed',
  }),
  closed: Object.freeze({
    reopen: 'pending',
  }),
});

export function transitionReview(queue, id, action, on, options = {}) {
  const existing = validateQueue(queue, options);
  if (!existing.ok) return { ok: false, queue, problems: existing.problems };
  if (!validId(id) || !ACTION.has(action) || !validDate(on)) {
    return { ok: false, queue, problems: [issue('ACTION_INVALID', '/action')] };
  }
  if (validDate(options.today) && on > options.today) {
    return { ok: false, queue, problems: [issue('FUTURE_EVENT', '/on')] };
  }
  const index = queue.items.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, queue, problems: [issue('ITEM_NOT_FOUND', '/id')] };
  const old = queue.items[index];
  const nextStatus = TRANSITIONS[old.status]?.[action];
  if (!nextStatus) {
    return { ok: false, queue, problems: [issue('ACTION_NOT_ALLOWED', '/action')] };
  }
  const last = old.history.at(-1)?.on ?? old.createdOn;
  if (on < last) return { ok: false, queue, problems: [issue('EVENT_ORDER', '/on')] };
  if (old.history.length >= MAX_HISTORY) {
    return { ok: false, queue, problems: [issue('HISTORY_LIMIT', '/history')] };
  }
  const event = { action, on, to: nextStatus };
  const changed = { ...old, status: nextStatus, history: [...old.history, event] };
  const items = queue.items.map((entry, number) => number === index ? changed : entry);
  const updated = { version: REVIEW_QUEUE_VERSION, items };
  const after = validateQueue(updated, options);
  if (!after.ok) return { ok: false, queue, problems: after.problems };
  return { ok: true, queue: updated, problems: [] };
}

export function summarizeQueue(queue, options = {}) {
  const check = validateQueue(queue, options);
  if (!check.ok) return { ok: false, problems: check.problems, summary: null };
  const status = Object.fromEntries(REVIEW_STATES.map((name) => [name, 0]));
  const reason = Object.fromEntries(REVIEW_REASONS.map((name) => [name, 0]));
  const state = { YES: 0, NO: 0, UNKNOWN: 0 };
  for (const item of queue.items) {
    status[item.status] += 1;
    reason[item.reason] += 1;
    state[item.state] += 1;
  }
  return { ok: true, problems: [], summary: { total: queue.items.length, status, reason, state } };
}

function safeDisplay(value) {
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, MAX_TEXT);
}

export function formatQueueReport(queue, language = 'en', options = {}) {
  const locale = language === 'fr' ? 'fr' : 'en';
  const messages = MESSAGES[locale];
  const check = validateQueue(queue, options);
  if (!check.ok) {
    return `${messages.title}\n${messages.caution}\n${check.problems.map((p) => p.code).join('\n')}`;
  }
  const lines = [messages.title, messages.caution];
  if (queue.items.length === 0) lines.push(messages.empty);
  for (const item of [...queue.items].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    const mark = locale === 'fr' ? '\u00A0:' : ':';
    lines.push(`${safeDisplay(item.id)} | ${safeDisplay(item.label[locale])} | ${messages[item.status]} | ${item.state}`);
    lines.push(`${messages.source}${mark} ${item.provenance.source}`);
    lines.push(`${messages.licence}${mark} ${item.provenance.licence}`);
    lines.push(`${messages.retrieved}${mark} ${item.provenance.retrievedOn}`);
    lines.push(`${messages.tier}${mark} ${item.provenance.tier}`);
  }
  return lines.join('\n');
}

export function serializeQueue(queue, options = {}) {
  const check = validateQueue(queue, options);
  if (!check.ok) return { ok: false, problems: check.problems, text: null };
  const items = [...queue.items].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return { ok: true, problems: [], text: JSON.stringify({ version: REVIEW_QUEUE_VERSION, items }, null, 2) + '\n' };
}

export function parseQueue(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 8_000_000) {
    return { ok: false, problems: [issue('INPUT_LIMIT', '/')], queue: null };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, problems: [issue('INVALID_JSON', '/')], queue: null };
  }
  const check = validateQueue(value, options);
  return { ok: check.ok, problems: check.problems, queue: check.ok ? value : null };
}
