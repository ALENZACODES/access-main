import { describe, expect, it } from "vitest";
import { UPDATE_COPY, assessmentAdviceText, assessmentBudgetText,
  assessmentKindText, assessmentSummary, auditUpdateCopy,
  labelledAssessmentBytes, updateCopy } from "./updateCopy";
import { type RegionAssessment, type RecoveryBudget } from "./updateAssessment";

const result: RegionAssessment = {
  regionId: "central",
  status: "partial",
  rows: [],
  counts: { saved: 2, unknown: 3, missing: 2, stale: 1, unreadable: 0, unlisted: 0 },
  listedBytes: 100,
  savedBytes: 40,
  remainingBytes: 60,
  sources: [],
  notes: [],
};

function budget(fitsEstimate: RecoveryBudget["fitsEstimate"], queueBytes = 30): RecoveryBudget {
  return {
    fitsEstimate,
    queueBytes,
    estimatedFreeBytes: fitsEstimate === "UNKNOWN" ? null : 1000,
    reserveBytes: 100,
    reason: fitsEstimate === "yes" ? "enough" :
      fitsEstimate === "no" ? "insufficient" : "unknown-estimate",
  };
}

describe("offline review bilingual copy", () => {
  it("requires exact parity between English and French keys", () => {
    expect(Object.keys(UPDATE_COPY.en).sort()).toEqual(Object.keys(UPDATE_COPY.fr).sort());
    expect(auditUpdateCopy()).toEqual([]);
  });

  it("does not use empty or whitespace-only text", () => {
    for (const values of [UPDATE_COPY.en, UPDATE_COPY.fr]) {
      for (const value of Object.values(values)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("has no unsupported claims in either language", () => {
    for (const values of [UPDATE_COPY.en, UPDATE_COPY.fr]) {
      const joined = Object.values(values).join(" ");
      expect(joined).not.toMatch(/\b(?:verified|verify|vérifi\p{L}*|real-time|partnership|guarantee|AAA-conformant)\b/iu);
    }
  });

  it("avoids ASCII apostrophes in French copy", () => {
    for (const value of Object.values(UPDATE_COPY.fr)) {
      expect(value).not.toContain("'");
    }
    expect(UPDATE_COPY.fr.privacy).toContain("l’accessibilité");
  });

  it("keeps correct spaces before French punctuation", () => {
    for (const value of Object.values(UPDATE_COPY.fr)) {
      expect(value).not.toMatch(/(?<!\u00a0):/u);
      expect(value).not.toMatch(/(?<!\u202f)[;!?]/u);
    }
  });

  it("exposes a French translation of every status", () => {
    const kinds = [
      "saved", "not-downloaded", "out-of-date", "unreadable",
      "unlisted", "metadata-changed",
    ] as const;
    for (const kind of kinds) {
      const en = assessmentKindText(kind, "en");
      const fr = assessmentKindText(kind, "fr");
      expect(en.trim().length).toBeGreaterThan(3);
      expect(fr.trim().length).toBeGreaterThan(3);
      expect(en).not.toEqual(fr);
    }
  });

  it("exposes a French translation for every recovery suggestion", () => {
    for (const advice of ["none", "download", "inspect", "review-source"] as const) {
      expect(assessmentAdviceText(advice, "en").length).toBeGreaterThan(4);
      expect(assessmentAdviceText(advice, "fr").length).toBeGreaterThan(4);
    }
  });

  it("keeps UNKNOWN in English summaries", () => {
    const text = assessmentSummary({ ...result, status: "UNKNOWN" }, "en");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("2");
    expect(text).toContain("3");
  });

  it("keeps INCONNU in French summaries", () => {
    const text = assessmentSummary({ ...result, status: "UNKNOWN" }, "fr");
    expect(text).toContain("INCONNU");
    expect(text).toContain("\u00a0:");
    expect(text).toContain("2");
    expect(text).toContain("3");
  });

  it("shows partial regions without claiming they are complete", () => {
    const en = assessmentSummary(result, "en");
    const fr = assessmentSummary(result, "fr");
    expect(en).toContain(UPDATE_COPY.en.partial);
    expect(fr).toContain(UPDATE_COPY.fr.partial);
    expect(en).not.toContain(UPDATE_COPY.en.complete);
  });

  it("only uses completion copy for a genuinely completed assessment", () => {
    const en = assessmentSummary({ ...result, status: "complete" }, "en");
    const fr = assessmentSummary({ ...result, status: "complete" }, "fr");
    expect(en).toContain(UPDATE_COPY.en.complete);
    expect(fr).toContain(UPDATE_COPY.fr.complete);
  });

  it("renders UNKNOWN bytes rather than misleading zeros", () => {
    expect(labelledAssessmentBytes(null, "en")).toBe("UNKNOWN");
    expect(labelledAssessmentBytes(null, "fr")).toBe("INCONNU");
    expect(labelledAssessmentBytes(-1, "en")).toBe("UNKNOWN");
    expect(labelledAssessmentBytes(Number.NaN, "fr")).toBe("INCONNU");
  });

  it("formats known bytes with localized separators", () => {
    expect(labelledAssessmentBytes(1000, "en")).toContain("1,000");
    expect(labelledAssessmentBytes(1000, "fr")).toContain("1");
    expect(labelledAssessmentBytes(0, "en")).toBe("0 B");
  });

  it("does not confuse a positive estimate with a promised write", () => {
    expect(assessmentBudgetText(budget("yes"), "en")).toContain("estimate");
    expect(assessmentBudgetText(budget("yes"), "fr")).toContain("estimation");
  });

  it("describes insufficient storage without suggesting data is lost", () => {
    expect(assessmentBudgetText(budget("no"), "en")).toContain("insufficient");
    expect(assessmentBudgetText(budget("no"), "fr")).toContain("insuffisant");
  });

  it("preserves UNKNOWN when no storage estimate exists", () => {
    expect(assessmentBudgetText(budget("UNKNOWN"), "en")).toContain("UNKNOWN");
    expect(assessmentBudgetText(budget("UNKNOWN"), "fr")).toContain("INCONNUE");
  });

  it("describes the empty recovery queue in both languages", () => {
    expect(assessmentBudgetText(budget("UNKNOWN", 0), "en")).toBe(UPDATE_COPY.en.budgetEmpty);
    expect(assessmentBudgetText(budget("UNKNOWN", 0), "fr")).toBe(UPDATE_COPY.fr.budgetEmpty);
  });

  it("includes a visible non-medical privacy explanation", () => {
    expect(updateCopy("en").privacy).toContain("device");
    expect(updateCopy("fr").privacy).toContain("appareil");
    expect(updateCopy("en").advisory).toContain("accessibility");
    expect(updateCopy("fr").advisory).toContain("accessibilité");
  });

  it("keeps the review read-only in its descriptions", () => {
    expect(updateCopy("en").downloadAdvice).toContain("region's download control");
    expect(updateCopy("fr").downloadAdvice).toContain("région");
    expect(updateCopy("en").start).toContain("Review");
  });

  it("supports every language value explicitly", () => {
    expect(updateCopy("en").title).toBe(UPDATE_COPY.en.title);
    expect(updateCopy("fr").title).toBe(UPDATE_COPY.fr.title);
  });
});
