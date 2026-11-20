import test from "node:test";
import assert from "node:assert/strict";
import {
  browserFrameFindings, stateTransitionFindings, keyboardSequenceFindings, browserFindingSummary,
} from "./p20ah-browser.ts";
const control = (changes = {}) => ({
  id: "search", role: "button", name: "Search", visible: true,
  disabled: false, inert: false, tabIndex: 0, width: 44, height: 44,
  focusOutline: true, ...changes,
});
const frame = (changes = {}) => ({
  route: "/journey", language: "en", title: "Journey - the App", heading: "Journey",
  mainCount: 1, activeId: "search", scrollWidth: 320, viewportWidth: 320,
  controls: [control()], statuses: [], online: true, capturedOn: 100, ...changes,
});
const codes = (findings) => findings.map((finding) => finding.code);

test("read-only browser snapshot passes basic screen contracts", () => {
  assert.deepEqual(browserFrameFindings(frame(), "en"), []);
});
test("French read-only snapshot passes when localized names and document lang are present", () => {
  const french = frame({ language: "fr", controls: [control({ name: "Rechercher" })] });
  assert.deepEqual(browserFrameFindings(french, "fr"), []);
});
for (const [change, issue] of [
  [{ language: "en" }, "language-mismatch"],
  [{ language: "und" }, "language-mismatch"],
  [{ language: "" }, "language-mismatch"],
  [{ title: "" }, "document-title"],
  [{ heading: "" }, "main-heading"],
  [{ mainCount: 0 }, "main-count"],
  [{ mainCount: 2 }, "main-count"],
  [{ scrollWidth: 400 }, "horizontal-overflow"],
]) {
  test(`frame reports ${issue} on ${JSON.stringify(change)}`, () => {
    const expected = issue === "language-mismatch" ? "fr" : "en";
    assert.ok(codes(browserFrameFindings(frame(change), expected)).includes(issue));
  });
}
for (const [change, issue] of [
  [{ name: "" }, "control-unnamed"],
  [{ name: " " }, "control-unnamed"],
  [{ width: 43 }, "target-width"],
  [{ width: 0 }, "target-width"],
  [{ width: Number.NaN }, "target-width"],
  [{ height: 43 }, "target-height"],
  [{ height: 0 }, "target-height"],
  [{ height: Infinity }, "target-height"],
  [{ tabIndex: -2 }, "tab-index-invalid"],
  [{ tabIndex: -10 }, "tab-index-invalid"],
]) {
  test(`enabled control reports ${issue} for ${JSON.stringify(change)}`, () => {
    assert.ok(codes(browserFrameFindings(frame({ controls: [control(change)] }), "en")).includes(issue));
  });
}
for (const disposition of [{ visible: false }, { disabled: true }, { inert: true }]) {
  test(`unavailable control is not falsely included in interactive target audit ${JSON.stringify(disposition)}`, () => {
    const changed = control({ name: "", width: 0, height: 0, ...disposition });
    const findings = browserFrameFindings(frame({ controls: [changed] }), "en");
    assert.deepEqual(findings, []);
  });
}
for (const [width, height] of [[44, 44], [48, 48], [60, 44], [44, 60], [320, 44]]) {
  test(`visible 44px-or-larger target passes ${width}x${height}`, () => {
    assert.deepEqual(browserFrameFindings(frame({ controls: [control({ width, height })] }), "en"), []);
  });
}
test("duplicate control IDs receive a distinct finding", () => {
  const snapshot = frame({ controls: [control(), control({ name: "Another" })] });
  assert.ok(codes(browserFrameFindings(snapshot, "en")).includes("control-id-duplicate"));
});
test("different control identifiers remain distinct", () => {
  const snapshot = frame({ controls: [control(), control({ id: "retry", name: "Retry" })] });
  assert.deepEqual(browserFrameFindings(snapshot, "en"), []);
});
test("status text is carried without treating a message as a measured fact", () => {
  const snapshot = frame({ statuses: ["UNKNOWN", "Offline"] });
  assert.deepEqual(browserFrameFindings(snapshot, "en"), []);
  assert.deepEqual(snapshot.statuses, ["UNKNOWN", "Offline"]);
});
test("French selector expects document language but not English aria-label", () => {
  const snapshot = frame({ language: "fr", controls: [control({ name: "Suivant" })] });
  assert.deepEqual(browserFrameFindings(snapshot, "fr"), []);
});
test("language change preserves route when it is valid", () => {
  const before = frame();
  const after = frame({ language: "fr" });
  assert.deepEqual(stateTransitionFindings(before, after, "locale"), []);
});
test("language change must actually change document language", () => {
  assert.ok(codes(stateTransitionFindings(frame(), frame(), "locale")).includes("locale-unchanged"));
});
test("language change should not reset the current page", () => {
  assert.ok(codes(stateTransitionFindings(frame(), frame({ language: "fr", route: "/" }), "locale")).includes("locale-route-lost"));
});
test("offline transition accepts an observed false online bit", () => {
  assert.deepEqual(stateTransitionFindings(frame(), frame({ online: false }), "offline"), []);
});
for (const online of [true, null]) {
  test(`offline transition refuses ${String(online)} as an offline observation`, () => {
    assert.ok(codes(stateTransitionFindings(frame(), frame({ online }), "offline")).includes("offline-not-observed"));
  });
}
test("offline transition must not silently navigate elsewhere", () => {
  const findings = stateTransitionFindings(frame(), frame({ online: false, route: "/help" }), "offline");
  assert.ok(codes(findings).includes("offline-route-lost"));
});
test("return transition preserves route and locale", () => {
  assert.deepEqual(stateTransitionFindings(frame(), frame(), "return"), []);
});
test("return transition detects an unexpected route", () => {
  assert.ok(codes(stateTransitionFindings(frame(), frame({ route: "/places" }), "return")).includes("return-route-mismatch"));
});
test("return transition detects unexpected language", () => {
  assert.ok(codes(stateTransitionFindings(frame(), frame({ language: "fr" }), "return")).includes("return-locale-mismatch"));
});
test("keyboard audit accepts ordered focus movement", () => {
  assert.deepEqual(keyboardSequenceFindings([frame(), frame({ activeId: "retry" }), frame({ activeId: "continue" })]), []);
});
test("keyboard audit catches focus that did not move", () => {
  assert.ok(codes(keyboardSequenceFindings([frame(), frame()])).includes("keyboard-focus-still"));
});
test("keyboard audit catches focus lost to an unknown target", () => {
  assert.ok(codes(keyboardSequenceFindings([frame(), frame({ activeId: null })])).includes("keyboard-focus-lost"));
});
test("keyboard audit catches unexpected navigation while tabbing", () => {
  assert.ok(codes(keyboardSequenceFindings([frame(), frame({ activeId: "help", route: "/help" })])).includes("keyboard-route-changed"));
});
test("one frame is not a keyboard sequence and cannot imply a failure", () => {
  assert.deepEqual(keyboardSequenceFindings([frame()]), []);
});
test("empty sequence produces no findings", () => {
  assert.deepEqual(keyboardSequenceFindings([]), []);
});
for (const bad of [0, -1, 1.5, Number.NaN]) {
  test(`browser diagnostic report rejects invalid limit ${String(bad)}`, () => {
    assert.throws(() => browserFindingSummary([], bad), RangeError);
  });
}
test("diagnostic report includes finding code and control identifier", () => {
  const issues = browserFrameFindings(frame({ controls: [control({ width: 20 })] }), "en");
  assert.match(browserFindingSummary(issues), /target-width search/);
});
test("diagnostic report caps length", () => {
  const issues = browserFrameFindings(frame({ controls: [control({ name: "", width: 10, height: 10 })] }), "en");
  assert.match(browserFindingSummary(issues, 1), /more/);
});
test("diagnostic report has no false failure for empty finding set", () => {
  assert.equal(browserFindingSummary([]), "");
});
