import {
  validateCheckpointDocument,
  type CheckpointCondition, type CheckpointDocument, type CheckpointEntry,
  type CheckpointOperation,
} from "./recoveryCheckpoint";

/** A comparison of two user-entered records, never a device integrity check. */
export type CheckpointDifference =
  | "same" | "condition-changed" | "size-changed" | "digest-changed"
  | "source-changed" | "time-reversed" | "insufficient-information";
export type CheckpointConcern = "UNKNOWN" | "missing" | "damaged" | "interrupted" | "reported-present";
export interface CheckpointPair {
  readonly before: CheckpointEntry;
  readonly after: CheckpointEntry;
  readonly differences: readonly CheckpointDifference[];
  readonly concern: CheckpointConcern;
  readonly hasIndependentSource: boolean;
  readonly cannotDetermineReadiness: true;
}
export interface CheckpointTrend {
  readonly packId: string;
  readonly operation: CheckpointOperation;
  readonly checkpoints: number;
  readonly current: CheckpointCondition;
  readonly prior: CheckpointCondition | null;
  readonly difference: CheckpointDifference | null;
  readonly conditionChanged: boolean;
  readonly reportedByteChange: number | null;
  readonly sourceCount: number;
  readonly latestAt: string;
}
export interface CheckpointGap {
  readonly packId: string;
  readonly operation: CheckpointOperation;
  readonly missingBytes: boolean;
  readonly missingDigest: boolean;
  readonly unknownCondition: boolean;
  readonly disputed: boolean;
  readonly singleSource: boolean;
}
export type CheckpointNextStep =
  | "review-source" | "read-pack" | "check-storage" | "check-connection"
  | "review-output" | "compare-files" | "document-unknown";
export interface CheckpointGuidance {
  readonly packId: string;
  readonly operation: CheckpointOperation;
  readonly condition: CheckpointCondition;
  readonly actions: readonly CheckpointNextStep[];
  readonly needsManualReview: boolean;
  readonly contentReady: false;
}
const ALL_OPERATIONS: readonly CheckpointOperation[] = ["pack", "download", "export"];

