/**
 * Pure handoff event replay and reconciliation.
 * Work decisions describe the handling of a claim, never its truth.
 */
import {
  emptyHandoff, HANDOFF_DECISIONS, HANDOFF_PRIORITIES, HANDOFF_STATES,
  makeIssue, safeClone, safeId, stableJson,
  validateHandoff, validDay,
} from './offline-handoff-schema.mjs';

export const LEGAL_TRANSITIONS = Object.freeze({
  PENDING: Object.freeze(['PENDING', 'NEEDS_SOURCE', 'DEFERRED', 'REVIEWED', 'DISMISSED']),
  NEEDS_SOURCE: Object.freeze(['NEEDS_SOURCE', 'PENDING', 'DEFERRED', 'REVIEWED', 'DISMISSED']),
  DEFERRED: Object.freeze(['DEFERRED', 'PENDING', 'NEEDS_SOURCE', 'REVIEWED', 'DISMISSED']),
  REVIEWED: Object.freeze(['REVIEWED', 'PENDING', 'NEEDS_SOURCE']),
  DISMISSED: Object.freeze(['DISMISSED', 'PENDING']),
});

export const DEFAULT_REVIEW = Object.freeze({
  decision: 'PENDING', priority: 'NORMAL', on: null, reason: null,
  eventId: null, sourceIds: Object.freeze([]),
});

export function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortById(values) {
  return [...values].sort((a, b) => compareIds(a.id, b.id));
}

export function eventSequence(events) {
  return [...events].sort((a, b) => compareIds(a.on, b.on) || compareIds(a.id, b.id));
}

export function allowedTransition(from, to) {
  return Boolean(LEGAL_TRANSITIONS[from]?.includes(to));
}

export function replayReviews(document) {
  const validated = validateHandoff(document);
  if (!validated.ok) return { ok: false, issues: validated.issues, items: [] };
  const reviews = new Map(document.claims.map((claim) => [claim.id, {
    claimId: claim.id, state: claim.state, field: claim.field,
    recordId: claim.recordId, label: safeClone(claim.label),
    ...DEFAULT_REVIEW, sourceIds: [...claim.sourceIds],
  }]));
  const issues = [];
  for (const event of eventSequence(document.events)) {
    const entry = reviews.get(event.claimId);
    if (!entry) continue;
    if (!allowedTransition(entry.decision, event.decision)) {
      issues.push(makeIssue('ILLEGAL_TRANSITION', `/events/${event.id}`,
        `Cannot move ${entry.decision} to ${event.decision}`));
      continue;
    }
    // Decisions intentionally never change the accessibility state.
    entry.decision = event.decision;
    entry.priority = event.priority;
    entry.on = event.on;
    entry.reason = event.reason ? safeClone(event.reason) : null;
    entry.eventId = event.id;
    entry.sourceIds = [...new Set([...entry.sourceIds, ...(event.sourceIds ?? [])])].sort(compareIds);
  }
  const items = [...reviews.values()].sort((a, b) => compareIds(a.recordId, b.recordId) ||
    compareIds(a.field, b.field) || compareIds(a.claimId, b.claimId));
  return { ok: issues.length === 0, issues, items };
}

export function reviewCounts(items) {
  const counts = Object.fromEntries(HANDOFF_DECISIONS.map((key) => [key, 0]));
  const priority = Object.fromEntries(HANDOFF_PRIORITIES.map((key) => [key, 0]));
  const states = Object.fromEntries(HANDOFF_STATES.map((key) => [key, 0]));
  const records = new Set();
  for (const item of items) {
    counts[item.decision] += 1;
    priority[item.priority] += 1;
    states[item.state] += 1;
    records.add(item.recordId);
  }
  return Object.freeze({ items: items.length, records: records.size, decisions: counts, priorities: priority, states });
}

export function filterReviews(items, filter = {}) {
  const selected = items.filter((item) => {
    if (filter.decision && item.decision !== filter.decision) return false;
    if (filter.priority && item.priority !== filter.priority) return false;
    if (filter.state && item.state !== filter.state) return false;
    if (filter.recordId && item.recordId !== filter.recordId) return false;
    if (filter.field && item.field !== filter.field) return false;
    if (filter.needsSource && item.sourceIds.length !== 0) return false;
    if (filter.changedAfter && (!item.on || item.on <= filter.changedAfter)) return false;
    return true;
  });
  return selected.sort((a, b) => compareIds(a.recordId, b.recordId) ||
    compareIds(a.field, b.field) || compareIds(a.claimId, b.claimId));
}

