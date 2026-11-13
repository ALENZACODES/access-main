import { describe, expect, it } from "vitest";
import { validateCacheEntry, withinStorageLimit, type CacheEntry } from "./cache.ts";
import { emptyModuleResult } from "./modules.ts";
import type { Provenance } from "./provenance.ts";

const provenance: Provenance = {
  source_name: "Example open data",
  source_url: "https://example.test/data",
  licence: "Open Government Licence – Toronto",
  licence_url: "https://example.test/licence",
  source_date: "2026-11-01",
  retrieved_at: "2026-11-13T12:00:00.000Z",
  verification_tier: "TIER_0",
  freshness: "unknown",
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
  it("requires source, licence, date, and tier", () => {
    expect(validateCacheEntry(entry())).toEqual([]);
    const missing = entry({
      provenance: { ...provenance, licence: "", source_name: " " },
    });
    const codes = validateCacheEntry(missing).map((issue) => issue.code);
    expect(codes).toContain("missing_licence");
    expect(codes).toContain("missing_source");
  });

  it("does not cache live status or eligibility advice", () => {
    const live = entry({
      provenance: { ...provenance, verification_tier: "TIER_4" },
    });
    expect(validateCacheEntry(live).some((issue) => issue.code === "live_status_not_cached")).toBe(true);
    const directory = entry({
      kind: "directory-link",
      payload: { eligibility_advice: true, official_url: "https://example.test/program" },
    });
    expect(validateCacheEntry(directory).some((issue) => issue.code === "eligibility_advice")).toBe(true);
    const activity = entry({
      kind: "activity-pack",
      payload: { clinical_claim: true, seizure_risk_flash: false },
    });
    expect(validateCacheEntry(activity).some((issue) => issue.code === "clinical_claim")).toBe(true);
  });

  it("stubs return no items and live status stays unavailable", () => {
    const result = emptyModuleResult("places", "modules.notConnected");
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
