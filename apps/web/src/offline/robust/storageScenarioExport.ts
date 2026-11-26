import { saveTextFile } from "../../states/downloadFile";
import type { Language, Provenance } from "./regionDownload.ts";
import type { ScenarioPlan, ScenarioStatus, CandidateReason } from "./storageScenario.ts";
import { candidateReasonText, scenarioCopy, scenarioStatusText } from "./storageScenarioCopy.ts";

/** Only listing metadata is exported; never pack payloads or browser IDs. */
export interface ScenarioReportCell {
  readonly id: string;
  readonly status: "saved" | "candidate" | "blocked" | "UNKNOWN";
  readonly reason: CandidateReason;
  readonly expectedBytes: number | null;
  readonly plannedBytes: number | null;
  readonly source: Provenance | null;
  readonly sourceTier: "UNKNOWN";
}

export interface ScenarioReport {
  readonly schema: "offline-storage-scenario-v1";
  readonly regionId: string;
  readonly reportDate: string;
  readonly status: ScenarioStatus;
  readonly summary: ScenarioPlan["totals"];
  readonly blocks: readonly string[];
  readonly reasons: readonly string[];
  readonly groups: readonly {
    ordinal: number;
    ids: readonly string[];
    bytes: number;
    source: Provenance;
    result: ScenarioStatus;
    remainingBytes: number | null;
  }[];
  readonly cells: readonly ScenarioReportCell[];
}

export function dateIsReal(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === day;
}

export function createScenarioReport(plan: ScenarioPlan, date: string): ScenarioReport {
  if (!dateIsReal(date)) throw new RangeError("Invalid report date");
  return {
    schema: "offline-storage-scenario-v1",
    regionId: plan.regionId,
    reportDate: date,
    status: plan.status,
    summary: { ...plan.totals },
    blocks: [...plan.blocks],
    reasons: [plan.reason],
    groups: plan.batches.map((batch) => ({
      ordinal: batch.ordinal, ids: [...batch.ids], bytes: batch.bytes,
      source: { ...batch.source }, result: batch.status,
      remainingBytes: batch.remainingBytes,
    })),
    cells: plan.cells.map((cell) => ({
      id: cell.id, status: cell.disposition, reason: cell.reason,
      expectedBytes: cell.listedBytes, plannedBytes: cell.plannedBytes,
      source: cell.source ? { ...cell.source } : null, sourceTier: "UNKNOWN",
    })),
  };
}

/** A plain text report cannot be reshaped by embedded control or bidi overrides. */
export function safeScenarioText(value: string): string {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ");
}

export function encodeScenarioReport(report: ScenarioReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function bytes(value: number | null, language: Language): string {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return "UNKNOWN";
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(value)} B`;
}

export function formatScenarioReport(report: ScenarioReport, language: Language): string {
  const c = scenarioCopy(language);
  const sep = language === "fr" ? "\u00a0:" : ":";
  const text = [
    c.title,
    `${c.date}${sep} ${report.reportDate}`,
    `${c.scenario}${sep} ${scenarioStatusText(report.status, language)}`,
    `${c.savedCount}${sep} ${report.summary.savedCells}`,
    `${c.candidateCount}${sep} ${report.summary.candidateCells}`,
    `${c.unknownCount}${sep} ${report.summary.unknownCells}`,
    `${c.freeSpace}${sep} ${bytes(report.summary.freeBytes, language)}`,
    `${c.reserveSpace}${sep} ${bytes(report.summary.reserveBytes, language)}`,
    `${c.totalCost}${sep} ${bytes(report.summary.totalPlannedBytes, language)}`,
    `${c.groupCount}${sep} ${report.groups.length}`,
    c.advisory,
    c.onlyWhenReady,
  ];
  for (const cell of report.cells) {
    text.push("", safeScenarioText(cell.id));
    text.push(`${c.reason}${sep} ${candidateReasonText(cell.reason, language)}`);
    text.push(`${c.size}${sep} ${bytes(cell.expectedBytes, language)}`);
    text.push(`${c.planned}${sep} ${bytes(cell.plannedBytes, language)}`);
    text.push(`${c.source}${sep} ${safeScenarioText(cell.source?.source ?? "UNKNOWN")}`);
    text.push(`${c.licence}${sep} ${safeScenarioText(cell.source?.licence ?? "UNKNOWN")}`);
    text.push(`${c.date}${sep} ${safeScenarioText(cell.source?.date ?? "UNKNOWN")}`);
    text.push(`${c.tier}${sep} UNKNOWN`);
  }
  for (const group of report.groups) {
    text.push("", `${c.group}${sep} ${group.ordinal}`);
    text.push(`${c.groupBytes}${sep} ${bytes(group.bytes, language)}`);
    text.push(`${c.afterGroup}${sep} ${bytes(group.remainingBytes, language)}`);
    text.push(group.ids.map(safeScenarioText).join(", "));
  }
  return `${text.join("\n")}\n`;
}

export function scenarioFilename(region: string, date: string, format: "json" | "txt"): string {
  const normalized = region.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 50) || "region";
  return `offline-storage-${normalized}-${dateIsReal(date) ? date : "unknown-date"}.${format}`;
}

/** Explicit user-triggered save. No background transfer or external request. */
export function saveScenarioReport(
  report: ScenarioReport,
  language: Language,
  format: "txt" | "json",
  documentRef: Document,
): void {
  const data = format === "json" ? encodeScenarioReport(report) : formatScenarioReport(report, language);
  const saved = saveTextFile({
    name: scenarioFilename(report.regionId, report.reportDate, format),
    mime: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
    content: data,
  }, documentRef);
  if (!saved) throw new Error("File download unavailable");
}
