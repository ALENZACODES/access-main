import test from "node:test";
import assert from "node:assert/strict";
import {
  orientationOf, viewportIsValid, overflowBy, rectInsideViewport, rectVisible,
  isControl, controlSizePasses, textSpacingPasses, evaluate, matrixKey, summarize,
  DEFAULT_POLICY, TEXT_SPACING_REQUIREMENTS,
} from "./p20ae-reflow-contracts.ts";
import { buildMatrix, reconcileMatrix, matrixCoverage, matrixIsComplete, matrixSummary } from "./p20ae-reflow-matrix.ts";

const viewport = (patch = {}) => ({
  width: 320, height: 640, clientWidth: 320, clientHeight: 640,
  scrollWidth: 320, scrollHeight: 900, scrollX: 0, scrollY: 0,
  deviceScaleFactor: 1, orientation: "portrait", rootFontSize: 16, ...patch,
});
const rect = (patch = {}) => ({ x: 0, y: 0, width: 44, height: 44, top: 0, right: 44, bottom: 44, left: 0, ...patch });
const box = (patch = {}) => ({
  selector: "#continue", name: "Continue", kind: "button", rect: rect(), visible: true,
  disabled: false, tabIndex: 0, fontSize: 16, lineHeight: 24, textLength: 8,
  scrollWidth: 44, clientWidth: 44, scrollHeight: 44, clientHeight: 44,
  fixed: false, sticky: false, clippingAncestors: [], ...patch,
});
const observation = (patch = {}) => ({
  route: "/dev/narrow", locale: "en", viewport: viewport(), elements: [box()],
  mainCount: 1, headingCount: 1, visibleHeadingCount: 1, textSpacing: null, ...patch,
});
const issueCodes = (report) => report.issues.map((issue) => issue.code);

test("P20AE orientation classifies portrait geometry", () => assert.equal(orientationOf(320, 640), "portrait"));
test("P20AE orientation classifies landscape geometry", () => assert.equal(orientationOf(640, 320), "landscape"));
test("P20AE orientation classifies square geometry", () => assert.equal(orientationOf(500, 500), "square"));
test("P20AE orientation rejects zero width", () => assert.equal(orientationOf(0, 500), "UNKNOWN"));
test("P20AE orientation rejects negative height", () => assert.equal(orientationOf(500, -1), "UNKNOWN"));
test("P20AE orientation rejects NaN", () => assert.equal(orientationOf(Number.NaN, 500), "UNKNOWN"));

test("P20AE viewport accepts valid CSS geometry", () => assert.equal(viewportIsValid(viewport()), true));
test("P20AE viewport rejects zero width", () => assert.equal(viewportIsValid(viewport({ width: 0 })), false));
test("P20AE viewport rejects zero height", () => assert.equal(viewportIsValid(viewport({ height: 0 })), false));
test("P20AE viewport rejects negative client width", () => assert.equal(viewportIsValid(viewport({ clientWidth: -1 })), false));
test("P20AE viewport rejects zero device scale", () => assert.equal(viewportIsValid(viewport({ deviceScaleFactor: 0 })), false));
test("P20AE viewport rejects negative scroll width", () => assert.equal(viewportIsValid(viewport({ scrollWidth: -1 })), false));
test("P20AE viewport rejects negative scroll offset", () => assert.equal(viewportIsValid(viewport({ scrollX: -1 })), false));
test("P20AE viewport rejects infinite root font", () => assert.equal(viewportIsValid(viewport({ rootFontSize: Infinity })), false));

test("P20AE overflow is zero when document fits", () => assert.equal(overflowBy(viewport()), 0));
test("P20AE overflow subtracts one pixel tolerance", () => assert.equal(overflowBy(viewport({ scrollWidth: 350 })), 29));
test("P20AE overflow respects caller tolerance", () => assert.equal(overflowBy(viewport({ scrollWidth: 350 }), 5), 25));
test("P20AE overflow is zero within tolerance", () => assert.equal(overflowBy(viewport({ scrollWidth: 321 }), 1), 0));
test("P20AE overflow is infinite for invalid viewport", () => assert.equal(overflowBy(viewport({ clientWidth: 0 })), Infinity));
test("P20AE overflow is infinite for negative tolerance", () => assert.equal(overflowBy(viewport(), -1), Infinity));

