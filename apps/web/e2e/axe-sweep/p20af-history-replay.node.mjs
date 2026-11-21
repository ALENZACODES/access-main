import test from "node:test";
import assert from "node:assert/strict";
import {
  initialHistory, currentVisit, appendEvent, replayHistory, historyFindings,
  navigationCells, navigationCellFindings, timelineSnapshot, historySummary,
} from "./p20af-history-replay.ts";

const event = (type, changes = {}) => ({ type, key: `event-${type}`, ...changes });
const codes = (items) => items.map((item) => item.code);
const baseline = () => initialHistory("/journey", "en");

test("initial route is preserved", () => assert.equal(currentVisit(baseline())?.route, "/journey"));
test("initial language is English", () => assert.equal(currentVisit(baseline())?.locale, "en"));
test("initial connection stays unknown", () => assert.equal(currentVisit(baseline())?.connection, "unknown"));
test("default initial route is home", () => assert.equal(currentVisit(initialHistory())?.route, "/"));
test("explicit French initial route is permitted", () => assert.equal(currentVisit(initialHistory("/help", "fr"))?.locale, "fr"));
test("external initial route is rejected", () => assert.throws(() => initialHistory("//host"), RangeError));
test("relative initial route is rejected", () => assert.throws(() => initialHistory("help"), RangeError));
test("empty route is rejected", () => assert.throws(() => initialHistory(""), RangeError));
test("history starts with exactly one entry", () => assert.equal(baseline().entries.length, 1));
test("history pointer starts at zero", () => assert.equal(baseline().pointer, 0));
test("initial timeline has no events", () => assert.deepEqual(baseline().history, []));

test("push adds a route entry", () => {
  const result = appendEvent(baseline(), event("push", { route: "/help" }));
  assert.deepEqual(result.timeline.entries.map((item) => item.route), ["/journey", "/help"]);
});
test("push sets the next history pointer", () => {
  const result = appendEvent(baseline(), event("push", { route: "/help" }));
  assert.equal(result.timeline.pointer, 1);
});
test("push preserves current language", () => {
  const result = appendEvent(initialHistory("/", "fr"), event("push", { route: "/help" }));
  assert.equal(currentVisit(result.timeline)?.locale, "fr");
});
test("push does not inherit a stale focus target", () => {
  const focused = appendEvent(baseline(), event("focus", { focus: "search" }));
  const next = appendEvent(focused.timeline, event("push", { route: "/help" }));
  assert.equal(currentVisit(next.timeline)?.focus, null);
});
test("push starts new route at top", () => {
  const scrolled = appendEvent(baseline(), event("scroll", { scrollY: 500 }));
  const next = appendEvent(scrolled.timeline, event("push", { route: "/help" }));
  assert.equal(currentVisit(next.timeline)?.scrollY, 0);
});
test("push with requested focus records that focus", () => {
  const next = appendEvent(baseline(), event("push", { route: "/help", focus: "heading" }));
  assert.equal(currentVisit(next.timeline)?.focus, "heading");
});
test("push invalid route is diagnosed", () => {
  assert.ok(codes(appendEvent(baseline(), event("push", { route: "//other" })).findings).includes("push-route-unknown"));
});
test("push missing route does not invent a destination", () => {
  const next = appendEvent(baseline(), event("push"));
  assert.equal(next.timeline.entries.length, 1);
  assert.ok(codes(next.findings).includes("push-route-unknown"));
});
test("replace updates the current route without adding entry", () => {
  const next = appendEvent(baseline(), event("replace", { route: "/help" }));
  assert.equal(next.timeline.entries.length, 1);
  assert.equal(currentVisit(next.timeline)?.route, "/help");
});
test("replace missing route is diagnosed", () => {
  assert.ok(codes(appendEvent(baseline(), event("replace")).findings).includes("replace-route-unknown"));
});
test("replace retains existing language", () => {
  const next = appendEvent(initialHistory("/", "fr"), event("replace", { route: "/help" }));
  assert.equal(currentVisit(next.timeline)?.locale, "fr");
});
test("replace preserves history pointer", () => {
  const next = appendEvent(baseline(), event("replace", { route: "/help" }));
  assert.equal(next.timeline.pointer, 0);
});

