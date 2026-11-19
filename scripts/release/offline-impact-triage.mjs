/**
 * Pure decision support for sorting evidence review impacts in the App.
 * It never updates the assertion about a physical place. No automation,
 * scheduling, transmission or persistence occurs here.
 */
import { validateImpactPacket, IMPACT_REASONS } from './offline-impact-plan.mjs';

export const TRIAGE_VERSION = 1;
export const TRIAGE_STATUS = Object.freeze(['open', 'deferred', 'resolved']);
const STATUSES = new Set(TRIAGE_STATUS);
const MAX_EVENTS = 100_000;
const MAX_NOTES = 1024;
const MAX_ITEMS = 20_000;
const DAYS = /^\d{4}-\d{2}-\d{2}$/;
const ACTIONS = new Set(['defer', 'reopen', 'resolve']);

function problem(code, path) { return { code, path }; }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function validDay(value) {
  if (typeof value !== 'string' || !DAYS.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, month - 1, day);
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() + 1 === month &&
    candidate.getUTCDate() === day;
}
function eventKey(entry) { return `${entry.id}|${entry.reason}|${entry.path}`; }
function ordered(a, b) { return a.key.localeCompare(b.key, 'en'); }
function isSafeNote(value) {
  if (typeof value !== 'string' || value.length > MAX_NOTES) return false;
  return ![...value].some((char) => char.codePointAt(0) < 32) &&
    !/<[a-z/!]/i.test(value);
}

/** Keys are never derived from users' names, email addresses or locations. */
export function impactIdentity(entry) {
  return eventKey(entry);
}

export function buildTriageQueue(packet) {
  const check = validateImpactPacket(packet);
  if (!check.ok) return { ok: false, problems: check.problems, queue: null };
  if (packet.impacts.length > MAX_ITEMS) {
    return { ok: false, problems: [problem('TRIAGE_LIMIT', '/impacts')], queue: null };
  }
  const items = packet.impacts.map((entry) => ({
    key: eventKey(entry), id: entry.id, recordId: entry.recordId,
    claimKey: entry.claimKey, state: entry.state, reason: entry.reason,
    level: entry.level, sourcePath: entry.path, status: 'open',
    history: [],
  })).sort(ordered);
  return { ok: true, problems: [], queue: { version: TRIAGE_VERSION, items } };
}

function checkItem(entry, path) {
  const problems = [];
  if (!plain(entry) || !Array.isArray(entry.history)) return [problem('ITEM_INVALID', path)];
  for (const name of ['key', 'id', 'recordId', 'claimKey', 'reason', 'sourcePath']) {
    if (typeof entry[name] !== 'string' || !entry[name] || entry[name].length > 1024) {
      problems.push(problem('ITEM_FIELD', `${path}/${name}`));
    }
  }
  if (!IMPACT_REASONS.includes(entry.reason)) problems.push(problem('REASON_INVALID', path));
  if (!STATUSES.has(entry.status)) problems.push(problem('STATUS_INVALID', path));
  if (!['YES', 'NO', 'UNKNOWN'].includes(entry.state)) problems.push(problem('STATE_INVALID', path));
  if (!['review', 'block'].includes(entry.level)) problems.push(problem('LEVEL_INVALID', path));
  if (entry.history.length > 1000) problems.push(problem('HISTORY_LIMIT', path));
  let current = 'open';
  let lastDay = null;
  for (const [index, event] of entry.history.entries()) {
    const here = `${path}/history/${index}`;
    if (!plain(event) || !ACTIONS.has(event.action) || !validDay(event.on) ||
      !isSafeNote(event.note ?? '')) {
      problems.push(problem('HISTORY_EVENT_INVALID', here));
      continue;
    }
    if (lastDay && event.on < lastDay) problems.push(problem('HISTORY_OUT_OF_ORDER', here));
    lastDay = event.on;
    const next = stateAfter(current, event.action);
    if (next === null) problems.push(problem('HISTORY_TRANSITION_INVALID', here));
    else current = next;
  }
  if (current !== entry.status) problems.push(problem('STATUS_HISTORY_MISMATCH', path));
  return problems;
}

function stateAfter(current, action) {
  if (action === 'defer' && current === 'open') return 'deferred';
  if (action === 'reopen' && (current === 'deferred' || current === 'resolved')) return 'open';
  if (action === 'resolve' && current === 'open') return 'resolved';
  return null;
}

