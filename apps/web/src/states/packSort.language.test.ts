import { describe, expect, it } from "vitest";
import { PACK_SORTS, THEN_SORTS, cleanThen, sortPlaces, sortRuns } from "./packSort";
import { orderedToCsv, orderedToText, packSortHelp, packSortLabel, packSortStatus, sortRunLine } from "./packSortCopy";
import { buildOrderTable, orderTableNote, sortKeyHeading } from "./packSortKeys";
import { PROV, place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";

const places = [
  place("a", { name: "X", category: "cafe", address: "5 Main Street", wheelchair: "yes", provenance: { ...PROV, retrieved_at: "2026-01-05" } }),
  place("b", { name: "Y", category: null, address: null, wheelchair: null, provenance: null }),
];

describe("every order and every second order, in words", () => {
  for (const first of PACK_SORTS) {
    for (const second of [null, ...THEN_SORTS]) {
      const label = `${first} then ${second ?? "nothing"}`;
      const then = cleanThen(first, second);
      it(`${label}: the English status is one sentence with a count`, () => {
        const s = packSortStatus(first, 2, "en", then);
        expect(s).toMatch(/^Ordered by: .+\. 2 places\.$/);
        expect(s).not.toMatch(/undefined|null|\[object/);
        expect(then === null || s.includes(", then ")).toBe(true);
      });
      it(`${label}: the French status passes the typography check and has no English word`, () => {
        const s = packSortStatus(first, 1, "fr", then);
        expect(lintFrench(s)).toEqual([]);
        expect(s).toMatch(/^Ordre\u00a0: /);
        expect(s).not.toMatch(/\b(Ordered|then|place|places)\b/);
        expect(s.endsWith("1 lieu.")).toBe(true);
      });
    }
  }
});

describe("everything written for a reader is plain", () => {
  it("no label, help or heading has a double space, a leading space or a stray symbol", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const s of PACK_SORTS) {
        for (const text of [packSortLabel(s, locale), packSortHelp(s, locale), sortKeyHeading(s, locale)]) {
          expect(text, `${s} ${locale}`).toBe(text.trim());
          expect(text).not.toMatch(/ {2,}|[<>{}[\]]/);
        }
      }
    }
  });
  it("the files for every order have the same number of lines as places, plus their fixed top and header", () => {
    const data = varied(5, 20);
    for (const s of PACK_SORTS) {
      const r = sortPlaces(data, s);
      expect(orderedToCsv(r, "en").trimEnd().split("\r\n")).toHaveLength(21);
      expect(orderedToText(r, s, "en").trimEnd().split("\n")).toHaveLength(6 + 20);
    }
  });
  it("group lines for a long pack stay short", () => {
    const data = varied(8, 60);
    for (const s of PACK_SORTS.filter((x) => x !== "default")) {
      for (const run of sortRuns(sortPlaces(data, s), s, "en")) expect(sortRunLine(run, "en").length).toBeLessThan(200);
    }
  });
  it("the cut note is empty or one sentence", () => {
    const cut = buildOrderTable(varied(2, 30), "name", "en", 5);
    expect(orderTableNote(cut, "en")).toMatch(/^Showing the first 5 of 30 places\. The saved files hold all of them\.$/);
    expect(orderTableNote(buildOrderTable(places, "name", "en"), "en")).toBe("");
    expect(lintFrench(orderTableNote(cut, "fr"))).toEqual([]);
  });
});
