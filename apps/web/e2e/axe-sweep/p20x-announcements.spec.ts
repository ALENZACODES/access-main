import { expect, test } from "@playwright/test";
import {
  aggregateTimeline, announcedDifference, announcementFingerprint, formatFindings,
  isAnnounced, issueCodes, liveNodeFindings, nodeUrgency, timelineFindings,
  transitionFindings, validateFrame, visibleAnnouncements,
  type AnnouncementEvent, type AnnouncementFrame, type LiveNode, type Stage,
} from "./p20x-announcements";

const node = (change: Partial<LiveNode> = {}): LiveNode => ({
  key: "status", role: "status", ariaLive: null, ariaAtomic: "true", text: "3 results",
  hidden: false, busy: false, ...change,
});
const frame = (change: Partial<AnnouncementFrame> = {}): AnnouncementFrame => ({
  route: "/finders", locale: "en", stage: "ready", query: "library", resultCount: 3,
  nodes: [node()], activeElement: "search", documentBusy: false,
  accessibleHeading: "Search results", timestamp: 100, ...change,
});
const event = (change: Partial<AnnouncementEvent> = {}): AnnouncementEvent => ({
  event: "search", before: frame({ timestamp: 100, nodes: [node({ text: "Loading…" })], stage: "loading" }),
  after: frame({ timestamp: 130 }), originatingControl: "search", carriesResultCount: true,
  ...change,
});
const codes = (items: readonly { rule: string }[]): string[] => items.map((item) => item.rule);

for (const [role, ariaLive, expected] of [
  ["status", null, "polite"], ["alert", null, "assertive"],
  ["log", null, "polite"], ["timer", null, "off"],
  ["progressbar", null, "off"], ["status", "assertive", "assertive"],
  ["none", "off", "off"], ["none", "polite", "polite"],
  ["button", null, null], ["status", "loud", null],
] as const) {
  test(`live urgency role=${role ?? "none"} explicit=${ariaLive ?? "none"}`, () => {
    expect(nodeUrgency(node({ role, ariaLive }))).toBe(expected);
  });
}

for (const change of [
  { role: "alert" }, { ariaLive: "polite" }, { ariaLive: "assertive" },
  { text: "  THREE  results   " }, { ariaAtomic: "false" },
] satisfies readonly Partial<LiveNode>[]) {
  test(`visible live output accepted ${JSON.stringify(change)}`, () => {
    expect(isAnnounced(node(change))).toBe(true);
  });
}
for (const change of [
  { hidden: true }, { busy: true }, { text: "" }, { text: "  " },
  { ariaLive: "off" }, { role: null, ariaLive: null },
] satisfies readonly Partial<LiveNode>[]) {
  test(`suppressed live output ${JSON.stringify(change)}`, () => {
    expect(isAnnounced(node(change))).toBe(false);
  });
}

test("live-region fingerprint collapses case and whitespace", () => {
  expect(announcementFingerprint(node({ text: "Three   RESULTS" })))
    .toBe(announcementFingerprint(node({ text: " three results " })));
});
test("a warning and status with same message remain different fingerprints", () => {
  expect(announcementFingerprint(node({ role: "alert" })))
    .not.toBe(announcementFingerprint(node()));
});
test("a hidden duplicate does not become a second announcement", () => {
  const report = liveNodeFindings(frame({ nodes: [node(), node({ key: "hidden", hidden: true })] }));
  expect(codes(report)).not.toContain("duplicate-message");
});
test("two visible copies produce duplicate-message", () => {
  const report = liveNodeFindings(frame({ nodes: [node(), node({ key: "other" })] }));
  expect(codes(report)).toContain("duplicate-message");
});
test("repeated node keys fail regardless of message content", () => {
  const report = liveNodeFindings(frame({ nodes: [node(), node({ text: "Four results" })] }));
  expect(codes(report)).toContain("duplicate-live-node");
});
test("invalid aria-live fails closed", () => {
  expect(codes(liveNodeFindings(frame({ nodes: [node({ ariaLive: "loud" })] }))))
    .toContain("invalid-live-value");
});
test("invalid atomic is detected", () => {
  expect(codes(liveNodeFindings(frame({ nodes: [node({ ariaAtomic: "sometimes" })] }))))
    .toContain("invalid-atomic");
});
test("hidden alerts with text are reported as warnings", () => {
  const items = liveNodeFindings(frame({ nodes: [node({ role: "alert", hidden: true })] }));
  expect(items).toContainEqual(expect.objectContaining({ rule: "hidden-alert", severity: "warning" }));
});
test("ordinary unnamed structural roles are not automatically live", () => {
  const issues = liveNodeFindings(frame({ nodes: [node({ role: "heading", ariaLive: null })] }));
  expect(codes(issues)).toContain("unannounced-region");
});
test("explicit aria-live supports an otherwise ordinary role", () => {
  const issues = liveNodeFindings(frame({ nodes: [node({ role: "heading", ariaLive: "polite" })] }));
  expect(codes(issues)).not.toContain("unannounced-region");
});

