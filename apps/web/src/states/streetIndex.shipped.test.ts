import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { parsePackPlaces } from "./packPlaces";
import { buildStreetIndex, filterStreets, streetSummary } from "./streetIndex";
import { streetIndexToCsv, streetIndexToText } from "./streetIndexExport";

const parsed = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places);
const places = parsed.places;

describe("the street index on the shipped pack", () => {
  const d = buildStreetIndex(places, "en");
  it("has places to read", () => {
    expect(places.length).toBeGreaterThan(5);
  });
  it("accounts for every place exactly once", () => {
    const ids = [...d.groups.flatMap((g) => g.entries.map((e) => e.id)), ...d.noAddressIds, ...d.poBoxIds, ...d.intersectionIds];
    expect(ids.sort()).toEqual(places.map((p) => p.id).sort());
  });
  it("puts a place on a street only when its address line has one", () => {
    const byId = new Map(places.map((p) => [p.id, p] as const));
    for (const g of d.groups) for (const e of g.entries) expect((byId.get(e.id)!.address ?? "").trim(), e.id).not.toBe("");
    for (const id of d.noAddressIds) expect(byId.get(id)!.address === null || /unknown|inconnu/i.test(byId.get(id)!.address ?? ""), id).toBe(true);
  });
  it("keeps the address of each entry exactly as the pack gives it", () => {
    const byId = new Map(places.map((p) => [p.id, p] as const));
    for (const g of d.groups) for (const e of g.entries) expect(e.address).toBe(byId.get(e.id)!.address);
  });
  it("counts the tags on each street to the number of places on it", () => {
    for (const g of d.groups) expect(Object.values(g.tagCounts).reduce((a, b) => a + b, 0)).toBe(g.entries.length);
  });
  it("joins the shipped places that give the same street in different forms", () => {
    const keys = d.groups.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    const yonge = d.groups.filter((g) => g.key.startsWith("yonge"));
    expect(yonge.length).toBeLessThanOrEqual(1);
  });
  it("gives the same text and CSV for the same pack every time", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(streetIndexToText(buildStreetIndex(places, locale), locale)).toBe(streetIndexToText(buildStreetIndex([...places].reverse(), locale), locale));
      expect(streetIndexToCsv(buildStreetIndex(places, locale), locale)).toBe(streetIndexToCsv(buildStreetIndex([...places].reverse(), locale), locale));
    }
  });
  it("states counts that match the index", () => {
    expect(streetSummary(d, "en")[0]).toBe(`${d.onStreet} of ${d.placeCount} places have an address that reads as one street, on ${d.groups.length} ${d.groups.length === 1 ? "street" : "streets"}.`);
  });
  it("finds every street by its own name", () => {
    for (const g of d.groups) expect(filterStreets(d.groups, g.name).map((x) => x.key), g.name).toContain(g.key);
  });
  it("is the same for the two orders apart from the order itself", () => {
    const a = buildStreetIndex(places, "en", "name").groups.map((g) => g.key).sort();
    const b = buildStreetIndex(places, "en", "gaps").groups.map((g) => g.key).sort();
    expect(a).toEqual(b);
  });
});
