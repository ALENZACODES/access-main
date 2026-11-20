import test from "node:test";
import assert from "node:assert/strict";
import {
  initialReplay, replayOne, replay, replayCompleteness, replayStatistics,
  sameReplayIdentity, fallbackOutcome, localRecordLabel,
} from "./p20ah-replay.ts";
const source = () => ({ source: "Synthetic source", licence: "Synthetic licence", retrievedOn: "2026-11-20", tier: "E" });
const evidence = (change = {}) => ({
  id: "one", label: "Example", value: "Observed", state: "KNOWN", provenance: source(), ...change,
});
const packet = (change = {}) => ({
  id: "packet", schema: 1, locale: "en", originRoute: "/journey", createdOn: "2026-11-20",
  connection: "offline", sourceOfCopy: "saved", purpose: "take-along", redacted: true, records: [evidence()], ...change,
});
const codes = (items) => items.map((item) => item.code);

for (const [route, locale] of [["/", "en"], ["/help", "fr"], ["/journey", "en"], ["/more/diary", "fr"]]) {
  test(`initial replay uses route ${route} and locale ${locale}`, () => {
    const state = initialReplay(route, locale);
    assert.equal(state.screen.route, route);
    assert.equal(state.screen.locale, locale);
    assert.equal(state.screen.connection, "UNKNOWN");
    assert.deepEqual(state.pages, [route]);
    assert.equal(state.cursor, 0);
  });
}
test("empty replay keeps its initial state and returns no transitions", () => {
  const state = initialReplay();
  const result = replay(state, []);
  assert.equal(result.final, state);
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.diagnostics, []);
});
for (const route of ["/journey", "/places", "/help", "/more/auditors", "/settings/language"]) {
  test(`navigation to safe route ${route} extends history`, () => {
    const first = initialReplay();
    const step = replayOne(first, { kind: "navigate", route });
    assert.equal(step.after.screen.route, route);
    assert.deepEqual(step.after.pages, ["/", route]);
    assert.equal(step.after.cursor, 1);
    assert.deepEqual(step.diagnostics, []);
  });
}
for (const route of ["bad", "", "//outside", "/a/../b", "/a?x", "/a#id", "/a\\b", "/a\u0001b"]) {
  test(`unsafe navigation ${JSON.stringify(route)} does not change history`, () => {
    const first = initialReplay();
    const step = replayOne(first, { kind: "navigate", route });
    assert.equal(step.after, first);
    assert.ok(codes(step.diagnostics).includes("navigate-unsafe"));
  });
}
test("language action keeps route and focus", () => {
  const first = replayOne(initialReplay("/journey"), { kind: "focus", target: "next" }).after;
  const switched = replayOne(first, { kind: "language", locale: "fr" });
  assert.equal(switched.after.screen.locale, "fr");
  assert.equal(switched.after.screen.route, "/journey");
  assert.equal(switched.after.screen.activeId, "next");
  assert.deepEqual(switched.diagnostics, []);
});
test("language action flags no-op without changing source values", () => {
  const first = initialReplay();
  const result = replayOne(first, { kind: "language", locale: "en" });
  assert.ok(codes(result.diagnostics).includes("language-unchanged"));
});
test("focus target can be null when nothing is focused", () => {
  const state = initialReplay();
  assert.equal(replayOne(state, { kind: "focus", target: null }).after.screen.activeId, null);
});
test("focus update rejects an empty identifier", () => {
  const state = initialReplay();
  const step = replayOne(state, { kind: "focus", target: " " });
  assert.ok(codes(step.diagnostics).includes("focus-empty"));
  assert.equal(step.after, state);
});
for (const target of ["next", "dialog-close", "search", "skip-main", "result-one", "locale-switch"]) {
  test(`focus update accepts nonempty identifier ${target}`, () => {
    const result = replayOne(initialReplay(), { kind: "focus", target });
    assert.equal(result.after.screen.activeId, target);
    assert.deepEqual(result.diagnostics, []);
  });
}
test("disconnect changes only connection state and preserves route", () => {
  const first = replayOne(initialReplay(), { kind: "reconnect" }).after;
  const step = replayOne(first, { kind: "disconnect" });
  assert.equal(step.after.screen.connection, "offline");
  assert.equal(step.after.screen.route, first.screen.route);
  assert.deepEqual(step.diagnostics, []);
});
test("disconnect while already offline reports redundant transition", () => {
  const first = replayOne(initialReplay(), { kind: "disconnect" }).after;
  const step = replayOne(first, { kind: "disconnect" });
  assert.ok(codes(step.diagnostics).includes("already-offline"));
});
test("reconnect changes connection to online", () => {
  const first = replayOne(initialReplay(), { kind: "disconnect" }).after;
  const result = replayOne(first, { kind: "reconnect" });
  assert.equal(result.after.screen.connection, "online");
  assert.deepEqual(result.diagnostics, []);
});
test("reconnect while online warns about an unnecessary change", () => {
  const first = replayOne(initialReplay(), { kind: "reconnect" }).after;
  assert.ok(codes(replayOne(first, { kind: "reconnect" }).diagnostics).includes("already-online"));
});
test("search while link state UNKNOWN never starts network work", () => {
  const step = replayOne(initialReplay(), { kind: "search", query: "library" });
  assert.equal(step.after.screen.status, "UNKNOWN");
  assert.equal(step.after.busy, false);
  assert.ok(codes(step.diagnostics).includes("search-connection-unknown"));
});
test("search while offline never asserts a network result", () => {
  const offline = replayOne(initialReplay(), { kind: "disconnect" }).after;
  const result = replayOne(offline, { kind: "search", query: "library" });
  assert.equal(result.after.screen.status, "UNKNOWN");
  assert.ok(codes(result.diagnostics).includes("search-offline"));
});
for (const query of ["library", "ramp", "lift", "", "French text", "1234", "UNKNOWN"]) {
  test(`online search retains typed query ${JSON.stringify(query)} while loading`, () => {
    const online = replayOne(initialReplay(), { kind: "reconnect" }).after;
    const result = replayOne(online, { kind: "search", query });
    assert.equal(result.after.query, query);
    assert.equal(result.after.screen.status, "loading");
    assert.equal(result.after.busy, true);
  });
}
test("clear removes typed query and returns to idle", () => {
  const online = replayOne(initialReplay(), { kind: "reconnect" }).after;
  const searched = replayOne(online, { kind: "search", query: "library" }).after;
  const result = replayOne(searched, { kind: "clear" });
  assert.equal(result.after.query, "");
  assert.equal(result.after.screen.status, "idle");
  assert.equal(result.after.busy, false);
});
test("retry requires an observed error", () => {
  const step = replayOne(initialReplay(), { kind: "retry" });
  assert.ok(codes(step.diagnostics).includes("retry-without-error"));
});
test("retry while offline preserves uncertainty", () => {
  const disconnected = replayOne(initialReplay(), { kind: "disconnect" }).after;
  const state = { ...disconnected, screen: { ...disconnected.screen, status: "error" } };
  const step = replayOne(state, { kind: "retry" });
  assert.equal(step.after.screen.status, "UNKNOWN");
  assert.deepEqual(step.diagnostics, []);
});
test("retry while online can enter an explicit loading state", () => {
  const connected = replayOne(initialReplay(), { kind: "reconnect" }).after;
  const state = { ...connected, screen: { ...connected.screen, status: "error" } };
  const step = replayOne(state, { kind: "retry" });
  assert.equal(step.after.screen.status, "loading");
});
test("save replaces records without changing provenance", () => {
  const step = replayOne(initialReplay(), { kind: "save", items: [evidence()] });
  assert.equal(step.after.screen.records.length, 1);
  assert.equal(step.after.screen.records[0]?.provenance.source, "Synthetic source");
});
test("save refuses repeated identifiers", () => {
  const step = replayOne(initialReplay(), { kind: "save", items: [evidence(), evidence()] });
  assert.ok(codes(step.diagnostics).includes("save-duplicate"));
});
test("save accepts an explicitly unknown record without upgrading it", () => {
  const step = replayOne(initialReplay(), { kind: "save", items: [evidence({ value: "UNKNOWN", state: "UNKNOWN" })] });
  assert.equal(step.after.screen.records[0]?.value, "UNKNOWN");
  assert.equal(step.after.screen.records[0]?.state, "UNKNOWN");
});
test("export refuses absent handoff", () => {
  const state = initialReplay("/journey");
  const step = replayOne(state, { kind: "export", packet: null });
  assert.ok(codes(step.diagnostics).includes("export-empty"));
});
test("export refuses records not present on the screen", () => {
  const step = replayOne(initialReplay("/journey"), { kind: "export", packet: packet() });
  assert.ok(codes(step.diagnostics).includes("export-unseen-record"));
});
test("export detects mismatched route even if the payload is syntactically valid", () => {
  const saved = replayOne(initialReplay(), { kind: "save", items: [evidence()] }).after;
  const step = replayOne(saved, { kind: "export", packet: packet() });
  assert.ok(codes(step.diagnostics).includes("export-route"));
});
test("export detects mismatched locale", () => {
  const saved = replayOne(initialReplay("/journey"), { kind: "save", items: [evidence()] }).after;
  const step = replayOne(saved, { kind: "export", packet: packet({ locale: "fr" }) });
  assert.ok(codes(step.diagnostics).includes("export-locale"));
});
for (const [key, value] of [["source", "Other source"], ["licence", "Other licence"], ["retrievedOn", "2026-11-19"], ["tier", "A"]]) {
  test(`export detects provenance change to ${key}`, () => {
    const saved = replayOne(initialReplay("/journey"), { kind: "save", items: [evidence()] }).after;
    const changed = evidence({ provenance: { ...source(), [key]: value } });
    const step = replayOne(saved, { kind: "export", packet: packet({ records: [changed] }) });
    assert.ok(codes(step.diagnostics).includes("export-changed-source"));
  });
}
test("export of unchanged synthetic record preserves evidence provenance", () => {
  const saved = replayOne(initialReplay("/journey"), { kind: "save", items: [evidence()] }).after;
  const result = replayOne(saved, { kind: "export", packet: packet() });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.after.lastPacket?.id, "packet");
});
test("history navigation back and forward restores paths", () => {
  const result = replay(initialReplay(), [
    { kind: "navigate", route: "/help" },
    { kind: "navigate", route: "/journey" },
    { kind: "back" }, { kind: "forward" },
  ]);
  assert.equal(result.final.screen.route, "/journey");
  assert.equal(result.final.cursor, 2);
  assert.deepEqual(result.final.pages, ["/", "/help", "/journey"]);
});
test("back at the beginning emits explicit boundary finding", () => {
  assert.ok(codes(replayOne(initialReplay(), { kind: "back" }).diagnostics).includes("history-back-end"));
});
test("forward at the end emits explicit boundary finding", () => {
  assert.ok(codes(replayOne(initialReplay(), { kind: "forward" }).diagnostics).includes("history-forward-end"));
});
test("navigation after back discards forward entries", () => {
  const result = replay(initialReplay(), [
    { kind: "navigate", route: "/places" },
    { kind: "navigate", route: "/help" }, { kind: "back" },
    { kind: "navigate", route: "/journey" },
  ]);
  assert.deepEqual(result.final.pages, ["/", "/places", "/journey"]);
});
test("replay statistics count actions without creating synthetic events", () => {
  const result = replay(initialReplay(), [{ kind: "focus", target: "search" }, { kind: "clear" }, { kind: "clear" }]);
  const stats = replayStatistics(result);
  assert.equal(stats.focus, 1);
  assert.equal(stats.clear, 2);
  assert.equal(stats.export, undefined);
});
test("replay completeness checks history and continuity", () => {
  const result = replay(initialReplay(), [{ kind: "navigate", route: "/help" }, { kind: "back" }]);
  assert.deepEqual(replayCompleteness(result), []);
});
test("replay detects an invalid route-history index", () => {
  const result = replay(initialReplay(), [{ kind: "clear" }]);
  const corrupted = { ...result, steps: result.steps.map((step) => ({ ...step, after: { ...step.after, cursor: 5 } })) };
  assert.ok(codes(replayCompleteness(corrupted)).includes("replay-cursor-invalid"));
});
test("replay detects a mismatched route versus active history entry", () => {
  const result = replay(initialReplay(), [{ kind: "clear" }]);
  const corrupted = { ...result, steps: result.steps.map((step) => ({ ...step, after: { ...step.after, screen: { ...step.after.screen, route: "/other" } } })) };
  assert.ok(codes(replayCompleteness(corrupted)).includes("replay-route-history-drift"));
});
test("same replay identity is stable under query changes", () => {
  const original = initialReplay();
  assert.equal(sameReplayIdentity(original, { ...original, query: "example" }), true);
});
test("same replay identity changes when locale changes", () => {
  const original = initialReplay();
  assert.equal(sameReplayIdentity(original, { ...original, screen: { ...original.screen, locale: "fr" } }), false);
});
test("same replay identity changes when history location changes", () => {
  const original = initialReplay();
  assert.equal(sameReplayIdentity(original, { ...original, cursor: 1 }), false);
});
for (const connection of ["online", "UNKNOWN"]) {
  test(`fallback stays UNKNOWN for ${connection} regardless of bundled records`, () => {
    assert.equal(fallbackOutcome(connection, [evidence()]), "UNKNOWN");
  });
}
test("offline fallback with a saved record is ready only as a local state", () => {
  assert.equal(fallbackOutcome("offline", [evidence()]), "ready");
});
test("offline fallback without saved records is empty, not a place claim", () => {
  assert.equal(fallbackOutcome("offline", []), "empty");
});
test("French record label changes only the user-facing prefix", () => {
  assert.equal(localRecordLabel(evidence(), "fr"), "Fiche Example");
});
test("English record label uses localized prefix", () => {
  assert.equal(localRecordLabel(evidence(), "en"), "Record Example");
});
test("unknown label remains UNKNOWN even when the requested language is French", () => {
  assert.equal(localRecordLabel(evidence({ label: null }), "fr"), "UNKNOWN");
});