test("back returns to previous route", () => {
  const next = replayHistory(baseline(), [event("push", { route: "/help" }), event("back")]);
  assert.equal(currentVisit(next.timeline)?.route, "/journey");
});
test("forward returns to subsequent route", () => {
  const next = replayHistory(baseline(), [event("push", { route: "/help" }), event("back"), event("forward")]);
  assert.equal(currentVisit(next.timeline)?.route, "/help");
});
test("back at history start is informational", () => {
  const result = appendEvent(baseline(), event("back"));
  assert.ok(codes(result.findings).includes("back-boundary"));
  assert.equal(result.findings[0]?.severity, "information");
});
test("forward at history end is informational", () => {
  const result = appendEvent(baseline(), event("forward"));
  assert.ok(codes(result.findings).includes("forward-boundary"));
});
test("push after back truncates forward history", () => {
  const result = replayHistory(baseline(), [event("push", { route: "/help" }), event("back"), event("push", { route: "/places" })]);
  assert.deepEqual(result.timeline.entries.map((item) => item.route), ["/journey", "/places"]);
});
test("back restores previous scroll position", () => {
  const result = replayHistory(baseline(), [event("scroll", { scrollY: 275 }), event("push", { route: "/help" }), event("back")]);
  assert.equal(currentVisit(result.timeline)?.scrollY, 275);
});
test("back restores previous focused control", () => {
  const result = replayHistory(baseline(), [event("focus", { focus: "search" }), event("push", { route: "/help" }), event("back")]);
  assert.equal(currentVisit(result.timeline)?.focus, "search");
});
test("back retains recorded locale on previous entry", () => {
  const result = replayHistory(baseline(), [event("locale", { locale: "fr" }), event("push", { route: "/help" }), event("back")]);
  assert.equal(currentVisit(result.timeline)?.locale, "fr");
});

test("locale update does not change route", () => {
  const next = appendEvent(baseline(), event("locale", { locale: "fr" }));
  assert.equal(currentVisit(next.timeline)?.route, "/journey");
});
test("locale update records French", () => {
  const next = appendEvent(baseline(), event("locale", { locale: "fr" }));
  assert.equal(currentVisit(next.timeline)?.locale, "fr");
});
test("locale update without a language is unresolved", () => {
  assert.ok(codes(appendEvent(baseline(), event("locale")).findings).includes("locale-unknown"));
});
test("locale update does not rewrite historic routes", () => {
  const pushed = appendEvent(baseline(), event("push", { route: "/help" }));
  const changed = appendEvent(pushed.timeline, event("locale", { locale: "fr" }));
  assert.equal(changed.timeline.entries[0]?.route, "/journey");
});
test("offline cutover changes only current entry", () => {
  const next = appendEvent(baseline(), event("disconnect"));
  assert.equal(currentVisit(next.timeline)?.connection, "offline");
});
test("reconnect changes connection to online", () => {
  const next = replayHistory(baseline(), [event("disconnect"), event("reconnect")]);
  assert.equal(currentVisit(next.timeline)?.connection, "online");
});
test("offline cutover retains route", () => {
  const next = appendEvent(baseline(), event("disconnect"));
  assert.equal(currentVisit(next.timeline)?.route, "/journey");
});
test("offline cutover retains locale", () => {
  const next = appendEvent(initialHistory("/help", "fr"), event("disconnect"));
  assert.equal(currentVisit(next.timeline)?.locale, "fr");
});

test("restore with matching route passes", () => {
  assert.deepEqual(appendEvent(baseline(), event("restore", { route: "/journey", locale: "en" })).findings, []);
});
test("restore with route mismatch is surfaced", () => {
  assert.ok(codes(appendEvent(baseline(), event("restore", { route: "/help" })).findings).includes("restore-route-mismatch"));
});
test("restore with locale mismatch is surfaced", () => {
  assert.ok(codes(appendEvent(baseline(), event("restore", { route: "/journey", locale: "fr" })).findings).includes("restore-locale-mismatch"));
});
test("restore without an observed route is unresolved", () => {
  assert.ok(codes(appendEvent(baseline(), event("restore")).findings).includes("restore-route-unknown"));
});
test("restore must not silently move history pointer", () => {
  const pushed = appendEvent(baseline(), event("push", { route: "/help" }));
  const next = appendEvent(pushed.timeline, event("restore", { route: "/help" }));
  assert.equal(next.timeline.pointer, 1);
});

