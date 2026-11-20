import { describe, expect, it } from "vitest";
import { bare, place, varied } from "./placeFixtures";
import { buildDistanceMatrix } from "./placeMatrix";
import { MATRIX_CSV_FILENAMES, MATRIX_TEXT_FILENAMES, matrixToCsv, matrixToText } from "./placeMatrixExport";
import { lintFrench } from "./typography";

const at = (id: string, lat: number | null, lon: number | null, over: Record<string, unknown> = {}) => place(id, { name: `Place ${id}`, lat, lon, ...over });
const list = [at("a", 43.65, -79.38), at("b", 43.7, -79.38), bare("z")];
const m = buildDistanceMatrix(list);
const rows = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter((l) => l !== "");

describe("file names", () => {
  it("are different in the two languages", () => {
    expect(MATRIX_TEXT_FILENAMES).toEqual({ en: "distances-between-places.txt", fr: "distances-entre-les-lieux.txt" });
    expect(MATRIX_CSV_FILENAMES).toEqual({ en: "distances-between-places.csv", fr: "distances-entre-les-lieux.csv" });
  });
});

describe("matrixToText", () => {
  const text = matrixToText(m, "en");
  it("starts with a title, the summary sentences and the caveat", () => {
    const l = text.split("\n");
    expect(l[0]).toBe("Distances between the listed places");
    expect(l[2]).toBe("2 of 3 places have a map point and can be measured.");
    expect(text).toContain("Each direction is from the place on the left to the place at the top.");
  });
  it("has a block for each place with a line to every other place", () => {
    expect(text).toContain("\nPlace a:\n- to Place b: 5.6\u00a0km, north\n- to UNKNOWN: UNKNOWN\n");
    expect(text).toContain("\nPlace b:\n- to Place a: 5.6\u00a0km, south\n");
  });
  it("never lists a place against itself", () => {
    expect(text).not.toContain("- to Place a: same place");
    expect(text.match(/^- to /gm)).toHaveLength(6);
  });
  it("uses LF only and ends with one", () => {
    expect(text).not.toContain("\r");
    expect(text.endsWith("\n")).toBe(true);
  });
  it("spaces colons in French, writes a decimal comma and the token UNKNOWN", () => {
    const fr = matrixToText(m, "fr");
    expect(fr).toContain("\nPlace a\u00a0:\n- vers Place b\u00a0: 5,6\u00a0km, nord\n");
    expect(fr).not.toMatch(/INCONN/i);
    for (const l of fr.split("\n").filter((x) => /^(- vers|Les |Distances|Chaque)/.test(x) && !/Place [a-z]/.test(x))) expect(lintFrench(l), l).toEqual([]);
  });
});

describe("matrixToCsv", () => {
  const csv = matrixToCsv(m, "en");
  it("begins with a byte order mark and a header, and ends with CRLF", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows(csv)[0]).toBe("From,From id,To,To id,Direction,Metres,Distance");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("has one row for each ordered pair of different places", () => {
    expect(rows(csv)).toHaveLength(1 + 3 * 2);
  });
  it("writes direction, a plain whole number of metres and the written distance", () => {
    const first = rows(csv)[1]!.split(",");
    expect(first.slice(0, 5)).toEqual(["Place a", "a", "Place b", "b", "north"]);
    expect(Number(first[5])).toBeGreaterThan(5000);
    expect(first[6]).toBe("5.6\u00a0km");
  });
  it("writes UNKNOWN for direction, metres and distance when a place has no map point", () => {
    expect(rows(csv)[2]).toBe("Place a,a,UNKNOWN,z,UNKNOWN,UNKNOWN,UNKNOWN");
  });
  it("is French with the French header and a quoted decimal comma", () => {
    const fr = matrixToCsv(m, "fr");
    expect(rows(fr)[0]).toBe("De,Identifiant de départ,Vers,Identifiant d’arrivée,Direction,Mètres,Distance");
    expect(rows(fr)[1]).toContain('"5,6\u00a0km"');
  });
  it("quotes names with commas and quotes and defuses a formula", () => {
    const h = buildDistanceMatrix([at("a", 43.65, -79.38, { name: 'A, "B"' }), at("b", 43.7, -79.38, { name: "=SUM(A1)" })]);
    const out = rows(matrixToCsv(h, "en"));
    expect(out[1]!.startsWith('"A, ""B""",a,\'=SUM(A1),b,')).toBe(true);
  });
  it("has a row for every pair of a generated list", () => {
    const g = buildDistanceMatrix(varied(6, 12));
    expect(rows(matrixToCsv(g, "en"))).toHaveLength(1 + 12 * 11);
  });
});
