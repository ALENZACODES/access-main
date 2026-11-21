import type { Language, RegionManifest } from "./regionDownload";
import type { QuestionSheet, SheetAssessment, SheetSummary } from "./offlineQuestionSheet";
import { assessQuestionSheet, encodeQuestionSheet, summarizeQuestionSheet } from "./offlineQuestionSheet";
import type { RegionInventory } from "./regionInventory";
import { questionSheetCopy, SHEET_PRIORITY_COPY, SHEET_REASON_COPY, SHEET_REPLY_COPY, SHEET_TOPIC_COPY } from "./offlineQuestionSheetCopy";

/** Explicitly typed and local. No browser identifiers, coordinates or downloaded payloads. */
export type SheetExportFormat = "text" | "json";
export interface SheetHandout { readonly language: Language; readonly content: string; readonly filename: string; readonly mime: string; readonly summary: SheetSummary }
function friendlyFileName(region: string, format: SheetExportFormat): string {
  const slug = region.toLowerCase().normalize("NFKD").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "region";
  return `offline-questions-${slug}.${format === "json" ? "json" : "txt"}`;
}
function scrub(value: string): string {
  return [...value].map((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) ? " " : char;
  }).join("").replace(/[\r\n\t]+/g, " ").trim();
}
function prefix(language: Language): string { return language === "fr" ? "\u00a0: " : ": "; }
function rowText(row: SheetAssessment, language: Language, includePrivate: boolean): string {
  const c = questionSheetCopy(language);
  const line = (label: string, value: string) => `${label}${prefix(language)}${scrub(value)}`;
  return [
    `${row.position + 1}. ${scrub(row.question)}`,
    line(c.category, SHEET_TOPIC_COPY[language][row.category]),
    line(c.priority, SHEET_PRIORITY_COPY[language][row.priority]),
    line(c.status, SHEET_REPLY_COPY[language][row.reply]),
    line(c.cell, row.cellId ?? "UNKNOWN"),
    line(c.storage, row.storage),
    line(c.reason, SHEET_REASON_COPY[language][row.reason]),
    line(c.physical, "UNKNOWN"),
    line(c.source, row.source),
    line(c.licence, row.licence),
    line(c.date, row.date),
    ...(includePrivate ? [line(c.note, row.note || c.noteEmpty), line(c.replyText, row.replyText || c.replyEmpty)] : []),
  ].join("\n");
}
export function createQuestionHandout(sheet: QuestionSheet, manifest: RegionManifest | null, inventory: RegionInventory | null, language: Language, includePrivate: boolean): SheetHandout {
  const rows = assessQuestionSheet(sheet, manifest, inventory);
  const summary = summarizeQuestionSheet(rows);
  const c = questionSheetCopy(language);
  const lines = [scrub(sheet.title), `${c.region}${prefix(language)}${scrub(sheet.regionId)}`, c.printGuide,
    `${c.totals}${prefix(language)}${summary.total}`, `${c.unanswered}${prefix(language)}${summary.unanswered}`,
    `${c.recorded}${prefix(language)}${summary.repliesNoted}`, `${c.physical}${prefix(language)}UNKNOWN`,
    ...(includePrivate ? [c.privacy] : []), "", ...rows.map((row) => rowText(row, language, includePrivate)), ""];
  return { language, content: lines.join("\n"), filename: friendlyFileName(sheet.regionId, "text"), mime: "text/plain;charset=utf-8", summary };
}
export function createQuestionBackup(sheet: QuestionSheet, manifest: RegionManifest | null, language: Language): SheetHandout {
  const content = encodeQuestionSheet(sheet, manifest);
  const summary = summarizeQuestionSheet(assessQuestionSheet(sheet, manifest, null));
  return { language, content, filename: friendlyFileName(sheet.regionId, "json"), mime: "application/json;charset=utf-8", summary };
}
export function saveQuestionHandout(doc: Document, exportData: SheetHandout): void {
  const blob = new Blob([exportData.content], { type: exportData.mime });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = exportData.filename;
  doc.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
/** Do not inject raw user text into markup; the print view uses safe text nodes. */
export function makePrintHandout(doc: Document, exportData: SheetHandout): HTMLElement {
  const region = doc.createElement("section");
  region.className = "offline-question-sheet-print";
  region.setAttribute("aria-label", questionSheetCopy(exportData.language).title);
  const heading = doc.createElement("h2");
  heading.textContent = questionSheetCopy(exportData.language).title;
  const pre = doc.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.textContent = exportData.content;
  region.append(heading, pre);
  return region;
}
