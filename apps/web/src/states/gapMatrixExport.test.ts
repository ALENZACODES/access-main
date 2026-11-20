import { describe, expect, it } from "vitest";
import { buildGapMatrix } from "./gapMatrix";
import { GAP_CSV_FILENAMES, gapMatrixToCsv } from "./gapMatrixExport";
import { bare, place, varied } from "./placeFixtures";

const TODAY = "2026-11-19";
const rows = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter((l) => l !== "");

describe("gapMatrixToCsv", () => {
  const m = buildGapMatrix([place("a"), bare("z")], "en", TODAY);
  const csv = gapMatrixToCsv(m, "en");
  it("begins with a byte order mark so a spreadsheet reads the accents", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
  it("has a header, one row per place, and ends with CRLF", () => {
    expect(rows(csv)).toHaveLength(3);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("has the header the table has, plus a count", () => {
    expect(rows(csv)[0]).toBe("Place,Id,Name,Wheelchair tag,Kind,Address,Map point,Source,Licence,Retrieved,Tier,Details given");
  });
  it("writes Given or UNKNOWN for each detail and the count", () => {
    expect(rows(csv)[1]).toBe("Place a,a,Given,Given,Given,Given,Given,Given,Given,Given,Given,9");
    expect(rows(csv)[2]).toBe("Name UNKNOWN,z,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,0");
  });
  it("has the same number of cells in every row", () => {
    const out = gapMatrixToCsv(buildGapMatrix(varied(8, 30), "en", TODAY), "en");
    const counts = new Set(rows(out).map((l) => l.match(/("[^"]*"|[^,]*)(,|$)/g)!.length));
    expect(counts.size).toBe(1);
  });
  it("quotes a name with a comma or a quote", () => {
    const out = gapMatrixToCsv(buildGapMatrix([place("a", { name: 'A, "B"' }), place("b")], "en", TODAY), "en");
    expect(rows(out)[1]!.startsWith('"A, ""B""",a,')).toBe(true);
  });
  it("defuses a name that a spreadsheet would read as a formula", () => {
    const out = gapMatrixToCsv(buildGapMatrix([place("a", { name: "=SUM(A1)" }), place("b")], "en", TODAY), "en");
    expect(rows(out)[1]!.startsWith("'=SUM(A1),a,")).toBe(true);
  });
  it("is French in French, with the French file name", () => {
    const fr = gapMatrixToCsv(buildGapMatrix([place("a"), place("b")], "fr", TODAY), "fr");
    expect(rows(fr)[0]).toBe("Lieu,Identifiant,Nom,Indication pour fauteuil roulant,Type,Adresse,Point de carte,Source,Licence,Consulté,Niveau,Détails donnés");
    expect(GAP_CSV_FILENAMES).toEqual({ en: "place-gaps.csv", fr: "lacunes-des-lieux.csv" });
  });
  it("is just the header for no places", () => {
    expect(rows(gapMatrixToCsv(buildGapMatrix([], "en", TODAY), "en"))).toHaveLength(1);
  });
});
