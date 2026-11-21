import { describe, expect, it } from "vitest";
import type { PackPlaceRecord } from "./packPlaces";
import { bare, place, varied } from "./placeFixtures";
import { MAX_SHEET_NOTE, buildSpotSheet, sheetChecks, sheetEntry } from "./spotSheet";
import { sampleForSpotCheck } from "./spotSample";

const sampleOf = (places: PackPlaceRecord[], size = 5) => sampleForSpotCheck(places, { size, seed: "s", balanced: true });

describe("sheetEntry", () => {
  it("has the name, id, tag with its source, address and kind", () => {
    const e = sheetEntry(3, place("p1", { name: "Café Un" }), "en");
    expect(e.heading).toBe("3. Café Un");
    expect(e.id).toBe("p1");
    expect(e.lines.map((l) => l.label)).toEqual(["Name", "Place id", "The pack reports", "Address", "Kind of place"]);
    expect(e.lines[2]!.value).toBe("Yes (OpenStreetMap, Geofabrik Ontario extract, retrieved 10 November 2026)");
    expect(e.lines[3]!.value).toBe("1 Main Street");
    expect(e.lines[4]!.value).toBe("cafe");
  });
  it("writes UNKNOWN for everything the pack does not give", () => {
    const e = sheetEntry(1, bare("b1"), "en");
    expect(e.heading).toBe("1. UNKNOWN");
    expect(e.lines.map((l) => l.value)).toEqual(["UNKNOWN", "b1", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect(e.tag).toBe("UNKNOWN");
    expect(e.source).toBe("UNKNOWN");
    expect(e.retrievedOn).toBe("UNKNOWN");
  });
  it("shows a tag with no usable source as UNKNOWN, not as the tag", () => {
    const e = sheetEntry(1, place("np", { provenance: null }), "en");
    expect(e.lines[2]!.value).toBe("UNKNOWN");
    expect(e.tag).toBe("UNKNOWN");
  });
  it("includes the pack note only when there is one", () => {
    expect(sheetEntry(1, place("n", {}), "en").lines.some((l) => l.label === "Pack note")).toBe(false);
    const e = sheetEntry(1, place("n", { wheelchair_description: "Ramp at the side door" }), "en");
    expect(e.lines.at(-1)).toEqual({ label: "Pack note", value: "Ramp at the side door" });
  });
  it("cuts a long note and says so", () => {
    const e = sheetEntry(1, place("n", { wheelchair_description: "word ".repeat(100) }), "en");
    const v = e.lines.at(-1)!.value;
    expect(v.length).toBeLessThanOrEqual(MAX_SHEET_NOTE + 8);
    expect(v.endsWith("… (cut)")).toBe(true);
    expect(sheetEntry(1, place("n", { wheelchair_description: "mot ".repeat(100) }), "fr").lines.at(-1)!.value.endsWith("… (coupée)")).toBe(true);
  });
  it("is in French when asked, with the French date", () => {
    const e = sheetEntry(1, place("f", {}), "fr");
    expect(e.lines[0]!.label).toBe("Nom");
    expect(e.lines[2]!.value).toContain("consulté le 10 novembre 2026");
    expect(e.lines[2]!.value.startsWith("Oui")).toBe(true);
  });
  it("keeps the fixed tag token for the CSV in both languages", () => {
    expect(sheetEntry(1, place("t", { wheelchair: "limited" }), "fr").tag).toBe("limited");
    expect(sheetEntry(1, place("t", { wheelchair: "designated" }), "en").tag).toBe("designated");
  });
});

describe("sheetChecks", () => {
  it("has the same five questions for every place, each with three answers", () => {
    const checks = sheetChecks("en");
    expect(checks.map((c) => c.key)).toEqual(["step", "door", "ramp", "level", "match"]);
    for (const c of checks) expect(c.answers).toHaveLength(3);
    expect(checks[4]!.answers.map((a) => a.label)).toEqual(["Same", "Different", "Could not tell"]);
  });
  it("is in French when asked", () => {
    expect(sheetChecks("fr")[0]!.question).toContain("marche");
  });
});

describe("buildSpotSheet", () => {
  const places = varied(8, 40);
  it("has one entry per pick, numbered from 1", () => {
    const s = buildSpotSheet(sampleOf(places, 5), "2026-11-21", true, "en", "2026-11-21");
    expect(s.entries.map((e) => e.n)).toEqual([1, 2, 3, 4, 5]);
    expect(s.title).toBe("Spot-check sheet: 5 places");
    expect(s.checks).toHaveLength(5);
    expect(s.footer).toHaveLength(2);
    expect(s.locale).toBe("en");
  });
  it("names the seed in the intro", () => {
    const s = buildSpotSheet(sampleOf(places), "my seed", false, "en", "2026-11-21");
    expect(s.seed).toBe("my seed");
    expect(s.intro).toContain("“my seed”");
    expect(s.intro).toContain("drawn at random");
  });
  it("cleans a seed that has control characters or is too long", () => {
    const s = buildSpotSheet(sampleOf(places), `a\u0000b\nc${"x".repeat(200)}`, true, "en", "2026-11-21");
    // eslint-disable-next-line no-control-regex -- the point is to find control characters
    expect(s.seed).not.toMatch(/[\u0000-\u001F]/);
    expect(s.seed.length).toBeLessThanOrEqual(60);
    expect(s.seed.startsWith("a b c")).toBe(true);
  });
  it("has an empty sheet for an empty sample", () => {
    const s = buildSpotSheet(sampleOf([]), "s", true, "en", "2026-11-21");
    expect(s.entries).toEqual([]);
    expect(s.title).toBe("Spot-check sheet: 0 places");
  });
  it("is in French when asked", () => {
    const s = buildSpotSheet(sampleOf(places, 3), "graine", true, "fr", "2026-11-21");
    expect(s.title).toContain("Feuille d’observation sur place");
    expect(s.entries[0]!.lines[1]!.label).toBe("Identifiant du lieu");
    expect(s.footer[0]).toContain("Ce n’est pas un constat");
  });
  it("is the same for the same sample", () => {
    expect(buildSpotSheet(sampleOf(places), "x", true, "en", "d")).toEqual(buildSpotSheet(sampleOf([...places].reverse()), "x", true, "en", "d"));
  });
});
