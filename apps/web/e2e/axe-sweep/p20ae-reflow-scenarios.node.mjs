import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, DEFAULT_POLICY } from "./p20ae-reflow-contracts.ts";
import { compareViewportFrames, widthBand } from "./p20ae-viewport-transition.ts";
import { evaluateTextStress } from "./p20ae-text-stress.ts";

const viewport = (width, height) => ({
  width, height, clientWidth: width, clientHeight: height,
  scrollWidth: width, scrollHeight: height * 2, scrollX: 0, scrollY: 0,
  deviceScaleFactor: 1, orientation: width > height ? "landscape" : width < height ? "portrait" : "square",
  rootFontSize: 16,
});
const target = (id, x, y, width = 44, height = 44) => ({
  id, role: "button", selector: `#${id}`, name: id, kind: "button", rect: { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x },
  visible: true, disabled: false, tabIndex: 0, fontSize: 16, lineHeight: 24, textLength: id.length,
  scrollWidth: width, clientWidth: width, scrollHeight: height, clientHeight: height, fixed: false, sticky: false,
});
const obs = (width, height, elements) => ({
  route: "/responsive-fixture", locale: "en", viewport: viewport(width, height),
  elements, mainCount: 1, headingCount: 1, visibleHeadingCount: 1, textSpacing: null,
});
const frame = (width, height, elements) => ({
  route: "/responsive-fixture", locale: "en", viewport: viewport(width, height), elements,
  activeId: "first", activeVisible: true,
});
for (const width of [320, 360, 375, 390, 414, 600, 768, 1024, 1280]) {
  test(`P20AE scenario: a page exactly fitting ${width}px has no overflow`, () => {
    const report = evaluate(obs(width, 900, [target("first", 0, 0)]));
    assert.equal(report.overflow, 0);
    assert.equal(report.issues.some((x) => x.code === "horizontal-overflow"), false);
  });
}
for (const width of [320, 360, 375, 390, 414]) {
  test(`P20AE scenario: target at the right edge fits at ${width}px`, () => {
    const report = evaluate(obs(width, 800, [target("right-edge", width - 44, 10)]));
    assert.equal(report.issues.some((x) => x.code === "target-hidden" || x.code === "target-clipped"), false);
  });
}
for (const width of [320, 360, 375, 390, 414]) {
  test(`P20AE scenario: target crossing the right edge is clipped at ${width}px`, () => {
    const report = evaluate(obs(width, 800, [target("right-edge", width - 20, 10)]));
    assert.ok(report.issues.some((x) => x.code === "target-clipped"));
  });
}
test("P20AE scenario: compact to phone resize records band change", () => {
  const report = compareViewportFrames(frame(320, 640, [target("first", 0, 0)]), frame(414, 800, [target("first", 0, 0)]));
  assert.equal(report.fromBand, "compact");
  assert.equal(report.toBand, "phone");
});
test("P20AE scenario: phone to tablet resize records band change", () => {
  const report = compareViewportFrames(frame(414, 800, [target("first", 0, 0)]), frame(768, 900, [target("first", 0, 0)]));
  assert.equal(report.toBand, "tablet");
});
test("P20AE scenario: tablet to desktop resize records band change", () => {
  const report = compareViewportFrames(frame(768, 900, [target("first", 0, 0)]), frame(1280, 900, [target("first", 0, 0)]));
  assert.equal(report.toBand, "desktop");
});
test("P20AE scenario: desktop to wide resize records band change", () => {
  const report = compareViewportFrames(frame(1280, 900, [target("first", 0, 0)]), frame(1600, 1000, [target("first", 0, 0)]));
  assert.equal(report.toBand, "wide");
});
test("P20AE scenario: multiple controls retain their stable identities", () => {
  const before = frame(320, 640, [target("first", 0, 0), target("second", 0, 60)]);
  const after = frame(768, 900, [target("first", 0, 0), target("second", 60, 0)]);
  const report = compareViewportFrames(before, after);
  assert.equal(report.deltas.length, 2);
  assert.equal(report.issues.some((x) => x.code === "control-disappeared"), false);
});
test("P20AE scenario: a control removed at larger width is still flagged", () => {
  const report = compareViewportFrames(frame(320, 640, [target("first", 0, 0), target("second", 0, 60)]), frame(768, 900, [target("first", 0, 0)]));
  assert.ok(report.issues.some((x) => x.code === "control-disappeared" && x.target === "second"));
});
test("P20AE scenario: a newly visible menu control is recorded as appeared", () => {
  const report = compareViewportFrames(frame(320, 640, [target("first", 0, 0)]), frame(768, 900, [target("first", 0, 0), target("wide-menu", 60, 0)]));
  assert.ok(report.deltas.some((x) => x.id === "wide-menu" && x.movement === "appeared"));
});
test("P20AE scenario: horizontal overflow remains zero after orientation change", () => {
  const report = evaluate(obs(800, 360, [target("landscape-control", 0, 0)]));
  assert.equal(report.overflow, 0);
});
test("P20AE scenario: orientation change can be measured without changing route", () => {
  const report = compareViewportFrames(frame(360, 800, [target("first", 0, 0)]), frame(800, 360, [target("first", 0, 0)]));
  assert.equal(report.fromOrientation, "portrait");
  assert.equal(report.toOrientation, "landscape");
  assert.equal(report.issues.some((x) => x.code === "route-changed"), false);
});
test("P20AE scenario: 44px target remains compliant in portrait and landscape", () => {
  for (const [width, height] of [[320, 640], [800, 360]]) {
    const report = evaluate(obs(width, height, [target("target", 0, 0)]));
    assert.equal(report.issues.some((x) => x.code === "target-small"), false);
  }
});
test("P20AE scenario: 43px target fails in portrait and landscape", () => {
  for (const [width, height] of [[320, 640], [800, 360]]) {
    const report = evaluate(obs(width, height, [target("target", 0, 0, 43, 43)]));
    assert.ok(report.issues.some((x) => x.code === "target-small"));
  }
});
test("P20AE scenario: horizontal scroll position is not silently accepted", () => {
  const report = evaluate({ ...obs(320, 640, [target("target", 0, 0)]), viewport: { ...viewport(320, 640), scrollX: 2 } });
  assert.ok(report.issues.some((x) => x.code === "horizontal-scroll-offset"));
});
test("P20AE scenario: root font size remains reviewable, not hard error", () => {
  const report = evaluate({ ...obs(320, 640, [target("target", 0, 0)]), viewport: { ...viewport(320, 640), rootFontSize: 10 } });
  assert.ok(report.issues.some((x) => x.code === "root-font-small" && x.severity === "review"));
  assert.equal(report.errors, 0);
});
test("P20AE scenario: policy can require 48px targets for a stricter profile", () => {
  const report = evaluate(obs(320, 640, [target("target", 0, 0, 44, 44)]), { ...DEFAULT_POLICY, targetWidth: 48, targetHeight: 48 });
  assert.ok(report.issues.some((x) => x.code === "target-small"));
});
test("P20AE scenario: policy can permit 40px targets for a comparator profile", () => {
  const report = evaluate(obs(320, 640, [target("target", 0, 0, 40, 40)]), { ...DEFAULT_POLICY, targetWidth: 40, targetHeight: 40 });
  assert.equal(report.issues.some((x) => x.code === "target-small"), false);
});
test("P20AE scenario: text stress issues are scoped to the observed text blocks", () => {
  const result = evaluateTextStress({ viewportWidth: 320, blocks: [
    { id: "good", text: "Text", x: 0, y: 0, width: 300, height: 50, scrollWidth: 300, clientWidth: 300,
      lineCount: 2, fontSize: 16, lineHeight: 24, paragraphGap: 32, letterSpacing: 1.92, wordSpacing: 2.56, visible: true },
    { id: "bad", text: "Text", x: 0, y: 60, width: 300, height: 50, scrollWidth: 400, clientWidth: 300,
      lineCount: 2, fontSize: 16, lineHeight: 16, paragraphGap: 0, letterSpacing: 0, wordSpacing: 0, visible: true },
  ], applied: { lineHeight: 1.5, paragraphGap: 2, letterSpacing: .12, wordSpacing: .16 } });
  assert.ok(result.issues.every((issue) => issue.block === "bad"));
});
test("P20AE scenario: hidden text blocks do not trigger visible-content missing", () => {
  const result = evaluateTextStress({ viewportWidth: 320, blocks: [
    { id: "hidden", text: "", x: 0, y: 0, width: 300, height: 50, scrollWidth: 300, clientWidth: 300,
      lineCount: 0, fontSize: 16, lineHeight: 24, paragraphGap: 32, letterSpacing: 1.92, wordSpacing: 2.56, visible: false },
  ], applied: { lineHeight: 1.5, paragraphGap: 2, letterSpacing: .12, wordSpacing: .16 } });
  assert.equal(result.issues.some((issue) => issue.code === "text-block-content-missing"), false);
});
test("P20AE scenario: width band boundaries are deterministic", () => {
  assert.equal(widthBand(359), "compact");
  assert.equal(widthBand(360), "phone");
  assert.equal(widthBand(599), "phone");
  assert.equal(widthBand(600), "tablet");
  assert.equal(widthBand(899), "tablet");
  assert.equal(widthBand(900), "desktop");
  assert.equal(widthBand(1439), "desktop");
  assert.equal(widthBand(1440), "wide");
});
