import type { Language, Provenance } from "./regionDownload";
import type { DrillResult, DrillCell } from "./continuityDrill";
import { continuityCopy, continuityReasonLabel, continuityFormatBytes,
  continuityScenarioLabel } from "./continuityDrillCopy";

/** Metadata-only review. No cell payload is carried by this type. */
export interface ContinuityReportCell {
  readonly id: string;
  readonly before: "saved" | "UNKNOWN";
  readonly after: "saved" | "UNKNOWN";
  readonly reason: string;
  readonly affected: boolean;
  readonly listedBytes: number | null;
  readonly source: Provenance | null;
  readonly tier: "UNKNOWN";
}
export interface ContinuityReport {
  readonly schema: "offline-continuity-report-v1";
  readonly region: string;
  readonly date: string;
  readonly scenario: DrillResult["scenario"];
  readonly state: DrillResult["status"];
  readonly findings: readonly string[];
  readonly totals: DrillResult["totals"];
  readonly capacity: DrillResult["quota"];
  readonly cells: readonly ContinuityReportCell[];
}
function calendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === date;
}
function safeString(text: string): string {
  return text.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ");
}
function reportCell(row: DrillCell): ContinuityReportCell {
  return {
    id: row.id, before: row.before, after: row.after,
    reason: row.reason, affected: row.affected,
    listedBytes: row.expectedBytes,
    source: row.provenance === null ? null : { ...row.provenance }, tier: "UNKNOWN",
  };
}
export function createContinuityReport(result: DrillResult, date: string): ContinuityReport {
  if (!calendarDate(date)) throw new RangeError("Invalid report date");
  if (result.cells.length > 25_000) throw new RangeError("Too many report cells");
  return {
    schema: "offline-continuity-report-v1", region: result.regionId,
    date, scenario: result.scenario, state: result.status,
    findings: [...result.findings], totals: { ...result.totals },
    capacity: { ...result.quota }, cells: result.cells.map(reportCell),
  };
}
export function encodeContinuityReport(report: ContinuityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
export function formatContinuityReport(report: ContinuityReport, language: Language): string {
  const c = continuityCopy(language);
  const sep = language === "fr" ? "\u00a0:" : ":";
  const status = report.state === "UNKNOWN" ? "UNKNOWN" : report.state;
  const lines = [
    c.title,
    `${c.date}${sep} ${safeString(report.date)}`,
    `${c.scenario}${sep} ${continuityScenarioLabel(report.scenario, language)}`,
    `${c.result}${sep} ${status}`,
    `${c.listedCount}${sep} ${report.totals.listed}`,
    `${c.saved}${sep} ${report.totals.afterSaved}`,
    `${c.unknown}${sep} ${report.totals.afterUnknown}`,
    `${c.affectedCount}${sep} ${report.totals.affected}`,
    `${c.quota}${sep} ${continuityFormatBytes(report.capacity.freeBytes, language)}`,
    c.localOnly,
    c.note,
  ];
  for (const cell of report.cells) {
    lines.push(
      "",
      safeString(cell.id),
      `${c.before}${sep} ${cell.before}`,
      `${c.after}${sep} ${cell.after}`,
      `${c.reason}${sep} ${continuityReasonLabel(cell.reason as DrillCell["reason"], language)}`,
      `${c.affected}${sep} ${cell.affected ? "1" : "0"}`,
      `${c.bytes}${sep} ${continuityFormatBytes(cell.listedBytes, language)}`,
      `${c.source}${sep} ${safeString(cell.source?.source ?? "UNKNOWN")}`,
      `${c.licence}${sep} ${safeString(cell.source?.licence ?? "UNKNOWN")}`,
      `${c.date}${sep} ${safeString(cell.source?.date ?? "UNKNOWN")}`,
      `${c.tier}${sep} UNKNOWN`,
    );
  }
  return `${lines.join("\n")}\n`;
}
export function continuityFilename(region: string, date: string, extension: "txt" | "json"): string {
  const slug = region.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `offline-continuity-${slug}-${calendarDate(date) ? date : "unknown-date"}.${extension}`;
}
/** Called only from an explicit save button. */
export function saveContinuityReport(
  report: ContinuityReport, language: Language, format: "txt" | "json", doc: Document,
): void {
  const content = format === "json" ? encodeContinuityReport(report) : formatContinuityReport(report, language);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = doc.createElement("a");
    anchor.hidden = true;
    anchor.download = continuityFilename(report.region, report.date, format);
    anchor.href = url;
    doc.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally { URL.revokeObjectURL(url); }
}
