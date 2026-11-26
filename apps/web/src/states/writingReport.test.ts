import { describe, expect, it } from "vitest";
import { bare, lcg, place, varied } from "./placeFixtures";
import { DEFAULT_WRITING_ORDER, WRITING_FILTER_GROUPS, WRITING_ORDERS, buildWritingReport, filterWriting, isWritingFilter, isWritingOrder, noticed, orderWriting, ruleTally } from "./writingReport";
import { WRITING_RULES } from "./writingRules";

const p = (id: string, name: string | null, address: string | null) => place(id, { name, address });
const sample = () => [
  p("a", "CITY LIBRARY", "1 Main Street"),
  p("b", "Alpha Hall", "2 Oak Street"),
  p("c", "Beta 416-555-0123", "3 Elm Street, Toronto, ON"),
  p("d", "Gamma", "4 Pine St"),
  p("e", "Delta Delta", null),
  bare("f"),
];

describe("buildWritingReport", () => {
  it("lists the places where something was noticed, in pack order", () => {
    expect(buildWritingReport(sample()).findings.map((f) => f.id)).toEqual(["a", "c", "d", "e"]);
  });
  it("counts places looked at and places with nothing to read", () => {
    const r = buildWritingReport(sample());
    expect(r.checked).toBe(5);
    expect(r.nothingToRead).toBe(1);
  });
  it("counts hits per rule", () => {
    const r = buildWritingReport(sample());
    expect(r.byRule["name-all-capitals"]).toBe(1);
    expect(r.byRule["name-contact"]).toBe(1);
    expect(r.byRule["address-province"]).toBe(1);
    expect(r.byRule["name-repeated-word"]).toBe(1);
    expect(r.byRule["address-postal-code"]).toBe(0);
  });
  it("has a count for every rule", () => expect(Object.keys(buildWritingReport([]).byRule).sort()).toEqual([...WRITING_RULES].sort()));
  it("points at the less common street-type form", () => {
    const r = buildWritingReport(sample());
    expect(r.styleMinority).toBe(1);
    expect(r.findings.find((f) => f.id === "d")!.styleMix).toMatchObject({ long: "street", minority: "short" });
    expect(r.mixes).toHaveLength(1);
  });
  it("is empty for no places", () => expect(buildWritingReport([])).toMatchObject({ findings: [], checked: 0, nothingToRead: 0, styleMinority: 0 }));
  it("keeps the original text of the name and the address", () => {
    const f = buildWritingReport(sample()).findings[0]!;
    expect([f.name, f.address]).toEqual(["CITY LIBRARY", "1 Main Street"]);
  });
  it("counts every place once as looked at or with nothing to read", () => {
    const ps = varied(9, 200);
    const r = buildWritingReport(ps);
    expect(r.checked + r.nothingToRead).toBe(ps.length);
    expect(r.findings.length).toBeLessThanOrEqual(r.checked);
  });
  it("gives the same findings in any order of the list", () => {
    const rand = lcg(3);
    const ps = varied(4, 80).sort(() => rand() - 0.5);
    const a = buildWritingReport(ps).findings.map((f) => f.id).sort();
    const b = buildWritingReport([...ps].reverse()).findings.map((f) => f.id).sort();
    expect(a).toEqual(b);
  });
});

describe("filterWriting", () => {
  const f = buildWritingReport(sample()).findings;
  it("keeps everything for all", () => expect(filterWriting(f, "all")).toHaveLength(4));
  it("keeps places with a hit about the name", () => expect(filterWriting(f, "names").map((x) => x.id)).toEqual(["a", "c", "e"]));
  it("keeps places with a hit about the address", () => expect(filterWriting(f, "addresses").map((x) => x.id)).toEqual(["c"]));
  it("keeps places that use the less common street-type form", () => expect(filterWriting(f, "style").map((x) => x.id)).toEqual(["d"]));
  it("keeps places with one rule", () => expect(filterWriting(f, "name-contact").map((x) => x.id)).toEqual(["c"]));
  it("knows its filters and orders", () => {
    for (const g of WRITING_FILTER_GROUPS) expect(isWritingFilter(g)).toBe(true);
    for (const r of WRITING_RULES) expect(isWritingFilter(r)).toBe(true);
    expect(isWritingFilter("x")).toBe(false);
    for (const o of WRITING_ORDERS) expect(isWritingOrder(o)).toBe(true);
    expect(isWritingOrder(2)).toBe(false);
    expect(WRITING_ORDERS).toContain(DEFAULT_WRITING_ORDER);
  });
});

describe("orderWriting", () => {
  const f = buildWritingReport(sample()).findings;
  it("puts the places with the most noticed first, then by name", () => {
    expect(noticed(f.find((x) => x.id === "c")!)).toBe(2);
    expect(orderWriting(f, "most").map((x) => x.id)).toEqual(["c", "a", "e", "d"]);
  });
  it("orders by name, unnamed last", () => {
    const withUnnamed = [...f, ...buildWritingReport([p("g", null, "KING STREET WEST")]).findings];
    expect(orderWriting(withUnnamed, "name").map((x) => x.id)).toEqual(["c", "a", "e", "d", "g"]);
  });
  it("keeps pack order for pack and does not change its input", () => {
    const copy = [...f];
    expect(orderWriting(f, "pack").map((x) => x.id)).toEqual(["a", "c", "d", "e"]);
    for (const o of WRITING_ORDERS) orderWriting(f, o);
    expect(f).toEqual(copy);
  });
});

describe("ruleTally", () => {
  it("lists only the rules that noticed something, most first", () => {
    const t = ruleTally(buildWritingReport([p("a", "AAAAA BBBBB", null), p("b", "CCCCC DDDDD", null), p("c", "x 416-555-0123", null)]));
    expect(t).toEqual([{ rule: "name-all-capitals", count: 2, field: "name" }, { rule: "name-contact", count: 1, field: "name" }]);
  });
  it("is empty when nothing was noticed", () => expect(ruleTally(buildWritingReport([p("a", "Alpha Hall", "1 Main Street")]))).toEqual([]));
});