test("focus event records focused ID", () => {
  const next = appendEvent(baseline(), event("focus", { focus: "continue" }));
  assert.equal(currentVisit(next.timeline)?.focus, "continue");
});
test("focus event supports explicit null", () => {
  const next = replayHistory(baseline(), [event("focus", { focus: "continue" }), event("focus", { focus: null })]);
  assert.equal(currentVisit(next.timeline)?.focus, null);
});
test("missing focus observation remains informational", () => {
  const next = appendEvent(baseline(), event("focus"));
  assert.ok(codes(next.findings).includes("focus-observation-missing"));
});
test("scroll event records positive position", () => {
  const next = appendEvent(baseline(), event("scroll", { scrollY: 500 }));
  assert.equal(currentVisit(next.timeline)?.scrollY, 500);
});
test("scroll event accepts top position zero", () => {
  const next = appendEvent(baseline(), event("scroll", { scrollY: 0 }));
  assert.equal(currentVisit(next.timeline)?.scrollY, 0);
});
for (const value of [-1, NaN, Infinity]) {
  test(`scroll event rejects ${String(value)}`, () => {
    assert.ok(codes(appendEvent(baseline(), event("scroll", { scrollY: value })).findings).includes("scroll-invalid"));
  });
}
test("missing scroll observation stays unresolved", () => {
  assert.ok(codes(appendEvent(baseline(), event("scroll")).findings).includes("scroll-observation-missing"));
});
test("negative scroll does not overwrite prior valid position", () => {
  const next = replayHistory(baseline(), [event("scroll", { scrollY: 100 }), event("scroll", { scrollY: -1 })]);
  assert.equal(currentVisit(next.timeline)?.scrollY, 100);
});

test("event without id is surfaced", () => {
  assert.ok(codes(appendEvent(baseline(), event("focus", { key: "", focus: "search" })).findings).includes("history-event-key-empty"));
});
test("malformed event route is surfaced", () => {
  assert.ok(codes(appendEvent(baseline(), event("restore", { route: "//host" })).findings).includes("history-route-invalid"));
});
test("invalid history pointer cannot be read", () => {
  assert.equal(currentVisit({ ...baseline(), pointer: 100 }), null);
});
test("invalid history pointer prevents replay and reports error", () => {
  const next = appendEvent({ ...baseline(), pointer: 100 }, event("back"));
  assert.ok(codes(next.findings).includes("history-pointer-invalid"));
});
test("history validator finds pointer out of range", () => {
  assert.ok(codes(historyFindings({ ...baseline(), pointer: 100 })).includes("history-pointer-out-of-range"));
});
test("history validator finds unsafe entry route", () => {
  const changed = { ...baseline(), entries: [{ ...baseline().entries[0], route: "//host" }] };
  assert.ok(codes(historyFindings(changed)).includes("history-unsafe-route"));
});
test("history validator finds duplicate entry keys", () => {
  const changed = { ...baseline(), entries: [baseline().entries[0], baseline().entries[0]] };
  assert.ok(codes(historyFindings(changed)).includes("history-entry-key-duplicate"));
});
test("history validator finds blank entry key", () => {
  const changed = { ...baseline(), entries: [{ ...baseline().entries[0], key: "" }] };
  assert.ok(codes(historyFindings(changed)).includes("history-entry-key-empty"));
});
test("history validator finds invalid recorded scroll", () => {
  const changed = { ...baseline(), entries: [{ ...baseline().entries[0], scrollY: -1 }] };
  assert.ok(codes(historyFindings(changed)).includes("history-scroll-invalid"));
});
test("valid history has no structural findings", () => assert.deepEqual(historyFindings(baseline()), []));

test("navigation matrix has six cells per route", () => assert.equal(navigationCells(["/", "/help"]).length, 12));
test("navigation matrix accepts complete coverage", () => {
  const cells = navigationCells(["/", "/help"]);
  assert.deepEqual(navigationCellFindings(cells, cells), []);
});
test("navigation matrix rejects missing coverage", () => {
  const cells = navigationCells(["/"]);
  assert.ok(codes(navigationCellFindings(cells, cells.slice(1))).includes("navigation-cell-missing"));
});
test("navigation matrix rejects extra coverage", () => {
  const cells = navigationCells(["/"]);
  assert.ok(codes(navigationCellFindings(cells, [...cells, ...navigationCells(["/help"]).slice(0, 1)])).includes("navigation-cell-unexpected"));
});
test("navigation matrix rejects duplicate coverage", () => {
  const cells = navigationCells(["/"]);
  assert.ok(codes(navigationCellFindings(cells, [...cells, cells[0]])).includes("navigation-cell-duplicate"));
});
test("timeline snapshot is deterministic", () => {
  assert.deepEqual(timelineSnapshot(baseline()), { route: "/journey", locale: "en", pointer: 0, count: 1, focus: null });
});
test("invalid timeline snapshot remains null", () => assert.equal(timelineSnapshot({ ...baseline(), pointer: 9 }), null));
test("French history summary uses French heading", () => assert.match(historySummary([], "fr"), /^Parcours à examiner/));
test("English history summary uses English heading", () => assert.match(historySummary([], "en"), /^Journey issues/));
test("history summary de-duplicates identical findings", () => {
  const findings = appendEvent(baseline(), event("back")).findings;
  assert.equal(historySummary([...findings, ...findings], "en"), historySummary(findings, "en"));
});
