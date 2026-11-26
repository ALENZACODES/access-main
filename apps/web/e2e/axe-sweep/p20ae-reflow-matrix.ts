import type { Locale, Report } from "./p20ae-reflow-contracts.ts";
import { matrixKey, mergeReports } from "./p20ae-reflow-contracts.ts";

export interface MatrixCell {
  readonly route: string; readonly width: number; readonly height: number; readonly locale: Locale;
}
export interface MatrixResult {
  readonly requested: number; readonly completed: number;
  readonly missing: readonly MatrixCell[];
  readonly duplicateKeys: readonly string[];
  readonly reports: readonly Report[];
}
export function buildMatrix(routes: readonly string[], widths: readonly number[], heights: readonly number[],
  locales: readonly Locale[]): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const route of routes) for (const locale of locales) for (const width of widths) {
    const height = heights.find((candidate) => candidate >= Math.round(width * 1.5)) ?? heights[heights.length - 1];
    if (!height || !route.startsWith("/") || route.startsWith("//") || width <= 0) continue;
    cells.push({ route, width, height, locale });
  }
  return cells;
}
export function reconcileMatrix(requested: readonly MatrixCell[], reports: readonly Report[]): MatrixResult {
  const requestedKeys = requested.map((cell) => matrixKey(cell.route, cell.width, cell.height, cell.locale));
  const reportKeys = reports.map((report) => matrixKey(report.route, report.viewport.width, report.viewport.height, report.locale));
  const duplicates = reportKeys.filter((key, index) => reportKeys.indexOf(key) !== index);
  const seen = new Set(reportKeys);
  const missing = requested.filter((cell) => !seen.has(matrixKey(cell.route, cell.width, cell.height, cell.locale)));
  return {
    requested: requestedKeys.length,
    completed: new Set(reportKeys).size,
    missing,
    duplicateKeys: [...new Set(duplicates)],
    reports: mergeReports(reports),
  };
}
export function matrixCoverage(result: MatrixResult): number {
  return result.requested === 0 ? 1 : Math.min(1, result.completed / result.requested);
}
export function matrixIsComplete(result: MatrixResult): boolean {
  return result.missing.length === 0 && result.duplicateKeys.length === 0 && result.completed === result.requested;
}
export function matrixSummary(result: MatrixResult): string {
  return [
    `Requested: ${result.requested}`,
    `Completed: ${result.completed}`,
    `Missing: ${result.missing.length}`,
    `Duplicates: ${result.duplicateKeys.length}`,
    `Coverage: ${(matrixCoverage(result) * 100).toFixed(1)}%`,
  ].join("\n");
}
