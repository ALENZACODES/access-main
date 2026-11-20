import { describe, expect, it } from "vitest";
import { recoveryDrillCopy } from "./recoveryDrillCopy";
import {
  DRILL_CONDITIONS, DRILL_EVENTS, DRILL_KINDS, DRILL_OUTCOMES,
  DRILL_PHASES, DRILL_TIERS,
} from "./recoveryDrillRun";
const en = recoveryDrillCopy("en");
const fr = recoveryDrillCopy("fr");

describe("recovery rehearsal bilingual copy", () => {
  it("offers an English heading", () => {
    expect(en.heading.toLowerCase()).toContain("recovery");
  });
  it("offers a French heading", () => {
    expect(fr.heading.toLowerCase()).toContain("récupération");
  });
  it("keeps UNKNOWN literal in English", () => {
    expect(en.unknown).toBe("UNKNOWN");
  });
  it("keeps UNKNOWN literal in French", () => {
    expect(fr.unknown).toBe("UNKNOWN");
  });
  it("keeps all unknown conditions literal", () => {
    expect(en.conditions.UNKNOWN).toBe("UNKNOWN");
    expect(fr.conditions.UNKNOWN).toBe("UNKNOWN");
  });
  it("keeps all unknown tiers literal", () => {
    expect(en.tiers.UNKNOWN).toBe("UNKNOWN");
    expect(fr.tiers.UNKNOWN).toBe("UNKNOWN");
  });
  it("keeps all unknown outcomes literal", () => {
    expect(en.outcomes.UNKNOWN).toBe("UNKNOWN");
    expect(fr.outcomes.UNKNOWN).toBe("UNKNOWN");
  });
  it("labels every rehearsal kind in both languages", () => {
    expect(DRILL_KINDS.every((kind) => en.kinds[kind].length > 0 && fr.kinds[kind].length > 0)).toBe(true);
  });
  it("labels every condition in both languages", () => {
    expect(DRILL_CONDITIONS.every((condition) => en.conditions[condition] && fr.conditions[condition])).toBe(true);
  });
  it("labels every phase in both languages", () => {
    expect(DRILL_PHASES.every((phase) => en.phases[phase] && fr.phases[phase])).toBe(true);
  });
  it("labels every outcome in both languages", () => {
    expect(DRILL_OUTCOMES.every((outcome) => en.outcomes[outcome] && fr.outcomes[outcome])).toBe(true);
  });
  it("labels every tier in both languages", () => {
    expect(DRILL_TIERS.every((tier) => en.tiers[tier] && fr.tiers[tier])).toBe(true);
  });
  it("labels every event in both languages", () => {
    expect(DRILL_EVENTS.every((event) => en.events[event] && fr.events[event])).toBe(true);
  });
  it("requires explicit inspection copy", () => {
    expect(en.inspect).toContain("Inspect");
    expect(fr.inspect).toContain("Inspectez");
  });
  it("warns that a drill cannot authorize pack use", () => {
    expect(en.warning).toContain("usable");
    expect(fr.warning).toContain("utilisable");
  });
  it("uses a typographic apostrophe in French description", () => {
    expect(fr.description).toContain("’");
  });
  it("uses a narrow nonbreaking space before a French semicolon", () => {
    expect(fr.warning).toContain("\u202F;");
  });
  it("uses explicit local language", () => {
    expect(en.description).toContain("offline");
    expect(fr.description).toContain("hors ligne");
  });
  it("does not claim external endorsement or guarantees", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/endorsed|partnered|guarantee|verified|real-time/i);
  });
  it("does not offer medical or benefits eligibility advice", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/diagnos|treatment|eligibility guaranteed/i);
  });
  it("supports manual file selection", () => {
    expect(en.open).toContain("Choose");
    expect(fr.open).toContain("Choisir");
  });
  it("makes import conflicts visible", () => {
    expect(en.issueNames.conflict).toContain("conflicting");
    expect(fr.issueNames.conflict).toContain("conflit");
  });
  it("keeps the source label available", () => {
    expect(en.source.length).toBeGreaterThan(0);
    expect(fr.source.length).toBeGreaterThan(0);
  });
  it("keeps the licence label available", () => {
    expect(en.licence.length).toBeGreaterThan(0);
    expect(fr.licence.length).toBeGreaterThan(0);
  });
  it("keeps the retrieval-date label available", () => {
    expect(en.retrievedOn.length).toBeGreaterThan(0);
    expect(fr.retrievedOn.length).toBeGreaterThan(0);
  });
  it("keeps the evidence tier label available", () => {
    expect(en.evidenceTier.length).toBeGreaterThan(0);
    expect(fr.evidenceTier.length).toBeGreaterThan(0);
  });
  it("has a complete set of error messages", () => {
    for (const key of ["format", "limit", "identity", "duplicate", "reference", "timestamp", "source", "transition", "conflict", "text"] as const) {
      expect(en.issueNames[key].length).toBeGreaterThan(0);
      expect(fr.issueNames[key].length).toBeGreaterThan(0);
    }
  });
  it("does not refer to automatic background checks", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/scheduled daily|every hour|background worker/i);
  });
  it("keeps the merged-file action distinct from export", () => {
    expect(en.merge).not.toEqual(en.save);
    expect(fr.merge).not.toEqual(fr.save);
  });
});
