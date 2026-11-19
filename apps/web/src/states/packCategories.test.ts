import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import {
  KIND_TAG_ORDER,
  UNKNOWN_KIND,
  buildKindRows,
  KIND_ORDERS,
  filterByKind,
  hiddenKindsLine,
  isKindOrder,
  limitKinds,
  sortKindRows,
  formatKindShare,
  kindKey,
  kindLabel,
  kindPercent,
  kindsLine,
  matchesKind,
  reportedShare,
  summariseKinds,
} from "./packCategories";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { lintFrench, NNBSP } from "./typography";

const TODAY = "2026-11-19";
const OSM = "OpenStreetMap, Geofabrik Ontario extract";
const dayOffset = (days: number): string => new Date(Date.UTC(2026, 10, 19) - days * 86_400_000).toISOString().slice(0, 10);
const raw = (id: string, over: Record<string, unknown> = {}, prov: Record<string, unknown> | null = {}) => ({
  id,
  name: `Place ${id}`,
  category: "cafe",
  wheelchair: "yes",
  lat: 43.65,
  lon: -79.38,
  provenance: prov === null ? null : { source_name: OSM, licence: "ODbL-1.0", retrieved_at: dayOffset(5), tier: 0, ...prov },
  ...over,
});
const parse = (items: unknown[]): PackPlaceRecord[] => [...parsePackPlaces(items).places];
const shipped = parse((JSON.parse(contentText) as { places: unknown[] }).places);

describe("kindKey", () => {
  it("ignores case, accents, underscores and repeated spaces", () => {
    expect(kindKey("fast_food")).toBe("fast food");
    expect(kindKey("Fast_Food")).toBe("fast food");
    expect(kindKey("  FAST   food ")).toBe("fast food");
    expect(kindKey("café")).toBe("cafe");
    expect(kindKey("CAFÉ")).toBe("cafe");
    expect(kindKey("fast__food")).toBe("fast food");
  });
  it("groups blank, UNKNOWN and non-text as UNKNOWN", () => {
    for (const v of [null, undefined, "", "   ", "unknown", "UNKNOWN", "Unknown", "_", " _ "]) expect(kindKey(v as string | null), String(v)).toBe(UNKNOWN_KIND);
  });
  it("does not treat a kind that merely contains the word unknown as UNKNOWN", () => {
    expect(kindKey("unknown shop")).toBe("unknown shop");
  });
  it("keeps different kinds apart", () => {
    expect(kindKey("bar")).not.toBe(kindKey("bank"));
    expect(kindKey("fast_food")).not.toBe(kindKey("food"));
  });
});

describe("kindLabel", () => {
  it("shows the pack's words with underscores read as spaces", () => {
    expect(kindLabel({ key: "fast food", spelling: "fast_food" })).toBe("fast food");
    expect(kindLabel({ key: "post office", spelling: "post_office" })).toBe("post office");
  });
  it("does not change case or invent a translation", () => {
    expect(kindLabel({ key: "cafe", spelling: "Café" })).toBe("Café");
    expect(kindLabel({ key: "pharmacy", spelling: "pharmacy" })).toBe("pharmacy");
  });
  it("uses the token UNKNOWN for the group with no kind, in every language", () => {
    expect(kindLabel({ key: UNKNOWN_KIND, spelling: null })).toBe("UNKNOWN");
    expect(kindLabel({ key: "x", spelling: null })).toBe("UNKNOWN");
  });
});

