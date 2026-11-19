/** Publication lineage, conflicting revision audit, and safe rollback proposals. */
import { dayOrdinal, plain, safeOfflinePath, validId } from "./contracts.mjs";
import { batchReadiness, policyOptions } from "./readiness.mjs";
import { compareSnapshots, indexRecords, sourceSignatures } from "./changes.mjs";

export const LINEAGE_ACTIONS = Object.freeze(["KEEP", "REVIEW", "RESTORE-CANDIDATE", "NO-BASELINE"]);

export function revisionKey(record) {
  if (!validId(record?.id) || !["en", "fr"].includes(record.language)) return null;
  if (!Number.isSafeInteger(record.revision) || record.revision <= 0) return null;
  return `${record.language}/${record.id}@${record.revision}`;
}

export function revisionIndex(snapshots) {
  const revisions = new Map();
  if (!Array.isArray(snapshots)) return revisions;
  for (const snapshot of snapshots) {
    if (!Array.isArray(snapshot?.records)) continue;
    for (const record of snapshot.records) {
      const key = revisionKey(record);
      if (!key) continue;
      const entries = revisions.get(key) ?? [];
      entries.push({ asOf: snapshot.asOf, record });
      revisions.set(key, entries);
    }
  }
  return revisions;
}

export function auditRevisionHistory(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length > 500) return [{ code: "history.array", path: "snapshots" }];
  const issues = [];
  let priorDay = null;
  const latest = new Map();
  snapshots.forEach((snapshot, position) => {
    const day = dayOrdinal(snapshot?.asOf);
    if (day === null || (priorDay !== null && day <= priorDay)) {
      issues.push({ code: "history.date-order", path: `snapshots[${position}].asOf` });
    } else priorDay = day;
    if (!Array.isArray(snapshot?.records)) {
      issues.push({ code: "history.records", path: `snapshots[${position}].records` });
      return;
    }
    for (const [index, record] of snapshot.records.entries()) {
      const key = validId(record?.id) && ["en", "fr"].includes(record?.language) ? `${record.language}/${record.id}` : null;
      if (key === null) continue;
      const earlier = latest.get(key);
      if (earlier) {
        if (record.revision < earlier.revision) issues.push({ code: "history.revision-regressed", path: `snapshots[${position}].records[${index}].revision` });
        const recorded = dayOrdinal(record.recordedOn);
        const previous = dayOrdinal(earlier.recordedOn);
        if (recorded !== null && previous !== null && recorded < previous) issues.push({ code: "history.record-date-regressed", path: `snapshots[${position}].records[${index}].recordedOn` });
        if (record.revision === earlier.revision && JSON.stringify(sourceSignatures(record)) !== JSON.stringify(sourceSignatures(earlier))) {
          issues.push({ code: "history.source-changed-without-revision", path: `snapshots[${position}].records[${index}].sources` });
        }
        if (record.revision === earlier.revision && record.cache?.path !== earlier.cache?.path) {
          issues.push({ code: "history.cache-changed-without-revision", path: `snapshots[${position}].records[${index}].cache` });
        }
      }
      latest.set(key, record);
    }
  });
  return issues.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
}

export function sourceLineage(snapshots) {
  const map = new Map();
  if (!Array.isArray(snapshots)) return [];
  for (const snapshot of snapshots) {
    if (!Array.isArray(snapshot?.records)) continue;
    for (const record of snapshot.records) {
      if (!Array.isArray(record?.sources)) continue;
      for (const source of record.sources) {
        if (!validId(source?.id)) continue;
        const entry = map.get(source.id) ?? { id: source.id, firstSeen: snapshot.asOf, lastSeen: snapshot.asOf, revisions: new Set(), tiers: new Set(), claims: new Set() };
        entry.lastSeen = snapshot.asOf;
        entry.revisions.add(record.revision);
        entry.tiers.add(source.tier);
        entry.claims.add(source.claim);
        map.set(source.id, entry);
      }
    }
  }
  return [...map.values()].map((entry) => ({ id: entry.id, firstSeen: entry.firstSeen,
    lastSeen: entry.lastSeen, revisions: [...entry.revisions].sort((a, b) => a - b),
    tier: entry.tiers.size === 1 ? [...entry.tiers][0] : "UNKNOWN",
    claim: entry.claims.size === 1 ? [...entry.claims][0] : "UNKNOWN",
  })).sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export function rollbackCandidates(current, baseline, options = {}) {
  const policy = policyOptions(options);
  const readiness = batchReadiness(baseline, policy);
  const delta = compareSnapshots(current, baseline, policy);
  const before = indexRecords(current);
  const prior = indexRecords(baseline);
  const candidates = [];
  for (const change of delta.changes) {
    const earlier = prior.get(change.key);
    const now = before.get(change.key);
    if (!earlier) continue;
    const reasons = [...change.reasons];
    let action = "RESTORE-CANDIDATE";
    if (readiness.status !== "READY") {
      action = "REVIEW";
      reasons.push("baseline.not-ready");
    }
    if (earlier.access === "UNKNOWN" || earlier.sources?.some((source) => source?.tier === "UNKNOWN")) {
      action = "REVIEW";
      reasons.push("baseline.unknown");
    }
    if (!safeOfflinePath(earlier.cache?.path)) {
      action = "REVIEW";
      reasons.push("baseline.unsafe-path");
    }
    if (now && earlier.revision < now.revision) {
      action = "REVIEW";
      reasons.push("baseline.older-revision");
    }
    candidates.push({ key: change.key, action, reasons: [...new Set(reasons)].sort() });
  }
  return { candidates, status: candidates.some((item) => item.action === "REVIEW") ? "HOLD" : readiness.status };
}

export function rollbackSummary(current, baseline, options = {}) {
  const result = rollbackCandidates(current, baseline, options);
  return { status: result.status, proposals: result.candidates.length,
    safeCandidates: result.candidates.filter((item) => item.action === "RESTORE-CANDIDATE").length,
    needingReview: result.candidates.filter((item) => item.action === "REVIEW").length };
}

export function latestSnapshot(snapshots) {
  if (!Array.isArray(snapshots)) return null;
  let latest = null;
  for (const snapshot of snapshots) {
    if (!plain(snapshot) || dayOrdinal(snapshot.asOf) === null || !Array.isArray(snapshot.records)) continue;
    if (!latest || dayOrdinal(snapshot.asOf) > dayOrdinal(latest.asOf)) latest = snapshot;
  }
  return latest;
}

export function lineageStats(snapshots) {
  const sources = sourceLineage(snapshots);
  const issues = auditRevisionHistory(snapshots);
  const revisions = revisionIndex(snapshots);
  return { snapshots: Array.isArray(snapshots) ? snapshots.length : 0,
    uniqueSources: sources.length, observedRevisions: revisions.size,
    conflicts: issues.length, unknownSources: sources.filter((source) => source.tier === "UNKNOWN" || source.claim === "UNKNOWN").length };
}
