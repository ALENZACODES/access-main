import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { bare, place, varied } from "./placeFixtures";
import { MAX_MATRIX_PLACES, buildDistanceMatrix, cellText, matrixCaveat, matrixSummary } from "./placeMatrix";
import { distanceMetres } from "./packGeo";
import { COMPASS } from "./textMap";
import { lintFrench } from "./typography";

const at = (id: string, lat: number | null, lon: number | null, over: Record<string, unknown> = {}) => place(id, { name: `Place ${id}`, lat, lon, ...over });
const A = at("a", 43.65, -79.38);
const B = at("b", 43.7, -79.38); // about 5.6 km north of A
const D = at("d", 43.65, -79.3); // about 6.4 km east of A

describe("buildDistanceMatrix", () => {
  const m = buildDistanceMatrix([A, B, D, bare("z")]);
  it("has a row and a column for each place, in the order given", () => {
    expect(m.places.map((p) => p.id)).toEqual(["a", "b", "d", "z"]);
    expect(m.cells).toHaveLength(4);
    for (const row of m.cells) expect(row.map((c) => c.toId)).toEqual(["a", "b", "d", "z"]);
  });
  it("labels each cell with its row place as from and its column place as to", () => {
    m.cells.forEach((row, i) => row.forEach((c) => expect(c.fromId).toBe(m.places[i]!.id)));
  });
  it("is zero on the diagonal for a located place, with no direction", () => {
    expect(m.cells[0]![0]).toMatchObject({ metres: 0, compass: null });
  });
  it("is null on the diagonal for a place with no map point", () => {
    expect(m.cells[3]![3]).toMatchObject({ metres: null, compass: null });
  });
  it("measures the straight line between located places", () => {
    expect(m.cells[0]![1]!.metres).toBeCloseTo(distanceMetres(A.location!, B.location!), 6);
  });
  it("is the same distance both ways", () => {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(m.cells[i]![j]!.metres).toBeCloseTo(m.cells[j]![i]!.metres!, 6);
  });
  it("gives opposite directions both ways, from the row's place to the column's", () => {
    expect(m.cells[0]![1]!.compass).toBe("N");
    expect(m.cells[1]![0]!.compass).toBe("S");
    expect(m.cells[0]![2]!.compass).toBe("E");
    expect(m.cells[2]![0]!.compass).toBe("W");
  });
  it("is UNKNOWN (null) to and from a place with no map point, in both directions", () => {
    for (let i = 0; i < 3; i++) {
      expect(m.cells[i]![3]).toMatchObject({ metres: null, compass: null });
      expect(m.cells[3]![i]).toMatchObject({ metres: null, compass: null });
    }
  });
  it("counts located places and lists the others", () => {
    expect(m.located).toBe(3);
    expect(m.unlocatedIds).toEqual(["z"]);
  });
  it("finds the two nearest and the two furthest apart among the located", () => {
    expect(m.closest).toMatchObject({ aId: "a", bId: "b" });
    expect(m.widest).toMatchObject({ aId: "b", bId: "d" });
    expect(m.closest!.metres).toBeLessThan(m.widest!.metres);
  });
  it("gives no pair facts with fewer than two located places", () => {
    for (const list of [[A], [A, bare("z")], [bare("y"), bare("z")], []]) {
      const x = buildDistanceMatrix(list);
      expect([x.closest, x.widest]).toEqual([null, null]);
    }
  });
  it("gives no direction for two places at almost the same spot", () => {
    const x = buildDistanceMatrix([A, at("near", 43.65001, -79.38)]);
    expect(x.cells[0]![1]!.compass).toBeNull();
    expect(x.cells[0]![1]!.metres).toBeLessThan(5);
  });
  it("breaks a tie in nearest by list order", () => {
    const x = buildDistanceMatrix([at("a", 43.65, -79.38), at("b", 43.66, -79.38), at("c", 43.67, -79.38)]);
    expect(x.closest).toMatchObject({ aId: "a", bId: "b" });
  });
  it("breaks an exact tie in nearest and in widest by list order", () => {
    const x = buildDistanceMatrix([at("a", 43.65, -79.38), at("b", 43.65, -79.38), at("c", 43.7, -79.3), at("d", 43.7, -79.3)]);
    expect(x.closest).toMatchObject({ aId: "a", bId: "b", metres: 0 });
    const w = buildDistanceMatrix([at("a", 43.65, -79.38), at("b", 43.7, -79.3), at("c", 43.65, -79.38), at("d", 43.7, -79.3)]);
    expect(w.widest).toMatchObject({ aId: "a", bId: "b" });
  });
  it("uses only the first places when the list is too long, and says it cut", () => {
    const many = Array.from({ length: MAX_MATRIX_PLACES + 5 }, (_, i) => at(`p${i}`, 43.6 + i * 0.001, -79.4));
    const x = buildDistanceMatrix(many);
    expect(x.places).toHaveLength(MAX_MATRIX_PLACES);
    expect(x.cut).toBe(true);
    expect(buildDistanceMatrix([A, B]).cut).toBe(false);
  });
  it("does not change the places it is given", () => {
    const list = [A, B, bare("z")];
    const before = JSON.stringify(list);
    buildDistanceMatrix(list);
    expect(JSON.stringify(list)).toBe(before);
  });
  it("keeps names, null for none", () => {
    expect(buildDistanceMatrix([at("a", 43.65, -79.38, { name: null }), B]).places[0]!.name).toBeNull();
  });
});

