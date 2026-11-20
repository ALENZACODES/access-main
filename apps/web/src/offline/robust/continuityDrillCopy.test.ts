import { describe, expect, it } from "vitest";
import {
  CONTINUITY_COPY, DRILL_FILTERS, DRILL_SCENARIOS, DRILL_SORTS, auditContinuityCopy,
  continuityCopy, continuityFilterLabel, continuityFormatBytes, continuityReasonLabel,
  continuityScenarioLabel, continuitySortLabel,
} from "./continuityDrillCopy";

describe("continuity bilingual copy contracts", () => {
  it("provides both languages with the same field names", () => {
    expect(Object.keys(CONTINUITY_COPY.en)).toEqual(Object.keys(CONTINUITY_COPY.fr));
  });
  it("passes localized punctuation checks", () => {
    expect(auditContinuityCopy()).toEqual([]);
  });
  it("keeps uncertain observations as UNKNOWN", () => {
    expect(continuityCopy("en").unknown).toBe("UNKNOWN");
    expect(continuityCopy("fr").unknown).toBe("UNKNOWN");
    expect(continuityFormatBytes(null, "fr")).toBe("UNKNOWN");
    expect(continuityFormatBytes(-1, "en")).toBe("UNKNOWN");
  });
  it("keeps the exact scenario set for the existing controls", () => {
    expect(DRILL_SCENARIOS).toEqual(["baseline", "evict-largest", "evict-oldest", "source-change", "quota-reduction"]);
  });
  it("keeps the exact filters", () => {
    expect(DRILL_FILTERS).toEqual(["all", "saved", "UNKNOWN", "affected", "unaffected"]);
  });
  it("keeps the exact sorts", () => {
    expect(DRILL_SORTS).toEqual(["listed", "id", "bytes-desc", "status", "source"]);
  });
  it("provides all scenario descriptions in both languages", () => {
    for (const key of DRILL_SCENARIOS) {
      expect(continuityScenarioLabel(key, "en").length > 0).toBe(true);
      expect(continuityScenarioLabel(key, "fr").length > 0).toBe(true);
    }
  });
  it("provides all filter descriptions in both languages", () => {
    for (const key of DRILL_FILTERS) {
      expect(continuityFilterLabel(key, "en").length > 0).toBe(true);
      expect(continuityFilterLabel(key, "fr").length > 0).toBe(true);
    }
  });
  it("provides all sort descriptions in both languages", () => {
    for (const key of DRILL_SORTS) {
      expect(continuitySortLabel(key, "en").length > 0).toBe(true);
      expect(continuitySortLabel(key, "fr").length > 0).toBe(true);
    }
  });
  it("reports stale and unreadable causes distinctly", () => {
    expect(continuityReasonLabel("stale", "en")).toContain("Out of date");
    expect(continuityReasonLabel("unreadable", "en")).toContain("read");
  });
});
