import type { Language } from "./regionDownload";
import {
  compareLatestTimeline, serializeTimelineBook, type TimelineBook, type TimelineComparison,
} from "./localEvidenceTimeline";
import { timelineChangeText, timelineCauseText } from "./localEvidenceTimelineCopy";
/** Metadata-only export. No saved cell payload, keys, or background requests. */
export function timelineText(comparison: TimelineComparison | null, language: Language): string {
  const fr = language === "fr";
  const label = (name: string, value: string): string => `${name}${fr ? "\u00a0:" : ":"} ${value}`;
  if (comparison === null) return fr ? "Historique local\nÉtat\u00a0: UNKNOWN" : "Local history\nStatus: UNKNOWN";
  const out = [fr ? "Historique des enregistrements locaux" : "Local evidence timeline",
    label(fr ? "Région" : "Region", comparison.regionId),
    label(fr ? "Début" : "Earlier", comparison.from),
    label(fr ? "Fin" : "Later", comparison.to),
    label(fr ? "État" : "Status", comparison.status),
    label(fr ? "Cellules" : "Cells", String(comparison.rows.length)),
    ""];
  for (const row of comparison.rows) {
    out.push(`${row.cellId} | ${timelineChangeText(row.change, language)} | ${row.after?.state ?? "UNKNOWN"}`);
    out.push(`${fr ? "Source" : "Source"}${fr ? "\u00a0:" : ":"} ${row.after?.source.source ?? row.before?.source.source ?? "UNKNOWN"}`);
    out.push(`${fr ? "Raison" : "Cause"}${fr ? "\u00a0:" : ":"} ${row.after === null ? "UNKNOWN" : timelineCauseText(row.after.cause, language)}`);
    out.push(`${fr ? "Date" : "Date"}${fr ? "\u00a0:" : ":"} ${row.after?.source.date ?? "UNKNOWN"}`);
    out.push("");
  }
  out.push(fr ? "Lecture historique uniquement. Aucune donnée de lieu n’est déduite." :
    "Historical device-local records only. No physical-place conditions are inferred.");
  return out.join("\n");
}
export function timelineBookText(book: TimelineBook, language: Language): string {
  return timelineText(compareLatestTimeline(book), language);
}
export function timelineFilename(regionId: string, format: "json" | "txt"): string {
  return `offline-timeline-${regionId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}.${format}`;
}
export function saveTimelineFile(book: TimelineBook, language: Language, format: "json" | "txt", doc: Document): void {
  const content = format === "json" ? serializeTimelineBook(book) : timelineBookText(book, language);
  const blob = new Blob([content], { type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = doc.createElement("a");
    link.href = url;
    link.download = timelineFilename(book.regionId, format);
    link.click();
  } finally { URL.revokeObjectURL(url); }
}
