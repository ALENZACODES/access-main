import { describe, expect, it } from "vitest";
import { validateCacheEntry, withinStorageLimit, type CacheEntry } from "./cache.ts";
import type { DirectoryRecord } from "./directory.ts";
import { emptyModuleResult } from "./modules.ts";
import type { Provenance } from "./provenance.ts";

const provenance: Provenance = {
  source_name: "Example open data",
  source_url: "https://example.test/data",
  licence: "Open Government Licence – Toronto",
  licence_url: "https://example.test/licence",
  source_date: "2026-11-01",
  retrieved_at: "2026-11-13T12:00:00.000Z",
  tier: 0,
  prototype_label: "SEEDED-OPEN-DATA",
  freshness: "unknown",
};

const directoryRecord: DirectoryRecord = {
  schemaVersion: "directory-record-1.0.0",
  id: "example-program",
  category: "benefits",
  topics: ["income"],
  readingContexts: ["any"],
  name: { en: "Example program", fr: "Programme exemple" },
  administrator: { en: "Example office", fr: "Bureau exemple" },
  geography: "ontario",
  summary: { en: "A link to an official page.", fr: "Un lien vers une page officielle." },
  officialUrl: "https://example.test/program",
  sourceName: "Example office page",
  retrievedOn: "2026-11-13",
  nextReviewOn: "2027-02-13",
  verificationTier: "administrator_page",
  verificationPlain: { en: "The official page was opened.", fr: "La page officielle a été ouverte." },
  neverMeans: { en: "This is not an eligibility decision.", fr: "Ce n'est pas une décision d'admissibilité." },
  licenceNote: { en: "Page text is not copied.", fr: "Le texte de la page n'est pas copié." },
  notEligibilityAdvice: true,
  framing: { en: "Official page link.", fr: "Lien vers la page officielle." },
  placeFacts: "none",
};

function entry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    id: "rec-1",
    kind: "place",
    title: "Unverified record",
    stored_at: "2026-11-13T12:00:00.000Z",
    provenance,
    contains_live_status: false,
    payload: {},
    ...overrides,
  };
}

describe("offline cache rules", () => {
  it("requires source, licence, date, and a prototype tier", () => {
    expect(validateCacheEntry(entry())).toEqual([]);
    const missing = entry({
      provenance: { ...provenance, licence: "", source_name: " " },
    });
    const codes = validateCacheEntry(missing).map((issue) => issue.code);
    expect(codes).toContain("missing_licence");
    expect(codes).toContain("missing_source");
  });

  it("refuses live status, verified labels, and tier 3 on a prototype record", () => {
    expect(validateCacheEntry(entry({ provenance: { ...provenance, tier: 4 } })).some((issue) => issue.code === "live_status_not_cached")).toBe(true);
    expect(validateCacheEntry(entry({ provenance: { ...provenance, tier: 3 } })).some((issue) => issue.code === "verified_not_in_prototype")).toBe(true);
    expect(
      validateCacheEntry(entry({ provenance: { ...provenance, prototype_label: "VERIFIED" } })).some(
        (issue) => issue.code === "verified_not_in_prototype",
      ),
    ).toBe(true);
    expect(
      validateCacheEntry(entry({ provenance: { ...provenance, tier: 2, prototype_label: null } })).some(
        (issue) => issue.code === "tier_not_in_prototype",
      ),
    ).toBe(true);
    const unknownTier = entry({ provenance: { ...provenance, tier: "UNKNOWN" as unknown as 0 } });
    expect(validateCacheEntry(unknownTier).some((issue) => issue.code === "invalid_tier")).toBe(true);
  });

  it("accepts a navigator directory record and refuses eligibility advice", () => {
    const stored = entry({
      kind: "directory-link",
      title: directoryRecord.name.en,
      provenance: { ...provenance, tier: "E", prototype_label: "PROTOTYPE-UNVERIFIED" },
      payload: directoryRecord as unknown as Record<string, unknown>,
    });
    expect(validateCacheEntry(stored)).toEqual([]);
    const advice = entry({
      kind: "directory-link",
      provenance: { ...provenance, tier: "E", prototype_label: null },
      payload: { ...directoryRecord, notEligibilityAdvice: false } as unknown as Record<string, unknown>,
    });
    expect(validateCacheEntry(advice).some((issue) => issue.code === "eligibility_advice")).toBe(true);
    const activity = entry({
      kind: "activity-pack",
      payload: { clinical_claim: true, seizure_risk_flash: false },
    });
    expect(validateCacheEntry(activity).some((issue) => issue.code === "clinical_claim")).toBe(true);
  });

  it("stubs return no items and live status stays unavailable", () => {
    const result = emptyModuleResult("places", "modules.unavailable");
    expect(result.items).toEqual([]);
    expect(result.availability).toBe("stub");
    expect(result.liveStatus).toBe("unavailable");
  });

  it("honours a storage cap", () => {
    const small = entry();
    expect(withinStorageLimit(0, small, null)).toBe(true);
    expect(withinStorageLimit(0, small, 1)).toBe(true);
    expect(withinStorageLimit(1024 * 1024, small, 1)).toBe(false);
  });
});
