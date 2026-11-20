import type { Language } from "./regionDownload";
import {
  PREPARATION_MAX_JSON_BYTES, preparationTotals, serializePreparationNotebook,
  type CopyAssessment, type PreparationNotebook,
} from "./accessPreparation";
import { preparationCopy, statusLabel, topicLabel } from "./accessPreparationCopy";

export type PreparationExportFormat = "json" | "txt";
export interface PreparationExport {
  readonly format: PreparationExportFormat;
  readonly fileName: string;
  readonly text: string;
  readonly containsUserNotes: boolean;
}
function safeFilePart(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 80); }
function safeLine(value: string): string {
  return value.split("\r\n").join("\n").split("\r").join("\n").split("\n").join(" | ");
}
function line(label: string, value: string, language: Language): string {
  return `${label}${language === "fr" ? "\u00a0:" : ":"} ${safeLine(value)}`;
}

/** Exports only metadata and user-entered text; never pack payloads. */
export function preparationTextReport(
  notebook: PreparationNotebook, copyAssessment: CopyAssessment, language: Language,
): string {
  // Also checks source fields and history so malformed imported notes cannot be rendered as normal.
  serializePreparationNotebook(notebook);
  if (notebook.regionId !== copyAssessment.regionId) throw new TypeError("Different report region");
  const c = preparationCopy(language);
  const counts = preparationTotals(notebook);
  const lines = [c.title, c.intro, c.privacy, "",
    line(language === "fr" ? "Région" : "Region", notebook.regionId, language),
    line(language === "fr" ? "Créé" : "Created", notebook.createdAt, language),
    line(c.localStatus, copyAssessment.status, language),
    line(c.total, String(counts.total), language),
    line(c.openCount, String(counts.open), language),
    line(c.answered, String(counts.answered), language),
    line(c.unknownCount, String(counts.UNKNOWN), language),
    line(c.linked, String(counts.linkedToCell), language),
    "", c.reminder, "",
  ];
  const statusMap = new Map(copyAssessment.linked.map((record) => [record.id, record.status]));
  for (const entry of notebook.entries) {
    lines.push(`${entry.id} — ${topicLabel(entry.topic, language)}`);
    lines.push(line(c.question, entry.question, language));
    lines.push(line(c.status, statusLabel(entry.status, language), language));
    lines.push(line(c.answer, entry.answer || "UNKNOWN", language));
    lines.push(line(c.evidence, entry.evidence, language));
    lines.push(line(c.source, entry.sourceName || "UNKNOWN", language));
    lines.push(line(c.sourceDate, entry.sourceDate || "UNKNOWN", language));
    lines.push(line(c.cell, entry.cellId ?? "UNKNOWN", language));
    lines.push(line(c.localStatus, statusMap.get(entry.id) ?? "UNKNOWN", language));
    lines.push("");
  }
  const value = lines.join("\n");
  if (new TextEncoder().encode(value).length > PREPARATION_MAX_JSON_BYTES) throw new RangeError("Report is too large");
  return value;
}
export function createPreparationExport(
  notebook: PreparationNotebook, assessment: CopyAssessment, language: Language,
  format: PreparationExportFormat,
): PreparationExport {
  const date = notebook.createdAt.slice(0, 10);
  const fileName = `access-preparation-${safeFilePart(notebook.regionId)}-${date}.${format}`;
  const text = format === "json" ? serializePreparationNotebook(notebook) :
    preparationTextReport(notebook, assessment, language);
  return { format, fileName, text, containsUserNotes: true };
}
export function savePreparationExport(
  exportFile: PreparationExport, doc: Document,
): void {
  const blob = new Blob([exportFile.text], { type: exportFile.format === "json" ?
    "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
  const anchor = doc.createElement("a");
  const url = URL.createObjectURL(blob);
  try {
    anchor.href = url;
    anchor.download = exportFile.fileName;
    doc.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
