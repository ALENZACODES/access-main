/**
 * Offline journey contracts for Ontario's unbranded accessibility PWA.
 * This is a test-only policy engine. It does not determine whether a real place
 * is accessible and does not turn missing or stale data into a positive claim.
 */
import { auditCopy, normalizeLocale, unknownValue, type AuditLocale } from "./p20ad-offline-copy.ts";

export type ConnectionState = "online" | "offline" | "unknown";
export type CacheState = "fresh" | "stale" | "missing" | "unknown";
export type OutcomeState = "idle" | "loading" | "ready" | "empty" | "error";
export type StepKind = "navigate" | "disconnect" | "reconnect" | "retry" | "back" |
  "forward" | "language" | "search" | "clear" | "open-dialog" | "close-dialog" |
  "cache-read" | "cache-write" | "reload" | "focus";
export type Severity = "error" | "warning" | "info";

export interface Provenance {
  source: string | null;
  licence: string | null;
  retrievedOn: string | null;
  tier: string | null;
}
export interface EvidenceObservation {
  id: string;
  label: string | null;
  value: string | null;
  provenance: Provenance;
  explicitlyUnknown: boolean;
}
export interface ControlObservation {
  id: string;
  role: string;
  name: string | null;
  visible: boolean;
  disabled: boolean;
  inert: boolean;
  tabIndex: number;
  width: number | null;
  height: number | null;
  focusVisible: boolean | null;
  insideDialog: boolean;
}
export interface StatusObservation {
  id: string;
  text: string;
  locale: AuditLocale | null;
  politeness: "off" | "polite" | "assertive" | "unknown";
  visible: boolean;
  busy: boolean;
  emittedAt: number | null;
}
export interface RouteObservation {
  path: string;
  locale: AuditLocale | null;
  connection: ConnectionState;
  cache: CacheState;
  outcome: OutcomeState;
  title: string | null;
  heading: string | null;
  mainCount: number;
  dialogOpen: boolean;
  focusId: string | null;
  controls: readonly ControlObservation[];
  statuses: readonly StatusObservation[];
  evidence: readonly EvidenceObservation[];
  scrollY: number | null;
  historyIndex: number | null;
  viewport: { width: number; height: number };
  horizontalOverflow: number | null;
  capturedAt: number;
}
export interface JourneyStep {
  kind: StepKind;
  before: RouteObservation;
  after: RouteObservation;
  intendedRoute?: string;
  intendedLocale?: AuditLocale;
  preserveEvidence?: boolean;
  preserveFocus?: boolean;
  requireStatus?: boolean;
  actionAt?: number | null;
}
export interface JourneyTrace {
  initial: RouteObservation;
  steps: readonly JourneyStep[];
}
export interface AuditFinding {
  code: string;
  severity: Severity;
  route: string;
  step: number;
  detail: string;
}
export interface RouteCell {
  path: string;
  locale: AuditLocale;
  viewport: 320 | 1280;
  network: "online" | "offline";
}

const missing = (value: string | null): boolean => unknownValue(value) === "UNKNOWN";
const finding = (code: string, severity: Severity, route: string, step: number, detail: string): AuditFinding =>
  ({ code, severity, route, step, detail });
const issue = (code: string, route: string, step: number, detail: string): AuditFinding =>
  finding(code, "error", route, step, detail);
const warning = (code: string, route: string, step: number, detail: string): AuditFinding =>
  finding(code, "warning", route, step, detail);

