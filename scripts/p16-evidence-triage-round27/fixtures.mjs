/** Synthetic factory functions: no personal or live accessibility records. */
export const TODAY = "2026-11-19";
export function source(overrides = {}) {
  return { id: "source-one", publisher: "Public publisher", licence: "CC BY 4.0",
    url: "https://example.org/open-data", tier: "PRIMARY", claim: "SUPPORTED",
    collectedOn: "2026-11-18", reviewedOn: TODAY, ...overrides };
}
export function cache(overrides = {}) {
  return { state: "PRESENT", path: "/offline/example-en.json", capturedOn: TODAY,
    revision: 1, bytes: 1024, ...overrides };
}
export function record(overrides = {}) {
  return { id: "example-en", translationKey: "example", language: "en", kind: "entrance",
    access: "SUPPORTED", revision: 1, recordedOn: TODAY,
    title: { en: "Accessible entrance", fr: "Entrée accessible" },
    summary: { en: "Public entrance information", fr: "Informations publiques" },
    sources: [source()], cache: cache(), ...overrides };
}
export function french(overrides = {}) {
  return record({ id: "example-fr", language: "fr", cache: cache({ path: "/offline/example-fr.json" }), ...overrides });
}
export function pair() {
  return [record(), french()];
}
export function clone(value) {
  return structuredClone(value);
}
export function codes(findings) {
  return findings.map((finding) => finding.code);
}
