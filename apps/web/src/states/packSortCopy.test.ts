import { describe, expect, it } from "vitest";
import { PACK_SORT_CSV_FILENAMES, PACK_SORT_FILENAMES, orderedToCsv, orderedToText, packSortHelp, packSortLabel, packSortNotRanking, packSortStatus, sortRunLine } from "./packSortCopy";
import { PACK_SORTS, sortPlaces, sortRuns } from "./packSort";
import { PROV, place } from "./placeFixtures";
import { lintFrench } from "./typography";

const on = (date: string) => ({ ...PROV, retrieved_at: date });
const ps = [
  place("a", { name: "Alpha", category: "fast_food", address: "5 Main Street", wheelchair: "yes", provenance: on("2026-01-05") }),
  place("b", { name: null, category: null, address: null, wheelchair: null, provenance: null }),
  place("c", { name: 'Say "hi", ok', category: "cafe", address: "1 A Street; rear", wheelchair: "no", provenance: on("2026-02-10") }),
];

describe("labels and help", () => {
  it("every order has a distinct English and French label", () => {
    const en = PACK_SORTS.map((s) => packSortLabel(s, "en"));
    const fr = PACK_SORTS.map((s) => packSortLabel(s, "fr"));
    expect(new Set(en).size).toBe(8);
    expect(new Set(fr).size).toBe(8);
    for (let i = 0; i < 8; i++) expect(fr[i]).not.toBe(en[i]);
  });
  it("every help line says what happens to a missing value, in both languages", () => {
    for (const s of PACK_SORTS) {
      expect(packSortHelp(s, "en")).toMatch(/last|after/);
      expect(packSortHelp(s, "fr")).toMatch(/dernier|après/);
    }
  });
  it("the tag help names the order of the tags", () => {
    expect(packSortHelp("tag", "en")).toContain("Yes, Limited, No, Designated");
    expect(packSortHelp("tag", "fr")).toContain("Oui, Limité, Non, Désigné");
  });
  it("French labels and help pass the French typography check", () => {
    for (const s of PACK_SORTS) {
      expect(lintFrench(packSortLabel(s, "fr")), s).toEqual([]);
      expect(lintFrench(packSortHelp(s, "fr")), s).toEqual([]);
    }
    expect(lintFrench(packSortNotRanking("fr"))).toEqual([]);
  });
  it("says an order is not a ranking", () => {
    expect(packSortNotRanking("en")).toMatch(/does not say that one place is better or easier/);
    expect(packSortNotRanking("fr")).toMatch(/meilleur ou plus facile/);
  });
});

describe("status and run lines", () => {
  it("names the order and counts the places, singular and plural", () => {
    expect(packSortStatus("name", 3, "en")).toBe("Ordered by: Name, A to Z. 3 places.");
    expect(packSortStatus("kind", 1, "en")).toBe("Ordered by: Kind of place. 1 place.");
    expect(packSortStatus("name", 2, "fr")).toBe("Ordre\u00a0: Nom, de A à Z. 2 lieux.");
    expect(packSortStatus("name", 1, "fr")).toBe("Ordre\u00a0: Nom, de A à Z. 1 lieu.");
  });
  it("writes a run as label, colon and count", () => {
    expect(sortRunLine({ label: "Cafe", count: 2, ids: ["x", "y"] }, "en")).toBe("Cafe: 2 places");
    expect(sortRunLine({ label: "Cafe", count: 1, ids: ["x"] }, "fr")).toBe("Cafe\u00a0: 1 lieu");
  });
});

describe("text file", () => {
  const text = orderedToText(sortPlaces(ps, "name"), "name", "en");
  it("has a title, the status, the help, the not-a-ranking line and a numbered line per place", () => {
    const lines = text.trimEnd().split("\n");
    expect(lines[0]).toBe("Places in order");
    expect(lines[2]).toBe("Ordered by: Name, A to Z. 3 places.");
    expect(lines.filter((l) => /^\d+\. /.test(l))).toHaveLength(3);
    expect(text).toContain("does not say that one place is better");
  });
  it("numbers in the shown order and writes UNKNOWN for what the pack does not state", () => {
    expect(text).toContain("1. Alpha; fast food; 5 Main Street; Yes");
    expect(text).toContain("3. UNKNOWN; UNKNOWN; UNKNOWN; UNKNOWN");
  });
  it("is French with the narrow no-break space before the semicolon", () => {
    const fr = orderedToText(sortPlaces(ps, "name"), "name", "fr");
    expect(fr).toContain("1. Alpha\u202f; fast food\u202f; 5 Main Street\u202f; Oui");
    expect(fr).toContain("Ordre\u00a0: Nom, de A à Z. 3 lieux.");
  });
  it("is the same text whatever the order, for the same places", () => {
    for (const s of PACK_SORTS) expect(orderedToText(sortPlaces(ps, s), s, "en").split("\n").filter((l) => /^\d+\./.test(l))).toHaveLength(3);
  });
});

describe("CSV file", () => {
  const csv = orderedToCsv(sortPlaces(ps, "name"), "en");
  const lines = csv.replace(/^\ufeff/, "").trimEnd().split("\r\n");
  it("starts with a byte order mark, then a header", () => {
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(lines[0]).toBe("Position,Place,Id,Kind,Address,Wheelchair tag,Retrieved");
  });
  it("has a row per place with the position first", () => {
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("1,Alpha,a,fast food,5 Main Street,Yes,2026-01-05");
    expect(lines.map((l) => l.split(",")[0])).toEqual(["Position", "1", "2", "3"]);
  });
  it("writes UNKNOWN where the pack states nothing", () => expect(lines[3]).toBe("3,UNKNOWN,b,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN"));
  it("quotes a name with a comma and a quote", () => expect(lines[2]).toContain('"Say ""hi"", ok"'));
  it("the date is ISO so a spreadsheet can sort it", () => {
    for (const l of lines.slice(1)) expect(l.split(",").at(-1)).toMatch(/^(\d{4}-\d{2}-\d{2}|UNKNOWN)$/);
  });
  it("French header", () => expect(orderedToCsv(ps, "fr")).toContain("Position,Lieu,Identifiant,Type,Adresse,Étiquette fauteuil roulant,Consulté"));
  it("defuses a name that a spreadsheet would read as a formula", () => {
    const evil = [place("e", { name: "=HYPERLINK(1)" })];
    expect(orderedToCsv(evil, "en")).toContain("'=HYPERLINK(1)");
  });
});

describe("file names and runs together", () => {
  it("are plain", () => {
    expect(PACK_SORT_FILENAMES).toEqual({ en: "places-in-order.txt", fr: "lieux-en-ordre.txt" });
    expect(PACK_SORT_CSV_FILENAMES).toEqual({ en: "places-in-order.csv", fr: "lieux-en-ordre.csv" });
  });
  it("run lines for every order read as text without stray characters", () => {
    for (const s of PACK_SORTS.filter((x) => x !== "default")) {
      for (const r of sortRuns(sortPlaces(ps, s), s, "en")) expect(sortRunLine(r, "en")).toMatch(/^[^\n]+: \d+ places?$/);
    }
  });
});
