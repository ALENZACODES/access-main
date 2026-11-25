/** Deterministic model of route, locale and focus restoration across history states. */
import { safeRoute, type Locale, type Connection, type Problem } from "./p20af-transition-ledger.ts";
export type EventType = "push" | "replace" | "back" | "forward" | "locale" | "disconnect" | "reconnect" | "restore" | "focus" | "scroll";
export interface Visit { key: string; route: string; locale: Locale; focus: string | null; scrollY: number | null; connection: Connection; }
export interface Event { type: EventType; key: string; route?: string; locale?: Locale; focus?: string | null; scrollY?: number | null; }
export interface Timeline { entries: readonly Visit[]; pointer: number; history: readonly Event[]; }
export interface Replay { timeline: Timeline; findings: HistoryFinding[]; }
export interface HistoryFinding extends Problem { key: string; }
const issue = (code: string, key: string, detail: string, severity: Problem["severity"] = "error"): HistoryFinding => ({ code, key, detail, severity, at: 0 });
export function initialHistory(route = "/", locale: Locale = "en"): Timeline {
  if (!safeRoute(route)) throw new RangeError("Invalid initial route");
  return { entries: [{ key: "entry-0", route, locale, focus: null, scrollY: 0, connection: "unknown" }], pointer: 0, history: [] };
}
export function currentVisit(timeline: Timeline): Visit | null { return timeline.entries[timeline.pointer] ?? null; }
export function appendEvent(timeline: Timeline, event: Event): Replay {
  const entries = [...timeline.entries];
  const history = [...timeline.history, event];
  const findings: HistoryFinding[] = [];
  const old = entries[timeline.pointer];
  if (!old) return { timeline: { ...timeline, history }, findings: [issue("history-pointer-invalid", event.key, String(timeline.pointer))] };
  let pointer = timeline.pointer;
  if (!event.key.trim()) findings.push(issue("history-event-key-empty", event.key, event.type));
  if (event.route && !safeRoute(event.route)) findings.push(issue("history-route-invalid", event.key, event.route));
  const update = (changes: Partial<Visit>): void => { entries[pointer] = { ...old, ...changes }; };
  switch (event.type) {
    case "push": {
      if (!event.route || !safeRoute(event.route)) { findings.push(issue("push-route-unknown", event.key, event.route ?? "UNKNOWN")); break; }
      entries.splice(pointer + 1);
      entries.push({ ...old, key: event.key, route: event.route, focus: event.focus ?? null, scrollY: 0 });
      pointer = entries.length - 1;
      break;
    }
    case "replace": {
      if (!event.route || !safeRoute(event.route)) { findings.push(issue("replace-route-unknown", event.key, event.route ?? "UNKNOWN")); break; }
      update({ key: event.key, route: event.route, focus: event.focus ?? null });
      break;
    }
    case "back": {
      if (pointer === 0) findings.push(issue("back-boundary", event.key, old.route, "information"));
      else pointer -= 1;
      break;
    }
    case "forward": {
      if (pointer === entries.length - 1) findings.push(issue("forward-boundary", event.key, old.route, "information"));
      else pointer += 1;
      break;
    }
    case "locale": {
      if (!event.locale) findings.push(issue("locale-unknown", event.key, old.route));
      else update({ locale: event.locale });
      break;
    }
    case "disconnect": update({ connection: "offline" }); break;
    case "reconnect": update({ connection: "online" }); break;
    case "restore": {
      if (!event.route) findings.push(issue("restore-route-unknown", event.key, old.route));
      else if (old.route !== event.route) findings.push(issue("restore-route-mismatch", event.key, event.route));
      if (event.locale && old.locale !== event.locale) findings.push(issue("restore-locale-mismatch", event.key, event.locale));
      break;
    }
    case "focus": {
      if (event.focus === undefined) findings.push(issue("focus-observation-missing", event.key, old.route, "information"));
      else update({ focus: event.focus });
      break;
    }
    case "scroll": {
      if (event.scrollY === undefined || event.scrollY === null) findings.push(issue("scroll-observation-missing", event.key, old.route, "information"));
      else if (!Number.isFinite(event.scrollY) || event.scrollY < 0) findings.push(issue("scroll-invalid", event.key, String(event.scrollY)));
      else update({ scrollY: event.scrollY });
      break;
    }
  }
  return { timeline: { entries, pointer, history }, findings };
}
export function replayHistory(initial: Timeline, events: readonly Event[]): Replay {
  let timeline = initial;
  const findings: HistoryFinding[] = [];
  for (const event of events) {
    const result = appendEvent(timeline, event);
    timeline = result.timeline;
    findings.push(...result.findings);
  }
  return { timeline, findings };
}
export function historyFindings(timeline: Timeline): HistoryFinding[] {
  const issues: HistoryFinding[] = [];
  if (!Number.isInteger(timeline.pointer) || timeline.pointer < 0 || timeline.pointer >= timeline.entries.length) {
    issues.push(issue("history-pointer-out-of-range", "timeline", String(timeline.pointer)));
  }
  const keys = new Set<string>();
  for (const visit of timeline.entries) {
    if (!safeRoute(visit.route)) issues.push(issue("history-unsafe-route", visit.key, visit.route));
    if (!visit.key.trim()) issues.push(issue("history-entry-key-empty", visit.key, visit.route));
    if (keys.has(visit.key)) issues.push(issue("history-entry-key-duplicate", visit.key, visit.route));
    keys.add(visit.key);
    if (visit.scrollY !== null && (!Number.isFinite(visit.scrollY) || visit.scrollY < 0)) issues.push(issue("history-scroll-invalid", visit.key, String(visit.scrollY)));
  }
  return issues;
}
export function navigationCells(routes: readonly string[]): { route: string; locale: Locale; operation: "back" | "forward" | "restore" }[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((locale) =>
    (["back", "forward", "restore"] as const).map((operation) => ({ route, locale, operation }))));
}
export function navigationCellFindings(expected: ReturnType<typeof navigationCells>, actual: ReturnType<typeof navigationCells>): HistoryFinding[] {
  const issues: HistoryFinding[] = [];
  const key = (item: { route: string; locale: Locale; operation: string }): string => `${item.route}|${item.locale}|${item.operation}`;
  const all = new Set(expected.map(key));
  const seen = new Set<string>();
  for (const item of actual) {
    const value = key(item);
    if (seen.has(value)) issues.push(issue("navigation-cell-duplicate", value, value));
    seen.add(value);
    if (!all.has(value)) issues.push(issue("navigation-cell-unexpected", value, value));
  }
  for (const value of all) if (!seen.has(value)) issues.push(issue("navigation-cell-missing", value, value));
  return issues;
}
export function timelineSnapshot(timeline: Timeline): { route: string; locale: Locale; pointer: number; count: number; focus: string | null } | null {
  const current = currentVisit(timeline);
  return current ? { route: current.route, locale: current.locale, pointer: timeline.pointer, count: timeline.entries.length, focus: current.focus } : null;
}
export function historySummary(findings: readonly HistoryFinding[], locale: Locale): string {
  const heading = locale === "fr" ? "Parcours à examiner\u00a0:" : "Journey issues:";
  const entries = [...new Set(findings.map((problem) => `${problem.code} ${problem.key}: ${problem.detail}`))];
  return [heading, ...entries].join("\n");
}
