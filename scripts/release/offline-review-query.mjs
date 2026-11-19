/**
 * Offline review queue exploration with bounded, deterministic results.
 * A listing or export is an administrative view, never a classification of a
 * physical location. All claim states are unchanged; UNKNOWN is a token.
 * There are no timers, network requests, storage calls or user identifiers.
 */
import {
  REVIEW_REASONS, REVIEW_STATES, validateQueue, validDate,
} from './offline-review-queue.mjs';

export const QUERY_VERSION = 1;
export const QUERY_SORTS = Object.freeze([
  'id', 'created-asc', 'created-desc', 'retrieved-asc', 'retrieved-desc',
  'status', 'reason', 'tier', 'claim', 'history-desc',
]);
export const QUERY_GROUPS = Object.freeze(['status', 'reason', 'state', 'tier', 'source', 'retrieved-month']);
export const QUERY_STATES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const QUERY_DEFAULTS = Object.freeze({
  limit: 50, offset: 0, sort: 'id', descending: false,
  status: [], reason: [], state: [], tier: [],
  search: '', after: null, before: null, source: null,
  hasHistory: null,
});
const MAX_RESULTS = 500;
const MAX_SEARCH = 128;
const MAX_OFFSET = 1_000_000;
const MAX_GROUPS = 20_000;
const SORTS = new Set(QUERY_SORTS);
const STATES = new Set(QUERY_STATES);
const STATUSES = new Set(REVIEW_STATES);
const REASONS = new Set(REVIEW_REASONS);
const TIERS = new Set([0, 1, 2, 3, 4, 'E']);
const PROPERTIES = new Set(Object.keys(QUERY_DEFAULTS));
const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function problem(code, path) { return Object.freeze({ code, path }); }
function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function uniqueAllowed(list, allowed, field, issues) {
  if (!Array.isArray(list) || list.length > 50) {
    issues.push(problem('FILTER_INVALID', `/${field}`));
    return [];
  }
  const selected = new Set();
  for (let index = 0; index < list.length; index += 1) {
    const value = list[index];
    if (!allowed.has(value) || selected.has(value)) {
      issues.push(problem('FILTER_VALUE', `/${field}/${index}`));
    } else selected.add(value);
  }
  return [...selected];
}
function normaliseSearch(value, issues) {
  if (typeof value !== 'string' || value.length > MAX_SEARCH || /[\r\n\t]/u.test(value)) {
    issues.push(problem('SEARCH_INVALID', '/search'));
    return '';
  }
  return value.trim().toLocaleLowerCase('en-CA');
}
function checkDate(value, key, issues) {
  if (value !== null && !validDate(value)) issues.push(problem('DATE_INVALID', `/${key}`));
  return value;
}

/** Check every option even if a later invalid value cannot be applied. */
export function validateQuery(input = {}) {
  const issues = [];
  if (!plain(input)) return { ok: false, issues: [problem('QUERY_INVALID', '/')], query: null };
  for (const key of Object.keys(input)) {
    if (!PROPERTIES.has(key)) issues.push(problem('UNKNOWN_FILTER', `/${key}`));
  }
  const value = { ...QUERY_DEFAULTS, ...input };
  if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > MAX_RESULTS) {
    issues.push(problem('LIMIT_INVALID', '/limit'));
  }
  if (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > MAX_OFFSET) {
    issues.push(problem('OFFSET_INVALID', '/offset'));
  }
  if (!SORTS.has(value.sort)) issues.push(problem('SORT_INVALID', '/sort'));
  if (typeof value.descending !== 'boolean') issues.push(problem('ORDER_INVALID', '/descending'));
  const status = uniqueAllowed(value.status, STATUSES, 'status', issues);
  const reason = uniqueAllowed(value.reason, REASONS, 'reason', issues);
  const state = uniqueAllowed(value.state, STATES, 'state', issues);
  const tier = uniqueAllowed(value.tier, TIERS, 'tier', issues);
  const search = normaliseSearch(value.search, issues);
  const after = checkDate(value.after, 'after', issues);
  const before = checkDate(value.before, 'before', issues);
  if (validDate(after) && validDate(before) && after > before) {
    issues.push(problem('DATE_ORDER', '/after'));
  }
  if (value.source !== null &&
    (typeof value.source !== 'string' || !value.source.startsWith('https://') || value.source.length > 2048)) {
    issues.push(problem('SOURCE_FILTER', '/source'));
  }
  if (value.hasHistory !== null && typeof value.hasHistory !== 'boolean') {
    issues.push(problem('HISTORY_FILTER', '/hasHistory'));
  }
  return {
    ok: issues.length === 0,
    issues,
    query: issues.length ? null : {
      limit: value.limit, offset: value.offset, sort: value.sort,
      descending: value.descending, status, reason, state, tier,
      search, after, before, source: value.source, hasHistory: value.hasHistory,
    },
  };
}

