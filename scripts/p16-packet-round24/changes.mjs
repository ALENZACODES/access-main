import { add, auditCollection, cachePath, day, object, policy, sorted, validId } from "./core.mjs";
import { assessPacket } from "./readiness.mjs";

/** Compare immutable snapshots and produce proposals, never perform writes. */
/** @param {unknown} before @param {unknown} after @param {unknown} [options] */
export function planSnapshotTransition(before, after, options = {}) {
  const oldAudit = auditCollection(before, options);
  const newAudit = auditCollection(after, options);
  /** @type {import('./core.mjs').Finding[]} */
  const findings = [];
  findings.push(...oldAudit.findings.map((item) => ({ ...item, path: `before.${item.path}` })));
  findings.push(...newAudit.findings.map((item) => ({ ...item, path: `after.${item.path}` })));
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return { status: "HOLD", operations: [], findings: sorted(findings) };
  }
  const beforeMap = new Map();
  const afterMap = new Map();
  before.forEach((record, index) => {
    if (object(record) && validId(record.id)) beforeMap.set(record.id, { record, index });
  });
  after.forEach((record, index) => {
    if (object(record) && validId(record.id)) afterMap.set(record.id, { record, index });
  });
  const oldOwners = new Map();
  for (const item of beforeMap.values()) {
    if (object(item.record.cache) && cachePath(item.record.cache.path)) oldOwners.set(item.record.cache.path, item.record.id);
  }
  /** @type {{type:string,id:string,reason:string,fromRevision:number|null,toRevision:number|null,cachePath:string|null}[]} */
  const operations = [];
  const ids = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort((a, b) => a.localeCompare(b, "en"));
  for (const id of ids) {
    const previous = beforeMap.get(id)?.record;
    const current = afterMap.get(id)?.record;
    if (!current) {
      operations.push({ type: "REVIEW_RETIRE", id, reason: "record-absent", fromRevision: previous.revision, toRevision: null, cachePath: null });
      continue;
    }
    const path = `after.records[${afterMap.get(id).index}]`;
    const newRevision = Number.isSafeInteger(current.revision) ? current.revision : null;
    const oldRevision = previous && Number.isSafeInteger(previous.revision) ? previous.revision : null;
    const key = object(current.cache) && cachePath(current.cache.path) ? current.cache.path : null;
    if (!previous) {
      operations.push({ type: "ADD", id, reason: "new-record", fromRevision: null, toRevision: newRevision, cachePath: key });
      continue;
    }
    if (newRevision === null || oldRevision === null || newRevision < oldRevision) {
      add(findings, "revision.regression", `${path}.revision`);
      operations.push({ type: "HOLD", id, reason: "revision-regression", fromRevision: oldRevision, toRevision: newRevision, cachePath: null });
      continue;
    }
    if (newRevision === oldRevision) {
      if (semanticFingerprint(previous) !== semanticFingerprint(current)) {
        add(findings, "revision.changed-without-bump", `${path}.revision`);
        operations.push({ type: "HOLD", id, reason: "missing-revision-bump", fromRevision: oldRevision, toRevision: newRevision, cachePath: null });
      } else {
        operations.push({ type: "KEEP", id, reason: "same-evidence", fromRevision: oldRevision, toRevision: newRevision, cachePath: key });
      }
      continue;
    }
    const oldCollected = object(previous.source) ? day(previous.source.collectedOn) : null;
    const newCollected = object(current.source) ? day(current.source.collectedOn) : null;
    if (oldCollected !== null && newCollected !== null && newCollected < oldCollected) {
      add(findings, "source.date-regression", `${path}.source.collectedOn`);
    }
    if (object(previous.cache) && object(current.cache) && previous.cache.state === "stored" && current.cache.state === "stored") {
      const oldSaved = day(previous.cache.savedOn);
      const newSaved = day(current.cache.savedOn);
      if (oldSaved !== null && newSaved !== null && newSaved < oldSaved) add(findings, "cache.date-regression", `${path}.cache.savedOn`);
    }
    if (key && oldOwners.has(key) && oldOwners.get(key) !== id) {
      add(findings, "cache.owner-change", `${path}.cache.path`);
    }
    const decision = assessPacket([current], options);
    const itemStatus = decision.decisions[0]?.status ?? "UNKNOWN";
    operations.push({
      type: itemStatus === "READY" ? "REPLACE" : itemStatus === "UNKNOWN" ? "UNKNOWN" : "HOLD",
      id,
      reason: itemStatus === "READY" ? "revision-advanced" : "evidence-not-ready",
      fromRevision: oldRevision,
      toRevision: newRevision,
      cachePath: itemStatus === "READY" ? key : null,
    });
  }
  const allFindings = sorted(findings);
  if (allFindings.some((item) => item.severity === "error")) {
    return { status: "HOLD", operations: operations.map((op) => ({ ...op, type: op.type === "KEEP" ? "KEEP" : "HOLD" })), findings: allFindings };
  }
  if (operations.some((op) => op.type === "HOLD" || op.type === "REVIEW_RETIRE")) {
    return { status: "HOLD", operations, findings: allFindings };
  }
  return { status: operations.some((op) => op.type === "UNKNOWN") ? "UNKNOWN" : "READY", operations, findings: allFindings };
}

