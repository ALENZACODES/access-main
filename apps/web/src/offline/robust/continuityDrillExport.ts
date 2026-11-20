import type { Language, Provenance } from "./regionDownload";
import type { DrillResult, DrillScenario, DrillStatus } from "./continuityDrill";

/** A report contains manifest metadata and hypothetical outcomes, never cell payload bytes. */
export interface ContinuityReportCell {
  readonly id: string;
  readonly source: Provenance;
  readonly tier: "UNKNOWN";
  readonly listedBytes: number;
  readonly before: DrillStatus;
  readonly after: DrillStatus;
  readonly affected: boolean;
  readonly reason: string;
}

export interface ContinuityReport {
  readonly schema: "offline-continuity-report-v1";
  readonly date: string;
  readonly region: string;
  readonly scenario: DrillScenario;
  readonly state: "complete" | "partial" | "UNKNOWN";
  readonly tier: "UNKNOWN";
  readonly totals: {
    readonly listed: number;
    readonly beforeSaved: number;
    readonly beforeUnknown: number;
    readonly afterSaved: number;
    readonly afterUnknown: number;
    readonly affected: number;
  };
  readonly capacity: { readonly freeBytes: number | null };
  readonly cells: readonly ContinuityReportCell[];
}

const MAX_REPORT_CELLS = 2048;
const MAX_TEXT_LENGTH = 2048;
const BAD_DIRECTION = /[\u202a-\u202e\u2066-\u2069]/gu;

