import { describe, expect, it } from "vitest";
import { auditSourceLedgerCopy, reasonLabel, sourceLedgerCopy, stateLabel, tierLabel } from "./sourceLedgerCopy";

describe("bilingual offline source ledger copy", () => {
  it("has all translations and safe punctuation", () => {
    expect(auditSourceLedgerCopy()).toEqual([]);
  });
  it("labels UNKNOWN accurately in both languages", () => {
    expect(stateLabel("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(stateLabel("UNKNOWN", "fr")).toBe("UNKNOWN");
    expect(tierLabel("UNKNOWN", "fr")).toBe("UNKNOWN");
  });
  it("keeps the same UNKNOWN token without an English plural in French", () => {
    const french = sourceLedgerCopy("fr");
    const english = sourceLedgerCopy("en");
    expect(french.unknown).toBe("UNKNOWN");
    expect(english.unknown).toBe("UNKNOWN");
    expect(french.countTier).toContain("UNKNOWN");
    expect(french.countTier).not.toContain("UNKNOWNS");
  });
  it("has a distinct label for every evidence tier", () => {
    for (const language of ["en", "fr"] as const) {
      const values = ["submitted", "documented", "reviewed-source", "UNKNOWN"] as const;
      expect(new Set(values.map((value) => tierLabel(value, language))).size).toBe(4);
    }
  });
  it("labels missing and stale differently", () => {
    expect(reasonLabel("missing", "en")).not.toBe(reasonLabel("stale", "en"));
    expect(reasonLabel("unreadable", "fr")).not.toBe(reasonLabel("present", "fr"));
  });
  it("states that offline data does not describe accessibility", () => {
    expect(sourceLedgerCopy("en").disclaimer).toContain("not evidence");
    expect(sourceLedgerCopy("fr").disclaimer).toContain("ne prouve pas");
  });
  it("has sufficient labels for all native controls", () => {
    for (const language of ["en", "fr"] as const) {
      const copy = sourceLedgerCopy(language);
      for (const key of ["open", "close", "search", "filter", "sort", "next", "previous", "refresh", "export"] as const) {
        expect(copy[key].length).toBeGreaterThan(0);
      }
    }
  });
});
