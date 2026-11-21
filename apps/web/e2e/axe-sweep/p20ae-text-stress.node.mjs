import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTextStress, compareTextFrames, textStressKey, textStressSummary } from "./p20ae-text-stress.ts";
const block = (patch = {}) => ({
  id: "paragraph-one", text: "A sentence with enough content to wrap when the viewport is narrow.",
  x: 0, y: 0, width: 300, height: 100, scrollWidth: 300, clientWidth: 300,
  lineCount: 3, fontSize: 16, lineHeight: 24, paragraphGap: 32,
  letterSpacing: 1.92, wordSpacing: 2.56, visible: true, ...patch,
});
const frame = (patch = {}) => ({ viewportWidth: 320, blocks: [block()], applied: { lineHeight: 1.5, paragraphGap: 2, letterSpacing: .12, wordSpacing: .16 }, ...patch });
test("P20AE text stress accepts exact required spacing", () => assert.equal(evaluateTextStress(frame()).clean, true));
test("P20AE text stress rejects zero viewport width", () => assert.ok(evaluateTextStress(frame({ viewportWidth: 0 })).issues.some((x) => x.code === "text-block-width-invalid")));
test("P20AE text stress rejects negative block width", () => assert.ok(evaluateTextStress(frame({ blocks: [block({ width: -1 })] })).issues.some((x) => x.code === "text-block-width-invalid")));
test("P20AE text stress rejects zero block height", () => assert.ok(evaluateTextStress(frame({ blocks: [block({ height: 0 })] })).issues.some((x) => x.code === "text-block-height-invalid")));
test("P20AE text stress records content overflow for review", () => {
  const report = evaluateTextStress(frame({ blocks: [block({ scrollWidth: 400 })] }));
  assert.ok(report.issues.some((x) => x.code === "text-block-overflow" && x.severity === "review"));
});
test("P20AE text stress records left clipping for review", () => {
  assert.ok(evaluateTextStress(frame({ blocks: [block({ x: -2 })] })).issues.some((x) => x.code === "text-block-clipped"));
});
test("P20AE text stress records right clipping for review", () => {
  assert.ok(evaluateTextStress(frame({ blocks: [block({ width: 400 })] })).issues.some((x) => x.code === "text-block-clipped"));
});
test("P20AE text stress records empty visible content", () => {
  assert.ok(evaluateTextStress(frame({ blocks: [block({ text: " " })] })).issues.some((x) => x.code === "text-block-content-missing"));
});
test("P20AE text stress checks line height", () => {
  assert.ok(evaluateTextStress(frame({ blocks: [block({ lineHeight: 20 })] })).issues.some((x) => x.code === "text-block-line-height-not-raised"));
});
test("P20AE text stress checks paragraph gap", () => {
  assert.ok(evaluateTextStress(frame({ blocks: [block({ paragraphGap: 20 })] })).issues.some((x) => x.code === "text-block-paragraph-gap-not-raised"));
});
test("P20AE text stress checks letter spacing", () => {
  assert.ok(evaluateTextStress(frame({ blocks: [block({ letterSpacing: 1 })] })).issues.some((x) => x.code === "text-block-letter-spacing-not-raised"));
});
test("P20AE text stress checks word spacing", () => {
  assert.ok(evaluateTextStress(frame({ blocks: [block({ wordSpacing: 1 })] })).issues.some((x) => x.code === "text-block-word-spacing-not-raised"));
});
test("P20AE text stress checks overlap between paragraphs", () => {
  const report = evaluateTextStress(frame({ blocks: [block({ y: 0, height: 100 }), block({ id: "next", y: 90 })] }));
  assert.ok(report.issues.some((x) => x.code === "text-block-overlaps-next"));
});
test("P20AE text stress accepts non-overlapping paragraphs", () => {
  const report = evaluateTextStress(frame({ blocks: [block({ y: 0, height: 80 }), block({ id: "next", y: 82 })] }));
  assert.equal(report.issues.some((x) => x.code === "text-block-overlaps-next"), false);
});
test("P20AE text frame comparison detects missing paragraph", () => {
  const issues = compareTextFrames(frame(), frame({ blocks: [] }));
  assert.ok(issues.some((x) => x.code === "text-block-content-missing"));
});
test("P20AE text frame comparison detects reduced wrapping", () => {
  const issues = compareTextFrames(frame(), frame({ blocks: [block({ lineCount: 1 })] }));
  assert.ok(issues.some((x) => x.code === "text-block-line-count-shrank"));
});
test("P20AE text frame comparison detects smaller font", () => {
  const issues = compareTextFrames(frame(), frame({ blocks: [block({ fontSize: 12 })] }));
  assert.ok(issues.some((x) => x.code === "text-block-font-shrank"));
});
test("P20AE text frame comparison permits increased line count", () => {
  const issues = compareTextFrames(frame(), frame({ blocks: [block({ lineCount: 5 })] }));
  assert.equal(issues.some((x) => x.code === "text-block-line-count-shrank"), false);
});
test("P20AE text frame comparison permits same font size", () => {
  assert.equal(compareTextFrames(frame(), frame()).some((x) => x.code === "text-block-font-shrank"), false);
});
test("P20AE text stress key includes locale and width", () => assert.equal(textStressKey("/help", "fr", 320), "/help|fr|320|text-spacing"));
test("P20AE text stress summary reports block count", () => assert.match(textStressSummary(evaluateTextStress(frame())), /Blocks: 1/));
test("P20AE text stress summary reports clean status", () => assert.match(textStressSummary(evaluateTextStress(frame())), /Status: clean/));
test("P20AE hidden empty content is not reported as visible missing content", () => {
  const report = evaluateTextStress(frame({ blocks: [block({ visible: false, text: "" })] }));
  assert.equal(report.issues.some((x) => x.code === "text-block-content-missing"), false);
});
test("P20AE text stress report separates errors and reviews", () => {
  const report = evaluateTextStress(frame({ blocks: [block({ width: 400, scrollWidth: 500, lineHeight: 16 })] }));
  assert.ok(report.errors > 0);
  assert.ok(report.reviews > 0);
});
