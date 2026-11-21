import { describe, expect, it } from "vitest";
import { bare, place, varied } from "./placeFixtures";
import { buildAround, buildTextMap } from "./textMap";
import { TEXT_MAP_CSV_FILENAMES, TEXT_MAP_FILENAMES, aroundToCsv, aroundToText, textMapToCsv, textMapToText } from "./textMapExport";
import { lintFrench } from "./typography";

const C = { lat: 43.65, lon: -79.38 };
const at = (id: string, lat: number | null, lon: number | null, over: Record<string, unknown> = {}) => place(id, { name: `Place ${id}`, lat, lon, ...over });
const ps = [at("nw", 43.7, -79.4), at("se", 43.6, -79.3), at("mid", 43.65, -79.35), bare("z")];
const rows = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter((l) => l !== "");

describe("file names", () => {
  it("are different in the two languages", () => {
    expect(TEXT_MAP_FILENAMES).toEqual({ en: "text-map.txt", fr: "carte-en-texte.txt" });
    expect(TEXT_MAP_CSV_FILENAMES).toEqual({ en: "text-map.csv", fr: "carte-en-texte.csv" });
  });
});

describe("textMapToText", () => {
  const text = textMapToText(buildTextMap(ps, 3, "en"), "en");
  it("starts with a title, the summary and the caveat", () => {
    const l = text.split("\n");
    expect(l[0]).toBe("Text map of the places");
    expect(l[2]).toBe("3 places in a 3 by 3 grid. 1 place has no map point: its position is UNKNOWN.");
    expect(l[3]).toContain("not a street or neighbourhood map");
  });
  it("has a line for each cell that holds places, in reading order, and none for empty cells", () => {
    expect(text).toContain("\nNorth, West: Place nw\n");
    expect(text).toContain("\nMiddle, Centre: Place mid\n");
    expect(text).toContain("\nSouth, East: Place se\n");
    expect(text.indexOf("North, West")).toBeLessThan(text.indexOf("South, East"));
    expect(text).not.toContain("North, East");
  });
  it("lists places with no map point last", () => {
    expect(text.trimEnd().endsWith("No map point: z")).toBe(true);
  });
  it("uses LF only and ends with one", () => {
    expect(text).not.toContain("\r");
    expect(text.endsWith("\n")).toBe(true);
  });
  it("spaces the colons in French and never writes the French word for UNKNOWN", () => {
    const fr = textMapToText(buildTextMap(ps, 3, "fr"), "fr");
    expect(fr).toContain("Nord, Ouest\u00a0: Place nw");
    expect(fr).toContain("Aucun point de carte\u00a0: z");
    expect(fr).not.toMatch(/INCONN/i);
  });
  it("joins several places of one cell, and several with no map point, with a semicolon spaced for the language", () => {
    const many = [at("a", 43.7, -79.4, { name: "One" }), at("b", 43.7, -79.4, { name: "Two" }), bare("x"), bare("y")];
    const en = textMapToText(buildTextMap(many, 2, "en"), "en");
    const fr = textMapToText(buildTextMap(many, 2, "fr"), "fr");
    expect(en).toContain("One; Two");
    expect(en).toContain("x; y");
    expect(fr).toContain("One\u202f; Two");
    expect(fr).toContain("x\u202f; y");
    expect(fr).not.toMatch(/[^\u202f\n]; /);
    expect(en).not.toContain("\u202f");
  });
  it("names a place with no name as UNKNOWN", () => {
    expect(textMapToText(buildTextMap([at("a", 43.7, -79.4, { name: null })], 2, "en"), "en")).toContain("North, West: UNKNOWN");
  });
});

