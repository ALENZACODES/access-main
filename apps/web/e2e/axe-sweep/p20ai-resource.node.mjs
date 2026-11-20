import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalResourceUrl, cacheMayServe, networkMayServe, resourceAvailable, resourceUnknown,
  contentTypeRisk, validateBudget, resourceFindings, envelopeFindings,
  resourceTransitionFindings, measuredPrecacheBytes, missingCriticalUrls,
  sortedResourceFindings, budgetSummary,
} from "./p20ai-offline-envelope.ts";
const evidence = (changes = {}) => ({ id: "data", value: "Known example", source: "Example source",
  licence: "Example licence", retrievedOn: "2026-11-20", tier: "E", ...changes });
const resource = (changes = {}) => ({ url: "/index.html", purpose: "shell", status: 200,
  result: "cache", cache: "hit", bytes: 24000, capturedAt: 50, critical: true, ...changes });
const envelope = (changes = {}) => ({ route: "/", locale: "en", offline: true,
  entries: [resource()], preparedAt: 60, displayReady: true, displayedProvenance: [], ...changes });
const budget = { maxEntryBytes: 524288, maxTotalBytes: 8388608, maxMissingCritical: 0 };
const codes = (items) => items.map((item) => item.code);

test("reference offline resource envelope passes", () => assert.deepEqual(envelopeFindings(envelope()), []));
test("reference cached shell is available offline", () => assert.equal(resourceAvailable(resource(), true), true));
test("reference cached shell is available online", () => assert.equal(resourceAvailable(resource(), false), true));
test("reference budget is valid", () => assert.equal(validateBudget(budget), true));
for (const url of ["/", "/index.html", "/assets/app.js", "/maps/ontario.pbf?part=1", "./assets/chunk.js"]) {
  test(`local resource ${url} normalized safely`, () => assert.ok(canonicalResourceUrl(url)?.startsWith("/")));
}
for (const url of ["https://other.test/data", "http://host/x", "//foreign/path", "javascript:alert(1)",
  "data:text/plain,test", "file:///etc/passwd", "blob:sample", "ftp://sample.test/asset", "https://user:pass@site.test/file"]) {
  test(`unsafe resource URL ${url} fails closed`, () => assert.equal(canonicalResourceUrl(url), null));
}
for (const [changes, code] of [
  [{ url: "//foreign" }, "resource-url-unsafe"],
  [{ bytes: -1 }, "resource-bytes-invalid"],
  [{ bytes: 1.25 }, "resource-bytes-invalid"],
  [{ bytes: 524289 }, "resource-entry-budget"],
  [{ status: 99 }, "resource-http-status"],
  [{ status: 600 }, "resource-http-status"],
  [{ capturedAt: -1 }, "resource-timestamp"],
  [{ result: "network" }, "offline-network-claim"],
  [{ result: "cache", cache: "miss" }, "cache-miss-served"],
  [{ result: "failed" }, "critical-resource-unavailable"],
  [{ result: "UNKNOWN" }, "critical-resource-unknown"],
  [{ purpose: "font", url: "/assets/something.js" }, "font-type-suspect"],
  [{ purpose: "image", url: "/assets/something.json" }, "image-type-suspect"],
  [{ purpose: "map", url: "/assets/something.html" }, "map-type-suspect"],
]) {
  test(`resource contract ${code} from ${JSON.stringify(changes)}`, () => {
    assert.ok(codes(resourceFindings(resource(changes), true, 2, budget)).includes(code));
  });
}
test("stale cache is reported as information", () => {
  assert.ok(codes(resourceFindings(resource({ cache: "stale" }), true, 1, budget)).includes("cache-stale"));
});
test("cache misses cannot claim a hit", () => assert.equal(cacheMayServe(resource({ cache: "miss" })), false));
test("HTTP 404 cannot be served as cache success", () => assert.equal(cacheMayServe(resource({ status: 404 })), false));
test("network 200 counts only online", () => {
  const entry = resource({ result: "network", cache: "miss" });
  assert.equal(networkMayServe(entry), true);
  assert.equal(resourceAvailable(entry, false), true);
  assert.equal(resourceAvailable(entry, true), false);
});
test("null status leaves cache readiness unsupported", () => assert.equal(cacheMayServe(resource({ status: null })), false));
test("null size is explicitly unknown", () => assert.equal(resourceUnknown(resource({ bytes: null })), true));
test("known successful hit has no unknown field", () => assert.equal(resourceUnknown(resource()), false));
test("non-image binary file is not guessed as an image", () => assert.equal(contentTypeRisk(resource()), null));
for (const change of [
  { maxEntryBytes: 0 }, { maxEntryBytes: 1.5 }, { maxEntryBytes: -1 },
  { maxTotalBytes: 1 }, { maxTotalBytes: Number.NaN },
  { maxMissingCritical: -1 }, { maxMissingCritical: 1.5 },
]) {
  test(`invalid resource budget ${JSON.stringify(change)} is rejected`, () => {
    const bad = { ...budget, ...change };
    assert.equal(validateBudget(bad), false);
    assert.throws(() => envelopeFindings(envelope(), bad), RangeError);
  });
}
for (const [changed, code] of [
  [{ route: "//invalid" }, "envelope-route"],
  [{ preparedAt: -1 }, "envelope-time"],
  [{ entries: [resource(), resource()] }, "duplicate-resource"],
  [{ entries: [resource({ bytes: null })] }, "resource-total-UNKNOWN"],
  [{ entries: [resource({ result: "failed" })] }, "missing-critical-budget"],
  [{ entries: [resource({ result: "failed" })], displayReady: true }, "ready-with-missing-critical"],
  [{ entries: [resource({ result: "UNKNOWN" })] }, "offline-readiness-UNKNOWN"],
  [{ entries: [resource({ purpose: "pack", provenance: evidence({ source: null }) })] }, "offline-pack-source-unknown"],
  [{ entries: [resource({ purpose: "pack", provenance: undefined })] }, "offline-pack-source-unknown"],
  [{ displayedProvenance: [evidence()] }, "display-source-not-in-cache"],
  [{ displayedProvenance: [evidence({ retrievedOn: "invalid" })] }, "display-source-date-UNKNOWN"],
]) {
  test(`envelope detects ${code}`, () => {
    assert.ok(codes(envelopeFindings(envelope(changed))).includes(code));
  });
}
test("matching provenance in cache is accepted", () => {
  const p = evidence();
  const updated = envelope({ entries: [resource({ purpose: "pack", provenance: p })], displayedProvenance: [p] });
  assert.deepEqual(envelopeFindings(updated), []);
});
for (const field of ["source", "licence", "tier", "retrievedOn"]) {
  test(`displayed source ${field} drift is detected`, () => {
    const cached = evidence();
    const updated = envelope({ entries: [resource({ purpose: "pack", provenance: cached })],
      displayedProvenance: [evidence({ [field]: "changed" })] });
    assert.ok(codes(envelopeFindings(updated)).includes("display-source-drift"));
  });
}
test("total budget detects summed bytes", () => {
  const big = resource({ bytes: 500000 });
  const updated = envelope({ entries: Array.from({ length: 18 }, (_, i) => ({ ...big, url: `/resource${i}` })) });
  assert.ok(codes(envelopeFindings(updated)).includes("resource-total-budget"));
});
test("all measured file sizes combine accurately", () => {
  assert.equal(measuredPrecacheBytes([resource({ bytes: 10 }), resource({ bytes: 15 })]), 25);
});
test("unmeasured bytes do not become zero", () => {
  assert.equal(measuredPrecacheBytes([resource({ bytes: 10 }), resource({ bytes: null })]), null);
});
test("invalid size prevents budget summary from claiming numeric total", () => {
  assert.equal(measuredPrecacheBytes([resource({ bytes: -1 })]), null);
});
test("missing critical resources are listed by actual path", () => {
  const updated = envelope({ entries: [resource(), resource({ url: "/missing", result: "failed" })] });
  assert.deepEqual(missingCriticalUrls(updated), ["/missing"]);
});
test("noncritical unavailable resources are not critical missing", () => {
  const updated = envelope({ entries: [resource({ url: "/image.png", purpose: "image", critical: false, result: "failed" })] });
  assert.deepEqual(missingCriticalUrls(updated), []);
});
test("disconnect must enter offline state", () => {
  const problems = resourceTransitionFindings({ before: envelope({ offline: false }),
    after: envelope({ offline: false }), action: "disconnect", preserveSources: false });
  assert.ok(codes(problems).includes("offline-not-entered"));
});
test("reconnect must exit offline state", () => {
  const problems = resourceTransitionFindings({ before: envelope(), after: envelope(), action: "reconnect", preserveSources: false });
  assert.ok(codes(problems).includes("online-not-entered"));
});
test("non-navigation resource transition cannot change route", () => {
  const problems = resourceTransitionFindings({ before: envelope(), after: envelope({ route: "/help" }),
    action: "retry", preserveSources: false });
  assert.ok(codes(problems).includes("resource-transition-route"));
});
test("resource transition cannot change language silently", () => {
  const problems = resourceTransitionFindings({ before: envelope(), after: envelope({ locale: "fr" }),
    action: "retry", preserveSources: false });
  assert.ok(codes(problems).includes("resource-transition-locale"));
});
test("clear cache cannot keep serving cached hit", () => {
  const problems = resourceTransitionFindings({ before: envelope(), after: envelope(),
    action: "clear-cache", preserveSources: false });
  assert.ok(codes(problems).includes("clear-cache-still-serving"));
});
test("resource transition preserves provenance", () => {
  const p = evidence();
  const before = envelope({ entries: [resource({ purpose: "pack", provenance: p })], displayedProvenance: [p] });
  const after = envelope({ entries: [resource({ purpose: "pack", provenance: p })], displayedProvenance: [p] });
  assert.deepEqual(resourceTransitionFindings({ before, after, action: "retry", preserveSources: true }), []);
});
test("resource source disappearance is diagnosed", () => {
  const p = evidence();
  const before = envelope({ displayedProvenance: [p] });
  assert.ok(codes(resourceTransitionFindings({ before, after: envelope(), action: "retry", preserveSources: true }))
    .includes("resource-source-lost"));
});
test("source replacement is diagnosed", () => {
  const p = evidence();
  const before = envelope({ displayedProvenance: [p] });
  const after = envelope({ displayedProvenance: [evidence({ source: "different" })] });
  assert.ok(codes(resourceTransitionFindings({ before, after, action: "retry", preserveSources: true }))
    .includes("resource-source-modified"));
});
test("report includes explicit UNKNOWN total", () => {
  assert.match(budgetSummary(envelope({ entries: [resource({ bytes: null })] })), /bytes=UNKNOWN/);
});
test("resource findings have deterministic sorting", () => {
  const input = envelopeFindings(envelope({ entries: [resource({ result: "failed", bytes: null })] }));
  const sorted = sortedResourceFindings(input);
  assert.ok(sorted.every((item, index) => index === 0 || sorted[index - 1].step <= item.step));
});
