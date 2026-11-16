import { type Language, type DownloadResult } from "./regionDownload.ts";
import { type RegionInventory } from "./regionInventory.ts";
import { type CapacityPlan } from "./quotaPlanning.ts";
import { type ManifestAudit } from "./manifestAudit.ts";

/** A snapshot contains metadata only; it never includes downloaded cell bytes. */
export interface LocalReport {
  readonly schema: "offline-report-v1";
  readonly region: string;
  readonly createdOn: string;
  readonly status: "complete" | "partial" | "unknown";
  readonly saved: number;
  readonly unknown: number;
  readonly expected: number;
  readonly remainingBytes: number | null;
  readonly estimatedFreeBytes: number | null;
  readonly lastStop: DownloadResult["reason"] | null;
  readonly manifestReady: boolean;
  readonly findings: readonly {
    readonly code: string;
    readonly cell: string | null;
  }[];
  readonly cells: readonly LocalCellRecord[];
}

export interface LocalCellRecord {
  readonly id: string;
  readonly offlineStatus: "saved" | "unknown";
  readonly cause: "present" | "missing" | "stale" | "unreadable";
  readonly expectedBytes: number;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
}

export interface LocalReportInput {
  readonly regionId: string;
  readonly inventory: RegionInventory | null;
  readonly plan: CapacityPlan | null;
  readonly audit: ManifestAudit;
  readonly result: DownloadResult | null;
  readonly date: string;
}

/**
 * Report creation is synchronous, local-only and side-effect free. A region
 * with missing or unreadable inventory never reports successful completion.
 */
export function createLocalReport(input: LocalReportInput): LocalReport {
  const inventory = input.inventory;
  const cells: readonly LocalCellRecord[] = inventory?.cells.map((cell) => ({
    id: cell.id,
    offlineStatus: cell.state,
    cause: cell.cause,
    expectedBytes: cell.expectedBytes,
    source: cell.provenance.source,
    licence: cell.provenance.licence,
    date: cell.provenance.date,
  })) ?? [];
  const status = inventory === null ? "unknown" :
    inventory.complete && input.audit.ready ? "complete" : "partial";
  return {
    schema: "offline-report-v1",
    region: input.regionId,
    createdOn: input.date,
    status,
    saved: inventory?.savedCount ?? 0,
    unknown: inventory?.unknownCount ?? input.audit.count,
    expected: input.audit.count,
    remainingBytes: input.plan?.remainingBytes ?? null,
    estimatedFreeBytes: input.plan?.freeBytes ?? null,
    lastStop: input.result?.reason ?? null,
    manifestReady: input.audit.ready,
    findings: input.audit.findings.map((finding) => ({
      code: finding.code,
      cell: finding.cellId,
    })),
    cells,
  };
}

/** Stable JSON for explicit copy actions; no background upload. */
export function encodeLocalReport(report: LocalReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const HEADINGS = {
  en: {
    title: "Offline region report",
    status: "Status",
    saved: "Saved cells",
    unknown: "UNKNOWN cells",
    capacity: "Estimated free storage",
    source: "Source",
    licence: "Licence",
    date: "Date",
    incomplete: "Cell status is UNKNOWN until it is saved locally.",
    metadata: "This report contains metadata, not downloaded content.",
    partial: "Partial",
    complete: "All listed cells saved",
    unknownStatus: "UNKNOWN",
  },
  fr: {
    title: "Rapport de région hors ligne",
    status: "État",
    saved: "Cellules enregistrées",
    unknown: "Cellules INCONNUES",
    capacity: "Stockage libre estimé",
    source: "Source",
    licence: "Licence",
    date: "Date",
    incomplete: "L’état de la cellule reste INCONNU jusqu’à son enregistrement local.",
    metadata: "Ce rapport contient des métadonnées et non le contenu téléchargé.",
    partial: "Partiel",
    complete: "Toutes les cellules répertoriées sont enregistrées",
    unknownStatus: "INCONNU",
  },
} as const;

function plain(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, " ");
}

function display(value: number | null, language: Language): string {
  if (value === null) return language === "en" ? "UNKNOWN" : "INCONNU";
  return `${value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA")} B`;
}

/** Accessible plain-text alternative to JSON, suitable for copying. */
export function formatLocalReport(report: LocalReport, language: Language): string {
  const copy = HEADINGS[language];
  const colon = language === "fr" ? "\u00a0:" : ":";
  const status = report.status === "complete" ? copy.complete :
    report.status === "partial" ? copy.partial : copy.unknownStatus;
  const lines = [
    copy.title,
    `${copy.status}${colon} ${status}`,
    `${copy.date}${colon} ${plain(report.createdOn)}`,
    `${copy.saved}${colon} ${report.saved}`,
    `${copy.unknown}${colon} ${report.unknown}`,
    `${copy.capacity}${colon} ${display(report.estimatedFreeBytes, language)}`,
    copy.metadata,
    copy.incomplete,
  ];
  for (const cell of report.cells) {
    lines.push(
      "",
      plain(cell.id),
      `${copy.status}${colon} ${cell.offlineStatus === "saved" ?
        (language === "fr" ? "Enregistrée" : "Saved") : copy.unknownStatus}`,
      `${copy.source}${colon} ${plain(cell.source)}`,
      `${copy.licence}${colon} ${plain(cell.licence)}`,
      `${copy.date}${colon} ${plain(cell.date)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Safe, bounded filename; does not expose region identifiers as paths. */
export function reportFilename(regionId: string, date: string, extension: "txt" | "json"): string {
  const stem = regionId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "unknown-date";
  return `offline-${stem}-${day}.${extension}`;
}

/**
 * An explicit, synchronous browser download. No cell bytes, storage keys,
 * network operations or telemetry are involved. Caller owns user activation.
 */
export function saveReportFile(
  report: LocalReport,
  language: Language,
  format: "txt" | "json",
  documentRef: Document = document,
): void {
  const content = format === "json" ? encodeLocalReport(report) :
    formatLocalReport(report, language);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = reportFilename(report.region, report.createdOn, format);
    anchor.hidden = true;
    documentRef.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally {
    URL.revokeObjectURL(url);
  }
}