test("P20AE rectangle inside viewport passes", () => assert.equal(rectInsideViewport(rect(), viewport()), true));
test("P20AE rectangle with negative left fails", () => assert.equal(rectInsideViewport(rect({ left: -1 }), viewport()), false));
test("P20AE rectangle beyond right edge fails", () => assert.equal(rectInsideViewport(rect({ right: 321 }), viewport()), false));
test("P20AE rectangle beyond bottom edge fails", () => assert.equal(rectInsideViewport(rect({ bottom: 641 }), viewport()), false));
test("P20AE rectangle outside viewport is classified outside", () => assert.equal(rectVisible(rect({ left: 400, right: 444 }), viewport()), "outside"));
test("P20AE rectangle partly visible is classified partial", () => assert.equal(rectVisible(rect({ left: 300, right: 344 }), viewport()), "partial"));
test("P20AE rectangle fully visible is classified visible", () => assert.equal(rectVisible(rect(), viewport()), "visible"));
test("P20AE rectangle with invalid coordinate is classified invalid", () => assert.equal(rectVisible(rect({ top: NaN }), viewport()), "invalid"));

for (const kind of ["button", "link", "input", "select", "textarea", "summary"]) {
  test(`P20AE ${kind} is classified as a control`, () => assert.equal(isControl(box({ kind })), true));
}
test("P20AE generic content is not a control", () => assert.equal(isControl(box({ kind: "other" })), false));
test("P20AE 44 by 44 control meets target policy", () => assert.equal(controlSizePasses(box()), true));
test("P20AE 43 pixel wide control fails target policy", () => assert.equal(controlSizePasses(box({ rect: rect({ width: 43, right: 43 }) })), false));
test("P20AE 43 pixel high control fails target policy", () => assert.equal(controlSizePasses(box({ rect: rect({ height: 43, bottom: 43 }) })), false));
test("P20AE disabled control is exempt from active target sizing", () => assert.equal(controlSizePasses(box({ disabled: true, rect: rect({ width: 10, height: 10 }) })), true));
test("P20AE non-control is not sized as a target", () => assert.equal(controlSizePasses(box({ kind: "other", rect: rect({ width: 1, height: 1 }) })), true));

test("P20AE exact text-spacing requirements pass", () => assert.equal(textSpacingPasses(TEXT_SPACING_REQUIREMENTS), true));
test("P20AE line height below 1.5 fails text spacing", () => assert.equal(textSpacingPasses({ ...TEXT_SPACING_REQUIREMENTS, lineHeight: 1.49 }), false));
test("P20AE paragraph gap below 2 fails text spacing", () => assert.equal(textSpacingPasses({ ...TEXT_SPACING_REQUIREMENTS, paragraphGap: 1.99 }), false));
test("P20AE letter spacing below 0.12 fails text spacing", () => assert.equal(textSpacingPasses({ ...TEXT_SPACING_REQUIREMENTS, letterSpacing: .119 }), false));
test("P20AE word spacing below 0.16 fails text spacing", () => assert.equal(textSpacingPasses({ ...TEXT_SPACING_REQUIREMENTS, wordSpacing: .159 }), false));
test("P20AE NaN line height fails text spacing", () => assert.equal(textSpacingPasses({ ...TEXT_SPACING_REQUIREMENTS, lineHeight: NaN }), false));

