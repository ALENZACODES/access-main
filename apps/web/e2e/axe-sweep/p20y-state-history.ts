/** State continuity contracts for route, locale, focus, offline and evidence transitions. */
export type Locale = "en" | "fr";
export type Connectivity = "online" | "offline" | "unknown";
export type ResultState = "idle" | "loading" | "ready" | "empty" | "error" | "unknown";
export type EvidenceStatus = "KNOWN" | "UNKNOWN";

export interface HistoryIssue {
  readonly code: string;
  readonly location: string;
  readonly detail: string;
}

export interface EvidenceEntry {
  readonly id: string;
  readonly source: string | null;
  readonly licence: string | null;
  readonly date: string | null;
  readonly tier: string | null;
  readonly status: EvidenceStatus;
  readonly label: string;
  readonly version: string | null;
}

export interface ScreenState {
  readonly route: string;
  readonly language: Locale;
  readonly connectivity: Connectivity;
  readonly result: ResultState;
  readonly focusId: string | null;
  readonly scrollPosition: number;
  readonly message: string;
  readonly busy: boolean;
  readonly evidence: readonly EvidenceEntry[];
}

export interface ScreenTransition {
  readonly action: "search" | "retry" | "clear" | "filter" | "language" | "disconnect" | "reconnect" | "back" | "forward" | "reset";
  readonly before: ScreenState;
  readonly after: ScreenState;
  readonly expectedRoute: string;
  readonly preserveEvidence: boolean;
  readonly preserveFocus: boolean;
}

export interface AnnouncementRecord {
  readonly id: string;
  readonly state: ResultState;
  readonly locale: Locale;
  readonly politeness: "polite" | "assertive" | "off";
  readonly text: string;
  readonly emittedAt: number;
  readonly afterActionAt: number;
  readonly busy: boolean;
}

export interface ActionSequence {
  readonly initial: ScreenState;
  readonly transitions: readonly ScreenTransition[];
  readonly announcements: readonly AnnouncementRecord[];
}

export interface CoverageItem {
  readonly route: string;
  readonly locale: Locale;
  readonly connectivity: Connectivity;
  readonly state: ResultState;
}

const MISSING = new Set(["", "UNKNOWN", "INCONNU", "INCONNUE", "N/A", "—", "-"]);

function issue(code: string, location: string, detail: string): HistoryIssue {
  return { code, location, detail };
}

export function normalizedEvidenceValue(value: string | null): string | null {
  if (value === null) return null;
  const text = value.normalize("NFC").replace(/\s+/g, " ").trim();
  return MISSING.has(text.toUpperCase()) ? null : text;
}

export function calendarDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12 || year > 9999) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (lengths[month - 1] ?? 0);
}

export function evidenceCompleteness(entry: EvidenceEntry): EvidenceStatus {
  const fields = [entry.id, entry.label, entry.source, entry.licence, entry.date, entry.tier];
  if (fields.some((value) => normalizedEvidenceValue(value) === null)) return "UNKNOWN";
  if (!calendarDate(entry.date)) return "UNKNOWN";
  return "KNOWN";
}

export function evidenceIssues(entries: readonly EvidenceEntry[], route: string): HistoryIssue[] {
  const problems: HistoryIssue[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    const location = `${route}#${entry.id || "record"}`;
    if (!entry.id.trim()) problems.push(issue("record-id-empty", location, "No stable identifier"));
    if (ids.has(entry.id)) problems.push(issue("record-duplicate-id", location, entry.id));
    ids.add(entry.id);
    if (!entry.label.trim()) problems.push(issue("record-name-empty", location, "No visible label"));
    if (entry.status === "KNOWN" && evidenceCompleteness(entry) !== "KNOWN") {
      problems.push(issue("unsupported-known-state", location, "Incomplete evidence marked known"));
    }
    if (normalizedEvidenceValue(entry.date) !== null && !calendarDate(entry.date)) {
      problems.push(issue("record-date-invalid", location, entry.date ?? "UNKNOWN"));
    }
    if (entry.version !== null && !/^\d+(?:\.\d+){0,2}$/.test(entry.version)) {
      problems.push(issue("record-version-invalid", location, entry.version));
    }
  }
  return problems;
}

export function evidenceChangeIssues(
  before: readonly EvidenceEntry[],
  after: readonly EvidenceEntry[],
  route: string,
  preserve: boolean,
): HistoryIssue[] {
  if (!preserve) return evidenceIssues(after, route);
  const issues = evidenceIssues(after, route);
  const next = new Map(after.map((entry) => [entry.id, entry]));
  for (const previous of before) {
    const current = next.get(previous.id);
    if (!current) {
      issues.push(issue("record-lost", route, previous.id));
      continue;
    }
    for (const key of ["source", "licence", "date", "tier"] as const) {
      const first = normalizedEvidenceValue(previous[key]);
      const second = normalizedEvidenceValue(current[key]);
      if (first !== second) issues.push(issue("record-provenance-changed", `${route}#${previous.id}`, key));
    }
    if (previous.status === "UNKNOWN" && current.status === "KNOWN" && evidenceCompleteness(current) !== "KNOWN") {
      issues.push(issue("record-unknown-promoted", `${route}#${previous.id}`, "Missing evidence cannot be inferred"));
    }
  }
  return issues;
}

