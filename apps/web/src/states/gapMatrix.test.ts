import { describe, expect, it } from "vitest";
import { buildGapMatrix, cellWord, gapSentence } from "./gapMatrix";
import { PROV, bare, place, varied } from "./placeFixtures";
import { SHEET_FIELDS, buildPlaceSheet } from "./placeSheet";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const full = (id: string) => place(id);
const noTier = (id: string) => place(id, { provenance: { ...PROV, tier: undefined } });

describe("buildGapMatrix", () => {
  it("has the nine columns in the sheet's order, with labels", () => {
    const m = buildGapMatrix([full("a")], "en", TODAY);
    expect(m.columns.map((c) => c.field)).toEqual([...SHEET_FIELDS]);
    expect(m.columns.map((c) => c.label)).toEqual(["Name", "Wheelchair tag", "Kind", "Address", "Map point", "Source", "Licence", "Retrieved", "Tier"]);
  });
  it("has one row per place, in the order given, with the place's own title", () => {
    const m = buildGapMatrix([full("b"), full("a")], "en", TODAY);
    expect(m.rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(m.rows[0]!.title).toBe("Place b");
  });
  it("has nine cells in each row, in column order", () => {
    for (const r of buildGapMatrix(varied(3, 15), "en", TODAY).rows) expect(r.cells.map((c) => c.field)).toEqual([...SHEET_FIELDS]);
  });
  it("marks a given value known with its text, and a missing one UNKNOWN", () => {
    const m = buildGapMatrix([place("a", { address: null })], "en", TODAY);
    const cell = (f: string) => m.rows[0]!.cells.find((c) => c.field === f)!;
    expect(cell("name")).toMatchObject({ known: true, value: "Place a" });
    expect(cell("address")).toMatchObject({ known: false, value: "UNKNOWN" });
  });
  it("counts the UNKNOWN cells in each column", () => {
    const m = buildGapMatrix([place("a", { address: null }), place("b", { address: null }), place("c")], "en", TODAY);
    expect(m.columns.find((c) => c.field === "address")!.unknownCount).toBe(2);
    expect(m.columns.find((c) => c.field === "name")!.unknownCount).toBe(0);
  });
  it("gives each row's recorded count, matching its sheet", () => {
    const m = buildGapMatrix([bare("z"), full("a")], "en", TODAY);
    expect(m.rows.map((r) => r.recorded)).toEqual([0, 9]);
  });
  it("lists the fields that are UNKNOWN for every place", () => {
    const m = buildGapMatrix([noTier("a"), noTier("b")], "en", TODAY);
    expect(m.emptyFields).toEqual(["tier"]);
  });
  it("lists the places with no UNKNOWN detail", () => {
    const m = buildGapMatrix([bare("z"), full("a"), full("b")], "en", TODAY);
    expect(m.fullPlaces).toEqual(["a", "b"]);
  });
  it("is empty, with no empty fields, for no places", () => {
    const m = buildGapMatrix([], "en", TODAY);
    expect(m.rows).toEqual([]);
    expect(m.emptyFields).toEqual([]);
    expect(m.columns.every((c) => c.unknownCount === 0)).toBe(true);
  });
  it("does not reorder the places however many details each gives", () => {
    const places = varied(11, 30);
    expect(buildGapMatrix(places, "en", TODAY).rows.map((r) => r.id)).toEqual(places.map((p) => p.id));
  });
  it("has column unknown counts that add up to the cells that are not known", () => {
    const m = buildGapMatrix(varied(5, 30), "fr", TODAY);
    const byColumns = m.columns.reduce((s, c) => s + c.unknownCount, 0);
    const byRows = m.rows.reduce((s, r) => s + r.cells.filter((c) => !c.known).length, 0);
    expect(byColumns).toBe(byRows);
  });
});

describe("gapSentence", () => {
  it("counts places, details and UNKNOWN details", () => {
    const m = buildGapMatrix([full("a"), place("b", { address: null })], "en", TODAY);
    expect(gapSentence(m, "en")).toBe("2 places, 18 details: the pack leaves 1 UNKNOWN.");
  });
  it("names a field that is UNKNOWN for every place", () => {
    const m = buildGapMatrix([noTier("a"), noTier("b")], "en", TODAY);
    expect(gapSentence(m, "en")).toBe("2 places, 18 details: the pack leaves 2 UNKNOWN. UNKNOWN for every listed place: Tier.");
  });
  it("is French with the colons spaced", () => {
    const m = buildGapMatrix([noTier("a"), noTier("b")], "fr", TODAY);
    const s = gapSentence(m, "fr");
    expect(s).toBe("2 lieux, 18 détails\u00a0: le pack en laisse 2 UNKNOWN. UNKNOWN pour chaque lieu de la liste\u00a0: Niveau.");
    expect(lintFrench(s)).toEqual([]);
  });
  it("does not compare the places", () => {
    for (const locale of ["en", "fr"] as const) {
      const s = gapSentence(buildGapMatrix(varied(2, 10), locale, TODAY), locale);
      expect(s).not.toMatch(/\b(best|worst|better|worse|safest|easiest|top)\b|meilleur|pire|plus facile|plus sûr/i);
    }
  });
});

describe("cellWord", () => {
  it("is a word, not only a mark or a colour", () => {
    expect(cellWord({ field: "name", known: true, value: "x" }, "en")).toBe("Given");
    expect(cellWord({ field: "name", known: true, value: "x" }, "fr")).toBe("Donné");
    expect(cellWord({ field: "name", known: false, value: "UNKNOWN" }, "fr")).toBe("UNKNOWN");
  });
});

describe("gap matrix over generated lists", () => {
  for (const seed of [2, 4, 6, 8]) {
    it(`seed ${seed}: has a row for every place and cells that agree with each place's own sheet`, () => {
      const places = varied(seed, 25);
      for (const locale of ["en", "fr"] as const) {
        const m = buildGapMatrix(places, locale, TODAY);
        expect(m.rows).toHaveLength(places.length);
        m.rows.forEach((row, i) => {
          const sheet = buildPlaceSheet(places[i]!, locale, TODAY);
          expect(row.recorded).toBe(sheet.recorded);
          for (const cell of row.cells) {
            const r = sheet.rows.find((x) => x.field === cell.field)!;
            expect([cell.known, cell.value]).toEqual([r.known, r.value]);
          }
        });
      }
    });
    it(`seed ${seed}: the full places and the empty fields follow from the cells`, () => {
      const m = buildGapMatrix(varied(seed, 25), "en", TODAY);
      for (const r of m.rows) expect(m.fullPlaces.includes(r.id)).toBe(r.cells.every((c) => c.known));
      for (const c of m.columns) expect(m.emptyFields.includes(c.field)).toBe(c.unknownCount === m.rows.length);
    });
  }
  it("gives every cell value as UNKNOWN or the sheet's text, never a blank", () => {
    for (const r of buildGapMatrix(varied(31, 40), "fr", TODAY).rows) for (const c of r.cells) expect(c.value.trim()).not.toBe("");
  });
});
