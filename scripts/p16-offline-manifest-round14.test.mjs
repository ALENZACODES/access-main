import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditOfflineManifest,
  auditOfflineRecord,
  calendarDay,
  hasUnsafeCodePoint,
  manifestInventory,
  safeAttributionUrl,
  safeOfflinePath,
  safeText,
  summarizeOfflineIssues,
} from "./p16-offline-manifest-round14.mjs";

function entry(language = "en", changes = {}) {
  return {
    key: "entry-one", language,
    title: language === "en" ? "Accessible entrance" : "Entrée accessible",
    description: language === "en" ? "Information from a public source." : "Information de source publique.",
    state: "available", tier: "primary",
    attribution: { source: "Public dataset", url: "https://data.example.org/entry", licence: "Open licence", collectedOn: "2026-11-19" },
    offline: { state: "cached", path: "/offline/entries/one.json" },
    ...changes,
  };
}
const codes = (issues) => issues.map((issue) => issue.code);

test("valid English record", () => assert.deepEqual(auditOfflineRecord(entry()), []));
test("valid French record", () => assert.deepEqual(auditOfflineRecord(entry("fr")), []));
test("bilingual collection", () => assert.deepEqual(auditOfflineManifest([entry(), entry("fr")], { requireBothLanguages: true }), []));
test("invalid top-level record", () => {
  for (const value of [null, [], 7, "", undefined]) assert.deepEqual(codes(auditOfflineRecord(value)), ["record.object"]);
});
test("manifest must be an array", () => assert.deepEqual(codes(auditOfflineManifest({})), ["manifest.array"]));
test("language has explicit allowed values", () => {
  for (const language of ["es", "EN", "fr-CA", null]) assert.ok(codes(auditOfflineRecord(entry(language))).includes("record.language"));
});
test("invalid record keys", () => {
  for (const key of ["", "space key", "../path", "!bad", "z".repeat(100)]) assert.ok(codes(auditOfflineRecord(entry("en", { key }))).includes("record.key"));
});
test("title is mandatory", () => assert.ok(codes(auditOfflineRecord(entry("en", { title: "  " }))).includes("record.title")));
test("description is mandatory", () => assert.ok(codes(auditOfflineRecord(entry("en", { description: "" }))).includes("record.description")));
test("title length bounded", () => assert.ok(codes(auditOfflineRecord(entry("en", { title: "A".repeat(201) }))).includes("record.title")));
test("description length bounded", () => assert.ok(codes(auditOfflineRecord(entry("en", { description: "A".repeat(2001) }))).includes("record.description")));
test("control characters checked using numeric values", () => {
  assert.equal(hasUnsafeCodePoint("Good"), false);
  for (const code of [0, 9, 10, 31, 127, 159]) assert.equal(hasUnsafeCodePoint(`a${String.fromCharCode(code)}b`), true);
});
test("safe text rejects control code points", () => assert.equal(safeText(`one${String.fromCharCode(0)}two`), false));
test("unknown state preserves unknown tier", () => {
  assert.deepEqual(auditOfflineRecord(entry("en", { state: "unknown", tier: "unknown" })), []);
  assert.ok(codes(auditOfflineRecord(entry("en", { state: "unknown", tier: "primary" }))).includes("record.unknown-tier"));
});
test("invalid state", () => assert.ok(codes(auditOfflineRecord(entry("en", { state: "maybe" }))).includes("record.state")));
test("invalid tier", () => assert.ok(codes(auditOfflineRecord(entry("en", { tier: "gold" }))).includes("record.tier")));
test("attribution mandatory", () => assert.ok(codes(auditOfflineRecord(entry("en", { attribution: null }))).includes("attribution.object")));
test("source mandatory", () => assert.ok(codes(auditOfflineRecord(entry("en", { attribution: { ...entry().attribution, source: "" } }))).includes("attribution.source")));
test("licence mandatory", () => assert.ok(codes(auditOfflineRecord(entry("en", { attribution: { ...entry().attribution, licence: "" } }))).includes("attribution.licence")));
test("date mandatory", () => assert.ok(codes(auditOfflineRecord(entry("en", { attribution: { ...entry().attribution, collectedOn: "" } }))).includes("attribution.date")));
test("calendar handles leap days", () => {
  assert.equal(calendarDay("2024-02-29"), true);
  assert.equal(calendarDay("2026-02-29"), false);
});
test("calendar rejects rollover dates", () => {
  for (const day of ["2026-00-01", "2026-04-31", "2026-13-01", "2026-2-1", "bad"]) assert.equal(calendarDay(day), false);
});
test("https source URL is allowed", () => assert.equal(safeAttributionUrl("https://data.example.org/entry"), true));
test("nonsecure and credential URLs rejected", () => {
  for (const url of ["http://data.example.org", "javascript:alert(0)", "https://name:pass@example.org", "/local", "https://example.org/#part"]) assert.equal(safeAttributionUrl(url), false);
});
test("cached path must be local", () => assert.equal(safeOfflinePath("/offline/entry.json"), true));
test("cache path traversal rejected", () => {
  for (const path of ["../x", "/x/../y", "/x/./y", "/x/%2e%2e/y", "//host/y", "/x?y", "/x#y", "https://host/y", "/x\\y"]) assert.equal(safeOfflinePath(path), false);
});
test("missing cache path fails closed", () => assert.ok(codes(auditOfflineRecord(entry("en", { offline: { state: "cached" } }))).includes("offline.path")));
test("uncached record has no path", () => assert.deepEqual(auditOfflineRecord(entry("en", { offline: { state: "not-cached" } })), []));
test("unexpected cache path fails", () => assert.ok(codes(auditOfflineRecord(entry("en", { offline: { state: "unknown", path: "/x" } }))).includes("offline.unexpected-path")));
test("offline metadata mandatory", () => assert.ok(codes(auditOfflineRecord(entry("en", { offline: null }))).includes("offline.object")));
test("offline status supported", () => assert.ok(codes(auditOfflineRecord(entry("en", { offline: { state: "maybe" } }))).includes("offline.state")));
test("duplicate same-language records rejected", () => assert.ok(codes(auditOfflineManifest([entry(), entry()])).includes("manifest.duplicate")));
test("two languages for same key are distinct", () => assert.deepEqual(auditOfflineManifest([entry(), entry("fr")]), []));
test("missing language is a finding", () => assert.ok(codes(auditOfflineManifest([entry()], { requireBothLanguages: true })).includes("manifest.missing-language")));
test("missing language check optional", () => assert.deepEqual(auditOfflineManifest([entry()]), []));
test("untrusted text never appears in issue codes", () => {
  const problems = auditOfflineRecord(entry("en", { title: `Private rider ${String.fromCharCode(0)}` }));
  assert.equal(JSON.stringify(problems).includes("Private rider"), false);
});
test("audit does not mutate records", () => {
  const input = [entry(), entry("fr")];
  const original = structuredClone(input);
  auditOfflineManifest(input, { requireBothLanguages: true });
  assert.deepEqual(input, original);
});
test("inventory is sorted, bounded metadata", () => {
  const result = manifestInventory([entry("fr"), entry()]);
  assert.deepEqual(result.map((item) => item.language), ["en", "fr"]);
  assert.equal(JSON.stringify(result).includes("Public dataset"), false);
  assert.equal(Object.isFrozen(result), true);
});
test("invalid inventory input is empty", () => assert.deepEqual(manifestInventory(null), []));
test("summary collects codes in stable order", () => {
  assert.deepEqual(summarizeOfflineIssues([{ code: "z" }, { code: "a" }, { code: "z" }]), [{ code: "a", count: 1 }, { code: "z", count: 2 }]);
});
test("summary ignores malformed diagnostics", () => assert.deepEqual(summarizeOfflineIssues([null, 5, {}, { code: "x" }]), [{ code: "x", count: 1 }]));
