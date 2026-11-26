import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PACK_SORTS, comparePlaces, runsAreContiguous, sortPlaces, sortRuns } from "./packSort";
import { orderedToCsv, orderedToText } from "./packSortCopy";
import { buildOrderTable } from "./packSortKeys";
import { parsePackPlaces } from "./packPlaces";
import { lintFrench } from "./typography";

const places = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places).places;
const ids = (xs: readonly { id: string }[]) => xs.map((p) => p.id);

describe("the shipped pack in every order", () => {
  it("has places to order", () => expect(places.length).toBeGreaterThan(5));
  for (const sort of PACK_SORTS) {
    it(`${sort}: lists every place once`, () => {
      const r = sortPlaces(places, sort);
      expect(ids(r).slice().sort()).toEqual(ids(places).slice().sort());
    });
    it(`${sort}: is the same whichever way the pack is read`, () => {
      expect(ids(sortPlaces([...places].reverse(), sort))).toEqual(ids(sortPlaces(places, sort)));
    });
    it(`${sort}: every adjacent pair is in order`, () => {
      const cmp = comparePlaces(sort, null);
      const r = sortPlaces(places, sort);
      for (let i = 0; i + 1 < r.length; i++) expect(cmp(r[i]!, r[i + 1]!)).toBeLessThanOrEqual(0);
    });
    it(`${sort}: the groups are contiguous and add up`, () => {
      const r = sortPlaces(places, sort);
      const runs = sortRuns(r, sort, "en");
      if (sort === "default") return expect(runs).toEqual([]);
      expect(runsAreContiguous(runs)).toBe(true);
      expect(runs.reduce((n, x) => n + x.count, 0)).toBe(places.length);
    });
    it(`${sort}: the table, text and CSV match the list`, () => {
      const r = sortPlaces(places, sort);
      const t = buildOrderTable(r, sort, "en");
      expect(t.rows.map((x) => x.id)).toEqual(ids(r));
      expect(orderedToCsv(r, "en").trimEnd().split("\r\n")).toHaveLength(r.length + 1);
      expect(orderedToText(r, sort, "en").split("\n").filter((l) => /^\d+\. /.test(l))).toHaveLength(r.length);
    });
  }
  it("name order is alphabetical in the shipped pack", () => {
    const names = sortPlaces(places, "name").map((p) => (p.name ?? "").toLowerCase());
    const named = names.filter((n) => n !== "");
    expect(named).toEqual([...named].sort((a, b) => a.localeCompare(b)));
  });
  it("name-desc is name order reversed, apart from an unnamed place (places that share a name keep id order)", () => {
    const names = (s: "name" | "name-desc") => sortPlaces(places, s).filter((p) => p.name !== null).map((p) => p.name);
    expect(names("name-desc")).toEqual(names("name").slice().reverse());
  });
  it("the French file is clean outside place names", () => {
    const text = orderedToText(sortPlaces(places, "kind"), "kind", "fr");
    expect(lintFrench(text.split("\n").slice(0, 5).join("\n"))).toEqual([]);
  });
});
