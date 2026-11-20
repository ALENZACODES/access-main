import { describe, expect, it } from "vitest";
import {
  CONTINUITY_COPY, DRILL_FILTERS, DRILL_SCENARIOS, DRILL_SORTS,
  auditContinuityCopy, continuityCopy, continuityFilterLabel,
  continuityFormatBytes, continuityReasonLabel, continuityScenarioLabel,
  continuitySortLabel,
} from "./continuityDrillCopy";

const keys = Object.keys(CONTINUITY_COPY.en);
describe("continuity drill bilingual copy", () => {
  it("includes every English key in French", () => {
    expect(Object.keys(CONTINUITY_COPY.fr)).toEqual(keys);
  });
  it("has no blank English labels", () => {
    for (const key of keys) expect((CONTINUITY_COPY.en as Record<string, string>)[key]?.trim().length).toBeGreaterThan(0);
  });
  it("has no blank French labels", () => {
    for (const key of keys) expect((CONTINUITY_COPY.fr as Record<string, string>)[key]?.trim().length).toBeGreaterThan(0);
  });
  it("does not use straight apostrophes in French", () => {
    for (const value of Object.values(CONTINUITY_COPY.fr)) expect(value).not.toContain("'");
  });
  it("does not invent evidence for UNKNOWN", () => {
    expect(CONTINUITY_COPY.fr.unknown).toBe("UNKNOWN");
    expect(CONTINUITY_COPY.en.unknown).toBe("UNKNOWN");
  });
  it("does not translate UNKNOWN to another token", () => {
    expect(JSON.stringify(CONTINUITY_COPY.fr)).not.toContain("INCONNU");
  });
  it("warns that the drill is hypothetical", () => {
    expect(CONTINUITY_COPY.en.note).toContain("planning");
  });
  it("warns that the drill does not change storage", () => {
    expect(CONTINUITY_COPY.en.used).toContain("never modifies");
  });
  it("has no assertion of physical accessibility", () => {
    expect(CONTINUITY_COPY.en.privacy).toContain("does not describe");
  });
  it("retains the French curved apostrophe", () => {
    expect(CONTINUITY_COPY.fr.privacy).toContain("l’accessibilité");
  });
  it("warns when storage estimation is unavailable", () => {
    expect(CONTINUITY_COPY.fr.unknownQuota).toContain("UNKNOWN");
  });
  it("passes the bilingual copy audit", () => {
    expect(auditContinuityCopy()).toEqual([]);
  });
  it("returns the same English copy on repeated access", () => {
    expect(continuityCopy("en")).toBe(continuityCopy("en"));
  });
  it("returns the same French copy on repeated access", () => {
    expect(continuityCopy("fr")).toBe(continuityCopy("fr"));
  });
  it("never silently falls back to English for French copy", () => {
    expect(continuityCopy("en").title).not.toBe(continuityCopy("fr").title);
  });
  it("provides all five scenario choices", () => {
    expect(DRILL_SCENARIOS).toEqual(["baseline", "evict-largest", "evict-oldest", "source-change", "quota-reduction"]);
  });
  it("provides all five filtering choices", () => {
    expect(DRILL_FILTERS).toEqual(["all", "saved", "UNKNOWN", "affected", "unaffected"]);
  });
  it("provides all five sort choices", () => {
    expect(DRILL_SORTS).toEqual(["listed", "id", "bytes-desc", "status", "source"]);
  });
  it("has distinct baseline and eviction descriptions", () => {
    expect(continuityScenarioLabel("baseline", "en")).not.toBe(continuityScenarioLabel("evict-largest", "en"));
  });
  it("has distinct oldest and largest descriptions", () => {
    expect(continuityScenarioLabel("evict-oldest", "en")).not.toBe(continuityScenarioLabel("evict-largest", "en"));
  });
  it("describes simulation without claiming a real deletion", () => {
    expect(continuityScenarioLabel("evict-largest", "en")).toContain("Simulate");
  });
  it("describes simulated source change in English", () => {
    expect(continuityScenarioLabel("source-change", "en")).toContain("source");
  });
  it("describes simulated source change in French", () => {
    expect(continuityScenarioLabel("source-change", "fr")).toContain("sources");
  });
  it("has a French label for each scenario", () => {
    for (const item of DRILL_SCENARIOS) expect(continuityScenarioLabel(item, "fr").length).toBeGreaterThan(8);
  });
  it("has an English label for each scenario", () => {
    for (const item of DRILL_SCENARIOS) expect(continuityScenarioLabel(item, "en").length).toBeGreaterThan(8);
  });
  it("has an English label for each filter", () => {
    for (const item of DRILL_FILTERS) expect(continuityFilterLabel(item, "en")).toBeTruthy();
  });
  it("has a French label for each filter", () => {
    for (const item of DRILL_FILTERS) expect(continuityFilterLabel(item, "fr")).toBeTruthy();
  });
  it("has an English label for each sort", () => {
    for (const item of DRILL_SORTS) expect(continuitySortLabel(item, "en")).toBeTruthy();
  });
  it("has a French label for each sort", () => {
    for (const item of DRILL_SORTS) expect(continuitySortLabel(item, "fr")).toBeTruthy();
  });
  it("labels an affected filter distinctly from an unaffected filter", () => {
    expect(continuityFilterLabel("affected", "en")).not.toBe(continuityFilterLabel("unaffected", "en"));
  });
  it("labels an affected filter distinctly in French", () => {
    expect(continuityFilterLabel("affected", "fr")).not.toBe(continuityFilterLabel("unaffected", "fr"));
  });
  it("preserves UNKNOWN in filter labels", () => {
    expect(continuityFilterLabel("UNKNOWN", "en")).toContain("UNKNOWN");
    expect(continuityFilterLabel("UNKNOWN", "fr")).toContain("UNKNOWN");
  });
  it("labels the saved reason", () => {
    expect(continuityReasonLabel("present", "en")).toContain("saved");
  });
  it("labels the stale reason", () => {
    expect(continuityReasonLabel("stale", "en")).toContain("Out of date");
  });
  it("labels the missing reason", () => {
    expect(continuityReasonLabel("missing", "en")).toContain("downloaded");
  });
  it("labels the unreadable reason", () => {
    expect(continuityReasonLabel("unreadable", "en")).toContain("read");
  });
  it("labels the source-conflict reason", () => {
    expect(continuityReasonLabel("inventory-conflict", "en")).toContain("conflict");
  });
  it("labels the simulated capacity reason", () => {
    expect(continuityReasonLabel("simulated-capacity", "en")).toContain("Hypothetical");
  });
  it("does not call a simulated eviction a successful deletion", () => {
    expect(continuityReasonLabel("simulated-eviction", "en")).toContain("Hypothetical");
  });
  it("provides every reason in both languages", () => {
    const values = ["present", "missing", "stale", "unreadable", "unlisted", "inventory-unavailable",
      "inventory-conflict", "invalid-manifest", "simulated-eviction", "simulated-source-change", "simulated-capacity"] as const;
    for (const value of values) {
      expect(continuityReasonLabel(value, "en")).toBeTruthy();
      expect(continuityReasonLabel(value, "fr")).toBeTruthy();
    }
  });
  it("reports missing byte estimates as UNKNOWN", () => {
    expect(continuityFormatBytes(null, "en")).toBe("UNKNOWN");
    expect(continuityFormatBytes(null, "fr")).toBe("UNKNOWN");
  });
  it("reports invalid sizes as UNKNOWN", () => {
    expect(continuityFormatBytes(-1, "fr")).toBe("UNKNOWN");
    expect(continuityFormatBytes(Number.NaN, "en")).toBe("UNKNOWN");
  });
  it("formats zero byte values", () => {
    expect(continuityFormatBytes(0, "en")).toBe("0 B");
  });
  it("formats whole bytes without assuming binary kilobytes", () => {
    expect(continuityFormatBytes(100, "en")).toBe("100 B");
  });
  it("formats large bytes in Canadian English", () => {
    expect(continuityFormatBytes(12000, "en")).toContain("12");
  });
  it("formats large bytes in Canadian French", () => {
    expect(continuityFormatBytes(12000, "fr")).toContain("12");
  });
  it("does not allow fractional byte counts", () => {
    expect(continuityFormatBytes(1.4, "fr")).toBe("UNKNOWN");
  });
  it("includes a text export button in both languages", () => {
    expect(continuityCopy("en").exportText).toContain("text");
    expect(continuityCopy("fr").exportText).toContain("texte");
  });
  it("includes a JSON export button in both languages", () => {
    expect(continuityCopy("en").exportJson).toContain("JSON");
    expect(continuityCopy("fr").exportJson).toContain("JSON");
  });
  it("labels focus-accessible pagination", () => {
    expect(continuityCopy("en").previous.length).toBeGreaterThan(0);
    expect(continuityCopy("fr").next.length).toBeGreaterThan(0);
  });
});
