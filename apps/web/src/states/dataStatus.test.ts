import { describe, expect, it } from "vitest";
import { FEATURE_IDS, evaluateAll, evaluateFeature, featureLabel, statusText } from "./index";

const prov = { source: "Venue self-report form", licence: "CC-BY-4.0", retrievedOn: "2026-10-01" };

describe("evaluateFeature", () => {
  it("keeps a reported value that has provenance", () => {
    const s = evaluateFeature({ feature: "elevator", value: "yes", provenance: prov });
    expect(s.status).toBe("yes");
    expect(s.provenance?.licence).toBe("CC-BY-4.0");
    expect(s.unknownReason).toBeNull();
  });
  it("downgrades to UNKNOWN when provenance is missing or invalid", () => {
    const missing = evaluateFeature({ feature: "elevator", value: "yes" });
    expect(missing.status).toBe("unknown");
    expect(missing.unknownReason).toBe("missing-provenance");
    const closed = evaluateFeature({ feature: "elevator", value: "no", provenance: { ...prov, licence: "Proprietary" } });
    expect(closed.status).toBe("unknown");
  });
  it("treats absent, null and explicit unknown as not recorded", () => {
    for (const value of [undefined, null, "unknown"]) {
      const s = evaluateFeature({ feature: "level-path", value, provenance: prov });
      expect(s.status).toBe("unknown");
      expect(s.unknownReason).toBe("not-recorded");
      expect(s.provenance).toBeNull();
    }
  });
  it("never guesses from unrecognised values", () => {
    for (const value of ["maybe", "likely", true, 1, "YES"]) {
      const s = evaluateFeature({ feature: "automatic-door", value, provenance: prov });
      expect(s.status).toBe("unknown");
      expect(s.unknownReason).toBe("unrecognised-value");
    }
  });
});

describe("evaluateAll", () => {
  it("returns every feature once, in fixed order", () => {
    const out = evaluateAll([{ feature: "elevator", value: "yes", provenance: prov }]);
    expect(out.map((o) => o.feature)).toEqual([...FEATURE_IDS]);
    expect(out.filter((o) => o.status !== "unknown")).toHaveLength(1);
  });
  it("uses the first report for a duplicated feature", () => {
    const out = evaluateAll([
      { feature: "elevator", value: "no", provenance: prov },
      { feature: "elevator", value: "yes", provenance: prov },
    ]);
    expect(out.find((o) => o.feature === "elevator")?.status).toBe("no");
  });
  it("makes everything UNKNOWN for empty input", () => {
    expect(evaluateAll([]).every((o) => o.status === "unknown")).toBe(true);
  });
});

describe("labels", () => {
  it("has EN and FR labels for every feature", () => {
    for (const id of FEATURE_IDS) {
      expect(featureLabel(id, "en").length).toBeGreaterThan(0);
      expect(featureLabel(id, "fr")).not.toBe(featureLabel(id, "en"));
      expect(featureLabel(id, "fr")).not.toContain("'");
    }
  });
  it("words statuses as reported, never verified", () => {
    expect(statusText("yes", "en")).toBe("Yes (reported)");
    expect(statusText("unknown", "en")).toBe("UNKNOWN");
    expect(statusText("unknown", "fr")).toBe("INCONNU");
    expect(statusText("partial", "fr")).toBe("En partie (signalé)");
  });
});
