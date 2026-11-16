import { describe, expect, it } from "vitest";
import { MIN_TOUCH_TARGET_PX, NBSP, summarizePlace, type PlaceReport } from "./index";

const prov = { source: "Venue self-report form", licence: "CC-BY-4.0", retrievedOn: "2026-10-01" };
const old = { source: "Old survey", licence: "ODbL-1.0", retrievedOn: "2024-01-15" };
const TODAY = "2026-11-15";

const place: PlaceReport = {
  name: "Example Library",
  features: [
    { feature: "step-free-entrance", value: "yes", provenance: prov },
    { feature: "elevator", value: "partial", provenance: old },
    { feature: "accessible-washroom", value: "yes" },
  ],
};

describe("summarizePlace", () => {
  it("lists every feature and counts known vs UNKNOWN", () => {
    const s = summarizePlace(place, "en", TODAY);
    expect(s.rows).toHaveLength(6);
    expect(s.knownCount).toBe(2);
    expect(s.unknownCount).toBe(4);
    expect(s.countsText).toBe("2 of 6 details reported, 4 UNKNOWN");
  });
  it("shows UNKNOWN for a detail that lacks provenance", () => {
    const row = summarizePlace(place, "en", TODAY).rows.find((r) => r.feature === "accessible-washroom");
    expect(row?.status).toBe("unknown");
    expect(row?.sourceLine).toBeNull();
    expect(row?.ageText).toBeNull();
  });
  it("attaches source line and age to known details", () => {
    const row = summarizePlace(place, "en", TODAY).rows.find((r) => r.feature === "step-free-entrance");
    expect(row?.sourceLine).toContain("Source: Venue self-report form");
    expect(row?.sourceLine).toContain("CC BY 4.0");
    expect(row?.ageText).toBe("Retrieved 45 days ago");
  });
  it("flags stale details with a notice and keeps them visible", () => {
    const s = summarizePlace(place, "en", TODAY);
    expect(s.rows.find((r) => r.feature === "elevator")?.stale).toBe(true);
    expect(s.staleNotice).toContain("may be out of date");
    const fresh = summarizePlace({ name: "X", features: [place.features[0]!] }, "en", TODAY);
    expect(fresh.staleNotice).toBeNull();
  });
  it("de-duplicates sources", () => {
    const twice: PlaceReport = {
      name: "Y",
      features: [
        { feature: "elevator", value: "yes", provenance: prov },
        { feature: "automatic-door", value: "yes", provenance: prov },
      ],
    };
    expect(summarizePlace(twice, "en", TODAY).sources).toHaveLength(1);
  });
  it("gives 44px controls and an aria label per row", () => {
    const s = summarizePlace(place, "fr", TODAY);
    for (const r of s.rows) {
      expect(r.detailsTargetPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      expect(r.ariaLabel).toContain(r.label);
    }
    expect(s.rows[0]!.ariaLabel).toContain(`${NBSP}:`);
  });
  it("pluralises French counts", () => {
    const one = summarizePlace({ name: "Z", features: [place.features[0]!] }, "fr", TODAY);
    expect(one.countsText).toBe("1 détail sur 6 signalé, 5 INCONNUS");
    const two = summarizePlace(place, "fr", TODAY);
    expect(two.countsText).toBe("2 détails sur 6 signalés, 4 INCONNUS");
  });
  it("has no overall score field", () => {
    const keys = Object.keys(summarizePlace(place, "en", TODAY));
    expect(keys.some((k) => /score|rating|grade|badge/i.test(k))).toBe(false);
  });
});
