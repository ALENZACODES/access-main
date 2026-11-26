import { describe, expect, it } from "vitest";
import { DEFAULT_SAME_NAME_FILTER, displayName, pickLabel, DEFAULT_SAME_NAME_LIMIT, DEFAULT_SAME_NAME_ORDER, DEFAULT_SAME_NAME_SIZE, SAME_NAME_FILTERS, SAME_NAME_LIMITS, SAME_NAME_ORDERS, SAME_NAME_SIZES, buildSameName, isSameNameFilter, isSameNameLimit, isSameNameOrder, isSameNameSize, listSameName, nameKey, sameNamePage } from "./sameName";
import { bare, place, varied } from "./placeFixtures";

const at = (id: string, name: string | null, lon: number, over: Record<string, unknown> = {}) => place(id, { name, lat: 43.65, lon, ...over });
const FROM = { lat: 43.65, lon: -79.4 };
const ids = (g: { members: readonly { id: string }[] }) => g.members.map((m) => m.id);

describe("nameKey", () => {
  it("ignores case, accents, punctuation and spacing", () => {
    expect(nameKey("Café  Léa")).toBe("cafe lea");
    expect(nameKey("CAFE LEA")).toBe("cafe lea");
    expect(nameKey("Cafe, Lea.")).toBe("cafe lea");
    expect(nameKey("Tim Hortons")).toBe(nameKey("tim  hortons"));
  });
  it("ignores a branch number and a bracketed note", () => {
    expect(nameKey("Tim Hortons #1234")).toBe("tim hortons");
    expect(nameKey("Tim Hortons # 12")).toBe("tim hortons");
    expect(nameKey("Tim Hortons (Union Station)")).toBe("tim hortons");
    expect(nameKey("Tim Hortons #12 (rear)")).toBe("tim hortons");
  });
  it("keeps a number that is part of the name", () => {
    expect(nameKey("Studio 54")).toBe("studio 54");
    expect(nameKey("Station 2")).not.toBe(nameKey("Station 3"));
  });
  it("keeps the apostrophe, whichever kind", () => {
    expect(nameKey("L’Église")).toBe(nameKey("L'Eglise"));
    expect(nameKey("Joe's")).not.toBe(nameKey("Joes"));
  });
  it("is null for a name that cannot be compared", () => {
    for (const n of [null, "", "   ", "UNKNOWN", "A", "#12", "(note)", "x".repeat(121)]) expect(nameKey(n), String(n)).toBeNull();
  });
  it("keeps a two-character name and drops a one-character one", () => {
    expect(nameKey("Jo")).toBe("jo");
    expect(nameKey("J")).toBeNull();
    expect(nameKey("J.")).toBeNull();
  });
  it("a branch number between two words keeps them apart", () => {
    expect(nameKey("Ab#1Cd")).toBe("ab cd");
    expect(nameKey("Ab (x)Cd")).toBe("ab cd");
    expect(nameKey("Ab #12A")).toBe("ab");
    expect(nameKey("Ab #12 A")).toBe("ab a");
  });
  it("keeps letters of other scripts", () => {
    expect(nameKey("Ünï — Café")).toBe("uni cafe");
    expect(nameKey("書店 本")).toBe("書店 本");
  });
});

describe("displayName", () => {
  it("drops the branch number and the bracketed note, and keeps the spelling", () => {
    expect(displayName("Tim Hortons #1234")).toBe("Tim Hortons");
    expect(displayName("Café Léa (rear)")).toBe("Café Léa");
    expect(displayName("  Studio   54 ")).toBe("Studio 54");
  });
  it("gives the name back when nothing would be left", () => {
    expect(displayName("#12")).toBe("#12");
    expect(displayName("(note)")).toBe("(note)");
  });
  it("makes the label of a group free of branch numbers", () => {
    const g = buildSameName([at("a", "Tim #1", 1), at("b", "Tim #2", 2), at("c", "Tim (rear)", 3)], null).groups[0]!;
    expect(g.label).toBe("Tim");
  });
});

describe("pickLabel", () => {
  it("prefers the spelling written most often", () => expect(pickLabel(["Shop", "SHOP", "Shop"], "en")).toBe("Shop"));
  it("on a tie prefers a mixed-case spelling over all capitals or all small letters", () => {
    expect(pickLabel(["SHOP", "Shop"], "en")).toBe("Shop");
    expect(pickLabel(["shop", "Shop"], "en")).toBe("Shop");
    expect(pickLabel(["Shop", "shop"], "en")).toBe("Shop");
  });
  it("then goes by name order, the same whichever way round", () => {
    expect(pickLabel(["Beta Shop", "Alpha Shop"], "en")).toBe("Alpha Shop");
    expect(pickLabel(["Alpha Shop", "Beta Shop"], "en")).toBe("Alpha Shop");
  });
});