export function priorityOrder(priority) {
  return HANDOFF_PRIORITIES.indexOf(priority);
}

export function triageReviews(items) {
  return [...items].sort((a, b) => priorityOrder(b.priority) - priorityOrder(a.priority) ||
    Number(b.decision === 'PENDING') - Number(a.decision === 'PENDING') ||
    compareIds(a.recordId, b.recordId) || compareIds(a.claimId, b.claimId));
}

export function appendReviewEvent(document, event) {
  const checked = validateHandoff(document);
  if (!checked.ok) return { ok: false, issues: checked.issues, document: null };
  const copy = safeClone(document);
  copy.events.push(safeClone(event));
  const next = validateHandoff(copy);
  if (!next.ok) return { ok: false, issues: next.issues, document: null };
  const replay = replayReviews(copy);
  if (!replay.ok) return { ok: false, issues: replay.issues, document: null };
  return { ok: true, issues: [], document: copy };
}

export function identifyChanges(earlier, later) {
  const previous = new Map(earlier.items.map((item) => [item.claimId, item]));
  const current = new Map(later.items.map((item) => [item.claimId, item]));
  const changes = [];
  const ids = [...new Set([...previous.keys(), ...current.keys()])].sort(compareIds);
  for (const id of ids) {
    const before = previous.get(id) ?? null;
    const after = current.get(id) ?? null;
    if (!before) { changes.push({ id, kind: 'ADDED', before, after }); continue; }
    if (!after) { changes.push({ id, kind: 'REMOVED', before, after }); continue; }
    if (before.state !== after.state) changes.push({ id, kind: 'STATE_CHANGED', before, after });
    if (before.decision !== after.decision) changes.push({ id, kind: 'DECISION_CHANGED', before, after });
    if (before.priority !== after.priority) changes.push({ id, kind: 'PRIORITY_CHANGED', before, after });
    if (stableJson(before.sourceIds) !== stableJson(after.sourceIds)) {
      changes.push({ id, kind: 'SOURCES_CHANGED', before, after });
    }
  }
  return changes;
}

export function compareHandoffReviews(earlier, later) {
  const before = replayReviews(earlier);
  const after = replayReviews(later);
  if (!before.ok || !after.ok) {
    return { ok: false, issues: [
      ...before.issues.map((issue) => ({ ...issue, snapshot: 'earlier' })),
      ...after.issues.map((issue) => ({ ...issue, snapshot: 'later' })),
    ], changes: [] };
  }
  return { ok: true, issues: [], changes: identifyChanges(before, after),
    before: reviewCounts(before.items), after: reviewCounts(after.items) };
}

export function mergeHandoffs(left, right) {
  const a = validateHandoff(left);
  const b = validateHandoff(right);
  if (!a.ok || !b.ok) return { ok: false, issues: [...a.issues, ...b.issues], document: null };
  const merged = emptyHandoff();
  const issues = [];
  for (const key of ['sources', 'claims', 'events']) {
    const entries = new Map();
    for (const item of [...left[key], ...right[key]]) {
      const previous = entries.get(item.id);
      if (previous && stableJson(previous) !== stableJson(item)) {
        issues.push(makeIssue('MERGE_CONFLICT', `/${key}/${item.id}`, 'ID has conflicting definitions'));
      } else entries.set(item.id, safeClone(item));
    }
    merged[key] = sortById([...entries.values()]);
  }
  if (issues.length) return { ok: false, issues, document: null };
  const valid = validateHandoff(merged);
  if (!valid.ok) return { ok: false, issues: valid.issues, document: null };
  const replay = replayReviews(merged);
  if (!replay.ok) return { ok: false, issues: replay.issues, document: null };
  return { ok: true, issues: [], document: merged };
}

export function groupReviewsByRecord(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.recordId)) groups.set(item.recordId, []);
    groups.get(item.recordId).push(item);
  }
  return [...groups].sort((a, b) => compareIds(a[0], b[0])).map(([recordId, entries]) => ({
    recordId, entries: [...entries].sort((a, b) => compareIds(a.field, b.field)),
    counts: reviewCounts(entries),
  }));
}

