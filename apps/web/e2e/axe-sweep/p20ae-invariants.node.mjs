import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, WIDTH_MATRIX, HEIGHT_MATRIX } from "./p20ae-reflow-contracts.ts";
import { buildMatrix } from "./p20ae-reflow-matrix.ts";

test("P20AE invariant: viewport matrix has nine widths", () => assert.equal(WIDTH_MATRIX.length, 9));
test("P20AE invariant: viewport matrix has five heights", () => assert.equal(HEIGHT_MATRIX.length, 5));
test("P20AE invariant: 320px is the first width", () => assert.equal(WIDTH_MATRIX[0], 320));
test("P20AE invariant: 1280px is included", () => assert.ok(WIDTH_MATRIX.includes(1280)));
test("P20AE invariant: all configured widths are integer CSS pixels", () => assert.ok(WIDTH_MATRIX.every(Number.isInteger)));
test("P20AE invariant: all configured heights are integer CSS pixels", () => assert.ok(HEIGHT_MATRIX.every(Number.isInteger)));
test("P20AE invariant: no configured width is duplicated", () => assert.equal(new Set(WIDTH_MATRIX).size, WIDTH_MATRIX.length));
test("P20AE invariant: no configured height is duplicated", () => assert.equal(new Set(HEIGHT_MATRIX).size, HEIGHT_MATRIX.length));
test("P20AE invariant: empty element list still audits document geometry", () => {
  const report = evaluate({ route: "/", locale: "en", viewport: { width: 320, height: 640, clientWidth: 320, clientHeight: 640,
    scrollWidth: 340, scrollHeight: 640, scrollX: 0, scrollY: 0, deviceScaleFactor: 1, orientation: "portrait", rootFontSize: 16 },
    elements: [], mainCount: 1, headingCount: 1, visibleHeadingCount: 1, textSpacing: null });
  assert.ok(report.issues.some((issue) => issue.code === "horizontal-overflow"));
});
test("P20AE invariant: matrix cells retain every requested route", () => {
  const cells = buildMatrix(["/home", "/help", "/offline"], [320], [640], ["en"]);
  assert.deepEqual(cells.map((cell) => cell.route), ["/home", "/help", "/offline"]);
});
test("P20AE invariant: matrix cells retain requested locales", () => {
  const cells = buildMatrix(["/home"], [320], [640], ["en", "fr"]);
  assert.deepEqual(cells.map((cell) => cell.locale), ["en", "fr"]);
});
test("P20AE invariant: matrix cells do not invent a route when input is empty", () => {
  assert.deepEqual(buildMatrix([], [320], [640], ["en"]), []);
});

test("P20AE invariant: an empty requested matrix stays empty", () => assert.equal(buildMatrix([], [], [], []).length, 0));
test("P20AE invariant: all widths are at least 320 CSS pixels", () => assert.ok(WIDTH_MATRIX.every((width) => width >= 320)));
test("P20AE invariant: every height is positive", () => assert.ok(HEIGHT_MATRIX.every((height) => height > 0)));
test("P20AE invariant: width fixtures include tablet width", () => assert.ok(WIDTH_MATRIX.includes(768)));
test("P20AE invariant: width fixtures include phone width", () => assert.ok(WIDTH_MATRIX.includes(414)));
test("P20AE invariant: height fixtures include compact height", () => assert.ok(HEIGHT_MATRIX.includes(568)));
test("P20AE invariant: height fixtures include desktop height", () => assert.ok(HEIGHT_MATRIX.includes(900)));
test("P20AE invariant: no viewport width is a fractional CSS pixel", () => assert.ok(WIDTH_MATRIX.every((width) => Number.isInteger(width))));
test("P20AE invariant: no viewport height is a fractional CSS pixel", () => assert.ok(HEIGHT_MATRIX.every((height) => Number.isInteger(height))));
test("P20AE invariant: width matrix is non-empty", () => assert.ok(WIDTH_MATRIX.length > 0));
test("P20AE invariant: height matrix is non-empty", () => assert.ok(HEIGHT_MATRIX.length > 0));
