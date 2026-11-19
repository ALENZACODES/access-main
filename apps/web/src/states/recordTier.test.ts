import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { PACK_EXPECTED_TIERS, RECORD_TIERS, isExpectedInPack, readTier, tierLabel, tierLine, tierMeaning } from "./recordTier";

describe("readTier", () => {
  it.each([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], ["E", "E"], ["0", 0], ["3", 3], [" E ", "E"]] as const)("reads %s as %s", (input, tier) => {
    expect(readTier(input)).toBe(tier);
  });
  it.each([[5], [-1], [1.5], [Number.NaN], ["e"], ["tier-0"], ["UNKNOWN"], [""], [null], [undefined], [{}], [[]], [true]])(
    "does not guess a tier from %s",
    (input) => expect(readTier(input)).toBeNull(),
  );
  it("does not read inherited property names as tiers", () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) expect(readTier(key)).toBeNull();
  });
  it("reads every listed tier back to itself", () => {
    for (const tier of RECORD_TIERS) expect(readTier(tier)).toBe(tier);
  });
});

describe("isExpectedInPack", () => {
  it("accepts 0, 1 and E only", () => {
    expect(RECORD_TIERS.filter(isExpectedInPack)).toEqual(PACK_EXPECTED_TIERS);
    expect(isExpectedInPack(null)).toBe(false);
  });
});

describe("tier wording", () => {
  it("labels a tier and an unknown tier in both languages", () => {
    expect(tierLabel(0, "en")).toBe("Tier 0");
    expect(tierLabel("E", "fr")).toBe("Niveau E");
    expect(tierLabel(null, "en")).toBe("Tier UNKNOWN");
    expect(tierLabel(null, "fr")).toBe("Niveau INCONNU");
  });
  it("keeps an unknown tier unknown", () => {
    expect(tierMeaning(null, "en")).toBe("The record does not state a tier.");
    expect(tierLine(null, "fr")).toBe("Niveau INCONNU. L’enregistrement n’indique pas de niveau.");
  });
  it("says a tier is not measured by the App where that is the case", () => {
    expect(tierMeaning(0, "en")).toContain("Not measured by the App");
    expect(tierMeaning(1, "fr")).toContain("Non mesuré par l’App");
  });
  it("adds a note for a tier a prototype pack should not hold, and only for those", () => {
    for (const tier of RECORD_TIERS) {
      const note = tierMeaning(tier, "en").includes("does not normally hold");
      expect(note, String(tier)).toBe(!isExpectedInPack(tier));
    }
  });
  it("joins label and meaning on one line", () => {
    expect(tierLine(1, "en")).toBe("Tier 1. Self-reported by a venue or operator. Not measured by the App.");
  });
  it("passes the copy linter, in both languages, for every tier and for unknown", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const tier of [...RECORD_TIERS, null]) expect(lintCopy(tierLine(tier, locale), locale), `${locale} ${String(tier)}`).toEqual([]);
    }
  });
});
