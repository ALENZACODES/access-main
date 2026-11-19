/** Local-only fixtures; not production records and never sent over a network. */
export const AT = "2026-11-19";
export function source(overrides = {}) {
  return {
    id: "public-source", title: { en: "Public reference", fr: "Référence publique" },
    publisher: "Example public publisher", licence: "CC BY 4.0",
    url: "https://example.org/source", tier: "PRIMARY",
    claim: "SUPPORTED", collectedOn: "2026-11-17", updatedOn: "2026-11-18",
    ...overrides,
  };
}
export function cache(overrides = {}) {
  return {
    state: "PRESENT", path: "/offline/evidence/example-en.json",
    capturedOn: "2026-11-18", bytes: 1024, ...overrides,
  };
}
export function record(overrides = {}) {
  return {
    id: "example-en", translationKey: "example", language: "en", kind: "entrance",
    state: "SUPPORTED", revision: 1, recordedOn: "2026-11-18",
    title: { en: "Accessible entrance", fr: "Entrée accessible" },
    summary: { en: "An entrance is described.", fr: "Une entrée est décrite." },
    sources: [source()], cache: cache(), ...overrides,
  };
}
export function french(overrides = {}) {
  return record({
    id: "example-fr", language: "fr",
    cache: cache({ path: "/offline/evidence/example-fr.json" }),
    ...overrides,
  });
}
export function pair() { return [record(), french()]; }
export function pairWith(overrides = {}) {
  return [record(overrides), french(overrides)];
}
export function pairedRecord(name, kind = "entrance") {
  return [
    record({ id: `${name}-en`, translationKey: name, kind, cache: cache({ path: `/offline/evidence/${name}-en.json` }) }),
    french({ id: `${name}-fr`, translationKey: name, kind, cache: cache({ path: `/offline/evidence/${name}-fr.json` }) }),
  ];
}
export function findCodes(issues) { return issues.map((item) => item.code); }
export function hasCode(issues, code) { return findCodes(issues).includes(code); }
export function clone(value) { return structuredClone(value); }
