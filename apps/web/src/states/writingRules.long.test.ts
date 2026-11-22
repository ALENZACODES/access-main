import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { place } from "./placeFixtures";
import { wrHitLine, wrRuleLabel } from "./writingCopy";
import { writingToCsv, writingToText } from "./writingExport";
import { buildWritingReport, filterWriting } from "./writingReport";
import { lintFrench } from "./typography";
import { LONG_NAME, WRITING_RULES, addressHits, fieldOfRule, nameHits } from "./writingRules";

const rules = (hits: readonly { rule: string }[]) => hits.map((h) => h.rule);
const named = (n: number) => `${"Alpha ".repeat(Math.ceil(n / 6))}`.slice(0, n).trim().padEnd(n, "x");

describe("the very-long-name rule", () => {
  it("notices a name over the limit and not one at it", () => {
    expect(rules(nameHits("x".repeat(LONG_NAME + 1), null))).toContain("name-very-long");
    expect(rules(nameHits("x".repeat(LONG_NAME), null))).not.toContain("name-very-long");
  });
  it("counts characters, not code units", () => {
    expect(rules(nameHits("😀".repeat(LONG_NAME), null))).not.toContain("name-very-long");
    expect(rules(nameHits("😀".repeat(LONG_NAME + 1), null))).toContain("name-very-long");
  });
  it("does not read addresses", () => expect(rules(addressHits("1 " + "Main ".repeat(30) + "Street"))).toEqual([]));
  it("is quiet for a name that is not there", () => expect(nameHits(null, null)).toEqual([]));
  it("is in the field of names, with the other name rules", () => {
    expect(fieldOfRule("name-very-long")).toBe("name");
    const names = WRITING_RULES.filter((r) => r.startsWith("name-"));
    expect(WRITING_RULES.slice(0, names.length)).toEqual(names);
    expect(names).toContain("name-very-long");
  });
  it("has a limit the pack can reach, since the pack keeps up to 200 characters of a name", () => expect(LONG_NAME).toBeLessThan(200));
});

describe("the very-long-name rule on pack places", () => {
  const long = named(LONG_NAME + 20);
  it("shows up in the report and can be filtered to", () => {
    const f = buildWritingReport([place("a", { name: long, address: "1 Main Street" }), place("b", { name: "Beta Hall", address: "2 Main Street" })]).findings;
    expect(f.map((x) => x.id)).toEqual(["a"]);
    expect(filterWriting(f, "name-very-long").map((x) => x.id)).toEqual(["a"]);
    expect(filterWriting(f, "name-all-lower")).toEqual([]);
  });
  it("is found for a name that the pack cut at its own limit", () => {
    const f = buildWritingReport([place("a", { name: "Word ".repeat(80), address: "1 Main Street" })]).findings;
    expect(f[0]!.hits.map((h) => h.rule)).toContain("name-very-long");
  });
  it("is not found for a name just under the limit", () => expect(buildWritingReport([place("a", { name: named(LONG_NAME - 1), address: "1 Main Street" })]).findings.flatMap((x) => rules(x.hits))).not.toContain("name-very-long"));
  it("goes into the CSV and the text in both languages", () => {
    const f = buildWritingReport([place("a", { name: long, address: "1 Main Street" })]).findings;
    expect(writingToCsv(f, "en")).toContain("name-very-long");
    expect(writingToText(f, "en")).toContain("The name is very long.");
    expect(writingToText(f, "fr")).toContain("Le nom est très long.");
  });
});

describe("the very-long-name wording", () => {
  it("passes the lint in both languages", () => {
    for (const l of ["en", "fr"] as const) {
      for (const s of [wrRuleLabel("name-very-long", l), wrHitLine({ rule: "name-very-long", seen: null }, l)]) {
        expect(lintCopy(s, l), s).toEqual([]);
        if (l === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    }
  });
  it("says what it saw without calling it wrong", () => expect(wrHitLine({ rule: "name-very-long", seen: null }, "en")).not.toMatch(/wrong|incorrect|should/i));
});
