import type { Language } from "./regionDownload";
import type { RecoveryPlan, RecoveryReason } from "./recoveryBatches";
import { recoveryCopy, recoveryReasonText } from "./recoveryBatchesCopy";

/** Metadata-only export; the report does not carry pack records or cell contents. */
export interface RecoveryExportRow {
  readonly id: string;
  readonly offlineStatus: "saved" | "UNKNOWN";
  readonly reason: RecoveryReason;
  readonly action: "download" | "inspect" | "none";
  readonly expectedBytes: number | null;
  readonly source: string | null;
  readonly licence: string | null;
  readonly sourceDate: string | null;
  readonly sourceTier: "UNKNOWN";
}

export interface RecoveryExportBatch {
  readonly id: string;
  readonly ids: readonly string[];
  readonly bytes: number;
  readonly status: "fits" | "insufficient" | "UNKNOWN";
  readonly source: string;
  readonly licence: string;
  readonly sourceDate: string;
  readonly sourceTier: "UNKNOWN";
}

export interface RecoveryExport {
  readonly schema: "offline-recovery-batches-v1";
  readonly regionId: string;
  readonly state: RecoveryPlan["state"];
  readonly budget: RecoveryPlan["budget"];
  readonly estimatedFreeBytes: number | null;
  readonly reserveBytes: number;
  readonly suggestedBytes: number | null;
  readonly totalBytes: number | null;
  readonly notes: readonly string[];
  readonly rows: readonly RecoveryExportRow[];
  readonly batches: readonly RecoveryExportBatch[];
}

export function buildRecoveryExport(plan: RecoveryPlan): RecoveryExport {
  return {
    schema: "offline-recovery-batches-v1",
    regionId: plan.regionId,
    state: plan.state,
    budget: plan.budget,
    estimatedFreeBytes: plan.freeBytes,
    reserveBytes: plan.reserveBytes,
    suggestedBytes: plan.suggestedBytes,
    totalBytes: plan.totalBytes,
    notes: [...plan.notes],
    rows: plan.rows.map((row) => ({
      id: row.id,
      offlineStatus: row.offlineStatus,
      reason: row.reason,
      action: row.action,
      expectedBytes: row.bytes,
      source: row.source?.source ?? null,
      licence: row.source?.licence ?? null,
      sourceDate: row.source?.date ?? null,
      sourceTier: "UNKNOWN",
    })),
    batches: plan.batches.map((batch) => ({
      id: batch.id,
      ids: [...batch.ids],
      bytes: batch.bytes,
      status: batch.status,
      source: batch.source.source,
      licence: batch.source.licence,
      sourceDate: batch.source.date,
      sourceTier: "UNKNOWN",
    })),
  };
}

export function encodeRecoveryExport(report: RecoveryExport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function safe(value: string): string {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ");
}

function bytes(value: number | null, language: Language): string {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return "UNKNOWN";
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(value)} B`;
}

/** Pure deterministic text, including French nonbreaking colon spacing. */
export function formatRecoveryExport(report: RecoveryExport, language: Language): string {
  const c = recoveryCopy(language);
  const colon = language === "fr" ? "\u00a0:" : ":";
  const label = (key: string, value: string): string => `${key}${colon} ${safe(value)}`;
  const lines = [
    c.title,
    label(c.regionStatus, report.state),
    label(c.estimatedFree, bytes(report.estimatedFreeBytes, language)),
    label(c.reserved, bytes(report.reserveBytes, language)),
    label(c.suggested, bytes(report.suggestedBytes, language)),
    label(c.batchCount, String(report.batches.length)),
    label(c.unknownCount, String(report.rows.filter((row) => row.offlineStatus === "UNKNOWN").length)),
    c.privacy,
    c.disclaimer,
  ];
  for (const batch of report.batches) {
    lines.push("", `${c.batch} ${safe(batch.id)}`);
    lines.push(label(c.listedSize, bytes(batch.bytes, language)));
    lines.push(label(c.source, batch.source));
    lines.push(label(c.licence, batch.licence));
    lines.push(label(c.date, batch.sourceDate));
    lines.push(label(c.tier, batch.sourceTier));
    lines.push(label(c.regionStatus, batch.status));
    for (const id of batch.ids) lines.push(`- ${safe(id)}`);
  }
  for (const row of report.rows) {
    lines.push("", safe(row.id));
    lines.push(label(c.regionStatus, row.offlineStatus));
    lines.push(label(c.reason, recoveryReasonText(row.reason, language)));
    lines.push(label(c.listedSize, bytes(row.expectedBytes, language)));
    lines.push(label(c.source, row.source ?? "UNKNOWN"));
    lines.push(label(c.licence, row.licence ?? "UNKNOWN"));
    lines.push(label(c.date, row.sourceDate ?? "UNKNOWN"));
    lines.push(label(c.tier, row.sourceTier));
  }
  return `${lines.join("\n")}\n`;
}

/** File names are local, bounded and do not preserve path separators. */
export function recoveryExportFilename(regionId: string, format: "txt" | "json"): string {
  const stem = regionId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `offline-recovery-${stem}.${format}`;
}

/** Only a direct click in the hosting UI should call this function. */
export function saveRecoveryExport(
  report: RecoveryExport,
  language: Language,
  format: "txt" | "json",
  doc: Document = document,
): void {
  const content = format === "json" ? encodeRecoveryExport(report) : formatRecoveryExport(report, language);
  const mime = format === "json" ? "application/json" : "text/plain";
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = recoveryExportFilename(report.regionId, format);
    anchor.hidden = true;
    doc.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally {
    URL.revokeObjectURL(url);
  }
}
