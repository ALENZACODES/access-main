import type { HandoffBook, HandoffChange, HandoffComparison, HandoffNote } from "./handoffRehearsal";
import { compareHandoff } from "./handoffRehearsal";

/** A local review queue only. This is never a measure of a place or person. */
export type ReviewReason =
  | "no-later-reading" | "missing-now" | "source-mismatch" | "unknown-now"
  | "new-local-copy" | "local-state-change" | "open-note" | "unreadable-now";
export type ReviewStatus = "open" | "noted" | "closed-note" | "UNKNOWN";
export type ReviewPriority = "attention" | "inspect" | "information";
export interface ReviewItem {
  readonly cellId: string;
  readonly reason: ReviewReason;
  readonly priority: ReviewPriority;
  readonly status: ReviewStatus;
  readonly source: string;
  readonly provenanceDate: string;
  readonly expectedBytes: number | null;
  readonly noteIds: readonly string[];
}
export interface ReviewTotals {
  readonly regionId: string;
  readonly status: "recorded" | "UNKNOWN";
  readonly beforeAt: string;
  readonly afterAt: string | null;
  readonly totalCells: number;
  readonly totalItems: number;
  readonly missingNow: number;
  readonly unknownNow: number;
  readonly unreadableNow: number;
  readonly sourceMismatch: number;
  readonly openNotes: number;
  readonly reviewItems: readonly ReviewItem[];
}
export interface ReviewQuery {
  readonly search?: string;
  readonly reason?: ReviewReason | "all";
  readonly priority?: ReviewPriority | "all";
  readonly status?: ReviewStatus | "all";
  readonly offset?: number;
  readonly limit?: number;
}
export interface ReviewPage {
  readonly items: readonly ReviewItem[];
  readonly total: number;
  readonly offset: number;
  readonly previous: boolean;
  readonly next: boolean;
}
export const HANDOFF_REVIEW_PAGE_MAX = 50;

function reasonForChange(change: HandoffChange): ReviewReason | null {
  switch (change) {
    case "lost": return "missing-now";
    case "gained": return "new-local-copy";
    case "changed": return "local-state-change";
    case "UNKNOWN": return "unknown-now";
    case "unchanged": return null;
  }
}
function priorityFor(reason: ReviewReason): ReviewPriority {
  switch (reason) {
    case "missing-now":
    case "source-mismatch":
    case "unreadable-now": return "attention";
    case "unknown-now":
    case "no-later-reading":
    case "local-state-change": return "inspect";
    case "open-note":
    case "new-local-copy": return "information";
  }
}
function resolutionOf(notes: readonly HandoffNote[], uncertain: boolean): ReviewStatus {
  if (uncertain) return "UNKNOWN";
  if (notes.length === 0) return "open";
  if (notes.every((note) => note.resolution === "closed")) return "closed-note";
  return "noted";
}
function issue(
  cellId: string,
  reason: ReviewReason,
  noteIds: readonly string[],
  source: string,
  provenanceDate: string,
  expectedBytes: number | null,
  notes: readonly HandoffNote[],
  uncertain: boolean,
): ReviewItem {
  return {
    cellId, reason, priority: priorityFor(reason),
    status: resolutionOf(notes, uncertain), source, provenanceDate, expectedBytes, noteIds,
  };
}

