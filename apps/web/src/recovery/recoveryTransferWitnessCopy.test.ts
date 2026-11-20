import { describe, expect, it } from "vitest";
import { recoveryTransferWitnessCopy } from "./recoveryTransferWitnessCopy";
import {
  WITNESS_ACTIONS, WITNESS_CHANNELS, WITNESS_CONDITIONS, WITNESS_KINDS,
  WITNESS_PHASES, WITNESS_TIERS,
} from "./recoveryTransferWitness";
const en = recoveryTransferWitnessCopy("en");
const fr = recoveryTransferWitnessCopy("fr");

describe("English and French transfer witness copy", () => {
  it("has an English transfer-register heading", () => {
    expect(en.heading.toLowerCase()).toContain("transfer");
  });
  it("has a French transfer-register heading", () => {
    expect(fr.heading.toLowerCase()).toContain("transferts");
  });
  it("uses literal UNKNOWN for English unknown", () => {
    expect(en.unknown).toBe("UNKNOWN");
  });
  it("uses literal UNKNOWN for French unknown", () => {
    expect(fr.unknown).toBe("UNKNOWN");
  });
  it("retains unknown conditions in both languages", () => {
    expect(en.conditionNames.UNKNOWN).toBe("UNKNOWN");
    expect(fr.conditionNames.UNKNOWN).toBe("UNKNOWN");
  });
  it("retains unknown channels in both languages", () => {
    expect(en.channels.UNKNOWN).toBe("UNKNOWN");
    expect(fr.channels.UNKNOWN).toBe("UNKNOWN");
  });
  it("retains unknown source tiers in both languages", () => {
    expect(en.tiers.UNKNOWN).toBe("UNKNOWN");
    expect(fr.tiers.UNKNOWN).toBe("UNKNOWN");
  });
  it("includes every manual transfer kind in English", () => {
    expect(WITNESS_KINDS.every((item) => en.kinds[item].length > 0)).toBe(true);
  });
  it("includes every manual transfer kind in French", () => {
    expect(WITNESS_KINDS.every((item) => fr.kinds[item].length > 0)).toBe(true);
  });
  it("includes every transfer channel in English", () => {
    expect(WITNESS_CHANNELS.every((item) => en.channels[item].length > 0)).toBe(true);
  });
  it("includes every transfer channel in French", () => {
    expect(WITNESS_CHANNELS.every((item) => fr.channels[item].length > 0)).toBe(true);
  });
  it("includes every condition in English", () => {
    expect(WITNESS_CONDITIONS.every((item) => en.conditionNames[item].length > 0)).toBe(true);
  });
  it("includes every condition in French", () => {
    expect(WITNESS_CONDITIONS.every((item) => fr.conditionNames[item].length > 0)).toBe(true);
  });
  it("includes every source tier in English", () => {
    expect(WITNESS_TIERS.every((item) => en.tiers[item].length > 0)).toBe(true);
  });
  it("includes every source tier in French", () => {
    expect(WITNESS_TIERS.every((item) => fr.tiers[item].length > 0)).toBe(true);
  });
  it("includes every phase in English", () => {
    expect(WITNESS_PHASES.every((item) => en.phases[item].length > 0)).toBe(true);
  });
  it("includes every phase in French", () => {
    expect(WITNESS_PHASES.every((item) => fr.phases[item].length > 0)).toBe(true);
  });
  it("includes every event action in English", () => {
    expect(WITNESS_ACTIONS.every((item) => en.actions[item].length > 0)).toBe(true);
  });
  it("includes every event action in French", () => {
    expect(WITNESS_ACTIONS.every((item) => fr.actions[item].length > 0)).toBe(true);
  });
  it("provides user-directed import actions", () => {
    expect(en.open).toContain("Choose");
    expect(fr.open).toContain("Choisir");
  });
  it("provides user-directed export actions", () => {
    expect(en.export.toLowerCase()).toContain("export");
    expect(fr.export.toLowerCase()).toContain("export");
  });
  it("provides a conflict warning in both languages", () => {
    expect(en.issues.conflict.length).toBeGreaterThan(20);
    expect(fr.issues.conflict.length).toBeGreaterThan(20);
  });
  it("provides a malformed-file warning in both languages", () => {
    expect(en.issues.format.length).toBeGreaterThan(20);
    expect(fr.issues.format.length).toBeGreaterThan(20);
  });
  it("provides a file-size warning in both languages", () => {
    expect(en.issues.size.length).toBeGreaterThan(20);
    expect(fr.issues.size.length).toBeGreaterThan(20);
  });
  it("provides a transition warning in both languages", () => {
    expect(en.issues.transition.length).toBeGreaterThan(20);
    expect(fr.issues.transition.length).toBeGreaterThan(20);
  });
  it("provides a source label in both languages", () => {
    expect(en.source.length).toBeGreaterThan(0);
    expect(fr.source.length).toBeGreaterThan(0);
  });
  it("provides a licence label in both languages", () => {
    expect(en.licence.length).toBeGreaterThan(0);
    expect(fr.licence.length).toBeGreaterThan(0);
  });
  it("provides a retrieval-date label in both languages", () => {
    expect(en.retrievedOn.length).toBeGreaterThan(0);
    expect(fr.retrievedOn.length).toBeGreaterThan(0);
  });
  it("provides a reference label in both languages", () => {
    expect(en.reference.length).toBeGreaterThan(0);
    expect(fr.reference.length).toBeGreaterThan(0);
  });
  it("keeps the pack-usability caution in both languages", () => {
    expect(en.caution).toContain("usable");
    expect(fr.caution).toContain("utilisable");
  });
  it("uses the French typographic apostrophe", () => {
    expect(fr.caution).toContain("n’");
  });
  it("uses a narrow no-break space before semicolon", () => {
    expect(fr.caution).toContain("\u202f;");
  });
  it("does not translate the UNKNOWN token inside the caution", () => {
    expect(fr.caution).toContain("UNKNOWN reste UNKNOWN");
  });
  it("does not promise background transfer", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/automatically send|envoi automatique|scheduled every/i);
  });
  it("does not claim an endorsement or partnership", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/\bverified\b|\bguarantee\b|\bpartnership\b|\bendorsed\b/i);
  });
  it("does not supply medical or eligibility instructions", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/medical treatment|benefits eligibility|diagnostic advice/i);
  });
});
