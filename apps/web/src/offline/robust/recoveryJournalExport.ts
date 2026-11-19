import type { Language, Provenance } from "./regionDownload";
import { OPEN_LICENCES } from "./manifestAudit";
import {
  JOURNAL_LIMITS, type JournalCell, type JournalEntry,
  type RecoveryJournal, type JournalEvent, type JournalCause,
  type JournalHealth, safeTimestamp, validJournalProvenance,
  latestJournalComparison, recoveryJournalTotals, formatJournalByteCount,
} from "./recoveryJournal";
import {
  journalCopy, journalCauseLabel, journalEventLabel,
  journalChangeLabel, journalHealthLabel, journalStatusLabel,
} from "./recoveryJournalCopy";

/** Reports are metadata only and are never uploaded by this module. */
export type JournalExportFormat = "json" | "txt";
export interface JournalExport {
  readonly filename: string;
  readonly mime: string;
  readonly text: string;
}
export type ImportIssue = "too-large" | "invalid-json" | "invalid-schema" |
  "invalid-region" | "invalid-entry" | "invalid-cell" | "duplicate-cell" |
  "invalid-source" | "timestamp-order" | "invalid-sequence" | "unsupported-license";
export type ImportResult =
  | { readonly ok: true; readonly journal: RecoveryJournal }
  | { readonly ok: false; readonly issues: readonly ImportIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isText(value: unknown, maximum = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maximum && !/[\p{Cc}\p{Cf}]/u.test(value);
}
function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
const allowedEvents: readonly JournalEvent[] = ["snapshot", "after-download", "before-cleanup", "manual-review"];
const allowedCauses: readonly JournalCause[] = ["present", "missing", "stale", "unreadable",
  "not-inspected", "metadata-conflict", "unlisted", "invalid-listing"];
const allowedHealth: readonly JournalHealth[] = ["complete", "partial", "UNKNOWN"];
const allowedReasons = ["complete", "quota", "interrupted", "download-error"] as const;

function readSource(value: unknown): Provenance | null | false {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.source !== "string" ||
    typeof value.licence !== "string" || typeof value.date !== "string") return false;
  const p = { source: value.source, licence: value.licence, date: value.date };
  return validJournalProvenance(p) ? p : false;
}

function parseCell(value: unknown): JournalCell | null {
  if (!isRecord(value)) return null;
  if (!isText(value.id, 160) || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value.id) ||
    value.id.includes("..")) return null;
  if (value.status !== "saved" && value.status !== "UNKNOWN") return null;
  if (!allowedCauses.includes(value.cause as JournalCause)) return null;
  if (value.bytes !== null && !isNumber(value.bytes)) return null;
  const provenance = readSource(value.provenance);
  if (provenance === false) return null;
  if (value.status === "saved" && (value.cause !== "present" || value.bytes === null || provenance === null)) {
    return null;
  }
  return { id: value.id, status: value.status, cause: value.cause as JournalCause,
    bytes: value.bytes as number | null, provenance };
}

function parseEntry(value: unknown, regionId: string): JournalEntry | null {
  if (!isRecord(value) || !isNumber(value.sequence) || value.sequence < 1 ||
    !isText(value.capturedAt) || !safeTimestamp(value.capturedAt) ||
    value.regionId !== regionId ||
    !allowedEvents.includes(value.event as JournalEvent) ||
    !allowedHealth.includes(value.health as JournalHealth) ||
    !Array.isArray(value.cells) || value.cells.length > JOURNAL_LIMITS.maxCells ||
    !Array.isArray(value.warnings) || value.warnings.length > JOURNAL_LIMITS.maxWarnings) return null;
  if (value.downloadReason !== null && !allowedReasons.includes(value.downloadReason as typeof allowedReasons[number])) {
    return null;
  }
  const cells: JournalCell[] = [];
  const seen = new Set<string>();
  for (const unknown of value.cells as readonly unknown[]) {
    const cell = parseCell(unknown);
    if (cell === null || seen.has(cell.id)) return null;
    seen.add(cell.id);
    cells.push(cell);
  }
  const warnings: string[] = [];
  for (const item of value.warnings as readonly unknown[]) {
    if (!isText(item, 500)) return null;
    warnings.push(item);
  }
  if (value.health === "complete" && cells.some((cell) => cell.status !== "saved")) return null;
  return { sequence: value.sequence, capturedAt: value.capturedAt, event: value.event as JournalEvent,
    regionId, health: value.health as JournalHealth,
    downloadReason: value.downloadReason as JournalEntry["downloadReason"], cells, warnings };
}

/**
 * Parsing an exported journal never hydrates device storage. Imported entries
 * are only historical metadata, and their saved flags never change live state.
 */