export function calendarDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const [year, month, day] = parts;
  if (!year || !month || !day || month > 12 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function safePath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (/[?#\\:*]/.test(value)) return false;
  if (value.split("/").some((segment) => segment === "." || segment === "..")) return false;
  for (const character of value) {
    if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) return false;
  }
  return true;
}

export function evidenceIsKnown(entry: EvidenceObservation): boolean {
  return !entry.explicitlyUnknown && !missing(entry.label) && !missing(entry.value) &&
    !missing(entry.provenance.source) && !missing(entry.provenance.licence) &&
    !missing(entry.provenance.tier) && calendarDate(entry.provenance.retrievedOn);
}

/** Identity excludes localized presentation text and includes source metadata. */
export function evidenceIdentity(entry: EvidenceObservation): string {
  return JSON.stringify([entry.id, entry.provenance.source, entry.provenance.licence,
    entry.provenance.retrievedOn, entry.provenance.tier]);
}

export function evidenceProblems(entries: readonly EvidenceObservation[], route: string, step = 0): AuditFinding[] {
  const problems: AuditFinding[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.id.trim()) problems.push(issue("evidence-id-empty", route, step, "Evidence has an empty identifier"));
    if (ids.has(entry.id)) problems.push(issue("evidence-id-duplicate", route, step, entry.id));
    ids.add(entry.id);
    if (missing(entry.label)) problems.push(warning("evidence-label-unknown", route, step, entry.id));
    if (missing(entry.value)) problems.push(warning("evidence-value-unknown", route, step, entry.id));
    if (missing(entry.provenance.source)) problems.push(warning("evidence-source-unknown", route, step, entry.id));
    if (missing(entry.provenance.licence)) problems.push(warning("evidence-licence-unknown", route, step, entry.id));
    if (!calendarDate(entry.provenance.retrievedOn)) problems.push(warning("evidence-date-unknown", route, step, entry.id));
    if (missing(entry.provenance.tier)) problems.push(warning("evidence-tier-unknown", route, step, entry.id));
    if (entry.explicitlyUnknown && evidenceIsKnown(entry)) {
      problems.push(issue("unknown-promoted", route, step, entry.id));
    }
  }
  return problems;
}

export function provenanceProblems(
  before: readonly EvidenceObservation[], after: readonly EvidenceObservation[],
  route: string, step: number, preserve: boolean,
): AuditFinding[] {
  if (!preserve) return [];
  const problems: AuditFinding[] = [];
  const next = new Map(after.map((entry) => [entry.id, entry]));
  for (const entry of before) {
    const found = next.get(entry.id);
    if (!found) {
      problems.push(issue("evidence-lost", route, step, entry.id));
      continue;
    }
    if (evidenceIdentity(found) !== evidenceIdentity(entry)) {
      problems.push(issue("evidence-provenance-changed", route, step, entry.id));
    }
    if (!evidenceIsKnown(entry) && evidenceIsKnown(found)) {
      problems.push(issue("unknown-promoted", route, step, entry.id));
    }
  }
  return problems;
}

export function controlProblems(controls: readonly ControlObservation[], route: string, step = 0): AuditFinding[] {
  const problems: AuditFinding[] = [];
  const seen = new Set<string>();
  for (const control of controls) {
    if (!control.visible || control.disabled || control.inert) continue;
    if (!control.id.trim()) problems.push(issue("control-id-empty", route, step, control.role));
    if (seen.has(control.id)) problems.push(issue("control-id-duplicate", route, step, control.id));
    seen.add(control.id);
    if (missing(control.name)) problems.push(issue("control-name-unknown", route, step, control.id));
    if (!Number.isInteger(control.tabIndex) || control.tabIndex < -1) {
      problems.push(issue("control-tabindex-invalid", route, step, control.id));
    }
    if (control.tabIndex >= 0) {
      if (control.width === null || !Number.isFinite(control.width)) {
        problems.push(warning("control-width-unknown", route, step, control.id));
      } else if (control.width < 44) problems.push(issue("control-width-small", route, step, control.id));
      if (control.height === null || !Number.isFinite(control.height)) {
        problems.push(warning("control-height-unknown", route, step, control.id));
      } else if (control.height < 44) problems.push(issue("control-height-small", route, step, control.id));
      if (control.focusVisible === false) problems.push(issue("focus-indicator-absent", route, step, control.id));
    }
  }
  return problems;
}

