/**
 * Pure offline publication reconciliation. No destructive operation is applied.
 * The output is a proposal, not a cache mutator or an automated deployment.
 */
import {
  LANGUAGES, auditCollection, calendarOrdinal, canonicalIdentifier, diagnostic,
  localCachePath, plainObject, sortDiagnostics,
} from "./contract.mjs";
import { pairedReadiness, policyOptions, recordReadiness } from "./readiness.mjs";

export const ACTIONS = Object.freeze(["ADD", "REPLACE", "RETAIN", "REVIEW", "RETIRE"]);

export function indexByLanguageAndId(records) {
  const result = new Map();
  if (!Array.isArray(records)) return result;
  for (const record of records) {
    if (!plainObject(record) || !canonicalIdentifier(record.id) || !LANGUAGES.includes(record.language)) continue;
    const key = `${record.language}/${record.id}`;
    if (!result.has(key)) result.set(key, record);
  }
  return result;
}

export function compareRecord(before, after) {
  if (!before && !after) return { action: "RETAIN", reasons: [] };
  if (!before) return { action: "ADD", reasons: ["record.new"] };
  if (!after) return { action: "RETIRE", reasons: ["record.missing"] };
  const reasons = [];
  if (before.translationKey !== after.translationKey) reasons.push("record.translationChanged");
  if (before.kind !== after.kind) reasons.push("record.kindChanged");
  if (before.state !== after.state) reasons.push("record.stateChanged");
  if (before.revision !== after.revision) reasons.push("record.revisionChanged");
  if (before.recordedOn !== after.recordedOn) reasons.push("record.dateChanged");
  if (before.cache?.state !== after.cache?.state) reasons.push("cache.stateChanged");
  if (before.cache?.path !== after.cache?.path) reasons.push("cache.pathChanged");
  if (before.cache?.capturedOn !== after.cache?.capturedOn) reasons.push("cache.dateChanged");
  if (before.cache?.bytes !== after.cache?.bytes) reasons.push("cache.bytesChanged");
  const beforeIds = (before.sources ?? []).map((source) => source.id).sort().join("|");
  const afterIds = (after.sources ?? []).map((source) => source.id).sort().join("|");
  if (beforeIds !== afterIds) reasons.push("source.membershipChanged");
  if (JSON.stringify(before.title) !== JSON.stringify(after.title)) reasons.push("copy.titleChanged");
  if (JSON.stringify(before.summary) !== JSON.stringify(after.summary)) reasons.push("copy.summaryChanged");
  for (const id of new Set([...(before.sources ?? []).map((source) => source.id), ...(after.sources ?? []).map((source) => source.id)])) {
    const left = (before.sources ?? []).find((source) => source.id === id);
    const right = (after.sources ?? []).find((source) => source.id === id);
    if (!left || !right) continue;
    if (left.collectedOn !== right.collectedOn) reasons.push("source.collectionChanged");
    if (left.tier !== right.tier) reasons.push("source.tierChanged");
    if (left.licence !== right.licence) reasons.push("source.licenceChanged");
    if (left.url !== right.url) reasons.push("source.urlChanged");
  }
  if (reasons.length === 0) return { action: "RETAIN", reasons: [] };
  return { action: "REPLACE", reasons: [...new Set(reasons)].sort() };
}

export function compareSnapshots(beforeRecords, afterRecords, options = {}) {
  const policy = policyOptions(options);
  const oldAudit = auditCollection(beforeRecords, { asOf: policy.asOf, requireBothLanguages: true });
  const newAudit = auditCollection(afterRecords, { asOf: policy.asOf, requireBothLanguages: true });
  const findings = [
    ...oldAudit.findings.map((issue) => diagnostic(`before.${issue.code}`, issue.path)),
    ...newAudit.findings.map((issue) => diagnostic(`after.${issue.code}`, issue.path)),
  ];
  const before = indexByLanguageAndId(beforeRecords);
  const after = indexByLanguageAndId(afterRecords);
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = keys.map((key) => {
    const oldRecord = before.get(key);
    const newRecord = after.get(key);
    const change = compareRecord(oldRecord, newRecord);
    const status = newRecord ? recordReadiness(newRecord, policy).decision : "HOLD";
    let action = change.action;
    if (status !== "READY" && (action === "ADD" || action === "REPLACE")) action = "REVIEW";
    if (oldRecord && newRecord && newRecord.revision < oldRecord.revision) {
      findings.push(diagnostic("change.revisionRegressed", `records.${key}.revision`));
      action = "REVIEW";
    }
    if (oldRecord && newRecord && calendarOrdinal(newRecord.recordedOn) < calendarOrdinal(oldRecord.recordedOn)) {
      findings.push(diagnostic("change.dateRegressed", `records.${key}.recordedOn`));
      action = "REVIEW";
    }
    return { key, action, decision: status, reasons: change.reasons };
  });
  const afterReadiness = pairedReadiness(afterRecords, policy);
  return {
    changes,
    findings: sortDiagnostics(findings),
    publication: afterReadiness.decision,
    summary: actionCounts(changes),
  };
}

