import { describe, expect, it } from "vitest";
import { recoveryHandoffChainCopy } from "./recoveryHandoffChainCopy";
import {
  CHAIN_ACTIONS, CHAIN_PHASES, CHAIN_ROLES, CHAIN_STATES, CHAIN_TIERS,
  type ChainIssue,
} from "./recoveryHandoffChain";

const en = recoveryHandoffChainCopy("en");
const fr = recoveryHandoffChainCopy("fr");
const issueCodes: readonly ChainIssue[] = ["schema", "limit", "identity", "source", "date", "timestamp", "text", "duplicate", "reference", "phase", "conflict", "cycle", "sequence"];

describe("bilingual handoff-chain text contracts", () => {
  it("provides English title", () => { expect(en.heading).toContain("handoff"); });
  it("provides French title", () => { expect(fr.heading).toContain("transfert"); });
  it("provides English introduction", () => { expect(en.introduction.length).toBeGreaterThan(20); });
  it("provides French introduction", () => { expect(fr.introduction.length).toBeGreaterThan(20); });
  it("retains UNKNOWN token in English", () => { expect(en.unknown).toBe("UNKNOWN"); });
  it("retains UNKNOWN token in French", () => { expect(fr.unknown).toBe("UNKNOWN"); });
  it("does not translate unknown step status", () => { expect(fr.states.UNKNOWN).toBe("UNKNOWN"); });
  it("does not translate unknown evidence tier", () => { expect(fr.tiers.UNKNOWN).toBe("UNKNOWN"); });
  it("does not translate unknown status to lowercase", () => { expect(fr.states.UNKNOWN).not.toBe("inconnu"); });
  it("does not translate unknown tier to lowercase", () => { expect(fr.tiers.UNKNOWN).not.toBe("inconnu"); });
  it("maps all roles into English", () => { expect(CHAIN_ROLES.every((x) => en.roles[x].length > 0)).toBe(true); });
  it("maps all roles into French", () => { expect(CHAIN_ROLES.every((x) => fr.roles[x].length > 0)).toBe(true); });
  it("maps all states into English", () => { expect(CHAIN_STATES.every((x) => en.states[x].length > 0)).toBe(true); });
  it("maps all states into French", () => { expect(CHAIN_STATES.every((x) => fr.states[x].length > 0)).toBe(true); });
  it("maps all phases into English", () => { expect(CHAIN_PHASES.every((x) => en.phases[x].length > 0)).toBe(true); });
  it("maps all phases into French", () => { expect(CHAIN_PHASES.every((x) => fr.phases[x].length > 0)).toBe(true); });
  it("maps all evidence tiers into English", () => { expect(CHAIN_TIERS.every((x) => en.tiers[x].length > 0)).toBe(true); });
  it("maps all evidence tiers into French", () => { expect(CHAIN_TIERS.every((x) => fr.tiers[x].length > 0)).toBe(true); });
  it("maps all manual actions into English", () => { expect(CHAIN_ACTIONS.every((x) => en.actions[x].length > 0)).toBe(true); });
  it("maps all manual actions into French", () => { expect(CHAIN_ACTIONS.every((x) => fr.actions[x].length > 0)).toBe(true); });
  it("maps every issue into English", () => { expect(issueCodes.every((x) => en.issues[x].length > 0)).toBe(true); });
  it("maps every issue into French", () => { expect(issueCodes.every((x) => fr.issues[x].length > 0)).toBe(true); });
  it("provides source label in English", () => { expect(en.source).toBe("Source"); });
  it("provides source label in French", () => { expect(fr.source).toBe("Source"); });
  it("provides licence label in English", () => { expect(en.licence).toBe("Licence"); });
  it("provides licence label in French", () => { expect(fr.licence).toBe("Licence"); });
  it("provides retrieval label in English", () => { expect(en.retrievedOn.length).toBeGreaterThan(0); });
  it("provides retrieval label in French", () => { expect(fr.retrievedOn.length).toBeGreaterThan(0); });
  it("provides source reference labels", () => { expect(en.reference.length).toBeGreaterThan(0); expect(fr.reference.length).toBeGreaterThan(0); });
  it("provides warning against readiness claims", () => { expect(en.warning).toContain("never establish"); });
  it("warns against accessibility assumptions in French", () => { expect(fr.warning).toContain("l’accessibilité"); });
  it("includes explicit UNKNOWN disclaimer in English", () => { expect(en.contentDisclaimer).toContain("UNKNOWN"); });
  it("includes explicit UNKNOWN disclaimer in French", () => { expect(fr.contentDisclaimer).toContain("UNKNOWN"); });
  it("uses typographic French apostrophes", () => { expect(fr.introduction).toContain("’"); });
  it("uses a French narrow no-break before semicolon", () => { expect(fr.warning).toContain("\u202f;"); });
  it("uses a French narrow no-break before colon", () => { expect(fr.issues.conflict).toContain("\u00a0:"); });
  it("offers a manual import control", () => { expect(en.open).toContain("Choose"); });
  it("offers a French manual import control", () => { expect(fr.open).toContain("Choisir"); });
  it("offers a manual save control", () => { expect(en.save).toContain("Save"); });
  it("offers a French manual save control", () => { expect(fr.save).toContain("Enregistrer"); });
  it("shows a merge conflict message", () => { expect(en.issues.conflict).toContain("conflicts"); });
  it("shows a French merge conflict message", () => { expect(fr.issues.conflict).toContain("conflit"); });
  it("labels cycles as failures", () => { expect(en.issues.cycle).toContain("cycle"); });
  it("labels cycles as failures in French", () => { expect(fr.issues.cycle).toContain("cycle"); });
  it("labels review state explicitly", () => { expect(en.phases.review).toContain("review"); });
  it("labels review state in French", () => { expect(fr.phases.review).toContain("révision"); });
  it("does not invent a regulatory endorsement", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/endorsed by|government approved|partnered with/i);
  });
  it("does not promise accuracy or suitability", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/\bverified\b|\bguarantee\b|\bpartnership\b|real-time/i);
  });
  it("contains no medical advice", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/medical diagnosis|treatment plan|eligibility guaranteed/i);
  });
  it("does not announce background monitoring", () => {
    expect(JSON.stringify({ en, fr })).not.toMatch(/scheduled monitoring|automatic polling|every hour/i);
  });
  it("provides text filter labels", () => { expect(en.find.length).toBeGreaterThan(0); expect(fr.find.length).toBeGreaterThan(0); });
  it("provides actionable buttons in both locales", () => {
    expect(en.newStep.length).toBeGreaterThan(0);
    expect(fr.newStep.length).toBeGreaterThan(0);
    expect(en.newLink.length).toBeGreaterThan(0);
    expect(fr.newLink.length).toBeGreaterThan(0);
    expect(en.newEvent.length).toBeGreaterThan(0);
    expect(fr.newEvent.length).toBeGreaterThan(0);
  });
});
