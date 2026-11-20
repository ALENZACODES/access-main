import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { PROV, bare, place } from "./placeFixtures";
import { COMPASS, GRID_SIZES, SAME_SPOT_METRES, bearingDegrees, buildAround, buildTextMap, cellSentence, compassName, compassOf, directionLine, gridCaveat, gridSummary, locate, partOf, straightLineCaveat, tagMix } from "./textMap";
import { lintFrench } from "./typography";

const C = { lat: 43.65, lon: -79.38 };
const at = (id: string, lat: number | null, lon: number | null, over: Record<string, unknown> = {}) => place(id, { name: `Place ${id}`, lat, lon, ...over });

describe("compassOf", () => {
  it("gives each of the eight directions at its centre", () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassOf)).toEqual([...COMPASS]);
  });
  it("changes at the 22.5 degree edges, the edge belonging to the clockwise side", () => {
    expect([22.4, 22.5, 67.4, 67.5, 337.4, 337.5].map(compassOf)).toEqual(["N", "NE", "NE", "E", "NW", "N"]);
  });
  it("wraps: 360 and above, and negative bearings", () => {
    expect([360, 720, -10, -45, 359.99].map(compassOf)).toEqual(["N", "N", "N", "NW", "N"]);
  });
  it("covers every degree with exactly one of the eight", () => {
    const counts = new Map<string, number>();
    for (let d = 0; d < 360; d++) counts.set(compassOf(d), (counts.get(compassOf(d)) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([...COMPASS].sort());
    for (const n of counts.values()) expect(n).toBe(45);
  });
});

describe("compassName", () => {
  it("has English and French words for every direction", () => {
    expect(COMPASS.map((c) => compassName(c, "en"))).toEqual(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]);
    expect(COMPASS.map((c) => compassName(c, "fr"))).toEqual(["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"]);
  });
  it("uses the French word for west, not the English abbreviation, anywhere", () => {
    expect(COMPASS.map((c) => compassName(c, "fr")).join(" ")).not.toMatch(/\bwest\b|\bW\b|\bSW\b/);
  });
});

