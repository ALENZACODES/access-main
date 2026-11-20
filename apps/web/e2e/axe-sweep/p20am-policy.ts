import {
  MAX_PRECACHE_FILE_BYTES, MAX_PRECACHE_TOTAL_BYTES, calendarDate, canonicalRoute,
  continuityFindings, finding, known, recordFindings, safeRoute, sampleScreen,
  sameScreen, sortedUniqueFindings, type Action, type Announcement, type Control,
  type Finding, type Resource, type Screen, type Trace,
} from "./p20am-model.ts";

const finiteNonnegative = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
const phases = new Set(["idle", "loading", "ready", "empty", "error", "fallback"]);

export function controlFindings(controls: readonly Control[], focusId: string | null, step = 0): Finding[] {
  const issues: Finding[] = [];
  const ids = new Set<string>();
  const ordered = new Set<number>();
  for (const control of controls) {
    if (!control.id.trim()) issues.push(finding("control-id-empty", step, control.role));
    if (ids.has(control.id)) issues.push(finding("control-id-duplicate", step, control.id));
    ids.add(control.id);
    if (control.visible && !control.disabled && !control.inert) {
      if (!known(control.name)) issues.push(finding("control-name-UNKNOWN", step, control.id));
      if (control.tabIndex < -1 || !Number.isInteger(control.tabIndex)) {
        issues.push(finding("control-tabindex-invalid", step, control.id));
      }
      if (control.tabIndex > 0) issues.push(finding("control-positive-tabindex", step, control.id));
      if (control.width !== null && (!Number.isFinite(control.width) || control.width < 44)) {
        issues.push(finding("control-width", step, control.id));
      }
      if (control.height !== null && (!Number.isFinite(control.height) || control.height < 44)) {
        issues.push(finding("control-height", step, control.id));
      }
      if (control.width === null || control.height === null) {
        issues.push(finding("control-size-UNKNOWN", step, control.id, "information"));
      }
      if (control.tabIndex >= 0 && control.tabIndex !== 0) {
        if (ordered.has(control.tabIndex)) issues.push(finding("control-tabindex-duplicate", step, control.id));
        ordered.add(control.tabIndex);
      }
    }
    if (focusId === control.id && (control.inert || !control.visible || control.disabled)) {
      issues.push(finding("focus-unavailable", step, control.id));
    }
    if (focusId === control.id && control.focusVisible === false) {
      issues.push(finding("focus-ring-hidden", step, control.id));
    }
  }
  if (focusId !== null && !ids.has(focusId)) issues.push(finding("focus-target-missing", step, focusId));
  return issues;
}
export function dialogFindings(screen: Screen, step = 0): Finding[] {
  if (!screen.activeDialog) return [];
  const issues: Finding[] = [];
  const active = screen.controls.find((item) => item.id === screen.focusId);
  if (!active || active.parentDialog !== screen.activeDialog) {
    issues.push(finding("dialog-focus-outside", step, screen.activeDialog));
  }
  for (const control of screen.controls) {
    if (!control.visible || control.disabled || control.inert || control.tabIndex < 0) continue;
    if (control.parentDialog !== screen.activeDialog) {
      issues.push(finding("dialog-background-focusable", step, control.id));
    }
  }
  if (!screen.controls.some((item) => item.parentDialog === screen.activeDialog && item.visible && !item.disabled)) {
    issues.push(finding("dialog-no-operable-control", step, screen.activeDialog));
  }
  return issues;
}
export function announcementFindings(announcements: readonly Announcement[], outcome: string, language: string, step = 0): Finding[] {
  const issues: Finding[] = [];
  const keys = new Set<string>();
  const spoken = new Set<string>();
  for (const item of announcements) {
    if (keys.has(item.id)) issues.push(finding("live-region-id-duplicate", step, item.id));
    keys.add(item.id);
    if (item.language !== language) issues.push(finding("live-region-language", step, item.id));
    if (!item.text.trim() && item.politeness !== "off") issues.push(finding("live-region-empty", step, item.id));
    if (item.eventAt !== null && !finiteNonnegative(item.eventAt)) {
      issues.push(finding("live-region-time-UNKNOWN", step, item.id));
    }
    if (item.politeness !== "off" && item.text.trim()) {
      const key = `${item.politeness}|${item.text.trim().toLowerCase()}`;
      if (spoken.has(key)) issues.push(finding("live-region-duplicate-message", step, item.id));
      spoken.add(key);
    }
  }
  if (outcome === "loading" && !announcements.some((item) => item.busy)) {
    issues.push(finding("loading-not-busy", step, outcome));
  }
  if (["empty", "error", "fallback"].includes(outcome) &&
      !announcements.some((item) => item.text.trim() && item.politeness !== "off")) {
    issues.push(finding("outcome-silent", step, outcome));
  }
  return issues;
}
export function resourceFindings(resources: readonly Resource[], connection: string, step = 0): Finding[] {
  const issues: Finding[] = [];
  const paths = new Set<string>();
  let total = 0;
  for (const resource of resources) {
    const canonical = canonicalRoute(resource.path);
    if (canonical === null) issues.push(finding("resource-path-unsafe", step, resource.path));
    if (paths.has(resource.path)) issues.push(finding("resource-duplicate", step, resource.path));
    paths.add(resource.path);
    if (resource.bytes === null || !Number.isSafeInteger(resource.bytes) || resource.bytes < 0) {
      issues.push(finding("resource-bytes-UNKNOWN", step, resource.path, "information"));
    } else {
      if (resource.bytes > MAX_PRECACHE_FILE_BYTES && resource.cached === "present") {
        issues.push(finding("resource-file-budget", step, resource.path));
      }
      if (resource.cached === "present") total += resource.bytes;
    }
    if (resource.fallback && !safeRoute(resource.fallback)) {
      issues.push(finding("resource-fallback-unsafe", step, resource.path));
    }
    if (resource.required && connection === "offline" && resource.cached !== "present" &&
      !(resource.fallback && safeRoute(resource.fallback))) {
      if (resource.cached === "UNKNOWN") {
        issues.push(finding("resource-offline-UNKNOWN", step, resource.path, "information"));
      } else {
        issues.push(finding("resource-offline-unavailable", step, resource.path));
      }
    }
    if (resource.network === "succeeded" && connection === "offline") {
      issues.push(finding("resource-network-contradiction", step, resource.path));
    }
    if (resource.cached === "stale" && resource.required) {
      issues.push(finding("resource-stale", step, resource.path, "warning"));
    }
  }
  if (total > MAX_PRECACHE_TOTAL_BYTES) issues.push(finding("resource-total-budget", step, String(total)));
  return issues;
}
export function screenFindings(screen: Screen, step = 0): Finding[] {
  const issues: Finding[] = [];
  if (!safeRoute(screen.route)) issues.push(finding("screen-route-invalid", step, screen.route));
  if (!screen.title.trim()) issues.push(finding("screen-title-empty", step, screen.route));
  if (!screen.heading.trim()) issues.push(finding("screen-heading-empty", step, screen.route));
  if (screen.mainCount !== 1) issues.push(finding("screen-main-count", step, String(screen.mainCount)));
  if (!phases.has(screen.outcome)) issues.push(finding("screen-outcome-invalid", step, screen.outcome));
  if (screen.historyIndex !== null && (!Number.isSafeInteger(screen.historyIndex) || screen.historyIndex < 0)) {
    issues.push(finding("screen-history-invalid", step, String(screen.historyIndex)));
  }
  if (screen.scrollY !== null && !finiteNonnegative(screen.scrollY)) {
    issues.push(finding("screen-scroll-invalid", step, String(screen.scrollY)));
  }
  if (screen.capturedAt !== null && !finiteNonnegative(screen.capturedAt)) {
    issues.push(finding("screen-time-invalid", step, String(screen.capturedAt)));
  }
  issues.push(...controlFindings(screen.controls, screen.focusId, step));
  issues.push(...dialogFindings(screen, step));
  issues.push(...announcementFindings(screen.announcements, screen.outcome, screen.language, step));
  issues.push(...resourceFindings(screen.resources, screen.connection, step));
  issues.push(...recordFindings(screen.records, step));
  return issues;
}
export function transitionFindings(action: Action, step = 0): Finding[] {
  const issues: Finding[] = [];
  const { before, after, kind } = action;
  if (!finiteNonnegative(action.actionAt)) {
    issues.push(finding("action-time-UNKNOWN", step, kind, "information"));
  }
  if (kind === "language") {
    if (before.language === after.language) issues.push(finding("language-unchanged", step, after.language));
    if (before.route !== after.route) issues.push(finding("language-lost-route", step, after.route));
  } else if (!["navigate", "back", "forward"].includes(kind)) {
    if (before.language !== after.language) issues.push(finding("unexpected-language", step, kind));
    if (before.route !== after.route) issues.push(finding("unexpected-route", step, kind));
  }
  if (kind === "navigate" && action.targetRoute && action.targetRoute !== after.route) {
    issues.push(finding("navigation-wrong-route", step, after.route));
  }
  if (kind === "disconnect" && after.connection !== "offline") {
    issues.push(finding("disconnect-unobserved", step, after.connection));
  }
  if (kind === "reconnect" && after.connection !== "online") {
    issues.push(finding("reconnect-unobserved", step, after.connection));
  }
  if (kind === "retry" && before.outcome !== "error" && before.outcome !== "empty" && before.outcome !== "fallback") {
    issues.push(finding("retry-without-failure", step, before.outcome));
  }
  if (kind === "clear" && after.outcome === "loading") {
    issues.push(finding("clear-triggered-load", step, after.outcome));
  }
  if (kind === "search" && after.outcome === "idle") issues.push(finding("search-no-state", step, after.outcome));
  if (kind === "open" && !after.activeDialog) issues.push(finding("dialog-not-opened", step, kind));
  if (kind === "close" && after.activeDialog) issues.push(finding("dialog-not-closed", step, kind));
  if (kind === "back" && before.historyIndex !== null && after.historyIndex !== null &&
    after.historyIndex >= before.historyIndex) issues.push(finding("history-back-invalid", step, kind));
  if (kind === "forward" && before.historyIndex !== null && after.historyIndex !== null &&
    after.historyIndex <= before.historyIndex) issues.push(finding("history-forward-invalid", step, kind));
  if (action.targetFocus !== null && after.focusId !== action.targetFocus) {
    issues.push(finding("action-target-focus", step, action.targetFocus));
  }
  if (action.preserveFocus && before.focusId !== after.focusId) {
    issues.push(finding("action-focus-lost", step, `${before.focusId} to ${after.focusId}`));
  }
  if (action.preserveRecords) issues.push(...continuityFindings(before.records, after.records, step));
  if (before.connection === "offline" && after.connection === "online" && kind !== "reconnect") {
    issues.push(finding("connection-unexplained-recovery", step, kind));
  }
  if (before.connection === "online" && after.connection === "offline" && kind !== "disconnect") {
    issues.push(finding("connection-unexplained-loss", step, kind));
  }
  if (action.actionAt !== null && after.capturedAt !== null && action.actionAt > after.capturedAt) {
    issues.push(finding("capture-before-action", step, kind));
  }
  return issues;
}
export function traceFindings(trace: Trace): Finding[] {
  const issues: Finding[] = [];
  if (!trace.id.trim()) issues.push(finding("trace-id-empty", 0, "Missing trace identifier"));
  issues.push(...screenFindings(trace.initial));
  let previous = trace.initial;
  for (const [index, action] of trace.actions.entries()) {
    const step = index + 1;
    if (!sameScreen(previous, action.before)) issues.push(finding("trace-chain-broken", step, action.kind));
    issues.push(...transitionFindings(action, step));
    issues.push(...screenFindings(action.after, step));
    previous = action.after;
  }
  return sortedUniqueFindings(issues);
}
export function traceOutcome(trace: Trace): { outcome: string; blocking: number; warnings: number; informational: number } {
  const problems = traceFindings(trace);
  return { outcome: problems.some((item) => item.severity === "error") ? "fail" : "pass",
    blocking: problems.filter((item) => item.severity === "error").length,
    warnings: problems.filter((item) => item.severity === "warning").length,
    informational: problems.filter((item) => item.severity === "information").length };
}
export function replaySequence(initial: Screen, actions: readonly Action[], id = "replay"): Trace {
  return { id, initial, actions };
}
export function replayFromKinds(kinds: readonly Action["kind"][]): Trace {
  const initial = sampleScreen();
  const actions: Action[] = [];
  let before = initial;
  for (const kind of kinds) {
    const after = kind === "disconnect" ? { ...before, connection: "offline" as const } :
      kind === "reconnect" ? { ...before, connection: "online" as const } : before;
    actions.push({ kind, before, after, targetRoute: null, targetFocus: null,
      preserveFocus: false, preserveRecords: true, actionAt: 100 });
    before = after;
  }
  return { id: "constructed", initial, actions };
}
export function compareTraceFindings(before: readonly Finding[], after: readonly Finding[]): {
  introduced: Finding[]; resolved: Finding[]; retained: Finding[];
} {
  const key = (item: Finding): string => JSON.stringify([item.rule, item.step, item.detail, item.severity]);
  const first = new Set(before.map(key));
  const second = new Set(after.map(key));
  return { introduced: after.filter((item) => !first.has(key(item))),
    resolved: before.filter((item) => !second.has(key(item))),
    retained: after.filter((item) => first.has(key(item))) };
}
export function validateDateBoundary(value: string | null): boolean { return calendarDate(value); }
