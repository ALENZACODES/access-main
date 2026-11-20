import { describe, expect, it } from "vitest";
import { recoveryGuidedCopy } from "./recoveryGuidedCopy";
import {
  GUIDED_ACTIONS, GUIDED_CONDITIONS, GUIDED_EVIDENCE, GUIDED_OUTCOMES,
  GUIDED_PHASES, GUIDED_TIERS, GUIDED_TOPICS,
} from "./recoveryGuidedReview";
const en = recoveryGuidedCopy("en");
const fr = recoveryGuidedCopy("fr");
describe("guided recovery bilingual interface", () => {
  it("provides a meaningful English heading", () => {
    expect(en.heading).toContain("recovery");
  });
  it("provides a meaningful French heading", () => {
    expect(fr.heading).toContain("récupération");
  });
  it("preserves UNKNOWN exactly in English", () => {
    expect(en.unknown).toBe("UNKNOWN");
  });
  it("preserves UNKNOWN exactly in French", () => {
    expect(fr.unknown).toBe("UNKNOWN");
  });
  it("preserves unknown condition token", () => {
    expect(en.operations.UNKNOWN).toBe("UNKNOWN");
    expect(fr.operations.UNKNOWN).toBe("UNKNOWN");
  });
  it("preserves unknown evidence token", () => {
    expect(en.evidenceNames.UNKNOWN).toBe("UNKNOWN");
    expect(fr.evidenceNames.UNKNOWN).toBe("UNKNOWN");
  });
  it("preserves unknown evidence tier", () => {
    expect(en.tiers.UNKNOWN).toBe("UNKNOWN");
    expect(fr.tiers.UNKNOWN).toBe("UNKNOWN");
  });
  it("provides each topic in English", () => {
    expect(GUIDED_TOPICS.every((topic) => en.topics[topic].length > 0)).toBe(true);
  });
  it("provides each topic in French", () => {
    expect(GUIDED_TOPICS.every((topic) => fr.topics[topic].length > 0)).toBe(true);
  });
  it("provides condition labels in both languages", () => {
    expect(GUIDED_CONDITIONS.every((condition) => en.operations[condition] && fr.operations[condition])).toBe(true);
  });
  it("provides evidence labels in both languages", () => {
    expect(GUIDED_EVIDENCE.every((value) => en.evidenceNames[value] && fr.evidenceNames[value])).toBe(true);
  });
  it("provides outcome labels in both languages", () => {
    expect(GUIDED_OUTCOMES.every((value) => en.outcomes[value] && fr.outcomes[value])).toBe(true);
  });
  it("provides phase labels in both languages", () => {
    expect(GUIDED_PHASES.every((value) => en.phases[value] && fr.phases[value])).toBe(true);
  });
  it("provides event labels in both languages", () => {
    expect(GUIDED_ACTIONS.every((value) => en.actions[value] && fr.actions[value])).toBe(true);
  });
  it("provides tier labels in both languages", () => {
    expect(GUIDED_TIERS.every((value) => en.tiers[value] && fr.tiers[value])).toBe(true);
  });
  it("uses French typographic apostrophes", () => {
    expect(fr.description).toContain("’");
    expect(fr.description).not.toContain("n'");
  });
  it("does not invent accessibility assurance", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/\bverified\b|\bguarantee\b|\bpartnership\b/i);
  });
  it("does not use automatic scheduling copy", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/automatic daily|every hour|scheduled check/i);
  });
  it("warns that the record does not show a pack is usable", () => {
    expect(en.caution).toContain("usable");
    expect(fr.caution).toContain("utilisable");
  });
  it("explains UNKNOWN rather than translating its token", () => {
    expect(en.caution).toContain("UNKNOWN");
    expect(fr.caution).toContain("UNKNOWN");
  });
  it("keeps import and merge manual", () => {
    expect(en.open).toContain("Choose");
    expect(fr.open).toContain("Choisir");
  });
  it("includes licence and reference copy", () => {
    expect(en.licence.length).toBeGreaterThan(0);
    expect(fr.reference.length).toBeGreaterThan(0);
  });
  it("provides invalid-file copy", () => {
    expect(en.issues.format.length).toBeGreaterThan(0);
    expect(fr.issues.format.length).toBeGreaterThan(0);
  });
  it("provides conflict copy", () => {
    expect(en.issues.conflict.length).toBeGreaterThan(0);
    expect(fr.issues.conflict.length).toBeGreaterThan(0);
  });
  it("does not suggest medical or eligibility conclusions", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/diagnosis|benefits eligibility|eligibility approved/i);
  });
});