test("multiset differences account for one removed duplicate", () => {
  const a = frame({ nodes: [node({ key: "one" }), node({ key: "two" })] });
  const b = frame({ nodes: [node({ key: "three" }), node({ key: "four" }), node({ key: "five", text: "New result" })] });
  expect(announcedDifference(a, b).map((entry) => entry.key)).toEqual(["five"]);
});
test("same message after route navigation is not new speech", () => {
  const from = frame({ route: "/places" });
  const to = frame({ route: "/help" });
  expect(announcedDifference(from, to)).toEqual([]);
});
test("changed message creates a new announcement", () => {
  const from = frame();
  const to = frame({ nodes: [node({ text: "No results" })], resultCount: 0 });
  expect(announcedDifference(from, to)).toHaveLength(1);
});
test("live output filters disabled nodes", () => {
  const f = frame({ nodes: [node(), node({ key: "busy", busy: true }), node({ key: "hidden", hidden: true })] });
  expect(visibleAnnouncements(f).map((entry) => entry.key)).toEqual(["status"]);
});

for (const stage of ["idle", "loading", "ready", "empty", "error", "offline"] as const) {
  test(`recognized stage ${stage}`, () => {
    const nodes = stage === "offline" ? [node({ text: "Offline mode" })] :
      stage === "error" ? [node({ role: "alert", text: "Search failed" })] :
        stage === "loading" ? [node({ text: "Loading results" })] : [node()];
    const snapshot = frame({ stage, nodes, resultCount: stage === "empty" ? 0 : 3 });
    expect(codes(validateFrame(snapshot))).not.toContain("invalid-stage");
  });
}
for (const route of ["", "finders", "//other"] as const) {
  test(`invalid route ${JSON.stringify(route)}`, () => {
    expect(codes(validateFrame(frame({ route })))).toContain("invalid-route");
  });
}
test("invalid negative count is detected", () => {
  expect(codes(validateFrame(frame({ resultCount: -2 })))).toContain("invalid-count");
});
test("fractional count is detected", () => {
  expect(codes(validateFrame(frame({ resultCount: 1.5 })))).toContain("invalid-count");
});
test("infinite count is detected", () => {
  expect(codes(validateFrame(frame({ resultCount: Infinity })))).toContain("invalid-count");
});
test("null count in ready state remains explicitly unknown", () => {
  expect(validateFrame(frame({ resultCount: null }))).toContainEqual(
    expect.objectContaining({ rule: "unknown-count", severity: "information" }));
});
test("empty state cannot report a nonzero result", () => {
  expect(codes(validateFrame(frame({ stage: "empty", resultCount: 4 })))).toContain("empty-count");
});
test("silent loading is rejected", () => {
  expect(codes(validateFrame(frame({ stage: "loading", nodes: [], documentBusy: false })))).toContain("loading-not-conveyed");
});
test("busy document can convey loading", () => {
  expect(codes(validateFrame(frame({ stage: "loading", nodes: [], documentBusy: true })))).not.toContain("loading-not-conveyed");
});
test("status text can convey loading", () => {
  expect(codes(validateFrame(frame({ stage: "loading", nodes: [node({ text: "Chargement…" })] })))).not.toContain("loading-not-conveyed");
});
test("error without alert fails", () => {
  expect(codes(validateFrame(frame({ stage: "error", nodes: [node()] })))).toContain("silent-error");
});
test("alerted error passes error announcement", () => {
  expect(codes(validateFrame(frame({ stage: "error", nodes: [node({ role: "alert", text: "The request failed" })] })))).not.toContain("silent-error");
});
for (const value of ["Offline", "Hors ligne", "Connexion perdue", "Network unavailable"] as const) {
  test(`offline announcement accepted ${value}`, () => {
    expect(codes(validateFrame(frame({ stage: "offline", nodes: [node({ text: value })] })))).not.toContain("silent-offline");
  });
}
test("offline with no announcement fails", () => {
  expect(codes(validateFrame(frame({ stage: "offline", nodes: [node({ text: "Ready" })] })))).toContain("silent-offline");
});
test("heading must be nonempty", () => {
  expect(codes(validateFrame(frame({ accessibleHeading: " " })))).toContain("missing-heading");
});
test("time must be a nonnegative finite number", () => {
  for (const timestamp of [-1, Number.NaN, Infinity]) {
    expect(codes(validateFrame(frame({ timestamp })))).toContain("invalid-time");
  }
});

