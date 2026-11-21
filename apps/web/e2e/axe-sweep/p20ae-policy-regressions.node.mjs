import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, DEFAULT_POLICY, WIDTH_MATRIX, HEIGHT_MATRIX } from "./p20ae-reflow-contracts.ts";
import { compareViewportFrames, widthBand } from "./p20ae-viewport-transition.ts";
import { compareReadingOrder } from "./p20ae-reading-order.ts";
import { inspectBreakpointSeries } from "./p20ae-breakpoints.ts";
import { evaluateTextStress, compareTextFrames } from "./p20ae-text-stress.ts";

const viewport = (patch = {}) => ({ width: 320, height: 640, clientWidth: 320, clientHeight: 640,
  scrollWidth: 320, scrollHeight: 900, scrollX: 0, scrollY: 0, deviceScaleFactor: 1,
  orientation: "portrait", rootFontSize: 16, ...patch });
const box = (id, patch = {}) => ({ id, selector: `#${id}`, name: id, kind: "button",
  rect: { x: 0, y: 0, width: 44, height: 44, top: 0, right: 44, bottom: 44, left: 0 },
  visible: true, disabled: false, tabIndex: 0, fontSize: 16, lineHeight: 24, textLength: id.length,
  scrollWidth: 44, clientWidth: 44, scrollHeight: 44, clientHeight: 44, fixed: false, sticky: false, ...patch });
const observation = (patch = {}) => ({ route: "/fixture", locale: "en", viewport: viewport(),
  elements: [box("primary")], mainCount: 1, headingCount: 1, visibleHeadingCount: 1, textSpacing: null, ...patch });
const frame = (width, patch = {}) => ({ route: "/fixture", locale: "en", viewport: viewport({
  width, clientWidth: width, scrollWidth: width, orientation: width > 640 ? "landscape" : "portrait" }),
  elements: [box("primary")], activeId: "primary", activeVisible: true, ...patch });

test("P20AE policy: default target minimum remains 44 pixels", () => {
  assert.equal(DEFAULT_POLICY.targetWidth, 44);
  assert.equal(DEFAULT_POLICY.targetHeight, 44);
});
test("P20AE policy: horizontal tolerance is exactly one CSS pixel", () => assert.equal(DEFAULT_POLICY.overflowTolerance, 1));
test("P20AE policy: width matrix includes 320 CSS pixels", () => assert.equal(WIDTH_MATRIX[0], 320));
test("P20AE policy: width matrix is ascending", () => assert.deepEqual([...WIDTH_MATRIX], [...WIDTH_MATRIX].sort((a, b) => a - b)));
test("P20AE policy: height matrix is ascending", () => assert.deepEqual([...HEIGHT_MATRIX], [...HEIGHT_MATRIX].sort((a, b) => a - b)));
test("P20AE policy: matrix has no repeated widths", () => assert.equal(new Set(WIDTH_MATRIX).size, WIDTH_MATRIX.length));
test("P20AE policy: matrix has no repeated heights", () => assert.equal(new Set(HEIGHT_MATRIX).size, HEIGHT_MATRIX.length));
test("P20AE policy: no width fixture is below 320 CSS pixels", () => assert.ok(WIDTH_MATRIX.every((width) => width >= 320)));
test("P20AE policy: all height fixtures are positive", () => assert.ok(HEIGHT_MATRIX.every((height) => height > 0)));
test("P20AE policy: compact band ends before 360", () => assert.equal(widthBand(359), "compact"));
test("P20AE policy: phone band starts at 360", () => assert.equal(widthBand(360), "phone"));
test("P20AE policy: tablet band starts at 600", () => assert.equal(widthBand(600), "tablet"));
test("P20AE policy: desktop band starts at 900", () => assert.equal(widthBand(900), "desktop"));
test("P20AE policy: wide band starts at 1440", () => assert.equal(widthBand(1440), "wide"));

test("P20AE policy: small content text is a review rather than an error", () => {
  const report = evaluate(observation({ elements: [box("copy", { kind: "other", fontSize: 10 })] }));
  assert.ok(report.issues.some((issue) => issue.code === "content-font-small" && issue.severity === "review"));
  assert.equal(report.errors, 0);
});
test("P20AE policy: tight line height is a review rather than an error", () => {
  const report = evaluate(observation({ elements: [box("copy", { kind: "other", lineHeight: 16 })] }));
  assert.ok(report.issues.some((issue) => issue.code === "content-line-height-tight" && issue.severity === "review"));
  assert.equal(report.errors, 0);
});
test("P20AE policy: hidden content does not trigger clipping when hidden", () => {
  const report = evaluate(observation({ elements: [box("copy", { kind: "other", visible: false, rect: {
    x: -10, y: 0, width: 400, height: 30, top: 0, right: 390, bottom: 30, left: -10,
  } })] }));
  assert.equal(report.issues.some((issue) => issue.code === "content-clipped"), false);
});
test("P20AE policy: disabled controls do not fail target size", () => {
  const report = evaluate(observation({ elements: [box("disabled", { disabled: true, rect: {
    x: 0, y: 0, width: 20, height: 20, top: 0, right: 20, bottom: 20, left: 0,
  } })] }));
  assert.equal(report.issues.some((issue) => issue.code === "target-small"), false);
});
test("P20AE policy: positive tab index is not misreported by geometry evaluator", () => {
  const report = evaluate(observation({ elements: [box("positive", { tabIndex: 2 })] }));
  assert.equal(report.issues.some((issue) => issue.code === "target-tabindex-negative"), false);
});
test("P20AE policy: negative tab index is recorded for manual review", () => {
  const report = evaluate(observation({ elements: [box("negative", { tabIndex: -1 })] }));
  assert.equal(report.issues.some((issue) => issue.code === "target-tabindex-negative" && issue.severity === "review"), true);
});

