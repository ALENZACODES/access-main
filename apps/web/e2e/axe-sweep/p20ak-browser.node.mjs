import test from "node:test";
import assert from "node:assert/strict";
import { boundMeasurement, generatedDomId, browserSnapshotFindings } from "./p20ak-browser.ts";
import { sampleSnapshot } from "./p20ak-types.ts";
const capture = (patch = {}) => ({ snapshot: sampleSnapshot(), activeTag: "BUTTON", ariaLiveCount: 0, links: 3,
  captureFailed: false, ...patch });

test("nonnegative measured geometry is retained", () => {
  assert.equal(boundMeasurement(44), 44);
});
for (const value of [-1, Number.NaN, Infinity, -Infinity, 1_000_001]) {
  test(`unmeasurable geometry ${String(value)} remains UNKNOWN`, () => {
    assert.equal(boundMeasurement(value), null);
  });
}
for (const value of [0, 1, 43, 44, 1280, 100000]) {
  test(`bounded observed geometry ${value} is unchanged`, () => {
    assert.equal(boundMeasurement(value), value);
  });
}
test("caller can impose lower maximum measurement", () => {
  assert.equal(boundMeasurement(200, 100), null);
});
test("missing geometry is not inferred", () => {
  assert.equal(boundMeasurement(null), null);
});
test("generated focus ID includes observed role", () => {
  assert.equal(generatedDomId(2, "button"), "button-2");
});
test("generated focus ID handles unknown role", () => {
  assert.equal(generatedDomId(4, ""), "target-4");
});
test("clean browser snapshot passes shell checks", () => {
  assert.deepEqual(browserSnapshotFindings(capture(), "en"), []);
});
test("French document is measured against French expected locale", () => {
  assert.deepEqual(browserSnapshotFindings(capture({ snapshot: sampleSnapshot({ language: "fr" }) }), "fr"), []);
});
test("French mismatch cannot be silently accepted as English", () => {
  assert.ok(browserSnapshotFindings(capture(), "fr").includes("browser-language-mismatch"));
});
test("unknown document language is not asserted to be French", () => {
  const sample = capture({ snapshot: sampleSnapshot({ language: "UNKNOWN" }) });
  assert.ok(browserSnapshotFindings(sample, "fr").includes("browser-language-mismatch"));
});
test("missing main landmark is surfaced", () => {
  const sample = capture({ snapshot: sampleSnapshot({ mainCount: 0 }) });
  assert.ok(browserSnapshotFindings(sample, "en").includes("browser-main-count"));
});
test("multiple main landmarks are surfaced", () => {
  const sample = capture({ snapshot: sampleSnapshot({ mainCount: 2 }) });
  assert.ok(browserSnapshotFindings(sample, "en").includes("browser-main-count"));
});
test("missing first heading is surfaced", () => {
  const sample = capture({ snapshot: sampleSnapshot({ heading: "" }) });
  assert.ok(browserSnapshotFindings(sample, "en").includes("browser-heading-empty"));
});
test("missing title is surfaced", () => {
  const sample = capture({ snapshot: sampleSnapshot({ title: "" }) });
  assert.ok(browserSnapshotFindings(sample, "en").includes("browser-title-empty"));
});
test("mobile overflow is surfaced", () => {
  const sample = capture({ snapshot: sampleSnapshot({ width: 320, horizontalOverflow: 20 }) });
  assert.ok(browserSnapshotFindings(sample, "en").includes("browser-horizontal-overflow"));
});
test("no overflow is not a failure", () => {
  const sample = capture({ snapshot: sampleSnapshot({ width: 320, horizontalOverflow: 0 }) });
  assert.ok(!browserSnapshotFindings(sample, "en").includes("browser-horizontal-overflow"));
});
test("browser adapter retains absence of observed evidence", () => {
  assert.deepEqual(capture().snapshot.evidence, []);
});
test("browser adapter retains absence of observed cache entries", () => {
  assert.deepEqual(capture().snapshot.resources, []);
});
test("browser shell report can contain independent findings", () => {
  const sample = capture({ snapshot: sampleSnapshot({ language: "fr", mainCount: 0,
    title: "", heading: "", horizontalOverflow: 10 }) });
  const findings = browserSnapshotFindings(sample, "en");
  assert.equal(findings.length, 5);
  assert.equal(new Set(findings).size, 5);
});
test("the browser adapter never assigns known evidence to an empty collection", () => {
  const sample = capture({ snapshot: sampleSnapshot({ connectivity: "offline", evidence: [] }) });
  assert.equal(sample.snapshot.evidence.length, 0);
  assert.equal(sample.snapshot.connectivity, "offline");
});
test("unknown worker state is preserved in offline browser sample", () => {
  const sample = capture({ snapshot: sampleSnapshot({ connectivity: "offline" }) });
  assert.equal(sample.snapshot.worker.supported, null);
  assert.equal(sample.snapshot.worker.controlling, null);
});
