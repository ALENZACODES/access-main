import test from "node:test";
import assert from "node:assert/strict";
import { inspectBreakpoint, inspectBreakpointSeries, breakpointKey, breakpointSummary } from "./p20ae-breakpoints.ts";
const item = (width, patch = {}) => ({
  width, mobileNavigationVisible: width < 768, desktopNavigationVisible: width >= 768,
  columns: width < 600 ? 1 : width < 900 ? 2 : 3, horizontalOverflow: 0,
  sidePanelVisible: width >= 600, contentVisible: true, ...patch,
});
test("P20AE breakpoint accepts compact navigation", () => assert.deepEqual(inspectBreakpoint(item(320)), []));
test("P20AE breakpoint accepts desktop navigation", () => assert.deepEqual(inspectBreakpoint(item(1280)), []));
test("P20AE breakpoint rejects simultaneous mobile and desktop navigation", () => assert.ok(inspectBreakpoint(item(800, { mobileNavigationVisible: true })).some((x) => x.code === "both-navigation-visible")));
test("P20AE breakpoint rejects missing navigation", () => assert.ok(inspectBreakpoint(item(800, { mobileNavigationVisible: false, desktopNavigationVisible: false })).some((x) => x.code === "no-navigation-visible")));
test("P20AE breakpoint rejects zero columns", () => assert.ok(inspectBreakpoint(item(320, { columns: 0 })).some((x) => x.code === "columns-invalid")));
test("P20AE breakpoint rejects more than twelve columns", () => assert.ok(inspectBreakpoint(item(1280, { columns: 13 })).some((x) => x.code === "columns-invalid")));
test("P20AE breakpoint rejects non-integer columns", () => assert.ok(inspectBreakpoint(item(1280, { columns: 2.5 })).some((x) => x.code === "columns-invalid")));
test("P20AE breakpoint rejects horizontal overflow", () => assert.ok(inspectBreakpoint(item(320, { horizontalOverflow: 12 })).some((x) => x.code === "overflow-at-breakpoint")));
test("P20AE breakpoint accepts one pixel rounding tolerance", () => assert.equal(inspectBreakpoint(item(320, { horizontalOverflow: 1 })).length, 0));
test("P20AE breakpoint reports hidden main content", () => assert.ok(inspectBreakpoint(item(320, { contentVisible: false })).some((x) => x.code === "content-hidden")));
test("P20AE breakpoint reviews side panel on narrow width", () => assert.ok(inspectBreakpoint(item(375, { sidePanelVisible: true })).some((x) => x.code === "panel-toggle-inconsistent")));
test("P20AE breakpoint series sorts widths", () => assert.deepEqual(inspectBreakpointSeries([item(1280), item(320)]).widths, [320, 1280]));
test("P20AE breakpoint series detects duplicate widths", () => assert.ok(inspectBreakpointSeries([item(320), item(320)]).issues.some((x) => x.code === "duplicate-width")));
test("P20AE breakpoint series detects columns decreasing at larger widths", () => {
  const report = inspectBreakpointSeries([item(320, { columns: 2 }), item(768, { columns: 1 })]);
  assert.ok(report.issues.some((x) => x.code === "non-monotonic-columns"));
});
test("P20AE breakpoint series accepts increasing columns", () => {
  const report = inspectBreakpointSeries([item(320, { columns: 1 }), item(768, { columns: 2 }), item(1280, { columns: 3 })]);
  assert.equal(report.issues.length, 0);
});
test("P20AE breakpoint key includes width and nav state", () => assert.equal(breakpointKey(item(320)), "320|1|m"));
test("P20AE breakpoint summary reports width series", () => assert.match(breakpointSummary(inspectBreakpointSeries([item(320), item(768)])), /Widths: 320, 768/));
test("P20AE breakpoint summary reports clean status", () => assert.match(breakpointSummary(inspectBreakpointSeries([item(320)])), /Status: clean/));
