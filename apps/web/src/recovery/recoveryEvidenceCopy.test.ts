import { describe, expect, it } from "vitest";
import { recoveryEvidencePacketCopy } from "./recoveryEvidencePacketCopy";
import {
  PACKET_ACTIONS, PACKET_CONDITIONS, PACKET_OPERATIONS,
  PACKET_STAGES, PACKET_TIERS,
} from "./recoveryEvidencePacket";

const en = recoveryEvidencePacketCopy("en");
const fr = recoveryEvidencePacketCopy("fr");

describe("recovery evidence packet bilingual copy", () => {
  it("provides English heading", () => {
    expect(en.heading).toContain("evidence");
  });
  it("provides French heading", () => {
    expect(fr.heading).toContain("récupération");
  });
  it("keeps literal UNKNOWN in English", () => {
    expect(en.unknown).toBe("UNKNOWN");
  });
  it("keeps literal UNKNOWN in French", () => {
    expect(fr.unknown).toBe("UNKNOWN");
  });
  it("does not translate unknown conditions", () => {
    expect(en.conditions.UNKNOWN).toBe("UNKNOWN");
    expect(fr.conditions.UNKNOWN).toBe("UNKNOWN");
  });
  it("does not translate unknown tiers", () => {
    expect(en.tiers.UNKNOWN).toBe("UNKNOWN");
    expect(fr.tiers.UNKNOWN).toBe("UNKNOWN");
  });
  it("maps every operation to English", () => {
    expect(PACKET_OPERATIONS.every((value) => en.operations[value].length > 0)).toBe(true);
  });
  it("maps every operation to French", () => {
    expect(PACKET_OPERATIONS.every((value) => fr.operations[value].length > 0)).toBe(true);
  });
  it("maps every condition to English", () => {
    expect(PACKET_CONDITIONS.every((value) => en.conditions[value].length > 0)).toBe(true);
  });
  it("maps every condition to French", () => {
    expect(PACKET_CONDITIONS.every((value) => fr.conditions[value].length > 0)).toBe(true);
  });
  it("maps every tier to both languages", () => {
    expect(PACKET_TIERS.every((value) => en.tiers[value] && fr.tiers[value])).toBe(true);
  });
  it("maps every stage to both languages", () => {
    expect(PACKET_STAGES.every((value) => en.stages[value] && fr.stages[value])).toBe(true);
  });
  it("maps every activity action", () => {
    expect(PACKET_ACTIONS.every((value) => en.actions[value] && fr.actions[value])).toBe(true);
  });
  it("provides file failure messages", () => {
    expect(en.failed.length).toBeGreaterThan(0);
    expect(fr.failed.length).toBeGreaterThan(0);
  });
  it("provides merge conflict notices", () => {
    expect(en.issues.conflict.length).toBeGreaterThan(0);
    expect(fr.issues.conflict.length).toBeGreaterThan(0);
  });
  it("warns about observations and pack use", () => {
    expect(en.caution).toContain("usable");
    expect(fr.caution).toContain("utilisable");
  });
  it("does not claim external endorsements", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/partnered|endorsed|approved by|guaranteed/i);
  });
  it("does not offer medical or eligibility advice", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/diagnos|treatment|eligibility guaranteed/i);
  });
  it("uses French typographic apostrophes", () => {
    expect(fr.description).toContain("’");
  });
  it("uses French narrow no-break space before semicolon", () => {
    expect(fr.warning).toContain("\u202F;");
  });
  it("does not use forbidden verification assurances", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/\bverified\b|\bguarantee\b|\bpartnership\b/i);
  });
  it("does not include scheduling copy", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/automatic daily|scheduled daily|every hour/i);
  });
  it("keeps import explicitly user-directed", () => {
    expect(en.open).toContain("Choose");
    expect(fr.open).toContain("Choisir");
  });
  it("keeps source metadata labels visible", () => {
    expect(en.source.length).toBeGreaterThan(0);
    expect(en.licence.length).toBeGreaterThan(0);
    expect(en.retrievedOn.length).toBeGreaterThan(0);
    expect(en.tier.length).toBeGreaterThan(0);
  });
  it("provides all issue labels", () => {
    for (const issue of ["format", "limit", "identity", "duplicate", "reference", "transition", "source", "date", "text", "timestamp", "conflict"] as const) {
      expect(en.issues[issue].length).toBeGreaterThan(0);
      expect(fr.issues[issue].length).toBeGreaterThan(0);
    }
  });
});