export function statusProblems(statuses: readonly StatusObservation[], route: string, step = 0): AuditFinding[] {
  const problems: AuditFinding[] = [];
  const keys = new Set<string>();
  for (const status of statuses) {
    if (!status.visible) continue;
    if (keys.has(status.id)) problems.push(issue("status-id-duplicate", route, step, status.id));
    keys.add(status.id);
    if (status.politeness === "unknown") problems.push(warning("status-politeness-unknown", route, step, status.id));
    if (status.politeness !== "off" && !status.text.trim()) problems.push(issue("status-message-empty", route, step, status.id));
    if (status.emittedAt !== null && (!Number.isFinite(status.emittedAt) || status.emittedAt < 0)) {
      problems.push(issue("status-time-invalid", route, step, status.id));
    }
    if (status.locale === null) problems.push(warning("status-language-unknown", route, step, status.id));
  }
  return problems;
}

export function screenProblems(screen: RouteObservation, step = 0): AuditFinding[] {
  const problems: AuditFinding[] = [];
  const route = screen.path;
  if (!safePath(route)) problems.push(issue("route-unsafe", route, step, route));
  if (screen.locale === null) problems.push(warning("language-unknown", route, step, "Document language not observed"));
  if (screen.mainCount !== 1) problems.push(issue("main-count", route, step, String(screen.mainCount)));
  if (missing(screen.title)) problems.push(issue("title-unknown", route, step, "No document title"));
  if (missing(screen.heading)) problems.push(issue("heading-unknown", route, step, "No heading"));
  if (!Number.isFinite(screen.capturedAt) || screen.capturedAt < 0) {
    problems.push(issue("capture-time-invalid", route, step, String(screen.capturedAt)));
  }
  if (!Number.isInteger(screen.viewport.width) || screen.viewport.width < 1 ||
    !Number.isInteger(screen.viewport.height) || screen.viewport.height < 1) {
    problems.push(issue("viewport-invalid", route, step, JSON.stringify(screen.viewport)));
  }
  if (screen.horizontalOverflow !== null && screen.horizontalOverflow > 0) {
    problems.push(issue("horizontal-overflow", route, step, String(screen.horizontalOverflow)));
  }
  if (screen.scrollY !== null && (!Number.isFinite(screen.scrollY) || screen.scrollY < 0)) {
    problems.push(issue("scroll-invalid", route, step, String(screen.scrollY)));
  }
  if (screen.historyIndex !== null && (!Number.isInteger(screen.historyIndex) || screen.historyIndex < 0)) {
    problems.push(issue("history-invalid", route, step, String(screen.historyIndex)));
  }
  if (screen.dialogOpen && screen.focusId !== null) {
    const focused = screen.controls.find((control) => control.id === screen.focusId);
    if (focused && !focused.insideDialog) problems.push(issue("modal-focus-escaped", route, step, screen.focusId));
  }
  if (screen.outcome === "loading" && !screen.statuses.some((status) => status.busy && status.visible)) {
    problems.push(issue("loading-unannounced", route, step, auditCopy(screen.locale ?? "en", "loading")));
  }
  if (["empty", "error"].includes(screen.outcome) &&
    !screen.statuses.some((status) => status.visible && status.politeness !== "off" && status.text.trim())) {
    problems.push(issue("outcome-silent", route, step, screen.outcome));
  }
  if (screen.locale !== null) {
    for (const status of screen.statuses) {
      if (status.visible && status.locale !== null && status.locale !== screen.locale) {
        problems.push(issue("status-language-mismatch", route, step, status.id));
      }
    }
  }
  problems.push(...controlProblems(screen.controls, route, step));
  problems.push(...statusProblems(screen.statuses, route, step));
  problems.push(...evidenceProblems(screen.evidence, route, step));
  return problems;
}

export function sameScreenIdentity(a: RouteObservation, b: RouteObservation): boolean {
  return a.path === b.path && a.locale === b.locale && a.connection === b.connection &&
    a.cache === b.cache && a.outcome === b.outcome;
}

