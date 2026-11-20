import type { Language, Provenance } from "./regionDownload";
import type { AgeCell, AgeSummary } from "./sourceAgeReview";
import { ageBandText, ageIssueText, copyBandText, sourceAgeCopy } from "./sourceAgeCopy";

export interface SourceAgeRecord {
  readonly cellId: string;
  readonly publicationAge: number | null;
  readonly ageBand: AgeCell["ageBand"];
  readonly copyBand: AgeCell["copyBand"];
  readonly issue: AgeCell["issue"];
  readonly bytes: number | null;
  readonly source: Provenance | null;
  readonly evidenceTier: "UNKNOWN";
}
export interface SourceAgeDocument {
  readonly schema: "offline-source-age-v1";
  readonly region: string;
  readonly asOf: string;
  readonly thresholdDays: number;
  readonly state: "ready" | "UNKNOWN";
  readonly counts: {
    readonly total: number;
    readonly saved: number;
    readonly missing: number;
    readonly stale: number;
    readonly unreadable: number;
    readonly older: number;
    readonly recent: number;
    readonly future: number;
    readonly unknown: number;
  };
  readonly findings: readonly string[];
  readonly records: readonly SourceAgeRecord[];
}

/** Export metadata only; offline content and device identifiers are omitted. */
export function createSourceAgeDocument(summary: AgeSummary): SourceAgeDocument {
  return {
    schema: "offline-source-age-v1",
    region: summary.regionId,
    asOf: summary.asOf,
    thresholdDays: summary.thresholdDays,
    state: summary.state,
    counts: {
      total: summary.total,
      saved: summary.saved,
      missing: summary.missing,
      stale: summary.stale,
      unreadable: summary.unreadable,
      older: summary.older,
      recent: summary.recent,
      future: summary.future,
      unknown: summary.unknown,
    },
    findings: summary.findings,
    records: summary.rows.map((row) => ({
      cellId: row.id,
      publicationAge: row.ageDays,
      ageBand: row.ageBand,
      copyBand: row.copyBand,
      issue: row.issue,
      bytes: row.listedBytes,
      source: row.provenance,
      evidenceTier: "UNKNOWN",
    })),
  };
}

/** Never serialize an unbounded or invalid report. */
export function encodeSourceAgeDocument(report: SourceAgeDocument): string {
  if (report.records.length > 50_000) throw new RangeError("Too many records");
  const output = JSON.stringify(report, null, 2);
  if (output.length > 12 * 1024 * 1024) throw new RangeError("Report too large");
  return `${output}\n`;
}

/** Control characters and direction overrides cannot reshape the text report. */
export function safeSourceAgeText(input: string): string {
  return input.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ");
}

export function formatSourceAgeDocument(report: SourceAgeDocument, language: Language): string {
  const c = sourceAgeCopy(language);
  const colon = language === "fr" ? "\u00a0:" : ":";
  const label = (key: string, value: string | number): string =>
    `${key}${colon} ${typeof value === "string" ? safeSourceAgeText(value) : String(value)}`;
  const lines: string[] = [
    c.title,
    label(c.today, report.asOf),
    label(c.ageThreshold, report.thresholdDays),
    label(c.total, report.counts.total),
    label(c.available, report.counts.saved),
    label(c.missingCount, report.counts.missing),
    label(c.staleCount, report.counts.stale),
    label(c.unreadableCount, report.counts.unreadable),
    label(c.recentCount, report.counts.recent),
    label(c.olderCount, report.counts.older),
    label(c.futureCount, report.counts.future),
    label(c.unknownCount, report.counts.unknown),
    c.disclaimer,
  ];
  for (const row of report.records) {
    lines.push(
      "",
      safeSourceAgeText(row.cellId),
      label(c.status, copyBandText(row.copyBand, language)),
      label(c.age, row.publicationAge ?? c.unknown),
      label(c.issue, ageIssueText(row.issue, language)),
      label(c.source, row.source?.source ?? c.unknown),
      label(c.licence, row.source?.licence ?? c.unknown),
      label(c.sourceDate, row.source?.date ?? c.unknown),
      label(c.tier, c.unknown),
      label(c.size, row.bytes ?? c.unknown),
      label(c.filter, ageBandText(row.ageBand, language)),
    );
  }
  const result = `${lines.join("\n")}\n`;
  if (result.length > 12 * 1024 * 1024) throw new RangeError("Report too large");
  return result;
}

export function sourceAgeFilename(region: string, format: "json" | "txt"): string {
  const stem = region.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `source-age-${stem}.${format}`;
}

/** Saving is only initiated from a labelled button click in the mounted panel. */
export function saveSourceAgeDocument(
  report: SourceAgeDocument,
  language: Language,
  format: "json" | "txt",
  documentRef: Document = document,
): void {
  const content = format === "json" ? encodeSourceAgeDocument(report) :
    formatSourceAgeDocument(report, language);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.hidden = true;
    anchor.href = url;
    anchor.download = sourceAgeFilename(report.region, format);
    documentRef.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally {
    URL.revokeObjectURL(url);
  }
}