describe("bearingDegrees", () => {
  it("is 0 due north, 180 due south, and near 90 and 270 for east and west", () => {
    expect(bearingDegrees(C, { lat: 43.75, lon: C.lon })).toBeCloseTo(0, 6);
    expect(bearingDegrees(C, { lat: 43.55, lon: C.lon })).toBeCloseTo(180, 6);
    expect(bearingDegrees(C, { lat: C.lat, lon: -79.28 })).toBeCloseTo(90, 0);
    expect(bearingDegrees(C, { lat: C.lat, lon: -79.48 })).toBeCloseTo(270, 0);
  });
  it("is in the north-east sector for a point north and east", () => {
    expect(compassOf(bearingDegrees(C, { lat: 43.7, lon: -79.3 }))).toBe("NE");
  });
  it("is always at least 0 and below 360", () => {
    for (let lat = -80; lat <= 80; lat += 20) for (let lon = -170; lon <= 170; lon += 40) {
      const b = bearingDegrees(C, { lat, lon });
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
  it("differs by about 180 degrees from the reverse bearing over short distances", () => {
    const to = { lat: 43.67, lon: -79.35 };
    const diff = Math.abs(bearingDegrees(C, to) - bearingDegrees(to, C));
    expect(Math.abs(diff - 180)).toBeLessThan(0.1);
  });
});

describe("locate", () => {
  it("gives distance and direction for a place with a map point", () => {
    const l = locate(at("a", 43.7, C.lon), C)!;
    expect(l.compass).toBe("N");
    expect(l.metres).toBeGreaterThan(5000);
    expect(l.metres).toBeLessThan(6000);
  });
  it("gives nothing for a place with no map point", () => {
    expect(locate(at("a", null, null), C)).toBeNull();
    expect(locate(bare("z"), C)).toBeNull();
  });
  it("gives no direction for a place within a few metres of the point", () => {
    const l = locate(at("a", C.lat + 0.00001, C.lon), C)!;
    expect(l.metres).toBeLessThan(SAME_SPOT_METRES);
    expect(l.compass).toBeNull();
  });
  it("gives a direction just beyond that distance", () => {
    expect(locate(at("a", C.lat + 0.00006, C.lon), C)!.compass).toBe("N");
  });
  it("keeps the id and name", () => {
    expect(locate(at("a", 43.7, C.lon), C)).toMatchObject({ id: "a", name: "Place a" });
  });
});

describe("partOf", () => {
  it("cuts a range in equal parts", () => {
    expect([0, 0.33, 0.34, 0.66, 0.67, 1].map((v) => partOf(v, 0, 1, 3))).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it("puts the top edge in the last part", () => {
    expect(partOf(10, 0, 10, 4)).toBe(3);
  });
  it("puts everything in the first part when the range has no width", () => {
    expect(partOf(5, 5, 5, 3)).toBe(0);
  });
  it("clamps values outside the range", () => {
    expect([partOf(-1, 0, 1, 3), partOf(2, 0, 1, 3)]).toEqual([0, 2]);
  });
});

describe("buildTextMap", () => {
  // Corners and the middle of a square, north at the top.
  const nine = [
    at("nw", 43.7, -79.4), at("n", 43.7, -79.35), at("ne", 43.7, -79.3),
    at("w", 43.65, -79.4), at("c", 43.65, -79.35), at("e", 43.65, -79.3),
    at("sw", 43.6, -79.4), at("s", 43.6, -79.35), at("se", 43.6, -79.3),
  ];
  it("puts each of nine places in its own cell of a 3 by 3 grid, north-west first", () => {
    const m = buildTextMap(nine, 3, "en");
    expect(m.cells.map((row) => row.map((c) => c.placeIds.join("")))).toEqual([["nw", "n", "ne"], ["w", "c", "e"], ["sw", "s", "se"]]);
  });
  it("labels rows and columns in English and French", () => {
    const en = buildTextMap(nine, 3, "en");
    const fr = buildTextMap(nine, 3, "fr");
    expect([en.rowLabels, en.colLabels]).toEqual([["North", "Middle", "South"], ["West", "Centre", "East"]]);
    expect([fr.rowLabels, fr.colLabels]).toEqual([["Nord", "Milieu", "Sud"], ["Ouest", "Centre", "Est"]]);
    expect(en.cells[0]![0]!.label).toBe("North, West");
    expect(fr.cells[2]![2]!.label).toBe("Sud, Est");
  });
  it("makes a 2 by 2 and a 4 by 4 grid", () => {
    expect(buildTextMap(nine, 2, "en").cells.flat()).toHaveLength(4);
    expect(buildTextMap(nine, 4, "en").cells.flat()).toHaveLength(16);
  });
  it("holds every located place exactly once, whatever the size", () => {
    for (const size of GRID_SIZES) {
      const ids = buildTextMap(nine, size, "en").cells.flat().flatMap((c) => c.placeIds);
      expect(ids.sort()).toEqual(nine.map((p) => p.id).sort());
    }
  });
  it("lists places with no map point apart, and not in any cell", () => {
    const m = buildTextMap([...nine, bare("z"), at("half", 43.6, null)], 3, "en");
    expect(m.unlocatedIds).toEqual(["z", "half"]);
    expect(m.located).toBe(9);
    expect(m.cells.flat().flatMap((c) => c.placeIds)).not.toContain("z");
  });
  it("has no extent and empty cells when no place has a map point", () => {
    const m = buildTextMap([bare("z")], 3, "en");
    expect(m.extent).toBeNull();
    expect(m.cells.flat().every((c) => c.placeIds.length === 0)).toBe(true);
  });
  it("puts a single place in the north-west cell, since there is no range to divide", () => {
    const m = buildTextMap([at("a", 43.65, -79.38)], 3, "en");
    expect(m.cells[0]![0]!.placeIds).toEqual(["a"]);
  });
  it("puts places on one line of latitude in the top row, spread by longitude", () => {
    const m = buildTextMap([at("a", 43.65, -79.4), at("b", 43.65, -79.3)], 3, "en");
    expect(m.cells[0]!.map((c) => c.placeIds.join(""))).toEqual(["a", "", "b"]);
  });
  it("reports the extent it divides", () => {
    expect(buildTextMap(nine, 3, "en").extent).toEqual({ north: 43.7, south: 43.6, west: -79.4, east: -79.3 });
  });
  it("keeps place names, with null for none", () => {
    const m = buildTextMap([at("a", 43.7, -79.4, { name: null }), at("b", 43.6, -79.3)], 2, "en");
    expect(m.cells[0]![0]!.names).toEqual([null]);
  });
  it("does not change the places it is given", () => {
    const before = JSON.stringify(nine);
    buildTextMap(nine, 3, "fr");
    expect(JSON.stringify(nine)).toBe(before);
  });
});

describe("buildAround", () => {
  const ps = [at("n1", 43.66, C.lon), at("n2", 43.68, C.lon), at("e1", C.lat, -79.36), at("here", C.lat, C.lon), bare("z")];
  const a = buildAround(ps, C, "en");
  it("has the eight sectors in compass order, named", () => {
    expect(a.sectors.map((s) => s.compass)).toEqual([...COMPASS]);
    expect(a.sectors.map((s) => s.name)[0]).toBe("north");
  });
  it("puts places in the sector they lie in, nearest first", () => {
    expect(a.sectors[0]!.places.map((l) => l.id)).toEqual(["n1", "n2"]);
    expect(a.sectors[2]!.places.map((l) => l.id)).toEqual(["e1"]);
  });
  it("puts a place on the point under here, and one with no map point in the unlocated list", () => {
    expect(a.here.map((l) => l.id)).toEqual(["here"]);
    expect(a.unlocatedIds).toEqual(["z"]);
  });
  it("accounts for every place exactly once", () => {
    const all = [...a.sectors.flatMap((s) => s.places.map((l) => l.id)), ...a.here.map((l) => l.id), ...a.unlocatedIds];
    expect(all.sort()).toEqual(ps.map((p) => p.id).sort());
  });
  it("breaks a tie in distance by id, so the order is the same every time", () => {
    const tie = buildAround([at("b", 43.66, C.lon), at("a", 43.66, C.lon)], C, "en");
    expect(tie.sectors[0]!.places.map((l) => l.id)).toEqual(["a", "b"]);
  });
  it("is in French in French", () => {
    expect(buildAround(ps, C, "fr").sectors[0]!.name).toBe("nord");
  });
});

describe("tagMix and cellSentence", () => {
  const mixed = [place("a", { wheelchair: "yes" }), place("b", { wheelchair: "yes" }), place("c", { wheelchair: "no" }), place("d", { provenance: null })];
  it("counts each tag in a fixed order, UNKNOWN as the token", () => {
    expect(tagMix(mixed, "en")).toBe("Yes 2, No 1, UNKNOWN 1");
  });
  it("uses the French words with the token UNKNOWN", () => {
    expect(tagMix(mixed, "fr")).toBe("Oui 2, Non 1, UNKNOWN 1");
  });
  it("is empty for no places, and leaves out tags with none", () => {
    expect(tagMix([], "en")).toBe("");
    expect(tagMix([mixed[2]!], "en")).toBe("No 1");
  });
  it("makes a sentence of the count and the mix", () => {
    expect(cellSentence(4, "Yes 2, No 1, UNKNOWN 1", "en")).toBe("4 places: Yes 2, No 1, UNKNOWN 1");
    expect(cellSentence(1, "No 1", "en")).toBe("1 place: No 1");
    expect(cellSentence(0, "", "en")).toBe("No places");
  });
  it("spaces the colon in French", () => {
    expect(cellSentence(2, "Oui 2", "fr")).toBe("2 lieux\u00a0: Oui 2");
    expect(cellSentence(1, "Oui 1", "fr")).toBe("1 lieu\u00a0: Oui 1");
    expect(cellSentence(0, "", "fr")).toBe("Aucun lieu");
  });
});

describe("sentences", () => {
  it("summarise the grid and say when places have no map point", () => {
    const m = buildTextMap([at("a", 43.7, -79.4), at("b", 43.6, -79.3), bare("z")], 3, "en");
    expect(gridSummary(m, "en")).toBe("2 places in a 3 by 3 grid. 1 place has no map point: its position is UNKNOWN.");
    expect(gridSummary(m, "fr")).toBe("2 lieux dans une grille de 3 sur 3. 1 lieu n’a aucun point de carte\u00a0: sa position est UNKNOWN.");
  });
  it("say plural for several places with no map point", () => {
    const m = buildTextMap([bare("y"), bare("z")], 2, "en");
    expect(gridSummary(m, "en")).toContain("2 places have no map point");
    expect(gridSummary(m, "fr")).toContain("2 lieux n’ont aucun point de carte\u00a0: leur position est UNKNOWN");
  });
  it("write a direction line with a rounded distance, and here for the same spot", () => {
    expect(directionLine({ id: "a", name: "Alpha Hall", metres: 420, compass: "NE" }, "en")).toBe("Alpha Hall: 420\u00a0m to the north-east.");
    expect(directionLine({ id: "a", name: "Alpha Hall", metres: 1234, compass: "S" }, "fr")).toBe("Alpha Hall\u00a0: 1,2\u00a0km vers le sud.");
    expect(directionLine({ id: "a", name: null, metres: 2, compass: null }, "en")).toBe("UNKNOWN: here, within 5 m of your point.");
  });
  it("say the caveats plainly: straight lines, not streets", () => {
    expect(straightLineCaveat("en")).toContain("A real route is longer");
    expect(gridCaveat("en")).toContain("not a street or neighbourhood map");
    expect(gridCaveat("fr")).toContain("Ce n’est pas un plan de rues");
  });
  it("pass the copy checks and French typography, and never use the French word for UNKNOWN", () => {
    const m = buildTextMap([at("a", 43.7, -79.4), bare("z")], 3, "fr");
    for (const locale of ["en", "fr"] as const) {
      const lines = [straightLineCaveat(locale), gridCaveat(locale), gridSummary(m, locale), directionLine({ id: "a", name: "X", metres: 90, compass: "SW" }, locale), cellSentence(3, "UNKNOWN 3", locale)];
      for (const s of lines) {
        expect(lintCopy(s, locale), s).toEqual([]);
        if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
        expect(s).not.toMatch(/INCONN/i);
      }
    }
    expect(PROV.tier).toBe(0);
  });
});
