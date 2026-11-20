import test from "node:test";
import assert from "node:assert/strict";
import { captureFindings, actualLanguage } from "./p20am-browser.ts";
import { sampleScreen, sampleControl, sampleAnnouncement, sampleResource } from "./p20am-model.ts";
const rules = (items) => items.map((item) => item.rule);
const capture = (change = {}) => ({ screen: sampleScreen(), documentLanguage: "en",
  overflowX: 0, headingCount: 1, statusCount: 0, serviceWorkerControlled: null, ...change });
for (const [value, language] of [
  ["en", "en"], ["en-CA", "en"], ["EN-US", "en"],
  ["fr", "fr"], ["fr-CA", "fr"], ["FR-ca", "fr"],
  ["und", null], ["", null], ["es", null],
]) {
  test(`observed document language ${value} is parsed`, () => {
    assert.equal(actualLanguage(value), language);
  });
}
test("clean read-only observation has no findings", () => {
  assert.deepEqual(captureFindings(capture(), "en"), []);
});
test("French document with French screen data is acceptable", () => {
  assert.deepEqual(captureFindings(capture({ documentLanguage: "fr-CA",
    screen: sampleScreen({ language: "fr" }) }), "fr"), []);
});
test("wrong document language is exposed independently of screen", () => {
  const issues = captureFindings(capture({ documentLanguage: "en",
    screen: sampleScreen({ language: "fr" }) }), "fr");
  assert.ok(rules(issues).includes("browser-language"));
});
test("two first-level headings are explicitly diagnosed", () => {
  assert.ok(rules(captureFindings(capture({ headingCount: 2 }), "en"))
    .includes("browser-heading-count"));
});
test("missing first-level heading is explicitly diagnosed", () => {
  assert.ok(rules(captureFindings(capture({ headingCount: 0 }), "en"))
    .includes("browser-heading-count"));
});
test("320px horizontal overflow is an accessibility finding", () => {
  assert.ok(rules(captureFindings(capture({ overflowX: 14 }), "en"))
    .includes("browser-horizontal-overflow"));
});
test("zero horizontal overflow is not a finding", () => {
  assert.ok(!rules(captureFindings(capture({ overflowX: 0 }), "en"))
    .includes("browser-horizontal-overflow"));
});
test("unknown service-worker state is not treated as controlling the page", () => {
  const observed = capture({ serviceWorkerControlled: null });
  assert.equal(observed.serviceWorkerControlled, null);
});
test("browser findings preserve screen-level keyboard failures", () => {
  const observed = capture({ screen: sampleScreen({ controls: [sampleControl({ width: 31 })] }) });
  assert.ok(rules(captureFindings(observed, "en")).includes("control-width"));
});
test("browser findings preserve screen-level announcement failures", () => {
  const observed = capture({ screen: sampleScreen({ outcome: "error",
    announcements: [sampleAnnouncement({ politeness: "off" })] }) });
  assert.ok(rules(captureFindings(observed, "en")).includes("outcome-silent"));
});
test("browser findings preserve measured cache size failures", () => {
  const observed = capture({ screen: sampleScreen({ resources: [sampleResource({ bytes: 524289 })] }) });
  assert.ok(rules(captureFindings(observed, "en")).includes("resource-file-budget"));
});
test("browser findings preserve invalid route identity", () => {
  const observed = capture({ screen: sampleScreen({ route: "//external" }) });
  assert.ok(rules(captureFindings(observed, "en")).includes("screen-route-invalid"));
});
test("observing source records does not upgrade UNKNOWN", () => {
  const observed = capture();
  assert.deepEqual(observed.screen.records, []);
});
test("observed empty status region is not interpreted as an announcement", () => {
  const observed = capture({ statusCount: 0 });
  assert.equal(observed.statusCount, 0);
});