function sortedEntries(entries: readonly CheckpointEntry[]): CheckpointEntry[] {
  return [...entries].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
}
function entriesFor(document: CheckpointDocument): CheckpointEntry[] {
  const checked = validateCheckpointDocument(document);
  return checked.ok ? sortedEntries(checked.value.entries) : [];
}
function concern(condition: CheckpointCondition): CheckpointConcern {
  if (condition === "available") return "reported-present";
  return condition;
}
function sameSource(a: CheckpointEntry, b: CheckpointEntry): boolean {
  return a.source.name === b.source.name &&
    a.source.licence === b.source.licence &&
    a.source.date === b.source.date &&
    a.source.reference === b.source.reference;
}
/** May report multiple differences; the result cannot authorize a pack operation. */
export function compareCheckpointPair(before: CheckpointEntry, after: CheckpointEntry): CheckpointPair {
  const differences: CheckpointDifference[] = [];
  if (after.capturedAt < before.capturedAt) differences.push("time-reversed");
  if (before.observation.condition !== after.observation.condition) differences.push("condition-changed");
  if (before.observation.bytes !== after.observation.bytes) differences.push("size-changed");
  if (before.observation.digest !== after.observation.digest) differences.push("digest-changed");
  if (!sameSource(before, after)) differences.push("source-changed");
  if (before.observation.bytes === null || after.observation.bytes === null ||
      before.observation.digest === null || after.observation.digest === null) {
    differences.push("insufficient-information");
  }
  if (differences.length === 0) differences.push("same");
  return {
    before, after, differences,
    concern: concern(after.observation.condition),
    hasIndependentSource: !sameSource(before, after),
    cannotDetermineReadiness: true,
  };
}
export function checkpointPairs(document: CheckpointDocument): CheckpointPair[] {
  const result: CheckpointPair[] = [];
  const groups = new Map<string, CheckpointEntry[]>();
  for (const item of entriesFor(document)) {
    const key = `${item.packId}\u0000${item.operation}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    for (let index = 1; index < list.length; index++) {
      const before = list[index - 1];
      const after = list[index];
      if (before !== undefined && after !== undefined) result.push(compareCheckpointPair(before, after));
    }
  }
  return result.sort((a, b) => a.after.capturedAt.localeCompare(b.after.capturedAt));
}
export function checkpointTrends(document: CheckpointDocument): CheckpointTrend[] {
  const groups = new Map<string, CheckpointEntry[]>();
  for (const entry of entriesFor(document)) {
    const key = `${entry.packId}\u0000${entry.operation}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  const trends: CheckpointTrend[] = [];
  for (const group of groups.values()) {
    const last = group[group.length - 1];
    if (last === undefined) continue;
    const previous = group[group.length - 2];
    const difference = previous ? compareCheckpointPair(previous, last) : null;
    trends.push({
      packId: last.packId,
      operation: last.operation,
      checkpoints: group.length,
      current: last.observation.condition,
      prior: previous?.observation.condition ?? null,
      difference: difference?.differences[0] ?? null,
      conditionChanged: previous !== undefined && previous.observation.condition !== last.observation.condition,
      reportedByteChange: previous && previous.observation.bytes !== null && last.observation.bytes !== null
        ? last.observation.bytes - previous.observation.bytes : null,
      sourceCount: new Set(group.map((entry) => `${entry.source.name}\u0000${entry.source.reference}`)).size,
      latestAt: last.capturedAt,
    });
  }
  return trends.sort((a, b) => a.packId.localeCompare(b.packId) || a.operation.localeCompare(b.operation));
}
export function checkpointGaps(document: CheckpointDocument): CheckpointGap[] {
  const all = entriesFor(document);
  return checkpointTrends(document).map((trend) => {
    const matching = all.filter((entry) => entry.packId === trend.packId && entry.operation === trend.operation);
    const last = matching[matching.length - 1];
    return {
      packId: trend.packId,
      operation: trend.operation,
      missingBytes: last?.observation.bytes == null,
      missingDigest: last?.observation.digest == null,
      unknownCondition: last?.observation.condition === "UNKNOWN",
      disputed: matching.some((entry) => entry.phase === "disputed"),
      singleSource: trend.sourceCount < 2,
    };
  });
}
/** Advice always describes a human next step, never starts or authorizes a transfer. */
export function checkpointGuidance(document: CheckpointDocument): CheckpointGuidance[] {
  return checkpointTrends(document).map((trend) => {
    const actions: CheckpointNextStep[] = [];
    switch (trend.operation) {
      case "pack": actions.push("read-pack"); break;
      case "download": actions.push("check-connection", "check-storage"); break;
      case "export": actions.push("review-output", "check-storage"); break;
    }
    if (trend.current === "UNKNOWN") actions.push("document-unknown");
    if (trend.current === "damaged") actions.push("compare-files");
    if (trend.current === "missing") actions.push("check-storage");
    if (trend.sourceCount < 2) actions.push("review-source");
    return {
      packId: trend.packId,
      operation: trend.operation,
      condition: trend.current,
      actions: [...new Set(actions)],
      needsManualReview: true,
      contentReady: false,
    };
  });
}
/** Stable operation-level counts; absence of evidence is not classified as success. */
export function operationBreakdown(document: CheckpointDocument): Record<CheckpointOperation, {
  total: number; unknown: number; disputed: number; reportedPresent: number;
}> {
  const entries = entriesFor(document);
  return Object.fromEntries(ALL_OPERATIONS.map((operation) => {
    const subset = entries.filter((item) => item.operation === operation);
    return [operation, {
      total: subset.length,
      unknown: subset.filter((item) => item.observation.condition === "UNKNOWN").length,
      disputed: subset.filter((item) => item.phase === "disputed").length,
      reportedPresent: subset.filter((item) => item.observation.condition === "available").length,
    }];
  })) as Record<CheckpointOperation, { total: number; unknown: number; disputed: number; reportedPresent: number }>;
}
/** Provenance is retained per observation, including on comparison exports. */
export function checkpointAnalysisExport(document: CheckpointDocument): string | null {
  const checked = validateCheckpointDocument(document);
  if (!checked.ok) return null;
  const result = {
    format: "local-recovery-checkpoint-analysis",
    version: 1,
    entries: checked.value.entries,
    trends: checkpointTrends(checked.value),
    gaps: checkpointGaps(checked.value),
    steps: checkpointGuidance(checked.value),
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  return new TextEncoder().encode(json).byteLength <= 384 * 1024 ? json : null;
}
export function reviewedCheckpointCount(document: CheckpointDocument): number {
  const checked = validateCheckpointDocument(document);
  return checked.ok ? checked.value.entries.filter((item) => item.phase === "reviewed").length : 0;
}
export function disputedCheckpointCount(document: CheckpointDocument): number {
  const checked = validateCheckpointDocument(document);
  return checked.ok ? checked.value.entries.filter((item) => item.phase === "disputed").length : 0;
}
export function checkpointHasUncertainty(document: CheckpointDocument): boolean {
  const checked = validateCheckpointDocument(document);
  if (!checked.ok) return true;
  return checked.value.entries.length === 0 || checked.value.entries.some((item) =>
    item.observation.condition === "UNKNOWN" || item.observation.bytes === null ||
    item.observation.digest === null || item.phase === "disputed");
}
