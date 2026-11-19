import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LANGUAGES, EVIDENCE, STATUS, SEVERITY, ARIA_BOOLEAN, COMPOSITE_ROLES,
  ITEM_ROLES, REFERENCES, KNOWN_LANDMARKS, plain, hasControl, labelText,
  recordId, calendarDay, sourceUrl, localAsset, frenchSpacing, finding,
  sortFindings, auditEvidence, auditSemanticSnapshot, auditBilingualEvidence,
  summarizeSemanticIssues, readinessForEvidence,
} from "./contracts.mjs";

function evidence(overrides = {}) {
  return {
    id: "entrance-one", translationKey: "entrance", language: "en",
    status: "SUPPORTED", tier: "PRIMARY",
    source: {
      name: "Public accessibility data", licence: "Open licence",
      url: "https://example.org/source", collectedOn: "2026-11-19",
    },
    offline: { state: "PRESENT", path: "/offline/entrance-one.json", capturedOn: "2026-11-19" },
    ...overrides,
  };
}
function bilingual(overrides = {}) {
  return [evidence(), evidence({ id: "entrance-two", language: "fr" }), ...overrides.extra ?? []];
}
function node(overrides = {}) {
  return {
    id: "control", root: "document", tag: "button", role: "button",
    name: "Activate", hidden: false, inert: false, disabled: false,
    ariaHidden: false, interactive: true, focusable: true, tabindex: 0,
    live: "off", expanded: null, checked: null, selected: null, references: {},
    ...overrides,
  };
}
function snapshot(extra = [], options = {}) {
  return {
    language: "en",
    nodes: [node({ id: "main", tag: "main", role: "main", interactive: false, name: "", focusable: false, tabindex: -1 }),
      node({ id: "heading", tag: "h1", role: "heading", name: "Page", interactive: false, focusable: false, tabindex: -1 }),
      node(), ...extra], ...options,
  };
}
const codes = (issues) => issues.map((item) => item.code);
const has = (issues, code) => assert.ok(codes(issues).includes(code), `${code} not found in ${JSON.stringify(codes(issues))}`);

test("language vocabulary is exactly English and French", () => assert.deepEqual(LANGUAGES, ["en", "fr"]));
test("evidence vocabulary retains uncertainty", () => assert.ok(EVIDENCE.includes("UNKNOWN")));
test("status vocabulary retains uncertainty", () => assert.ok(STATUS.includes("UNKNOWN")));
test("severity vocabulary includes manual review", () => assert.deepEqual(SEVERITY, ["error", "review"]));
test("ARIA boolean vocabulary is bounded", () => assert.deepEqual(ARIA_BOOLEAN, ["true", "false"]));
test("composite roles include tree and listbox", () => assert.ok(COMPOSITE_ROLES.includes("tree") && COMPOSITE_ROLES.includes("listbox")));
test("item roles include tab and treeitem", () => assert.ok(ITEM_ROLES.includes("tab") && ITEM_ROLES.includes("treeitem")));
test("reference vocabulary contains labelledby", () => assert.ok(REFERENCES.includes("aria-labelledby")));
test("landmark vocabulary contains main", () => assert.ok(KNOWN_LANDMARKS.includes("main")));