/** Produce a bounded deterministic queue; all observations remain device-local. */
export function reviewHandoff(book: HandoffBook): ReviewTotals {
  const beforeMap = new Map(book.before.cells.map((cell) => [cell.id, cell]));
  const afterMap = new Map(book.after?.cells.map((cell) => [cell.id, cell]) ?? []);
  const comparison: HandoffComparison | null = book.after === null ? null : compareHandoff(book.before, book.after);
  const rows = comparison?.rows ?? book.before.cells.map((cell) => ({
    id: cell.id, before: cell, after: null, change: "UNKNOWN" as const, issue: true,
  }));
  const items: ReviewItem[] = [];
  const notesByCell = new Map<string, HandoffNote[]>();
  for (const note of book.notes) {
    const entries = notesByCell.get(note.cellId) ?? [];
    entries.push(note);
    notesByCell.set(note.cellId, entries);
  }
  let missingNow = 0;
  let unknownNow = 0;
  let unreadableNow = 0;
  let sourceMismatch = 0;
  let openNotes = 0;
  for (const row of rows) {
    const after = afterMap.get(row.id);
    const before = beforeMap.get(row.id);
    const current = after ?? before;
    if (current === undefined) continue;
    const notes = notesByCell.get(row.id) ?? [];
    openNotes += notes.filter((note) => note.resolution !== "closed").length;
    const noteIds = notes.map((note) => note.id);
    const changedSource = after !== undefined && before !== undefined && (
      after.source.source !== before.source.source || after.source.licence !== before.source.licence ||
      after.source.date !== before.source.date || after.source.bytes !== before.source.bytes
    );
    if (changedSource) sourceMismatch++;
    if (after?.cause === "missing") missingNow++;
    if (after?.cause === "unreadable") unreadableNow++;
    if (after === undefined || after.cause === "UNKNOWN" || after.state === "UNKNOWN") unknownNow++;
    let reason: ReviewReason | null = comparison === null ? "no-later-reading" : reasonForChange(row.change);
    if (changedSource) reason = "source-mismatch";
    else if (after?.cause === "unreadable") reason = "unreadable-now";
    else if (after?.cause === "missing" && before?.state === "saved") reason = "missing-now";
    if (reason === null && notes.some((note) => note.resolution !== "closed")) reason = "open-note";
    if (reason === null) continue;
    const uncertain = after === undefined || after.cause === "UNKNOWN" || reason === "source-mismatch" ||
      reason === "unknown-now" || reason === "no-later-reading";
    items.push(issue(row.id, reason, noteIds, current.source.source, current.source.date,
      current.source.bytes, notes, uncertain));
  }
  const status = comparison === null || comparison.status === "UNKNOWN" ? "UNKNOWN" : "recorded";
  return {
    regionId: book.regionId, status, beforeAt: book.before.capturedAt,
    afterAt: book.after?.capturedAt ?? null, totalCells: rows.length,
    totalItems: items.length, missingNow, unknownNow, unreadableNow,
    sourceMismatch, openNotes, reviewItems: items,
  };
}

export function pageHandoffReview(totals: ReviewTotals, query: ReviewQuery = {}): ReviewPage {
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 20;
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > HANDOFF_REVIEW_PAGE_MAX) {
    throw new RangeError("Invalid review page");
  }
  const search = (query.search ?? "").trim().toLocaleLowerCase();
  const rows = totals.reviewItems.filter((item) => {
    if (query.reason && query.reason !== "all" && item.reason !== query.reason) return false;
    if (query.priority && query.priority !== "all" && item.priority !== query.priority) return false;
    if (query.status && query.status !== "all" && item.status !== query.status) return false;
    return item.cellId.toLocaleLowerCase().includes(search) || item.source.toLocaleLowerCase().includes(search);
  });
  return { items: rows.slice(offset, offset + limit), total: rows.length,
    offset, previous: offset > 0, next: offset + limit < rows.length };
}

/** Strictly plain-text summary for manual sharing, never cached payload. */
export function handoffReviewText(totals: ReviewTotals, language: "en" | "fr"): string {
  const fr = language === "fr";
  const lines = [fr ? "Examen du transfert hors ligne" : "Offline handoff review",
    `${fr ? "Région" : "Region"}${fr ? "\u00a0:" : ":"} ${totals.regionId}`,
    `${fr ? "Début" : "Start"}${fr ? "\u00a0:" : ":"} ${totals.beforeAt}`,
    `${fr ? "Fin" : "End"}${fr ? "\u00a0:" : ":"} ${totals.afterAt ?? "UNKNOWN"}`,
    `${fr ? "État" : "Status"}${fr ? "\u00a0:" : ":"} ${totals.status}`,
    `${fr ? "Cellules" : "Cells"}${fr ? "\u00a0:" : ":"} ${totals.totalCells}`,
    `${fr ? "Points à examiner" : "Review items"}${fr ? "\u00a0:" : ":"} ${totals.totalItems}`,
    `${fr ? "Copies absentes" : "Missing copies"}${fr ? "\u00a0:" : ":"} ${totals.missingNow}`,
    `${fr ? "Copies UNKNOWN" : "UNKNOWN copies"}${fr ? "\u00a0:" : ":"} ${totals.unknownNow}`,
    `${fr ? "Lectures impossibles" : "Unreadable copies"}${fr ? "\u00a0:" : ":"} ${totals.unreadableNow}`,
    `${fr ? "Sources modifiées" : "Source changes"}${fr ? "\u00a0:" : ":"} ${totals.sourceMismatch}`,
    "",
  ];
  for (const item of totals.reviewItems) {
    lines.push(`${item.cellId} | ${item.reason} | ${item.status} | ${item.source} | ${item.provenanceDate} | ${item.expectedBytes ?? "UNKNOWN"}`);
  }
  lines.push("", fr ? "Notes historiques uniquement. Aucun état de lieu n’est déduit." :
    "Historical local observations only. No physical-place condition is inferred.");
  return lines.join("\n");
}