test("P20AE complete observation has no errors", () => assert.equal(evaluate(observation()).errors, 0));
test("P20AE complete observation is clean", () => assert.equal(evaluate(observation()).clean, true));
test("P20AE empty route is reported", () => assert.ok(issueCodes(evaluate(observation({ route: "" }))).includes("route-missing")));
test("P20AE unknown locale can remain unknown by default", () => assert.equal(evaluate(observation({ locale: "UNKNOWN" })).clean, true));
test("P20AE unknown locale can be required by policy", () => {
  const report = evaluate(observation({ locale: "UNKNOWN" }), { ...DEFAULT_POLICY, requireLocale: true });
  assert.ok(issueCodes(report).includes("locale-unknown"));
});
test("P20AE missing main landmark is reported", () => assert.ok(issueCodes(evaluate(observation({ mainCount: 0 }))).includes("main-missing")));
test("P20AE duplicate main landmark is reported", () => assert.ok(issueCodes(evaluate(observation({ mainCount: 2 }))).includes("main-duplicate")));
test("P20AE missing main heading is reported", () => assert.ok(issueCodes(evaluate(observation({ headingCount: 0 }))).includes("heading-missing")));
test("P20AE duplicate main heading is reported", () => assert.ok(issueCodes(evaluate(observation({ headingCount: 2 }))).includes("heading-duplicate")));
test("P20AE hidden main heading is reported", () => assert.ok(issueCodes(evaluate(observation({ visibleHeadingCount: 0 }))).includes("heading-hidden")));
test("P20AE horizontal overflow is an error", () => assert.ok(issueCodes(evaluate(observation({ viewport: viewport({ scrollWidth: 400 }) }))).includes("horizontal-overflow")));
test("P20AE horizontal scroll offset is an error", () => assert.ok(issueCodes(evaluate(observation({ viewport: viewport({ scrollX: 10 }) }))).includes("horizontal-scroll-offset")));
test("P20AE orientation mismatch is a review", () => {
  const report = evaluate(observation({ viewport: viewport({ orientation: "landscape" }) }));
  assert.ok(report.issues.some((issue) => issue.code === "orientation-mismatch" && issue.severity === "review"));
});
test("P20AE root font below threshold is a review", () => assert.ok(issueCodes(evaluate(observation({ viewport: viewport({ rootFontSize: 10 }) }))).includes("root-font-small")));
test("P20AE target width below 44 is an error", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ rect: rect({ width: 30, right: 30 }) })] }))).includes("target-small")));
test("P20AE target height below 44 is an error", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ rect: rect({ height: 30, bottom: 30 }) })] }))).includes("target-small")));
test("P20AE target outside viewport is hidden error", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ rect: rect({ left: 400, right: 444 }) })] }))).includes("target-hidden")));
test("P20AE target partly outside viewport is review", () => {
  const report = evaluate(observation({ elements: [box({ rect: rect({ left: 300, right: 344 }) })] }));
  assert.ok(report.issues.some((issue) => issue.code === "target-clipped" && issue.severity === "review"));
});
test("P20AE invisible target is reported", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ visible: false })] }))).includes("target-hidden")));
test("P20AE negative tabindex is review", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ tabIndex: -1 })] }))).includes("target-tabindex-negative")));
test("P20AE disabled target is review", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ disabled: true })] }))).includes("target-disabled")));
test("P20AE content overflow is review", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ kind: "other", scrollWidth: 300, clientWidth: 100 })] }))).includes("content-overflow")));
test("P20AE content clipping is review", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ kind: "other", rect: rect({ left: -1, right: 43 }) })] }))).includes("content-clipped")));
test("P20AE tiny text is review", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ kind: "other", fontSize: 10 })] }))).includes("content-font-small")));
test("P20AE tight line height is review", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ kind: "other", fontSize: 16, lineHeight: 16 })] }))).includes("content-line-height-tight")));
test("P20AE fixed obstruction is review", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ fixed: true, rect: rect({ height: 200, bottom: 200 }) })] }))).includes("fixed-obstruction")));
test("P20AE sticky obstruction is review", () => assert.ok(issueCodes(evaluate(observation({ elements: [box({ sticky: true, rect: rect({ height: 150, bottom: 150 }) })] }))).includes("sticky-obstruction")));
test("P20AE text spacing line height is checked", () => assert.ok(issueCodes(evaluate(observation({ textSpacing: { lineHeight: 1, paragraphGap: 2, letterSpacing: .12, wordSpacing: .16 } }))).includes("text-line-height")));
test("P20AE text spacing paragraph gap is checked", () => assert.ok(issueCodes(evaluate(observation({ textSpacing: { lineHeight: 1.5, paragraphGap: 1, letterSpacing: .12, wordSpacing: .16 } }))).includes("text-paragraph-gap")));
test("P20AE text spacing letter spacing is checked", () => assert.ok(issueCodes(evaluate(observation({ textSpacing: { lineHeight: 1.5, paragraphGap: 2, letterSpacing: 0, wordSpacing: .16 } }))).includes("text-letter-spacing")));
test("P20AE text spacing word spacing is checked", () => assert.ok(issueCodes(evaluate(observation({ textSpacing: { lineHeight: 1.5, paragraphGap: 2, letterSpacing: .12, wordSpacing: 0 } }))).includes("text-word-spacing")));
test("P20AE text spacing passing all four values is clean", () => {
  const report = evaluate(observation({ textSpacing: TEXT_SPACING_REQUIREMENTS }));
  assert.equal(report.issues.some((issue) => issue.code.startsWith("text-")), false);
});
test("P20AE report counts controls and content", () => {
  const report = evaluate(observation({ elements: [box(), box({ kind: "other" })] }));
  assert.equal(report.controls, 1);
  assert.equal(report.content, 1);
});
test("P20AE report separates errors and reviews", () => {
  const report = evaluate(observation({ viewport: viewport({ scrollWidth: 500 }), elements: [box({ disabled: true })] }));
  assert.ok(report.errors > 0);
  assert.ok(report.reviews > 0);
});
test("P20AE summary reports matrix run count", () => assert.match(summarize([evaluate(observation())]), /Runs: 1/));
test("P20AE matrix key preserves locale", () => assert.equal(matrixKey("/a", 320, 640, "fr"), "/a|320x640|fr"));