function recordSearchText(item) {
  // IDs and translated subject labels are searched. No notes, history or
  // private information are retained in search output.
  return `${item.id} ${item.recordId} ${item.claimKey} ${item.label.en} ${item.label.fr}`
    .toLocaleLowerCase('en-CA');
}
function isSelected(value, selected) { return selected.length === 0 || selected.includes(value); }
export function matchReview(item, query) {
  if (!isSelected(item.status, query.status)) return false;
  if (!isSelected(item.reason, query.reason)) return false;
  if (!isSelected(item.state, query.state)) return false;
  if (!isSelected(item.provenance.tier, query.tier)) return false;
  if (query.after !== null && item.createdOn < query.after) return false;
  if (query.before !== null && item.createdOn > query.before) return false;
  if (query.source !== null && item.provenance.source !== query.source) return false;
  if (query.hasHistory !== null && Boolean(item.history.length) !== query.hasHistory) return false;
  if (query.search && !recordSearchText(item).includes(query.search)) return false;
  return true;
}
function lastHistoryDay(item) {
  return item.history.at(-1)?.on ?? item.createdOn;
}
function sortingValue(item, mode) {
  switch (mode) {
    case 'created-asc':
    case 'created-desc': return item.createdOn;
    case 'retrieved-asc':
    case 'retrieved-desc': return item.provenance.retrievedOn;
    case 'status': return item.status;
    case 'reason': return item.reason;
    case 'tier': return String(item.provenance.tier);
    case 'claim': return item.state;
    case 'history-desc': return lastHistoryDay(item);
    default: return item.id;
  }
}
function direction(mode, descending) {
  const naturalDescending = mode.endsWith('-desc');
  return (naturalDescending ? -1 : 1) * (descending ? -1 : 1);
}
export function compareReviews(a, b, query) {
  const scale = direction(query.sort, query.descending);
  const primary = COLLATOR.compare(sortingValue(a, query.sort), sortingValue(b, query.sort));
  return scale * primary || COLLATOR.compare(a.id, b.id);
}

function publicProjection(item) {
  return {
    id: item.id,
    recordId: item.recordId,
    claimKey: item.claimKey,
    state: item.state,
    status: item.status,
    reason: item.reason,
    createdOn: item.createdOn,
    label: { en: item.label.en, fr: item.label.fr },
    provenance: {
      source: item.provenance.source, licence: item.provenance.licence,
      retrievedOn: item.provenance.retrievedOn, tier: item.provenance.tier,
      ...(item.provenance.sourceDate ? { sourceDate: item.provenance.sourceDate } : {}),
    },
    historyCount: item.history.length,
    lastReviewedOn: item.history.at(-1)?.on ?? null,
  };
}

/** Return a bounded copy, never queue objects or histories. */
export function queryReviews(queue, filters = {}, options = {}) {
  const checked = validateQueue(queue, options);
  const checkedQuery = validateQuery(filters);
  const problems = [...checked.problems, ...checkedQuery.issues];
  if (problems.length) return { ok: false, problems, total: null, rows: [], page: null };
  const query = checkedQuery.query;
  const matching = queue.items.filter((item) => matchReview(item, query));
  matching.sort((a, b) => compareReviews(a, b, query));
  const rows = matching.slice(query.offset, query.offset + query.limit).map(publicProjection);
  return {
    ok: true, problems: [], total: matching.length,
    rows,
    page: {
      offset: query.offset, limit: query.limit, shown: rows.length,
      hasPrevious: query.offset > 0 && matching.length > 0,
      hasNext: query.offset + rows.length < matching.length,
      nextOffset: query.offset + rows.length < matching.length ? query.offset + rows.length : null,
    },
  };
}