describe("choices", () => {
  it("recognise only their own values and have the defaults first or named", () => {
    expect([...SAME_NAME_ORDERS]).toEqual(["count", "name", "nearest"]);
    expect([...SAME_NAME_SIZES]).toEqual([2, 3, 5]);
    expect([...SAME_NAME_FILTERS]).toEqual(["all", "differ"]);
    expect([...SAME_NAME_LIMITS]).toEqual([5, 10, 25]);
    expect([DEFAULT_SAME_NAME_ORDER, DEFAULT_SAME_NAME_SIZE, DEFAULT_SAME_NAME_FILTER, DEFAULT_SAME_NAME_LIMIT]).toEqual(["count", 2, "all", 10]);
    for (const v of SAME_NAME_ORDERS) expect(isSameNameOrder(v)).toBe(true);
    for (const v of SAME_NAME_SIZES) expect(isSameNameSize(v)).toBe(true);
    for (const v of SAME_NAME_FILTERS) expect(isSameNameFilter(v)).toBe(true);
    for (const v of SAME_NAME_LIMITS) expect(isSameNameLimit(v)).toBe(true);
    for (const v of [4, "2", null, 0]) {
      expect(isSameNameSize(v)).toBe(false);
      expect(isSameNameLimit(v)).toBe(false);
    }
    for (const v of ["", "nearest ", "Count", 1]) expect(isSameNameOrder(v)).toBe(false);
    expect(isSameNameFilter("some")).toBe(false);
  });
});

describe("buildSameName", () => {
  const ps = [at("a1", "Tim Hortons", -79.39, { wheelchair: "yes" }), at("a2", "TIM HORTONS #55", -79.41, { wheelchair: "no" }), at("a3", "Tim Hortons (Union)", -79.3), at("b1", "Library", -79.4), at("b2", "library", -79.35), at("c1", "Lonely Bakery", -79.2), bare("x"), at("n1", null, -79.1), at("n2", "UNKNOWN", -79.1)];
  const r = buildSameName(ps, FROM);
  it("groups by name key, counts the rest, and sets the unnamed aside", () => {
    expect(r.groups.map((g) => g.key)).toEqual(["library", "tim hortons"]);
    expect(r.alone).toBe(1);
    expect(r.unnamed).toBe(3);
    expect(r.groups.reduce((n, g) => n + g.members.length, 0) + r.alone + r.unnamed).toBe(ps.length);
  });
  it("orders members closest first and measures in whole metres", () => {
    const tim = r.groups.find((g) => g.key === "tim hortons")!;
    expect(ids(tim)).toEqual(["a1", "a2", "a3"]);
    expect(tim.members.every((m) => Number.isInteger(m.metres))).toBe(true);
    expect(tim.nearestMetres).toBe(tim.members[0]!.metres);
  });
  it("uses the most common spelling as the label", () => {
    const g = buildSameName([at("a", "Corner Shop", 1), at("b", "Corner Shop", 2), at("c", "CORNER SHOP", 3)], null).groups[0]!;
    expect(g.label).toBe("Corner Shop");
  });
  it("breaks a label tie by name order", () => {
    const g = buildSameName([at("a", "corner shop", 1), at("b", "Corner Shop", 2)], null).groups[0]!;
    expect(["corner shop", "Corner Shop"]).toContain(g.label);
    expect(buildSameName([at("b", "Corner Shop", 2), at("a", "corner shop", 1)], null).groups[0]!.label).toBe(g.label);
  });
  it("says when the tags differ", () => {
    expect(r.groups.find((g) => g.key === "tim hortons")!.tagsDiffer).toBe(true);
    expect(r.groups.find((g) => g.key === "library")!.tagsDiffer).toBe(false);
  });
  it("has no distances without a point, and orders members by address then id", () => {
    const g = buildSameName([at("z", "Shop", 1, { address: "9 B St" }), at("y", "Shop", 2, { address: "10 A St" }), at("x", "Shop", 3, { address: "10 A St" })], null).groups[0]!;
    expect(g.nearestMetres).toBeNull();
    expect(g.members.every((m) => m.metres === null)).toBe(true);
    expect(ids(g)).toEqual(["z", "x", "y"]);
  });
  it("puts a member with no map point last and still measures the others", () => {
    const g = buildSameName([at("a", "Shop", -79.3), { ...at("b", "Shop", 0), location: null }, at("c", "Shop", -79.39)], FROM).groups[0]!;
    expect(ids(g)).toEqual(["c", "a", "b"]);
    expect(g.members[2]!.metres).toBeNull();
    expect(g.nearestMetres).toBe(g.members[0]!.metres);
  });
  it("has a null nearest when nothing in the group could be measured", () => {
    const g = buildSameName([{ ...at("a", "Shop", 0), location: null }, { ...at("b", "Shop", 0), location: null }], FROM).groups[0]!;
    expect(g.nearestMetres).toBeNull();
  });
  it("makes no group of places that only look alike", () => {
    expect(buildSameName([at("a", "Station 2", 1), at("b", "Station 3", 2)], null).groups).toEqual([]);
    expect(buildSameName([at("a", "Joe's", 1), at("b", "Joes", 2)], null).groups).toEqual([]);
  });
  it("does not depend on the order the places come in", () => {
    expect(buildSameName([...ps].reverse(), FROM)).toEqual(r);
  });
  it("does not change its input", () => {
    const copy = [...ps];
    buildSameName(ps, FROM);
    expect(ps).toEqual(copy);
  });
  it("handles an empty list", () => expect(buildSameName([], FROM)).toEqual({ groups: [], alone: 0, unnamed: 0 }));
});

