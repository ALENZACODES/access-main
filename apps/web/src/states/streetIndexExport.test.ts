import { describe, expect, it } from "vitest";
import { bare, place, varied } from "./placeFixtures";
import { buildStreetIndex } from "./streetIndex";
import { STREET_CSV_FILENAMES, STREET_TEXT_FILENAMES, streetIndexToCsv, streetIndexToText } from "./streetIndexExport";
import { lintFrench } from "./typography";

const at = (id: string, address: string | null, over: Record<string, unknown> = {}) => place(id, { name: `Place ${id}`, address, ...over });
const list = [at("a", "279 Yonge St"), at("b", "281 Yonge Street", { wheelchair: null }), at("c", "Unit 2, 100 Dundas Square", { wheelchair: "no" }), at("f", "PO Box 9"), at("g", "King & Bay"), bare("h"), at("i", "279 Yonge Street")];
const d = buildStreetIndex(list, "en", "name");
const rows = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter((l) => l !== "");

describe("file names", () => {
  it("differ by language", () => {
    expect(STREET_TEXT_FILENAMES).toEqual({ en: "places-by-street.txt", fr: "lieux-par-rue.txt" });
    expect(STREET_CSV_FILENAMES).toEqual({ en: "places-by-street.csv", fr: "lieux-par-rue.csv" });
  });
});

describe("streetIndexToText", () => {
  const text = streetIndexToText(d, "en");
  it("starts with a title, the summary and the caveat", () => {
    const l = text.split("\n");
    expect(l[0]).toBe("Places by street");
    expect(l[2]).toBe("4 of 7 places have an address that reads as one street, on 2 streets.");
    expect(text).toContain("does not tell you which side of the street");
  });
  it("has a block for each street with each place by number", () => {
    expect(text).toContain("\nYonge Street: 3 places, 1 with the wheelchair tag UNKNOWN\n- 279 (odd): Place a — ");
    expect(text).toContain("- 281 (odd): Place b — UNKNOWN\n");
  });
  it("writes a unit when there is one and even for an even number", () => {
    expect(text).toContain("- 100 (even), Unit 2: Place c — ");
  });
  it("says when places share a number and street, without calling them the same place", () => {
    expect(text).toContain("Same number and street for 2 places here.");
    expect(text).not.toMatch(/duplicate/i);
  });
  it("lists the places set apart with their ids", () => {
    expect(text).toContain("No address (UNKNOWN): h\n");
    expect(text).toContain("Post office box: f\n");
    expect(text).toContain("Corner of two streets: g\n");
  });
  it("leaves out the set-aside lists when asked for chosen streets only", () => {
    const one = streetIndexToText(d, "en", ["yonge street"]);
    expect(one).toContain("Yonge Street:");
    expect(one).not.toContain("Dundas Square:");
    expect(one).not.toContain("Post office box");
  });
  it("gives no street block for a key that is not in the index", () => {
    expect(streetIndexToText(d, "en", ["nope street"])).not.toMatch(/ places?\n-/);
  });
  it("uses LF only and ends with exactly one", () => {
    expect(text).not.toContain("\r");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
  it("is French with spaced colons and the token UNKNOWN", () => {
    const fr = streetIndexToText(d, "fr");
    expect(fr.split("\n")[0]).toBe("Lieux par rue");
    expect(fr).toContain("\nYonge Street\u00a0: 3 lieux, 1 avec l’étiquette fauteuil roulant UNKNOWN\n- 279 (impair)\u00a0: Place a — ");
    expect(fr).toContain("Aucune adresse (UNKNOWN)\u00a0: h");
    expect(fr).toContain("Case postale\u00a0: f");
    expect(fr).not.toMatch(/INCONN/i);
    for (const l of fr.split("\n").filter((x) => /^(Lieux|Les rues|Aucune|Case|Coin|Même)/.test(x))) expect(lintFrench(l), l).toEqual([]);
  });
  it("writes UNKNOWN for a place with no name", () => {
    const x = buildStreetIndex([at("a", "1 Main St", { name: null }), at("b", "2 Main St")], "en");
    expect(streetIndexToText(x, "en")).toContain("- 1 (odd): UNKNOWN — ");
  });
  it("writes UNKNOWN for a number a street entry does not have", () => {
    const x = buildStreetIndex([at("a", "Main Street"), at("b", "2 Main St")], "en");
    expect(streetIndexToText(x, "en")).toContain("- UNKNOWN: Place a — ");
  });
});

describe("streetIndexToCsv", () => {
  const csv = streetIndexToCsv(d, "en");
  it("begins with a byte order mark and a header, and ends with CRLF", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows(csv)[0]).toBe("Street,Number,Odd or even,Unit,Place,Place id,Wheelchair tag,Address as given");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("has one row for each place on a street, and none for the set-aside ones", () => {
    expect(rows(csv)).toHaveLength(1 + 4);
    expect(csv).not.toContain(",f,");
    expect(csv).not.toContain(",h,");
  });
  it("writes street, number, odd or even, unit, place, id, tag and the address as given", () => {
    const row = rows(csv).find((r) => r.includes(",c,"))!;
    expect(row).toBe("Dundas Square,100,even,Unit 2,Place c,c,No,\"Unit 2, 100 Dundas Square\"");
  });
  it("writes UNKNOWN where a part is missing", () => {
    const x = buildStreetIndex([at("a", "Main Street", { name: null, wheelchair: null })], "en");
    expect(rows(streetIndexToCsv(x, "en"))[1]).toBe("Main Street,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,a,UNKNOWN,Main Street");
  });
  it("is French with the French header and words", () => {
    const fr = streetIndexToCsv(d, "fr");
    expect(rows(fr)[0]).toBe("Rue,Numéro,Pair ou impair,Unité,Lieu,Identifiant du lieu,Étiquette fauteuil roulant,Adresse telle que donnée");
    expect(fr).toContain(",impair,");
    expect(fr).toContain(",pair,");
    expect(fr).not.toMatch(/INCONN/i);
  });
  it("quotes names with commas and quotes, and defuses a formula", () => {
    const x = buildStreetIndex([at("a", "1 Main St", { name: 'A, "B"' }), at("b", "3 Main St", { name: "=SUM(A1)" })], "en", "name");
    const out = rows(streetIndexToCsv(x, "en"));
    expect(out[1]).toContain('"A, ""B"""');
    expect(out[2]).toContain("'=SUM(A1)");
  });
  it("has a row for every place on a street in generated lists", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = buildStreetIndex(varied(seed, 25), "en");
      expect(rows(streetIndexToCsv(g, "en"))).toHaveLength(1 + g.onStreet);
    }
  });
  it("keeps each row on one line even when a name has a line break", () => {
    const x = buildStreetIndex([at("a", "1 Main St", { name: "Line\nbreak" })], "en");
    expect(rows(streetIndexToCsv(x, "en"))).toHaveLength(2);
  });
});