test("P20AE transition: stable element geometry yields no delta", () => {
  const report = compareViewportFrames(frame(320), frame(414));
  assert.equal(report.deltas[0].movement, "stable");
});
test("P20AE transition: moved element geometry yields a reflow delta", () => {
  const report = compareViewportFrames(frame(320), frame(414, { elements: [box("primary", { rect: {
    x: 20, y: 10, width: 44, height: 44, top: 10, right: 64, bottom: 54, left: 20,
  } })] }));
  assert.equal(report.deltas[0].movement, "reflowed");
});
test("P20AE transition: lost active control is an error", () => {
  const report = compareViewportFrames(frame(320), frame(414, { activeId: null }));
  assert.ok(report.issues.some((issue) => issue.code === "active-element-lost"));
});
test("P20AE transition: changed locale is reviewable", () => {
  const report = compareViewportFrames(frame(320), frame(414, { locale: "fr" }));
  assert.ok(report.issues.some((issue) => issue.code === "locale-changed"));
});
test("P20AE transition: route identity must remain stable", () => {
  const report = compareViewportFrames(frame(320), frame(414, { route: "/other" }));
  assert.ok(report.issues.some((issue) => issue.code === "route-changed"));
});
test("P20AE transition: no duplicate DOM indices are accepted", () => {
  const report = compareViewportFrames(frame(320), frame(414, { elements: [box("a"), box("b", { id: "b" })] }));
  assert.equal(report.issues.some((issue) => issue.code === "duplicate-element-id"), false);
});

test("P20AE reading: DOM order and vertical order agree", () => {
  const report = compareReadingOrder([
    { id: "a", domIndex: 0, rect: { x: 0, y: 0, width: 200, height: 40, top: 0, right: 200, bottom: 40, left: 0 }, visible: true, column: 0 },
    { id: "b", domIndex: 1, rect: { x: 0, y: 50, width: 200, height: 40, top: 50, right: 200, bottom: 90, left: 0 }, visible: true, column: 0 },
  ]);
  assert.equal(report.clean, true);
});
test("P20AE reading: visual order inversion is found", () => {
  const report = compareReadingOrder([
    { id: "a", domIndex: 0, rect: { x: 0, y: 60, width: 200, height: 40, top: 60, right: 200, bottom: 100, left: 0 }, visible: true, column: 0 },
    { id: "b", domIndex: 1, rect: { x: 0, y: 0, width: 200, height: 40, top: 0, right: 200, bottom: 40, left: 0 }, visible: true, column: 0 },
  ]);
  assert.ok(report.issues.some((issue) => issue.code === "visual-order-inversion"));
});
test("P20AE reading: separate columns are not assumed to have vertical order", () => {
  const report = compareReadingOrder([
    { id: "a", domIndex: 0, rect: { x: 0, y: 100, width: 100, height: 40, top: 100, right: 100, bottom: 140, left: 0 }, visible: true, column: 0 },
    { id: "b", domIndex: 1, rect: { x: 120, y: 0, width: 100, height: 40, top: 0, right: 220, bottom: 40, left: 120 }, visible: true, column: 1 },
  ]);
  assert.equal(report.issues.some((issue) => issue.code === "visual-order-inversion"), false);
});

test("P20AE breakpoints: compact navigation shows mobile navigation only", () => {
  const report = inspectBreakpointSeries([{ width: 320, mobileNavigationVisible: true, desktopNavigationVisible: false,
    columns: 1, horizontalOverflow: 0, sidePanelVisible: false, contentVisible: true }]);
  assert.equal(report.clean, true);
});
test("P20AE breakpoints: wide navigation shows desktop navigation only", () => {
  const report = inspectBreakpointSeries([{ width: 1280, mobileNavigationVisible: false, desktopNavigationVisible: true,
    columns: 3, horizontalOverflow: 0, sidePanelVisible: true, contentVisible: true }]);
  assert.equal(report.clean, true);
});
test("P20AE breakpoints: navigation overlap is not accepted", () => {
  const report = inspectBreakpointSeries([{ width: 768, mobileNavigationVisible: true, desktopNavigationVisible: true,
    columns: 2, horizontalOverflow: 0, sidePanelVisible: true, contentVisible: true }]);
  assert.equal(report.clean, false);
});

test("P20AE text stress: line height is compared to computed font size", () => {
  const report = evaluateTextStress({ viewportWidth: 320, blocks: [{
    id: "p", text: "paragraph", x: 0, y: 0, width: 300, height: 50, scrollWidth: 300, clientWidth: 300,
    lineCount: 2, fontSize: 20, lineHeight: 30, paragraphGap: 40, letterSpacing: 2.4, wordSpacing: 3.2, visible: true,
  }], applied: { lineHeight: 1.5, paragraphGap: 2, letterSpacing: .12, wordSpacing: .16 } });
  assert.equal(report.clean, true);
});
test("P20AE text stress: missing paragraph in after-frame is reviewed", () => {
  const report = compareTextFrames({ viewportWidth: 320, blocks: [{
    id: "p", text: "copy", x: 0, y: 0, width: 300, height: 50, scrollWidth: 300, clientWidth: 300,
    lineCount: 2, fontSize: 16, lineHeight: 24, paragraphGap: 32, letterSpacing: 1.92, wordSpacing: 2.56, visible: true,
  }], applied: { lineHeight: 1.5, paragraphGap: 2, letterSpacing: .12, wordSpacing: .16 } },
  { viewportWidth: 320, blocks: [], applied: { lineHeight: 1.5, paragraphGap: 2, letterSpacing: .12, wordSpacing: .16 } });
  assert.ok(report.some((issue) => issue.code === "text-block-content-missing"));
});
