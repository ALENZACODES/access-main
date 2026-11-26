import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";
import * as c from "./writingCopy";
import { WRITING_FILTER_GROUPS, WRITING_ORDERS } from "./writingReport";
import { WRITING_RULES, type RuleHit } from "./writingRules";
import { STREET_TYPE_PAIRS, type StyleMix } from "./writingStyle";

const mix = (long: string, minority: "short" | "long", shortCount = 1, longCount = 3): StyleMix => ({ long, shortCount, longCount, minority, ids: ["x"] });
const hit = (rule: RuleHit["rule"]): RuleHit => ({ rule, seen: "seen text" });

function lines(l: Locale): string[] {
  return [
    c.wrHeading(l), c.wrToggle(true, l), c.wrToggle(false, l), c.wrIntro(l), c.wrCoverage(1, 0, l), c.wrCoverage(5, 0, l), c.wrCoverage(5, 1, l), c.wrCoverage(5, 2, l),
    c.wrSummary(0, l), c.wrSummary(1, l), c.wrSummary(3, l), c.wrNoMatch(l), c.wrFilterGroup(l), c.wrOrderGroup(l), c.wrNoName(l), c.wrNoAddress(l),
    c.wrStyleLine(mix("street", "short"), l), c.wrStyleLine(mix("avenue", "long", 3, 1), l), c.wrStyleSummary({ mixes: [] }, l), c.wrStyleSummary({ mixes: [mix("street", "short")] }, l),
    c.wrStyleSummary({ mixes: [mix("street", "short"), mix("avenue", "short")] }, l), c.wrMoreLine(1, l), c.wrMoreLine(4, l), c.wrCaveat(l), c.wrSaveText(l), c.wrSaveCsv(l), c.wrSavedLine("x.csv", l), c.wrCannotSave(l),
    ...WRITING_RULES.flatMap((r) => [c.wrRuleLabel(r, l), c.wrHitLine(hit(r), l)]), ...WRITING_FILTER_GROUPS.map((f) => c.wrFilterLabel(f, l)), ...WRITING_ORDERS.map((o) => c.wrOrderLabel(o, l)),
  ].filter((x) => x !== "");
}

describe("wording copy", () => {
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("labels every rule, filter and order differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(WRITING_RULES.map((r) => c.wrRuleLabel(r, l))).size).toBe(WRITING_RULES.length);
      expect(new Set(WRITING_FILTER_GROUPS.map((f) => c.wrFilterLabel(f, l))).size).toBe(WRITING_FILTER_GROUPS.length);
      expect(new Set(WRITING_ORDERS.map((o) => c.wrOrderLabel(o, l))).size).toBe(WRITING_ORDERS.length);
    }
  });
  it("describes every rule's hit in a different sentence", () => {
    for (const l of ["en", "fr"] as const) expect(new Set(WRITING_RULES.map((r) => c.wrHitLine(hit(r), l))).size).toBe(WRITING_RULES.length);
  });
  it("quotes the text it saw, with French quotation marks in French", () => {
    expect(c.wrHitLine({ rule: "name-contact", seen: "416-555-0123" }, "en")).toBe("The name contains what looks like a phone number or web address: “416-555-0123”.");
    expect(c.wrHitLine({ rule: "name-contact", seen: "416-555-0123" }, "fr")).toBe("Le nom contient ce qui ressemble à un numéro de téléphone ou à une adresse web\u00a0: «\u202f416-555-0123\u202f».");
  });
  it("never calls the text wrong", () => {
    for (const l of ["en", "fr"] as const) for (const line of lines(l)) expect(line.toLowerCase(), line).not.toMatch(/\b(wrong|incorrect|error:|fix this|must be)\b|incorrect|erroné|faux/);
  });
  it("says it is not a list of mistakes", () => {
    expect(c.wrCaveat("en")).toMatch(/Not a list of mistakes/);
    expect(c.wrIntro("en")).toMatch(/not mistakes/);
  });
  it("agrees in number", () => {
    expect(c.wrSummary(1, "en")).toBe("1 place has wording worth a look.");
    expect(c.wrSummary(2, "en")).toBe("2 places have wording worth a look.");
    expect(c.wrSummary(2, "fr")).toBe("2 lieux ont une rédaction à examiner.");
    expect(c.wrCoverage(1, 1, "en")).toBe("1 place has a name or an address to read; 1 has neither.");
    expect(c.wrCoverage(3, 2, "en")).toBe("3 places have a name or an address to read; 2 have neither.");
  });
  it("says which form this address uses and how many use each", () => {
    expect(c.wrStyleLine(mix("street", "short"), "en")).toBe("This address uses “St”, as 1 of 4 street addresses of this type do; 3 write “Street”.");
    expect(c.wrStyleLine(mix("avenue", "long", 3, 1), "en")).toBe("This address uses “Avenue”, as 1 of 4 street addresses of this type do; 3 write “Ave”.");
  });
  it("can write the style line for every street type", () => {
    for (const p of STREET_TYPE_PAIRS) for (const m of ["short", "long"] as const) expect(c.wrStyleLine(mix(p.long, m), "en")).toMatch(/This address uses/);
  });
  it("has file names in both languages and a header with seven columns", () => {
    expect(c.WR_CSV_NAME.en).not.toBe(c.WR_CSV_NAME.fr);
    expect(c.WR_TEXT_NAME.fr).toMatch(/\.txt$/);
    expect(c.WR_CSV_HEADER).toHaveLength(7);
  });
});
