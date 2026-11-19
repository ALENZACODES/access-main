/** Read-only contracts for live-region behaviour across user actions. */
export type Locale = "en" | "fr";
export type Severity = "error" | "warning" | "information" | "success";
export type Stage = "idle" | "loading" | "ready" | "empty" | "error" | "offline";
export type Urgency = "off" | "polite" | "assertive";
export type Knowledge = "KNOWN" | "UNKNOWN";

export interface LiveNode {
  readonly key: string;
  readonly role: string | null;
  readonly ariaLive: string | null;
  readonly ariaAtomic: string | null;
  readonly text: string;
  readonly hidden: boolean;
  readonly busy: boolean;
}
export interface AnnouncementFrame {
  readonly route: string;
  readonly locale: Locale;
  readonly stage: Stage;
  readonly query: string;
  readonly resultCount: number | null;
  readonly nodes: readonly LiveNode[];
  readonly activeElement: string | null;
  readonly documentBusy: boolean;
  readonly accessibleHeading: string;
  readonly timestamp: number;
}
export interface AnnouncementEvent {
  readonly event: "search" | "filter" | "reset" | "language" | "navigate" | "retry" | "offline" | "online";
  readonly before: AnnouncementFrame;
  readonly after: AnnouncementFrame;
  readonly requestedLocale?: Locale;
  readonly expectedRoute?: string;
  readonly originatingControl?: string;
  readonly carriesResultCount?: boolean;
}
export interface Finding {
  readonly rule: string;
  readonly route: string;
  readonly detail: string;
  readonly severity: Severity;
}
const stageOrder = ["idle", "loading", "ready", "empty", "error", "offline"] as const;
const statusRoles = new Set(["status", "alert", "log", "timer", "progressbar"]);
const validLive = new Set(["off", "polite", "assertive"]);
const trim = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim();
const finding = (rule: string, route: string, detail: string, severity: Severity = "error"): Finding => ({ rule, route, detail, severity });