export function parseRecoveryJournal(text: string, expectedRegionId: string): ImportResult {
  if (new TextEncoder().encode(text).length > JOURNAL_LIMITS.maxReportBytes) {
    return { ok: false, issues: ["too-large"] };
  }
  let decoded: unknown;
  try { decoded = JSON.parse(text); } catch { return { ok: false, issues: ["invalid-json"] }; }
  if (!isRecord(decoded) || decoded.schema !== "offline-recovery-journal-v1" ||
    !Array.isArray(decoded.entries)) return { ok: false, issues: ["invalid-schema"] };
  if (decoded.regionId !== expectedRegionId || !isText(expectedRegionId, 160) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(expectedRegionId)) {
    return { ok: false, issues: ["invalid-region"] };
  }
  if (decoded.entries.length > JOURNAL_LIMITS.maxEntries) {
    return { ok: false, issues: ["invalid-entry"] };
  }
  const entries: JournalEntry[] = [];
  for (const raw of decoded.entries as readonly unknown[]) {
    const item = parseEntry(raw, expectedRegionId);
    if (item === null) return { ok: false, issues: ["invalid-entry"] };
    const previous = entries.at(-1);
    if (previous !== undefined) {
      if (item.sequence !== previous.sequence + 1) return { ok: false, issues: ["invalid-sequence"] };
      if (Date.parse(item.capturedAt) < Date.parse(previous.capturedAt)) {
        return { ok: false, issues: ["timestamp-order"] };
      }
    }
    entries.push(item);
  }
  return { ok: true, journal: { schema: "offline-recovery-journal-v1", regionId: expectedRegionId, entries } };
}

export function encodeRecoveryJournal(journal: RecoveryJournal): string {
  const content = `${JSON.stringify(journal, null, 2)}\n`;
  if (new TextEncoder().encode(content).length > JOURNAL_LIMITS.maxReportBytes) {
    throw new RangeError("Journal export exceeds allowed size");
  }
  const parsed = parseRecoveryJournal(content, journal.regionId);
  if (!parsed.ok) throw new RangeError(`Cannot export journal: ${parsed.issues.join(",")}`);
  return content;
}

function safeText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, " ");
}
function row(label: string, value: string, language: Language): string {
  return `${label}${language === "fr" ? "\u00a0:" : ":"} ${value}`;
}

/** Bilingual text remains useful if JSON cannot be opened on a device. */
export function formatRecoveryJournal(journal: RecoveryJournal, language: Language): string {
  const c = journalCopy(language);
  const totals = recoveryJournalTotals(journal);
  const lines: string[] = [c.title, c.caution, c.privacy, "",
    row(c.snapshots, String(totals.snapshots), language),
    row(c.saved, String(totals.latestSaved), language),
    row(c.unknownCount, String(totals.latestUnknown), language),
    row(c.health, journalHealthLabel(totals.health, language), language),
    row(c.lastCapture, totals.lastCapture ?? "UNKNOWN", language)];
  for (const entry of journal.entries) {
    lines.push("", `# ${entry.sequence}`, row(c.lastEvent, journalEventLabel(entry.event, language), language),
      row(c.lastCapture, entry.capturedAt, language),
      row(c.health, journalHealthLabel(entry.health, language), language),
      row(c.lastStop, entry.downloadReason ?? "UNKNOWN", language));
    for (const cell of entry.cells) {
      const p = cell.provenance;
      lines.push("", safeText(cell.id),
        row(c.state, journalStatusLabel(cell.status, language), language),
        row(c.reason, journalCauseLabel(cell.cause, language), language),
        row(c.expectedBytes, formatJournalByteCount(cell.bytes, language), language),
        row(c.source, safeText(p?.source ?? "UNKNOWN"), language),
        row(c.licence, safeText(p?.licence ?? "UNKNOWN"), language),
        row(c.sourceDate, p?.date ?? "UNKNOWN", language));
    }
  }
  const compare = latestJournalComparison(journal);
  if (compare !== null) {
    lines.push("", row(c.changed, String(compare.rows.filter((delta) => delta.kind !== "unchanged").length), language),
      row(c.newlySaved, String(compare.newlySaved), language),
      row(c.newlyUnknown, String(compare.newlyUnknown), language));
    for (const item of compare.rows) {
      lines.push(safeText(item.id), row(c.change, journalChangeLabel(item.kind, language), language));
    }
  }
  return `${lines.join("\n")}\n`;
}

export function recoveryJournalFilename(regionId: string, format: JournalExportFormat): string {
  const safe = regionId.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `offline-recovery-journal-${safe}.${format}`;
}

export function prepareRecoveryJournalExport(
  journal: RecoveryJournal,
  language: Language,
  format: JournalExportFormat,
): JournalExport {
  const text = format === "json" ? encodeRecoveryJournal(journal) : formatRecoveryJournal(journal, language);
  if (new TextEncoder().encode(text).length > JOURNAL_LIMITS.maxReportBytes) {
    throw new RangeError("Journal export exceeds allowed size");
  }
  return { filename: recoveryJournalFilename(journal.regionId, format),
    mime: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8", text };
}

export function saveRecoveryJournalFile(
  journal: RecoveryJournal,
  language: Language,
  format: JournalExportFormat,
  documentRef: Document = document,
): void {
  const output = prepareRecoveryJournalExport(journal, language, format);
  const blob = new Blob([output.text], { type: output.mime });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = output.filename;
    anchor.hidden = true;
    documentRef.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally { URL.revokeObjectURL(url); }
}

/** A catalogue guard uses the same allowlist as the rest of the offline app. */
export function journalSupportedLicences(): readonly string[] {
  return [...OPEN_LICENCES];
}
