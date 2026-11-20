/** P20AA: deterministic journey transition policy, independent of browser timing. */
export type Locale = "en" | "fr";
export type Connection = "online" | "offline" | "unknown";
export type Phase = "idle" | "loading" | "ready" | "empty" | "error";
export type EventKind =
  | "navigate" | "back" | "forward" | "language" | "search"
  | "clear" | "submit" | "retry" | "disconnect" | "reconnect"
  | "open" | "close" | "escape" | "select" | "reset";
export interface Finding {
  code: string;
  step: number;
  target: string;
  detail: string;
  severity: "error" | "warning" | "information";
}
export interface Evidence {
  id: string;
  label: string | null;
  value: string | null;
  source: string | null;
  licence: string | null;
  retrievedOn: string | null;
  tier: string | null;
}
export interface FocusState {
  id: string | null;
  role: string | null;
  visible: boolean;
  insideModal: boolean;
  inInertRegion: boolean;
  width: number | null;
  height: number | null;
}
export interface Message {
  key: string;
  text: string;
  locale: Locale;
  politeness: "off" | "polite" | "assertive";
  busy: boolean;
  emittedAt: number;
}
export interface Screen {
  route: string;
  locale: Locale;
  connection: Connection;
  phase: Phase;
  title: string;
  heading: string;
  mainCount: number;
  focus: FocusState;
  evidence: readonly Evidence[];
  messages: readonly Message[];
  modalId: string | null;
  query: string;
  scrollY: number;
  historyIndex: number;
  actionTime: number;
}
export interface Transition {
  kind: EventKind;
  before: Screen;
  after: Screen;
  target?: string;
  preserveEvidence?: boolean;
  preserveFocus?: boolean;
  preserveScroll?: boolean;
  announce?: boolean;
}
export interface Journey {
  initial: Screen;
  actions: readonly Transition[];
}
export const UNKNOWN = "UNKNOWN";
const UNKNOWN_TOKENS = new Set(["", "unknown", "inconnu", "inconnue", "—", "-", "n/a", "null", "undefined"]);
export function isUnknown(value: string | null | undefined): boolean {
  return value == null || UNKNOWN_TOKENS.has(value.trim().toLowerCase());
}
export function normalizedValue(value: string | null | undefined): string {
  if (isUnknown(value)) return UNKNOWN;
  return value!.trim().replace(/\s+/g, " ");
}
export function isCalendarDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}
export function validRoute(route: string): boolean {
  if (!route.startsWith("/") || route.startsWith("//")) return false;
  if (/[?#*\\:]/.test(route)) return false;
  if (route.split("/").some((segment) => segment === "." || segment === "..")) return false;
  for (const char of route) if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return false;
  return true;
}
export function issue(code: string, step: number, target: string, detail: string, severity: Finding["severity"] = "error"): Finding {
  return { code, step, target, detail, severity };
}
export function evidenceKnown(value: Evidence): boolean {
  return Boolean(value.id.trim()) && !isUnknown(value.label) && !isUnknown(value.value) &&
    !isUnknown(value.source) && !isUnknown(value.licence) &&
    !isUnknown(value.tier) && isCalendarDate(value.retrievedOn);
}
export function evidenceFindings(values: readonly Evidence[], step: number): Finding[] {
  const failures: Finding[] = [];
  const ids = new Set<string>();
  for (const value of values) {
    if (!value.id.trim()) failures.push(issue("evidence-id-empty", step, value.id, "Record identifier is missing"));
    if (ids.has(value.id)) failures.push(issue("evidence-id-duplicate", step, value.id, "Repeated record identifier"));
    ids.add(value.id);
    if (isUnknown(value.label)) failures.push(issue("evidence-label-unknown", step, value.id, "Record label is UNKNOWN", "information"));
    if (isUnknown(value.value)) failures.push(issue("evidence-value-unknown", step, value.id, "Record value is UNKNOWN", "information"));
    if (isUnknown(value.source)) failures.push(issue("evidence-source-unknown", step, value.id, "Source is UNKNOWN", "information"));
    if (isUnknown(value.licence)) failures.push(issue("evidence-licence-unknown", step, value.id, "Licence is UNKNOWN", "information"));
    if (!isCalendarDate(value.retrievedOn)) failures.push(issue("evidence-date-unknown", step, value.id, "Retrieved-on date is UNKNOWN", "information"));
    if (isUnknown(value.tier)) failures.push(issue("evidence-tier-unknown", step, value.id, "Evidence tier is UNKNOWN", "information"));
  }
  return failures;
}
export function evidenceIdentity(value: Evidence): string {
  return `${value.id}\u0000${normalizedValue(value.source)}\u0000${normalizedValue(value.licence)}\u0000${normalizedValue(value.retrievedOn)}\u0000${normalizedValue(value.tier)}`;
}
export function provenanceChanges(before: readonly Evidence[], after: readonly Evidence[], step: number, preserve: boolean): Finding[] {
  if (!preserve) return [];
  const failures: Finding[] = [];
  const current = new Map(after.map((record) => [record.id, record]));
  for (const record of before) {
    const next = current.get(record.id);
    if (!next) {
      failures.push(issue("evidence-lost", step, record.id, "Preserving transition removed the record"));
      continue;
    }
    if (evidenceIdentity(record) !== evidenceIdentity(next)) {
      failures.push(issue("evidence-provenance-drift", step, record.id, "Source metadata changed during a preserving transition"));
    }
    if (evidenceKnown(record) && !evidenceKnown(next)) {
      failures.push(issue("evidence-degraded", step, record.id, "Previously supported record became UNKNOWN", "warning"));
    }
    if (!evidenceKnown(record) && evidenceKnown(next) && normalizedValue(record.value) === normalizedValue(next.value)) {
      failures.push(issue("evidence-upgraded-without-change", step, record.id, "Incomplete record became known without a new value", "warning"));
    }
  }
  return failures;
}
export function focusFindings(focus: FocusState, step: number): Finding[] {
  const failures: Finding[] = [];
  if (!focus.id) return failures;
  if (!focus.visible) failures.push(issue("focus-invisible", step, focus.id, "Focused control is not visible"));
  if (focus.inInertRegion) failures.push(issue("focus-inert", step, focus.id, "Focus entered inert content"));
  if (focus.width !== null && (!Number.isFinite(focus.width) || focus.width < 44)) {
    failures.push(issue("target-width", step, focus.id, "Interactive target is narrower than 44px"));
  }
  if (focus.height !== null && (!Number.isFinite(focus.height) || focus.height < 44)) {
    failures.push(issue("target-height", step, focus.id, "Interactive target is shorter than 44px"));
  }
  return failures;
}
export function screenFindings(screen: Screen, step: number): Finding[] {
  const failures: Finding[] = [];
  if (!validRoute(screen.route)) failures.push(issue("route-invalid", step, screen.route, "Unsafe route"));
  if (!screen.title.trim()) failures.push(issue("document-title-missing", step, screen.route, "Document title missing"));
  if (!screen.heading.trim()) failures.push(issue("heading-missing", step, screen.route, "First-level heading missing"));
  if (screen.mainCount !== 1) failures.push(issue("main-count", step, screen.route, "Expected exactly one main landmark"));
  if (!Number.isFinite(screen.scrollY) || screen.scrollY < 0) failures.push(issue("scroll-invalid", step, screen.route, "Scroll position must be nonnegative"));
  if (!Number.isInteger(screen.historyIndex) || screen.historyIndex < 0) failures.push(issue("history-invalid", step, screen.route, "History index must be nonnegative integer"));
  if (!Number.isFinite(screen.actionTime) || screen.actionTime < 0) failures.push(issue("time-invalid", step, screen.route, "Action time must be finite"));
  if (screen.modalId && screen.focus.id && !screen.focus.insideModal) failures.push(issue("modal-focus-escaped", step, screen.modalId, "Modal focus escaped"));
  if (screen.phase === "loading" && !screen.messages.some((message) => message.busy)) {
    failures.push(issue("loading-not-busy", step, screen.route, "Loading status has no busy announcement"));
  }
  if ((screen.phase === "empty" || screen.phase === "error") && !screen.messages.some((message) => message.text.trim() && message.politeness !== "off")) {
    failures.push(issue("outcome-silent", step, screen.route, "Empty or error outcome not announced"));
  }
  for (const message of screen.messages) {
    if (message.locale !== screen.locale) failures.push(issue("message-language", step, message.key, "Message uses the other locale"));
    if (!message.text.trim() && message.politeness !== "off") failures.push(issue("message-empty", step, message.key, "Blank live-region text"));
    if (!Number.isFinite(message.emittedAt)) failures.push(issue("message-time-invalid", step, message.key, "Invalid announcement timestamp"));
  }
  failures.push(...focusFindings(screen.focus, step));
  failures.push(...evidenceFindings(screen.evidence, step));
  return failures;
}
export function announcementChanges(before: Screen, after: Screen, step: number): Finding[] {
  const failures: Finding[] = [];
  const old = new Map(before.messages.map((message) => [message.key, message.text]));
  for (const message of after.messages) {
    if (!message.text.trim() || message.politeness === "off") continue;
    if (message.emittedAt < after.actionTime) failures.push(issue("announcement-before-action", step, message.key, "Status preceded action"));
    if (message.emittedAt - after.actionTime > 1500) failures.push(issue("announcement-delayed", step, message.key, "Status appeared later than 1.5 seconds", "warning"));
    if (old.get(message.key) === message.text && before.phase !== after.phase) {
      failures.push(issue("announcement-stale", step, message.key, "Outcome changed but announcement did not", "warning"));
    }
  }
  return failures;
}
export function transitionFindings(transition: Transition, step: number): Finding[] {
  const { kind, before, after } = transition;
  const failures: Finding[] = [];
  if (kind === "language") {
    if (before.locale === after.locale) failures.push(issue("language-not-switched", step, after.route, "Language did not change"));
    if (before.route !== after.route) failures.push(issue("language-lost-route", step, after.route, "Language change reset route"));
    if (before.query !== after.query) failures.push(issue("language-lost-query", step, after.route, "Language change reset search"));
  } else if (kind !== "navigate" && kind !== "back" && kind !== "forward") {
    if (before.route !== after.route) failures.push(issue("unexpected-route", step, after.route, "Action changed route unexpectedly"));
    if (before.locale !== after.locale) failures.push(issue("unexpected-locale", step, after.route, "Action changed locale unexpectedly"));
  }
  if (kind === "navigate") {
    if (transition.target && after.route !== transition.target) failures.push(issue("navigation-wrong-target", step, after.route, transition.target));
    if (before.route !== after.route && after.historyIndex !== before.historyIndex + 1) failures.push(issue("navigate-history", step, after.route, "New route did not advance history"));
  }
  if (kind === "back" && after.historyIndex !== Math.max(0, before.historyIndex - 1)) {
    failures.push(issue("back-history", step, after.route, "Back did not decrement history"));
  }
  if (kind === "forward" && after.historyIndex !== before.historyIndex + 1) {
    failures.push(issue("forward-history", step, after.route, "Forward did not advance history"));
  }
  if (kind === "disconnect" && after.connection !== "offline") failures.push(issue("disconnect-not-observed", step, after.route, "Offline state absent"));
  if (kind === "reconnect" && after.connection !== "online") failures.push(issue("reconnect-not-observed", step, after.route, "Connection state not restored"));
  if (kind === "retry" && before.phase !== "error" && before.phase !== "empty") failures.push(issue("retry-unavailable", step, after.route, "Retry without prior failure"));
  if (kind === "clear" && after.query.trim()) failures.push(issue("clear-query-remains", step, after.route, "Clear did not empty the query"));
  if (kind === "search" && after.phase === "idle") failures.push(issue("search-not-started", step, after.route, "Search remained idle"));
  if (kind === "open" && !after.modalId) failures.push(issue("open-no-modal", step, after.route, "Opening did not expose a modal"));
  if ((kind === "close" || kind === "escape") && after.modalId) failures.push(issue("close-modal-remains", step, after.modalId, "Modal remains open"));
  if (transition.preserveFocus && before.focus.id !== after.focus.id) failures.push(issue("focus-not-preserved", step, after.route, "Preserving action lost focus"));
  if (transition.preserveScroll && before.scrollY !== after.scrollY) failures.push(issue("scroll-not-preserved", step, after.route, "Preserving action changed scroll"));
  failures.push(...provenanceChanges(before.evidence, after.evidence, step, Boolean(transition.preserveEvidence)));
  if (transition.announce) {
    const recent = after.messages.filter((message) => message.emittedAt >= after.actionTime && message.politeness !== "off" && message.text.trim());
    if (recent.length === 0) failures.push(issue("action-unannounced", step, after.route, "Action has no new status"));
  }
  failures.push(...announcementChanges(before, after, step));
  return failures;
}
export function sameScreen(left: Screen, right: Screen): boolean {
  return left.route === right.route && left.locale === right.locale &&
    left.connection === right.connection && left.phase === right.phase &&
    left.query === right.query && left.historyIndex === right.historyIndex;
}
export function journeyFindings(journey: Journey): Finding[] {
  const failures = screenFindings(journey.initial, 0);
  let current = journey.initial;
  for (const [index, action] of journey.actions.entries()) {
    const step = index + 1;
    if (!sameScreen(current, action.before)) failures.push(issue("chain-disconnected", step, action.before.route, "Action does not start at prior outcome"));
    failures.push(...transitionFindings(action, step));
    failures.push(...screenFindings(action.after, step));
    current = action.after;
  }
  return failures;
}
export function blockingFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity === "error");
}
export function uniqueFindings(findings: readonly Finding[]): Finding[] {
  const found = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.step}|${finding.target}|${finding.code}|${finding.detail}`;
    if (found.has(key)) return false;
    found.add(key);
    return true;
  });
}
export function reportFindings(findings: readonly Finding[], limit = 40): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  const rows = uniqueFindings(findings).map((finding) =>
    `${finding.severity.toUpperCase()} ${finding.code} step=${finding.step} target=${finding.target}: ${finding.detail}`);
  const remaining = rows.length - Math.min(rows.length, limit);
  return [...rows.slice(0, limit), ...(remaining ? [`${remaining} additional findings`] : [])].join("\n");
}
export function coverageMatrix(routes: readonly string[]): { route: string; locale: Locale; width: 320 | 1280 }[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((locale) =>
    ([320, 1280] as const).map((width) => ({ route, locale, width }))));
}
export function coverageFindings(routes: readonly string[], actual: readonly { route: string; locale: Locale; width: number }[]): Finding[] {
  const failures: Finding[] = [];
  const required = coverageMatrix(routes);
  const expected = new Set(required.map((cell) => `${cell.route}|${cell.locale}|${cell.width}`));
  const observed = new Set<string>();
  for (const cell of actual) {
    const key = `${cell.route}|${cell.locale}|${cell.width}`;
    if (observed.has(key)) failures.push(issue("coverage-duplicate", 0, key, "Repeated coverage cell"));
    if (!expected.has(key)) failures.push(issue("coverage-unexpected", 0, key, "Cell is not in route inventory"));
    observed.add(key);
  }
  for (const key of expected) if (!observed.has(key)) failures.push(issue("coverage-missing", 0, key, "Route, language, or width was not audited"));
  return failures;
}
