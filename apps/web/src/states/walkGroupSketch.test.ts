import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { MAX_SKETCH_PLACES, SKETCH_COLUMNS, SKETCH_ROWS, sketchGroup } from "./walkGroupSketch";

const at = (id: string, east: number, north: number, name = id) => place(id, { name, lat: 43.65 + north / 111_195, lon: -79.38 + east / 80_500 });

describe("sketchGroup", () => {
  it("puts north at the top and east to the right", () => {
    const s = sketchGroup([at("sw", 0, 0, "Alpha"), at("ne", 100, 100, "Bravo")])!;
    expect(s.lines[0]!.trimEnd().endsWith("B")).toBe(true);
    expect(s.lines.at(-1)!.startsWith("A")).toBe(true);
  });
  it("keeps every letter on the grid, once each, for places in different squares", () => {
    const s = sketchGroup([at("a", 0, 0, "A1"), at("b", 100, 0, "B1"), at("c", 0, 100, "C1"), at("d", 100, 100, "D1")])!;
    const text = s.lines.join("");
    for (const l of ["A", "B", "C", "D"]) expect(text.split(l).length - 1).toBe(1);
  });
  it("letters the legend in name order", () => {
    const s = sketchGroup([at("a", 0, 0, "Zed"), at("b", 100, 0, "Amy")])!;
    expect(s.legend.map((x) => [x.letter, x.place.name])).toEqual([["A", "Amy"], ["B", "Zed"]]);
  });
  it("shows a square with two places as * and marks both as sharing it", () => {
    const s = sketchGroup([at("a", 0, 0), at("b", 0.5, 0), at("c", 400, 0)])!;
    expect(s.lines.join("")).toContain("*");
    expect(s.legend.filter((x) => x.shared)).toHaveLength(2);
  });
  it("fits the columns and rows asked for", () => {
    const s = sketchGroup([at("a", 0, 0), at("b", 900, 300)], 10, 4)!;
    expect(s.lines).toHaveLength(4);
    for (const line of s.lines) expect(line.length).toBeLessThanOrEqual(10);
  });
  it("uses the default size", () => {
    const s = sketchGroup([at("a", 0, 0), at("b", 5000, 5000)])!;
    expect(s.lines).toHaveLength(SKETCH_ROWS);
    expect(Math.max(...s.lines.map((l) => l.length))).toBeLessThanOrEqual(SKETCH_COLUMNS);
  });
  it("handles places in a straight line east to west and north to south", () => {
    expect(sketchGroup([at("a", 0, 0), at("b", 300, 0)])).not.toBeNull();
    expect(sketchGroup([at("a", 0, 0), at("b", 0, 300)])).not.toBeNull();
  });
  it("handles places at the same point", () => {
    const s = sketchGroup([at("a", 0, 0), at("b", 0, 0)])!;
    expect(s.lines.join("")).toContain("*");
  });
  it("is null for one place, no point, too many places, or a grid too small", () => {
    expect(sketchGroup([at("a", 0, 0)])).toBeNull();
    expect(sketchGroup([at("a", 0, 0), place("b", { lat: null, lon: null })])).toBeNull();
    const many = Array.from({ length: MAX_SKETCH_PLACES + 1 }, (_, i) => at(`p${i}`, i * 40, 0));
    expect(sketchGroup(many)).toBeNull();
    expect(sketchGroup([at("a", 0, 0), at("b", 5, 0)], 1, 1)).toBeNull();
  });
  it("sketches exactly the limit", () => {
    const edge = Array.from({ length: MAX_SKETCH_PLACES }, (_, i) => at(`p${i}`, i * 400, (i % 3) * 400));
    expect(sketchGroup(edge)!.legend).toHaveLength(MAX_SKETCH_PLACES);
  });
});
