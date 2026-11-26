import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { DEFAULT_NAME_ORDER, NAME_FILTERS, NAME_ORDERS, buildNameReport, filterNames, isNameFilter, isNameOrder, kindsFor, orderNames, sharesOf } from "./nameLanguageReport";

const p = (id: string, name: string | null, over: Record<string, unknown> = {}) => place(id, { name, ...over });
const set = () => [
  p("a", "Bibliothèque municipale", { category: "library" }),
  p("b", "Public Library", { category: "library" }),
  p("c", "Tim Hortons", { category: "cafe" }),
  p("d", "Bibliothèque / Library", { category: "library" }),
  p("e", "Café Zoé", { category: "cafe" }),
  p("f", "北京图书馆", { category: "library" }),
  p("g", null, { category: "cafe" }),
  p("h", "Parc des Lilas", { category: "park" }),
];

describe("buildNameReport", () => {
  const r = buildNameReport(set());
  it("has a row for every place, in pack order", () => expect(r.rows.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]));
  it("counts each reading", () => {
    expect(r.byReading).toEqual({ french: 2, english: 1, both: 1, neither: 2, "other-script": 1, "no-name": 1 });
  });
  it("counts the named places", () => expect(r.named).toBe(7));
  it("counts accented names that point to no language", () => expect(r.accentedOnly).toBe(1));
  it("counts pairs", () => expect(r.pairs).toBe(1));
  it("keeps the name and address as the pack gives them", () => {
    expect(r.rows[0]).toMatchObject({ name: "Bibliothèque municipale", address: "1 Main Street" });
    expect(r.rows[6]!.name).toBeNull();
  });
  it("labels the kind as the pack spells it, UNKNOWN when it gives none", () => {
    expect(r.rows[0]!.kind).toBe("library");
    const u = buildNameReport([p("z", "X", { category: null })]);
    expect(u.rows[0]!.kind).toBe("UNKNOWN");
  });
  it("is empty for no places", () => {
    const e = buildNameReport([]);
    expect(e.rows).toEqual([]);
    expect(e.named).toBe(0);
    expect(Object.values(e.byReading).every((n) => n === 0)).toBe(true);
  });
  it("adds up: readings sum to the number of places", () => expect(Object.values(r.byReading).reduce((a, b) => a + b, 0)).toBe(8));
});

describe("filterNames", () => {
  const rows = buildNameReport(set()).rows;
  const ids = (f: Parameters<typeof filterNames>[1]) => filterNames(rows, f).map((x) => x.id);
  it("leaves out places with no name for all", () => expect(ids("all")).toEqual(["a", "b", "c", "d", "e", "f", "h"]));
  it("filters to a reading", () => {
    expect(ids("french")).toEqual(["a", "h"]);
    expect(ids("english")).toEqual(["b"]);
    expect(ids("both")).toEqual(["d"]);
    expect(ids("neither")).toEqual(["c", "e"]);
    expect(ids("other-script")).toEqual(["f"]);
    expect(ids("no-name")).toEqual(["g"]);
  });
  it("filters to pairs", () => expect(ids("pairs")).toEqual(["d"]));
  it("filters to accented names that point to no language", () => expect(ids("accented")).toEqual(["e"]));
  it("accepts only its own filters", () => {
    for (const f of NAME_FILTERS) expect(isNameFilter(f)).toBe(true);
    for (const bad of ["", "French", "no-name", null, 3, undefined]) expect(isNameFilter(bad)).toBe(false);
  });
});

describe("orderNames", () => {
  const rows = filterNames(buildNameReport(set()).rows, "all");
  it("keeps pack order", () => expect(orderNames(rows, "pack").map((x) => x.id)).toEqual(rows.map((x) => x.id)));
  it("orders by name, ignoring case and accents", () => expect(orderNames(rows, "name").map((x) => x.id)).toEqual(["d", "a", "e", "h", "b", "c", "f"]));
  it("orders by reading in the reading list order, then by name", () => expect(orderNames(rows, "reading").map((x) => x.id)).toEqual(["a", "h", "b", "d", "e", "c", "f"]));
  it("does not change the list it was given", () => {
    const copy = [...rows];
    orderNames(rows, "name");
    expect(rows).toEqual(copy);
  });
  it("has pack as the default and accepts only its own orders", () => {
    expect(DEFAULT_NAME_ORDER).toBe("pack");
    for (const o of NAME_ORDERS) expect(isNameOrder(o)).toBe(true);
    expect(isNameOrder("most")).toBe(false);
  });
  it("breaks a tie by id", () => {
    const tie = buildNameReport([p("b", "Same"), p("a", "Same")]).rows;
    expect(orderNames(tie, "name").map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("kindsFor", () => {
  const rows = buildNameReport(set()).rows;
  it("lists the kinds of the places that read a given way, most first", () => {
    expect(kindsFor(rows, "french")).toEqual([{ kind: "library", count: 1 }, { kind: "park", count: 1 }]);
    expect(kindsFor(rows, "neither")).toEqual([{ kind: "cafe", count: 2 }]);
  });
  it("is empty when no place reads that way", () => expect(kindsFor(buildNameReport([p("a", "Tim")]).rows, "french")).toEqual([]));
  it("stops at the limit", () => expect(kindsFor(rows, "french", 1)).toHaveLength(1));
});

describe("sharesOf", () => {
  it("gives whole percents that add up to 100", () => {
    const s = sharesOf(buildNameReport(set()));
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(100);
    expect(s["no-name"]).toBe(0);
  });
  it("gives zeros when nothing is named", () => expect(Object.values(sharesOf(buildNameReport([p("a", null)]))).every((n) => n === 0)).toBe(true));
  it("rounds so thirds add up", () => {
    const s = sharesOf({ named: 3, byReading: { french: 1, english: 1, both: 0, neither: 1, "other-script": 0, "no-name": 0 } });
    expect(s.french + s.english + s.neither).toBe(100);
    expect(Math.max(s.french, s.english, s.neither)).toBe(34);
  });
  it("gives all to one reading when all names read one way", () => expect(sharesOf({ named: 4, byReading: { french: 4, english: 0, both: 0, neither: 0, "other-script": 0, "no-name": 0 } }).french).toBe(100));
});
