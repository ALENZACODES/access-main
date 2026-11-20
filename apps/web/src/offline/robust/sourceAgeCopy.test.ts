import { describe, expect, it } from "vitest";
import { SOURCE_AGE_COPY, sourceAgeCopy, ageBandText, copyBandText,
  ageIssueText, sourceAgeCopyFindings } from "./sourceAgeCopy";
import { type AgeBand, type CopyBand, type AgeIssue } from "./sourceAgeReview";

describe("source age bilingual messages", () => {
  it("provides all copy keys in both languages", () => {
    expect(Object.keys(SOURCE_AGE_COPY.en)).toEqual(Object.keys(SOURCE_AGE_COPY.fr));
  });
  it("has no missing French messages", () => {
    expect(Object.values(SOURCE_AGE_COPY.fr).every((value) => value.trim().length > 0)).toBe(true);
  });
  it("has no missing English messages", () => {
    expect(Object.values(SOURCE_AGE_COPY.en).every((value) => value.trim().length > 0)).toBe(true);
  });
  it("retains the exact UNKNOWN token in both languages", () => {
    expect(sourceAgeCopy("en").unknown).toBe("UNKNOWN");
    expect(sourceAgeCopy("fr").unknown).toBe("UNKNOWN");
  });
  it("does not translate UNKNOWN into an inferred state", () => {
    expect(ageBandText("UNKNOWN", "fr")).toBe("UNKNOWN");
    expect(copyBandText("UNKNOWN", "fr")).toBe("UNKNOWN");
  });
  it("uses a proper French apostrophe", () => {
    expect(SOURCE_AGE_COPY.fr.intro).toContain("l’accessibilité");
  });
  it("does not use straight ASCII apostrophes in French messages", () => {
    expect(Object.values(SOURCE_AGE_COPY.fr).some((text) => text.includes("'"))).toBe(false);
  });
  it("passes the punctuation and language audit", () => {
    expect(sourceAgeCopyFindings()).toEqual([]);
  });
  it("makes all states usable in both languages", () => {
    const states: AgeBand[] = ["recent", "older", "future", "UNKNOWN"];
    for (const state of states) {
      expect(ageBandText(state, "en").length).toBeGreaterThan(0);
      expect(ageBandText(state, "fr").length).toBeGreaterThan(0);
    }
  });
  it("labels every copy state in both languages", () => {
    const states: CopyBand[] = ["saved", "missing", "stale", "unreadable", "UNKNOWN"];
    for (const state of states) {
      expect(copyBandText(state, "en").length).toBeGreaterThan(0);
      expect(copyBandText(state, "fr").length).toBeGreaterThan(0);
    }
  });
  it("labels every issue code instead of exposing raw internal values", () => {
    const issues: AgeIssue[] = [
      "none", "missing-inventory", "region-mismatch", "duplicate-manifest",
      "duplicate-inventory", "unlisted-inventory", "invalid-manifest",
      "unsupported-licence", "invalid-source-date", "future-source-date",
      "stale-copy", "missing-copy", "unreadable-copy", "mismatched-copy",
    ];
    for (const issue of issues) {
      expect(ageIssueText(issue, "en")).not.toBe("");
      expect(ageIssueText(issue, "fr")).not.toBe("");
    }
  });
  it("distinguishes source dates from accessibility", () => {
    expect(sourceAgeCopy("en").disclaimer).toContain("not evidence");
    expect(sourceAgeCopy("fr").disclaimer).toContain("ne prouve pas");
  });
  it("labels storage errors separately from age errors", () => {
    expect(ageIssueText("missing-copy", "en")).not.toBe(ageIssueText("invalid-source-date", "en"));
  });
  it("never treats an old date as a legal expiry", () => {
    expect(sourceAgeCopy("en").thresholdHelp).toContain("not an expiry date");
    expect(sourceAgeCopy("fr").thresholdHelp).toContain("n’est pas une date d’expiration");
  });
  it("provides manual-only export actions", () => {
    expect(sourceAgeCopy("en").exportJson).toContain("Save");
    expect(sourceAgeCopy("fr").exportText).toContain("Enregistrer");
  });
});