describe("listSameName", () => {
  const ps = [
    at("t1", "Tim", -79.399, { wheelchair: "yes" }), at("t2", "Tim", -79.3), at("t3", "Tim", -79.2), at("t4", "Tim", -79.1),
    at("l1", "Library", -79.41, { wheelchair: "no" }), at("l2", "Library", -79.0, { wheelchair: "yes" }), at("l3", "Library", -79.0),
    at("a1", "Alpha", -79.4001), at("a2", "Alpha", -79.5),
  ];
  const r = buildSameName(ps, FROM);
  const keys = (o: "count" | "name" | "nearest", s: 2 | 3 | 5 = 2, f: "all" | "differ" = "all") => listSameName(r, o, s, f, "en").map((g) => g.key);
  it("count: the largest group first, ties by name", () => expect(keys("count")).toEqual(["tim", "library", "alpha"]));
  it("name: alphabetical", () => expect(keys("name")).toEqual(["alpha", "library", "tim"]));
  it("nearest: the group with the closest member first", () => expect(keys("nearest")).toEqual(["alpha", "tim", "library"]));
  it("size: leaves out smaller groups", () => {
    expect(keys("count", 3)).toEqual(["tim", "library"]);
    expect(keys("count", 5)).toEqual([]);
  });
  it("differ: only groups whose tags differ", () => {
    expect(keys("name", 2, "differ")).toEqual(["library"]);
  });
  it("nearest with no point falls back to name order", () => {
    const none = buildSameName(ps, null);
    expect(listSameName(none, "nearest", 2, "all", "en").map((g) => g.key)).toEqual(["alpha", "library", "tim"]);
  });
  it("puts a group with no measurable member after one that has", () => {
    const x = buildSameName([{ ...at("a", "Aaa", 0), location: null }, { ...at("b", "Aaa", 0), location: null }, at("c", "Zzz", -79.3), at("d", "Zzz", -79.2)], FROM);
    expect(listSameName(x, "nearest", 2, "all", "en").map((g) => g.key)).toEqual(["zzz", "aaa"]);
  });
  it("does not change the groups it is given", () => {
    const before = JSON.stringify(r);
    keys("nearest");
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe("sameNamePage", () => {
  const gs = buildSameName(varied(3, 200), null).groups;
  it("takes the first groups and counts the rest", () => {
    const p = sameNamePage(gs, 2);
    expect(p.groups).toEqual(gs.slice(0, 2));
    expect(p.more).toBe(Math.max(0, gs.length - 2));
  });
  it("copes with a limit of zero, a negative or fractional one, and a large one", () => {
    expect(sameNamePage(gs, 0)).toEqual({ groups: [], more: gs.length });
    expect(sameNamePage(gs, -4).groups).toEqual([]);
    expect(sameNamePage(gs, 1.9).groups).toHaveLength(Math.min(1, gs.length));
    expect(sameNamePage(gs, 1e6)).toEqual({ groups: gs, more: 0 });
  });
});