export function nodeUrgency(node: LiveNode): Urgency | null {
  if (node.ariaLive !== null) return validLive.has(node.ariaLive) ? node.ariaLive as Urgency : null;
  if (node.role === "alert") return "assertive";
  if (node.role === "status" || node.role === "log") return "polite";
  if (node.role === "timer" || node.role === "progressbar") return "off";
  return null;
}
export function isAnnounced(node: LiveNode): boolean {
  return !node.hidden && !node.busy && trim(node.text).length > 0 && nodeUrgency(node) !== null && nodeUrgency(node) !== "off";
}
export function visibleAnnouncements(frame: AnnouncementFrame): readonly LiveNode[] {
  return frame.nodes.filter(isAnnounced);
}
export function announcementFingerprint(node: LiveNode): string {
  return `${nodeUrgency(node) ?? "invalid"}|${trim(node.text).toLocaleLowerCase()}`;
}
export function announcedDifference(before: AnnouncementFrame, after: AnnouncementFrame): readonly LiveNode[] {
  const previous = new Map<string, number>();
  for (const node of visibleAnnouncements(before)) {
    const key = announcementFingerprint(node);
    previous.set(key, (previous.get(key) ?? 0) + 1);
  }
  const changes: LiveNode[] = [];
  for (const node of visibleAnnouncements(after)) {
    const key = announcementFingerprint(node);
    const count = previous.get(key) ?? 0;
    if (count > 0) previous.set(key, count - 1);
    else changes.push(node);
  }
  return changes;
}
export function liveNodeFindings(frame: AnnouncementFrame): Finding[] {
  const problems: Finding[] = [];
  const keys = new Set<string>();
  const fingerprints = new Map<string, string>();
  for (const node of frame.nodes) {
    if (keys.has(node.key)) problems.push(finding("duplicate-live-node", frame.route, node.key));
    keys.add(node.key);
    if (node.ariaLive !== null && !validLive.has(node.ariaLive)) {
      problems.push(finding("invalid-live-value", frame.route, `${node.key}: ${node.ariaLive}`));
    }
    if (node.role && !statusRoles.has(node.role) && node.ariaLive === null) {
      problems.push(finding("unannounced-region", frame.route, node.key, "warning"));
    }
    if (node.ariaAtomic !== null && node.ariaAtomic !== "true" && node.ariaAtomic !== "false") {
      problems.push(finding("invalid-atomic", frame.route, node.key));
    }
    if (node.hidden && node.role === "alert" && trim(node.text)) {
      problems.push(finding("hidden-alert", frame.route, node.key, "warning"));
    }
    if (isAnnounced(node)) {
      const fingerprint = announcementFingerprint(node);
      const prior = fingerprints.get(fingerprint);
      if (prior) problems.push(finding("duplicate-message", frame.route, `${prior} and ${node.key}`));
      fingerprints.set(fingerprint, node.key);
    }
  }
  return problems;
}
export function validateFrame(frame: AnnouncementFrame): Finding[] {
  const findings = liveNodeFindings(frame);
  if (!frame.route.startsWith("/") || frame.route.startsWith("//")) findings.push(finding("invalid-route", frame.route, "Route must be local"));
  if (!trim(frame.accessibleHeading)) findings.push(finding("missing-heading", frame.route, "No accessible heading"));
  if (!stageOrder.includes(frame.stage)) findings.push(finding("invalid-stage", frame.route, frame.stage));
  if (!Number.isFinite(frame.timestamp) || frame.timestamp < 0) findings.push(finding("invalid-time", frame.route, String(frame.timestamp)));
  if (frame.resultCount !== null && (!Number.isSafeInteger(frame.resultCount) || frame.resultCount < 0)) {
    findings.push(finding("invalid-count", frame.route, String(frame.resultCount)));
  }
  if (frame.stage === "loading" && !frame.documentBusy && !frame.nodes.some((node) => node.busy || /loading|chargement/i.test(node.text))) {
    findings.push(finding("loading-not-conveyed", frame.route, "Loading must be announced"));
  }
  if (frame.stage === "empty" && frame.resultCount !== 0) findings.push(finding("empty-count", frame.route, "Empty needs a zero count"));
  if (frame.stage === "ready" && frame.resultCount === null) findings.push(finding("unknown-count", frame.route, "A count was not supplied", "information"));
  if (frame.stage === "error" && !frame.nodes.some((node) => node.role === "alert" && !node.hidden && trim(node.text))) {
    findings.push(finding("silent-error", frame.route, "Error has no accessible alert"));
  }
  if (frame.stage === "offline" && !frame.nodes.some((node) => isAnnounced(node) && /offline|hors ligne|connexion|network/i.test(node.text))) {
    findings.push(finding("silent-offline", frame.route, "Offline state must be announced"));
  }
  return findings;
}
export function transitionFindings(event: AnnouncementEvent): Finding[] {
  const { before, after } = event;
  const findings = [...validateFrame(after)];
  const changed = announcedDifference(before, after);
  if (after.timestamp < before.timestamp) findings.push(finding("time-regression", after.route, "Transition time moved backwards"));
  if (event.event !== "navigate" && before.route !== after.route) findings.push(finding("unexpected-navigation", after.route, before.route));
  if (event.expectedRoute !== undefined && event.expectedRoute !== after.route) findings.push(finding("wrong-route", after.route, event.expectedRoute));
  if (event.event === "language") {
    if (event.requestedLocale && after.locale !== event.requestedLocale) findings.push(finding("language-not-applied", after.route, event.requestedLocale));
    if (before.locale !== after.locale && !changed.length) findings.push(finding("silent-language-change", after.route, "No newly announced information"));
  } else if (before.locale !== after.locale) {
    findings.push(finding("unrequested-language-change", after.route, `${before.locale} to ${after.locale}`));
  }
  if (event.event === "offline" && after.stage !== "offline") findings.push(finding("offline-state-missing", after.route, after.stage));
  if (event.event === "online" && after.stage === "offline") findings.push(finding("online-state-stale", after.route, after.stage));
  if ((event.event === "search" || event.event === "filter" || event.event === "retry") && after.stage !== "loading" && !changed.length) {
    findings.push(finding("silent-results", after.route, "Search/filter outcome did not change live output"));
  }
  if (event.event === "reset" && before.query !== after.query && !changed.length) {
    findings.push(finding("silent-reset", after.route, "Clearing a query was not announced", "warning"));
  }
  if (event.carriesResultCount && after.stage === "ready" && after.resultCount !== null) {
    const spoken = changed.some((node) => new RegExp(`(^|\\D)${after.resultCount}(\\D|$)`).test(node.text));
    if (!spoken) findings.push(finding("result-count-omitted", after.route, String(after.resultCount)));
  }
  if (event.originatingControl && event.event !== "navigate" && after.activeElement !== event.originatingControl) {
    findings.push(finding("focus-not-preserved", after.route, `${event.originatingControl} to ${after.activeElement ?? "none"}`));
  }
  return findings;
}
export interface AnnouncementTimeline {
  readonly route: string;
  readonly events: readonly AnnouncementEvent[];
  readonly maxAgeMs?: number;
}
export function timelineFindings(timeline: AnnouncementTimeline): Finding[] {
  const findings: Finding[] = [];
  let previous: AnnouncementFrame | null = null;
  for (const [index, event] of timeline.events.entries()) {
    if (event.after.route !== timeline.route && event.event !== "navigate") {
      findings.push(finding("timeline-route", timeline.route, `${index}: ${event.after.route}`));
    }
    if (previous && event.before.timestamp !== previous.timestamp) {
      findings.push(finding("timeline-gap", timeline.route, `${index}: missing intermediate frame`, "warning"));
    }
    if (timeline.maxAgeMs !== undefined && event.after.timestamp - event.before.timestamp > timeline.maxAgeMs) {
      findings.push(finding("late-announcement", timeline.route, `${index}: ${event.after.timestamp - event.before.timestamp} ms`));
    }
    findings.push(...transitionFindings(event));
    previous = event.after;
  }
  return findings;
}
export function aggregateTimeline(timeline: AnnouncementTimeline): { events: number; errors: number; warnings: number; information: number; findings: readonly Finding[] } {
  const findings = timelineFindings(timeline);
  return {
    events: timeline.events.length,
    errors: findings.filter((item) => item.severity === "error").length,
    warnings: findings.filter((item) => item.severity === "warning").length,
    information: findings.filter((item) => item.severity === "information").length,
    findings,
  };
}
export function issueCodes(findings: readonly Finding[]): readonly string[] {
  return findings.map((item) => item.rule);
}
export function formatFindings(findings: readonly Finding[], limit = 30): string {
  const unique = [...new Set(findings.map((item) => `${item.severity} ${item.rule} ${item.route}: ${item.detail}`))];
  return [...unique.slice(0, limit), ...(unique.length > limit ? [`${unique.length - limit} more findings`] : [])].join("\n");
}