describe("buildKindRows", () => {
  it("gives no rows for no places", () => {
    expect(buildKindRows([], TODAY)).toEqual([]);
  });
  it("counts every place once and the totals add up", () => {
    const places = parse([raw("a"), raw("b", { category: "bar" }), raw("c", { category: "bar" }), raw("d", { category: null }), raw("e", { category: "pharmacy" })]);
    const rows = buildKindRows(places, TODAY);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(places.length);
    expect(rows.map((r) => [r.key, r.total])).toEqual([
      ["bar", 2],
      ["cafe", 1],
      ["pharmacy", 1],
      [UNKNOWN_KIND, 1],
    ]);
  });
  it("sorts by count, then name, and always puts UNKNOWN last even when it is the largest", () => {
    const places = parse([
      raw("a", { category: null }),
      raw("b", { category: null }),
      raw("c", { category: null }),
      raw("d", { category: "zoo" }),
      raw("e", { category: "bar" }),
    ]);
    expect(buildKindRows(places, TODAY).map((r) => r.key)).toEqual(["bar", "zoo", UNKNOWN_KIND]);
  });
  it("does not depend on the order the pack lists its places", () => {
    const items = [raw("a", { category: "bar" }), raw("b", { category: "cafe" }), raw("c", { category: "bar" }), raw("d", { category: "Cafe" })];
    const forward = buildKindRows(parse(items), TODAY);
    const reversed = buildKindRows(parse([...items].reverse()), TODAY);
    expect(reversed).toEqual(forward);
  });
  it("groups spellings that differ only by case or underscores and shows the commonest spelling", () => {
    const places = parse([
      raw("a", { category: "fast_food" }),
      raw("b", { category: "Fast_Food" }),
      raw("c", { category: "fast_food" }),
      raw("d", { category: "fast food" }),
    ]);
    const rows = buildKindRows(places, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "fast food", total: 4, spelling: "fast_food" });
  });
  it("breaks a spelling tie with the place that comes first by id", () => {
    const rows = buildKindRows(parse([raw("b", { category: "Cafe" }), raw("a", { category: "cafe" })]), TODAY);
    expect(rows[0]!.spelling).toBe("cafe");
  });
  it("counts tags per kind, with UNKNOWN as its own count", () => {
    const places = parse([
      raw("a", { wheelchair: "yes" }),
      raw("b", { wheelchair: "limited" }),
      raw("c", { wheelchair: "no" }),
      raw("d", { wheelchair: "designated" }),
      raw("e", { wheelchair: "" }),
      raw("f", { wheelchair: "maybe" }),
    ]);
    const [row] = buildKindRows(places, TODAY);
    expect(row!.byTag).toEqual({ yes: 1, limited: 1, no: 1, designated: 1, unknown: 2 });
    expect(KIND_TAG_ORDER.reduce((n, tag) => n + row!.byTag[tag], 0)).toBe(row!.total);
  });
  it("counts a tag with no source as UNKNOWN, not reported", () => {
    const [row] = buildKindRows(parse([raw("a", { wheelchair: "yes" }, null), raw("b", { wheelchair: "yes" })]), TODAY);
    expect(row).toMatchObject({ total: 2, reported: 1 });
    expect(row!.byTag).toMatchObject({ yes: 1, unknown: 1 });
  });
  it("counts places with a location, a name and an old source", () => {
    const places = parse([
      raw("a"),
      raw("b", { lat: undefined, lon: undefined }),
      raw("c", { name: "" }),
      raw("d", {}, { retrieved_at: dayOffset(400) }),
      raw("e", {}, { retrieved_at: dayOffset(365) }),
      raw("f", {}, { retrieved_at: dayOffset(366) }),
    ]);
    const [row] = buildKindRows(places, TODAY);
    expect(row).toMatchObject({ total: 6, withLocation: 5, withName: 5, stale: 2 });
  });
  it("does not call a place stale when it has no source", () => {
    const [row] = buildKindRows(parse([raw("a", {}, null)]), TODAY);
    expect(row!.stale).toBe(0);
  });
  it("never puts a place with no kind under a stated kind", () => {
    const rows = buildKindRows(parse([raw("a", { category: "UNKNOWN" }), raw("b", { category: "  " }), raw("c", { category: 7 }), raw("d", { category: "bar" })]), TODAY);
    expect(rows.map((r) => [r.key, r.total])).toEqual([["bar", 1], [UNKNOWN_KIND, 3]]);
    expect(rows.find((r) => r.key === UNKNOWN_KIND)!.spelling).toBeNull();
  });
  it("does not change the places it is given", () => {
    const places = parse([raw("b"), raw("a")]);
    const copy = JSON.stringify(places);
    buildKindRows(places, TODAY);
    expect(JSON.stringify(places)).toBe(copy);
    expect(places.map((p) => p.id)).toEqual(["b", "a"]);
  });
  it("reads the shipped pack: all places counted, nothing under a kind the pack did not state", () => {
    const rows = buildKindRows(shipped, TODAY);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(shipped.length);
    for (const row of rows) {
      const members = shipped.filter((p) => kindKey(p.category) === row.key);
      expect(row.total, row.key).toBe(members.length);
      if (row.key !== UNKNOWN_KIND) expect(members.every((p) => p.category !== null), row.key).toBe(true);
    }
  });
});

