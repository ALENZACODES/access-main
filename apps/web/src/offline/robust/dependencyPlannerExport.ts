import type { Language } from "./regionDownload";
import { type DependencyBook, type DependencyAssessment, type DependencySummary, serializeDependencyBook } from "./dependencyPlanner";
import { DEPENDENCY_COPY, DEPENDENCY_PRIORITIES, DEPENDENCY_PROGRESS, dependencyReason } from "./dependencyPlannerCopy";

function clean(text: string): string {
  return text.replace(/[\u202a-\u202e\u2066-\u2069]/gu, " ").replace(/\s+/gu, " ").trim();
}
function line(text: string): string { return clean(text).slice(0, 1800); }
export function dependencyReportText(book: DependencyBook, assessments: readonly DependencyAssessment[], summary: DependencySummary, language: Language): string {
  // JSON validation also enforces the strict import and export size bounds.
  serializeDependencyBook(book);
  const c = DEPENDENCY_COPY[language];
  const colon = language === "fr" ? "\u00A0: " : ": ";
  const result = [c.title, `${c.outing}${colon}${line(book.outingLabel)}`, `${c.unknownPhysical}`, c.caution,
    `${c.summary}${colon}${summary.total}`, `${c.essentials}${colon}${summary.essentials}`,
    `${c.saved}${colon}${summary.savedInformation}`, `${c.unknown}${colon}${summary.unknownInformation}`,
    `${c.followUp}${colon}${summary.requireFollowUp}`, c.dataOnly, c.privacy, ""];
  for (const assessment of assessments) {
    const original = book.items.find((item) => item.id === assessment.itemId);
    if (!original) continue;
    result.push(`${line(original.title)} — ${DEPENDENCY_PRIORITIES[language][original.priority]}`);
    result.push(`${c.progress}${colon}${DEPENDENCY_PROGRESS[language][original.progress]}`);
    result.push(`${c.purpose}${colon}${line(original.purpose) || "UNKNOWN"}`);
    result.push(`${c.note}${colon}${line(original.note) || "UNKNOWN"}`);
    result.push(`${c.unknownPhysical}`);
    for (const cell of assessment.cells) {
      result.push(`  ${c.cellId}${colon}${line(cell.cellId)}`);
      result.push(`  ${c.saved}${colon}${cell.availability === "saved" ? c.saved : "UNKNOWN"}`);
      result.push(`  ${c.reason}${colon}${dependencyReason(cell.reason, language)}`);
      result.push(`  ${c.source}${colon}${cell.source ? line(cell.source.source) : "UNKNOWN"}`);
      result.push(`  ${c.licence}${colon}${cell.source ? line(cell.source.licence) : "UNKNOWN"}`);
      result.push(`  ${c.date}${colon}${cell.source ? cell.source.date : "UNKNOWN"}`);
      result.push(`  ${c.bytes}${colon}${cell.expectedBytes === null ? "UNKNOWN" : cell.expectedBytes}`);
    }
    if (!assessment.cells.length) result.push(c.emptyCell);
    result.push("");
  }
  return `${result.join("\n")}\n`;
}
export function dependencyReportJson(book: DependencyBook, assessments: readonly DependencyAssessment[], summary: DependencySummary): string {
  serializeDependencyBook(book);
  return `${JSON.stringify({ schema: "offline-dependency-report-v1", physicalAccess: "UNKNOWN", book,
    summary, assessments: assessments.map((row) => ({ ...row, physicalAccess: "UNKNOWN", cells: row.cells.map((cell) => ({ ...cell })) })) }, null, 2)}\n`;
}
export function dependencyFileName(regionId: string, extension: "json" | "txt"): string {
  const safe = regionId.normalize("NFKD").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55);
  return `offline-dependencies-${safe || "region"}.${extension}`;
}
export function downloadDependencyFile(doc: Document, content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  doc.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
