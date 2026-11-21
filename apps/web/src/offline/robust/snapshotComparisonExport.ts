import type { Language } from "./regionDownload";
import { assertSnapshot, encodeSnapshot, rowHasDeclaredChange, type SnapshotDocument, type SnapshotMatrix, type SnapshotMatrixRow } from "./snapshotComparison";
import { SNAPSHOT_CHANGE_LABELS, snapshotCopy } from "./snapshotComparisonCopy";

/** Only provenance and identifiers; never actual cell bytes, coordinates, or personal identifiers. */
export interface SnapshotReport {
  readonly schema: "offline-snapshot-comparison-report-v1";
  readonly regionId: string;
  readonly physicalAccess: "UNKNOWN";
  readonly state: "ready" | "UNKNOWN";
  readonly optionsPresent: number;
  readonly baselineBytes: number;
  readonly optionABytes: number | null;
  readonly optionBBytes: number | null;
  readonly reviewCount: number;
  readonly rows: readonly SnapshotMatrixRow[];
}
export function createSnapshotReport(matrix: SnapshotMatrix): SnapshotReport {
  return { schema: "offline-snapshot-comparison-report-v1", regionId: matrix.regionId,
    physicalAccess: "UNKNOWN", state: matrix.status, optionsPresent: matrix.optionsPresent,
    baselineBytes: matrix.baselineBytes, optionABytes: matrix.optionABytes, optionBBytes: matrix.optionBBytes,
    reviewCount: matrix.reviewCount, rows: matrix.rows };
}
export function encodeSnapshotReport(report: SnapshotReport): string {
  if (report.schema !== "offline-snapshot-comparison-report-v1" || report.physicalAccess !== "UNKNOWN") throw new TypeError("Invalid report");
  return `${JSON.stringify(report, null, 2)}\n`;
}
function oneLine(value: string): string {
  return value.replace(/[\p{Cf}\p{Cc}]/gu, " ").replace(/\s+/gu, " ").trim();
}
export function formatSnapshotReport(report: SnapshotReport, language: Language): string {
  const c = snapshotCopy(language);
  const colon = language === "fr" ? "\u00a0: " : ": ";
  const line = (name: string, value: string | number) => `${name}${colon}${value}`;
  const rows = [c.title, c.notProof, line(c.status, report.state), line("Region", oneLine(report.regionId)),
    line(c.listed, report.rows.length), line(c.changed, report.rows.filter(rowHasDeclaredChange).length), line(c.physical, "UNKNOWN")];
  for (const row of report.rows) {
    rows.push(`${oneLine(row.cellId)} | A${colon}${SNAPSHOT_CHANGE_LABELS[language][row.optionA.kind]} | B${colon}${SNAPSHOT_CHANGE_LABELS[language][row.optionB.kind]} | ${c.statusLabel}${colon}${row.localState}`);
    if (row.attention === "review") {
      rows.push(line(c.question, oneLine(row.optionA.kind === "same" ? row.optionB.question : row.optionA.question)));
    }
  }
  return `${rows.join("\n")}\n`;
}
export function snapshotFilename(regionId: string, extension: "json" | "txt"): string {
  const part = regionId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "region";
  return `offline-snapshot-comparison-${part}.${extension}`;
}
export function saveSnapshotReport(report: SnapshotReport, language: Language, format: "json" | "txt", doc: Document): void {
  const contents = format === "json" ? encodeSnapshotReport(report) : formatSnapshotReport(report, language);
  const blob = new Blob([contents], { type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = snapshotFilename(report.regionId, format);
  doc.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}

/** An explicit, user-directed baseline export for use as a future comparison input. */
export function saveSnapshotDocument(snapshot: SnapshotDocument, doc: Document): void {
  const checked = assertSnapshot(snapshot);
  const blob = new Blob([encodeSnapshot(checked)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  const part = checked.regionId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "region";
  anchor.download = `offline-region-snapshot-${part}.json`;
  doc.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
