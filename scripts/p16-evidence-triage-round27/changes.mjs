/** Read-only change planning for bilingual offline snapshots. No mutations. */
import { collectionIssues, dayOrdinal, plain, safeOfflinePath, validId } from "./contracts.mjs";
import { batchReadiness, policyOptions } from "./readiness.mjs";

export const ACTIONS = Object.freeze(["ADD", "REPLACE", "RETAIN", "REVIEW", "RETIRE"]);
export function keyOf(record) {
  return validId(record?.id) && ["en", "fr"].includes(record?.language) ? `${record.language}/${record.id}` : null;
}

export function indexRecords(records) {
  const map = new Map();
  if (!Array.isArray(records)) return map;
  for (const record of records) {
    const key = keyOf(record);
    if (key !== null && !map.has(key)) map.set(key, record);
  }
  return map;
}

export function sourceSignature(source) {
  if (!plain(source)) return null;
  return [source.id, source.url, source.publisher, source.licence, source.tier, source.claim,
    source.collectedOn, source.reviewedOn ?? ""].join("|");
}

export function sourceSignatures(record) {
  if (!Array.isArray(record?.sources)) return [];
  return record.sources.map(sourceSignature).filter((value) => value !== null).sort();
}

export function cacheSignature(cache) {
  if (!plain(cache)) return null;
  return [cache.state, cache.path ?? "", cache.bytes ?? "", cache.revision ?? "", cache.capturedOn ?? ""].join("|");
}

export function recordDelta(before, after) {
  if (before === null && after === null) return { action: "RETAIN", reasons: [] };
  if (before === null) return { action: "ADD", reasons: ["record.created"] };
  if (after === null) return { action: "RETIRE", reasons: ["record.absent"] };
  const reasons = [];
  const changed = (code, left, right) => {
    if (left !== right) reasons.push(code);
  };
  changed("record.translation-key", before.translationKey, after.translationKey);
  changed("record.kind", before.kind, after.kind);
  changed("record.access", before.access, after.access);
  changed("record.revision", before.revision, after.revision);
  changed("record.date", before.recordedOn, after.recordedOn);
  changed("copy.title", JSON.stringify(before.title), JSON.stringify(after.title));
  changed("copy.summary", JSON.stringify(before.summary), JSON.stringify(after.summary));
  changed("source.attribution", JSON.stringify(sourceSignatures(before)), JSON.stringify(sourceSignatures(after)));
  changed("cache.snapshot", cacheSignature(before.cache), cacheSignature(after.cache));
  return { action: reasons.length ? "REPLACE" : "RETAIN", reasons };
}

export function compareSnapshots(before, after, options = {}) {
  const rules = policyOptions(options);
  const earlier = indexRecords(before);
  const later = indexRecords(after);
  const newer = batchReadiness(after, rules);
  const oldIssues = collectionIssues(before, rules);
  const newIssues = collectionIssues(after, rules);
  const allKeys = [...new Set([...earlier.keys(), ...later.keys()])].sort();
  const changes = [];
  const findings = [];
  for (const key of allKeys) {
    const oldRecord = earlier.get(key) ?? null;
    const newRecord = later.get(key) ?? null;
    const delta = recordDelta(oldRecord, newRecord);
    const reasons = [...delta.reasons];
    let action = delta.action;
    if (newRecord?.access === "UNKNOWN" || newRecord?.cache?.state === "UNKNOWN" ||
      newRecord?.sources?.some((source) => source?.tier === "UNKNOWN" || source?.claim === "UNKNOWN")) {
      action = "REVIEW";
      reasons.push("record.unknown");
    }
    if (newRecord?.access === "UNSUPPORTED") {
      action = "REVIEW";
      reasons.push("record.unsupported");
    }
    if (oldRecord && newRecord && Number.isSafeInteger(oldRecord.revision) &&
      Number.isSafeInteger(newRecord.revision) && newRecord.revision < oldRecord.revision) {
      action = "REVIEW";
      reasons.push("record.revision-regression");
      findings.push({ code: "change.revision-regression", path: key });
    }
    const oldDay = dayOrdinal(oldRecord?.recordedOn);
    const newDay = dayOrdinal(newRecord?.recordedOn);
    if (oldDay !== null && newDay !== null && newDay < oldDay) {
      action = "REVIEW";
      reasons.push("record.date-regression");
      findings.push({ code: "change.date-regression", path: key });
    }
    const newIndex = Array.isArray(after) ? after.findIndex((item) => keyOf(item) === key) : -1;
    if (newRecord && newIndex >= 0 && newIssues.some((issue) => issue.path.startsWith(`records[${newIndex}]`))) {
      action = "REVIEW";
      reasons.push("record.invalid");
    }
    changes.push({ key, action, reasons: [...new Set(reasons)].sort() });
  }
  if (oldIssues.some((finding) => finding.severity === "error")) findings.push({ code: "snapshot.before-invalid", path: "before" });
  if (newIssues.some((finding) => finding.severity === "error")) findings.push({ code: "snapshot.after-invalid", path: "after" });
  return { changes, findings, status: newer.status, actions: countActions(changes) };
}

