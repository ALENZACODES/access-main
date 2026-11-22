import { describe, expect, it } from "vitest";
import {
  auditStorageScenarioCopy, candidateReasonText, dispositionText,
  scenarioBlockText, scenarioCopy, scenarioStatusText, STORAGE_SCENARIO_COPY,
} from "./storageScenarioCopy.ts";
import type { BlockReason, CandidateReason, CellDisposition, ScenarioStatus } from "./storageScenario.ts";

describe("storage scenario bilingual labels", () => {
  it("has exactly matching English and French catalogue keys", () => {
    expect(Object.keys(STORAGE_SCENARIO_COPY.fr)).toEqual(Object.keys(STORAGE_SCENARIO_COPY.en));
  });

  it("has no empty strings in either language", () => {
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(STORAGE_SCENARIO_COPY[language])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("uses UNKNOWN literally in both languages", () => {
    expect(scenarioCopy("en").unknown).toBe("UNKNOWN");
    expect(scenarioCopy("fr").unknown).toBe("UNKNOWN");
    expect(dispositionText("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(dispositionText("UNKNOWN", "fr")).toBe("UNKNOWN");
  });

  it("includes a note that estimates do not reserve space", () => {
    expect(scenarioCopy("en").advisory).toContain("estimates");
    expect(scenarioCopy("fr").advisory).toContain("estimations");
  });

  it("does not equate a saved copy to physical accessibility", () => {
    expect(scenarioCopy("en").privacy).toContain("not the accessibility");
    expect(scenarioCopy("fr").privacy).toContain("non l’accessibilité");
  });

  it("does not imply an automatic download", () => {
    expect(scenarioCopy("en").onlyWhenReady).toContain("does not download");
    expect(scenarioCopy("fr").onlyWhenReady).toContain("ne télécharge");
  });

  it("guards against missing translations and unsuitable punctuation", () => {
    expect(auditStorageScenarioCopy()).toEqual([]);
  });

  it("uses a curly apostrophe in French", () => {
    for (const value of Object.values(STORAGE_SCENARIO_COPY.fr)) {
      expect(value).not.toContain("'");
    }
  });

  it("uses the French nonbreaking space before colon when present", () => {
    for (const value of Object.values(STORAGE_SCENARIO_COPY.fr)) {
      expect(/(?<!\u00a0):/u.test(value)).toBe(false);
    }
  });

  it("uses the French narrow nonbreaking space before punctuation", () => {
    for (const value of Object.values(STORAGE_SCENARIO_COPY.fr)) {
      expect(/(?<!\u202f)[;!?]/u.test(value)).toBe(false);
    }
  });

  it("renders all possible dispositions", () => {
    const values: CellDisposition[] = ["saved", "candidate", "blocked", "UNKNOWN"];
    for (const value of values) {
      expect(dispositionText(value, "en").length).toBeGreaterThan(0);
      expect(dispositionText(value, "fr").length).toBeGreaterThan(0);
    }
  });

  it("renders all possible candidate reasons", () => {
    const values: CandidateReason[] = [
      "saved", "missing", "stale", "unreadable", "not-inspected",
      "metadata-conflict", "duplicate", "invalid-listing", "unlisted",
    ];
    for (const value of values) {
      expect(candidateReasonText(value, "en").length).toBeGreaterThan(0);
      expect(candidateReasonText(value, "fr").length).toBeGreaterThan(0);
    }
  });

  it("renders all possible capacity states", () => {
    const values: ScenarioStatus[] = ["possible", "insufficient", "UNKNOWN"];
    for (const value of values) {
      expect(scenarioStatusText(value, "en").length).toBeGreaterThan(0);
      expect(scenarioStatusText(value, "fr").length).toBeGreaterThan(0);
    }
  });

  it("renders all failure reasons", () => {
    const values: BlockReason[] = [
      "manifest-invalid", "inventory-unavailable", "inventory-region-mismatch",
      "duplicate-inventory", "unlisted-inventory", "inventory-inconsistent",
    ];
    for (const value of values) {
      expect(scenarioBlockText(value, "en").length).toBeGreaterThan(0);
      expect(scenarioBlockText(value, "fr").length).toBeGreaterThan(0);
    }
  });

  it("does not interpret a risk label as a status assertion", () => {
    expect(scenarioStatusText("UNKNOWN", "fr")).toContain("UNKNOWN");
    expect(scenarioStatusText("possible", "en")).not.toContain("guarantee");
  });
});