test("P20AE matrix builds one cell per route, locale and width", () => {
  const cells = buildMatrix(["/a", "/b"], [320, 768], [568, 900], ["en", "fr"]);
  assert.equal(cells.length, 8);
});
test("P20AE matrix chooses a height that is at least 1.5 times width when possible", () => {
  const cells = buildMatrix(["/a"], [320], [568, 640, 900], ["en"]);
  assert.equal(cells[0].height, 568);
});
test("P20AE matrix rejects protocol-relative routes", () => {
  assert.deepEqual(buildMatrix(["//evil"], [320], [640], ["en"]), []);
});
test("P20AE matrix rejects non-positive widths", () => assert.deepEqual(buildMatrix(["/a"], [0], [640], ["en"]), []));
test("P20AE matrix completion records missing cells", () => {
  const cells = buildMatrix(["/dev/narrow"], [320, 768], [640, 900], ["en"]);
  const report = evaluate(observation());
  const result = reconcileMatrix(cells, [report]);
  assert.equal(result.missing.length, 1);
});
test("P20AE matrix completion detects duplicate reports", () => {
  const cell = buildMatrix(["/dev/narrow"], [320], [640], ["en"]);
  const report = evaluate(observation());
  const result = reconcileMatrix(cell, [report, report]);
  assert.equal(result.duplicateKeys.length, 1);
});
test("P20AE matrix coverage is one for complete matrix", () => {
  const cells = buildMatrix(["/dev/narrow"], [320], [640], ["en"]);
  const result = reconcileMatrix(cells, [evaluate(observation())]);
  assert.equal(matrixCoverage(result), 1);
  assert.equal(matrixIsComplete(result), true);
});
test("P20AE matrix coverage is zero when no reports exist", () => {
  const cells = buildMatrix(["/a"], [320], [640], ["en"]);
  assert.equal(matrixCoverage(reconcileMatrix(cells, [])), 0);
});
test("P20AE empty matrix has full vacuous coverage", () => assert.equal(matrixCoverage(reconcileMatrix([], [])), 1));
test("P20AE matrix summary shows missing count", () => {
  const result = reconcileMatrix(buildMatrix(["/a"], [320], [640], ["en"]), []);
  assert.match(matrixSummary(result), /Missing: 1/);
});
