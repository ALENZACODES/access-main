/**
 * Offline review-queue reconciliation. It merges workflow metadata only,
 * and never upgrades claim state or concludes that a venue is accessible.
 * Conflicts are reported, not resolved by timestamps, source tiers or votes.
 * Inputs are validated, bounded and left untouched. Network-free by design.
 */
import { createHash } from 'node:crypto';
import {
  REVIEW_QUEUE_VERSION, validateQueue, validDate, validId,
} from './offline-review-queue.mjs';

export const SYNC_VERSION = 1;
export const CONFLICT_KINDS = Object.freeze([
  'removed', 'concurrent-addition', 'record-changed', 'claim-changed',
  'provenance-changed', 'label-changed', 'history-diverged',
  'workflow-diverged', 'identity-changed',
]);
export const SYNC_MAX_ITEMS = 20_000;
const MAX_HASH_INPUT = 8_000_000;
const CONFLICT = new Set(CONFLICT_KINDS);

function failure(code, path) { return { code, path }; }
function stableIds(queue) { return [...queue.items].sort((a, b) => a.id.localeCompare(b.id, 'en')); }
function canonicalEntry(item) {
  return {
    id: item.id, recordId: item.recordId, claimKey: item.claimKey,
    reason: item.reason, status: item.status, state: item.state,
    createdOn: item.createdOn,
    label: { en: item.label.en, fr: item.label.fr },
    provenance: {
      source: item.provenance.source, licence: item.provenance.licence,
      retrievedOn: item.provenance.retrievedOn, tier: item.provenance.tier,
      ...(item.provenance.sourceDate === undefined ? {} : { sourceDate: item.provenance.sourceDate }),
    },
    history: item.history.map((entry) => ({ action: entry.action, on: entry.on, to: entry.to })),
  };
}
export function canonicalQueue(queue) {
  return { version: REVIEW_QUEUE_VERSION, items: stableIds(queue).map(canonicalEntry) };
}

/** A fingerprint is for optimistic concurrency, not source authenticity. */
export function queueFingerprint(queue, options = {}) {
  const check = validateQueue(queue, options);
  if (!check.ok) return { ok: false, problems: check.problems, fingerprint: null };
  const serialized = JSON.stringify(canonicalQueue(queue));
  if (Buffer.byteLength(serialized, 'utf8') > MAX_HASH_INPUT) {
    return { ok: false, problems: [failure('HASH_LIMIT', '/')], fingerprint: null };
  }
  const fingerprint = createHash('sha256').update(serialized, 'utf8').digest('hex');
  return { ok: true, problems: [], fingerprint: `sha256:${fingerprint}` };
}

function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sameIdentity(a, b) {
  return a.recordId === b.recordId && a.claimKey === b.claimKey && a.createdOn === b.createdOn;
}
function sameClaim(a, b) { return a.state === b.state && a.reason === b.reason; }
function sameProvenance(a, b) { return equal(canonicalEntry(a).provenance, canonicalEntry(b).provenance); }
function sameLabel(a, b) { return equal(a.label, b.label); }
function sameHistory(a, b) { return equal(a.history, b.history); }
function sameWorkflow(a, b) { return a.status === b.status && sameHistory(a, b); }

/** Return the bounded, explicit differences between two accepted records. */
export function itemDifferences(before, after) {
  const kinds = [];
  if (before.id !== after.id || !sameIdentity(before, after)) kinds.push('identity-changed');
  if (!sameClaim(before, after)) kinds.push('claim-changed');
  if (!sameProvenance(before, after)) kinds.push('provenance-changed');
  if (!sameLabel(before, after)) kinds.push('label-changed');
  if (!sameHistory(before, after)) kinds.push('history-diverged');
  if (before.status !== after.status) kinds.push('workflow-diverged');
  return kinds;
}

