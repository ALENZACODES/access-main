/** Shared, intentionally synthetic fixtures for the packet test suites. */
export function exampleRecord(overrides = {}) {
  return {
    id: "ramp-east",
    kind: "place",
    title: { en: "Accessible entrance", fr: "Entrée accessible" },
    summary: { en: "Entrance described by the publisher.", fr: "Entrée décrite par la source." },
    access: "available",
    tier: "primary",
    reviewedOn: "2026-11-18",
    revision: 2,
    source: {
      id: "source-one",
      publisher: "Municipal open data",
      licence: "OGL-Canada-2.0",
      url: "https://example.org/data/entrance",
      collectedOn: "2026-11-17",
    },
    cache: { state: "stored", path: "/offline/ramp-east.json", savedOn: "2026-11-18" },
    ...overrides,
  };
}

export function anotherRecord(overrides = {}) {
  return exampleRecord({
    id: "ramp-west",
    revision: 1,
    title: { en: "Second entrance", fr: "Deuxième entrée" },
    summary: { en: "Second accessible path.", fr: "Deuxième chemin accessible." },
    source: {
      id: "source-two",
      publisher: "Public transit office",
      licence: "CC-BY-4.0",
      url: "https://example.org/data/second",
      collectedOn: "2026-11-17",
    },
    cache: { state: "stored", path: "/offline/ramp-west.json", savedOn: "2026-11-18" },
    ...overrides,
  });
}

export const DEFAULT_POLICY = Object.freeze({
  asOf: "2026-11-19",
  sourceMaxDays: 365,
  cacheMaxDays: 90,
  reviewMaxDays: 180,
});

export function withSource(record, changes) {
  return { ...record, source: { ...record.source, ...changes } };
}

export function withCache(record, changes) {
  return { ...record, cache: { ...record.cache, ...changes } };
}

export function withTitle(record, changes) {
  return { ...record, title: { ...record.title, ...changes } };
}

export function withSummary(record, changes) {
  return { ...record, summary: { ...record.summary, ...changes } };
}

export function ids(findings) {
  return findings.map((item) => item.code);
}

export function copy(record) {
  return structuredClone(record);
}
