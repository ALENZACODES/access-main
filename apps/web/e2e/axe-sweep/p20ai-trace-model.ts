/** P20AI read-only journey trace model. Values that were not observed remain UNKNOWN. */
export type Locale = "en" | "fr";
export type Connectivity = "online" | "offline" | "UNKNOWN";
export type CacheState = "available" | "missing" | "stale" | "UNKNOWN";
export type Outcome = "idle" | "pending" | "ready" | "empty" | "error" | "UNKNOWN";
export type EventKind = "navigate" | "language" | "search" | "retry" | "clear" |
  "disconnect" | "reconnect" | "back" | "forward" | "open-dialog" |
  "close-dialog" | "download" | "focus" | "announce" | "cache-change";
export type Severity = "error" | "warning" | "information";
export interface Finding { readonly code: string; readonly step: number; readonly detail: string; readonly severity: Severity; }
export interface Evidence {
  readonly id: string;
  readonly value: string | null;
  readonly source: string | null;
  readonly licence: string | null;
  readonly retrievedOn: string | null;
  readonly tier: string | null;
}
export interface AccessibilityState {
  readonly focusId: string | null;
  readonly focusVisible: boolean | null;
  readonly focusInDialog: boolean | null;
  readonly focusInsideInert: boolean | null;
  readonly targetWidth: number | null;
  readonly targetHeight: number | null;
  readonly dialogId: string | null;
  readonly mainCount: number | null;
  readonly title: string | null;
  readonly heading: string | null;
  readonly horizontalOverflow: number | null;
}
export interface StatusMessage {
  readonly id: string;
  readonly text: string;
  readonly locale: Locale;
  readonly priority: "polite" | "assertive" | "off";
  readonly busy: boolean;
  readonly issuedAt: number;
}
export interface Snapshot {
  readonly route: string;
  readonly locale: Locale;
  readonly connection: Connectivity;
  readonly cache: CacheState;
  readonly outcome: Outcome;
  readonly at: number;
  readonly historyIndex: number | null;
  readonly scrollY: number | null;
  readonly query: string;
  readonly a11y: AccessibilityState;
  readonly evidence: readonly Evidence[];
  readonly statuses: readonly StatusMessage[];
}
export interface Interaction {
  readonly id: string;
  readonly kind: EventKind;
  readonly before: Snapshot;
  readonly after: Snapshot;
  readonly expectedRoute?: string;
  readonly expectedFocus?: string;
  readonly preserveEvidence?: boolean;
  readonly preserveLocale?: boolean;
  readonly preserveQuery?: boolean;
  readonly expectedOutcome?: Outcome;
}
export interface Trace {
  readonly initial: Snapshot;
  readonly events: readonly Interaction[];
}