function sameItem(a, b) { return equal(canonicalEntry(a), canonicalEntry(b)); }
function mapById(queue) { return new Map(queue.items.map((item) => [item.id, item])); }
function entryHash(item) {
  return createHash('sha256').update(JSON.stringify(canonicalEntry(item))).digest('hex');
}
function makeConflict(id, kind, base, local, remote) {
  return {
    id, kind,
    baseHash: base ? entryHash(base) : null,
    localHash: local ? entryHash(local) : null,
    remoteHash: remote ? entryHash(remote) : null,
  };
}

/**
 * Three-way reconcile with no last-write-wins. A known claim cannot be
 * promoted, overwritten or retracted by a merge decision. Any changed
 * source metadata on both sides becomes a conflict, even if tier increased.
 */
export function reconcileQueues(base, local, remote, options = {}) {
  const checks = [
    ['base', validateQueue(base, options)],
    ['local', validateQueue(local, options)],
    ['remote', validateQueue(remote, options)],
  ];
  const problems = checks.flatMap(([name, check]) => check.problems.map((value) => ({
    ...value, snapshot: name,
  })));
  if (problems.length) return { ok: false, problems, merged: null, conflicts: [], summary: null };
  if (base.items.length > SYNC_MAX_ITEMS || local.items.length > SYNC_MAX_ITEMS ||
      remote.items.length > SYNC_MAX_ITEMS) {
    return { ok: false, problems: [failure('SYNC_LIMIT', '/')], merged: null, conflicts: [], summary: null };
  }
  const b = mapById(base);
  const l = mapById(local);
  const r = mapById(remote);
  const ids = [...new Set([...b.keys(), ...l.keys(), ...r.keys()])].sort((a, z) => a.localeCompare(z, 'en'));
  const merged = [];
  const conflicts = [];
  const summary = { added: 0, removed: 0, unchanged: 0, local: 0, remote: 0, conflicts: 0 };
  for (const id of ids) {
    const original = b.get(id);
    const left = l.get(id);
    const right = r.get(id);
    if (original === undefined) {
      if (left === undefined || right === undefined) {
        merged.push(canonicalEntry(left ?? right));
        summary.added += 1;
      } else if (sameItem(left, right)) {
        merged.push(canonicalEntry(left));
        summary.added += 1;
      } else {
        conflicts.push(makeConflict(id, 'concurrent-addition', null, left, right));
      }
      continue;
    }
    const leftMissing = left === undefined;
    const rightMissing = right === undefined;
    if (leftMissing && rightMissing) { summary.removed += 1; continue; }
    if (leftMissing || rightMissing) {
      const other = left ?? right;
      if (sameItem(original, other)) {
        // An intentional single-side deletion is an administrative edit.
        summary.removed += 1;
      } else {
        conflicts.push(makeConflict(id, 'removed', original, left, right));
      }
      continue;
    }
    const leftChanged = !sameItem(original, left);
    const rightChanged = !sameItem(original, right);
    if (!leftChanged && !rightChanged) {
      merged.push(canonicalEntry(original));
      summary.unchanged += 1;
    } else if (!leftChanged) {
      merged.push(canonicalEntry(right));
      summary.remote += 1;
    } else if (!rightChanged) {
      merged.push(canonicalEntry(left));
      summary.local += 1;
    } else if (sameItem(left, right)) {
      merged.push(canonicalEntry(left));
      summary.unchanged += 1;
    } else {
      const changes = [...new Set([
        ...itemDifferences(original, left), ...itemDifferences(original, right),
      ])];
      // A single conflict points at the highest-risk divergence.
      const priority = [
        'identity-changed', 'claim-changed', 'provenance-changed',
        'label-changed', 'history-diverged', 'workflow-diverged',
      ];
      const kind = priority.find((value) => changes.includes(value)) ?? 'record-changed';
      conflicts.push(makeConflict(id, kind, original, left, right));
    }
  }
  summary.conflicts = conflicts.length;
  if (conflicts.length) {
    return { ok: false, problems: [failure('SYNC_CONFLICT', '/')], merged: null, conflicts, summary };
  }
  const candidate = { version: REVIEW_QUEUE_VERSION, items: merged };
  const final = validateQueue(candidate, options);
  if (!final.ok) {
    return { ok: false, problems: final.problems, merged: null, conflicts: [], summary: null };
  }
  return { ok: true, problems: [], merged: candidate, conflicts: [], summary };
}

