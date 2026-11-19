import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import { auditPackPlaces, type PackIssue, type PackIssueCode } from "./packAudit";
import { MAX_SAMPLE_IDS, PACK_ISSUE_CODES, auditSummary, groupIssues, groupLine, issueMessage, severityLabel } from "./packIssueText";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const issue = (code: PackIssueCode, index: number, id: string | null, severity: "error" | "warning" = "error"): PackIssue => ({ code, index, id, severity });
const good = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Place ${id}`,
  wheelchair: "yes",
  lat: 43.65,
  lon: -79.38,
  provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 },
  ...over,
});

describe("issueMessage", () => {
  it("has English and French wording for every code the audit can produce", () => {
    const bad = [
      null,
      { id: "" },
      good("a"),
      good("a"),
      good("b", { name: "" }),
      good("c", { lat: 999 }),
      good("d", { wheelchair: "maybe" }),
      good("e", { provenance: { licence: "ODbL-1.0", retrieved_at: "2026-11-10" } }),
      good("f", { provenance: null }),
      good("g", { provenance: { source_name: "X", licence: "All-rights-reserved", retrieved_at: "2026-11-10" } }),
      good("h", { provenance: { source_name: "X", licence: "ODbL-1.0", retrieved_at: "yesterday" } }),
      good("i", { provenance: { source_name: "X", licence: "ODbL-1.0", retrieved_at: "2027-01-01" } }),
      good("j", { provenance: { source_name: "X", licence: "ODbL-1.0", retrieved_at: "2026-11-10", source_url: "javascript:alert(1)" } }),
    ];
    const seen = new Set(auditPackPlaces(bad, TODAY).issues.map((i) => i.code));
    expect(seen.size).toBeGreaterThanOrEqual(10);
    for (const code of seen) {
      expect(PACK_ISSUE_CODES, code).toContain(code);
      expect(issueMessage(code, "en"), code).not.toBe("");
      expect(issueMessage(code, "fr"), code).not.toBe(issueMessage(code, "en"));
    }
  });
  it("covers every code once, with no code missing from the list", () => {
    expect(new Set(PACK_ISSUE_CODES).size).toBe(PACK_ISSUE_CODES.length);
    expect(PACK_ISSUE_CODES).toHaveLength(13);
  });
  it("passes the copy linter, French typography and the organisation ban in both languages", () => {
    for (const code of PACK_ISSUE_CODES) {
      for (const locale of ["en", "fr"] as const) {
        const line = issueMessage(code, locale);
        expect(lintCopy(line, locale), `${locale} ${code}`).toEqual([]);
        expect(containsForbiddenOrg(line), `${locale} ${code}`).toBe(false);
      }
      expect(lintFrench(issueMessage(code, "fr")), code).toEqual([]);
    }
  });
  it("keeps UNKNOWN as the token in French where a value is unknown", () => {
    expect(issueMessage("missing-name", "fr")).toContain("UNKNOWN");
    expect(issueMessage("bad-coordinates", "fr")).toContain("UNKNOWN");
    expect(issueMessage("tag-unrecognised", "fr")).not.toMatch(/INCONNU/);
  });
  it("never says a record is verified or current", () => {
    for (const code of PACK_ISSUE_CODES) for (const locale of ["en", "fr"] as const) expect(issueMessage(code, locale)).not.toMatch(/verif|vérif|current|à jour|guarantee/i);
  });
});

describe("groupIssues", () => {
  it("counts repeats of a code in one group", () => {
    const g = groupIssues([issue("missing-name", 0, "a", "warning"), issue("missing-name", 4, "e", "warning"), issue("missing-name", 6, "g", "warning")]);
    expect(g).toEqual([{ code: "missing-name", severity: "warning", count: 3, sampleIds: ["a", "e", "g"], sampleIndexes: [0, 4, 6] }]);
  });
  it("lists errors before warnings and keeps a fixed order inside each", () => {
    const g = groupIssues([issue("missing-name", 1, "b", "warning"), issue("duplicate-id", 2, "a"), issue("bad-coordinates", 3, "c", "warning"), issue("bad-id", 0, null)]);
    expect(g.map((x) => x.code)).toEqual(["bad-id", "duplicate-id", "missing-name", "bad-coordinates"]);
  });
  it("caps the sample but keeps the full count", () => {
    const many = Array.from({ length: 12 }, (_, i) => issue("duplicate-id", i, `id${i}`));
    const [g] = groupIssues(many);
    expect(g!.count).toBe(12);
    expect(g!.sampleIds).toHaveLength(MAX_SAMPLE_IDS);
    expect(g!.sampleIndexes).toEqual([0, 1, 2, 3, 4]);
  });
  it("leaves out a missing id from the ids but still gives its position", () => {
    const [g] = groupIssues([issue("not-an-object", 7, null), issue("not-an-object", 9, null)]);
    expect(g!.sampleIds).toEqual([]);
    expect(g!.sampleIndexes).toEqual([7, 9]);
  });
  it("is empty for no issues", () => {
    expect(groupIssues([])).toEqual([]);
  });
  it("does not change the issues it is given", () => {
    const input = [issue("bad-id", 0, null)];
    const copy = JSON.parse(JSON.stringify(input));
    groupIssues(input);
    expect(input).toEqual(copy);
  });
});

describe("groupLine, severityLabel and auditSummary", () => {
  it("puts the count before the sentence", () => {
    const [g] = groupIssues([issue("missing-name", 0, "a", "warning"), issue("missing-name", 1, "b", "warning")]);
    expect(groupLine(g!, "en")).toBe("2 × A record has no name, so it is shown with the name UNKNOWN.");
    expect(groupLine(g!, "fr").startsWith("2 × Une fiche n’a pas de nom")).toBe(true);
  });
  it("names the two severities", () => {
    expect([severityLabel("error", "en"), severityLabel("warning", "en")]).toEqual(["Needs attention", "Gap"]);
    expect([severityLabel("error", "fr"), severityLabel("warning", "fr")]).toEqual(["À corriger", "Lacune"]);
  });
  it("summarises an empty, a clean and a mixed result without claiming the data is right", () => {
    expect(auditSummary({ checked: 0, issues: [], errors: 0, warnings: 0, clean: true }, "en")).toBe("No entries to check.");
    const clean = auditSummary({ checked: 4, issues: [], errors: 0, warnings: 0, clean: true }, "en");
    expect(clean).toContain("No problem found in 4 entries.");
    expect(clean).toContain("says nothing about whether what they report is right");
    expect(auditSummary({ checked: 9, issues: [], errors: 1, warnings: 2, clean: false }, "en")).toBe("1 problem and 2 gaps found in 9 entries.");
    expect(auditSummary({ checked: 9, issues: [], errors: 2, warnings: 1, clean: false }, "fr")).toBe("2 problèmes et 1 lacune repérés dans 9 entrées.");
  });
  it("uses French typography in the summaries", () => {
    for (const r of [{ checked: 0, issues: [], errors: 0, warnings: 0, clean: true }, { checked: 4, issues: [], errors: 0, warnings: 0, clean: true }, { checked: 3, issues: [], errors: 1, warnings: 1, clean: false }]) {
      expect(lintFrench(auditSummary(r, "fr"))).toEqual([]);
    }
  });
});