describe("matchesKind and filterByKind", () => {
  const places = parse([raw("a", { category: "bar" }), raw("b", { category: "Bar" }), raw("c", { category: "cafe" }), raw("d", { category: null })]);
  it("matches every place when the key is null", () => {
    expect(places.every((p) => matchesKind(p, null))).toBe(true);
    expect(filterByKind(places, null).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("returns a copy, not the same array", () => {
    const all = filterByKind(places, null);
    expect(all).not.toBe(places);
    expect(all).toEqual(places);
  });
  it("matches by the grouping key, so case does not matter", () => {
    expect(filterByKind(places, "bar").map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("finds places with no kind through the UNKNOWN key", () => {
    expect(filterByKind(places, UNKNOWN_KIND).map((p) => p.id)).toEqual(["d"]);
  });
  it("finds nothing for a kind that is not in the list", () => {
    expect(filterByKind(places, "museum")).toEqual([]);
  });
  it("agrees with the rows: the rows' totals equal the filter's lengths", () => {
    for (const row of buildKindRows(places, TODAY)) expect(filterByKind(places, row.key)).toHaveLength(row.total);
  });
});

describe("percentages", () => {
  it("rounds down so a group never looks fuller than it is", () => {
    expect(kindPercent(1, 3)).toBe(33);
    expect(kindPercent(2, 3)).toBe(66);
    expect(kindPercent(199, 200)).toBe(99);
    expect(kindPercent(1, 1)).toBe(100);
    expect(kindPercent(0, 5)).toBe(0);
  });
  it("is null, not 0 or 100, when nothing can be worked out", () => {
    expect(kindPercent(0, 0)).toBeNull();
    expect(kindPercent(1, 0)).toBeNull();
    expect(kindPercent(-1, 5)).toBeNull();
  });
  it("never goes over 100", () => {
    expect(kindPercent(9, 3)).toBe(100);
  });
  it("writes the token UNKNOWN for a missing share and puts a narrow no-break space before % in French", () => {
    expect(formatKindShare(null, "en")).toBe("UNKNOWN");
    expect(formatKindShare(null, "fr")).toBe("UNKNOWN");
    expect(formatKindShare(50, "en")).toBe("50%");
    expect(formatKindShare(50, "fr")).toBe(`50${NNBSP}%`);
  });
  it("reportedShare counts only tags that have a source", () => {
    const [row] = buildKindRows(parse([raw("a"), raw("b", {}, null), raw("c", { wheelchair: "" }), raw("d")]), TODAY);
    expect(reportedShare(row!)).toBe(50);
  });
});

describe("summariseKinds", () => {
  it("counts named kinds apart from the UNKNOWN group", () => {
    const rows = buildKindRows(parse([raw("a", { category: "bar" }), raw("b", { category: "cafe" }), raw("c", { category: null }), raw("d", { category: null })]), TODAY);
    const s = summariseKinds(rows);
    expect(s).toMatchObject({ kinds: 2, unknownPlaces: 2, places: 4 });
    expect(s.largest?.key).toBe("bar");
  });
  it("has no largest kind when every place has no kind", () => {
    const s = summariseKinds(buildKindRows(parse([raw("a", { category: null })]), TODAY));
    expect(s).toMatchObject({ kinds: 0, unknownPlaces: 1, places: 1, largest: null });
  });
  it("is all zero for no rows", () => {
    expect(summariseKinds([])).toEqual({ kinds: 0, unknownPlaces: 0, places: 0, largest: null });
  });
});

describe("kindsLine", () => {
  const rowsOf = (items: unknown[]) => summariseKinds(buildKindRows(parse(items), TODAY));
  it("says there is nothing to group when there are no places", () => {
    expect(kindsLine(rowsOf([]), "en")).toBe("No places to group.");
    expect(kindsLine(rowsOf([]), "fr")).toBe("Aucun lieu à regrouper.");
  });
  it("uses singular and plural", () => {
    expect(kindsLine(rowsOf([raw("a")]), "en")).toBe("1 place: 1 kind as tagged.");
    expect(kindsLine(rowsOf([raw("a"), raw("b", { category: "bar" })]), "en")).toBe("2 places: 2 kinds as tagged.");
  });
  it("mentions places with no kind and calls them UNKNOWN", () => {
    expect(kindsLine(rowsOf([raw("a"), raw("b", { category: null })]), "en")).toBe("2 places: 1 kind as tagged. 1 place has no kind (UNKNOWN).");
    expect(kindsLine(rowsOf([raw("a", { category: null }), raw("b", { category: null })]), "en")).toContain("2 places have no kind (UNKNOWN).");
  });
  it("is in French with the colon after a no-break space and the token UNKNOWN", () => {
    const line = kindsLine(rowsOf([raw("a"), raw("b", { category: null })]), "fr");
    expect(line).toBe("2 lieux : 1 type indiqué. 1 lieu n’a pas de type (UNKNOWN).");
    expect(line).not.toMatch(/INCONNU/);
    expect(lintFrench(line)).toEqual([]);
  });
  it("uses the French singular for zero and one", () => {
    expect(kindsLine(rowsOf([raw("a", { category: null })]), "fr")).toContain("0 type indiqué");
    expect(kindsLine(rowsOf([raw("a")]), "fr")).toContain("1 lieu");
  });
  it("passes the copy linter and names no organisation in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const line = kindsLine(rowsOf([raw("a"), raw("b", { category: null })]), locale);
      expect(lintCopy(line, locale), line).toEqual([]);
      expect(containsForbiddenOrg(line), line).toBe(false);
    }
  });
});

describe("sortKindRows", () => {
  const rows = buildKindRows(
    parse([
      raw("a", { category: "zoo", wheelchair: "yes" }),
      raw("b", { category: "zoo", wheelchair: "" }),
      raw("c", { category: "bar", wheelchair: "yes" }),
      raw("d", { category: "cafe", wheelchair: "" }),
      raw("e", { category: "cafe", wheelchair: "" }),
      raw("f", { category: "cafe", wheelchair: "" }),
      raw("g", { category: null }),
      raw("h", { category: null }),
      raw("i", { category: null }),
      raw("j", { category: null }),
    ]),
    TODAY,
  );
  it("knows its orders", () => {
    expect([...KIND_ORDERS]).toEqual(["count", "name", "reported"]);
    expect(isKindOrder("name")).toBe(true);
    expect(isKindOrder("size")).toBe(false);
    expect(isKindOrder("")).toBe(false);
  });
  it("keeps the count order as it is", () => {
    expect(sortKindRows(rows, "count").map((r) => r.key)).toEqual(["cafe", "zoo", "bar", UNKNOWN_KIND]);
  });
  it("sorts by name with UNKNOWN last even though it is the largest group", () => {
    expect(sortKindRows(rows, "name").map((r) => r.key)).toEqual(["bar", "cafe", "zoo", UNKNOWN_KIND]);
  });
  it("sorts by the share with a reported tag, then count, with UNKNOWN last", () => {
    expect(sortKindRows(rows, "reported").map((r) => [r.key, reportedShare(r)])).toEqual([
      ["bar", 100],
      ["zoo", 50],
      ["cafe", 0],
      [UNKNOWN_KIND, 100],
    ]);
  });
  it("sorts a share that cannot be worked out below every real share", () => {
    const empty = { ...rows[0]!, key: "ghost", total: 0, reported: 0 };
    expect(sortKindRows([empty, ...rows], "reported").map((r) => r.key).slice(-2)).toEqual(["ghost", UNKNOWN_KIND]);
  });
  it("does not change the rows it is given and is stable between calls", () => {
    const before = rows.map((r) => r.key);
    const once = sortKindRows(rows, "name");
    expect(rows.map((r) => r.key)).toEqual(before);
    expect(sortKindRows(rows, "name")).toEqual(once);
    expect(once).not.toBe(rows);
  });
  it("keeps every row", () => {
    for (const order of KIND_ORDERS) expect(sortKindRows(rows, order)).toHaveLength(rows.length);
  });
});

describe("limitKinds", () => {
  const rows = buildKindRows(
    parse([raw("a", { category: "bar" }), raw("b", { category: "bar" }), raw("c", { category: "bar" }), raw("d", { category: "cafe" }), raw("e", { category: "cafe" }), raw("f", { category: "zoo" }), raw("g", { category: null })]),
    TODAY,
  );
  it("keeps everything for a minimum of 1 and reports nothing hidden", () => {
    const l = limitKinds(rows, 1);
    expect(l.shown).toHaveLength(rows.length);
    expect(l).toMatchObject({ hiddenKinds: 0, hiddenPlaces: 0 });
  });
  it("leaves out kinds below the minimum and counts them and their places", () => {
    const l = limitKinds(rows, 2);
    expect(l.shown.map((r) => r.key)).toEqual(["bar", "cafe", UNKNOWN_KIND]);
    expect(l).toMatchObject({ hiddenKinds: 1, hiddenPlaces: 1 });
    expect(limitKinds(rows, 3).shown.map((r) => r.key)).toEqual(["bar", UNKNOWN_KIND]);
    expect(limitKinds(rows, 3)).toMatchObject({ hiddenKinds: 2, hiddenPlaces: 3 });
  });
  it("never leaves out the UNKNOWN group, however small", () => {
    expect(limitKinds(rows, 99).shown.map((r) => r.key)).toEqual([UNKNOWN_KIND]);
  });
  it("keeps the kind being shown in the list even when it is below the minimum", () => {
    expect(limitKinds(rows, 3, "zoo").shown.map((r) => r.key)).toEqual(["bar", "zoo", UNKNOWN_KIND]);
    expect(limitKinds(rows, 3, "zoo")).toMatchObject({ hiddenKinds: 1, hiddenPlaces: 2 });
  });
  it("treats a minimum below 1 or not a number as 1", () => {
    for (const min of [0, -4, Number.NaN, Number.NEGATIVE_INFINITY]) expect(limitKinds(rows, min).shown, String(min)).toHaveLength(rows.length);
    expect(limitKinds(rows, 2.9).shown).toHaveLength(3);
  });
  it("hidden places plus shown places equal all places", () => {
    for (const min of [1, 2, 3, 5]) {
      const l = limitKinds(rows, min);
      expect(l.shown.reduce((n, r) => n + r.total, 0) + l.hiddenPlaces).toBe(7);
    }
  });
});

describe("hiddenKindsLine", () => {
  const rows = buildKindRows(parse([raw("a", { category: "bar" }), raw("b", { category: "cafe" }), raw("c", { category: "zoo" }), raw("d", { category: "zoo" })]), TODAY);
  it("says nothing when nothing is hidden", () => {
    expect(hiddenKindsLine(limitKinds(rows, 1), 1, "en")).toBeNull();
  });
  it("says how many kinds and places are not shown, in the singular and plural", () => {
    expect(hiddenKindsLine(limitKinds(rows, 2), 2, "en")).toBe("2 kinds with fewer than 2 places are not shown (2 places).");
    expect(hiddenKindsLine(limitKinds(buildKindRows(parse([raw("a", { category: "bar" }), raw("b", { category: "zoo" }), raw("c", { category: "zoo" })]), TODAY), 2), 2, "en")).toBe("1 kind with fewer than 2 places is not shown (1 place).");
  });
  it("is French with the right agreement and typography", () => {
    const line = hiddenKindsLine(limitKinds(rows, 2), 2, "fr")!;
    expect(line).toBe("2 types de moins de 2 lieux ne sont pas affichés (2 lieux).");
    expect(lintFrench(line)).toEqual([]);
    expect(lintCopy(line, "fr")).toEqual([]);
  });
});
