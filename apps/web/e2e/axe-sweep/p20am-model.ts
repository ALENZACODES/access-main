/** P20AM: observations are evidence about the UI, never evidence about a place. */
export type Language = "en" | "fr";
export type Knowledge = "KNOWN" | "UNKNOWN";
export type Connection = "online" | "offline" | "UNKNOWN";
export type CacheState = "present" | "absent" | "stale" | "UNKNOWN";
export type Outcome = "idle" | "loading" | "ready" | "empty" | "error" | "fallback";
export type ActionKind = "navigate" | "back" | "forward" | "language" | "disconnect" | "reconnect" |
  "search" | "clear" | "retry" | "open" | "close" | "download" | "restore";
export type Severity = "error" | "warning" | "information";
export interface Finding {
  readonly rule: string;
  readonly step: number;
  readonly severity: Severity;
  readonly detail: string;
}
export interface SourceRecord {
  readonly id: string;
  readonly label: string | null;
  readonly value: string | null;
  readonly source: string | null;
  readonly licence: string | null;
  readonly retrievedOn: string | null;
  readonly tier: string | null;
  readonly declared: Knowledge;
}
export interface Control {
  readonly id: string;
  readonly name: string | null;
  readonly role: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly inert: boolean;
  readonly tabIndex: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly focusVisible: boolean | null;
  readonly parentDialog: string | null;
}
export interface Announcement {
  readonly id: string;
  readonly text: string;
  readonly language: Language;
  readonly politeness: "polite" | "assertive" | "off";
  readonly busy: boolean;
  readonly eventAt: number | null;
}
export interface Resource {
  readonly path: string;
  readonly cached: CacheState;
  readonly bytes: number | null;
  readonly network: "succeeded" | "failed" | "not-attempted" | "UNKNOWN";
  readonly fallback: string | null;
  readonly required: boolean;
}
export interface Screen {
  readonly route: string;
  readonly language: Language;
  readonly title: string;
  readonly heading: string;
  readonly mainCount: number;
  readonly outcome: Outcome;
  readonly connection: Connection;
  readonly focusId: string | null;
  readonly activeDialog: string | null;
  readonly controls: readonly Control[];
  readonly announcements: readonly Announcement[];
  readonly records: readonly SourceRecord[];
  readonly resources: readonly Resource[];
  readonly historyIndex: number | null;
  readonly scrollY: number | null;
  readonly capturedAt: number | null;
}
export interface Action {
  readonly kind: ActionKind;
  readonly before: Screen;
  readonly after: Screen;
  readonly targetRoute: string | null;
  readonly targetFocus: string | null;
  readonly preserveRecords: boolean;
  readonly preserveFocus: boolean;
  readonly actionAt: number | null;
}
export interface Trace {
  readonly id: string;
  readonly initial: Screen;
  readonly actions: readonly Action[];
}
export interface CoverageCell {
  readonly route: string;
  readonly language: Language;
  readonly width: 320 | 1280;
  readonly connection: Connection;
}
export const UNKNOWN = "UNKNOWN" as const;
export const LANGUAGES: readonly Language[] = ["en", "fr"];
export const WIDTHS = [320, 1280] as const;
export const MAX_PRECACHE_FILE_BYTES = 524_288;
export const MAX_PRECACHE_TOTAL_BYTES = 8 * 1024 * 1024;
const markers = new Set(["", "unknown", "inconnu", "inconnue", "n/a", "—", "-", "null", "undefined"]);
export function textOrUnknown(value: string | null | undefined): string {
  if (value == null) return UNKNOWN;
  const clean = value.replace(/\s+/g, " ").trim();
  return markers.has(clean.toLowerCase()) ? UNKNOWN : clean;
}
export function known(value: string | null | undefined): boolean {
  return textOrUnknown(value) !== UNKNOWN;
}
export function calendarDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const pieces = value.split("-").map(Number);
  const year = pieces[0]; const month = pieces[1]; const day = pieces[2];
  if (year === undefined || month === undefined || day === undefined || year < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
export function safeRoute(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || /[?#\\:*]/.test(value)) return false;
  if (value.split("/").some((segment) => segment === "." || segment === "..")) return false;
  for (const character of value) {
    if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) return false;
  }
  return true;
}
export function canonicalRoute(value: string): string | null {
  if (!safeRoute(value)) return null;
  return value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;
}
export function finding(rule: string, step: number, detail: string, severity: Severity = "error"): Finding {
  return { rule, step, detail, severity };
}
export function recordKnown(record: SourceRecord): boolean {
  return Boolean(record.id.trim()) && known(record.label) && known(record.value) &&
    known(record.source) && known(record.licence) && known(record.tier) && calendarDate(record.retrievedOn);
}
export function recordIdentity(record: SourceRecord): string {
  return JSON.stringify([record.id, textOrUnknown(record.source), textOrUnknown(record.licence),
    textOrUnknown(record.retrievedOn), textOrUnknown(record.tier), textOrUnknown(record.value)]);
}
export function recordFindings(records: readonly SourceRecord[], step = 0): Finding[] {
  const issues: Finding[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    if (!record.id.trim()) issues.push(finding("record-id-empty", step, "Record has no identifier"));
    if (ids.has(record.id)) issues.push(finding("record-id-duplicate", step, record.id));
    ids.add(record.id);
    if (!known(record.label)) issues.push(finding("record-label-UNKNOWN", step, record.id, "information"));
    if (!known(record.value)) issues.push(finding("record-value-UNKNOWN", step, record.id, "information"));
    if (!known(record.source)) issues.push(finding("record-source-UNKNOWN", step, record.id, "information"));
    if (!known(record.licence)) issues.push(finding("record-licence-UNKNOWN", step, record.id, "information"));
    if (!calendarDate(record.retrievedOn)) issues.push(finding("record-date-UNKNOWN", step, record.id, "information"));
    if (!known(record.tier)) issues.push(finding("record-tier-UNKNOWN", step, record.id, "information"));
    if (record.declared === "KNOWN" && !recordKnown(record)) {
      issues.push(finding("record-known-overclaim", step, record.id));
    }
    if (record.declared === "UNKNOWN" && recordKnown(record)) {
      issues.push(finding("record-understated", step, record.id, "information"));
    }
  }
  return issues;
}
export function continuityFindings(before: readonly SourceRecord[], after: readonly SourceRecord[], step: number): Finding[] {
  const issues: Finding[] = [];
  const next = new Map(after.map((record) => [record.id, record]));
  for (const record of before) {
    const updated = next.get(record.id);
    if (!updated) {
      issues.push(finding("record-lost", step, record.id));
      continue;
    }
    if (recordIdentity(record) !== recordIdentity(updated)) {
      issues.push(finding("record-provenance-or-value-changed", step, record.id));
    }
    if (record.declared === "UNKNOWN" && updated.declared === "KNOWN" && !recordKnown(updated)) {
      issues.push(finding("record-UNKNOWN-promoted", step, record.id));
    }
  }
  return issues;
}
export function screenIdentity(screen: Screen): string {
  return JSON.stringify([screen.route, screen.language, screen.connection, screen.outcome,
    screen.records.map(recordIdentity).sort()]);
}
export function sameScreen(a: Screen, b: Screen): boolean {
  return screenIdentity(a) === screenIdentity(b);
}
export function sampleRecord(changes: Partial<SourceRecord> = {}): SourceRecord {
  return { id: "example", label: "Example", value: "UNKNOWN", source: "Example source",
    licence: "Example licence", retrievedOn: "2026-11-20", tier: "E", declared: "UNKNOWN", ...changes };
}
export function sampleControl(changes: Partial<Control> = {}): Control {
  return { id: "search", name: "Search", role: "button", visible: true, disabled: false,
    inert: false, tabIndex: 0, width: 44, height: 44, focusVisible: true, parentDialog: null, ...changes };
}
export function sampleAnnouncement(changes: Partial<Announcement> = {}): Announcement {
  return { id: "status", text: "Ready", language: "en", politeness: "polite",
    busy: false, eventAt: 100, ...changes };
}
export function sampleResource(changes: Partial<Resource> = {}): Resource {
  return { path: "/assets/main.js", cached: "present", bytes: 2048, network: "not-attempted",
    fallback: null, required: true, ...changes };
}
export function sampleScreen(changes: Partial<Screen> = {}): Screen {
  return { route: "/journey", language: "en", title: "Journey", heading: "Journey", mainCount: 1,
    outcome: "ready", connection: "online", focusId: "search", activeDialog: null,
    controls: [sampleControl()], announcements: [], records: [], resources: [], historyIndex: 0,
    scrollY: 0, capturedAt: 100, ...changes };
}
export function sampleAction(changes: Partial<Action> = {}): Action {
  return { kind: "disconnect", before: sampleScreen(), after: sampleScreen({ connection: "offline" }),
    targetRoute: null, targetFocus: null, preserveRecords: true, preserveFocus: false,
    actionAt: 100, ...changes };
}
export function sortedUniqueFindings(findings: readonly Finding[]): Finding[] {
  const unique = new Map<string, Finding>();
  for (const item of findings) unique.set(JSON.stringify([item.rule, item.step, item.detail, item.severity]), item);
  return [...unique.values()].sort((a, b) => a.step - b.step || a.rule.localeCompare(b.rule) || a.detail.localeCompare(b.detail));
}
export function reportFindings(findings: readonly Finding[], limit = 30): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Limit must be a positive integer");
  const rows = sortedUniqueFindings(findings).map((item) => `${item.step} ${item.rule} (${item.severity}): ${item.detail}`);
  const extra = rows.length - Math.min(limit, rows.length);
  return [...rows.slice(0, limit), ...(extra > 0 ? [`${extra} additional findings`] : [])].join("\n");
}
export function blockingFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((item) => item.severity === "error");
}
