import { describe, expect, it } from "vitest";
import {
  CASEBOOK_COPY, CASE_FILTERS, CASE_ORDERS, CASE_REASONS, CASE_STATUSES,
  auditCasebookCopy, caseActionText, caseEvidenceText, caseFilterText,
  caseOrderText, caseReasonText, caseStatusText, casebookCopy,
} from "./offlineCasebookCopy";

const entries = Object.keys(CASEBOOK_COPY.en);

describe("casebook bilingual content coverage", () => {
  it("provides the same translation keys in both languages", () => {
    expect(Object.keys(CASEBOOK_COPY.fr)).toEqual(entries);
  });

  it("does not permit empty translations", () => {
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(CASEBOOK_COPY[language])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("uses the exact UNKNOWN token for each language", () => {
    expect(CASEBOOK_COPY.en.unknown).toBe("UNKNOWN");
    expect(CASEBOOK_COPY.fr.unknown).toBe("UNKNOWN");
    expect(CASEBOOK_COPY.fr.evidenceUnknown).toBe("UNKNOWN");
  });

  it("does not substitute another unknown-status token", () => {
    expect(JSON.stringify(CASEBOOK_COPY.fr)).not.toContain("INCONNU");
  });

  it("passes the French punctuation and language audit", () => {
    expect(auditCasebookCopy()).toEqual([]);
  });

  it("keeps all French apostrophes typographic", () => {
    for (const value of Object.values(CASEBOOK_COPY.fr)) {
      expect(value).not.toContain("'");
    }
  });

  it("uses a nonbreaking space before French colons when present", () => {
    for (const value of Object.values(CASEBOOK_COPY.fr)) {
      expect(value.replace(/\u00a0:/g, "")).not.toContain(":");
    }
  });

  it("uses narrow nonbreaking space before French terminal punctuation", () => {
    for (const value of Object.values(CASEBOOK_COPY.fr)) {
      expect(/(?<!\u202f)[;!?]/u.test(value)).toBe(false);
    }
  });

  it("does not include unsupported claims in either language", () => {
    for (const value of [...Object.values(CASEBOOK_COPY.en), ...Object.values(CASEBOOK_COPY.fr)]) {
      expect(/(?<![\p{L}\p{N}])(?:verified|verify|verifier|vérifi\p{L}*|real-time|partnership|guarantee)(?![\p{L}\p{N}])/iu.test(value)).toBe(false);
    }
  });

  it("provides a privacy warning for exports", () => {
    expect(CASEBOOK_COPY.en.exportWarning).toContain("private notes");
    expect(CASEBOOK_COPY.fr.exportWarning).toContain("notes privées");
  });

  it("does not equate historical imports with current availability", () => {
    expect(CASEBOOK_COPY.en.importWarning).toContain("historical");
    expect(CASEBOOK_COPY.fr.importWarning).toContain("historiques");
  });

  it("does not promise any automatic background action", () => {
    expect(CASEBOOK_COPY.en.userAction).toContain("requires your action");
    expect(CASEBOOK_COPY.fr.userAction).toContain("demande votre action");
  });

  it("describes UNKNOWN storage without guessing its value", () => {
    expect(CASEBOOK_COPY.en.noInventory).toContain("UNKNOWN");
    expect(CASEBOOK_COPY.fr.noInventory).toContain("UNKNOWN");
  });

  it("keeps case reasons distinct from offline evidence states", () => {
    expect(CASEBOOK_COPY.en.reason).not.toBe(CASEBOOK_COPY.en.evidence);
    expect(CASEBOOK_COPY.fr.reason).not.toBe(CASEBOOK_COPY.fr.evidence);
  });

  it("provides a name for every case filter", () => {
    for (const filter of CASE_FILTERS) {
      expect(caseFilterText(filter, "en").length).toBeGreaterThan(0);
      expect(caseFilterText(filter, "fr").length).toBeGreaterThan(0);
    }
  });

  it("provides a name for every sorting option", () => {
    for (const order of CASE_ORDERS) {
      expect(caseOrderText(order, "en").length).toBeGreaterThan(0);
      expect(caseOrderText(order, "fr").length).toBeGreaterThan(0);
    }
  });

  it("provides a name for every case reason", () => {
    for (const reason of CASE_REASONS) {
      expect(caseReasonText(reason, "en").length).toBeGreaterThan(0);
      expect(caseReasonText(reason, "fr").length).toBeGreaterThan(0);
    }
  });

  it("provides a name for every case status", () => {
    for (const status of CASE_STATUSES) {
      expect(caseStatusText(status, "en").length).toBeGreaterThan(0);
      expect(caseStatusText(status, "fr").length).toBeGreaterThan(0);
    }
  });

  it("returns the unchanged UNKNOWN token for missing evidence", () => {
    expect(caseEvidenceText("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(caseEvidenceText("UNKNOWN", "fr")).toBe("UNKNOWN");
  });

  it("does not conflate saved-copy status with case status", () => {
    expect(caseEvidenceText("matching", "en")).not.toBe(caseStatusText("closed", "en"));
    expect(caseEvidenceText("matching", "fr")).not.toBe(caseStatusText("closed", "fr"));
  });

  it("renders all four historical actions in both languages", () => {
    for (const action of ["opened", "commented", "status-changed", "reconciled"] as const) {
      expect(caseActionText(action, "en").length).toBeGreaterThan(0);
      expect(caseActionText(action, "fr").length).toBeGreaterThan(0);
    }
  });

  it("does not label a missing case as downloaded", () => {
    expect(caseEvidenceText("missing", "en")).toContain("No saved");
    expect(caseEvidenceText("missing", "fr")).toContain("Aucune copie");
  });

  it("distinguishes a stale copy from an unreadable copy", () => {
    expect(caseEvidenceText("stale", "en")).not.toBe(caseEvidenceText("unreadable", "en"));
    expect(caseEvidenceText("stale", "fr")).not.toBe(caseEvidenceText("unreadable", "fr"));
  });

  it("distinguishes a source conflict from a storage limit", () => {
    expect(caseReasonText("source-conflict", "en")).not.toBe(caseReasonText("storage-limit", "en"));
    expect(caseReasonText("source-conflict", "fr")).not.toBe(caseReasonText("storage-limit", "fr"));
  });

  it("preserves the deterministic order of filter options", () => {
    expect(CASE_FILTERS).toEqual(["all", "open", "in-review", "closed", "attention", "unknown"]);
  });

  it("preserves the deterministic order of case statuses", () => {
    expect(CASE_STATUSES).toEqual(["open", "in-review", "closed"]);
  });

  it("preserves all seven issue reasons", () => {
    expect(CASE_REASONS).toHaveLength(7);
    expect(new Set(CASE_REASONS).size).toBe(CASE_REASONS.length);
  });

  it("makes status announcements available in both languages", () => {
    for (const key of ["savedLocally", "noteSaved", "statusSaved", "evidenceUpdated", "error"] as const) {
      expect(CASEBOOK_COPY.en[key]).toBeTruthy();
      expect(CASEBOOK_COPY.fr[key]).toBeTruthy();
    }
  });

  it("keeps issue notes separate from source documentation", () => {
    expect(casebookCopy("en").comments).not.toBe(casebookCopy("en").source);
    expect(casebookCopy("fr").comments).not.toBe(casebookCopy("fr").source);
  });

  it("keeps the same translation map on repeated access", () => {
    expect(casebookCopy("en")).toBe(CASEBOOK_COPY.en);
    expect(casebookCopy("fr")).toBe(CASEBOOK_COPY.fr);
  });
});
