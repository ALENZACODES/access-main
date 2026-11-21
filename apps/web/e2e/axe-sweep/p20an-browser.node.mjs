import test from "node:test";
import assert from "node:assert/strict";
import { normalizeName, recognizedLanguage, browserResultFindings, inspectBrowser, inspectOffline } from "./p20an-browser.ts";
import { exampleScreen } from "./p20an-fixtures.ts";

for (const [input, expected] of [["en", "en"], ["en-CA", "en"], ["fr", "fr"], ["fr-CA", "fr"], ["FR-ca", "fr"], ["und", null], ["es", null], ["", null]]) {
  test(`document locale ${input} resolves to ${expected}`, () => {
    assert.equal(recognizedLanguage(input), expected);
  });
}
for (const [input, expected] of [[null, null], ["", null], ["  ", null], ["Search", "Search"], ["  Open\n details ", "Open details"], ["Rechercher", "Rechercher"]]) {
  test(`accessible name collapses ${JSON.stringify(input)} without translating`, () => {
    assert.equal(normalizeName(input), expected);
  });
}
const good = (change = {}) => ({ screen: exampleScreen(), overflow: 0, rawDocumentLanguage: "en-CA", observedAt: 100, ...change });
test("complete English browser observation has no false findings", () => {
  assert.deepEqual(browserResultFindings(good(), "en"), []);
});
test("French document matches French locale", () => {
  assert.deepEqual(browserResultFindings(good({ rawDocumentLanguage: "fr-CA", screen: exampleScreen({ locale: "fr" }) }), "fr"), []);
});
test("document language mismatch is observable", () => {
  assert.ok(browserResultFindings(good({ rawDocumentLanguage: "en" }), "fr").includes("document-language-mismatch"));
});
test("unknown document language is not inferred from expected locale", () => {
  assert.ok(browserResultFindings(good({ rawDocumentLanguage: "und" }), "fr").includes("document-language-mismatch"));
});
test("320px horizontal overflow over tolerance is flagged", () => {
  assert.ok(browserResultFindings(good({ overflow: 3 }), "en").includes("horizontal-reflow"));
});
test("subpixel rounding is tolerated", () => {
  assert.equal(browserResultFindings(good({ overflow: 0.5 }), "en").includes("horizontal-reflow"), false);
});
test("missing main region is flagged", () => {
  assert.ok(browserResultFindings(good({ screen: exampleScreen({ mainCount: 0 }) }), "en").includes("main-region-count"));
});
test("duplicate main regions are flagged", () => {
  assert.ok(browserResultFindings(good({ screen: exampleScreen({ mainCount: 2 }) }), "en").includes("main-region-count"));
});
test("missing document title is flagged", () => {
  assert.ok(browserResultFindings(good({ screen: exampleScreen({ title: "" }) }), "en").includes("document-title"));
});
test("missing first-level heading is flagged", () => {
  assert.ok(browserResultFindings(good({ screen: exampleScreen({ heading: "" }) }), "en").includes("heading-one"));
});
test("browser inspection maps computed control dimensions without converting unknown provenance", async () => {
  const page = { evaluate: async () => ({
    lang: "fr-CA", title: "Exemple", heading: "Exemple", mainCount: 1,
    focusId: "search", activeDialogId: null, scrollY: 0, overflow: 0,
    controls: [{ id: "search", role: "button", name: "Rechercher", visible: true,
      enabled: true, inert: false, tabIndex: 0, width: 44, height: 44,
      focusVisible: true, dialogId: null }],
    announcements: [{ id: "status", text: "Prêt", politeness: "polite", busy: false }], observedAt: 15,
  }) };
  const observed = await inspectBrowser(page, { route: "/", locale: "fr", connection: "UNKNOWN" });
  assert.equal(observed.screen.locale, "fr");
  assert.equal(observed.screen.controls[0].accessibleName, "Rechercher");
  assert.equal(observed.screen.announcements[0].language, "fr");
  assert.equal(observed.screen.connection, "UNKNOWN");
  assert.equal(observed.screen.phase, "UNKNOWN");
});
test("browser observer does not fill blank accessible names", async () => {
  const page = { evaluate: async () => ({ lang: "en", title: "Example", heading: "Example", mainCount: 1,
    focusId: null, activeDialogId: null, scrollY: 0, overflow: 0,
    controls: [{ id: "x", role: "button", name: " ", visible: true, enabled: true,
      inert: false, tabIndex: 0, width: 44, height: 44, focusVisible: true, dialogId: null }],
    announcements: [], observedAt: 20 }) };
  const result = await inspectBrowser(page, { route: "/", locale: "en", connection: "online" });
  assert.equal(result.screen.controls[0].accessibleName, null);
});
test("offline observer reflects measured worker and cache state", async () => {
  const page = { evaluate: async () => ({ worker: "not-controlling", cacheNames: ["app-shell"], retryAvailable: false, fallbackVisible: false }) };
  const observed = await inspectOffline(page, "/help", "UNKNOWN");
  assert.equal(observed.route, "/help");
  assert.equal(observed.serviceWorker, "not-controlling");
  assert.deepEqual(observed.cacheNames, ["app-shell"]);
  assert.equal(observed.connection, "UNKNOWN");
  assert.equal(observed.resources.length, 0);
});
test("offline observer preserves cache inspection failure as null", async () => {
  const page = { evaluate: async () => ({ worker: "not-controlling", cacheNames: null, retryAvailable: false, fallbackVisible: false }) };
  const observed = await inspectOffline(page, "/", "offline");
  assert.equal(observed.cacheNames, null);
});
