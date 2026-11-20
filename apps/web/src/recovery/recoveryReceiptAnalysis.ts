import {
  receiptEventsFor, receiptSummary,
  type ReceiptCondition, type ReceiptDocument, type ReceiptEntry,
  type ReceiptEvidenceTier, type ReceiptOperation, type ReceiptSource, type ReceiptStage,
} from "./recoveryReceiptLedger";

export type ReceiptFindingCode = "unknown-condition" | "unknown-tier" | "unacknowledged" | "disputed" | "unreferenced-handoff" | "missing-bytes" | "size-mismatch" | "stale-source" | "contradictory-conditions" | "closure-not-usable";
export interface ReceiptFinding {
  readonly entryId: string;
  readonly packId: string;
  readonly code: ReceiptFindingCode;
  readonly severity: "high" | "medium" | "low";
  readonly explanation: string;
}
export interface ReceiptPackGroup {
  readonly packId: string;
  readonly total: number;
  readonly open: number;
  readonly disputed: number;
  readonly unknown: number;
  readonly operations: readonly ReceiptOperation[];
  readonly conditions: readonly ReceiptCondition[];
  readonly tiers: readonly ReceiptEvidenceTier[];
  readonly contentReady: false;
}
export interface ReceiptOperationGroup {
  readonly operation: ReceiptOperation;
  readonly total: number;
  readonly stages: Readonly<Record<ReceiptStage, number>>;
  readonly unknown: number;
}
export interface ReceiptReviewItem {
  readonly id: string;
  readonly packId: string;
  readonly priority: "high" | "medium" | "low";
  readonly reasons: readonly ReceiptFindingCode[];
  readonly affectedEntries: readonly string[];
  readonly contentReady: false;
}
export interface ReceiptSourceGroup {
  readonly source: ReceiptSource;
  readonly count: number;
  readonly entryIds: readonly string[];
}
export interface ReceiptTimelineItem {
  readonly at: string;
  readonly entryId: string;
  readonly description: string;
}
export interface ReceiptChange {
  readonly id: string;
  readonly kind: "added" | "removed" | "changed";
  readonly packId: string;
}
export interface ReceiptAnalysisReport {
  readonly generatedFor: string;
  readonly summary: ReturnType<typeof receiptSummary>;
  readonly findings: readonly ReceiptFinding[];
  readonly packs: readonly ReceiptPackGroup[];
  readonly reviewQueue: readonly ReceiptReviewItem[];
  readonly contentReady: false;
}
const operations: readonly ReceiptOperation[] = ["pack", "download", "export", "handoff"];
const alpha = (a: string, b: string): number => a.localeCompare(b);
const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
const risk = { high: 0, medium: 1, low: 2 };
const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00.000Z`);

/** Findings describe documentation gaps, not accessibility or personal eligibility. */
export function receiptFindings(doc: ReceiptDocument, asOf: string): readonly ReceiptFinding[] {
  const findings: ReceiptFinding[] = [];
  const add = (entry: ReceiptEntry, code: ReceiptFindingCode, severity: ReceiptFinding["severity"], explanation: string): void => {
    findings.push({ entryId: entry.id, packId: entry.packId, code, severity, explanation });
  };
  for (const entry of doc.entries) {
    if (entry.observation.condition === "UNKNOWN") add(entry, "unknown-condition", "medium", "Condition remains UNKNOWN");
    if (entry.source.tier === "UNKNOWN") add(entry, "unknown-tier", "medium", "Evidence tier remains UNKNOWN");
    if (entry.stage === "draft" || entry.stage === "sent") add(entry, "unacknowledged", "medium", "Receipt has no completed acknowledgement");
    if (entry.stage === "disputed") add(entry, "disputed", "high", "A documented dispute needs manual attention");
    if (entry.handoffReference.trim() === "" && entry.operation === "handoff") add(entry, "unreferenced-handoff", "high", "Handoff lacks an explicit reference");
    if (entry.observation.expectedBytes !== null && entry.observation.observedBytes === null) add(entry, "missing-bytes", "medium", "Expected size has no observation");
    if (entry.observation.expectedBytes !== null && entry.observation.observedBytes !== null && entry.observation.expectedBytes !== entry.observation.observedBytes) add(entry, "size-mismatch", "high", "Recorded sizes disagree");
    const age = dayNumber(asOf) - dayNumber(entry.source.retrievedOn);
    if (Number.isFinite(age) && age > 90 * 86400000) add(entry, "stale-source", "low", "Source retrieval date is over 90 days old");
    if (entry.stage === "closed") add(entry, "closure-not-usable", "low", "Closed paperwork cannot establish pack usability");
  }
  const groups = new Map<string, ReceiptEntry[]>();
  for (const entry of doc.entries) {
    const key = `${entry.packId}:${entry.operation}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  for (const entries of groups.values()) {
    if (new Set(entries.map((entry) => entry.observation.condition)).size > 1) {
      for (const entry of entries) add(entry, "contradictory-conditions", "high", "Records for one pack operation disagree");
    }
  }
  return findings.sort((a, b) => risk[a.severity] - risk[b.severity] || alpha(a.packId, b.packId) || alpha(a.entryId, b.entryId) || alpha(a.code, b.code));
}
export function receiptPackGroups(doc: ReceiptDocument): readonly ReceiptPackGroup[] {
  return unique(doc.entries.map((entry) => entry.packId)).sort(alpha).map((packId) => {
    const entries = doc.entries.filter((entry) => entry.packId === packId);
    return {
      packId, total: entries.length,
      open: entries.filter((entry) => entry.stage !== "closed").length,
      disputed: entries.filter((entry) => entry.stage === "disputed").length,
      unknown: entries.filter((entry) => entry.observation.condition === "UNKNOWN" || entry.source.tier === "UNKNOWN").length,
      operations: unique(entries.map((entry) => entry.operation)).sort(alpha),
      conditions: unique(entries.map((entry) => entry.observation.condition)).sort(alpha),
      tiers: unique(entries.map((entry) => entry.source.tier)).sort(alpha),
      contentReady: false,
    };
  });
}
export function receiptOperationGroups(doc: ReceiptDocument): readonly ReceiptOperationGroup[] {
  return operations.map((operation) => {
    const entries = doc.entries.filter((entry) => entry.operation === operation);
    return {
      operation, total: entries.length,
      stages: {
        draft: entries.filter((entry) => entry.stage === "draft").length,
        sent: entries.filter((entry) => entry.stage === "sent").length,
        acknowledged: entries.filter((entry) => entry.stage === "acknowledged").length,
        disputed: entries.filter((entry) => entry.stage === "disputed").length,
        closed: entries.filter((entry) => entry.stage === "closed").length,
      },
      unknown: entries.filter((entry) => entry.observation.condition === "UNKNOWN").length,
    };
  });
}
export function receiptReviewQueue(doc: ReceiptDocument, asOf: string): readonly ReceiptReviewItem[] {
  const findings = receiptFindings(doc, asOf);
  const result: ReceiptReviewItem[] = [];
  for (const packId of unique(findings.map((item) => item.packId))) {
    const subset = findings.filter((item) => item.packId === packId && item.code !== "closure-not-usable");
    if (!subset.length) continue;
    const priority = subset.some((item) => item.severity === "high") ? "high" : subset.some((item) => item.severity === "medium") ? "medium" : "low";
    result.push({ id: `review:${packId}`, packId, priority,
      reasons: unique(subset.map((item) => item.code)).sort(alpha),
      affectedEntries: unique(subset.map((item) => item.entryId)).sort(alpha), contentReady: false });
  }
  return result.sort((a, b) => risk[a.priority] - risk[b.priority] || alpha(a.packId, b.packId));
}
export function receiptSourceGroups(doc: ReceiptDocument): readonly ReceiptSourceGroup[] {
  const grouped = new Map<string, ReceiptEntry[]>();
  for (const entry of doc.entries) {
    const key = JSON.stringify(entry.source);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  return [...grouped].sort(([a], [b]) => alpha(a, b)).map(([, entries]) => ({
    source: entries[0]!.source, count: entries.length, entryIds: entries.map((entry) => entry.id).sort(alpha),
  }));
}
export function receiptTimeline(doc: ReceiptDocument, packId: string): readonly ReceiptTimelineItem[] {
  const entries = doc.entries.filter((entry) => entry.packId === packId);
  return entries.flatMap((entry) => [
    { at: entry.createdAt, entryId: entry.id, description: "Local receipt created" },
    ...receiptEventsFor(doc, entry.id).map((event) => ({ at: event.at, entryId: entry.id, description: `${event.action}: ${event.note}` })),
  ]).sort((a, b) => alpha(a.at, b.at) || alpha(a.entryId, b.entryId));
}
export function compareReceiptDocuments(before: ReceiptDocument, after: ReceiptDocument): readonly ReceiptChange[] {
  const old = new Map(before.entries.map((entry) => [entry.id, entry]));
  const next = new Map(after.entries.map((entry) => [entry.id, entry]));
  const changes: ReceiptChange[] = [];
  for (const entry of after.entries) {
    const existing = old.get(entry.id);
    if (!existing) changes.push({ id: entry.id, packId: entry.packId, kind: "added" });
    else if (JSON.stringify(existing) !== JSON.stringify(entry)) changes.push({ id: entry.id, packId: entry.packId, kind: "changed" });
  }
  for (const entry of before.entries) if (!next.has(entry.id)) changes.push({ id: entry.id, packId: entry.packId, kind: "removed" });
  return changes.sort((a, b) => alpha(a.id, b.id) || alpha(a.kind, b.kind));
}
export function receiptReport(doc: ReceiptDocument, asOf: string): ReceiptAnalysisReport {
  return { generatedFor: asOf, summary: receiptSummary(doc), findings: receiptFindings(doc, asOf),
    packs: receiptPackGroups(doc), reviewQueue: receiptReviewQueue(doc, asOf), contentReady: false };
}
export function receiptNarrative(doc: ReceiptDocument, asOf: string, locale: "en" | "fr"): string {
  const report = receiptReport(doc, asOf);
  if (locale === "fr") return [
    `Registre des accusés de réception — ${asOf}`,
    `Dossiers\u00a0: ${report.summary.entries}`,
    `Évènements\u00a0: ${report.summary.events}`,
    `Conditions UNKNOWN\u00a0: ${report.summary.unknown}`,
    `Litiges\u00a0: ${report.summary.disputed}`,
    `Points d’attention\u00a0: ${report.findings.length}`,
    "Le statut de ce registre ne confirme jamais qu’un ensemble peut être utilisé.",
  ].join("\n");
  return [
    `Recovery receipt ledger — ${asOf}`,
    `Receipts: ${report.summary.entries}`,
    `Events: ${report.summary.events}`,
    `UNKNOWN: ${report.summary.unknown}`,
    `Disputes: ${report.summary.disputed}`,
    `Review findings: ${report.findings.length}`,
    "A ledger status never confirms that a pack can be used.",
  ].join("\n");
}