for (const value of [null, undefined, "", 0, 1, true, [], [1], () => 1]) {
  test(`plain rejects non-record ${String(value)}`, () => assert.equal(plain(value), false));
}
test("plain accepts ordinary objects", () => assert.equal(plain({ a: 1 }), true));
test("plain accepts null prototype record", () => assert.equal(plain(Object.create(null)), true));
test("plain rejects Date instances", () => assert.equal(plain(new Date()), false));
test("plain rejects class instances", () => assert.equal(plain(new (class Case {})()), false));
for (const code of [0, 1, 9, 10, 13, 31, 127]) {
  test(`control code ${code} is detected without a regex`, () => assert.equal(hasControl(String.fromCharCode(code)), true));
}
for (const value of ["Hello", "Bonjour", "Mot\u202F!", "Note\u00A0: texte", "«\u202FBienvenue\u202F»"]) {
  test(`ordinary text has no control code: ${JSON.stringify(value)}`, () => assert.equal(hasControl(value), false));
}
for (const value of [null, undefined, "", " ", "\t", "A".repeat(401), String.fromCharCode(1)]) {
  test(`unsafe or empty accessible name is rejected: ${JSON.stringify(value)}`, () => assert.equal(labelText(value), false));
}
test("labelText accepts short clear name", () => assert.equal(labelText("Accessible entrance"), true));
test("labelText respects custom maximum", () => assert.equal(labelText("ABCDE", 4), false));
for (const value of [null, "", "bad id", "1-leading", "?", "A".repeat(129), "a/b"]) {
  test(`invalid record ID rejected: ${JSON.stringify(value)}`, () => assert.equal(recordId(value), false));
}
test("record ID accepts hyphenated identifier", () => assert.equal(recordId("entry-24.fr"), true));
for (const value of ["2026-02-29", "2026-00-01", "2026-13-01", "2026-04-31", "2026-1-1", "tomorrow", 0]) {
  test(`invalid date rejected: ${String(value)}`, () => assert.equal(calendarDay(value), null));
}
test("leap-year calendar date accepted", () => assert.notEqual(calendarDay("2024-02-29"), null));
test("UTC date has repeatable ordinal", () => assert.equal(calendarDay("2026-11-19"), calendarDay("2026-11-19")));
for (const value of ["http://example.org", "https://user:pass@example.org", "https://example.org/#x", "javascript:alert(1)", "/relative", "https://localhost/a", "https://127.0.0.1/a", "https://x.org/a b", "https://", "https://example.org/\\x"]) {
  test(`source URL refuses unsafe address ${JSON.stringify(value)}`, () => assert.equal(sourceUrl(value), false));
}
test("source URL allows normal HTTPS link", () => assert.equal(sourceUrl("https://example.org/public/info"), true));
for (const value of ["", "https://example.org/a", "//remote/a", "/other/a", "/offline/../a", "/offline/a/./b", "/offline/a%2Fb", "/offline/a?q=1", "/offline/a#x", "/offline/a\\b", "/offline//b"]) {
  test(`offline path rejects unsafe key ${JSON.stringify(value)}`, () => assert.equal(localAsset(value), false));
}
test("offline path allows canonical same-app key", () => assert.equal(localAsset("/offline/resources/card-en.json"), true));
test("French colon requires non-breaking space", () => has(frenchSpacing("Note: texte").map((code) => ({ code })), "fr.colon-space"));
test("French colon accepts escaped non-breaking space", () => assert.deepEqual(frenchSpacing("Note\u00A0: texte"), []));
test("French apostrophe uses curly form", () => assert.ok(frenchSpacing("l'accès").includes("fr.apostrophe")));
test("French curly apostrophe accepted", () => assert.deepEqual(frenchSpacing("l’accès"), []));
for (const punctuation of [";", "!", "?"]) {
  test(`French ${punctuation} requires narrow space`, () => assert.ok(frenchSpacing(`Mot ${punctuation}`).includes("fr.narrow-space")));
  test(`French ${punctuation} accepts narrow space`, () => assert.deepEqual(frenchSpacing(`Mot\u202F${punctuation}`), []));
}
test("French opening guillemet needs narrow space", () => assert.ok(frenchSpacing("«Bonjour\u202F»").includes("fr.guillemet-open")));
test("French closing guillemet needs narrow space", () => assert.ok(frenchSpacing("«\u202FBonjour»").includes("fr.guillemet-close")));
test("French guillemets accept narrow spaces", () => assert.deepEqual(frenchSpacing("«\u202FBonjour\u202F»"), []));
test("finding contains structural metadata only", () => assert.deepEqual(finding("issue", "node.id"), { code: "issue", path: "node.id", severity: "error" }));
test("findings have deterministic sorting", () => assert.deepEqual(sortFindings([finding("z", "b"), finding("a", "a")]).map((x) => x.code), ["a", "z"]));
test("complete attribution passes", () => assert.deepEqual(auditEvidence(evidence()), []));
test("invalid record object fails closed", () => has(auditEvidence(null), "evidence.object"));

const evidenceMutations = [
  ["ID", { id: "invalid id" }, "evidence.id"],
  ["language", { language: "es" }, "evidence.language"],
  ["status", { status: "Maybe" }, "evidence.status"],
  ["tier", { tier: "TOP" }, "evidence.tier"],
  ["uncertain tier", { status: "UNKNOWN" }, "evidence.unknown-tier"],
  ["missing source", { source: null }, "evidence.source"],
  ["missing offline", { offline: null }, "evidence.offline"],
  ["empty source name", { source: { ...evidence().source, name: "" } }, "source.name"],
  ["empty licence", { source: { ...evidence().source, licence: "" } }, "source.licence"],
  ["insecure link", { source: { ...evidence().source, url: "http://example.org" } }, "source.url"],
  ["bad source date", { source: { ...evidence().source, collectedOn: "no" } }, "source.collectedOn"],
  ["offline state", { offline: { state: "maybe" } }, "offline.state"],
  ["offline path", { offline: { ...evidence().offline, path: "/elsewhere" } }, "offline.path"],
  ["offline capture date", { offline: { ...evidence().offline, capturedOn: "yesterday" } }, "offline.capturedOn"],
  ["unexpected cache reference", { offline: { state: "UNKNOWN", path: "/offline/a" } }, "offline.unexpected-reference"],
];
for (const [name, changes, code] of evidenceMutations) {
  test(`evidence mutation ${name} reports ${code}`, () => has(auditEvidence(evidence(changes)), code));
}
test("unknown tier and status remain possible", () => assert.deepEqual(auditEvidence(evidence({ status: "UNKNOWN", tier: "UNKNOWN", offline: { state: "UNKNOWN" } })), []));
test("bilingual pair is complete", () => assert.deepEqual(auditBilingualEvidence(bilingual()), []));
test("missing French record reports gap", () => has(auditBilingualEvidence([evidence()]), "records.missing-language"));
test("same translation key and language is a duplicate", () => has(auditBilingualEvidence([evidence(), evidence({ id: "another" })]), "records.duplicate-language"));
test("record arrays are mandatory", () => has(auditBilingualEvidence(null), "records.array"));
test("complete known evidence is ready", () => assert.equal(readinessForEvidence(bilingual()).decision, "READY"));
test("missing translation holds publication", () => assert.equal(readinessForEvidence([evidence()]).decision, "HOLD"));
test("uncertain evidence remains uncertain", () => assert.equal(readinessForEvidence(bilingual({ extra: [] }).map((x) => ({ ...x, status: "UNKNOWN", tier: "UNKNOWN", offline: { state: "UNKNOWN" } }))).decision, "UNKNOWN"));
test("unsupported evidence holds publication", () => assert.equal(readinessForEvidence(bilingual().map((x) => ({ ...x, status: "UNSUPPORTED" }))).decision, "HOLD"));
test("unavailable cache holds publication", () => assert.equal(readinessForEvidence(bilingual().map((x) => ({ ...x, offline: { state: "ABSENT" } }))).decision, "HOLD"));
test("audit never mutates records", () => { const x = bilingual(); const old = structuredClone(x); auditBilingualEvidence(x); assert.deepEqual(x, old); });

