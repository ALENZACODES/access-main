import { finding, type CoverageCell, type Finding, type Resource, type Snapshot, type Step, type Trace } from "./p20aj-types.ts";
import { evidenceContinuity, evidenceFindings } from "./p20aj-evidence.ts";
import { focusFindings, focusRestoreFindings } from "./p20aj-focus.ts";

export const MAX_PRECACHE_FILE_BYTES = 524288;
export const MAX_PRECACHE_TOTAL_BYTES = 4 * 1024 * 1024;
export function safeRoute(route: string): boolean {
  if (!route.startsWith("/") || route.startsWith("//") || /[?#\\:*]/.test(route)) return false;
  if (route.split("/").some((part) => part === "." || part === "..")) return false;
  for (const character of route) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return false;
  }
  return true;
}
export function normalizeRoute(route: string): string | null {
  if (!safeRoute(route)) return null;
  return route.length > 1 && route.endsWith("/") ? route.slice(0, -1) : route;
}
export function resourceFindings(resources: readonly Resource[], offline: boolean, step: number): Finding[] {
  const problems: Finding[] = [];
  const seen = new Set<string>();
  let total = 0;
  let complete = true;
  for (const resource of resources) {
    if (!safeRoute(resource.path)) problems.push(finding("resource-unsafe-path", "security", step, resource.path));
    if (seen.has(resource.path)) problems.push(finding("resource-duplicate", "resource", step, resource.path));
    seen.add(resource.path);
    if (resource.bytes === null || !Number.isFinite(resource.bytes) || resource.bytes < 0) {
      complete = false;
      problems.push(finding("resource-size-UNKNOWN", "resource", step, resource.path, "information"));
    } else {
      total += resource.bytes;
      if (resource.bytes > MAX_PRECACHE_FILE_BYTES) problems.push(finding("precache-file-budget", "resource", step, resource.path));
    }
    if (resource.fallbackPath !== null && !safeRoute(resource.fallbackPath)) {
      problems.push(finding("fallback-unsafe", "security", step, resource.path));
    }
    if (offline && resource.networkSucceeded === true) problems.push(finding("offline-network-success", "resource", step, resource.path));
    if (offline && resource.cache === "absent" && resource.fallbackPath === null) {
      problems.push(finding("offline-without-fallback", "resource", step, resource.path));
    }
    if (resource.cache === "UNKNOWN" && resource.networkSucceeded !== true && resource.fallbackPath === null) {
      problems.push(finding("resource-availability-UNKNOWN", "resource", step, resource.path, "information"));
    }
    if (resource.cache === "stale" && resource.contentType === null) {
      problems.push(finding("stale-type-UNKNOWN", "resource", step, resource.path, "information"));
    }
  }
  if (complete && total > MAX_PRECACHE_TOTAL_BYTES) problems.push(finding("precache-total-budget", "resource", step, String(total)));
  if (!complete) problems.push(finding("precache-total-UNKNOWN", "resource", step, "Cannot assert total budget", "information"));
  return problems;
}
export function statusFindings(snapshot: Snapshot, step: number): Finding[] {
  const problems: Finding[] = [];
  const keys = new Set<string>();
  for (const status of snapshot.statuses) {
    if (keys.has(status.id)) problems.push(finding("status-duplicate", "copy", step, status.id));
    keys.add(status.id);
    if (!status.visible) continue;
    if (status.locale !== snapshot.locale) problems.push(finding("status-locale", "copy", step, status.id));
    if (!status.text.trim() && status.politeness !== "off") problems.push(finding("status-blank", "copy", step, status.id));
    if (status.politeness === "UNKNOWN") problems.push(finding("status-urgency-UNKNOWN", "copy", step, status.id, "information"));
    if (status.busy === null) problems.push(finding("status-busy-UNKNOWN", "copy", step, status.id, "information"));
    if (status.emittedAt === null || !Number.isFinite(status.emittedAt)) {
      problems.push(finding("status-time-UNKNOWN", "copy", step, status.id, "information"));
    } else if (snapshot.time !== null && status.emittedAt < snapshot.time) {
      problems.push(finding("status-before-action", "copy", step, status.id));
    }
  }
  if (snapshot.phase === "loading" && !snapshot.statuses.some((status) => status.visible && status.busy === true)) {
    problems.push(finding("loading-unannounced", "copy", step, snapshot.route));
  }
  if (["empty", "error", "offline"].includes(snapshot.phase) && !snapshot.statuses.some((status) => status.visible && status.politeness !== "off" && status.text.trim())) {
    problems.push(finding("outcome-silent", "copy", step, snapshot.route));
  }
  return problems;
}
export function snapshotFindings(snapshot: Snapshot, step: number): Finding[] {
  const problems: Finding[] = [];
  if (!safeRoute(snapshot.route)) problems.push(finding("route-invalid", "route", step, snapshot.route));
  if (snapshot.mainCount !== 1) problems.push(finding("main-count", "route", step, String(snapshot.mainCount)));
  if (!snapshot.heading.trim()) problems.push(finding("heading-empty", "route", step, snapshot.route));
  if (!snapshot.title.trim()) problems.push(finding("title-empty", "route", step, snapshot.route));
  if (snapshot.locale === "UNKNOWN") problems.push(finding("locale-UNKNOWN", "copy", step, snapshot.route, "information"));
  if (snapshot.connectivity === "UNKNOWN") problems.push(finding("connectivity-UNKNOWN", "resource", step, snapshot.route, "information"));
  if (snapshot.historyIndex !== null && (!Number.isInteger(snapshot.historyIndex) || snapshot.historyIndex < 0)) {
    problems.push(finding("history-invalid", "history", step, snapshot.route));
  }
  if (snapshot.scrollY !== null && (!Number.isFinite(snapshot.scrollY) || snapshot.scrollY < 0)) {
    problems.push(finding("scroll-invalid", "history", step, snapshot.route));
  }
  if (snapshot.time !== null && (!Number.isFinite(snapshot.time) || snapshot.time < 0)) {
    problems.push(finding("time-invalid", "continuity", step, snapshot.route));
  }
  problems.push(...focusFindings(snapshot, step));
  problems.push(...statusFindings(snapshot, step));
  problems.push(...resourceFindings(snapshot.resources, snapshot.connectivity === "offline", step));
  problems.push(...evidenceFindings(snapshot.evidence, step));
  return problems;
}
export function actionFindings(action: Step, step: number): Finding[] {
  const problems: Finding[] = [];
  const { before, after } = action;
  const routeChanging = ["navigate", "back", "forward"].includes(action.action);
  if (!routeChanging && before.route !== after.route) problems.push(finding("unexpected-route", "continuity", step, after.route));
  if (action.action === "navigate" && action.targetRoute !== null && after.route !== action.targetRoute) {
    problems.push(finding("navigation-target", "route", step, after.route));
  }
  if (action.action === "language") {
    if (before.locale === after.locale) problems.push(finding("language-unchanged", "copy", step, String(after.locale)));
  } else if (before.locale !== after.locale) {
    problems.push(finding("unexpected-locale", "copy", step, String(after.locale)));
  }
  if (action.action === "disconnect" && after.connectivity !== "offline") problems.push(finding("disconnect-not-observed", "resource", step, after.connectivity));
  if (action.action === "reconnect" && after.connectivity !== "online") problems.push(finding("reconnect-not-observed", "resource", step, after.connectivity));
  if (action.action === "retry" && before.phase !== "error" && before.phase !== "offline" && before.phase !== "empty") {
    problems.push(finding("retry-without-failure", "continuity", step, before.phase));
  }
  if (action.action === "clear" && after.phase === "loading") problems.push(finding("clear-started-request", "continuity", step, after.phase));
  if (action.action === "search" && after.phase === "idle") problems.push(finding("search-no-outcome", "continuity", step, after.phase));
  if (action.expectedStatus !== null && after.phase !== action.expectedStatus) {
    problems.push(finding("outcome-mismatch", "continuity", step, `${after.phase} instead of ${action.expectedStatus}`));
  }
  if (before.time !== null && after.time !== null && after.time < before.time) problems.push(finding("time-reversed", "continuity", step, after.route));
  if (action.action === "back" && before.historyIndex !== null && after.historyIndex !== null && after.historyIndex >= before.historyIndex) {
    problems.push(finding("back-history", "history", step, after.route));
  }
  if (action.action === "forward" && before.historyIndex !== null && after.historyIndex !== null && after.historyIndex <= before.historyIndex) {
    problems.push(finding("forward-history", "history", step, after.route));
  }
  if (action.action === "navigate" && before.historyIndex !== null && after.historyIndex !== null && after.historyIndex <= before.historyIndex) {
    problems.push(finding("navigation-history", "history", step, after.route));
  }
  problems.push(...focusRestoreFindings(before, after, action.preserveFocus, step));
  problems.push(...evidenceContinuity(before.evidence, after.evidence, step, action.preserveEvidence));
  return problems;
}
export function sameIdentity(a: Snapshot, b: Snapshot): boolean {
  return a.route === b.route && a.locale === b.locale && a.connectivity === b.connectivity && a.phase === b.phase;
}
export function traceFindings(trace: Trace): Finding[] {
  const findings = snapshotFindings(trace.initial, 0);
  let previous = trace.initial;
  for (let i = 0; i < trace.steps.length; i += 1) {
    const step = trace.steps[i];
    if (!step) continue;
    if (!sameIdentity(previous, step.before)) findings.push(finding("trace-disconnected", "continuity", i + 1, step.action));
    findings.push(...actionFindings(step, i + 1));
    findings.push(...snapshotFindings(step.after, i + 1));
    previous = step.after;
  }
  return findings;
}
export function coverageMatrix(routes: readonly string[]): CoverageCell[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((locale) =>
    ([320, 1280] as const).flatMap((width) => (["online", "offline"] as const)
      .map((connectivity) => ({ route, locale, width, connectivity })))));
}
export function coverageKey(cell: CoverageCell): string {
  return [cell.route, cell.locale, cell.width, cell.connectivity].join("|");
}
export function coverageFindings(expected: readonly CoverageCell[], observed: readonly CoverageCell[]): Finding[] {
  const failures: Finding[] = [];
  const expectedKeys = new Set(expected.map(coverageKey));
  const observedKeys = new Set<string>();
  for (const cell of observed) {
    const key = coverageKey(cell);
    if (observedKeys.has(key)) failures.push(finding("matrix-duplicate", "route", 0, key));
    if (!expectedKeys.has(key)) failures.push(finding("matrix-unexpected", "route", 0, key));
    observedKeys.add(key);
  }
  for (const cell of expected) if (!observedKeys.has(coverageKey(cell))) failures.push(finding("matrix-missing", "route", 0, coverageKey(cell)));
  return failures;
}
export function inventoryFindings(routes: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  if (!routes.length) findings.push(finding("inventory-empty", "route", 0, "No route inventory"));
  for (const route of routes) {
    const normalized = normalizeRoute(route);
    if (normalized === null) {
      findings.push(finding("inventory-invalid", "route", 0, route));
      continue;
    }
    if (normalized !== route) findings.push(finding("inventory-noncanonical", "route", 0, route));
    if (seen.has(normalized)) findings.push(finding("inventory-duplicate", "route", 0, route));
    seen.add(normalized);
  }
  return findings;
}
