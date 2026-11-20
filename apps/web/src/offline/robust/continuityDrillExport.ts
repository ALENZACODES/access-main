import type { Language } from "./regionDownload";
import type { DrillResult } from "./continuityDrill";
/** No cell payload is included in the metadata-only report. */
export function createContinuityReport(result: DrillResult, language: Language): string {
  return JSON.stringify({ schema: "offline-continuity-report-v1", locale: language,
    tier: "UNKNOWN", regionId: result.regionId, status: result.status,
    scenario: result.scenario, beforeSaved: result.beforeSaved, afterSaved: result.afterSaved,
    cells: result.cells.map((cell) => ({ id: cell.id, before: cell.before, after: cell.after,
      reason: cell.reason, source: cell.source, licence: cell.licence, date: cell.date, bytes: cell.bytes })) }, null, 2);
}
export function saveContinuityReport(result: DrillResult, language: Language, doc: Document): void {
  const blob = new Blob([createContinuityReport(result, language)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = "offline-continuity-report.json";
  doc.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
