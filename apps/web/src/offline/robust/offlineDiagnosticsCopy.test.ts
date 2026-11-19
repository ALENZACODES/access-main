import { describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_COPY, diagnosticActionText, diagnosticCopy,
  diagnosticCopyFindings, diagnosticReasonText,
} from "./offlineDiagnosticsCopy";
import type { DiagnosticAction, DiagnosticReason } from "./offlineDiagnostics";

const reasons: readonly DiagnosticReason[] = [
  "saved", "missing", "stale", "unreadable", "not-inspected",
  "metadata-conflict", "unlisted", "duplicate", "invalid-listing",
  "inventory-unavailable",
];
const actions: readonly DiagnosticAction[] = ["none", "download", "inspect", "review-source"];

describe("offline diagnostics bilingual copy", () => {
  it("has identical English and French keys", () => {
    expect(Object.keys(DIAGNOSTIC_COPY.en)).toEqual(Object.keys(DIAGNOSTIC_COPY.fr));
  });
  it("has no empty translations", () => {
    expect(diagnosticCopyFindings()).toEqual([]);
  });
  it("preserves UNKNOWN as the token in both languages", () => {
    expect(diagnosticCopy("en").unknown).toBe("UNKNOWN");
    expect(diagnosticCopy("fr").unknown).toBe("UNKNOWN");
  });
  it("has one translated reason for every status", () => {
    for (const reason of reasons) {
      expect(diagnosticReasonText(reason, "en").length).toBeGreaterThan(0);
      expect(diagnosticReasonText(reason, "fr").length).toBeGreaterThan(0);
    }
  });
  it("has one translated next-step description for every action", () => {
    for (const action of actions) {
      expect(diagnosticActionText(action, "en").length).toBeGreaterThan(0);
      expect(diagnosticActionText(action, "fr").length).toBeGreaterThan(0);
    }
  });
  it("uses a curly apostrophe in French text", () => {
    expect(diagnosticCopyFindings()).not.toContain("apostrophe");
  });
  it("rejects missing labels via the copy audit", () => {
    expect(diagnosticCopyFindings()).toEqual([]);
  });
  it("labels offline evidence without interpreting physical access", () => {
    expect(diagnosticCopy("en").intro).toContain("does not describe physical accessibility");
    expect(diagnosticCopy("fr").intro).toContain("ne décrit pas l’accessibilité physique");
  });
});
