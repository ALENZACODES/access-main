/** Observational contracts for offline accessibility journeys. No place facts are inferred. */
export type Locale = "en" | "fr";
export type Certainty = "known" | "UNKNOWN";
export type Connectivity = "online" | "offline" | "UNKNOWN";
export type CacheState = "present" | "absent" | "stale" | "UNKNOWN";
export type Phase = "idle" | "loading" | "ready" | "empty" | "error" | "offline" | "UNKNOWN";
export type Severity = "error" | "warning" | "information";
export type JourneyAction = "navigate" | "search" | "clear" | "retry" | "disconnect" | "reconnect" | "language" | "back" | "forward" | "open" | "close" | "export" | "import";
export type KeyboardKey = "Tab" | "Shift+Tab" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End" | "Escape" | "Enter" | "Space";
export type DataFormat = "text" | "csv" | "json";
export interface Provenance {
  readonly source: string | null;
  readonly licence: string | null;
  readonly retrievedOn: string | null;
  readonly tier: string | null;
}
export interface Evidence {
  readonly id: string;
  readonly label: string | null;
  readonly value: string | null;
  readonly provenance: Provenance;
  readonly recordedUnknown: boolean;
}
export interface Target {
  readonly id: string;
  readonly name: string | null;
  readonly role: string;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly inert: boolean;
  readonly tabIndex: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly focusIndicator: boolean | null;
  readonly modalId: string | null;
}
export interface Status {
  readonly id: string;
  readonly text: string;
  readonly locale: Locale | "UNKNOWN";
  readonly politeness: "off" | "polite" | "assertive" | "UNKNOWN";
  readonly emittedAt: number | null;
  readonly busy: boolean | null;
  readonly visible: boolean;
}
export interface Resource {
  readonly path: string;
  readonly cache: CacheState;
  readonly bytes: number | null;
  readonly networkAttempted: boolean | null;
  readonly networkSucceeded: boolean | null;
  readonly fallbackPath: string | null;
  readonly contentType: string | null;
}
export interface Snapshot {
  readonly route: string;
  readonly locale: Locale | "UNKNOWN";
  readonly connectivity: Connectivity;
  readonly cache: CacheState;
  readonly phase: Phase;
  readonly title: string;
  readonly heading: string;
  readonly mainCount: number;
  readonly activeId: string | null;
  readonly dialogId: string | null;
  readonly scrollY: number | null;
  readonly historyIndex: number | null;
  readonly time: number | null;
  readonly targets: readonly Target[];
  readonly statuses: readonly Status[];
  readonly resources: readonly Resource[];
  readonly evidence: readonly Evidence[];
}
export interface Step {
  readonly action: JourneyAction;
  readonly before: Snapshot;
  readonly after: Snapshot;
  readonly targetRoute: string | null;
  readonly preserveEvidence: boolean;
  readonly preserveFocus: boolean;
  readonly expectedStatus: Phase | null;
}
export interface Trace {
  readonly initial: Snapshot;
  readonly steps: readonly Step[];
  readonly name: string;
}
export interface Finding {
  readonly code: string;
  readonly area: "route" | "focus" | "copy" | "resource" | "evidence" | "continuity" | "history" | "security";
  readonly severity: Severity;
  readonly step: number;
  readonly detail: string;
}
export interface CoverageCell {
  readonly route: string;
  readonly locale: Locale;
  readonly width: 320 | 1280;
  readonly connectivity: "online" | "offline";
}
export interface ExportPacket {
  readonly format: DataFormat;
  readonly locale: Locale;
  readonly records: readonly Evidence[];
  readonly title: string;
  readonly createdOn: string | null;
}
export function finding(code: string, area: Finding["area"], step: number, detail: string, severity: Severity = "error"): Finding {
  return { code, area, step, detail, severity };
}
export function codes(findings: readonly Finding[]): string[] {
  return findings.map((entry) => entry.code);
}
export function uniqueFindings(items: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}\u0000${item.area}\u0000${item.step}\u0000${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function findingReport(items: readonly Finding[], maximum = 40): string {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be a positive integer");
  const rows = uniqueFindings(items).map((item) => `[${item.severity}] step ${item.step} ${item.area}/${item.code}: ${item.detail}`);
  const extra = Math.max(0, rows.length - maximum);
  return [...rows.slice(0, maximum), ...(extra ? [`${extra} further findings`] : [])].join("\n");
}
export function hasBlockingFindings(items: readonly Finding[]): boolean {
  return items.some((item) => item.severity === "error");
}
export function sampleTarget(change: Partial<Target> = {}): Target {
  return { id: "search", name: "Search", role: "button", enabled: true, visible: true, inert: false,
    tabIndex: 0, width: 48, height: 48, focusIndicator: true, modalId: null, ...change };
}
export function sampleEvidence(change: Partial<Evidence> = {}): Evidence {
  return { id: "record", label: "Sample", value: "UNKNOWN", recordedUnknown: true,
    provenance: { source: "Example source", licence: "Example licence", retrievedOn: "2026-11-20", tier: "E" }, ...change };
}
export function sampleSnapshot(change: Partial<Snapshot> = {}): Snapshot {
  return { route: "/journey", locale: "en", connectivity: "online", cache: "UNKNOWN", phase: "ready",
    title: "Journey", heading: "Journey", mainCount: 1, activeId: "search", dialogId: null,
    scrollY: 0, historyIndex: 0, time: 100, targets: [sampleTarget()], statuses: [], resources: [], evidence: [], ...change };
}
export function sampleStep(change: Partial<Step> = {}): Step {
  return { action: "disconnect", before: sampleSnapshot(),
    after: sampleSnapshot({ connectivity: "offline", phase: "offline" }), targetRoute: null,
    preserveEvidence: true, preserveFocus: true, expectedStatus: null, ...change };
}
