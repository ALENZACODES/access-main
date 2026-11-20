/** P20AL: deterministic, read-only offline journey evidence contracts. */
export type Locale = "en" | "fr";
export type Knowledge = "KNOWN" | "UNKNOWN";
export type Network = "online" | "offline" | "UNKNOWN";
export type CacheState = "present" | "missing" | "stale" | "UNKNOWN";
export type Outcome = "ready" | "loading" | "empty" | "error" | "offline" | "UNKNOWN";
export type Intent = "navigate" | "search" | "retry" | "disconnect" | "reconnect" | "language" | "back" | "forward" | "export" | "dismiss";
export type Severity = "error" | "warning" | "information";
export interface Finding {
  readonly code: string;
  readonly severity: Severity;
  readonly scope: string;
  readonly detail: string;
}
export interface SourceRecord {
  readonly id: string;
  readonly title: string;
  readonly value: string | null;
  readonly source: string | null;
  readonly licence: string | null;
  readonly retrievedOn: string | null;
  readonly tier: string | null;
  readonly state: Knowledge;
}
export interface CacheRecord {
  readonly key: string;
  readonly state: CacheState;
  readonly byteLength: number | null;
  readonly observedAt: number | null;
  readonly source: string | null;
  readonly licence: string | null;
}
export interface FocusRecord {
  readonly key: string | null;
  readonly role: string | null;
  readonly name: string | null;
  readonly visible: boolean | null;
  readonly inert: boolean | null;
  readonly withinDialog: boolean | null;
  readonly bounds: Rect | null;
}
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface Announcement {
  readonly key: string;
  readonly text: string;
  readonly language: Locale | "UNKNOWN";
  readonly kind: "polite" | "assertive" | "off" | "UNKNOWN";
  readonly busy: boolean | null;
  readonly at: number | null;
}
export interface Screen {
  readonly route: string;
  readonly locale: Locale;
  readonly network: Network;
  readonly cache: CacheState;
  readonly outcome: Outcome;
  readonly title: string;
  readonly heading: string;
  readonly mainCount: number;
  readonly historyIndex: number | null;
  readonly scrollY: number | null;
  readonly focus: FocusRecord;
  readonly dialogOpen: boolean | null;
  readonly records: readonly SourceRecord[];
  readonly resources: readonly CacheRecord[];
  readonly announcements: readonly Announcement[];
}
export interface Step {
  readonly id: string;
  readonly intent: Intent;
  readonly before: Screen;
  readonly after: Screen;
  readonly expectedRoute: string | null;
  readonly preservesRecords: boolean;
  readonly preservesFocus: boolean;
  readonly actionAt: number | null;
}
export interface Replay {
  readonly start: Screen;
  readonly steps: readonly Step[];
}
export const UNKNOWN = "UNKNOWN" as const;
const missingStrings = new Set(["", "unknown", "inconnu", "inconnue", "n/a", "na", "none", "null", "undefined", "—", "-"]);
export function valueOrUnknown(value: string | null | undefined): string {
  if (value === undefined || value === null) return UNKNOWN;
  const normalized = value.trim().replace(/\s+/g, " ");
  return missingStrings.has(normalized.toLowerCase()) ? UNKNOWN : normalized;
}
export function isUnknown(value: string | null | undefined): boolean {
  return valueOrUnknown(value) === UNKNOWN;
}
export function calendarDate(value: string | null): boolean {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const pieces = value.split("-").map(Number);
  const year = pieces[0];
  const month = pieces[1];
  const day = pieces[2];
  if (year === undefined || month === undefined || day === undefined || year < 1 || month < 1 || day < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function safePath(route: string): boolean {
  if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\")) return false;
  if (route.includes("?") || route.includes("#") || route.includes(":") || route.includes("*")) return false;
  if (route.split("/").some((part) => part === ".." || part === ".")) return false;
  for (const char of route) {
    if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return false;
  }
  return true;
}
export const finding = (code: string, scope: string, detail: string, severity: Severity = "error"): Finding => ({ code, scope, detail, severity });
export function sourceKnown(record: SourceRecord): boolean {
  return !isUnknown(record.title) && !isUnknown(record.value) && !isUnknown(record.source) &&
    !isUnknown(record.licence) && !isUnknown(record.tier) && calendarDate(record.retrievedOn);
}
export function sourceIdentity(record: SourceRecord): string {
  return [record.id, valueOrUnknown(record.source), valueOrUnknown(record.licence),
    valueOrUnknown(record.retrievedOn), valueOrUnknown(record.tier)].join("\u001f");
}
export function recordFindings(records: readonly SourceRecord[], scope: string): Finding[] {
  const result: Finding[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    const target = `${scope}/${record.id || "UNKNOWN"}`;
    if (!record.id.trim()) result.push(finding("record-id-missing", target, "Record has no identifier"));
    if (ids.has(record.id)) result.push(finding("record-id-duplicate", target, "Identifier occurs more than once"));
    ids.add(record.id);
    if (isUnknown(record.title)) result.push(finding("record-title-unknown", target, UNKNOWN, "information"));
    if (isUnknown(record.source)) result.push(finding("record-source-unknown", target, UNKNOWN, "information"));
    if (isUnknown(record.licence)) result.push(finding("record-licence-unknown", target, UNKNOWN, "information"));
    if (isUnknown(record.tier)) result.push(finding("record-tier-unknown", target, UNKNOWN, "information"));
    if (!calendarDate(record.retrievedOn)) result.push(finding("record-date-unknown", target, UNKNOWN, "information"));
    if (record.state === "KNOWN" && !sourceKnown(record)) result.push(finding("record-unsupported-known", target, "KNOWN requires complete provenance"));
    if (record.state === "UNKNOWN" && sourceKnown(record)) result.push(finding("record-explicit-unknown", target, "Explicit UNKNOWN retained", "information"));
  }
  return result;
}
export function provenanceDrift(before: readonly SourceRecord[], after: readonly SourceRecord[], scope: string): Finding[] {
  const next = new Map(after.map((record) => [record.id, record]));
  const result: Finding[] = [];
  for (const record of before) {
    const current = next.get(record.id);
    if (!current) {
      result.push(finding("record-lost", scope, record.id));
      continue;
    }
    if (sourceIdentity(current) !== sourceIdentity(record)) result.push(finding("provenance-changed", scope, record.id));
    if (record.state === "UNKNOWN" && current.state === "KNOWN" && !sourceKnown(current)) {
      result.push(finding("unknown-promoted", scope, record.id));
    }
  }
  return result;
}
export function cacheFindings(records: readonly CacheRecord[], scope: string, entryLimit = 524288): Finding[] {
  const result: Finding[] = [];
  const keys = new Set<string>();
  for (const record of records) {
    if (!record.key.trim()) result.push(finding("cache-key-empty", scope, UNKNOWN));
    if (keys.has(record.key)) result.push(finding("cache-key-duplicate", scope, record.key));
    keys.add(record.key);
    if (record.byteLength !== null && (!Number.isSafeInteger(record.byteLength) || record.byteLength < 0)) result.push(finding("cache-bytes-invalid", scope, record.key));
    if (record.byteLength !== null && record.byteLength > entryLimit) result.push(finding("cache-entry-budget", scope, record.key));
    if (record.state === "present" && record.byteLength === null) result.push(finding("cache-present-unmeasured", scope, record.key));
    if (record.state === "present" && record.observedAt === null) result.push(finding("cache-present-unobserved", scope, record.key));
    if (record.state === "present" && isUnknown(record.source)) result.push(finding("cache-source-unknown", scope, record.key, "information"));
    if (record.state === "present" && isUnknown(record.licence)) result.push(finding("cache-licence-unknown", scope, record.key, "information"));
    if (record.observedAt !== null && (!Number.isFinite(record.observedAt) || record.observedAt < 0)) result.push(finding("cache-time-invalid", scope, record.key));
  }
  return result;
}
export function focusFindings(focus: FocusRecord, scope: string): Finding[] {
  const result: Finding[] = [];
  if (focus.key === null) return result;
  if (focus.visible === false) result.push(finding("focus-hidden", scope, focus.key));
  if (focus.inert === true) result.push(finding("focus-inert", scope, focus.key));
  if (isUnknown(focus.name)) result.push(finding("focus-name-unknown", scope, focus.key));
  if (focus.bounds === null) {
    result.push(finding("focus-bounds-unknown", scope, focus.key, "information"));
  } else {
    const { width, height, x, y } = focus.bounds;
    if (![width, height, x, y].every(Number.isFinite)) result.push(finding("focus-bounds-invalid", scope, focus.key));
    if (Number.isFinite(width) && width < 44) result.push(finding("focus-width", scope, focus.key));
    if (Number.isFinite(height) && height < 44) result.push(finding("focus-height", scope, focus.key));
  }
  return result;
}
export function announcementFindings(messages: readonly Announcement[], locale: Locale, scope: string): Finding[] {
  const result: Finding[] = [];
  const ids = new Set<string>();
  for (const message of messages) {
    if (ids.has(message.key)) result.push(finding("announcement-key-duplicate", scope, message.key));
    ids.add(message.key);
    if (message.kind !== "off" && isUnknown(message.text)) result.push(finding("announcement-blank", scope, message.key));
    if (message.language !== locale) result.push(finding("announcement-language", scope, message.key));
    if (message.at !== null && (!Number.isFinite(message.at) || message.at < 0)) result.push(finding("announcement-time-invalid", scope, message.key));
  }
  return result;
}
export function screenFindings(screen: Screen): Finding[] {
  const result: Finding[] = [];
  if (!safePath(screen.route)) result.push(finding("route-invalid", screen.route, "Unsafe route"));
  if (!screen.title.trim()) result.push(finding("title-missing", screen.route, UNKNOWN));
  if (!screen.heading.trim()) result.push(finding("heading-missing", screen.route, UNKNOWN));
  if (screen.mainCount !== 1) result.push(finding("main-count", screen.route, `${screen.mainCount}`));
  if (screen.scrollY !== null && (!Number.isFinite(screen.scrollY) || screen.scrollY < 0)) result.push(finding("scroll-invalid", screen.route, `${screen.scrollY}`));
  if (screen.historyIndex !== null && (!Number.isSafeInteger(screen.historyIndex) || screen.historyIndex < 0)) result.push(finding("history-invalid", screen.route, `${screen.historyIndex}`));
  if (screen.dialogOpen === true && screen.focus.withinDialog === false) result.push(finding("dialog-focus-escaped", screen.route, "Focus left modal"));
  if (screen.outcome === "ready" && screen.network === "offline" && screen.cache !== "present") result.push(finding("offline-ready-without-cache", screen.route, "Cache status does not support ready outcome"));
  if (screen.outcome === "loading" && !screen.announcements.some((item) => item.busy === true)) result.push(finding("loading-not-busy", screen.route, "Missing busy status"));
  if (screen.outcome === "error" && !screen.announcements.some((item) => item.kind !== "off" && !isUnknown(item.text))) result.push(finding("error-silent", screen.route, "Missing user-facing error"));
  result.push(...focusFindings(screen.focus, screen.route));
  result.push(...recordFindings(screen.records, screen.route));
  result.push(...cacheFindings(screen.resources, screen.route));
  result.push(...announcementFindings(screen.announcements, screen.locale, screen.route));
  return result;
}
export function stepFindings(step: Step): Finding[] {
  const result: Finding[] = [];
  const scope = step.id;
  if (!step.id.trim()) result.push(finding("step-id-empty", UNKNOWN, "No step identifier"));
  if (step.intent === "language") {
    if (step.after.locale === step.before.locale) result.push(finding("language-not-changed", scope, step.before.locale));
    if (step.after.route !== step.before.route) result.push(finding("language-route-reset", scope, step.after.route));
  } else if (step.after.locale !== step.before.locale) result.push(finding("unexpected-language-change", scope, step.after.locale));
  if (step.intent === "disconnect" && step.after.network !== "offline") result.push(finding("disconnect-not-observed", scope, step.after.network));
  if (step.intent === "reconnect" && step.after.network !== "online") result.push(finding("reconnect-not-observed", scope, step.after.network));
  if (step.intent === "retry" && step.before.outcome !== "error" && step.before.outcome !== "offline") result.push(finding("retry-without-error", scope, step.before.outcome));
  if (step.intent === "search" && step.after.outcome === "UNKNOWN") result.push(finding("search-outcome-unknown", scope, UNKNOWN, "information"));
  if (step.intent === "navigate" && step.expectedRoute !== null && step.after.route !== step.expectedRoute) result.push(finding("destination-mismatch", scope, step.after.route));
  if (!["navigate", "back", "forward", "language"].includes(step.intent) && step.after.route !== step.before.route) result.push(finding("unexpected-route-change", scope, step.after.route));
  if (step.preservesRecords) result.push(...provenanceDrift(step.before.records, step.after.records, scope));
  if (step.preservesFocus && step.before.focus.key !== step.after.focus.key) result.push(finding("focus-not-restored", scope, valueOrUnknown(step.after.focus.key)));
  if (step.actionAt !== null && (!Number.isFinite(step.actionAt) || step.actionAt < 0)) result.push(finding("action-time-invalid", scope, UNKNOWN));
  return result;
}
export function screenSignature(screen: Screen): string {
  return [screen.route, screen.locale, screen.network, screen.cache, screen.outcome].join("|");
}
export function replayFindings(replay: Replay): Finding[] {
  const result = screenFindings(replay.start);
  let previous = replay.start;
  const ids = new Set<string>();
  for (const step of replay.steps) {
    if (ids.has(step.id)) result.push(finding("step-id-duplicate", step.id, "Repeated step identifier"));
    ids.add(step.id);
    if (screenSignature(previous) !== screenSignature(step.before)) result.push(finding("replay-chain-broken", step.id, "Previous screen differs"));
    result.push(...stepFindings(step));
    result.push(...screenFindings(step.after));
    previous = step.after;
  }
  return result;
}
export function distinctFindings(items: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [item.code, item.severity, item.scope, item.detail].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function reportFindings(items: readonly Finding[], limit = 30): string {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Limit must be a positive integer");
  const rows = distinctFindings(items).map((item) => `${item.severity} ${item.code} [${item.scope}]: ${item.detail}`);
  const remainder = Math.max(0, rows.length - limit);
  return [...rows.slice(0, limit), ...(remainder ? [`${remainder} additional findings`] : [])].join("\n");
}
export function blockingFindings(items: readonly Finding[]): Finding[] {
  return items.filter((item) => item.severity === "error");
}