export function screenIssues(state: ScreenState): HistoryIssue[] {
  const issues = evidenceIssues(state.evidence, state.route);
  if (!state.route.startsWith("/") || state.route.startsWith("//")) {
    issues.push(issue("screen-invalid-route", state.route, "Route is not local"));
  }
  if (!Number.isFinite(state.scrollPosition) || state.scrollPosition < 0) {
    issues.push(issue("screen-invalid-scroll", state.route, String(state.scrollPosition)));
  }
  if (state.result === "loading" && !state.busy) issues.push(issue("loading-not-busy", state.route, "Loading state lacks busy flag"));
  if (state.result !== "loading" && state.busy) issues.push(issue("busy-after-load", state.route, state.result));
  if (state.result === "error" && !state.message.trim()) issues.push(issue("error-silent", state.route, "Failure has no status message"));
  if (state.result === "empty" && !state.message.trim()) issues.push(issue("empty-silent", state.route, "Empty state has no explanation"));
  return issues;
}

export function transitionIssues(event: ScreenTransition): HistoryIssue[] {
  const issues = screenIssues(event.after);
  const { before, after } = event;
  if (after.route !== event.expectedRoute) issues.push(issue("transition-route-mismatch", after.route, event.expectedRoute));
  if (event.action === "language" && before.route !== after.route) {
    issues.push(issue("language-loses-route", after.route, before.route));
  }
  if (event.action === "language" && before.language === after.language) {
    issues.push(issue("language-not-changed", after.route, after.language));
  }
  if (event.action === "disconnect" && after.connectivity !== "offline") {
    issues.push(issue("disconnect-unobserved", after.route, after.connectivity));
  }
  if (event.action === "reconnect" && after.connectivity !== "online") {
    issues.push(issue("reconnect-unobserved", after.route, after.connectivity));
  }
  if (event.action === "retry" && before.result !== "error" && before.result !== "empty") {
    issues.push(issue("retry-without-failure", after.route, before.result));
  }
  if (event.action === "clear" && after.result === "loading") {
    issues.push(issue("clear-started-search", after.route, after.result));
  }
  if (event.preserveFocus && before.focusId && after.focusId !== before.focusId) {
    issues.push(issue("focus-lost", after.route, after.focusId ?? "UNKNOWN"));
  }
  issues.push(...evidenceChangeIssues(before.evidence, after.evidence, after.route, event.preserveEvidence));
  return issues;
}

export function announcementIssues(items: readonly AnnouncementRecord[], maximumDelay = 1500): HistoryIssue[] {
  if (!Number.isFinite(maximumDelay) || maximumDelay < 0) throw new RangeError("maximumDelay must be non-negative");
  const issues: HistoryIssue[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.text.trim() && item.state !== "idle") issues.push(issue("announcement-empty", item.id, item.state));
    if (!Number.isFinite(item.emittedAt) || !Number.isFinite(item.afterActionAt)) {
      issues.push(issue("announcement-time-invalid", item.id, "Invalid timeline"));
      continue;
    }
    if (item.emittedAt < item.afterActionAt) issues.push(issue("announcement-before-action", item.id, String(item.emittedAt)));
    if (item.emittedAt - item.afterActionAt > maximumDelay) issues.push(issue("announcement-late", item.id, String(item.emittedAt - item.afterActionAt)));
    if (item.state === "error" && item.politeness === "off") issues.push(issue("announcement-error-silent", item.id, "Error is not announced"));
    if (item.state === "loading" && !item.busy) issues.push(issue("announcement-loading-busy", item.id, "Loading announcement has no busy flag"));
    const key = `${item.state}|${item.locale}|${item.text}|${item.afterActionAt}`;
    if (seen.has(key)) issues.push(issue("announcement-duplicate", item.id, "Same message repeated without a new action"));
    seen.add(key);
  }
  return issues;
}

export function sequenceIssues(sequence: ActionSequence): HistoryIssue[] {
  const issues = screenIssues(sequence.initial);
  let current = sequence.initial;
  for (const item of sequence.transitions) {
    if (item.before !== current && !sameScreenIdentity(item.before, current)) {
      issues.push(issue("transition-chain-broken", item.after.route, `${current.route} to ${item.before.route}`));
    }
    issues.push(...transitionIssues(item));
    current = item.after;
  }
  issues.push(...announcementIssues(sequence.announcements));
  return issues;
}

export function sameScreenIdentity(left: ScreenState, right: ScreenState): boolean {
  return left.route === right.route && left.language === right.language &&
    left.connectivity === right.connectivity && left.result === right.result;
}

export function coverageMatrix(routes: readonly string[]): CoverageItem[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((locale) =>
    (["online", "offline"] as const).flatMap((connectivity) =>
      (["ready", "empty", "error"] as const).map((state) => ({ route, locale, connectivity, state })))));
}

export function coverageIssues(routes: readonly string[], actual: readonly CoverageItem[]): HistoryIssue[] {
  const expected = coverageMatrix(routes);
  const keys = new Set(actual.map((item) => `${item.route}|${item.locale}|${item.connectivity}|${item.state}`));
  return expected.filter((item) => !keys.has(`${item.route}|${item.locale}|${item.connectivity}|${item.state}`))
    .map((item) => issue("coverage-missing", item.route, `${item.locale} ${item.connectivity} ${item.state}`));
}

export function historySummary(issues: readonly HistoryIssue[], limit = 25): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  const distinct = [...new Set(issues.map((item) => `${item.code} ${item.location}: ${item.detail}`))];
  const left = Math.max(0, distinct.length - limit);
  return [...distinct.slice(0, limit), ...(left ? [`${left} additional findings`] : [])].join("\n");
}