export function sourceCoverage(document) {
  const valid = validateHandoff(document);
  if (!valid.ok) return { ok: false, issues: valid.issues, coverage: null };
  const refs = new Map(document.sources.map((source) => [source.id, 0]));
  const without = [];
  for (const claim of document.claims) {
    if (!claim.sourceIds.length) without.push(claim.id);
    for (const id of claim.sourceIds) refs.set(id, refs.get(id) + 1);
  }
  const unused = [...refs].filter(([, count]) => count === 0).map(([id]) => id).sort(compareIds);
  return { ok: true, issues: [], coverage: {
    sources: refs.size, citedSources: refs.size - unused.length,
    uncitedSources: unused, claimsWithoutSources: without.sort(compareIds),
    referenceCounts: Object.fromEntries([...refs].sort((a, b) => compareIds(a[0], b[0]))),
  } };
}

export function reviewReadiness(document) {
  const replay = replayReviews(document);
  if (!replay.ok) return { ok: false, issues: replay.issues, readiness: null };
  const coverage = sourceCoverage(document);
  const blocked = replay.items.filter((item) => item.state !== 'UNKNOWN' && !item.sourceIds.length);
  const unfinished = replay.items.filter((item) => !['REVIEWED', 'DISMISSED'].includes(item.decision));
  return { ok: true, issues: [], readiness: {
    complete: unfinished.length === 0 && blocked.length === 0,
    unfinished: unfinished.map((item) => item.claimId),
    unsupported: blocked.map((item) => item.claimId),
    coverage: coverage.coverage,
    caution: 'A complete review does not prove physical accessibility.',
  } };
}

export function constructReviewEvent({ id, claimId, on, decision, priority = 'NORMAL', reason, sourceIds }) {
  if (!safeId(id) || !safeId(claimId) || !validDay(on) ||
      !HANDOFF_DECISIONS.includes(decision) || !HANDOFF_PRIORITIES.includes(priority)) return null;
  const event = { id, claimId, on, decision, priority };
  if (reason !== undefined) event.reason = safeClone(reason);
  if (sourceIds !== undefined) event.sourceIds = [...sourceIds];
  return event;
}

export function explainReviewState(item, language = 'en') {
  const fr = language === 'fr';
  const copy = {
    PENDING: ['Awaiting review', 'En attente d’examen'],
    NEEDS_SOURCE: ['Source needed', 'Source nécessaire'],
    DEFERRED: ['Deferred', 'Reporté'],
    REVIEWED: ['Review recorded', 'Examen consigné'],
    DISMISSED: ['Dismissed from queue', 'Retiré de la liste'],
  };
  return copy[item.decision]?.[fr ? 1 : 0] ?? (fr ? 'UNKNOWN' : 'UNKNOWN');
}

export function selectNextReview(items) {
  const pending = items.filter((item) => !['REVIEWED', 'DISMISSED'].includes(item.decision));
  return triageReviews(pending)[0] ?? null;
}

export function reviewAuditTrail(document, claimId) {
  if (!safeId(claimId)) return [];
  return eventSequence(document.events.filter((event) => event.claimId === claimId)).map((event) => ({
    id: event.id, claimId: event.claimId, on: event.on,
    decision: event.decision, priority: event.priority,
    sourceIds: [...(event.sourceIds ?? [])],
  }));
}

export function allStatesUnmodified(document, replay) {
  const states = new Map(document.claims.map((claim) => [claim.id, claim.state]));
  return replay.items.every((item) => item.state === states.get(item.claimId));
}

export function reviewConflicts(document) {
  const seen = new Map();
  const problems = [];
  for (const event of eventSequence(document.events)) {
    const key = `${event.claimId}|${event.on}`;
    const previous = seen.get(key);
    if (previous && (previous.decision !== event.decision || previous.priority !== event.priority)) {
      problems.push(makeIssue('SAME_DAY_CONFLICT', `/events/${event.id}`, 'Conflicting same-day review events'));
    }
    seen.set(key, event);
  }
  return problems;
}

export function reviewDigest(document) {
  const replay = replayReviews(document);
  if (!replay.ok) return { ok: false, issues: replay.issues, digest: null };
  const counts = reviewCounts(replay.items);
  const coverage = sourceCoverage(document);
  return { ok: true, issues: [], digest: {
    counts, coverage: coverage.coverage,
    conflicts: reviewConflicts(document).length,
    nextClaimId: selectNextReview(replay.items)?.claimId ?? null,
  } };
}

export function reassessAll(document) {
  const valid = validateHandoff(document);
  if (!valid.ok) return { ok: false, issues: valid.issues };
  const replay = replayReviews(document);
  if (!replay.ok) return { ok: false, issues: replay.issues };
  const conflicts = reviewConflicts(document);
  return { ok: conflicts.length === 0, issues: conflicts,
    unchanged: allStatesUnmodified(document, replay),
    reviewCount: replay.items.length };
}