describe("cellText", () => {
  const cell = (over: Partial<{ metres: number | null; compass: (typeof COMPASS)[number] | null; fromId: string; toId: string }>) => ({ fromId: "a", toId: "b", metres: 420, compass: "NE" as const, ...over });
  it("writes distance then direction", () => {
    expect(cellText(cell({}), "en")).toBe("420\u00a0m, north-east");
    expect(cellText(cell({ metres: 1234, compass: "S" }), "fr")).toBe("1,2\u00a0km, sud");
  });
  it("says same place on the diagonal, in both languages", () => {
    expect(cellText(cell({ toId: "a", metres: 0, compass: null }), "en")).toBe("same place");
    expect(cellText(cell({ toId: "a", metres: 0, compass: null }), "fr")).toBe("même lieu");
  });
  it("says UNKNOWN when it cannot be measured", () => {
    expect(cellText(cell({ metres: null, compass: null }), "en")).toBe("UNKNOWN");
    expect(cellText(cell({ metres: null, compass: null }), "fr")).toBe("UNKNOWN");
  });
  it("says same spot for a measured pair with no direction", () => {
    expect(cellText(cell({ metres: 3, compass: null }), "en")).toBe("3\u00a0m, same spot");
    expect(cellText(cell({ metres: 3, compass: null }), "fr")).toBe("3\u00a0m, même endroit");
  });
});

describe("matrixSummary", () => {
  it("counts the located places and states the nearest and furthest pairs", () => {
    const m = buildDistanceMatrix([A, B, D]);
    const s = matrixSummary(m, "en");
    expect(s[0]).toBe("3 of 3 places have a map point and can be measured.");
    expect(s.some((l) => l.startsWith("Nearest to each other: Place a and Place b, about 5.6"))).toBe(true);
    expect(s.some((l) => l.startsWith("Furthest apart: Place b and Place d"))).toBe(true);
  });
  it("leaves out the furthest sentence when only two places can be measured", () => {
    expect(matrixSummary(buildDistanceMatrix([A, B]), "en").some((l) => l.startsWith("Furthest"))).toBe(false);
  });
  it("says distances to a place with no map point are UNKNOWN, singular and plural", () => {
    expect(matrixSummary(buildDistanceMatrix([A, B, bare("z")]), "en")[1]).toBe("Distances to and from the place with no map point are UNKNOWN.");
    expect(matrixSummary(buildDistanceMatrix([A, bare("y"), bare("z")]), "en")[1]).toBe("Distances to and from the places with no map point are UNKNOWN.");
  });
  it("is French with spaced colons", () => {
    const s = matrixSummary(buildDistanceMatrix([A, B, D]), "fr");
    expect(s[0]).toBe("3 lieux sur 3 ont un point de carte et peuvent être mesurés.");
    expect(s[1]).toContain("Les plus proches l’un de l’autre\u00a0: Place a et Place b, à environ 5,6\u00a0km.");
  });
  it("mentions a cut list", () => {
    const many = Array.from({ length: MAX_MATRIX_PLACES + 1 }, (_, i) => at(`p${i}`, 43.6 + i * 0.001, -79.4));
    expect(matrixSummary(buildDistanceMatrix(many), "en").at(-1)).toBe("Only the first 30 places are measured.");
  });
  it("names a place with no name as UNKNOWN", () => {
    const m = buildDistanceMatrix([at("a", 43.65, -79.38, { name: null }), B]);
    expect(matrixSummary(m, "en").join(" ")).toContain("UNKNOWN and Place b");
  });
  it("passes the copy checks and French typography, and never uses the French word for UNKNOWN", () => {
    const m = buildDistanceMatrix([A, B, D, bare("z")]);
    for (const locale of ["en", "fr"] as const) {
      for (const s of [...matrixSummary(m, locale), matrixCaveat(locale)]) {
        expect(lintCopy(s, locale), s).toEqual([]);
        if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
        expect(s).not.toMatch(/INCONN/i);
      }
    }
  });
  it("never ranks or recommends", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = [...matrixSummary(buildDistanceMatrix(varied(3, 10)), locale), matrixCaveat(locale)].join(" ");
      expect(text).not.toMatch(/\b(best|better|ideal|recommended|should visit)\b|meilleur|idéal|recommand/i);
    }
  });
  it("says in the caveat that distances are straight lines and which way a direction runs", () => {
    expect(matrixCaveat("en")).toContain("straight lines");
    expect(matrixCaveat("en")).toContain("from the place on the left to the place at the top");
  });
});
