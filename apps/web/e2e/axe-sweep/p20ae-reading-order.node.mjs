import test from "node:test";
import assert from "node:assert/strict";
import { compareReadingOrder, readingOrderKey, readingOrderSummary } from "./p20ae-reading-order.ts";
const item = (id, domIndex, top, patch = {}) => ({
  id, domIndex, rect: { x: 0, y: top, width: 200, height: 40, top, right: 200, bottom: top + 40, left: 0 },
  visible: true, column: 0, ...patch,
});
test("P20AE reading order accepts matching DOM and visual order", () => {
  assert.equal(compareReadingOrder([item("a", 0, 0), item("b", 1, 50)]).clean, true);
});
test("P20AE reading order detects vertical inversion in one column", () => {
  const report = compareReadingOrder([item("a", 0, 60), item("b", 1, 0)]);
  assert.ok(report.issues.some((x) => x.code === "visual-order-inversion"));
});
test("P20AE reading order ignores visual order changes across declared columns", () => {
  const report = compareReadingOrder([item("left", 0, 100, { column: 0 }), item("right", 1, 0, { column: 1, rect: { x: 220, y: 0, width: 100, height: 40, top: 0, right: 320, bottom: 40, left: 220 } })]);
  assert.equal(report.issues.some((x) => x.code === "visual-order-inversion"), false);
});
test("P20AE reading order ignores hidden elements", () => {
  const report = compareReadingOrder([item("a", 0, 50), item("hidden", 1, 0, { visible: false }), item("b", 2, 100)]);
  assert.equal(report.issues.length, 0);
  assert.equal(report.visibleItems, 2);
});
test("P20AE reading order detects duplicate identifiers", () => {
  assert.ok(compareReadingOrder([item("a", 0, 0), item("a", 1, 50)]).issues.some((x) => x.code === "duplicate-item-id"));
});
test("P20AE reading order detects duplicate DOM positions", () => {
  assert.ok(compareReadingOrder([item("a", 0, 0), item("b", 0, 50)]).issues.some((x) => x.code === "duplicate-dom-index"));
});
test("P20AE reading order detects negative DOM positions", () => {
  assert.ok(compareReadingOrder([item("a", -1, 0)]).issues.some((x) => x.code === "negative-dom-index"));
});
test("P20AE reading order detects overlapping adjacent items", () => {
  const report = compareReadingOrder([item("a", 0, 0), item("b", 1, 20)]);
  assert.ok(report.issues.some((x) => x.code === "overlap-in-reading-order"));
});
test("P20AE reading order permits touching non-overlapping boxes", () => {
  const report = compareReadingOrder([item("a", 0, 0), item("b", 1, 40)]);
  assert.equal(report.issues.some((x) => x.code === "overlap-in-reading-order"), false);
});
test("P20AE reading order key follows DOM order", () => {
  assert.equal(readingOrderKey([item("b", 1, 40), item("a", 0, 0)]), "a>b");
});
test("P20AE reading order key is stable", () => {
  const items = [item("a", 0, 0), item("b", 1, 50)];
  assert.equal(readingOrderKey(items), readingOrderKey(items));
});
test("P20AE reading order summary reports counts", () => {
  const report = compareReadingOrder([item("a", 0, 0), item("b", 1, 50)]);
  assert.match(readingOrderSummary(report), /Visible: 2/);
});
test("P20AE reading order report counts all observed items", () => {
  const report = compareReadingOrder([item("a", 0, 0), item("hidden", 1, 10, { visible: false })]);
  assert.equal(report.orderedItems, 2);
});
test("P20AE reading order permits multi-column layout with column metadata", () => {
  const report = compareReadingOrder([
    item("left-top", 0, 0, { column: 0 }),
    item("right-top", 1, 0, { column: 1 }),
    item("left-bottom", 2, 60, { column: 0 }),
  ]);
  assert.equal(report.issues.some((x) => x.code === "visual-order-inversion"), false);
});
