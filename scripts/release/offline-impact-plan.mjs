/**
 * Deterministic offline impact planning for the App's review queue.
 * This is a provenance workflow, not a survey, publication decision, or
 * statement that a venue or service is accessible. No network or clock reads.
 */
import { validateQueue, validDate, safeUrl } from './offline-review-queue.mjs';

export const IMPACT_VERSION = 1;
export const IMPACT_REASONS = Object.freeze([
  'SOURCE_REMOVED', 'SOURCE_REPLACED', 'LICENCE_CHANGED',
  'RETRIEVAL_CHANGED', 'TIER_CHANGED', 'SOURCE_DATE_CHANGED',
  'REVIEW_DATE_PASSED', 'CLAIM_CHANGED', 'NEW_REVIEW_ITEM', 'REVIEW_ITEM_REMOVED',
]);
const REASON_SET = new Set(IMPACT_REASONS);
const MAX_ITEMS = 20_000;
const MAX_CHANGESET = 20_000;
const IMPACT_LEVELS = Object.freeze({
  SOURCE_REMOVED: 'block', SOURCE_REPLACED: 'review',
  LICENCE_CHANGED: 'block', RETRIEVAL_CHANGED: 'review',
  TIER_CHANGED: 'review', SOURCE_DATE_CHANGED: 'review',
  REVIEW_DATE_PASSED: 'review', CLAIM_CHANGED: 'review',
  NEW_REVIEW_ITEM: 'review', REVIEW_ITEM_REMOVED: 'review',
});
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);

function issue(code, path) { return Object.freeze({ code, path }); }
function pointer(text) { return String(text).replace(/~/g, '~0').replace(/\//g, '~1'); }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function id(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    /^[a-z0-9][a-z0-9_.:-]*$/i.test(value) && !RESERVED.has(value.toLowerCase());
}
function metadata(item) {
  const p = item.provenance;
  return {
    source: p.source, licence: p.licence, retrievedOn: p.retrievedOn,
    tier: p.tier, sourceDate: p.sourceDate ?? null,
  };
}
function itemDescriptor(item) {
  return { id: item.id, recordId: item.recordId, claimKey: item.claimKey,
    state: item.state, status: item.status, reason: item.reason,
    metadata: metadata(item) };
}
function ordered(left, right) {
  return left.id.localeCompare(right.id, 'en') ||
    left.reason.localeCompare(right.reason, 'en');
}
function boundedDay(date, maxDays) {
  if (!validDate(date) || !Number.isSafeInteger(maxDays) || maxDays < 0 || maxDays > 36500) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + maxDays);
  return parsed.toISOString().slice(0, 10);
}
function impact(item, reason, path, old = null, next = null) {
  return Object.freeze({ id: item.id, recordId: item.recordId,
    claimKey: item.claimKey, state: item.state, reason,
    level: IMPACT_LEVELS[reason], path, before: old, after: next,
    action: 'HUMAN_REVIEW_REQUIRED' });
}

/** Compare only fields with provenance meaning; labels/history are not evidence. */
export function compareEvidenceItem(before, after) {
  const changes = [];
  const left = metadata(before);
  const right = metadata(after);
  for (const [field, reason] of [
    ['source', 'SOURCE_REPLACED'], ['licence', 'LICENCE_CHANGED'],
    ['retrievedOn', 'RETRIEVAL_CHANGED'], ['tier', 'TIER_CHANGED'],
    ['sourceDate', 'SOURCE_DATE_CHANGED'],
  ]) {
    if (left[field] !== right[field]) {
      changes.push(impact(after, reason, `/provenance/${field}`, left[field], right[field]));
    }
  }
  if (before.state !== after.state) {
    changes.push(impact(after, 'CLAIM_CHANGED', '/state', before.state, after.state));
  }
  return changes;
}

/**
 * The planner never mutates either queue. A queue failing canonical validation
 * produces no partial impact result, even when a subset of its items is valid.
 */
