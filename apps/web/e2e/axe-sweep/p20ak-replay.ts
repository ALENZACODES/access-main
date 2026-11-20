import { issue, safeRoute, sameIdentity, textOrUnknown, UNKNOWN, type AuditMatrixCell, type AuditReceipt, type Finding, type JourneyEvent, type JourneyTrace, type PageSnapshot } from "./p20ak-types.ts";
import { evidenceEventFindings, evidenceFindings } from "./p20ak-evidence.ts";
import { dialogFindings, focusEventFindings, stableFocusableNames, targetFindings } from "./p20ak-focus.ts";
import { cacheConfidence, offlineFallbackFindings, resourceFindings, resourceTransitionFindings, workerFindings } from "./p20ak-worker.ts";
import { announcementFindings, localeFindings, languageEventFindings } from "./p20ak-locale.ts";

/** Reconciles consecutive observations without claiming a route was usable. */
export function snapshotFindings(snapshot: PageSnapshot, step = 0): Finding[] {
  const findings: Finding[] = [];
  if (!safeRoute(snapshot.route)) findings.push(issue("route-unsafe", snapshot.route, "Unsafe route", step));
  if (snapshot.language === UNKNOWN) findings.push(issue("language-unknown", snapshot.route, "Document language UNKNOWN", step, "information"));
  if (snapshot.mainCount !== 1) findings.push(issue("main-count", snapshot.route, `Expected one main, got ${snapshot.mainCount}`, step));
  if (!snapshot.heading.trim()) findings.push(issue("heading-empty", snapshot.route, "First heading absent", step));
  if (!snapshot.title.trim()) findings.push(issue("title-empty", snapshot.route, "Document title absent", step));
  if (!Number.isFinite(snapshot.width) || snapshot.width <= 0) findings.push(issue("viewport-invalid", snapshot.route, "Invalid viewport width", step));
  if (!Number.isFinite(snapshot.horizontalOverflow) || snapshot.horizontalOverflow < 0) findings.push(issue("overflow-invalid", snapshot.route, "Invalid overflow measurement", step));
  else if (snapshot.horizontalOverflow > 0) findings.push(issue("horizontal-overflow", snapshot.route, `${snapshot.horizontalOverflow}px overflow`, step));
  if (!Number.isFinite(snapshot.scrollY) || snapshot.scrollY < 0) findings.push(issue("scroll-invalid", snapshot.route, "Invalid scroll Y", step));
  if (!Number.isFinite(snapshot.observedAt) || snapshot.observedAt < 0) findings.push(issue("snapshot-time-invalid", snapshot.route, "Invalid snapshot timestamp", step));
  if (snapshot.historyIndex !== null && (!Number.isInteger(snapshot.historyIndex) || snapshot.historyIndex < 0)) findings.push(issue("history-index-invalid", snapshot.route, "Invalid history index", step));
  if (snapshot.phase === "loading" && !snapshot.announcements.some((message) => message.busy === true)) findings.push(issue("loading-not-busy", snapshot.route, "Loading state lacks busy announcement", step));
  if (["empty", "error"].includes(snapshot.phase) && !snapshot.announcements.some((message) => message.visible && message.politeness !== "off" && message.text.trim())) findings.push(issue("outcome-silent", snapshot.route, "Outcome has no live announcement", step));
  findings.push(...targetFindings(snapshot.targets, step));
  findings.push(...dialogFindings(snapshot.dialogs, snapshot.targets, step));
  findings.push(...resourceFindings(snapshot.resources, snapshot.observedAt));
  findings.push(...workerFindings(snapshot.worker, snapshot.connectivity, step));
  findings.push(...offlineFallbackFindings(snapshot));
  findings.push(...evidenceFindings(snapshot.evidence, step));
  findings.push(...announcementFindings(snapshot.announcements, snapshot.language, step));
  findings.push(...localeFindings(snapshot.language, snapshot.route, step));
  return findings;
}
export function transitionFindings(event: JourneyEvent, step = 1): Finding[] {
  const findings: Finding[] = [];
  const { before, after } = event;
  if (!event.id.trim()) findings.push(issue("event-id-empty", "trace", "Event ID missing", step));
  if (event.elapsedMs === null) findings.push(issue("event-duration-unknown", event.id, "Elapsed duration UNKNOWN", step, "information"));
  else if (!Number.isFinite(event.elapsedMs) || event.elapsedMs < 0) findings.push(issue("event-duration-invalid", event.id, "Invalid duration", step));
  if (after.observedAt < before.observedAt) findings.push(issue("event-clock-reversed", event.id, "Observation time moved backwards", step));
  if (event.action === "navigate") {
    if (event.expectedRoute && event.expectedRoute !== after.route) findings.push(issue("navigation-route-mismatch", event.id, "Requested route was not reached", step));
    if (before.route === after.route && event.expectedRoute !== before.route) findings.push(issue("navigation-unchanged", event.id, "Navigation did not change the route", step));
  } else if (event.action === "language") {
    findings.push(...languageEventFindings(event, step));
  } else if (event.action === "back" || event.action === "forward") {
    if (before.historyIndex !== null && after.historyIndex !== null) {
      const delta = after.historyIndex - before.historyIndex;
      if (event.action === "back" && delta >= 0) findings.push(issue("history-back-direction", event.id, "History did not move backwards", step));
      if (event.action === "forward" && delta <= 0) findings.push(issue("history-forward-direction", event.id, "History did not move forwards", step));
    }
  } else if (before.route !== after.route) {
    findings.push(issue("unexpected-route-change", event.id, "Action unexpectedly changed route", step));
  }
  if (event.action === "disconnect" && after.connectivity !== "offline") findings.push(issue("disconnect-unobserved", event.id, "Connection not observed offline", step));
  if (event.action === "reconnect" && after.connectivity !== "online") findings.push(issue("reconnect-unobserved", event.id, "Connection not observed online", step));
  if (event.action !== "language" && before.language !== after.language) findings.push(issue("unexpected-language-change", event.id, "Document language changed without language action", step));
  if (event.action === "retry" && !["error", "offline", "empty"].includes(before.phase)) findings.push(issue("retry-without-failure", event.id, "Retry started from a non-failure phase", step));
  if (event.action === "clear" && after.phase === "loading") findings.push(issue("clear-started-loading", event.id, "Clearing triggered loading", step));
  if (event.action === "search" && after.phase === "idle") findings.push(issue("search-still-idle", event.id, "Search has no observable progress", step));
  if (event.expectedResponse && event.expectedResponse !== "UNKNOWN" && !after.resources.some((resource) => resource.phase === event.expectedResponse)) findings.push(issue("response-unobserved", event.id, "Expected request outcome not observed", step));
  findings.push(...evidenceEventFindings(event, step));
  findings.push(...focusEventFindings(event, step));
  if (event.action === "focus" || event.action === "language") findings.push(...stableFocusableNames(before.targets, after.targets));
  if (["disconnect", "back", "forward", "language"].includes(event.action)) findings.push(...resourceTransitionFindings(before.resources, after.resources, "preserve", step));
  return findings;
}
export function traceFindings(trace: JourneyTrace): Finding[] {
  const findings = snapshotFindings(trace.initial);
  const ids = new Set<string>();
  if (!trace.id.trim()) findings.push(issue("trace-id-empty", "trace", "Trace identifier missing"));
  let current = trace.initial;
  for (let index = 0; index < trace.events.length; index += 1) {
    const event = trace.events[index]!;
    if (ids.has(event.id)) findings.push(issue("event-id-duplicate", event.id, "Duplicate event ID", index + 1));
    ids.add(event.id);
    if (!sameIdentity(current, event.before) || current.observedAt !== event.before.observedAt) findings.push(issue("trace-chain-broken", event.id, "Before-state does not match prior after-state", index + 1));
    findings.push(...transitionFindings(event, index + 1));
    findings.push(...snapshotFindings(event.after, index + 1));
    current = event.after;
  }
  return findings;
}
export function traceTimeline(trace: JourneyTrace): readonly PageSnapshot[] {
  return [trace.initial, ...trace.events.map((event) => event.after)];
}
export function finalSnapshot(trace: JourneyTrace): PageSnapshot {
  return trace.events[trace.events.length - 1]?.after ?? trace.initial;
}
export function receiptFromTrace(trace: JourneyTrace): AuditReceipt {
  const findings = traceFindings(trace);
  const final = finalSnapshot(trace);
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const unknowns = findings.filter((finding) => finding.severity === "information").length;
  const result = errors > 0 ? "fail" : unknowns > 0 ? UNKNOWN : "pass";
  return { traceId: trace.id, route: final.route, locale: final.language, observedAt: final.observedAt,
    result, errors, warnings, unknowns, findings, evidence: final.evidence };
}
export function routeMatrix(routes: readonly string[]): AuditMatrixCell[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((locale) =>
    ([320, 1280] as const).flatMap((width) => (["online", "offline"] as const)
      .map((connectivity) => ({ route, locale, width, connectivity })))));
}
export function matrixKey(cell: AuditMatrixCell): string {
  return `${cell.route}|${cell.locale}|${cell.width}|${cell.connectivity}`;
}
export function matrixFindings(required: readonly AuditMatrixCell[], observed: readonly AuditMatrixCell[]): Finding[] {
  const findings: Finding[] = [];
  const requiredKeys = new Set(required.map(matrixKey));
  const observedKeys = new Set<string>();
  for (const cell of observed) {
    const key = matrixKey(cell);
    if (observedKeys.has(key)) findings.push(issue("matrix-duplicate", key, "Duplicate coverage cell"));
    if (!requiredKeys.has(key)) findings.push(issue("matrix-unexpected", key, "Unexpected coverage cell"));
    observedKeys.add(key);
  }
  for (const cell of required) if (!observedKeys.has(matrixKey(cell))) findings.push(issue("matrix-missing", matrixKey(cell), "Coverage cell absent"));
  return findings;
}
export function routeInventoryFindings(routes: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  if (routes.length === 0) findings.push(issue("routes-empty", "routes", "Empty route inventory"));
  for (const route of routes) {
    if (!safeRoute(route)) findings.push(issue("route-invalid", route, "Unsafe or dynamic path"));
    if (seen.has(route)) findings.push(issue("route-duplicate", route, "Route repeated"));
    seen.add(route);
  }
  return findings;
}
export function diagnosticDelta(before: readonly Finding[], after: readonly Finding[]): { newCodes: string[]; fixedCodes: string[]; retainedCodes: string[] } {
  const previous = new Set(before.map((finding) => `${finding.code}|${finding.scope}`));
  const current = new Set(after.map((finding) => `${finding.code}|${finding.scope}`));
  return { newCodes: [...current].filter((key) => !previous.has(key)),
    fixedCodes: [...previous].filter((key) => !current.has(key)),
    retainedCodes: [...current].filter((key) => previous.has(key)) };
}
export function failingSteps(trace: JourneyTrace): number[] {
  return [...new Set(traceFindings(trace).filter((finding) => finding.severity === "error").map((finding) => finding.at))];
}
export function traceSummary(trace: JourneyTrace): { actions: number; routes: number; languages: number; offlineSteps: number; cacheReadySteps: number } {
  const timeline = traceTimeline(trace);
  return { actions: trace.events.length, routes: new Set(timeline.map((page) => page.route)).size,
    languages: new Set(timeline.map((page) => page.language)).size,
    offlineSteps: timeline.filter((page) => page.connectivity === "offline").length,
    cacheReadySteps: timeline.filter((page) => cacheConfidence(page) === "ready").length };
}
export function expectedStatusText(snapshot: PageSnapshot): string {
  if (snapshot.phase === UNKNOWN) return UNKNOWN;
  return snapshot.announcements.find((item) => item.visible && item.politeness !== "off")?.text ?? UNKNOWN;
}
export function reportedOrUnknown(value: unknown): string {
  return typeof value === "string" ? textOrUnknown(value) : UNKNOWN;
}
export function retainBySeverity(findings: readonly Finding[], severity: "error" | "warning" | "information"): Finding[] {
  return findings.filter((finding) => finding.severity === severity);
}
