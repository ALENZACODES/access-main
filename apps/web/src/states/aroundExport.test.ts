import { describe, expect, it } from "vitest";
import { AROUND_CSV_FILENAMES, AROUND_CSV_HEADER, AROUND_TEXT_FILENAMES, aroundToCsv, aroundToText, csvDirection, csvTag } from "./aroundExport";
import { at, crossroads } from "./aroundFixtures";
import { lintCopy } from "./copyLint";
import { parseCsv, undoFormulaGuard } from "./csvParse";
import { OSM_CREDIT } from "./dataCredits";
import { buildAround } from "./aroundSearch";
import { filterAround, NO_AROUND_FILTER } from "./aroundFilter";
import type { Locale } from "./stateCopy";

function ok(radius = 250, list = crossroads(), id = "centre") {
  const r = buildAround(list, id, radius);
  if (r.status !== "ok") throw new Error("expected ok");
  return r;
}
function rows(csv: string): string[][] {
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.rows.map((r) => [...r]);
}

describe("file names", () => {
  it("has a text and a CSV name in each language", () => {
    expect(AROUND_TEXT_FILENAMES).toEqual({ en: "places-around-a-place.txt", fr: "lieux-autour-d-un-lieu.txt" });
    expect(AROUND_CSV_FILENAMES).toEqual({ en: "places-around-a-place.csv", fr: "lieux-autour-d-un-lieu.csv" });
  });
});

describe("tokens", () => {
  it("writes tags as fixed English tokens and a missing tag as UNKNOWN", () => {
    expect((["yes", "limited", "no", "designated", "unknown"] as const).map(csvTag)).toEqual(["yes", "limited", "no", "designated", "UNKNOWN"]);
  });
  it("writes directions as short English tokens and the same spot as SAME_SPOT", () => {
    expect(csvDirection({ direction: "SW" })).toBe("SW");
    expect(csvDirection({ direction: null })).toBe("SAME_SPOT");
  });
});

describe("aroundToCsv", () => {
  it("has the header, then one row per shown place", () => {
    const r = ok();
    const out = rows(aroundToCsv(r, r.members));
    expect(out[0]).toEqual([...AROUND_CSV_HEADER]);
    expect(out).toHaveLength(1 + r.members.length);
  });
  it("fills each column from the place and the centre", () => {
    const r = ok();
    const [, first] = rows(aroundToCsv(r, r.members));
    expect(first).toEqual(["centre", "Centre Hall", "250", "n", "North Cafe", "no", "cafe", "1 Main Street", "80", "N"]);
  });
  it("rounds distance to whole metres", () => {
    const r = ok(250, [at("c", 0, 0), at("x", 33.4, 0)], "c");
    expect(rows(aroundToCsv(r, r.members))[1]![8]).toBe("33");
  });
  it("writes UNKNOWN for a missing name, kind or address, never a blank", () => {
    const r = ok(250, [at("c", 0, 0, { name: null }), at("x", 20, 0, { name: null, category: null, address: null, wheelchair: null })], "c");
    const [, row] = rows(aroundToCsv(r, r.members));
    expect(row).toEqual(["c", "UNKNOWN", "250", "x", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "20", "N"]);
  });
  it("writes only the places given, so a narrowed list gives a narrower file", () => {
    const r = ok();
    const narrowed = filterAround(r.members, { ...NO_AROUND_FILTER, tags: ["no"] });
    expect(rows(aroundToCsv(r, narrowed))).toHaveLength(2);
  });
  it("is just the header with no places", () => {
    const r = ok();
    expect(rows(aroundToCsv(r, []))).toEqual([[...AROUND_CSV_HEADER]]);
  });
  it("uses CRLF line ends and can start with a byte order mark", () => {
    const r = ok();
    const plain = aroundToCsv(r, r.members);
    expect(plain.startsWith("﻿")).toBe(false);
    expect(plain.endsWith("\r\n")).toBe(true);
    expect(plain.split("\r\n").length).toBe(2 + r.members.length);
    expect(aroundToCsv(r, r.members, { bom: true }).startsWith("﻿")).toBe(true);
  });
  it("keeps commas, quotes and line breaks inside a cell", () => {
    const r = ok(250, [at("c", 0, 0), at("x", 20, 0, { name: 'Tom, "Dick" & Harry' })], "c");
    expect(rows(aroundToCsv(r, r.members))[1]![4]).toBe('Tom, "Dick" & Harry');
  });
  it("guards a cell a spreadsheet could read as a formula, and the guard comes off on reading", () => {
    const r = ok(250, [at("c", 0, 0), at("x", 20, 0, { name: "=SUM(A1)" }), at("y", 30, 0, { name: "@cmd" }), at("z", 40, 0, { name: "-1+1" })], "c");
    const out = rows(aroundToCsv(r, r.members));
    for (const row of out.slice(1)) expect(row[4]!.startsWith("'")).toBe(true);
    expect(out.slice(1).map((row) => undoFormulaGuard(row[4]!))).toEqual(["=SUM(A1)", "@cmd", "-1+1"]);
  });
  it("round-trips every shown place's id, tag and distance", () => {
    const r = ok(1000);
    const out = rows(aroundToCsv(r, r.members)).slice(1);
    expect(out.map((row) => row[3])).toEqual(r.members.map((m) => m.id));
    expect(out.map((row) => Number(row[8]))).toEqual(r.members.map((m) => Math.round(m.metres)));
  });
  it("has no point of the person's, only places of the pack", () => {
    const text = aroundToCsv(ok(), ok().members);
    expect(text).not.toMatch(/lat|lon|\d\d\.\d{4}/i);
  });
});

