import { saveTextFile } from "../../states/downloadFile";
import type { Language } from "./regionDownload";
import type { GuidePlan, GuideCell, GuideRequest } from "./recoveryGuide";
import { recoveryActionLabel, recoveryBytes, recoveryGateLabel,
  recoveryGuideCopy, recoveryIssueLabel } from "./recoveryGuideCopy";

/** Versioned, device-only record. It never contains offline map cell payloads. */
export interface RecoveryGuideReport {
  readonly schema: "offline-recovery-guide-v1";
  readonly regionId: string;
  readonly day: string;
  readonly readiness: GuidePlan["gate"];
  readonly summary: GuidePlan["totals"];
  readonly reserveBytes: number;
  readonly freeBytes: number | null;
  readonly proposed: readonly string[];
  readonly issues: readonly string[];
  readonly cells: readonly GuideCell[];
}

export function validGuideDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const value = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(value.valueOf()) && value.toISOString().slice(0, 10) === day;
}

export function createRecoveryGuideReport(plan: GuidePlan, day: string,
  request?: GuideRequest): RecoveryGuideReport {
  if (!validGuideDay(day)) throw new RangeError("Invalid report date");
  return {
    schema: "offline-recovery-guide-v1", regionId: plan.regionId, day,
    readiness: plan.gate, summary: plan.totals, reserveBytes: plan.reserveBytes,
    freeBytes: plan.freeBytes, proposed: request?.gate === "ready" ? request.ids : [],
    issues: plan.issues, cells: plan.cells,
  };
}

export function encodeRecoveryGuideReport(report: RecoveryGuideReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function safeGuideText(value: string): string {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ").slice(0, 700);
}

export function formatRecoveryGuideReport(report: RecoveryGuideReport, language: Language): string {
  const c = recoveryGuideCopy(language);
  const sep = language === "fr" ? "\u00a0:" : ":";
  const lines = [
    c.title,
    `${c.date}${sep} ${safeGuideText(report.day)}`,
    `${c.state}${sep} ${recoveryGateLabel(report.readiness, language)}`,
    `${c.listed}${sep} ${report.summary.listed}`,
    `${c.savedCount}${sep} ${report.summary.saved}`,
    `${c.unknownCount}${sep} ${report.summary.unknown}`,
    `${c.retryCount}${sep} ${report.summary.retry}`,
    `${c.free}${sep} ${recoveryBytes(report.freeBytes, language)}`,
    `${c.reserve}${sep} ${recoveryBytes(report.reserveBytes, language)}`,
    c.disclaimer,
  ];
  for (const cell of report.cells) {
    lines.push(
      "", safeGuideText(cell.id),
      `${c.state}${sep} ${cell.state === "saved" ? c.saved : "UNKNOWN"}`,
      `${c.issue}${sep} ${recoveryIssueLabel(cell.issue, language)}`,
      `${c.action}${sep} ${recoveryActionLabel(cell.action, language)}`,
      `${c.size}${sep} ${recoveryBytes(cell.bytes, language)}`,
      `${c.source}${sep} ${safeGuideText(cell.provenance?.source ?? "UNKNOWN")}`,
      `${c.licence}${sep} ${safeGuideText(cell.provenance?.licence ?? "UNKNOWN")}`,
      `${c.date}${sep} ${safeGuideText(cell.provenance?.date ?? "UNKNOWN")}`,
      `${c.tier}${sep} UNKNOWN`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function recoveryGuideFilename(region: string, day: string, extension: "txt" | "json"): string {
  const id = region.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60) || "region";
  return `offline-recovery-${id}-${validGuideDay(day) ? day : "unknown-date"}.${extension}`;
}

/** Only called directly by a user-activated control; does not upload anything. */
export function saveRecoveryGuideReport(report: RecoveryGuideReport, language: Language,
  format: "txt" | "json", doc: Document = document): void {
  const content = format === "json" ? encodeRecoveryGuideReport(report) :
    formatRecoveryGuideReport(report, language);
  const type = format === "json" ? "application/json" : "text/plain";
  const saved = saveTextFile({
    name: recoveryGuideFilename(report.regionId, report.day, format),
    mime: `${type};charset=utf-8`,
    content,
  }, doc);
  if (!saved) throw new Error("File download unavailable");
}