export function planQueueImpact(previous, current, options = {}) {
  const before = validateQueue(previous, { today: options.today });
  const after = validateQueue(current, { today: options.today });
  const problems = [
    ...before.problems.map((p) => issue(`BEFORE_${p.code}`, p.path)),
    ...after.problems.map((p) => issue(`AFTER_${p.code}`, p.path)),
  ];
  if (!before.ok || !after.ok) return { ok: false, problems, impacts: [], summary: null };
  if (previous.items.length > MAX_ITEMS || current.items.length > MAX_ITEMS) {
    return { ok: false, problems: [issue('ITEM_LIMIT', '/items')], impacts: [], summary: null };
  }
  const earlier = new Map(previous.items.map((item) => [item.id, item]));
  const later = new Map(current.items.map((item) => [item.id, item]));
  const impacts = [];
  for (const [key, item] of later) {
    const old = earlier.get(key);
    if (!old) {
      impacts.push(impact(item, 'NEW_REVIEW_ITEM', '/items', null, itemDescriptor(item)));
    } else {
      impacts.push(...compareEvidenceItem(old, item));
    }
  }
  for (const [key, item] of earlier) {
    if (!later.has(key)) {
      impacts.push(impact(item, 'REVIEW_ITEM_REMOVED', '/items', itemDescriptor(item), null));
    }
  }
  if (options.today !== undefined && !validDate(options.today)) {
    return { ok: false, problems: [issue('TODAY_INVALID', '/today')], impacts: [], summary: null };
  }
  if (options.reviewAfterDays !== undefined &&
    (!Number.isSafeInteger(options.reviewAfterDays) || options.reviewAfterDays < 0 || options.reviewAfterDays > 36500)) {
    return { ok: false, problems: [issue('REVIEW_WINDOW_INVALID', '/reviewAfterDays')], impacts: [], summary: null };
  }
  if (validDate(options.today) && Number.isSafeInteger(options.reviewAfterDays)) {
    for (const item of current.items) {
      const deadline = boundedDay(item.provenance.retrievedOn, options.reviewAfterDays);
      if (deadline && deadline < options.today) {
        impacts.push(impact(item, 'REVIEW_DATE_PASSED', '/provenance/retrievedOn', deadline, options.today));
      }
    }
  }
  impacts.sort(ordered);
  const count = Object.fromEntries(IMPACT_REASONS.map((reason) => [reason, 0]));
  const unique = new Set();
  let blocks = 0;
  for (const entry of impacts) {
    count[entry.reason] += 1;
    unique.add(entry.id);
    if (entry.level === 'block') blocks += 1;
  }
  return { ok: true, problems: [], impacts, summary: Object.freeze({
    compared: current.items.length, affectedItems: unique.size,
    totalImpacts: impacts.length, blocking: blocks, byReason: count,
    unknownClaims: current.items.filter((item) => item.state === 'UNKNOWN').length,
  }) };
}

/** A source withdrawal impacts all dependent items, not merely the first. */
export function planSourceWithdrawal(queue, source, options = {}) {
  const check = validateQueue(queue, { today: options.today });
  if (!check.ok) return { ok: false, problems: check.problems, impacts: [], summary: null };
  if (!safeUrl(source)) {
    return { ok: false, problems: [issue('SOURCE_INVALID', '/source')], impacts: [], summary: null };
  }
  const impacts = queue.items
    .filter((item) => item.provenance.source === source)
    .map((item) => impact(item, 'SOURCE_REMOVED', '/provenance/source', source, null))
    .sort(ordered);
  return { ok: true, problems: [], impacts, summary: {
    compared: queue.items.length, affectedItems: impacts.length,
    totalImpacts: impacts.length, blocking: impacts.length,
    unknownClaims: impacts.filter((entry) => entry.state === 'UNKNOWN').length,
  } };
}

/** Validate externally supplied impact packets before display or export. */
export function validateImpactPacket(value) {
  const problems = [];
  if (!plain(value) || value.version !== IMPACT_VERSION || !Array.isArray(value.impacts)) {
    return { ok: false, problems: [issue('PACKET_SHAPE', '/')], packet: null };
  }
  if (value.impacts.length > MAX_CHANGESET) problems.push(issue('IMPACT_LIMIT', '/impacts'));
  const seen = new Set();
  for (const [index, entry] of value.impacts.entries()) {
    if (index >= MAX_CHANGESET) break;
    const path = `/impacts/${index}`;
    if (!plain(entry)) { problems.push(issue('IMPACT_SHAPE', path)); continue; }
    if (!id(entry.id) || !id(entry.recordId) || !id(entry.claimKey)) {
      problems.push(issue('IDENTITY_INVALID', path));
    }
    if (!REASON_SET.has(entry.reason)) problems.push(issue('REASON_INVALID', path));
    if (!['YES', 'NO', 'UNKNOWN'].includes(entry.state)) problems.push(issue('STATE_INVALID', path));
    if (entry.action !== 'HUMAN_REVIEW_REQUIRED') problems.push(issue('ACTION_INVALID', path));
    if (entry.level !== IMPACT_LEVELS[entry.reason]) problems.push(issue('LEVEL_INVALID', path));
    if (typeof entry.path !== 'string' || !entry.path.startsWith('/') || entry.path.length > 1024) {
      problems.push(issue('PATH_INVALID', path));
    }
    const key = `${entry.id}\u0000${entry.reason}\u0000${entry.path}`;
    if (seen.has(key)) problems.push(issue('IMPACT_DUPLICATE', path));
    seen.add(key);
  }
  for (const key of Object.keys(value)) {
    if (!['version', 'impacts'].includes(key)) problems.push(issue('PACKET_EXTRA_KEY', `/${pointer(key)}`));
  }
  return { ok: problems.length === 0, problems, packet: problems.length ? null : value };
}

export function toImpactPacket(plan) {
  if (!plan?.ok || !Array.isArray(plan.impacts)) return null;
  return { version: IMPACT_VERSION, impacts: plan.impacts.map((entry) => ({ ...entry })) };
}

/** Event summary deliberately retains uppercase UNKNOWN. */
export function summarizeImpact(plan) {
  if (!plan?.ok) return null;
  const summary = plan.summary;
  return { ...summary, token: 'UNKNOWN',
    hasBlockingSourceLoss: plan.impacts.some((entry) => entry.reason === 'SOURCE_REMOVED'),
    nextAction: plan.impacts.length ? 'HUMAN_REVIEW_REQUIRED' : 'NO_REVIEW_CHANGES',
  };
}
