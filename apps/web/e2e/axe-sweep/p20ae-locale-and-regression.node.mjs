import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, DEFAULT_POLICY } from "./p20ae-reflow-contracts.ts";
import { compareReadingOrder, readingOrderKey } from "./p20ae-reading-order.ts";
import { inspectBreakpointSeries } from "./p20ae-breakpoints.ts";

const viewport = (patch = {}) => ({ width: 320, height: 640, clientWidth: 320, clientHeight: 640,
  scrollWidth: 320, scrollHeight: 800, scrollX: 0, scrollY: 0, deviceScaleFactor: 1,
  orientation: "portrait", rootFontSize: 16, ...patch });
const control = () => ({ selector: "#action", name: "Action", kind: "button",
  rect: { x: 0, y: 0, width: 44, height: 44, top: 0, right: 44, bottom: 44, left: 0 },
  visible: true, disabled: false, tabIndex: 0, fontSize: 16, lineHeight: 24, textLength: 6,
  scrollWidth: 44, clientWidth: 44, scrollHeight: 44, clientHeight: 44, fixed: false, sticky: false });
const obs = (patch = {}) => ({ route: "/locale", locale: "fr", viewport: viewport(),
  elements: [control()], mainCount: 1, headingCount: 1, visibleHeadingCount: 1, textSpacing: null, ...patch });
test("P20AE locale: French observation remains French", () => assert.equal(evaluate(obs()).locale, "fr"));
test("P20AE locale: English observation remains English", () => assert.equal(evaluate(obs({ locale: "en" })).locale, "en"));
test("P20AE locale: unknown remains UNKNOWN", () => assert.equal(evaluate(obs({ locale: "UNKNOWN" })).locale, "UNKNOWN"));
test("P20AE locale: required locale flags UNKNOWN", () => {
  const report = evaluate(obs({ locale: "UNKNOWN" }), { ...DEFAULT_POLICY, requireLocale: true });
  assert.ok(report.issues.some((issue) => issue.code === "locale-unknown"));
});
test("P20AE locale: no issue is created for known French", () => {
  const report = evaluate(obs(), { ...DEFAULT_POLICY, requireLocale: true });
  assert.equal(report.issues.some((issue) => issue.code === "locale-unknown"), false);
});
test("P20AE reading: two-column sequence keeps explicit column identities", () => {
  const report = compareReadingOrder([
    { id: "col-a-1", domIndex: 0, rect: { x: 0, y: 0, width: 100, height: 40, top: 0, right: 100, bottom: 40, left: 0 }, visible: true, column: 0 },
    { id: "col-b-1", domIndex: 1, rect: { x: 120, y: 0, width: 100, height: 40, top: 0, right: 220, bottom: 40, left: 120 }, visible: true, column: 1 },
    { id: "col-a-2", domIndex: 2, rect: { x: 0, y: 50, width: 100, height: 40, top: 50, right: 100, bottom: 90, left: 0 }, visible: true, column: 0 },
  ]);
  assert.equal(report.issues.some((issue) => issue.code === "visual-order-inversion"), false);
});
test("P20AE reading: stable key changes when DOM order changes", () => {
  const first = [
    { id: "a", domIndex: 0, rect: { x: 0, y: 0, width: 100, height: 40, top: 0, right: 100, bottom: 40, left: 0 }, visible: true, column: 0 },
    { id: "b", domIndex: 1, rect: { x: 0, y: 50, width: 100, height: 40, top: 50, right: 100, bottom: 90, left: 0 }, visible: true, column: 0 },
  ];
  const second = first.map((item) => ({ ...item, domIndex: item.id === "a" ? 1 : 0 }));
  assert.notEqual(readingOrderKey(first), readingOrderKey(second));
});
test("P20AE breakpoints: duplicate width is review, not error", () => {
  const item = { width: 320, mobileNavigationVisible: true, desktopNavigationVisible: false,
    columns: 1, horizontalOverflow: 0, sidePanelVisible: false, contentVisible: true };
  const report = inspectBreakpointSeries([item, item]);
  assert.equal(report.errors, 0);
  assert.equal(report.reviews, 1);
});
test("P20AE breakpoints: horizontal overflow remains an error", () => {
  const item = { width: 320, mobileNavigationVisible: true, desktopNavigationVisible: false,
    columns: 1, horizontalOverflow: 8, sidePanelVisible: false, contentVisible: true };
  assert.equal(inspectBreakpointSeries([item]).clean, false);
});
test("P20AE breakpoints: hidden main content remains an error", () => {
  const item = { width: 320, mobileNavigationVisible: true, desktopNavigationVisible: false,
    columns: 1, horizontalOverflow: 0, sidePanelVisible: false, contentVisible: false };
  assert.equal(inspectBreakpointSeries([item]).clean, false);
});
