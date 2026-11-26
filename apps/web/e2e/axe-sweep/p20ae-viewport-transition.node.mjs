import test from "node:test";
import assert from "node:assert/strict";
import { widthBand, compareViewportFrames, transitionKey, summarizeTransition } from "./p20ae-viewport-transition.ts";

const view = (patch = {}) => ({ width: 320, height: 640, clientWidth: 320, clientHeight: 640,
  scrollWidth: 320, scrollHeight: 900, scrollX: 0, scrollY: 0, deviceScaleFactor: 1,
  orientation: "portrait", rootFontSize: 16, ...patch });
const rect = (patch = {}) => ({ x: 0, y: 0, width: 44, height: 44, top: 0, right: 44, bottom: 44, left: 0, ...patch });
const el = (patch = {}) => ({ id: "continue", role: "button", name: "Continue", rect: rect(), visible: true, fontSize: 16, ...patch });
const frame = (patch = {}) => ({ route: "/dev/narrow", locale: "en", viewport: view(), elements: [el()], activeId: "continue", activeVisible: true, ...patch });
test("P20AE width band classifies compact", () => assert.equal(widthBand(320), "compact"));
test("P20AE width band classifies phone", () => assert.equal(widthBand(414), "phone"));
test("P20AE width band classifies tablet", () => assert.equal(widthBand(768), "tablet"));
test("P20AE width band classifies desktop", () => assert.equal(widthBand(1280), "desktop"));
test("P20AE width band classifies wide", () => assert.equal(widthBand(1600), "wide"));
test("P20AE invalid width uses compact fallback", () => assert.equal(widthBand(NaN), "compact"));
test("P20AE resize into phone band is recorded", () => {
  const report = compareViewportFrames(frame(), frame({ viewport: view({ width: 414, clientWidth: 414, scrollWidth: 414, orientation: "portrait" }) }));
  assert.equal(report.fromBand, "compact"); assert.equal(report.toBand, "phone");
});
test("P20AE resize into tablet band is recorded", () => {
  const report = compareViewportFrames(frame(), frame({ viewport: view({ width: 768, height: 900, clientWidth: 768, clientHeight: 900, scrollWidth: 768, orientation: "portrait" }) }));
  assert.equal(report.toBand, "tablet");
});
test("P20AE same dimensions produce a review", () => {
  assert.ok(compareViewportFrames(frame(), frame()).issues.some((issue) => issue.code === "viewport-not-resized"));
});
test("P20AE route change during resize is an error", () => {
  assert.ok(compareViewportFrames(frame(), frame({ route: "/help" })).issues.some((issue) => issue.code === "route-changed"));
});
test("P20AE language change during resize is reviewed", () => {
  const report = compareViewportFrames(frame(), frame({ locale: "fr" }));
  assert.ok(report.issues.some((issue) => issue.code === "locale-changed" && issue.severity === "review"));
});
test("P20AE introduced horizontal overflow is an error", () => {
  const after = frame({ viewport: view({ width: 360, clientWidth: 360, scrollWidth: 400, orientation: "portrait" }) });
  assert.ok(compareViewportFrames(frame(), after).issues.some((issue) => issue.code === "overflow-introduced"));
});
test("P20AE increased overflow is reported", () => {
  const before = frame({ viewport: view({ scrollWidth: 340 }) });
  const after = frame({ viewport: view({ width: 360, clientWidth: 360, scrollWidth: 400 }) });
  assert.ok(compareViewportFrames(before, after).issues.some((issue) => issue.code === "overflow-increased"));
});
test("P20AE a control disappearing is an error", () => {
  assert.ok(compareViewportFrames(frame(), frame({ elements: [] })).issues.some((issue) => issue.code === "control-disappeared"));
});
test("P20AE content disappearing is a review", () => {
  const before = frame({ elements: [el({ role: "paragraph", id: "intro" })] });
  const report = compareViewportFrames(before, frame({ elements: [] }));
  assert.ok(report.issues.some((issue) => issue.code === "content-disappeared" && issue.severity === "review"));
});
test("P20AE new elements are recorded as appearing", () => {
  const after = frame({ elements: [el(), el({ id: "menu", role: "button" })] });
  assert.ok(compareViewportFrames(frame(), after).deltas.some((delta) => delta.id === "menu" && delta.movement === "appeared"));
});
test("P20AE moved elements are recorded as reflowed", () => {
  const after = frame({ elements: [el({ rect: rect({ x: 20, left: 20, right: 64 }) })] });
  assert.ok(compareViewportFrames(frame(), after).deltas.some((delta) => delta.movement === "reflowed"));
});
test("P20AE unchanged elements are stable", () => {
  assert.equal(compareViewportFrames(frame(), frame({ viewport: view({ width: 360, clientWidth: 360, scrollWidth: 360 }) })).deltas[0].movement, "stable");
});
test("P20AE target moved outside viewport is an error", () => {
  const after = frame({ viewport: view({ width: 360, clientWidth: 360, scrollWidth: 360 }),
    elements: [el({ rect: rect({ x: 370, left: 370, right: 414 }) })] });
  assert.ok(compareViewportFrames(frame(), after).issues.some((issue) => issue.code === "target-moved-outside"));
});
test("P20AE font size shrinking is reviewed", () => {
  const report = compareViewportFrames(frame(), frame({ viewport: view({ width: 360, clientWidth: 360, scrollWidth: 360 }),
    elements: [el({ fontSize: 12 })] }));
  assert.ok(report.issues.some((issue) => issue.code === "font-size-shrank"));
});
test("P20AE active element disappearing is an error", () => {
  assert.ok(compareViewportFrames(frame(), frame({ activeId: null })).issues.some((issue) => issue.code === "active-element-lost"));
});
test("P20AE active element hidden is an error", () => {
  assert.ok(compareViewportFrames(frame(), frame({ activeVisible: false })).issues.some((issue) => issue.code === "active-element-hidden"));
});
test("P20AE landscape resize updates orientation", () => {
  const after = frame({ viewport: view({ width: 800, height: 360, clientWidth: 800, clientHeight: 360, scrollWidth: 800, orientation: "landscape" }) });
  assert.equal(compareViewportFrames(frame(), after).toOrientation, "landscape");
});
test("P20AE stale orientation is reviewed", () => {
  const after = frame({ viewport: view({ width: 800, height: 360, clientWidth: 800, clientHeight: 360, scrollWidth: 800, orientation: "portrait" }) });
  assert.ok(compareViewportFrames(frame(), after).issues.some((issue) => issue.code === "orientation-not-updated"));
});
test("P20AE duplicate element identifiers are found", () => {
  const after = frame({ viewport: view({ width: 360, clientWidth: 360, scrollWidth: 360 }),
    elements: [el(), el()] });
  assert.ok(compareViewportFrames(frame(), after).issues.some((issue) => issue.code === "duplicate-element-id"));
});
test("P20AE transition key includes route and both sizes", () => {
  const key = transitionKey(frame(), frame({ viewport: view({ width: 414, clientWidth: 414, scrollWidth: 414 }) }));
  assert.equal(key, "/dev/narrow|320x640->414x640|en");
});
test("P20AE transition summary includes errors and review counts", () => {
  const report = compareViewportFrames(frame(), frame({ elements: [] }));
  assert.match(summarizeTransition(report), /Errors: 1/);
});
test("P20AE resize preserves locale in report context", () => {
  const report = compareViewportFrames(frame({ locale: "fr" }), frame({ locale: "fr", viewport: view({ width: 390, clientWidth: 390, scrollWidth: 390 }) }));
  assert.equal(report.clean, true);
});
