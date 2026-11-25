/** P20AF read-only journey ledger. It reports observed state; UNKNOWN remains unresolved. */
export type Locale = "en" | "fr";
export type Connection = "online" | "offline" | "unknown";
export type Result = "idle" | "loading" | "ready" | "empty" | "error" | "unknown";
export type Cache = "available" | "missing" | "stale" | "unknown";
export type Action = "visit" | "search" | "clear" | "retry" | "download" | "disconnect" | "reconnect" | "back" | "forward" | "locale" | "open" | "close";
export type Severity = "error" | "warning" | "information";
export interface Problem { code: string; severity: Severity; at: number; detail: string; }
export interface Provenance { source: string | null; licence: string | null; retrievedOn: string | null; tier: string | null; }
export interface Fact { id: string; value: string | null; provenance: Provenance; }
export interface Focus { id: string | null; visible: boolean | null; inert: boolean | null; withinDialog: boolean | null; width: number | null; height: number | null; }
export interface StatusMessage { id: string; text: string; locale: Locale | "unknown"; live: "polite" | "assertive" | "off" | "unknown"; busy: boolean | null; }
export interface State {
  route: string;
  locale: Locale;
  connection: Connection;
  cache: Cache;
  result: Result;
  heading: string;
  title: string;
  mains: number;
  focus: Focus;
  facts: readonly Fact[];
  messages: readonly StatusMessage[];
  dialog: string | null;
  history: number | null;
  scrollY: number | null;
  clock: number | null;
}
export interface Step {
  action: Action;
  before: State;
  after: State;
  expectedRoute?: string;
  requireFocus?: boolean;
  preserveFacts?: boolean;
  allowUnknown?: boolean;
}
export interface Trace { initial: State; steps: readonly Step[]; }
const problem = (code: string, at: number, detail: string, severity: Severity = "error"): Problem => ({ code, severity, at, detail });
const unknownTokens = new Set(["", "unknown", "inconnu", "inconnue", "—", "-", "n/a", "null", "undefined"]);
export function normalized(value: string | null | undefined): string {
  if (value == null || unknownTokens.has(value.trim().toLowerCase())) return "UNKNOWN";
  return value.trim().replace(/\s+/g, " ");
}
export function dateIsValid(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0]; const month = parts[1]; const day = parts[2];
  if (!year || !month || !day || month > 12 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}