export function validateTriageQueue(queue) {
  if (!plain(queue) || queue.version !== TRIAGE_VERSION || !Array.isArray(queue.items)) {
    return { ok: false, problems: [problem('QUEUE_INVALID', '/')] };
  }
  const problems = [];
  if (queue.items.length > MAX_ITEMS) problems.push(problem('TRIAGE_LIMIT', '/items'));
  const keys = new Set();
  let historyCount = 0;
  for (const [index, entry] of queue.items.entries()) {
    if (index >= MAX_ITEMS) break;
    problems.push(...checkItem(entry, `/items/${index}`));
    if (plain(entry) && typeof entry.key === 'string') {
      if (keys.has(entry.key)) problems.push(problem('DUPLICATE_KEY', `/items/${index}/key`));
      keys.add(entry.key);
    }
    historyCount += Array.isArray(entry?.history) ? entry.history.length : 0;
  }
  if (historyCount > MAX_EVENTS) problems.push(problem('EVENT_LIMIT', '/items'));
  for (const key of Object.keys(queue)) {
    if (!['version', 'items'].includes(key)) problems.push(problem('EXTRA_KEY', `/${key}`));
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Single-item atomic transition. Resolving a review item does not assert
 * the underlying claim was checked or became YES, NO, or accessible.
 */
export function transitionTriage(queue, key, action, on, note = '') {
  const check = validateTriageQueue(queue);
  if (!check.ok) return { ok: false, problems: check.problems, queue };
  if (!ACTIONS.has(action) || !validDay(on) || !isSafeNote(note)) {
    return { ok: false, problems: [problem('ACTION_INVALID', '/action')], queue };
  }
  const index = queue.items.findIndex((item) => item.key === key);
  if (index < 0) return { ok: false, problems: [problem('ITEM_NOT_FOUND', '/key')], queue };
  const target = queue.items[index];
  const status = stateAfter(target.status, action);
  if (status === null) return { ok: false, problems: [problem('TRANSITION_DENIED', '/action')], queue };
  const last = target.history.at(-1)?.on;
  if (last && on < last) return { ok: false, problems: [problem('EVENT_OUT_OF_ORDER', '/on')], queue };
  const next = { ...target, status,
    history: [...target.history, { action, on, note }] };
  const candidate = { version: TRIAGE_VERSION,
    items: queue.items.map((item, position) => position === index ? next : item) };
  const result = validateTriageQueue(candidate);
  return result.ok ? { ok: true, problems: [], queue: candidate } :
    { ok: false, problems: result.problems, queue };
}

/** Restore prior human decisions only if the impact is still identical. */
export function reconcileTriage(previous, nextPacket) {
  const check = validateTriageQueue(previous);
  if (!check.ok) return { ok: false, problems: check.problems, queue: null, reopened: [] };
  const fresh = buildTriageQueue(nextPacket);
  if (!fresh.ok) return { ok: false, problems: fresh.problems, queue: null, reopened: [] };
  const prior = new Map(previous.items.map((item) => [item.key, item]));
  const reopened = [];
  const items = fresh.queue.items.map((item) => {
    const original = prior.get(item.key);
    if (!original) { reopened.push(item.key); return item; }
    if (original.state !== item.state || original.level !== item.level ||
        original.sourcePath !== item.sourcePath) {
      reopened.push(item.key);
      return item;
    }
    return { ...item, status: original.status,
      history: original.history.map((event) => ({ ...event })) };
  });
  const queue = { version: TRIAGE_VERSION, items };
  const result = validateTriageQueue(queue);
  return { ok: result.ok, problems: result.problems,
    queue: result.ok ? queue : null, reopened: reopened.sort() };
}

export function summarizeTriage(queue) {
  const check = validateTriageQueue(queue);
  if (!check.ok) return { ok: false, problems: check.problems, summary: null };
  const byStatus = Object.fromEntries(TRIAGE_STATUS.map((status) => [status, 0]));
  const byReason = Object.fromEntries(IMPACT_REASONS.map((reason) => [reason, 0]));
  let blockedOpen = 0;
  let unknown = 0;
  for (const entry of queue.items) {
    byStatus[entry.status] += 1;
    byReason[entry.reason] += 1;
    if (entry.level === 'block' && entry.status !== 'resolved') blockedOpen += 1;
    if (entry.state === 'UNKNOWN') unknown += 1;
  }
  return { ok: true, problems: [], summary: { total: queue.items.length,
    byStatus, byReason, blockedOpen, UNKNOWN: unknown } };
}

/** Read-only filters: stable keys and no claim-state inference. */
export function queryTriage(queue, filters = {}) {
  const check = validateTriageQueue(queue);
  if (!check.ok) return { ok: false, problems: check.problems, items: [] };
  const problems = [];
  if (filters.status !== undefined && !STATUSES.has(filters.status)) problems.push(problem('FILTER_STATUS', '/status'));
  if (filters.reason !== undefined && !IMPACT_REASONS.includes(filters.reason)) problems.push(problem('FILTER_REASON', '/reason'));
  if (filters.level !== undefined && !['block', 'review'].includes(filters.level)) problems.push(problem('FILTER_LEVEL', '/level'));
  if (filters.state !== undefined && !['YES', 'NO', 'UNKNOWN'].includes(filters.state)) problems.push(problem('FILTER_STATE', '/state'));
  if (filters.limit !== undefined && (!Number.isSafeInteger(filters.limit) || filters.limit < 1 || filters.limit > 1000)) {
    problems.push(problem('FILTER_LIMIT', '/limit'));
  }
  if (problems.length) return { ok: false, problems, items: [] };
  const items = queue.items.filter((item) =>
    (filters.status === undefined || item.status === filters.status) &&
    (filters.reason === undefined || item.reason === filters.reason) &&
    (filters.level === undefined || item.level === filters.level) &&
    (filters.state === undefined || item.state === filters.state));
  return { ok: true, problems: [], items: items.slice(0, filters.limit ?? 1000).map((item) => ({ ...item,
    history: item.history.map((event) => ({ ...event })) })) };
}
