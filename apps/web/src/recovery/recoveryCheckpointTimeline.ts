import {
  validateCheckpointDocument, type CheckpointDocument,
  type CheckpointEntry, type CheckpointCondition, type CheckpointOperation,
} from "./recoveryCheckpoint";
import { compareCheckpointPair } from "./recoveryCheckpointAnalysis";

/** Views of submitted notes, not a database status and not a transfer log. */
export interface TimelineEvent {
  readonly id: string;
  readonly packId: string;
  readonly operation: CheckpointOperation;
  readonly at: string;
  readonly condition: CheckpointCondition;
  readonly sourceName: string;
  readonly sourceDate: string;
  readonly tier: string;
  readonly note: string;
  readonly changesFromPrior: readonly string[];
  readonly unsettled: boolean;
}
export interface PackTimeline {
  readonly packId: string;
  readonly events: readonly TimelineEvent[];
  readonly total: number;
  readonly unknown: number;
  readonly disputed: number;
  readonly sourceNames: readonly string[];
  readonly operations: readonly CheckpointOperation[];
  readonly latestCondition: CheckpointCondition;
  readonly latestAt: string;
  readonly conflictingReports: boolean;
}
export interface TimelineGroupFilter {
  readonly packId?: string;
  readonly operation?: CheckpointOperation;
  readonly includeReviewed?: boolean;
  readonly onlyDisputed?: boolean;
}
function records(document: CheckpointDocument): CheckpointEntry[] {
  const checked = validateCheckpointDocument(document);
  return checked.ok ? [...checked.value.entries] : [];
}
function byOrder(left: CheckpointEntry, right: CheckpointEntry): number {
  return left.capturedAt.localeCompare(right.capturedAt) || left.id.localeCompare(right.id);
}
function reportConflict(first: CheckpointEntry, last: CheckpointEntry): boolean {
  if (first.operation !== last.operation) return false;
  if (first.observation.condition !== "UNKNOWN" &&
      last.observation.condition !== "UNKNOWN" &&
      first.observation.condition !== last.observation.condition) return true;
  return first.observation.bytes !== null && last.observation.bytes !== null &&
    first.observation.bytes !== last.observation.bytes;
}
export function buildCheckpointTimelines(document: CheckpointDocument): PackTimeline[] {
  const entries = records(document).sort(byOrder);
  const grouped = new Map<string, CheckpointEntry[]>();
  for (const entry of entries) {
    const pack = grouped.get(entry.packId) ?? [];
    pack.push(entry);
    grouped.set(entry.packId, pack);
  }
  const result: PackTimeline[] = [];
  for (const [packId, list] of grouped) {
    const latest = list[list.length - 1];
    if (latest === undefined) continue;
    const lastByOperation = new Map<CheckpointOperation, CheckpointEntry>();
    const events: TimelineEvent[] = [];
    let conflictingReports = false;
    for (const entry of list) {
      const previous = lastByOperation.get(entry.operation);
      const differences = previous ? compareCheckpointPair(previous, entry).differences : [];
      if (previous && reportConflict(previous, entry)) conflictingReports = true;
      events.push({
        id: entry.id,
        packId,
        operation: entry.operation,
        at: entry.capturedAt,
        condition: entry.observation.condition,
        sourceName: entry.source.name,
        sourceDate: entry.source.date,
        tier: entry.source.tier,
        note: entry.observation.note,
        changesFromPrior: [...differences],
        unsettled: entry.phase === "disputed" || entry.observation.condition === "UNKNOWN",
      });
      lastByOperation.set(entry.operation, entry);
    }
    result.push({
      packId,
      events,
      total: events.length,
      unknown: events.filter((event) => event.condition === "UNKNOWN").length,
      disputed: list.filter((entry) => entry.phase === "disputed").length,
      sourceNames: [...new Set(list.map((entry) => entry.source.name))].sort(),
      operations: [...new Set(list.map((entry) => entry.operation))].sort(),
      latestCondition: latest.observation.condition,
      latestAt: latest.capturedAt,
      conflictingReports,
    });
  }
  return result.sort((a, b) => a.packId.localeCompare(b.packId));
}
export function filterCheckpointTimelines(
  document: CheckpointDocument, filter: TimelineGroupFilter,
): PackTimeline[] {
  const timelines = buildCheckpointTimelines(document);
  return timelines.filter((timeline) =>
    (filter.packId === undefined || timeline.packId === filter.packId) &&
    (filter.operation === undefined || timeline.operations.includes(filter.operation)) &&
    (filter.onlyDisputed !== true || timeline.disputed > 0 || timeline.conflictingReports) &&
    (filter.includeReviewed !== false || timeline.events.some((event) => event.unsettled)));
}
export interface TimelineStats {
  readonly packs: number;
  readonly events: number;
  readonly unresolved: number;
  readonly conflicting: number;
  readonly withMultipleSources: number;
  readonly withoutEvents: boolean;
}
export function summarizeCheckpointTimelines(document: CheckpointDocument): TimelineStats {
  const groups = buildCheckpointTimelines(document);
  return {
    packs: groups.length,
    events: groups.reduce((total, group) => total + group.total, 0),
    unresolved: groups.filter((group) => group.unknown > 0 || group.disputed > 0 || group.conflictingReports).length,
    conflicting: groups.filter((group) => group.conflictingReports).length,
    withMultipleSources: groups.filter((group) => group.sourceNames.length > 1).length,
    withoutEvents: groups.length === 0,
  };
}
/** A report can be handed to someone, but it cannot serve as a pack-integrity certificate. */
export function exportCheckpointTimelines(document: CheckpointDocument): string | null {
  const checked = validateCheckpointDocument(document);
  if (!checked.ok) return null;
  const report = {
    format: "local-recovery-checkpoint-timeline", version: 1,
    sourceEntries: checked.value.entries,
    timelines: buildCheckpointTimelines(checked.value),
    summary: summarizeCheckpointTimelines(checked.value),
    contentReady: false,
  };
  const raw = `${JSON.stringify(report, null, 2)}\n`;
  return new TextEncoder().encode(raw).byteLength <= 384 * 1024 ? raw : null;
}
export function timelineHasUnknown(document: CheckpointDocument): boolean {
  const checked = validateCheckpointDocument(document);
  if (!checked.ok) return true;
  if (checked.value.entries.length === 0) return true;
  return checked.value.entries.some((entry) => entry.observation.condition === "UNKNOWN");
}
export function timelineHasConflict(document: CheckpointDocument): boolean {
  return buildCheckpointTimelines(document).some((item) => item.conflictingReports || item.disputed > 0);
}
export function timelineLatestDate(document: CheckpointDocument, packId: string): string | null {
  return buildCheckpointTimelines(document).find((timeline) => timeline.packId === packId)?.latestAt ?? null;
}