test("valid search announces a changed count", () => {
  expect(transitionFindings(event())).toEqual([]);
});
test("search without a changed message is silent", () => {
  const f = frame();
  expect(codes(transitionFindings(event({ before: f, after: frame({ timestamp: 130 }) })))).toContain("silent-results");
});
test("search count must appear in a new announcement when requested", () => {
  const e = event({ after: frame({ nodes: [node({ text: "Results updated" })] }) });
  expect(codes(transitionFindings(e))).toContain("result-count-omitted");
});
test("count assertions are optional when the event does not carry count", () => {
  const e = event({ carriesResultCount: false, after: frame({ nodes: [node({ text: "Results updated" })] }) });
  expect(codes(transitionFindings(e))).not.toContain("result-count-omitted");
});
test("query reset should provide fresh live feedback", () => {
  const e = event({ event: "reset", before: frame({ query: "old" }), after: frame({ query: "", timestamp: 130 }) });
  expect(codes(transitionFindings(e))).toContain("silent-reset");
});
test("reset with a changed message does not require a warning", () => {
  const e = event({ event: "reset", before: frame({ query: "old" }), after: frame({ query: "", nodes: [node({ text: "Search cleared" })], timestamp: 130 }) });
  expect(codes(transitionFindings(e))).not.toContain("silent-reset");
});
test("a normal search cannot change document locale", () => {
  expect(codes(transitionFindings(event({ after: frame({ locale: "fr" }) })))).toContain("unrequested-language-change");
});
test("language change must apply the requested locale", () => {
  const e = event({ event: "language", requestedLocale: "fr", before: frame(), after: frame({ locale: "en" }) });
  expect(codes(transitionFindings(e))).toContain("language-not-applied");
});
test("language change needs new accessible text", () => {
  const e = event({ event: "language", requestedLocale: "fr", before: frame(), after: frame({ locale: "fr" }) });
  expect(codes(transitionFindings(e))).toContain("silent-language-change");
});
test("a localized new message satisfies language-change announcement", () => {
  const e = event({ event: "language", requestedLocale: "fr", before: frame(), after: frame({ locale: "fr", nodes: [node({ text: "3 résultats" })] }) });
  expect(codes(transitionFindings(e))).not.toContain("silent-language-change");
});
test("offline event requires offline stage", () => {
  expect(codes(transitionFindings(event({ event: "offline" })))).toContain("offline-state-missing");
});
test("online event cannot remain offline", () => {
  const e = event({ event: "online", after: frame({ stage: "offline", nodes: [node({ text: "Offline" })] }) });
  expect(codes(transitionFindings(e))).toContain("online-state-stale");
});
test("non-navigation action must keep route", () => {
  expect(codes(transitionFindings(event({ after: frame({ route: "/places" }) })))).toContain("unexpected-navigation");
});
test("navigation action can change route", () => {
  const e = event({ event: "navigate", after: frame({ route: "/places" }) });
  expect(codes(transitionFindings(e))).not.toContain("unexpected-navigation");
});
test("expected destination must match actual route", () => {
  const e = event({ event: "navigate", expectedRoute: "/help", after: frame({ route: "/places" }) });
  expect(codes(transitionFindings(e))).toContain("wrong-route");
});
test("a control retains focus after search", () => {
  expect(codes(transitionFindings(event({ originatingControl: "search" })))).not.toContain("focus-not-preserved");
});
test("unexpected focus move is detected", () => {
  expect(codes(transitionFindings(event({ after: frame({ activeElement: "other" }) })))).toContain("focus-not-preserved");
});
test("navigation does not demand focus restoration", () => {
  const e = event({ event: "navigate", after: frame({ activeElement: null, route: "/help" }) });
  expect(codes(transitionFindings(e))).not.toContain("focus-not-preserved");
});
test("monotonic event time is required", () => {
  expect(codes(transitionFindings(event({ after: frame({ timestamp: 99 }) })))).toContain("time-regression");
});
test("late speech is detected by timeline deadline", () => {
  const e = event({ after: frame({ timestamp: 200 }) });
  expect(codes(timelineFindings({ route: "/finders", events: [e], maxAgeMs: 50 }))).toContain("late-announcement");
});
test("timeline recognizes noncontiguous intermediate frames", () => {
  const e1 = event();
  const e2 = event({ before: frame({ timestamp: 200 }), after: frame({ timestamp: 230 }) });
  expect(codes(timelineFindings({ route: "/finders", events: [e1, e2] }))).toContain("timeline-gap");
});
test("timeline finds unexpected route changes", () => {
  const e = event({ after: frame({ route: "/other" }) });
  expect(codes(timelineFindings({ route: "/finders", events: [e] }))).toContain("timeline-route");
});
test("timeline totals count errors and warnings by severity", () => {
  const e = event({ event: "reset", before: frame({ query: "old" }), after: frame({ query: "", timestamp: 130 }) });
  const result = aggregateTimeline({ route: "/finders", events: [e] });
  expect(result.events).toBe(1);
  expect(result.warnings).toBeGreaterThan(0);
  expect(result.findings).toHaveLength(result.errors + result.warnings + result.information);
});
test("reporting deduplicates identical findings", () => {
  const repeated = validateFrame(frame({ accessibleHeading: "" }));
  expect(formatFindings([...repeated, ...repeated]).split("\n").length).toBe(repeated.length);
});
test("reporting makes truncation explicit", () => {
  const repeated = Array.from({ length: 10 }, (_, index) => ({ rule: "r", route: "/", detail: String(index), severity: "error" as const }));
  expect(formatFindings(repeated, 2)).toContain("8 more findings");
});
test("issueCodes retains issue identity and ordering", () => {
  const problems = validateFrame(frame({ accessibleHeading: "", resultCount: -1 }));
  expect(issueCodes(problems)).toEqual(problems.map((entry) => entry.rule));
});