/** Preserve readable text without accepting control characters or direction overrides. */
function printable(value: string): string {
  return [...value.replace(BAD_DIRECTION, " ")].map((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) ? " " : char;
  }).join("").replace(/\s+/gu, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function reportForDate(result: DrillResult, date: string): ContinuityReport {
  if (!validDate(date)) throw new TypeError("Invalid report date");
  if (result.cells.length > MAX_REPORT_CELLS) throw new RangeError("Too many report cells");
  const cells: ContinuityReportCell[] = result.cells.map((cell) => ({
    id: cell.id,
    source: { source: cell.source, licence: cell.licence, date: cell.date },
    tier: "UNKNOWN",
    listedBytes: cell.bytes,
    before: cell.before,
    after: cell.after,
    affected: cell.affected,
    reason: cell.reason,
  }));
  const afterSaved = cells.filter((cell) => cell.after === "saved").length;
  const beforeSaved = cells.filter((cell) => cell.before === "saved").length;
  const state: ContinuityReport["state"] = result.status === "UNKNOWN" ? "UNKNOWN" :
    afterSaved < cells.length ? "partial" : "complete";
  return {
    schema: "offline-continuity-report-v1",
    date,
    region: result.regionId,
    scenario: result.scenario,
    state,
    tier: "UNKNOWN",
    totals: {
      listed: cells.length,
      beforeSaved,
      beforeUnknown: cells.length - beforeSaved,
      afterSaved,
      afterUnknown: cells.length - afterSaved,
      affected: cells.filter((cell) => cell.affected).length,
    },
    capacity: { freeBytes: result.quota },
    cells,
  };
}

/** Compatibility overload: earlier panel/tests request JSON directly using a language. */
export function createContinuityReport(result: DrillResult, language: Language): string;
/** Explicit dated report used by the metadata-only review and export tests. */
export function createContinuityReport(result: DrillResult, date: string): ContinuityReport;
export function createContinuityReport(result: DrillResult, dateOrLanguage: string): string | ContinuityReport {
  if (dateOrLanguage === "en" || dateOrLanguage === "fr") {
    // Preserve the old serialized interface and its top-level tier assertion.
    return JSON.stringify({ schema: "offline-continuity-report-v1", locale: dateOrLanguage,
      tier: "UNKNOWN", regionId: result.regionId, status: result.status,
      scenario: result.scenario, beforeSaved: result.beforeSaved, afterSaved: result.afterSaved,
      cells: result.cells.map((cell) => ({ id: cell.id, before: cell.before, after: cell.after,
        reason: cell.reason, source: cell.source, licence: cell.licence, date: cell.date,
        bytes: cell.bytes })) }, null, 2);
  }
  return reportForDate(result, dateOrLanguage);
}

/** Deterministic structured report JSON. Never includes a stored file or downloaded bytes. */
export function encodeContinuityReport(report: ContinuityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const TEXT_LABELS = {
  en: { title: "Offline continuity drill", region: "Region", date: "Date", scenario: "Scenario",
    status: "Status", before: "Before", after: "After", reason: "Reason",
    source: "Source", licence: "Licence", sourceDate: "Source date",
    tier: "Source tier", size: "Listed bytes", free: "Estimated free storage",
    affected: "Affected", note: "This is a planning exercise. No cell payload is included." },
  fr: { title: "Exercice de continuité hors ligne", region: "Région", date: "Date", scenario: "Scénario",
    status: "État", before: "Avant", after: "Après", reason: "Raison",
    source: "Source", licence: "Licence", sourceDate: "Date de la source",
    tier: "Niveau de source", size: "Octets répertoriés", free: "Stockage libre estimé",
    affected: "Concernée", note: "Cet exercice sert à la planification. Aucune donnée de cellule n’est incluse." },
} as const;

const REASONS: Record<Language, Readonly<Record<string, string>>> = {
  en: { missing: "Not downloaded", present: "Saved locally", stale: "Out of date",
    unreadable: "Local copy could not be read", UNKNOWN: "UNKNOWN",
    "simulated-loss": "Hypothetical loss", "simulated-eviction": "Hypothetical loss",
    "simulated-source-change": "Hypothetical source change" },
  fr: { missing: "Non téléchargée", present: "Enregistrée localement", stale: "Périmée",
    unreadable: "Impossible de lire la copie locale", UNKNOWN: "UNKNOWN",
    "simulated-loss": "Perte hypothétique", "simulated-eviction": "Perte hypothétique",
    "simulated-source-change": "Modification hypothétique de source" },
};

/** Safe plain-text report with FR nonbreaking colon spacing and literal UNKNOWN states. */
export function formatContinuityReport(report: ContinuityReport, language: Language): string {
  const copy = TEXT_LABELS[language];
  const sep = language === "fr" ? "\u00a0: " : ": ";
  const field = (name: string, value: string | number): string => `${name}${sep}${printable(String(value))}`;
  const lines: string[] = [copy.title,
    field(copy.region, report.region), field(copy.date, report.date),
    field(copy.scenario, report.scenario), field(copy.status, report.state),
    field(copy.free, report.capacity.freeBytes ?? "UNKNOWN"), ""];
  for (const cell of report.cells) {
    lines.push(printable(cell.id), field(copy.before, cell.before), field(copy.after, cell.after),
      field(copy.reason, REASONS[language][cell.reason] ?? printable(cell.reason)),
      field(copy.source, cell.source.source), field(copy.licence, cell.source.licence),
      field(copy.sourceDate, cell.source.date), field(copy.tier, cell.tier),
      field(copy.size, cell.listedBytes), field(copy.affected, cell.affected ? (language === "fr" ? "Oui" : "Yes") : (language === "fr" ? "Non" : "No")), "");
  }
  lines.push(copy.note);
  return `${lines.join("\n")}\n`;
}

/** Restrict filename characters without permitting separators, directory escapes or direction markers. */
export function continuityFilename(region: string, date: string, format: "json" | "txt"): string {
  const normalized = printable(region).toLowerCase().replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "").slice(0, 55).replace(/-+$/u, "");
  const safeRegion = normalized || "region";
  const safeDate = validDate(date) ? date : "unknown-date";
  return `offline-continuity-${safeRegion}-${safeDate}.${format}`;
}

/** Existing explicit browser export action remains metadata-only. */
export function saveContinuityReport(result: DrillResult, language: Language, doc: Document): void {
  const text = createContinuityReport(result, language);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = "offline-continuity-report.json";
  doc.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