export function safeRoute(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[?#*:]/.test(path)) return false;
  if (path.split("/").some((part) => part === "." || part === "..")) return false;
  for (const character of path) if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) return false;
  return true;
}
export function knownFact(fact: Fact): boolean {
  return Boolean(fact.id.trim()) && normalized(fact.value) !== "UNKNOWN" &&
    normalized(fact.provenance.source) !== "UNKNOWN" && normalized(fact.provenance.licence) !== "UNKNOWN" &&
    normalized(fact.provenance.tier) !== "UNKNOWN" && dateIsValid(fact.provenance.retrievedOn);
}
export function factFindings(facts: readonly Fact[], at: number): Problem[] {
  const issues: Problem[] = [];
  const ids = new Set<string>();
  for (const fact of facts) {
    if (!fact.id.trim()) issues.push(problem("fact-id-empty", at, "Record identifier is empty"));
    if (ids.has(fact.id)) issues.push(problem("fact-id-duplicate", at, fact.id));
    ids.add(fact.id);
    if (normalized(fact.value) !== "UNKNOWN" && !knownFact(fact)) issues.push(problem("fact-unsupported-known", at, fact.id));
    if (normalized(fact.value) === "UNKNOWN") issues.push(problem("fact-value-unknown", at, fact.id, "information"));
    if (normalized(fact.provenance.source) === "UNKNOWN") issues.push(problem("fact-source-unknown", at, fact.id, "information"));
    if (normalized(fact.provenance.licence) === "UNKNOWN") issues.push(problem("fact-licence-unknown", at, fact.id, "information"));
    if (normalized(fact.provenance.tier) === "UNKNOWN") issues.push(problem("fact-tier-unknown", at, fact.id, "information"));
    if (!dateIsValid(fact.provenance.retrievedOn)) issues.push(problem("fact-date-unknown", at, fact.id, "information"));
  }
  return issues;
}
export function focusFindings(focus: Focus, at: number): Problem[] {
  const issues: Problem[] = [];
  if (focus.id === null) return issues;
  if (focus.visible === false) issues.push(problem("focus-hidden", at, focus.id));
  if (focus.visible === null) issues.push(problem("focus-visibility-unknown", at, focus.id, "information"));
  if (focus.inert === true) issues.push(problem("focus-inert", at, focus.id));
  for (const [name, size] of [["width", focus.width], ["height", focus.height]] as const) {
    if (size === null) issues.push(problem(`focus-${name}-unknown`, at, focus.id, "information"));
    else if (!Number.isFinite(size) || size < 44) issues.push(problem(`focus-${name}-small`, at, focus.id));
  }
  return issues;
}
export function announcementFindings(messages: readonly StatusMessage[], locale: Locale, at: number): Problem[] {
  const issues: Problem[] = [];
  const ids = new Set<string>();
  for (const message of messages) {
    if (!message.id.trim()) issues.push(problem("message-id-empty", at, "An announcement has no id"));
    if (ids.has(message.id)) issues.push(problem("message-id-duplicate", at, message.id));
    ids.add(message.id);
    if (message.locale !== locale) issues.push(problem("message-language", at, message.id));
    if (message.live !== "off" && !message.text.trim()) issues.push(problem("message-blank", at, message.id));
    if (message.live === "unknown") issues.push(problem("message-live-unknown", at, message.id, "information"));
  }
  return issues;
}
export function stateFindings(state: State, at: number): Problem[] {
  const issues: Problem[] = [];
  if (!safeRoute(state.route)) issues.push(problem("route-invalid", at, state.route));
  if (!state.heading.trim()) issues.push(problem("heading-empty", at, state.route));
  if (!state.title.trim()) issues.push(problem("title-empty", at, state.route));
  if (state.mains !== 1) issues.push(problem("main-count", at, String(state.mains)));
  if (state.history !== null && (!Number.isInteger(state.history) || state.history < 0)) issues.push(problem("history-invalid", at, String(state.history)));
  if (state.scrollY !== null && (!Number.isFinite(state.scrollY) || state.scrollY < 0)) issues.push(problem("scroll-invalid", at, String(state.scrollY)));
  if (state.clock !== null && (!Number.isFinite(state.clock) || state.clock < 0)) issues.push(problem("time-invalid", at, String(state.clock)));
  if (state.dialog !== null && state.focus.withinDialog === false) issues.push(problem("dialog-focus-outside", at, state.dialog));
  if (state.result === "loading" && !state.messages.some((message) => message.busy === true)) issues.push(problem("loading-not-busy", at, state.route));
  if ((state.result === "error" || state.result === "empty") && !state.messages.some((message) => message.live !== "off" && message.text.trim())) issues.push(problem("outcome-silent", at, state.route));
  if (state.connection === "offline" && state.cache === "unknown") issues.push(problem("offline-cache-unknown", at, state.route, "information"));
  issues.push(...focusFindings(state.focus, at), ...factFindings(state.facts, at), ...announcementFindings(state.messages, state.locale, at));
  return issues;
}
function sameProvenance(left: Fact, right: Fact): boolean {
  return left.provenance.source === right.provenance.source && left.provenance.licence === right.provenance.licence &&
    left.provenance.retrievedOn === right.provenance.retrievedOn && left.provenance.tier === right.provenance.tier;
}
export function preservationFindings(before: readonly Fact[], after: readonly Fact[], at: number): Problem[] {
  const issues: Problem[] = [];
  const present = new Map(after.map((fact) => [fact.id, fact]));
  for (const fact of before) {
    const current = present.get(fact.id);
    if (!current) issues.push(problem("fact-lost", at, fact.id));
    else if (!sameProvenance(fact, current)) issues.push(problem("fact-provenance-changed", at, fact.id));
    else if (knownFact(current) && !knownFact(fact)) issues.push(problem("fact-unknown-promoted", at, fact.id));
  }
  return issues;
}
export function stepFindings(step: Step, at: number): Problem[] {
  const issues: Problem[] = [];
  const { before, after } = step;
  const navigates = ["visit", "back", "forward"].includes(step.action);
  if (step.action === "locale") {
    if (before.locale === after.locale) issues.push(problem("locale-not-changed", at, after.locale));
    if (before.route !== after.route) issues.push(problem("locale-route-reset", at, after.route));
  } else if (!navigates && before.locale !== after.locale) issues.push(problem("locale-unexpected", at, after.locale));
  if (!navigates && before.route !== after.route) issues.push(problem("route-unexpected", at, after.route));
  if (step.expectedRoute && after.route !== step.expectedRoute) issues.push(problem("route-target-mismatch", at, after.route));
  if (step.action === "disconnect" && after.connection !== "offline") issues.push(problem("disconnect-unobserved", at, after.connection));
  if (step.action === "reconnect" && after.connection !== "online") issues.push(problem("reconnect-unobserved", at, after.connection));
  if (step.action === "retry" && before.result !== "error" && before.result !== "empty") issues.push(problem("retry-without-error", at, before.result));
  if (step.action === "clear" && after.result === "loading") issues.push(problem("clear-triggered-load", at, after.result));
  if (step.action === "close" && after.dialog !== null) issues.push(problem("dialog-did-not-close", at, after.dialog));
  if (step.action === "open" && after.dialog === null) issues.push(problem("dialog-did-not-open", at, before.route));
  if (step.requireFocus && before.focus.id !== after.focus.id) issues.push(problem("focus-not-preserved", at, `${before.focus.id} → ${after.focus.id}`));
  if (step.preserveFacts) issues.push(...preservationFindings(before.facts, after.facts, at));
  if (before.clock !== null && after.clock !== null && after.clock < before.clock) issues.push(problem("time-reversed", at, String(after.clock)));
  if (step.action === "back" && before.history !== null && after.history !== null && after.history >= before.history) issues.push(problem("back-history", at, String(after.history)));
  if (step.action === "forward" && before.history !== null && after.history !== null && after.history <= before.history) issues.push(problem("forward-history", at, String(after.history)));
  return issues;
}
export function sameBoundary(left: State, right: State): boolean {
  return left.route === right.route && left.locale === right.locale && left.connection === right.connection &&
    left.result === right.result && left.cache === right.cache && left.history === right.history;
}
export function traceFindings(trace: Trace): Problem[] {
  const issues = stateFindings(trace.initial, 0);
  let previous = trace.initial;
  trace.steps.forEach((step, index) => {
    if (!sameBoundary(previous, step.before)) issues.push(problem("trace-disconnected", index + 1, step.before.route));
    issues.push(...stepFindings(step, index + 1), ...stateFindings(step.after, index + 1));
    previous = step.after;
  });
  return issues;
}
export function blocking(issues: readonly Problem[]): Problem[] { return issues.filter((item) => item.severity === "error"); }
export function summarize(issues: readonly Problem[], limit = 30): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  const unique = [...new Set(issues.map((item) => `${item.code} step=${item.at}: ${item.detail}`))];
  const remaining = Math.max(0, unique.length - limit);
  return [...unique.slice(0, limit), ...(remaining ? [`${remaining} further findings`] : [])].join("\n");
}
export interface Cell { route: string; locale: Locale; width: 320 | 1280; connection: "online" | "offline"; }
export function matrix(routes: readonly string[]): Cell[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((locale) => ([320, 1280] as const).flatMap((width) =>
    (["online", "offline"] as const).map((connection) => ({ route, locale, width, connection })))));
}
export function cellKey(cell: Cell): string { return `${cell.route}|${cell.locale}|${cell.width}|${cell.connection}`; }
export function matrixFindings(expected: readonly Cell[], actual: readonly Cell[]): Problem[] {
  const issues: Problem[] = [];
  const wanted = new Set(expected.map(cellKey));
  const seen = new Set<string>();
  for (const cell of actual) {
    const key = cellKey(cell);
    if (seen.has(key)) issues.push(problem("matrix-duplicate", 0, key));
    seen.add(key);
    if (!wanted.has(key)) issues.push(problem("matrix-unexpected", 0, key));
  }
  for (const key of wanted) if (!seen.has(key)) issues.push(problem("matrix-missing", 0, key));
  return issues;
}