export function announcementDifference(before: RouteObservation, after: RouteObservation): StatusObservation[] {
  const previous = new Map<string, number>();
  for (const status of before.statuses.filter((item) => item.visible && item.politeness !== "off")) {
    const fingerprint = `${status.politeness}:${status.locale}:${status.text.trim()}`;
    previous.set(fingerprint, (previous.get(fingerprint) ?? 0) + 1);
  }
  const additions: StatusObservation[] = [];
  for (const status of after.statuses.filter((item) => item.visible && item.politeness !== "off")) {
    const fingerprint = `${status.politeness}:${status.locale}:${status.text.trim()}`;
    const remaining = previous.get(fingerprint) ?? 0;
    if (remaining > 0) previous.set(fingerprint, remaining - 1);
    else additions.push(status);
  }
  return additions;
}

export function transitionProblems(event: JourneyStep, step: number): AuditFinding[] {
  const problems: AuditFinding[] = [];
  const { before, after, kind } = event;
  const route = after.path;
  const navigational = ["navigate", "back", "forward", "reload"].includes(kind);
  if (!navigational && before.path !== after.path) {
    problems.push(issue("unexpected-navigation", route, step, `${before.path} to ${after.path}`));
  }
  if (kind !== "language" && before.locale !== after.locale) {
    problems.push(issue("unexpected-language", route, step, `${before.locale} to ${after.locale}`));
  }
  if (kind === "language") {
    if (before.locale === after.locale) problems.push(issue("language-unchanged", route, step, String(before.locale)));
    if (event.intendedLocale && after.locale !== event.intendedLocale) {
      problems.push(issue("language-target-mismatch", route, step, String(after.locale)));
    }
  }
  if (event.intendedRoute && after.path !== event.intendedRoute) {
    problems.push(issue("route-target-mismatch", route, step, event.intendedRoute));
  }
  if (kind === "disconnect" && after.connection !== "offline") {
    problems.push(issue("disconnect-not-observed", route, step, after.connection));
  }
  if (kind === "reconnect" && after.connection !== "online") {
    problems.push(issue("reconnect-not-observed", route, step, after.connection));
  }
  if (kind === "cache-read" && after.cache === "unknown") {
    problems.push(warning("cache-result-unknown", route, step, "Read outcome not observed"));
  }
  if (kind === "cache-write" && after.cache !== "fresh") {
    problems.push(warning("cache-write-not-confirmed", route, step, after.cache));
  }
  if (kind === "retry" && before.outcome !== "error" && before.outcome !== "empty") {
    problems.push(issue("retry-without-failure", route, step, before.outcome));
  }
  if (kind === "clear" && after.outcome === "loading") {
    problems.push(issue("clear-started-loading", route, step, after.outcome));
  }
  if (kind === "open-dialog" && !after.dialogOpen) {
    problems.push(issue("dialog-not-open", route, step, after.path));
  }
  if (kind === "close-dialog" && after.dialogOpen) {
    problems.push(issue("dialog-not-closed", route, step, after.path));
  }
  if (event.preserveFocus && before.focusId !== after.focusId) {
    problems.push(issue("focus-not-restored", route, step, `${before.focusId} to ${after.focusId}`));
  }
  if (event.preserveEvidence) problems.push(...provenanceProblems(before.evidence, after.evidence, route, step, true));
  if (event.requireStatus) {
    const changes = announcementDifference(before, after);
    if (changes.length === 0) problems.push(issue("status-not-updated", route, step, kind));
    const actionAt = event.actionAt;
    for (const status of changes) {
      if (actionAt !== undefined && actionAt !== null && status.emittedAt !== null && status.emittedAt < actionAt) {
        problems.push(issue("status-before-action", route, step, status.id));
      }
      if (status.politeness === "off") problems.push(issue("status-silent", route, step, status.id));
    }
  }
  if (kind === "disconnect" && before.evidence.length > 0 && after.evidence.length === 0 &&
    before.cache !== "missing") {
    problems.push(warning("offline-evidence-lost", route, step, "Previously observed evidence disappeared"));
  }
  if (kind === "back" && before.historyIndex !== null && after.historyIndex !== null &&
    after.historyIndex >= before.historyIndex) {
    problems.push(issue("history-back-invalid", route, step, `${before.historyIndex} to ${after.historyIndex}`));
  }
  if (kind === "forward" && before.historyIndex !== null && after.historyIndex !== null &&
    after.historyIndex <= before.historyIndex) {
    problems.push(issue("history-forward-invalid", route, step, `${before.historyIndex} to ${after.historyIndex}`));
  }
  return problems;
}

