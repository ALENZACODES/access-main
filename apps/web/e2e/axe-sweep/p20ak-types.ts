/** Contracts for observed continuity, not statements about physical locations. */
export type Locale = "en" | "fr";
export type Certainty = "observed" | "reported" | "UNKNOWN";
export type Connection = "online" | "offline" | "UNKNOWN";
export type Phase = "idle" | "loading" | "ready" | "empty" | "error" | "offline" | "UNKNOWN";
export type Severity = "error" | "warning" | "information";
export type ResourcePhase = "pending" | "success" | "failure" | "blocked" | "UNKNOWN";
export type ActionKind = "navigate" | "language" | "disconnect" | "reconnect" | "retry" | "back" | "forward" | "focus" | "open" | "close" | "export" | "search" | "clear";
export type Outcome = "pass" | "fail" | "UNKNOWN";
export interface Finding {
  readonly code: string;
  readonly scope: string;
  readonly detail: string;
  readonly severity: Severity;
  readonly at: number;
}
export interface EvidenceProvenance {
  readonly source: string | null;
  readonly licence: string | null;
  readonly retrievedOn: string | null;
  readonly tier: string | null;
}
export interface EvidenceClaim {
  readonly id: string;
  readonly label: string | null;
  readonly value: string | null;
  readonly certainty: Certainty;
  readonly provenance: EvidenceProvenance;
}
export interface CacheEntry {
  readonly url: string;
  readonly cacheKey: string | null;
  readonly phase: ResourcePhase;
  readonly measuredBytes: number | null;
  readonly contentType: string | null;
  readonly responseStatus: number | null;
  readonly observedAt: number | null;
  readonly source: string | null;
}
export interface ServiceWorkerState {
  readonly supported: boolean | null;
  readonly controlling: boolean | null;
  readonly controllerScript: string | null;
  readonly registrationScope: string | null;
  readonly cacheNames: readonly string[] | null;
  readonly updatePending: boolean | null;
  readonly measuredAt: number | null;
}
export interface LiveAnnouncement {
  readonly key: string;
  readonly text: string;
  readonly language: Locale | "UNKNOWN";
  readonly politeness: "polite" | "assertive" | "off" | "UNKNOWN";
  readonly busy: boolean | null;
  readonly visible: boolean;
  readonly observedAt: number;
}
export interface FocusTarget {
  readonly id: string;
  readonly role: string;
  readonly name: string | null;
  readonly order: number;
  readonly tabIndex: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly inert: boolean;
  readonly insideDialog: boolean;
  readonly focusIndicator: boolean | null;
}
export interface DialogState {
  readonly id: string;
  readonly open: boolean;
  readonly modal: boolean;
  readonly triggerId: string | null;
  readonly activeId: string | null;
  readonly descendants: readonly string[];
  readonly backgroundFocusableIds: readonly string[];
}
export interface PageSnapshot {
  readonly route: string;
  readonly language: Locale | "UNKNOWN";
  readonly connectivity: Connection;
  readonly phase: Phase;
  readonly title: string;
  readonly heading: string;
  readonly mainCount: number;
  readonly width: number;
  readonly horizontalOverflow: number;
  readonly activeId: string | null;
  readonly scrollY: number;
  readonly historyIndex: number | null;
  readonly observedAt: number;
  readonly targets: readonly FocusTarget[];
  readonly dialogs: readonly DialogState[];
  readonly announcements: readonly LiveAnnouncement[];
  readonly evidence: readonly EvidenceClaim[];
  readonly resources: readonly CacheEntry[];
  readonly worker: ServiceWorkerState;
}
export interface JourneyEvent {
  readonly id: string;
  readonly action: ActionKind;
  readonly before: PageSnapshot;
  readonly after: PageSnapshot;
  readonly expectedRoute?: string;
  readonly intendedFocusId?: string;
  readonly preserveEvidence?: boolean;
  readonly expectedResponse?: ResourcePhase;
  readonly elapsedMs: number | null;
}
export interface JourneyTrace {
  readonly id: string;
  readonly initial: PageSnapshot;
  readonly events: readonly JourneyEvent[];
}
export interface AuditMatrixCell {
  readonly route: string;
  readonly locale: Locale;
  readonly width: 320 | 1280;
  readonly connectivity: "online" | "offline";
}
export interface AuditReceipt {
  readonly traceId: string;
  readonly route: string;
  readonly locale: Locale | "UNKNOWN";
  readonly observedAt: number | null;
  readonly result: Outcome;
  readonly errors: number;
  readonly warnings: number;
  readonly unknowns: number;
  readonly findings: readonly Finding[];
  readonly evidence: readonly EvidenceClaim[];
}
export const UNKNOWN = "UNKNOWN" as const;
export const BUDGET_BYTES = 524288;
export const LANGUAGES = ["en", "fr"] as const;
export const WIDTHS = [320, 1280] as const;
export function issue(code: string, scope: string, detail: string, at = 0, severity: Severity = "error"): Finding {
  return { code, scope, detail, severity, at };
}
export function textOrUnknown(value: string | null | undefined): string {
  if (value === undefined || value === null) return UNKNOWN;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (["", "unknown", "inconnu", "inconnue", "n/a", "null", "undefined", "—", "-"].includes(normalized.toLowerCase())) return UNKNOWN;
  return normalized;
}
export function validDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined || year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const result = new Date(Date.UTC(year, month - 1, day));
  return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day;
}
export function safeRoute(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[?#*:]/.test(value)) return false;
  for (const character of value) if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) return false;
  return !value.split("/").some((part) => part === "." || part === "..");
}
export function sameIdentity(a: PageSnapshot, b: PageSnapshot): boolean {
  return a.route === b.route && a.language === b.language && a.connectivity === b.connectivity && a.phase === b.phase;
}
export function knownNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
export function report(findings: readonly Finding[], max = 30): string {
  if (!Number.isInteger(max) || max < 1) throw new RangeError("max must be a positive integer");
  const rows = [...new Set(findings.map((f) => `${f.code} ${f.scope} ${f.detail}`))];
  const missing = Math.max(0, rows.length - max);
  return [...rows.slice(0, max), ...(missing > 0 ? [`${missing} additional findings`] : [])].join("\n");
}
export function sampleWorker(patch: Partial<ServiceWorkerState> = {}): ServiceWorkerState {
  return { supported: null, controlling: null, controllerScript: null, registrationScope: null, cacheNames: null, updatePending: null, measuredAt: null, ...patch };
}
export function sampleSnapshot(patch: Partial<PageSnapshot> = {}): PageSnapshot {
  return { route: "/", language: "en", connectivity: "online", phase: "ready", title: "Home", heading: "Home", mainCount: 1,
    width: 1280, horizontalOverflow: 0, activeId: null, scrollY: 0, historyIndex: 0, observedAt: 100,
    targets: [], dialogs: [], announcements: [], evidence: [], resources: [], worker: sampleWorker(), ...patch };
}
export function sampleEvidence(patch: Partial<EvidenceClaim> = {}): EvidenceClaim {
  return { id: "demo", label: "Example", value: UNKNOWN, certainty: UNKNOWN,
    provenance: { source: "Synthetic example", licence: "Example licence", retrievedOn: "2026-11-20", tier: "E" }, ...patch };
}
export function sampleTarget(patch: Partial<FocusTarget> = {}): FocusTarget {
  return { id: "continue", role: "button", name: "Continue", order: 0, tabIndex: 0, width: 44, height: 44,
    visible: true, disabled: false, inert: false, insideDialog: false, focusIndicator: true, ...patch };
}
export function sampleEvent(patch: Partial<JourneyEvent> = {}): JourneyEvent {
  return { id: "event-1", action: "focus", before: sampleSnapshot(), after: sampleSnapshot(), elapsedMs: 0, ...patch };
}