export function actionCounts(changes) {
  const counts = { ADD: 0, REPLACE: 0, RETAIN: 0, REVIEW: 0, RETIRE: 0 };
  for (const item of changes) if (ACTIONS.includes(item.action)) counts[item.action] += 1;
  return counts;
}

export function proposedRetirements(beforeRecords, afterRecords, options = {}) {
  return compareSnapshots(beforeRecords, afterRecords, options).changes
    .filter((change) => change.action === "RETIRE")
    .map((change) => change.key);
}

export function retainableCachePaths(beforeRecords, afterRecords, options = {}) {
  const changes = compareSnapshots(beforeRecords, afterRecords, options).changes;
  const after = indexByLanguageAndId(afterRecords);
  const paths = [];
  for (const change of changes) {
    if (change.action !== "RETAIN" || change.decision !== "READY") continue;
    const cache = after.get(change.key)?.cache;
    if (cache?.state === "PRESENT" && localCachePath(cache.path)) paths.push(cache.path);
  }
  return [...new Set(paths)].sort();
}

export function reconcilePairs(beforeRecords, afterRecords, options = {}) {
  const delta = compareSnapshots(beforeRecords, afterRecords, options);
  const groups = new Map();
  for (const change of delta.changes) {
    const key = change.key.split("/")[1];
    const group = groups.get(key) ?? [];
    group.push(change);
    groups.set(key, group);
  }
  const pairs = [];
  for (const [id, entries] of groups) {
    const actions = new Set(entries.map((entry) => entry.action));
    const decision = entries.some((entry) => entry.decision === "HOLD") ? "HOLD"
      : entries.some((entry) => entry.decision === "UNKNOWN") ? "UNKNOWN" : "READY";
    const mixed = actions.size > 1;
    pairs.push({ id, decision, mixed, actions: [...actions].sort() });
  }
  pairs.sort((a, b) => a.id.localeCompare(b.id));
  return { ...delta, pairs };
}

export function planResourceBudget(afterRecords, options = {}) {
  const policy = policyOptions(options);
  if (!Array.isArray(afterRecords)) return { bytes: 0, count: 0, decision: "HOLD", reasons: ["records.notArray"] };
  let bytes = 0;
  let count = 0;
  const reasons = [];
  const seen = new Set();
  for (const record of afterRecords) {
    const cache = record?.cache;
    if (cache?.state !== "PRESENT") continue;
    if (!localCachePath(cache.path)) {
      reasons.push("cache.unsafePath");
      continue;
    }
    if (seen.has(cache.path)) continue;
    seen.add(cache.path);
    if (!Number.isSafeInteger(cache.bytes) || cache.bytes < 1) {
      reasons.push("cache.invalidBytes");
      continue;
    }
    bytes += cache.bytes;
    count += 1;
  }
  if (bytes > policy.maximumBytes) reasons.push("cache.totalBudgetExceeded");
  const ready = pairedReadiness(afterRecords, policy);
  if (ready.decision === "HOLD") reasons.push("records.held");
  if (ready.decision === "UNKNOWN") reasons.push("records.unknown");
  const decision = reasons.includes("records.unknown") && reasons.length === 1 ? "UNKNOWN" : reasons.length ? "HOLD" : "READY";
  return { bytes, count, decision, reasons: [...new Set(reasons)].sort() };
}
