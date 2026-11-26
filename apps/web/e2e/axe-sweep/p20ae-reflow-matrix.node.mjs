import test from "node:test";
import assert from "node:assert/strict";
import { buildMatrix, reconcileMatrix, matrixCoverage, matrixIsComplete, matrixSummary } from "./p20ae-reflow-matrix.ts";
import { evaluate } from "./p20ae-reflow-contracts.ts";

const cell = (route, width, height, locale = "en") => ({ route, width, height, locale });
const report = (route, width, height, locale = "en") => evaluate({
  route, locale, viewport: { width, height, clientWidth: width, clientHeight: height,
    scrollWidth: width, scrollHeight: height, scrollX: 0, scrollY: 0,
    deviceScaleFactor: 1, orientation: width > height ? "landscape" : "portrait", rootFontSize: 16 },
  elements: [], mainCount: 1, headingCount: 1, visibleHeadingCount: 1, textSpacing: null,
});
test("P20AE matrix preserves caller route order before reconciliation", () => {
  const cells = buildMatrix(["/help", "/offline"], [320], [640], ["en"]);
  assert.deepEqual(cells.map((x) => x.route), ["/help", "/offline"]);
});
test("P20AE matrix creates English and French cells", () => {
  const cells = buildMatrix(["/"], [320], [640], ["en", "fr"]);
  assert.deepEqual(cells.map((x) => x.locale), ["en", "fr"]);
});
test("P20AE matrix chooses the smallest fitting height", () => {
  const cells = buildMatrix(["/"], [320], [480, 568, 720], ["en"]);
  assert.equal(cells[0].height, 480);
});
test("P20AE matrix chooses the last available height when none fits", () => {
  const cells = buildMatrix(["/"], [768], [480, 640], ["en"]);
  assert.equal(cells[0].height, 640);
});
test("P20AE matrix omits cells when heights are absent", () => {
  assert.deepEqual(buildMatrix(["/"], [320], [], ["en"]), []);
});
test("P20AE matrix reconciliation counts exact requested cells", () => {
  const requested = [cell("/a", 320, 640), cell("/b", 320, 640)];
  const result = reconcileMatrix(requested, [report("/a", 320, 640)]);
  assert.equal(result.requested, 2);
  assert.equal(result.completed, 1);
});
test("P20AE matrix reconciliation marks complete coverage", () => {
  const requested = [cell("/a", 320, 640), cell("/b", 320, 640)];
  const result = reconcileMatrix(requested, [report("/a", 320, 640), report("/b", 320, 640)]);
  assert.equal(matrixIsComplete(result), true);
  assert.equal(matrixCoverage(result), 1);
});
test("P20AE matrix reconciliation catches an extra unrequested report", () => {
  const result = reconcileMatrix([cell("/a", 320, 640)], [report("/a", 320, 640), report("/b", 320, 640)]);
  assert.equal(result.completed, 2);
  assert.equal(matrixIsComplete(result), false);
});
test("P20AE matrix reconciliation catches duplicate report keys", () => {
  const one = report("/a", 320, 640);
  const result = reconcileMatrix([cell("/a", 320, 640)], [one, one]);
  assert.equal(result.duplicateKeys.length, 1);
});
test("P20AE matrix reconciliation keeps one canonical report per key", () => {
  const first = report("/a", 320, 640);
  const second = report("/a", 320, 640);
  const result = reconcileMatrix([cell("/a", 320, 640)], [first, second]);
  assert.equal(result.reports.length, 1);
});
test("P20AE matrix reconciliation distinguishes locales", () => {
  const result = reconcileMatrix([cell("/a", 320, 640, "en"), cell("/a", 320, 640, "fr")],
    [report("/a", 320, 640, "en")]);
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].locale, "fr");
});
test("P20AE matrix reconciliation distinguishes heights", () => {
  const result = reconcileMatrix([cell("/a", 320, 640), cell("/a", 320, 800)],
    [report("/a", 320, 640)]);
  assert.equal(result.missing[0].height, 800);
});
test("P20AE matrix reconciliation sorts canonical report order", () => {
  const result = reconcileMatrix([cell("/b", 320, 640), cell("/a", 320, 640)],
    [report("/b", 320, 640), report("/a", 320, 640)]);
  assert.deepEqual(result.reports.map((x) => x.route), ["/a", "/b"]);
});
test("P20AE matrix summary reports requested and completed counts", () => {
  const result = reconcileMatrix([cell("/a", 320, 640)], []);
  assert.match(matrixSummary(result), /Requested: 1/);
  assert.match(matrixSummary(result), /Completed: 0/);
});
test("P20AE matrix empty request is complete", () => {
  const result = reconcileMatrix([], []);
  assert.equal(matrixIsComplete(result), true);
  assert.equal(matrixCoverage(result), 1);
});
test("P20AE matrix reports 50 percent coverage for half the cells", () => {
  const result = reconcileMatrix([cell("/a", 320, 640), cell("/b", 320, 640)],
    [report("/a", 320, 640)]);
  assert.equal(matrixCoverage(result), .5);
});
test("P20AE matrix coverage never exceeds 100 percent", () => {
  const result = reconcileMatrix([cell("/a", 320, 640)],
    [report("/a", 320, 640), report("/b", 320, 640)]);
  assert.equal(matrixCoverage(result), 1);
});
test("P20AE matrix rejects malformed route paths", () => {
  assert.deepEqual(buildMatrix(["//host"], [320], [640], ["en"]), []);
});
test("P20AE matrix accepts a root route", () => {
  assert.equal(buildMatrix(["/"], [320], [640], ["en"]).length, 1);
});
test("P20AE matrix summary reports duplicates", () => {
  const one = report("/a", 320, 640);
  const result = reconcileMatrix([cell("/a", 320, 640)], [one, one]);
  assert.match(matrixSummary(result), /Duplicates: 1/);
});