export function traceProblems(trace: JourneyTrace): AuditFinding[] {
  const problems: AuditFinding[] = [...screenProblems(trace.initial, 0)];
  let previous = trace.initial;
  trace.steps.forEach((step, index) => {
    if (!sameScreenIdentity(previous, step.before)) {
      problems.push(issue("trace-discontinuous", step.before.path, index + 1,
        `Step ${index + 1} does not begin at the preceding observed screen`));
    }
    problems.push(...transitionProblems(step, index + 1));
    problems.push(...screenProblems(step.after, index + 1));
    previous = step.after;
  });
  return problems;
}

export function offlineFallbackProblems(screen: RouteObservation, step = 0): AuditFinding[] {
  const problems: AuditFinding[] = [];
  if (screen.connection !== "offline") return problems;
  if (screen.cache === "missing" && screen.outcome === "ready" && screen.evidence.length === 0) {
    problems.push(issue("empty-cache-claimed-ready", screen.path, step, "No observations support ready state"));
  }
  if (screen.cache === "stale" && screen.evidence.some((entry) => !entry.explicitlyUnknown &&
      !calendarDate(entry.provenance.retrievedOn))) {
    problems.push(warning("stale-evidence-date-unknown", screen.path, step, "Retrieved-on date is UNKNOWN"));
  }
  if (screen.cache === "unknown" && screen.outcome === "ready") {
    problems.push(warning("cache-status-unknown", screen.path, step, "Cache readiness not measured"));
  }
  if (screen.outcome === "error" && !screen.statuses.some((status) => status.visible && status.text.trim())) {
    problems.push(issue("offline-error-unannounced", screen.path, step, "No visible status"));
  }
  return problems;
}

export function requiredRouteCells(routes: readonly string[]): RouteCell[] {
  return routes.flatMap((path) => (["en", "fr"] as const).flatMap((locale) =>
    ([320, 1280] as const).flatMap((viewport) =>
      (["online", "offline"] as const).map((network) => ({ path, locale, viewport, network })))));
}

export function routeCellKey(cell: RouteCell): string {
  return `${cell.path}|${cell.locale}|${cell.viewport}|${cell.network}`;
}

export function routeMatrixProblems(expected: readonly RouteCell[], actual: readonly RouteCell[]): AuditFinding[] {
  const expectedKeys = new Set(expected.map(routeCellKey));
  const seen = new Set<string>();
  const problems: AuditFinding[] = [];
  for (const cell of actual) {
    const key = routeCellKey(cell);
    if (seen.has(key)) problems.push(issue("matrix-duplicate", cell.path, 0, key));
    if (!expectedKeys.has(key)) problems.push(issue("matrix-unexpected", cell.path, 0, key));
    seen.add(key);
  }
  for (const cell of expected) {
    if (!seen.has(routeCellKey(cell))) problems.push(issue("matrix-missing", cell.path, 0, routeCellKey(cell)));
  }
  return problems;
}

export function summarizeAudit(findings: readonly AuditFinding[], maximum = 30): string {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be positive");
  const entries = [...new Set(findings.map((item) =>
    `${item.severity} ${item.code} ${item.route} step ${item.step}: ${item.detail}`))];
  const remaining = Math.max(0, entries.length - maximum);
  return [...entries.slice(0, maximum), ...(remaining > 0 ? [`${remaining} additional findings`] : [])].join("\n");
}

export function filterAudit(findings: readonly AuditFinding[], severity: Severity): AuditFinding[] {
  return findings.filter((item) => item.severity === severity);
}

export function auditIsBlocking(findings: readonly AuditFinding[]): boolean {
  return findings.some((item) => item.severity === "error");
}

export function uniqueAudit(findings: readonly AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  return findings.filter((item) => {
    const fingerprint = `${item.code}:${item.route}:${item.step}:${item.detail}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

export function assertLocale(locale: string | null, expected: AuditLocale): boolean {
  return normalizeLocale(locale) === expected;
}
