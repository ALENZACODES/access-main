import type { Language, Provenance } from "./regionDownload";
import type { OfflineCase, Casebook, CasebookSummary, CaseEvent } from "./offlineCasebook";
import { casebookSummary, encodeCasebook, validateCasebook } from "./offlineCasebook";
import { caseActionText, caseEvidenceText, caseReasonText, caseStatusText, casebookCopy } from "./offlineCasebookCopy";

export interface CasebookLocalReport {
  readonly schema: "offline-casebook-report-v1";
  readonly regionId: string;
  readonly createdAt: string;
  readonly revision: number;
  readonly counts: CasebookSummary;
  readonly cases: readonly {
    readonly id: string;
    readonly cellId: string;
    readonly reason: OfflineCase["reason"];
    readonly status: OfflineCase["status"];
    readonly evidence: OfflineCase["evidence"];
    readonly sourceTier: "UNKNOWN";
    readonly source: Provenance;
    readonly listedBytes: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly events: readonly CaseEvent[];
  }[];
}

function canonicalTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}

export function createCasebookReport(book: Casebook, createdAt: string): CasebookLocalReport {
  validateCasebook(book);
  if (!canonicalTimestamp(createdAt)) throw new RangeError("Invalid report timestamp");
  return {
    schema: "offline-casebook-report-v1", regionId: book.regionId,
    createdAt, revision: book.revision, counts: casebookSummary(book),
    cases: book.cases.map((row) => ({
      id: row.id, cellId: row.cellId, reason: row.reason, status: row.status,
      evidence: row.evidence, sourceTier: row.sourceTier, source: { ...row.source }, listedBytes: row.expectedBytes,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      events: row.events.map((event) => ({ ...event })),
    })),
  };
}

/** Reports carry source metadata and notes, not cached cell bytes. */
export function encodeCasebookReport(report: CasebookLocalReport): string {
  if (report.schema !== "offline-casebook-report-v1") throw new RangeError("Invalid report schema");
  const value = JSON.stringify(report, null, 2) + "\n";
  if (new TextEncoder().encode(value).byteLength > 512 * 1024) throw new RangeError("Report too large");
  return value;
}

function plain(value: string): string {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ");
}

/** Plain text is a user-chosen alternative to JSON, with locale punctuation. */
export function formatCasebookReport(report: CasebookLocalReport, language: Language): string {
  const c = casebookCopy(language);
  const colon = language === "fr" ? "\u00a0:" : ":";
  const field = (name: string, value: string | number): string => `${name}${colon} ${value}`;
  const lines = [
    c.title, c.exportWarning, c.importWarning,
    field(c.created, plain(report.createdAt)),
    field(c.total, report.counts.total),
    field(c.openCount, report.counts.open),
    field(c.reviewCount, report.counts.inReview),
    field(c.closedCount, report.counts.closed),
    field(c.unknownCount, report.counts.unknown),
    field(c.retryCount, report.counts.potentialRetry),
    field(c.inspectCount, report.counts.needsInspection),
  ];
  for (const row of report.cases) {
    lines.push("", plain(row.id),
      field(c.cell, plain(row.cellId)),
      field(c.reason, caseReasonText(row.reason, language)),
      field(c.status, caseStatusText(row.status, language)),
      field(c.evidence, caseEvidenceText(row.evidence, language)),
      field(c.tier, row.sourceTier),
      field(c.source, plain(row.source.source)),
      field(c.licence, plain(row.source.licence)),
      field(c.date, plain(row.source.date)),
      field(c.size, row.listedBytes),
      field(c.created, plain(row.createdAt)),
      field(c.updated, plain(row.updatedAt)));
    for (const event of row.events) {
      lines.push(field(c.event, `${event.sequence}. ${caseActionText(event.action, language)}`),
        field(c.updated, plain(event.at)), field(c.status, caseStatusText(event.status, language)),
        field(c.evidence, caseEvidenceText(event.evidence, language)));
      if (event.note) lines.push(field(c.comments, plain(event.note)));
    }
  }
  return lines.join("\n") + "\n";
}

export function casebookFilename(regionId: string, extension: "json" | "txt"): string {
  const name = regionId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `offline-casebook-${name}.${extension}`;
}

/** No background exports, no telemetry, and no direct network requests. */
export function saveCasebookFile(
  book: Casebook,
  language: Language,
  format: "json" | "txt",
  documentRef: Document,
  at: string,
): void {
  const report = createCasebookReport(book, at);
  const content = format === "json" ? encodeCasebook(book) : formatCasebookReport(report, language);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const address = URL.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.hidden = true;
    anchor.download = casebookFilename(book.regionId, format);
    anchor.href = address;
    documentRef.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally { URL.revokeObjectURL(address); }
}

/** Bounded untrusted import: never import a claim of current device availability. */
export function readCasebookFile(
  bytes: Uint8Array,
  regionId: string,
): Casebook {
  if (bytes.byteLength > 512 * 1024) throw new RangeError("Casebook file too large");
  const book = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed = JSON.parse(book) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RangeError("Invalid casebook document");
  }
  // Validation happens before any caller is allowed to view or mutate an imported book.
  const recovered = parsed as Casebook;
  validateCasebook(recovered);
  if (recovered.regionId !== regionId) throw new RangeError("Wrong region");
  return recovered;
}