/** A safe conflict summary contains IDs and hashes, never private values. */
export function conflictReport(result, language = 'en') {
  if (!result || !Array.isArray(result.conflicts)) return null;
  const fr = language === 'fr';
  const lines = [fr ? 'Conflits d’examen hors ligne' : 'Offline review conflicts'];
  lines.push(fr ? `Conflits\u00A0: ${result.conflicts.length}` : `Conflicts: ${result.conflicts.length}`);
  lines.push(fr ? 'UNKNOWN reste UNKNOWN.' : 'UNKNOWN remains UNKNOWN.');
  for (const conflict of result.conflicts) {
    lines.push(`${conflict.id} | ${conflict.kind}`);
  }
  lines.push(fr ? 'Aucun statut ne confirme l’accessibilité réelle.' :
    'No review status confirms real-world accessibility.');
  return lines.join('\n');
}

/** Generate a minimal state change request tied to an exact input fingerprint. */
export function createStatusPatch(queue, id, nextStatus, baseFingerprint, options = {}) {
  const checked = validateQueue(queue, options);
  const current = queueFingerprint(queue, options);
  const problems = [...checked.problems, ...current.problems];
  if (!validId(id)) problems.push(failure('ID_INVALID', '/id'));
  if (typeof baseFingerprint !== 'string' || baseFingerprint !== current.fingerprint) {
    problems.push(failure('BASE_MISMATCH', '/baseFingerprint'));
  }
  const target = queue.items?.find((item) => item.id === id);
  if (!target) problems.push(failure('ITEM_NOT_FOUND', '/id'));
  if (typeof nextStatus !== 'string' || nextStatus !== target?.status) {
    // This API intentionally cannot change status. Actions must go through
    // transitionReview, which has an explicit workflow transition table.
    problems.push(failure('ACTION_REQUIRED', '/nextStatus'));
  }
  if (problems.length) return { ok: false, problems, patch: null };
  return {
    ok: true, problems: [],
    patch: { version: SYNC_VERSION, baseFingerprint, id, state: target.state, status: target.status },
  };
}

/** Apply a snapshot guard without modifying facts or history. */
export function verifyStatusPatch(queue, patch, options = {}) {
  const current = queueFingerprint(queue, options);
  const problems = [...current.problems];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    problems.push(failure('PATCH_INVALID', '/'));
  } else {
    if (patch.version !== SYNC_VERSION) problems.push(failure('VERSION_INVALID', '/version'));
    if (patch.baseFingerprint !== current.fingerprint) problems.push(failure('BASE_MISMATCH', '/baseFingerprint'));
    const item = queue.items?.find((entry) => entry.id === patch.id);
    if (!item) problems.push(failure('ITEM_NOT_FOUND', '/id'));
    else if (item.state !== patch.state || item.status !== patch.status) {
      problems.push(failure('PATCH_MISMATCH', '/status'));
    }
    for (const key of Object.keys(patch)) {
      if (!['version', 'baseFingerprint', 'id', 'state', 'status'].includes(key)) {
        problems.push(failure('PATCH_EXTRA_FIELD', `/${key}`));
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Date-bound validation is supplied by caller; never use system clock. */
export function validateSyncDate(value, today) {
  if (!validDate(value)) return false;
  return today === undefined || validDate(today) && value <= today;
}

export function conflictKindsValid(result) {
  return Array.isArray(result?.conflicts) &&
    result.conflicts.every((item) => CONFLICT.has(item.kind));
}
