import { describe, expect, it } from "vitest";
import {
  RECONCILIATION_ACTIONS, RECONCILIATION_CONDITIONS,
  RECONCILIATION_DISPOSITIONS, RECONCILIATION_OPERATIONS,
  RECONCILIATION_STATUSES, RECONCILIATION_TIERS,
} from "./recoveryReconciliation";
import { reconciliationCopy } from "./recoveryReconciliationCopy";
const en = reconciliationCopy("en");
const fr = reconciliationCopy("fr");

describe("recovery reconciliation English and French", () => {
  it("provides an English register title", () => {
    expect(en.heading).toContain("reconciliation");
  });
  it("provides a French register title", () => {
    expect(fr.heading).toContain("rapprochement");
  });
  it("describes the local-only workflow", () => {
    expect(en.description).toContain("locally");
  });
  it("describes no transmission in French", () => {
    expect(fr.description).toContain("aucune donnée");
  });
  it("preserves UNKNOWN in English", () => {
    expect(en.unknown).toBe("UNKNOWN");
  });
  it("preserves UNKNOWN in French", () => {
    expect(fr.unknown).toBe("UNKNOWN");
  });
  it("does not translate unknown observation conditions", () => {
    expect(en.conditions.UNKNOWN).toBe("UNKNOWN");
    expect(fr.conditions.UNKNOWN).toBe("UNKNOWN");
  });
  it("does not translate unknown source tiers", () => {
    expect(en.tiers.UNKNOWN).toBe("UNKNOWN");
    expect(fr.tiers.UNKNOWN).toBe("UNKNOWN");
  });
  it("does not translate unknown dispositions", () => {
    expect(en.dispositions.UNKNOWN).toBe("UNKNOWN");
    expect(fr.dispositions.UNKNOWN).toBe("UNKNOWN");
  });
  it("labels every operation", () => {
    for (const key of RECONCILIATION_OPERATIONS) {
      expect(en.operations[key].length).toBeGreaterThan(0);
      expect(fr.operations[key].length).toBeGreaterThan(0);
    }
  });
  it("labels every condition", () => {
    for (const key of RECONCILIATION_CONDITIONS) {
      expect(en.conditions[key].length).toBeGreaterThan(0);
      expect(fr.conditions[key].length).toBeGreaterThan(0);
    }
  });
  it("labels every tier", () => {
    for (const key of RECONCILIATION_TIERS) {
      expect(en.tiers[key].length).toBeGreaterThan(0);
      expect(fr.tiers[key].length).toBeGreaterThan(0);
    }
  });
  it("labels every status", () => {
    for (const key of RECONCILIATION_STATUSES) {
      expect(en.statuses[key].length).toBeGreaterThan(0);
      expect(fr.statuses[key].length).toBeGreaterThan(0);
    }
  });
  it("labels every disposition", () => {
    for (const key of RECONCILIATION_DISPOSITIONS) {
      expect(en.dispositions[key].length).toBeGreaterThan(0);
      expect(fr.dispositions[key].length).toBeGreaterThan(0);
    }
  });
  it("labels every manual action", () => {
    for (const key of RECONCILIATION_ACTIONS) {
      expect(en.actions[key].length).toBeGreaterThan(0);
      expect(fr.actions[key].length).toBeGreaterThan(0);
    }
  });
  it("shows source metadata labels in English", () => {
    expect([en.source, en.licence, en.retrievedOn, en.tier, en.reference].every(Boolean)).toBe(true);
  });
  it("shows source metadata labels in French", () => {
    expect([fr.source, fr.licence, fr.retrievedOn, fr.tier, fr.reference].every(Boolean)).toBe(true);
  });
  it("labels manual import actions", () => {
    expect(en.importFile).toContain("JSON");
    expect(fr.importFile).toContain("JSON");
  });
  it("labels cancellation in both languages", () => {
    expect(en.cancelImport.length).toBeGreaterThan(0);
    expect(fr.cancelImport.length).toBeGreaterThan(0);
  });
  it("warns about conflicting input", () => {
    expect(en.conflict.length).toBeGreaterThan(0);
    expect(fr.conflict.length).toBeGreaterThan(0);
  });
  it("does not treat review status as permission to use packs", () => {
    expect(en.caution).toContain("does not make a pack usable");
    expect(fr.caution).toContain("ne rend pas un ensemble utilisable");
  });
  it("uses French typographic apostrophes", () => {
    expect(fr.addObservation).toContain("’");
    expect(fr.reopen).toContain("Rouvrir");
  });
  it("does not use inappropriate assurance claims", () => {
    const content = JSON.stringify({ en, fr });
    expect(content).not.toMatch(/\bverified\b|\bverify\b|vérif|\bguarantee\b|\bpartnership\b|real-time/i);
  });
  it("does not make eligibility claims", () => {
    const content = JSON.stringify({ en, fr });
    expect(content).not.toMatch(/medical eligibility|eligible for benefits|diagnosis/i);
  });
  it("does not mention an organisation or city as an endorser", () => {
    const content = JSON.stringify({ en, fr });
    expect(content).not.toMatch(/endorsed by|approved by|partnered with/i);
  });
  it("does not schedule background processing", () => {
    const content = JSON.stringify({ en, fr });
    expect(content).not.toMatch(/daily scheduled|automatic hourly|background polling/i);
  });
  it("includes status announcements", () => {
    expect(en.saved).toContain("file");
    expect(fr.saved).toContain("fichier");
  });
  it("provides labels for all invalid document states", () => {
    for (const key of ["format", "size", "count", "id", "duplicate", "source", "date", "time", "text", "reference", "transition", "conflict", "version"] as const) {
      expect(en.issues[key].length).toBeGreaterThan(0);
      expect(fr.issues[key].length).toBeGreaterThan(0);
    }
  });
  it("keeps conflict language grounded in disagreement", () => {
    expect(fr.conflict).toContain("différences");
    expect(en.conflict).toContain("disagree");
  });
  it("offers explicit saving rather than automatic saving", () => {
    expect(en.exportFile).toContain("Save");
    expect(fr.exportFile).toContain("Enregistrer");
  });
});
