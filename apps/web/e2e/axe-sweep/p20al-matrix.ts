import { safePath, type Finding, type Locale, type Screen, type Replay, finding, replayFindings, blockingFindings } from "./p20al-contract.ts";

export type Device = 320 | 1280;
export type Connectivity = "online" | "offline";
export type Phase = "entry" | "interaction" | "history" | "recovery";
export interface AuditCell {
  readonly route: string;
  readonly locale: Locale;
  readonly width: Device;
  readonly network: Connectivity;
  readonly phase: Phase;
}
export interface AuditResult {
  readonly cell: AuditCell;
  readonly completed: boolean;
  readonly errors: readonly Finding[];
  readonly durationMs: number | null;
  readonly observedRoute: string | null;
  readonly observedLocale: Locale | null;
}
export interface GateSummary {
  readonly expected: number;
  readonly completed: number;
  readonly missing: number;
  readonly errors: number;
  readonly unknown: number;
  readonly failures: readonly Finding[];
}
export const PHASES: readonly Phase[] = ["entry", "interaction", "history", "recovery"];
export const LANGUAGES: readonly Locale[] = ["en", "fr"];
export const VIEWPORTS: readonly Device[] = [320, 1280];
export const CONNECTIONS: readonly Connectivity[] = ["online", "offline"];
export function auditCells(routes: readonly string[], phases: readonly Phase[] = PHASES): AuditCell[] {
  return routes.flatMap((route) => LANGUAGES.flatMap((locale) => VIEWPORTS.flatMap((width) =>
    CONNECTIONS.flatMap((network) => phases.map((phase) => ({ route, locale, width, network, phase }))))));
}
export function cellKey(cell: AuditCell): string {
  return `${cell.route}|${cell.locale}|${cell.width}|${cell.network}|${cell.phase}`;
}
export function uniqueRoutes(routes: readonly string[]): string[] {
  return [...new Set(routes)];
}
export function routeInventoryFindings(routes: readonly string[], required: readonly string[] = []): Finding[] {
  const result: Finding[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    if (!safePath(route)) result.push(finding("inventory-route-invalid", route, "Unsafe route"));
    if (seen.has(route)) result.push(finding("inventory-route-duplicate", route, "Duplicate route"));
    seen.add(route);
  }
  for (const route of required) if (!seen.has(route)) result.push(finding("inventory-route-missing", route, "Required route not found"));
  if (routes.length === 0) result.push(finding("inventory-empty", "/", "Empty route inventory"));
  return result;
}
export function matrixFindings(expected: readonly AuditCell[], actual: readonly AuditCell[]): Finding[] {
  const result: Finding[] = [];
  const expectedKeys = new Set(expected.map(cellKey));
  const seen = new Set<string>();
  for (const cell of actual) {
    const key = cellKey(cell);
    if (!expectedKeys.has(key)) result.push(finding("matrix-unexpected", key, "Unexpected cell"));
    if (seen.has(key)) result.push(finding("matrix-duplicate", key, "Repeated cell"));
    seen.add(key);
  }
  for (const key of expectedKeys) if (!seen.has(key)) result.push(finding("matrix-missing", key, "Expected cell not executed"));
  return result;
}
export function resultFindings(result: AuditResult): Finding[] {
  const problems: Finding[] = [];
  const key = cellKey(result.cell);
  if (!result.completed) problems.push(finding("audit-not-completed", key, "No completed observation"));
  if (result.observedRoute !== null && result.observedRoute !== result.cell.route) problems.push(finding("audit-route-mismatch", key, result.observedRoute));
  if (result.observedLocale !== null && result.observedLocale !== result.cell.locale) problems.push(finding("audit-locale-mismatch", key, result.observedLocale));
  if (result.durationMs !== null && (!Number.isFinite(result.durationMs) || result.durationMs < 0)) problems.push(finding("audit-time-invalid", key, String(result.durationMs)));
  problems.push(...result.errors);
  return problems;
}
export function auditGate(expected: readonly AuditCell[], results: readonly AuditResult[]): GateSummary {
  const cells = results.map((result) => result.cell);
  const failures = matrixFindings(expected, cells);
  const seen = new Set<string>();
  let completed = 0;
  let unknown = 0;
  for (const result of results) {
    const key = cellKey(result.cell);
    if (!seen.has(key) && result.completed) completed += 1;
    if (!result.completed || result.observedRoute === null || result.observedLocale === null) unknown += 1;
    seen.add(key);
    failures.push(...resultFindings(result));
  }
  const missing = expected.filter((cell) => !seen.has(cellKey(cell))).length;
  return { expected: expected.length, completed, missing, unknown,
    errors: blockingFindings(failures).length, failures };
}
export function replayAuditResult(cell: AuditCell, replay: Replay, durationMs: number | null = null): AuditResult {
  const last: Screen = replay.steps[replay.steps.length - 1]?.after ?? replay.start;
  return { cell, completed: true, errors: replayFindings(replay), durationMs,
    observedRoute: last.route, observedLocale: last.locale };
}
export function partitionResults(results: readonly AuditResult[]): Record<Locale, AuditResult[]> {
  return { en: results.filter((item) => item.cell.locale === "en"), fr: results.filter((item) => item.cell.locale === "fr") };
}
export function sampleRoutes(routes: readonly string[], maximum: number): string[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new RangeError("maximum must be a positive integer");
  if (routes.length <= maximum) return [...routes];
  if (maximum === 1) return [routes[0]!];
  const selected = new Set<string>();
  for (let index = 0; index < maximum; index += 1) {
    const offset = Math.round(index * (routes.length - 1) / (maximum - 1));
    selected.add(routes[offset]!);
  }
  return [...selected];
}
export function missingLocales(expected: readonly AuditCell[], actual: readonly AuditResult[]): Locale[] {
  const observed = new Set(actual.filter((entry) => entry.completed).map((entry) => entry.cell.locale));
  return LANGUAGES.filter((locale) => expected.some((cell) => cell.locale === locale) && !observed.has(locale));
}
export function missingWidths(expected: readonly AuditCell[], actual: readonly AuditResult[]): Device[] {
  const observed = new Set(actual.filter((entry) => entry.completed).map((entry) => entry.cell.width));
  return VIEWPORTS.filter((width) => expected.some((cell) => cell.width === width) && !observed.has(width));
}
export function selectCriticalCells(routes: readonly string[]): AuditCell[] {
  // Explicit cross-product subset tests transitions without duplicating the full axe crawl.
  return routes.flatMap((route) => LANGUAGES.flatMap((locale) => [
    { route, locale, width: 320 as const, network: "offline" as const, phase: "recovery" as const },
    { route, locale, width: 1280 as const, network: "online" as const, phase: "history" as const },
  ]));
}
export function allowPartialAudit(summary: GateSummary): boolean {
  return summary.missing === 0 && summary.unknown === 0 && summary.errors === 0 && summary.completed === summary.expected;
}
export function matrixSummary(summary: GateSummary): string {
  return [
    `Expected: ${summary.expected}`,
    `Completed: ${summary.completed}`,
    `Missing: ${summary.missing}`,
    `Unknown: ${summary.unknown}`,
    `Errors: ${summary.errors}`,
  ].join("\n");
}