const snapshotMutations = [
  ["missing main", [node({ id: "other", role: "button" })], { nodes: [node({ id: "heading", role: "heading", interactive: false })] }, "document.main-count"],
  ["missing heading", [], { nodes: [node({ id: "main", role: "main", interactive: false })] }, "document.heading-missing"],
  ["duplicate ID", [node({ id: "control" })], {}, "node.duplicate-id"],
  ["hidden focus", [node({ id: "hidden", hidden: true })], {}, "node.hidden-focusable"],
  ["inert focus", [node({ id: "inert", inert: true })], {}, "node.inert-focusable"],
  ["aria hidden focus", [node({ id: "hidden-aria", ariaHidden: true })], {}, "node.aria-hidden-focusable"],
  ["positive tabindex", [node({ id: "positive", tabindex: 5 })], {}, "node.positive-tabindex"],
  ["unnamed control", [node({ id: "unnamed", name: "" })], {}, "node.unnamed-control"],
  ["unnamed image", [node({ id: "image", role: "img", name: "" })], {}, "node.unnamed-image"],
  ["unnamed dialog", [node({ id: "dialog", role: "dialog", name: "" })], {}, "node.unnamed-dialog"],
  ["silent status", [node({ id: "status", role: "status", live: "off" })], {}, "node.silent-status"],
  ["silent alert", [node({ id: "alert", role: "alert", live: "off" })], {}, "node.silent-alert"],
  ["expanded state", [node({ id: "expanded", expanded: "maybe" })], {}, "node.expanded"],
  ["checkbox state", [node({ id: "checked", role: "checkbox", checked: "maybe" })], {}, "node.checked"],
  ["radio state", [node({ id: "radio", role: "radio", checked: "mixed" })], {}, "node.checked"],
  ["tab state", [node({ id: "tab", role: "tab", selected: "maybe" })], {}, "node.selected"],
  ["empty references", [node({ id: "ref", references: { "aria-labelledby": [] } })], {}, "node.empty-reference"],
  ["missing references", [node({ id: "ref", references: { "aria-describedby": ["missing"] } })], {}, "node.dangling-reference"],
];
for (const [name, additions, overrides, code] of snapshotMutations) {
  test(`semantic snapshot ${name} produces ${code}`, () => has(auditSemanticSnapshot(snapshot(additions, overrides)), code));
}
test("semantic snapshot of controls and landmarks passes", () => assert.deepEqual(auditSemanticSnapshot(snapshot()), []));
test("invalid document language is detected", () => has(auditSemanticSnapshot(snapshot([], { language: "es" })), "document.language"));
test("missing node list fails closed", () => has(auditSemanticSnapshot({ language: "en" }), "snapshot.nodes"));
test("non-object snapshot fails closed", () => has(auditSemanticSnapshot(undefined), "snapshot.object"));
test("shadow root can reuse light DOM ID", () => assert.equal(codes(auditSemanticSnapshot(snapshot([node({ root: "shadow:one" })]))).includes("node.duplicate-id"), false));
test("cross-root references do not resolve", () => has(auditSemanticSnapshot(snapshot([node({ id: "link", root: "shadow:one", references: { "aria-labelledby": ["heading"] } })])), "node.dangling-reference"));
test("forward reference resolves within root", () => assert.equal(codes(auditSemanticSnapshot(snapshot([node({ id: "forward", references: { "aria-labelledby": ["later"] } }), node({ id: "later" })]))).includes("node.dangling-reference"), false));
test("unknown state never becomes supported evidence", () => assert.equal(readinessForEvidence(bilingual().map((x) => ({ ...x, status: "UNKNOWN", tier: "UNKNOWN", offline: { state: "UNKNOWN" } }))).decision, "UNKNOWN"));
test("summary returns stable counts", () => assert.deepEqual(summarizeSemanticIssues([finding("z", "a"), finding("z", "b"), finding("a", "c")]), [{ code: "a", count: 1 }, { code: "z", count: 2 }]));
