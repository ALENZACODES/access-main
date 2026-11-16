import { type Language, type Provenance, type StorageEstimate } from "./regionDownload";
import { type CellAssessment, type RegionAssessment,
  assessRecoveryBudget, suggestRecoveryQueue } from "./updateAssessment";
import { labelledAssessmentBytes, updateCopy } from "./updateCopy";

/** A report contains only identifiers and declared provenance, never payloads. */
export interface UpdateReviewRecord {
  readonly cellId: string;
  readonly status: "saved" | "UNKNOWN";
  readonly reason: CellAssessment["kind"];
  readonly expectedBytes: number | null;
  readonly source: Provenance | null;
  readonly observed: Provenance | null;
}

export interface UpdateReviewReport {
  readonly schema: "local-offline-copy-review-v1";
  readonly regionId: string;
  readonly reportDate: string;
  readonly state: RegionAssessment["status"];
  readonly listed: number;
  readonly saved: number;
  readonly unknown: number;
  readonly remainingBytes: number | null;
  readonly estimatedFreeBytes: number | null;
  readonly budget: "yes" | "no" | "UNKNOWN";
  readonly notes: readonly string[];
  readonly cells: readonly UpdateReviewRecord[];
}

function canonicalDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const when = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(when.getTime()) && when.toISOString().slice(0, 10) === date;
}

/** The caller supplies date explicitly so tests never depend on clock time. */
export function createUpdateReview(
  assessment: RegionAssessment,
  estimate: StorageEstimate,
  date: string,
): UpdateReviewReport {
  if (!canonicalDate(date)) throw new RangeError("Invalid local report date");
  const budget = assessRecoveryBudget(suggestRecoveryQueue(assessment), estimate);
  return {
    schema: "local-offline-copy-review-v1",
    regionId: assessment.regionId,
    reportDate: date,
    state: assessment.status,
    listed: assessment.rows.length,
    saved: assessment.counts.saved,
    unknown: assessment.counts.unknown,
    remainingBytes: assessment.remainingBytes,
    estimatedFreeBytes: budget.estimatedFreeBytes,
    budget: budget.fitsEstimate,
    notes: assessment.notes,
    cells: assessment.rows.map((row) => ({
      cellId: row.id,
      status: row.offlineStatus,
      reason: row.kind,
      expectedBytes: row.expectedBytes,
      source: row.expected,
      observed: row.observed,
    })),
  };
}

/** Field-by-field sanitization prevents control characters reshaping text. */
export function safeReviewText(value: string): string {
  return value.replace(/[\p{Cc}\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, " ");
}

/** Valid JSON for later inspection; the schema never includes saved bytes. */
export function encodeUpdateReview(report: UpdateReviewReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** The text rendering is deterministic and uses French punctuation spacing. */
export function formatUpdateReview(report: UpdateReviewReport, language: Language): string {
  const c = updateCopy(language);
  const colon = language === "fr" ? "\u00a0:" : ":";
  const lines = [
    c.title,
    `${c.date}${colon} ${safeReviewText(report.reportDate)}`,
    `${c.count}${colon} ${report.listed}`,
    `${c.countSaved}${colon} ${report.saved}`,
    `${c.countUnknown}${colon} ${report.unknown}`,
    `${c.remaining}${colon} ${labelledAssessmentBytes(report.remainingBytes, language)}`,
    `${c.quota}${colon} ${labelledAssessmentBytes(report.estimatedFreeBytes, language)}`,
    c.privacy,
    c.advisory,
  ];
  for (const row of report.cells) {
    lines.push("", safeReviewText(row.cellId));
    lines.push(`${c.order}${colon} ${safeReviewText(row.reason)}`);
    lines.push(`${c.unknown}${colon} ${row.status === "saved" ? c.saved : c.unknown}`);
    lines.push(`${c.size}${colon} ${labelledAssessmentBytes(row.expectedBytes, language)}`);
    lines.push(`${c.source}${colon} ${safeReviewText(row.source?.source ?? c.notKnown)}`);
    lines.push(`${c.licence}${colon} ${safeReviewText(row.source?.licence ?? c.notKnown)}`);
    lines.push(`${c.date}${colon} ${safeReviewText(row.source?.date ?? c.notKnown)}`);
    if (row.observed !== null && row.reason === "metadata-changed") {
      lines.push(`${c.observed}${colon} ${safeReviewText(row.observed.source)}`);
      lines.push(`${c.licence}${colon} ${safeReviewText(row.observed.licence)}`);
      lines.push(`${c.date}${colon} ${safeReviewText(row.observed.date)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function updateReviewFilename(regionId: string, date: string, format: "txt" | "json"): string {
  const name = regionId.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `offline-review-${name}-${canonicalDate(date) ? date : "unknown-date"}.${format}`;
}

/** Explicit, user-triggered local download: no upload and no telemetry. */
export function saveUpdateReview(
  report: UpdateReviewReport,
  language: Language,
  format: "txt" | "json",
  doc: Document = document,
): void {
  const content = format === "json" ? encodeUpdateReview(report) : formatUpdateReview(report, language);
  const mime = format === "json" ? "application/json" : "text/plain";
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = doc.createElement("a");
    anchor.hidden = true;
    anchor.download = updateReviewFilename(report.regionId, report.reportDate, format);
    anchor.href = url;
    doc.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally {
    URL.revokeObjectURL(url);
  }
}
