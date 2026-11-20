import test from "node:test";
import assert from "node:assert/strict";
import {
  available, keyboardEligible, controlFindings, focusOrder, screenFindings,
  stepFindings, sameScreenIdentity, sequenceFindings, routeCoverage, coverageKey, coverageFindings,
} from "./p20an-interactions.ts";
import { exampleControl, exampleAnnouncement, exampleScreen, exampleStep, localizedScreen } from "./p20an-fixtures.ts";
const codes = (values) => values.map((item) => item.code);

test("visible enabled and noninert control remains available", () => {
  assert.equal(available(exampleControl()), true);
  assert.equal(keyboardEligible(exampleControl()), true);
});
for (const change of [{ visible: false }, { enabled: false }, { inert: true }]) {
  test(`unavailable control ${JSON.stringify(change)} is excluded`, () => {
    assert.equal(available(exampleControl(change)), false);
    assert.equal(keyboardEligible(exampleControl(change)), false);
  });
}
for (const tabIndex of [-1, -2, 1.5, Number.NaN]) {
  test(`tab index ${tabIndex} cannot become a sequential stop`, () => {
    assert.equal(keyboardEligible(exampleControl({ tabIndex })), false);
  });
}
test("visible controls with a name and 44px geometry pass", () => {
  assert.deepEqual(controlFindings(exampleControl(), "/places"), []);
});
for (const [change, expected] of [
  [{ accessibleName: null }, "control-name-UNKNOWN"],
  [{ accessibleName: " " }, "control-name-UNKNOWN"],
  [{ width: null }, "control-width-UNKNOWN"],
  [{ width: Number.NaN }, "control-width-UNKNOWN"],
  [{ width: 43 }, "control-width-small"],
  [{ height: null }, "control-height-UNKNOWN"],
  [{ height: Infinity }, "control-height-UNKNOWN"],
  [{ height: 43 }, "control-height-small"],
  [{ tabIndex: -3 }, "control-tabindex-invalid"],
  [{ tabIndex: 2.5 }, "control-tabindex-invalid"],
  [{ focusVisible: false }, "control-focus-not-visible"],
]) {
  test(`control diagnostic detects ${expected} in ${JSON.stringify(change)}`, () => {
    assert.ok(codes(controlFindings(exampleControl(change), "/places")).includes(expected));
  });
}
test("disabled controls do not produce active touch-target errors", () => {
  assert.deepEqual(controlFindings(exampleControl({ enabled: false, width: 1, height: 1 }), "/places"), []);
});
test("positive tab stops are sorted in ascending order", () => {
  const controls = [exampleControl({ id: "second", tabIndex: 2 }), exampleControl({ id: "first", tabIndex: 1 })];
  assert.deepEqual(focusOrder(controls), ["first", "second"]);
});
test("non-focusable elements are excluded from sequential focus order", () => {
  const controls = [exampleControl({ id: "hidden", visible: false }), exampleControl({ id: "focusable" })];
  assert.deepEqual(focusOrder(controls), ["focusable"]);
});
test("reference screen has no findings", () => {
  assert.deepEqual(screenFindings(exampleScreen()), []);
});
for (const [change, expected] of [
  [{ route: "//host" }, "screen-route-unsafe"],
  [{ mainCount: 0 }, "screen-main-count"],
  [{ mainCount: 2 }, "screen-main-count"],
  [{ title: "" }, "screen-title-missing"],
  [{ heading: "" }, "screen-heading-missing"],
  [{ scrollY: -1 }, "screen-scroll-invalid"],
  [{ scrollY: Number.NaN }, "screen-scroll-invalid"],
  [{ historyIndex: -1 }, "screen-history-invalid"],
  [{ historyIndex: 1.5 }, "screen-history-invalid"],
  [{ focusId: "missing" }, "focus-not-in-controls"],
  [{ phase: "loading" }, "loading-not-announced"],
  [{ phase: "error" }, "outcome-silent"],
  [{ phase: "empty" }, "outcome-silent"],
]) {
  test(`screen diagnoses ${expected}`, () => {
    assert.ok(codes(screenFindings(exampleScreen(change))).includes(expected));
  });
}
test("a live busy status permits the loading phase", () => {
  const observation = exampleScreen({ phase: "loading", announcements: [exampleAnnouncement({ text: "Loading", busy: true })] });
  assert.deepEqual(screenFindings(observation), []);
});
test("empty outcome is announced politely", () => {
  const observation = exampleScreen({ phase: "empty", announcements: [exampleAnnouncement({ text: "No results found." })] });
  assert.deepEqual(screenFindings(observation), []);
});
test("French announcement language tracks the French document", () => {
  const observation = exampleScreen({ locale: "fr", announcements: [exampleAnnouncement({ language: "fr", text: "Aucun résultat." })] });
  assert.deepEqual(screenFindings(observation), []);
});
test("English announcement on a French page is diagnosed", () => {
  const observation = exampleScreen({ locale: "fr", announcements: [exampleAnnouncement()] });
  assert.ok(codes(screenFindings(observation)).includes("announcement-language-mismatch"));
});
test("empty live text is diagnosed", () => {
  assert.ok(codes(screenFindings(exampleScreen({ announcements: [exampleAnnouncement({ text: " " })] })))
    .includes("announcement-empty"));
});
test("invalid emission clock remains visible", () => {
  assert.ok(codes(screenFindings(exampleScreen({ announcements: [exampleAnnouncement({ emittedAt: -1 })] })))
    .includes("announcement-time-invalid"));
});
test("duplicate focusable identifiers are not silently discarded", () => {
  const observation = exampleScreen({ controls: [exampleControl(), exampleControl()] });
  assert.ok(codes(screenFindings(observation)).includes("control-id-duplicate"));
});
test("modal focus must remain inside its owning dialog", () => {
  const observation = exampleScreen({ activeDialogId: "dialog", controls: [exampleControl({ dialogId: null })] });
  const issues = codes(screenFindings(observation));
  assert.ok(issues.includes("modal-focus-outside"));
  assert.ok(issues.includes("modal-background-focusable"));
});
test("modal focus inside the dialog passes", () => {
  const observation = exampleScreen({ activeDialogId: "dialog", controls: [exampleControl({ dialogId: "dialog" })] });
  assert.deepEqual(screenFindings(observation), []);
});
test("well-formed disconnect step passes", () => {
  assert.deepEqual(stepFindings(exampleStep()), []);
});
for (const [change, expected] of [
  [{ observed: false }, "step-not-observed"],
  [{ expectedRoute: "/help" }, "step-route-not-reached"],
  [{ kind: "disconnect", after: exampleScreen() }, "disconnect-not-observed"],
  [{ kind: "reconnect", after: exampleScreen({ connection: "UNKNOWN" }) }, "reconnect-not-observed"],
  [{ kind: "retry" }, "retry-without-failure"],
  [{ kind: "clear", after: exampleScreen({ phase: "loading" }) }, "clear-triggered-loading"],
  [{ preserveFocus: true, after: exampleScreen({ focusId: null, connection: "offline" }) }, "focus-not-preserved"],
  [{ at: -2 }, "step-time-invalid"],
  [{ at: Infinity }, "step-time-invalid"],
]) {
  test(`transition problem ${expected} is visible`, () => {
    assert.ok(codes(stepFindings(exampleStep(change))).includes(expected));
  });
}
test("language switch preserves route but changes locale", () => {
  const before = localizedScreen("en", "online");
  const after = localizedScreen("fr", "online");
  assert.deepEqual(stepFindings(exampleStep({ kind: "language", before, after, preserveFocus: true })), []);
});
test("language switch that remains in the old locale fails", () => {
  assert.ok(codes(stepFindings(exampleStep({ kind: "language", before: exampleScreen(), after: exampleScreen() })))
    .includes("language-did-not-change"));
});
test("non-navigation events may not move to a different route", () => {
  const change = exampleStep({ kind: "search", after: exampleScreen({ route: "/help" }) });
  assert.ok(codes(stepFindings(change)).includes("action-changed-route"));
});
test("route and language are screen identity, focus is not", () => {
  assert.equal(sameScreenIdentity(exampleScreen(), exampleScreen({ focusId: null })), true);
  assert.equal(sameScreenIdentity(exampleScreen(), exampleScreen({ locale: "fr" })), false);
});
test("connected sequence has no continuity findings", () => {
  const step = exampleStep();
  assert.deepEqual(sequenceFindings({ id: "journey", initial: step.before, steps: [step] }), []);
});
test("broken action chain is diagnosed", () => {
  const step = exampleStep({ before: exampleScreen({ route: "/help" }) });
  assert.ok(codes(sequenceFindings({ id: "journey", initial: exampleScreen(), steps: [step] })).includes("sequence-chain-broken"));
});
test("unnamed sequence does not silently pass", () => {
  assert.ok(codes(sequenceFindings({ id: "", initial: exampleScreen(), steps: [] })).includes("sequence-id-empty"));
});
test("matrix has four cells per static route", () => {
  assert.equal(routeCoverage(["/", "/help"]).length, 8);
});
test("coverage key distinguishes route, locale and viewport", () => {
  assert.notEqual(coverageKey({ route: "/", locale: "en", width: 320 }), coverageKey({ route: "/", locale: "fr", width: 320 }));
  assert.notEqual(coverageKey({ route: "/", locale: "en", width: 320 }), coverageKey({ route: "/help", locale: "en", width: 320 }));
});
test("complete matrix passes", () => {
  const expected = routeCoverage(["/", "/help"]);
  assert.deepEqual(coverageFindings(expected, expected), []);
});
test("missing matrix cell fails", () => {
  const expected = routeCoverage(["/"]);
  assert.ok(codes(coverageFindings(expected, expected.slice(1))).includes("coverage-missing"));
});
test("unexpected matrix cell fails", () => {
  const expected = routeCoverage(["/"]);
  assert.ok(codes(coverageFindings(expected, [...expected, { route: "/new", locale: "en", width: 320 }])).includes("coverage-unexpected"));
});
test("duplicate matrix cell fails", () => {
  const expected = routeCoverage(["/"]);
  assert.ok(codes(coverageFindings(expected, [...expected, expected[0]])).includes("coverage-duplicate"));
});