describe("aroundToText", () => {
  const texts = (locale: Locale, filtered = false) => {
    const r = ok();
    return aroundToText(r, r.members, filtered, locale);
  };
  it("starts with the centre, then the summary and the straight-line caveat", () => {
    const [head, blank, summary, caveat] = texts("en").split("\n");
    expect(head).toBe("Places around Centre Hall");
    expect(blank).toBe("");
    expect(summary).toContain("4 places listed within 250");
    expect(caveat).toContain("does not say the way between the two");
  });
  it("lists each place with distance, direction, tag, kind and address", () => {
    const text = texts("en");
    expect(text).toContain("1. North Cafe");
    expect(text).toMatch(/Distance and direction: 80.m to the north \(N\)/);
    expect(text).toContain("Wheelchair tag: No");
    expect(text).toContain("Kind: cafe");
    expect(text).toContain("Address: 1 Main Street");
  });
  it("numbers the places in the order given", () => {
    const r = ok();
    const text = aroundToText(r, [...r.members].reverse(), false, "en");
    expect(text.indexOf("1. West Bar")).toBeGreaterThan(-1);
    expect(text.indexOf("4. North Cafe")).toBeGreaterThan(text.indexOf("1. West Bar"));
  });
  it("writes UNKNOWN for a tag the pack does not give", () => {
    expect(texts("en")).toContain("Wheelchair tag: UNKNOWN");
  });
  it("leaves out a kind or address the pack does not give instead of printing a blank", () => {
    const r = ok(250, [at("c", 0, 0), at("x", 20, 0, { category: null, address: null })], "c");
    const text = aroundToText(r, r.members, false, "en");
    expect(text).not.toContain("Kind:");
    expect(text).not.toContain("Address:");
  });
  it("says how many places lie beyond and how many have no map point", () => {
    const text = texts("en");
    expect(text).toContain("1 more place with a map point lies farther than 250");
    expect(text).toContain("1 place has no map point, so it is left out.");
  });
  it("mentions the filters when the list was narrowed", () => {
    expect(texts("en", true)).toContain("shown after your filters");
    expect(texts("en", false)).not.toContain("shown after your filters");
  });
  it("says there is nothing to list when nothing is shown", () => {
    const r = ok();
    expect(aroundToText(r, [], true, "en")).toContain("No places to list.");
    expect(aroundToText(r, [], true, "fr")).toContain("Aucun lieu à lister.");
  });
  it("ends with the OpenStreetMap credit exactly once and a final newline", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = texts(locale);
      expect(text.split(OSM_CREDIT)).toHaveLength(2);
      expect(text.endsWith(`${OSM_CREDIT}\n`)).toBe(true);
    }
  });
  it("is French with French spacing in the French file", () => {
    const text = texts("fr");
    expect(text).toContain("Lieux autour de Centre Hall");
    expect(text).toMatch(/Distance et direction\u00a0: 80\u00a0m au nord \(N\)/);
    expect(text).toMatch(/Indication pour fauteuil roulant\u00a0: Non/);
    expect(text).toMatch(/Genre\u00a0: cafe/);
  });
  it("passes the copy rules line by line in both languages", () => {
    for (const locale of ["en", "fr"] as const) for (const line of texts(locale).split("\n")) expect(lintCopy(line, locale), line).toEqual([]);
  });
  it("does not write INCONNU in the French file", () => {
    expect(texts("fr")).not.toMatch(/inconnu/i);
  });
});
