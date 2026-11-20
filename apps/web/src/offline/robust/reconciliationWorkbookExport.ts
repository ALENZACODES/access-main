import type { Language } from "./regionDownload";
import { compareWorkbook, stringifyWorkbook, workbookSummary, type Workbook } from "./reconciliationWorkbook";
import { WORKBOOK_CAUSE_COPY, WORKBOOK_CHANGE_COPY, WORKBOOK_COPY, workbookSummaryText } from "./reconciliationWorkbookCopy";

export interface WorkbookExport {
  readonly filename: string;
  readonly content: string;
  readonly mime: string;
}

const cleanName = (name: string): string => name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "region";

/** No cell payload or network request: only recorded metadata and user notes. */
export function createWorkbookExport(workbook: Workbook, language: Language, format: "json" | "txt"): WorkbookExport {
  const filename = `offline-reconciliation-${cleanName(workbook.regionId)}.${format}`;
  const json = stringifyWorkbook(workbook);
  if (format === "json") return { filename, content: json, mime: "application/json;charset=utf-8" };
  const c = WORKBOOK_COPY[language];
  const details = workbookSummary(workbook);
  const lines: string[] = [c.title, "", c.historical, c.uncertainty, c.privacy, c.readOnly, "",
    workbookSummaryText(details, language), "", `${c.before}: ${workbook.startedAt}`,
    `${c.after}: ${workbook.after?.capturedAt ?? "UNKNOWN"}`, ""];
  const comparison = workbook.after === null ? null : compareWorkbook(workbook.before, workbook.after);
  if (comparison === null) lines.push(c.noComparison);
  else {
    for (const row of comparison.rows) {
      lines.push(`${row.id} — ${WORKBOOK_CHANGE_COPY[language][row.change]}`);
      lines.push(`${c.before}: ${row.before?.state ?? "UNKNOWN"}; ${c.cause}: ${row.before ? WORKBOOK_CAUSE_COPY[language][row.before.cause] : "UNKNOWN"}`);
      lines.push(`${c.after}: ${row.after?.state ?? "UNKNOWN"}; ${c.cause}: ${row.after ? WORKBOOK_CAUSE_COPY[language][row.after.cause] : "UNKNOWN"}`);
      const source = row.after?.source ?? row.before?.source;
      lines.push(`${c.source}: ${source?.source ?? "UNKNOWN"}`);
      lines.push(`${c.licence}: ${source?.licence ?? "UNKNOWN"}`);
      lines.push(`${c.date}: ${source?.date ?? "UNKNOWN"}`);
      lines.push(`${c.bytes}: ${source?.bytes ?? "UNKNOWN"}`);
      lines.push("");
    }
  }
  lines.push(c.notes);
  for (const item of workbook.notes) {
    lines.push(`${item.cellId} — ${item.kind} — ${item.disposition} — ${item.at}`);
    lines.push(item.text);
    lines.push("");
  }
  lines.push(c.credit);
  return { filename, content: lines.join("\n"), mime: "text/plain;charset=utf-8" };
}

/** Generates a user-initiated local file; object URL is revoked on the next microtask. */
export function saveWorkbookExport(workbook: Workbook, language: Language, format: "json" | "txt",
  documentRef: Document): void {
  const file = createWorkbookExport(workbook, language, format);
  const view = documentRef.defaultView;
  if (!view || typeof view.URL.createObjectURL !== "function") throw new TypeError("File download unavailable");
  const objectUrl = view.URL.createObjectURL(new Blob([file.content], { type: file.mime }));
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.filename;
    anchor.hidden = true;
    documentRef.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    queueMicrotask(() => view.URL.revokeObjectURL(objectUrl));
  }
}