function groupKey(item, group) {
  switch (group) {
    case 'status': return item.status;
    case 'reason': return item.reason;
    case 'state': return item.state;
    case 'tier': return String(item.provenance.tier);
    case 'source': return item.provenance.source;
    case 'retrieved-month': return item.provenance.retrievedOn.slice(0, 7);
    default: return null;
  }
}

/** Facets are computed over the filtered full set, never the visible page. */
export function groupReviews(queue, group, filters = {}, options = {}) {
  const checked = validateQueue(queue, options);
  const queryCheck = validateQuery(filters);
  const problems = [...checked.problems, ...queryCheck.issues];
  if (!QUERY_GROUPS.includes(group)) problems.push(problem('GROUP_INVALID', '/group'));
  if (problems.length) return { ok: false, problems, total: null, groups: [] };
  const counts = new Map();
  let total = 0;
  for (const item of queue.items) {
    if (!matchReview(item, queryCheck.query)) continue;
    const key = groupKey(item, group);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
    if (counts.size > MAX_GROUPS) {
      return { ok: false, problems: [problem('GROUP_LIMIT', '/groups')], total: null, groups: [] };
    }
  }
  const groups = [...counts].map(([key, count]) => ({ key, count }));
  groups.sort((a, b) => b.count - a.count || COLLATOR.compare(a.key, b.key));
  return { ok: true, problems: [], total, groups };
}

/** Count days without guessing wall clock time or using Date.now. */
export function daysBetween(earlier, later) {
  if (!validDate(earlier) || !validDate(later)) return null;
  const [a, b, c] = earlier.split('-').map(Number);
  const [d, e, f] = later.split('-').map(Number);
  const start = Date.UTC(a, b - 1, c);
  const end = Date.UTC(d, e - 1, f);
  return Math.round((end - start) / 86400000);
}

/** History and retrieval ages are administrative age indicators only. */
export function reviewAgeSummary(queue, asOf, filters = {}, options = {}) {
  const checked = validateQueue(queue, options);
  const queryCheck = validateQuery(filters);
  const problems = [...checked.problems, ...queryCheck.issues];
  if (!validDate(asOf)) problems.push(problem('AS_OF_INVALID', '/asOf'));
  if (problems.length) return { ok: false, problems, summary: null };
  const ages = [];
  const categories = { future: 0, '0-7': 0, '8-30': 0, '31-90': 0, '91+': 0 };
  let neverReviewed = 0;
  for (const item of queue.items) {
    if (!matchReview(item, queryCheck.query)) continue;
    const age = daysBetween(item.createdOn, asOf);
    ages.push(age);
    if (age < 0) categories.future += 1;
    else if (age <= 7) categories['0-7'] += 1;
    else if (age <= 30) categories['8-30'] += 1;
    else if (age <= 90) categories['31-90'] += 1;
    else categories['91+'] += 1;
    if (!item.history.length) neverReviewed += 1;
  }
  ages.sort((a, b) => a - b);
  return {
    ok: true, problems: [],
    summary: {
      total: ages.length, neverReviewed,
      categories,
      youngestDays: ages.length ? ages[0] : null,
      oldestDays: ages.length ? ages.at(-1) : null,
      medianDays: ages.length ? (ages[Math.floor((ages.length - 1) / 2)] +
        ages[Math.floor(ages.length / 2)]) / 2 : null,
    },
  };
}

/** A public summary only; it does not echo user-provided claim descriptions. */
export function formatQuerySummary(result, language = 'en') {
  if (!result?.ok) return null;
  const fr = language === 'fr';
  const word = fr ? 'Fiches' : 'Items';
  const prefix = fr ? '\u00A0: ' : ': ';
  const lines = [fr ? 'Liste des examens hors ligne' : 'Offline review listing'];
  lines.push(`${word}${prefix}${result.total}`);
  lines.push(fr ? 'UNKNOWN reste UNKNOWN.' : 'UNKNOWN remains UNKNOWN.');
  lines.push(fr ? 'Un statut d’examen ne décrit pas l’accessibilité réelle.' :
    'A review status does not establish real-world accessibility.');
  return lines.join('\n');
}
