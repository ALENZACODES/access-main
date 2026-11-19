/** Route-scoped audit policies. No route count is fixed: source tables own the inventory. */
export type Locale = "en" | "fr";
export type Viewport = 320 | 1280;
export type AuditPhase = "before" | "after";

export interface MatrixCell {
  readonly route: string;
  readonly locale: Locale;
  readonly width: Viewport;
}

export interface NavigationObservation {
  readonly route: string;
  readonly requested: Locale;
  readonly actual: string;
  readonly heading: string;
  readonly mainRegions: number;
  readonly available: boolean;
  readonly loadError: string | null;
}

export interface TransitionObservation {
  readonly route: string;
  readonly before: NavigationObservation;
  readonly after: NavigationObservation;
  readonly expected: Locale;
  readonly navigationChanged: boolean;
}

export interface RouteFinding {
  readonly code: string;
  readonly route: string;
  readonly detail: string;
}

const REQUIRED = [
  "/", "/about", "/help", "/places", "/finders", "/journey",
  "/more/housing", "/more/diary", "/more/auditors",
] as const;

export function requiredAuditRoutes(): readonly string[] {
  return REQUIRED;
}

export function normalizedRoute(route: string): string | null {
  if (!route.startsWith("/") || route.startsWith("//")) return null;
  if (/[?#\\]/.test(route)) return null;
  for (const character of route) {
    if (character.charCodeAt(0) < 32) return null;
  }
  if (route.includes(":") || route.includes("*")) return null;
  if (route.split("/").some((part) => part === "." || part === "..")) return null;
  if (route.length > 1 && route.endsWith("/")) return route.slice(0, -1);
  return route;
}

export function inventoryFindings(
  routes: readonly string[],
  required: readonly string[] = REQUIRED,
): RouteFinding[] {
  const findings: RouteFinding[] = [];
  const seen = new Set<string>();
  if (routes.length === 0) findings.push({ code: "inventory-empty", route: "/", detail: "No routes supplied" });
  for (const route of routes) {
    const normalized = normalizedRoute(route);
    if (normalized === null) {
      findings.push({ code: "route-invalid", route, detail: "Route cannot be navigated as a static path" });
      continue;
    }
    if (normalized !== route) findings.push({ code: "route-noncanonical", route, detail: normalized });
    if (seen.has(normalized)) findings.push({ code: "route-duplicate", route, detail: "Path repeated" });
    seen.add(normalized);
  }
  for (const route of required) {
    if (!seen.has(route)) findings.push({ code: "route-missing", route, detail: "Required path absent" });
  }
  return findings;
}

export function auditMatrix(routes: readonly string[]): MatrixCell[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((locale) =>
    ([320, 1280] as const).map((width) => ({ route, locale, width }))));
}

export function matrixKey(cell: MatrixCell): string {
  return `${cell.route}|${cell.locale}|${cell.width}`;
}

export function matrixFindings(expected: readonly MatrixCell[], actual: readonly MatrixCell[]): RouteFinding[] {
  const expectedKeys = new Set(expected.map(matrixKey));
  const actualKeys = new Set<string>();
  const problems: RouteFinding[] = [];
  for (const cell of actual) {
    const key = matrixKey(cell);
    if (actualKeys.has(key)) problems.push({ code: "matrix-duplicate", route: cell.route, detail: key });
    actualKeys.add(key);
    if (!expectedKeys.has(key)) problems.push({ code: "matrix-unexpected", route: cell.route, detail: key });
  }
  for (const cell of expected) {
    const key = matrixKey(cell);
    if (!actualKeys.has(key)) problems.push({ code: "matrix-missing", route: cell.route, detail: key });
  }
  return problems;
}

export function routeLocale(value: string): Locale | null {
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(value.trim());
  return (match?.[1]?.toLowerCase() as Locale | undefined) ?? null;
}

export function navigationFindings(observation: NavigationObservation): RouteFinding[] {
  const problems: RouteFinding[] = [];
  const route = observation.route;
  if (!observation.available) problems.push({ code: "route-unavailable", route, detail: "Navigation did not complete" });
  if (observation.loadError) problems.push({ code: "route-load-error", route, detail: observation.loadError });
  if (routeLocale(observation.actual) !== observation.requested) {
    problems.push({ code: "route-language", route, detail: `${observation.actual || "UNKNOWN"} instead of ${observation.requested}` });
  }
  if (observation.mainRegions !== 1) {
    problems.push({ code: "route-main", route, detail: `${observation.mainRegions} visible main regions` });
  }
  if (!observation.heading.trim()) problems.push({ code: "route-heading", route, detail: "No exposed first-level heading" });
  return problems;
}

export function transitionFindings(transition: TransitionObservation): RouteFinding[] {
  const findings = navigationFindings(transition.after);
  if (transition.after.route !== transition.route || transition.before.route !== transition.route) {
    findings.push({ code: "transition-route", route: transition.route, detail: "Route identity changed during audit" });
  }
  if (transition.after.requested !== transition.expected) {
    findings.push({ code: "transition-request", route: transition.route, detail: "Requested language did not match selected language" });
  }
  if (transition.before.requested === transition.expected) {
    findings.push({ code: "transition-no-change", route: transition.route, detail: "Initial locale already selected" });
  }
  if (!transition.navigationChanged) {
    findings.push({ code: "transition-not-applied", route: transition.route, detail: "No language transition reported" });
  }
  return findings;
}

export function fairRouteSample(routes: readonly string[], maximum: number): string[] {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be a positive integer");
  if (routes.length <= maximum) return [...routes];
  if (maximum === 1) return [routes[0]!];
  const sample: string[] = [];
  for (let index = 0; index < maximum; index += 1) {
    const position = Math.round((index * (routes.length - 1)) / (maximum - 1));
    const route = routes[position];
    if (route && !sample.includes(route)) sample.push(route);
  }
  return sample;
}

export function formatRouteFindings(findings: readonly RouteFinding[], limit = 30): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const lines = [...new Set(findings.map((entry) => `${entry.code} ${entry.route}: ${entry.detail}`))];
  const remaining = lines.length - Math.min(lines.length, limit);
  return [...lines.slice(0, limit), ...(remaining ? [`${remaining} additional findings`] : [])].join("\n");
}

/** Reports the complete inventory without interpreting absence as a negative real-world fact. */
export function summaryByPrefix(routes: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const route of routes) {
    const part = route.split("/")[1] || "home";
    counts[part] = (counts[part] ?? 0) + 1;
  }
  return counts;
}

export function noDuplicateTargets(cells: readonly MatrixCell[]): boolean {
  return new Set(cells.map(matrixKey)).size === cells.length;
}

export function partitionMatrix(cells: readonly MatrixCell[]): Record<Locale, MatrixCell[]> {
  return {
    en: cells.filter((cell) => cell.locale === "en"),
    fr: cells.filter((cell) => cell.locale === "fr"),
  };
}

export function hasCompleteLocaleCoverage(cells: readonly MatrixCell[], routes: readonly string[]): boolean {
  const covered = new Set(cells.map(matrixKey));
  return routes.every((route) =>
    (["en", "fr"] as const).every((locale) =>
      ([320, 1280] as const).every((width) => covered.has(matrixKey({ route, locale, width })))));
}