export function countActions(changes) {
  const counts = { ADD: 0, REPLACE: 0, RETAIN: 0, REVIEW: 0, RETIRE: 0 };
  for (const change of changes) if (change.action in counts) counts[change.action] += 1;
  return counts;
}

export function safeRetainPaths(before, after, options = {}) {
  const oldIndex = indexRecords(before);
  const newIndex = indexRecords(after);
  const comparison = compareSnapshots(before, after, options);
  if (comparison.findings.length) return [];
  const paths = new Set();
  for (const change of comparison.changes) {
    if (change.action !== "RETAIN") continue;
    const first = oldIndex.get(change.key);
    const second = newIndex.get(change.key);
    if (first?.cache?.state !== "PRESENT" || second?.cache?.state !== "PRESENT") continue;
    if (first.cache.path === second.cache.path && safeOfflinePath(first.cache.path)) paths.add(first.cache.path);
  }
  return [...paths].sort();
}

export function retirementProposals(before, after, options = {}) {
  return compareSnapshots(before, after, options).changes.filter((change) => change.action === "RETIRE").map((change) => change.key);
}

export function replacementProposals(before, after, options = {}) {
  return compareSnapshots(before, after, options).changes.filter((change) => change.action === "REPLACE");
}

export function reviewProposals(before, after, options = {}) {
  return compareSnapshots(before, after, options).changes.filter((change) => change.action === "REVIEW");
}

export function resourceInventory(records) {
  const assets = new Map();
  if (!Array.isArray(records)) return { paths: [], bytes: 0, conflicts: [], count: 0 };
  const conflicts = [];
  for (const [index, record] of records.entries()) {
    const cache = record?.cache;
    if (cache?.state !== "PRESENT" || !safeOfflinePath(cache.path)) continue;
    if (assets.has(cache.path)) {
      conflicts.push({ code: "cache.conflicting-owner", index });
      continue;
    }
    assets.set(cache.path, Number.isSafeInteger(cache.bytes) && cache.bytes > 0 ? cache.bytes : 0);
  }
  const paths = [...assets.keys()].sort();
  return { paths, bytes: [...assets.values()].reduce((sum, value) => sum + value, 0), conflicts, count: paths.length };
}

export function resourceBudget(records, maxBytes = 100_000_000) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("Invalid budget");
  const inventory = resourceInventory(records);
  const reasons = [];
  if (inventory.conflicts.length) reasons.push("cache.conflicting-owner");
  if (inventory.bytes > maxBytes) reasons.push("cache.budget-exceeded");
  if (!Array.isArray(records)) reasons.push("record.collection-missing");
  return { status: reasons.length ? "HOLD" : "READY", reasons, ...inventory, maxBytes };
}

export function changeTimeline(snapshots, options = {}) {
  if (!Array.isArray(snapshots) || snapshots.length > 100) throw new TypeError("Invalid snapshots");
  const transitions = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const before = snapshots[index - 1];
    const after = snapshots[index];
    if (!plain(before) || !plain(after) || dayOrdinal(before.asOf) === null || dayOrdinal(after.asOf) === null ||
      dayOrdinal(after.asOf) <= dayOrdinal(before.asOf)) throw new TypeError("Invalid snapshot ordering");
    transitions.push({ from: before.asOf, to: after.asOf,
      ...compareSnapshots(before.records, after.records, { ...options, asOf: after.asOf }) });
  }
  return transitions;
}

export function mergeChangeReasons(changes) {
  const frequencies = new Map();
  for (const change of changes) {
    for (const reason of change.reasons ?? []) frequencies.set(reason, (frequencies.get(reason) ?? 0) + 1);
  }
  return [...frequencies].map(([reason, count]) => ({ reason, count })).sort((a, b) => a.reason.localeCompare(b.reason, "en"));
}

export function pairChangeSummary(changes) {
  const groups = new Map();
  for (const change of changes) {
    const key = change.key.split("/")[1];
    const group = groups.get(key) ?? { id: key, actions: [] };
    group.actions.push(change.action);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    id: group.id,
    actions: [...new Set(group.actions)].sort(),
    mixed: new Set(group.actions).size > 1,
  })).sort((a, b) => a.id.localeCompare(b.id, "en"));
}