describe("aroundToText", () => {
  const list = [at("n", 43.66, C.lon), at("e", C.lat, -79.36), at("here", C.lat, C.lon), bare("z")];
  const text = aroundToText(buildAround(list, C, "en"), "en");
  it("starts with a title and the straight-line caveat", () => {
    expect(text.split("\n")[0]).toBe("Places around the point you typed");
    expect(text).toContain("A real route is longer");
  });
  it("has a block for each direction that holds places, with a line for each", () => {
    expect(text).toContain("\nNorth:\n- Place n: ");
    expect(text).toContain("\nEast:\n- Place e: ");
    expect(text).not.toContain("South:");
  });
  it("gives a place on the point under Here", () => {
    expect(text).toContain("\nHere:\n- Place here: here, within 5 m of your point.\n");
  });
  it("ends with the places that have no map point", () => {
    expect(text.trimEnd().endsWith("No map point: z")).toBe(true);
  });
  it("is French with capital and spaced colon", () => {
    const fr = aroundToText(buildAround(list, C, "fr"), "fr");
    expect(fr).toContain("\nNord\u00a0:\n");
    expect(fr).toContain("vers le nord");
    for (const l of fr.split("\n").filter((x) => /^(Nord|Est|Ici|Aucun)/.test(x))) expect(lintFrench(l), l).toEqual([]);
  });
});

describe("textMapToCsv", () => {
  const csv = textMapToCsv(buildTextMap(ps, 3, "en"), ps, "en");
  it("begins with a byte order mark, has a header, and ends with CRLF", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows(csv)[0]).toBe("Place,Id,Row,Column");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("has one row per place, located first in reading order, then those with no map point", () => {
    expect(rows(csv).slice(1)).toEqual(["Place nw,nw,North,West", "Place mid,mid,Middle,Centre", "Place se,se,South,East", "UNKNOWN,z,UNKNOWN,UNKNOWN"]);
  });
  it("is French in French", () => {
    expect(rows(textMapToCsv(buildTextMap(ps, 3, "fr"), ps, "fr"))[0]).toBe("Lieu,Identifiant,Rangée,Colonne");
  });
  it("quotes a name with a comma or quote and defuses a formula", () => {
    const hostile = [at("a", 43.7, -79.4, { name: 'A, "B"' }), at("b", 43.6, -79.3, { name: "=SUM(A1)" })];
    const out = rows(textMapToCsv(buildTextMap(hostile, 2, "en"), hostile, "en"));
    expect(out[1]!.startsWith('"A, ""B""",a,')).toBe(true);
    expect(out[2]!.startsWith("'=SUM(A1),b,")).toBe(true);
  });
  it("has the same number of cells in every row for generated places", () => {
    const g = varied(4, 30);
    const out = rows(textMapToCsv(buildTextMap(g, 4, "en"), g, "en"));
    expect(out).toHaveLength(31);
  });
});

describe("aroundToCsv", () => {
  const csv = aroundToCsv([at("n", 43.66, C.lon), at("here", C.lat, C.lon), bare("z")], C, "en");
  it("has a header with direction, a plain number of metres and the distance as written", () => {
    expect(rows(csv)[0]).toBe("Place,Id,Direction,Metres,Distance");
  });
  it("gives direction, whole metres and the written distance for a located place", () => {
    const cells = rows(csv)[1]!.split(",");
    expect(cells.slice(0, 3)).toEqual(["Place n", "n", "north"]);
    expect(Number(cells[3])).toBeGreaterThan(1000);
    expect(cells[4]).toMatch(/^1\.1\u00a0km$/);
  });
  it("says here for a place on the point and UNKNOWN for one with no map point", () => {
    expect(rows(csv)[2]).toMatch(/^Place here,here,here,\d,/);
    expect(rows(csv)[3]).toBe("UNKNOWN,z,UNKNOWN,UNKNOWN,UNKNOWN");
  });
  it("is French with the French direction words and a decimal comma, quoted", () => {
    const fr = aroundToCsv([at("n", 43.66, C.lon)], C, "fr");
    expect(rows(fr)[1]).toMatch(/^Place n,n,nord,\d+,"?1,1\u00a0km"?$/);
  });
  it("keeps the order of the places given", () => {
    const out = rows(aroundToCsv([at("b", 43.7, C.lon), at("a", 43.66, C.lon)], C, "en"));
    expect(out.slice(1).map((l) => l.split(",")[1])).toEqual(["b", "a"]);
  });
});
