import { describe, expect, it } from "vitest";
import { READINESS_COPY, auditReadinessCopy, readinessActionText, readinessCopy,
  readinessReasonText, readinessStateText } from "./readinessCopy";

describe("readiness copy audit", () => {
  it("has the same keys in English and French", () => {
    expect(Object.keys(READINESS_COPY.en)).toEqual(Object.keys(READINESS_COPY.fr));
  });
  it("provides non-empty strings for both languages", () => {
    for (const language of ["en", "fr"] as const) {
      expect(Object.values(readinessCopy(language)).every((value) => value.trim().length > 0)).toBe(true);
    }
  });
  it("rejects unsupported copy patterns, spacing errors and ASCII apostrophes", () => {
    expect(auditReadinessCopy()).toEqual([]);
  });
  it("renders UNKNOWN explicitly and independently from saved state", () => {
    expect(readinessStateText("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(readinessStateText("UNKNOWN", "fr")).toBe("INCONNU");
    expect(readinessStateText("saved", "en")).not.toBe("UNKNOWN");
  });
  it("maps every record cause to bilingual labels", () => {
    for (const reason of ["present", "not-downloaded", "out-of-date", "unreadable",
      "mismatched-metadata", "unlisted", "invalid-listing"] as const) {
      expect(readinessReasonText(reason, "en").length).toBeGreaterThan(0);
      expect(readinessReasonText(reason, "fr").length).toBeGreaterThan(0);
    }
  });
  it("maps every recommended step into readable language", () => {
    for (const action of ["none", "download", "inspect", "review-source"] as const) {
      expect(readinessActionText(action, "en").length).toBeGreaterThan(0);
      expect(readinessActionText(action, "fr").length).toBeGreaterThan(0);
    }
  });
  it("never uses a saved data state as a location assessment", () => {
    expect(READINESS_COPY.en.locationNotice).toContain("not evidence");
    expect(READINESS_COPY.fr.locationNotice).toContain("ne constituent pas");
  });
});
