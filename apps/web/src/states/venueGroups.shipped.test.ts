import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { parsePackPlaces } from "./packPlaces";
import { venuesToCsv, venuesToText } from "./venueExport";
import { buildVenueGroups, venueSummary } from "./venueGroups";

const places = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places).places;

describe("venue groups on the shipped pack", () => {
  const d = buildVenueGroups(places);
  it("has places to read", () => {
    expect(places.length).toBeGreaterThan(5);
  });
  it("finds the Sankofa Square venue with a main place, an entrance, an elevator and parking", () => {
    const g = d.groups.find((x) => x.label === "Sankofa Square")!;
    expect(g).toBeTruthy();
    expect(g.members.map((m) => m.kind)).toEqual(["main", "entrance", "elevator", "parking"]);
  });
  it("gives each part the tag the pack gives it, never one inferred from another part", () => {
    const g = d.groups.find((x) => x.label === "Sankofa Square")!;
    const byId = new Map(places.map((p) => [p.id, p] as const));
    for (const m of g.members) expect(m.tag).toBe(byId.get(m.id)!.tag);
    expect(g.tagsDiffer).toBe(true);
  });
  it("puts the entrance parts of The Tenor in one venue", () => {
    const g = d.groups.find((x) => /tenor/i.test(x.label));
    expect(g).toBeTruthy();
    expect(g!.members.length).toBeGreaterThanOrEqual(2);
  });
  it("accounts for each place at most once and groups no more places than there are", () => {
    const ids = d.groups.flatMap((g) => g.members.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(d.grouped).toBeLessThanOrEqual(places.length);
  });
  it("gives the same text and CSV for the same pack in another order", () => {
    const r = [...places].reverse();
    for (const locale of ["en", "fr"] as const) {
      expect(venuesToText(buildVenueGroups(r), locale)).toBe(venuesToText(d, locale));
      expect(venuesToCsv(buildVenueGroups(r), locale)).toBe(venuesToCsv(d, locale));
    }
  });
  it("states counts that match the data", () => {
    expect(venueSummary(d, "en")[0]).toBe(`${d.grouped} of ${d.placeCount} places fall into ${d.groups.length} ${d.groups.length === 1 ? "venue" : "venues"} by name.`);
  });
  it("keeps every member within the radius of another member when both have a map point", () => {
    for (const g of d.groups) {
      const located = g.members.filter((m) => m.basis === "map" && !m.first && m.metres !== null);
      for (const m of located) expect(m.metres!).toBeLessThan(5000);
    }
  });
});
