import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { venuesToCsv, venuesToText } from "./venueExport";
import { buildVenueGroups, filterVenues, kindTagRows, venueNotes, venueNoteText } from "./venueGroups";

const at = (id: string, name: string | null, lat: number | null, lon: number | null, wheelchair: string | null = "yes") => place(id, { name, lat, lon, wheelchair });
const LAT = 45.5;
const LON = -73.57;
const frList = [
  at("m", "Place Ville-Marie", LAT, LON, "yes"),
  at("e", "Entrée de la Place Ville-Marie", LAT + 0.0004, LON, "no"),
  at("a", "Ascenseur de la Place Ville-Marie", LAT + 0.0004, LON + 0.0002, "yes"),
  at("s", "Stationnement de la Place Ville-Marie", LAT + 0.0009, LON, null),
  at("t", "Toilettes de la Place Ville-Marie", LAT + 0.0005, LON, "limited"),
  at("r", "Rampe de la Place Ville-Marie", LAT + 0.0003, LON, "designated"),
];

describe("venue groups with French names", () => {
  const d = buildVenueGroups(frList);
  it("joins a French venue with its parts, articles and accents ignored", () => {
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.members.map((m) => m.kind)).toEqual(["main", "entrance", "elevator", "parking", "washroom", "ramp"]);
  });
  it("labels the venue with the main place's own name, accents kept", () => {
    expect(d.groups[0]!.label).toBe("Place Ville-Marie");
  });
  it("joins parts typed with and without accents", () => {
    const x = buildVenueGroups([at("a", "Musée", LAT, LON), at("b", "Entree du Musee", LAT, LON), at("c", "ENTRÉE MUSÉE", LAT, LON)]);
    expect(x.groups[0]!.members).toHaveLength(3);
  });
  it("joins a name with an elided article to the same name without it", () => {
    const x = buildVenueGroups([at("a", "L’Hôtel de Ville", LAT, LON), at("b", "Entrée de l'Hôtel de Ville", LAT, LON)]);
    expect(x.groups[0]!.members).toHaveLength(2);
  });
  it("keeps the tags the pack gives each part, with designated and limited as they are", () => {
    expect(d.groups[0]!.tagCounts).toEqual({ yes: 2, limited: 1, no: 1, designated: 1, unknown: 1 });
    expect(d.groups[0]!.tagsDiffer).toBe(true);
  });
  it("writes the French text with French part names, tags and spaced colons, never INCONNU", () => {
    const text = venuesToText(d, "fr");
    expect(text).toContain("Place Ville-Marie\u00a0: 6 parties");
    expect(text).toContain("- Entrée\u00a0: Entrée de la Place Ville-Marie — Non — ");
    expect(text).toContain("- Stationnement\u00a0: Stationnement de la Place Ville-Marie — UNKNOWN — ");
    expect(text).not.toMatch(/INCONN/i);
  });
  it("writes the French CSV with French part names and a decimal comma in quotes", () => {
    const csv = venuesToCsv(d, "fr");
    expect(csv).toContain("Ascenseur");
    expect(csv).toContain("Rampe");
    expect(csv.split("\r\n")[0]).toContain("Mètres depuis la première partie");
  });
  it("counts the French parts by kind and tag", () => {
    const rows = kindTagRows(d.groups);
    expect(rows.map((r) => r.kind)).toEqual(["main", "entrance", "elevator", "parking", "washroom", "ramp"]);
    expect(rows.find((r) => r.kind === "parking")!.counts.unknown).toBe(1);
    expect(rows.find((r) => r.kind === "ramp")!.counts.designated).toBe(1);
  });
  it("finds the venue by a typed word with no accents or article", () => {
    expect(filterVenues(d.groups, { query: "ville", kinds: [], differOnly: false })).toHaveLength(1);
    expect(filterVenues(d.groups, { query: "marie", kinds: ["ramp"], differOnly: false })).toHaveLength(1);
    expect(filterVenues(d.groups, { query: "montreal", kinds: [], differOnly: false })).toHaveLength(0);
  });
  it("writes the card note in French for each part, listing the other parts with their tags", () => {
    const note = venueNotes(frList).get("e")!;
    const text = venueNoteText(note, "fr");
    expect(text).toContain("Dans le pack avec 5 autres parties de Place Ville-Marie");
    expect(text).toContain("lieu principal Oui");
    expect(text).toContain("stationnement UNKNOWN");
    expect(text).not.toContain("entrée Non");
  });
  it("does not join a French venue to a different venue that shares only a first word", () => {
    const x = buildVenueGroups([at("a", "Place Ville-Marie", LAT, LON), at("b", "Place Jacques-Cartier", LAT, LON), at("c", "Entrée Place Jacques-Cartier", LAT, LON)]);
    expect(x.groups).toHaveLength(1);
    expect(x.groups[0]!.members.map((m) => m.id).sort()).toEqual(["b", "c"]);
  });
  it("treats a part of a venue with no main place as a venue of parts, labelled with the venue name as written, accents kept", () => {
    const x = buildVenueGroups([at("e", "Entrée du Musée", LAT, LON), at("a", "Ascenseur du Musée", LAT, LON)]);
    expect(x.groups[0]!.label).toBe("Musée");
    expect(x.groups[0]!.members.map((m) => m.kind)).toEqual(["entrance", "elevator"]);
  });
});