const UNKNOWN_TOKENS = new Set(["", "unknown", "inconnu", "inconnue", "n/a", "null", "undefined", "—", "-"]);
export function known(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && !UNKNOWN_TOKENS.has(value.trim().toLowerCase());
}
export function unknownOrText(value: string | null | undefined): string {
  return known(value) ? value!.trim().replace(/\s+/g, " ") : "UNKNOWN";
}
export function isoCalendarDate(value: string | null | undefined): boolean {
  if (value === null || value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearString, monthString, dayString] = value.split("-");
  const year = Number(yearString), month = Number(monthString), day = Number(dayString);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const time = new Date(Date.UTC(year, month - 1, day));
  return time.getUTCFullYear() === year && time.getUTCMonth() === month - 1 && time.getUTCDate() === day;
}
export function localRoute(route: string): boolean {
  if (!route.startsWith("/") || route.startsWith("//") || /[?#\\:*]/.test(route)) return false;
  if (route.split("/").some((part) => part === "." || part === "..")) return false;
  for (const character of route) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return false;
  }
  return true;
}
const finding = (code: string, step: number, detail: string, severity: Severity = "error"): Finding =>
  ({ code, step, detail, severity });
export function evidenceComplete(item: Evidence): boolean {
  return known(item.id) && known(item.value) && known(item.source) &&
    known(item.licence) && isoCalendarDate(item.retrievedOn) && known(item.tier);
}
export function evidenceKey(item: Evidence): string {
  return [item.id, unknownOrText(item.source), unknownOrText(item.licence),
    unknownOrText(item.retrievedOn), unknownOrText(item.tier)].join("\u001f");
}
export function evidenceFindings(records: readonly Evidence[], step: number): Finding[] {
  const problems: Finding[] = [];
  const seen = new Set<string>();
  for (const item of records) {
    if (!known(item.id)) problems.push(finding("evidence-id-unknown", step, "Record identifier missing"));
    if (seen.has(item.id)) problems.push(finding("evidence-id-duplicate", step, item.id));
    seen.add(item.id);
    if (!known(item.value)) problems.push(finding("evidence-value-unknown", step, item.id, "information"));
    if (!known(item.source)) problems.push(finding("evidence-source-unknown", step, item.id));
    if (!known(item.licence)) problems.push(finding("evidence-licence-unknown", step, item.id));
    if (!isoCalendarDate(item.retrievedOn)) problems.push(finding("evidence-date-unknown", step, item.id));
    if (!known(item.tier)) problems.push(finding("evidence-tier-unknown", step, item.id));
  }
  return problems;
}
export function provenanceContinuity(before: readonly Evidence[], after: readonly Evidence[], step: number): Finding[] {
  const problems: Finding[] = [];
  const indexed = new Map(after.map((item) => [item.id, item]));
  for (const previous of before) {
    const current = indexed.get(previous.id);
    if (!current) { problems.push(finding("evidence-lost", step, previous.id)); continue; }
    if (evidenceKey(previous) !== evidenceKey(current))
      problems.push(finding("evidence-source-drift", step, previous.id));
    if (known(previous.value) && !known(current.value))
      problems.push(finding("evidence-value-lost", step, previous.id));
    if (!known(previous.value) && known(current.value) && !evidenceComplete(current))
      problems.push(finding("evidence-unknown-promoted", step, previous.id));
  }
  return problems;
}
export function accessibilityFindings(state: AccessibilityState, step: number): Finding[] {
  const problems: Finding[] = [];
  if (state.mainCount !== null && state.mainCount !== 1)
    problems.push(finding("main-count", step, String(state.mainCount)));
  if (state.title !== null && !known(state.title)) problems.push(finding("title-unknown", step, "Document title"));
  if (state.heading !== null && !known(state.heading)) problems.push(finding("heading-unknown", step, "Primary heading"));
  if (state.focusId !== null) {
    if (state.focusVisible === false) problems.push(finding("focus-invisible", step, state.focusId));
    if (state.focusInsideInert === true) problems.push(finding("focus-inert", step, state.focusId));
    if (state.targetWidth !== null && (!Number.isFinite(state.targetWidth) || state.targetWidth < 44))
      problems.push(finding("target-width", step, state.focusId));
    if (state.targetHeight !== null && (!Number.isFinite(state.targetHeight) || state.targetHeight < 44))
      problems.push(finding("target-height", step, state.focusId));
  }
  if (state.dialogId !== null && state.focusInDialog === false)
    problems.push(finding("dialog-focus-outside", step, state.dialogId));
  if (state.horizontalOverflow !== null && state.horizontalOverflow > 0)
    problems.push(finding("horizontal-overflow", step, String(state.horizontalOverflow)));
  return problems;
}
export function statusFindings(snapshot: Snapshot, step: number): Finding[] {
  const problems: Finding[] = [];
  const keys = new Set<string>();
  for (const message of snapshot.statuses) {
    if (!known(message.id)) problems.push(finding("status-id-unknown", step, "Status message"));
    if (keys.has(message.id)) problems.push(finding("status-id-duplicate", step, message.id));
    keys.add(message.id);
    if (message.locale !== snapshot.locale) problems.push(finding("status-locale", step, message.id));
    if (!message.text.trim() && message.priority !== "off") problems.push(finding("status-empty", step, message.id));
    if (!Number.isFinite(message.issuedAt) || message.issuedAt < 0) problems.push(finding("status-time", step, message.id));
  }
  if (snapshot.outcome === "pending" && !snapshot.statuses.some((s) => s.busy))
    problems.push(finding("pending-no-busy-status", step, snapshot.route));
  if ((snapshot.outcome === "error" || snapshot.outcome === "empty") &&
    !snapshot.statuses.some((s) => s.priority !== "off" && known(s.text)))
    problems.push(finding("outcome-not-announced", step, snapshot.outcome));
  return problems;
}
export function snapshotFindings(snapshot: Snapshot, step: number): Finding[] {
  const problems: Finding[] = [];
  if (!localRoute(snapshot.route)) problems.push(finding("route-unsafe", step, snapshot.route));
  if (!Number.isFinite(snapshot.at) || snapshot.at < 0) problems.push(finding("snapshot-time", step, snapshot.route));
  if (snapshot.historyIndex !== null && (!Number.isInteger(snapshot.historyIndex) || snapshot.historyIndex < 0))
    problems.push(finding("history-position", step, String(snapshot.historyIndex)));
  if (snapshot.scrollY !== null && (!Number.isFinite(snapshot.scrollY) || snapshot.scrollY < 0))
    problems.push(finding("scroll-position", step, String(snapshot.scrollY)));
  if (snapshot.connection === "offline" && snapshot.cache === "UNKNOWN" && snapshot.outcome === "ready")
    problems.push(finding("offline-readiness-unsupported", step, snapshot.route));
  problems.push(...accessibilityFindings(snapshot.a11y, step));
  problems.push(...statusFindings(snapshot, step));
  problems.push(...evidenceFindings(snapshot.evidence, step));
  return problems;
}
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.route === b.route && a.locale === b.locale && a.connection === b.connection &&
    a.cache === b.cache && a.outcome === b.outcome && a.query === b.query &&
    a.a11y.dialogId === b.a11y.dialogId &&
    a.evidence.length === b.evidence.length && a.evidence.every((item, i) => {
      const other = b.evidence[i];
      return other !== undefined && evidenceKey(item) === evidenceKey(other) && item.value === other.value;
    });
}
export function interactionFindings(action: Interaction, step: number): Finding[] {
  const result: Finding[] = [];
  const { before, after, kind } = action;
  if (!known(action.id)) result.push(finding("action-id-unknown", step, kind));
  if (after.at < before.at) result.push(finding("time-reversed", step, action.id));
  if (action.expectedRoute !== undefined && after.route !== action.expectedRoute)
    result.push(finding("route-unexpected", step, after.route));
  if (action.expectedFocus !== undefined && after.a11y.focusId !== action.expectedFocus)
    result.push(finding("focus-not-restored", step, action.expectedFocus));
  if (action.expectedOutcome !== undefined && after.outcome !== action.expectedOutcome)
    result.push(finding("outcome-unexpected", step, after.outcome));
  if (action.preserveLocale && before.locale !== after.locale)
    result.push(finding("locale-lost", step, `${before.locale}/${after.locale}`));
  if (action.preserveQuery && before.query !== after.query)
    result.push(finding("query-lost", step, kind));
  if (action.preserveEvidence) result.push(...provenanceContinuity(before.evidence, after.evidence, step));
  if (kind === "language") {
    if (before.locale === after.locale) result.push(finding("language-unchanged", step, action.id));
    if (before.route !== after.route) result.push(finding("language-route-lost", step, after.route));
  } else if (kind !== "navigate" && kind !== "back" && kind !== "forward") {
    if (before.locale !== after.locale) result.push(finding("locale-changed-unexpectedly", step, kind));
    if (before.route !== after.route) result.push(finding("route-changed-unexpectedly", step, kind));
  }
  if (kind === "disconnect" && after.connection !== "offline")
    result.push(finding("disconnect-not-observed", step, after.connection));
  if (kind === "reconnect" && after.connection !== "online")
    result.push(finding("reconnect-not-observed", step, after.connection));
  if (kind === "retry" && before.outcome !== "error" && before.outcome !== "empty")
    result.push(finding("retry-without-failure", step, before.outcome));
  if (kind === "search" && after.outcome === "idle") result.push(finding("search-no-change", step, after.route));
  if (kind === "clear" && after.query !== "") result.push(finding("clear-query-remains", step, after.query));
  if (kind === "open-dialog" && after.a11y.dialogId === null)
    result.push(finding("dialog-did-not-open", step, action.id));
  if (kind === "close-dialog" && after.a11y.dialogId !== null)
    result.push(finding("dialog-did-not-close", step, action.id));
  if (kind === "back" && before.historyIndex !== null && after.historyIndex !== null &&
    after.historyIndex >= before.historyIndex) result.push(finding("back-history-order", step, action.id));
  if (kind === "forward" && before.historyIndex !== null && after.historyIndex !== null &&
    after.historyIndex <= before.historyIndex) result.push(finding("forward-history-order", step, action.id));
  return result;
}
export function traceFindings(trace: Trace): Finding[] {
  const result = snapshotFindings(trace.initial, 0);
  const seen = new Set<string>();
  let last = trace.initial;
  for (const [index, event] of trace.events.entries()) {
    const step = index + 1;
    if (seen.has(event.id)) result.push(finding("action-id-duplicate", step, event.id));
    seen.add(event.id);
    if (!sameSnapshot(last, event.before)) result.push(finding("trace-disconnected", step, event.id));
    result.push(...interactionFindings(event, step), ...snapshotFindings(event.after, step));
    last = event.after;
  }
  return result;
}
export function summarizeFindings(items: readonly Finding[], limit = 30): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  const rows = [...new Set(items.map((item) => `${item.step} ${item.code}: ${item.detail}`))];
  const remainder = rows.length - Math.min(limit, rows.length);
  return [...rows.slice(0, limit), ...(remainder ? [`${remainder} additional findings`] : [])].join("\n");
}
export function blockingFindings(items: readonly Finding[]): Finding[] {
  return items.filter((item) => item.severity === "error");
}
export function issueCodes(items: readonly Finding[]): string[] { return items.map((item) => item.code); }
export function distinctFindings(items: readonly Finding[]): Finding[] {
  const keys = new Set<string>();
  return items.filter((item) => {
    const key = `${item.step}|${item.code}|${item.detail}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}
