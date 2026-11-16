import { describe, expect, it } from "vitest";
import {
  auditControls,
  describeIssues,
  formatIssue,
  labelInName,
  normalizeLabel,
} from "./index";

describe("labelInName", () => {
  it("passes when the name contains the label, ignoring case and punctuation", () => {
    expect(labelInName("Search", "search the map")).toBe(true);
    expect(labelInName("Save & close", "Save close")).toBe(true);
  });
  it("fails when the name does not contain the label", () => {
    expect(labelInName("Search", "Find places")).toBe(false);
  });
  it("matches whole words only", () => {
    expect(labelInName("Map", "Roadmap")).toBe(false);
  });
  it("treats French narrow/no-break spaces as spaces and keeps accents", () => {
    expect(normalizeLabel("Où\u202f?")).toBe("où");
    expect(labelInName("Enregistrer\u00a0:", "Enregistrer le profil")).toBe(true);
    expect(labelInName("Été", "Ete")).toBe(false);
  });
  it("returns null (unknown) for icon-only or missing data", () => {
    expect(labelInName("", "Close")).toBeNull();
    expect(labelInName("Close", undefined)).toBeNull();
  });
});

describe("auditControls", () => {
  it("flags small targets and never passes unmeasured ones", () => {
    const issues = auditControls([
      { id: "ok", visibleText: "Go", accessibleName: "Go", width: 44, height: 44 },
      { id: "small", visibleText: "Go", accessibleName: "Go", width: 43, height: 60 },
      { id: "unmeasured", visibleText: "Go", accessibleName: "Go" },
    ]);
    expect(issues).toEqual([
      { id: "small", kind: "target-too-small" },
      { id: "unmeasured", kind: "target-size-unknown" },
    ]);
  });
  it("reports both problems on one control", () => {
    const issues = auditControls([
      { id: "x", visibleText: "Send", accessibleName: "Submit", width: 20, height: 20 },
    ]);
    expect(issues.map((i) => i.kind)).toEqual(["label-not-in-name", "target-too-small"]);
  });
});

describe("messages", () => {
  it("formats FR with required typography", () => {
    const fr = formatIssue("fr", "label-not-in-name", "Chercher");
    expect(fr).toContain("Commande vocale\u00a0:");
    expect(fr).toContain("«\u202fChercher\u202f»");
    expect(fr).toContain("l’étiquette");
    expect(fr).not.toContain("'");
  });
  it("describes issues in both locales", () => {
    const c = [{ id: "a", visibleText: "Go", accessibleName: "Go", width: 10, height: 10 }];
    expect(describeIssues(c, "en")[0]).toContain("smaller than 44 px");
    expect(describeIssues(c, "fr")[0]).toContain("inférieure à 44\u00a0px");
  });
});
