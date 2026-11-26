import { describe, expect, it } from "vitest";
import { CANONICAL_VERSION, canonicalIds, canonicalLine, canonicalLines, canonicalText, compareCodeUnits } from "./packCanonical";
import { bare, lcg, place, varied } from "./placeFixtures";

describe("canonicalLine", () => {
  it("is a JSON array with the fields in a fixed order", () => {
    const row = JSON.parse(canonicalLine(place("a1", { name: "Café", note: null, wheelchair_description: "Ramp at the side" })));
    expect(row).toEqual([
      "a1", "Café", "yes",
      ["OpenStreetMap, Geofabrik Ontario extract", "ODbL-1.0", "2026-11-10", "https://www.openstreetmap.org/way/42"],
      0, "cafe", "1 Main Street", "Ramp at the side", [43.65, -79.38],
    ]);
  });
  it("writes an absent value as null, never as an empty string", () => {
    const row = JSON.parse(canonicalLine(bare("z")));
    expect(row).toEqual(["z", null, "unknown", null, null, null, null, null, null]);
  });
  it("keeps a missing url apart from a present one", () => {
    const withUrl = JSON.parse(canonicalLine(place("u", {})));
    const noUrl = JSON.parse(canonicalLine(place("u", { provenance: { source_name: "S", licence: "ODbL-1.0", retrieved_at: "2026-11-10" } })));
    expect(withUrl[3][3]).toMatch(/^https:/);
    expect(noUrl[3][3]).toBeNull();
    expect(canonicalLine(place("u", {}))).not.toBe(canonicalLine(place("u", { provenance: { source_name: "S", licence: "ODbL-1.0", retrieved_at: "2026-11-10" } })));
  });
  it("is one line, whatever the text holds", () => {
    // Control characters are cleaned when the pack is read; a quote and a backslash stay and are escaped.
    const line = canonicalLine(place("q", { name: 'He said "hi" \\ there', address: "Line one\nLine two" }));
    expect(line).not.toMatch(/[\r\n]/);
    expect(JSON.parse(line)[1]).toBe('He said "hi" \\ there');
  });
  it("changes when any single field changes", () => {
    const base = place("m", {});
    const variants = [
      place("m", { name: "Other" }),
      place("m", { wheelchair: "no" }),
      place("m", { category: "museum" }),
      place("m", { address: "2 Main Street" }),
      place("m", { wheelchair_description: "A note" }),
      place("m", { lat: 43.66 }),
      place("m", { lon: -79.39 }),
      place("m", { provenance: { ...{ source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/42", licence: "ODbL-1.0", retrieved_at: "2026-11-11", tier: 0 } } }),
      place("m", { provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/42", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 1 } }),
    ];
    const lines = new Set([canonicalLine(base), ...variants.map(canonicalLine)]);
    expect(lines.size).toBe(variants.length + 1);
  });
  it("does not change when the same record is read twice", () => {
    expect(canonicalLine(place("same", {}))).toBe(canonicalLine(place("same", {})));
  });
  it("is the same for a number written two ways", () => {
    expect(canonicalLine(place("n", { lat: 43.6500 }))).toBe(canonicalLine(place("n", { lat: 43.65 })));
  });
});

describe("compareCodeUnits", () => {
  it("orders by code unit, not by locale", () => {
    expect(["b", "B", "a", "A", "é", "e", "Z"].sort(compareCodeUnits)).toEqual(["A", "B", "Z", "a", "b", "e", "é"]);
    expect(compareCodeUnits("a", "a")).toBe(0);
    expect(compareCodeUnits("a", "b")).toBe(-1);
    expect(compareCodeUnits("b", "a")).toBe(1);
  });
});

describe("canonicalLines and canonicalText", () => {
  it("do not depend on the order the places arrive in", () => {
    const places = varied(7, 40);
    const shuffled = [...places];
    const next = lcg(99);
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    expect(canonicalLines(shuffled)).toEqual(canonicalLines(places));
    expect(canonicalText(shuffled)).toBe(canonicalText(places));
    expect(canonicalIds(shuffled)).toBe(canonicalIds(places));
  });
  it("sorts ids by code unit", () => {
    const text = canonicalIds([place("b", {}), place("a-2", {}), place("a1", {}), place("a", {})]);
    expect(text).toBe('"a"\n"a-2"\n"a1"\n"b"\n');
  });
  it("is the empty string for no places", () => {
    expect(canonicalText([])).toBe("");
    expect(canonicalIds([])).toBe("");
    expect(canonicalLines([])).toEqual([]);
  });
  it("ends every line with a line feed, so two lists cannot run together", () => {
    const text = canonicalText([place("a", {}), place("b", {})]);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n")).toHaveLength(3);
  });
  it("does not change the list it is given", () => {
    const places = [place("b", {}), place("a", {})];
    canonicalLines(places);
    canonicalIds(places);
    expect(places.map((p) => p.id)).toEqual(["b", "a"]);
  });
  it("has a version to bump when the form changes", () => {
    expect(CANONICAL_VERSION).toBe(1);
  });
});