/** The fingerprint is not a cryptographic identity and is never exported. */
/** @param {unknown} record */
export function semanticFingerprint(record) {
  if (!object(record)) return null;
  const evidence = object(record.source) ? record.source : {};
  const cache = object(record.cache) ? record.cache : {};
  return JSON.stringify([
    record.id, record.kind, record.title, record.summary, record.access,
    record.tier, record.reviewedOn, evidence.id, evidence.publisher, evidence.url,
    evidence.licence, evidence.collectedOn, cache.state, cache.path, cache.savedOn,
  ]);
}

/** @param {ReturnType<typeof planSnapshotTransition>} plan */
export function operationCounts(plan) {
  const counts = { ADD: 0, REPLACE: 0, KEEP: 0, HOLD: 0, REVIEW_RETIRE: 0, UNKNOWN: 0 };
  for (const op of plan.operations) {
    if (Object.hasOwn(counts, op.type)) counts[op.type] += 1;
  }
  return counts;
}

/** @param {ReturnType<typeof planSnapshotTransition>} plan */
export function safePlanSummary(plan) {
  return { status: plan.status, operations: operationCounts(plan), findings: plan.findings.map((f) => ({ code: f.code, path: f.path })) };
}

/** @param {ReturnType<typeof planSnapshotTransition>} plan */
export function exportPlanRows(plan) {
  return plan.operations.map((op) => ({
    action: op.type,
    record_id: op.id,
    previous_revision: op.fromRevision,
    next_revision: op.toRevision,
    reason_code: op.reason,
    cache_path: op.cachePath,
  }));
}

/** @param {unknown} previous @param {unknown} current @param {unknown} [options] */
export function assessRetirement(previous, current, options = {}) {
  const plan = planSnapshotTransition(previous, current, options);
  return {
    status: plan.status,
    pending: plan.operations.filter((op) => op.type === "REVIEW_RETIRE").map((op) => op.id),
    noAutomaticDeletion: true,
  };
}

/** @param {unknown} before @param {unknown} after @param {unknown} [options] */
export function cacheChangeList(before, after, options = {}) {
  const plan = planSnapshotTransition(before, after, options);
  return plan.operations.filter((op) => op.type === "ADD" || op.type === "REPLACE")
    .map((op) => ({ id: op.id, action: op.type, cache: op.cachePath }));
}

/** @param {unknown} items @param {unknown} [options] */
export function baselineAssessment(items, options = {}) {
  const rules = policy(options);
  const audit = auditCollection(items, options);
  return { asOf: rules.asOf, validCount: audit.validCount, findingCount: audit.findings.length,
    status: audit.findings.some((item) => item.severity === "error") ? "HOLD" : "READY" };
}
