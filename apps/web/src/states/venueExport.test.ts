import { describe, expect, it } from "vitest";
import { place, varied } from "./placeFixtures";
import { VENUE_CSV_FILENAMES, VENUE_TEXT_FILENAMES, venuesToCsv, venuesToText } from "./venueExport";
import { buildVenueGroups, onlyDiffering } from "./venueGroups";
import { lintFrench } from "./typography";

const at = (id: string, name: string | null, lat: number | null, lon: number | null, wheelchair: string | null = "yes") => place(id, { name, lat, lon, wheelchair });
const LAT = 43.65;
const LON = -79.38;
const list = [at("a", "Hall", LAT, LON, "yes"), at("b", "Hall Entrance", LAT + 0.0005, LON, "no"), at("c", "Hall Elevator", null, null, null), at("x", "Solo", LAT, LON), at("y", "Diner", LAT + 0.05, LON), at("z", "Diner", LAT + 0.1, LON)];
const d = buildVenueGroups(list);
const rows = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter((l) => l !== "");

describe("file names", () => {
  it("differ by language", () => {
    expect(VENUE_TEXT_FILENAMES).toEqual({ en: "venues-by-name.txt", fr: "lieux-par-nom.txt" });
    expect(VENUE_CSV_FILENAMES).toEqual({ en: "venues-by-name.csv", fr: "lieux-par-nom.csv" });
  });
});

describe("venuesToText", () => {
  const text = venuesToText(d, "en");
  it("starts with a title, the summary and the caveat", () => {
    const l = text.split("\n");
    expect(l[0]).toBe("Venues by name");
    expect(l[2]).toBe("3 of 6 places fall into 1 venue by name.");
    expect(text).toContain("does not mean an entrance leads to the place");
  });
  it("has a block for the venue with each part, its tag and its distance", () => {
    expect(text).toContain("\nHall: 3 parts\n- Main place: Hall — Yes — starting point\n- Entrance: Hall Entrance — No — 56\u00a0m\n");
  });
  it("lists the parts by kind and tag before the venues", () => {
    expect(text).toContain("\nParts by kind and wheelchair tag\n- Main place: Yes 1\n- Entrance: No 1\n- Elevator: UNKNOWN 1\n\nHall: 3 parts");
  });
  it("leaves the kind table out when no venue is written", () => {
    expect(venuesToText(d, "en", [])).not.toContain("Parts by kind and wheelchair tag");
  });
  it("writes the kind table in French with spaced colons", () => {
    expect(venuesToText(d, "fr")).toContain("Parties par type et étiquette fauteuil roulant\n- Lieu principal\u00a0: Oui 1\n");
  });
  it("says a part joined by name only is, and writes UNKNOWN for its tag and distance", () => {
    expect(text).toContain("- Elevator: Hall Elevator — UNKNOWN — UNKNOWN (joined by name only)\n");
  });
  it("mentions a name shared by far-apart places in the summary, not as a block", () => {
    expect(text).toMatch(/Diner: 2 places have this name/);
    expect(text).not.toContain("Diner: 2 parts");
  });
  it("writes only the venues it is given when asked", () => {
    const none = venuesToText(d, "en", []);
    expect(none).not.toContain("Hall: 3 parts");
    expect(venuesToText(d, "en", onlyDiffering(d.groups))).toContain("Hall: 3 parts");
  });
  it("uses LF only and ends with exactly one", () => {
    expect(text).not.toContain("\r");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
  it("is French with spaced colons, French part names and the token UNKNOWN", () => {
    const fr = venuesToText(d, "fr");
    expect(fr.split("\n")[0]).toBe("Lieux par nom");
    expect(fr).toContain("\nHall\u00a0: 3 parties\n- Lieu principal\u00a0: Hall — Oui — point de départ\n");
    expect(fr).toContain("- Ascenseur\u00a0: Hall Elevator — UNKNOWN — UNKNOWN (joint par le nom seulement)");
    expect(fr).not.toMatch(/INCONN/i);
    for (const l of fr.split("\n").filter((x) => /^(Lieux|Les lieux|Hall|- )/.test(x) && !x.includes("Hall"))) expect(lintFrench(l), l).toEqual([]);
  });
  it("writes UNKNOWN for a part with no name", () => {
    const x = buildVenueGroups([at("a", "Hall", LAT, LON), at("b", "Hall Door", LAT, LON)]);
    expect(venuesToText(x, "en")).not.toContain("null");
  });
});

describe("venuesToCsv", () => {
  const csv = venuesToCsv(d, "en");
  it("begins with a byte order mark and a header, and ends with CRLF", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows(csv)[0]).toBe("Venue,Part,Place,Place id,Wheelchair tag,Metres from the first part,Joined by");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("has one row for each part of each venue", () => {
    expect(rows(csv)).toHaveLength(1 + 3);
  });
  it("writes zero for the first part, a whole number of metres, and UNKNOWN when there is none", () => {
    const r = rows(csv);
    expect(r[1]).toBe("Hall,Main place,Hall,a,Yes,0,name and map point");
    expect(r[2]).toMatch(/^Hall,Entrance,Hall Entrance,b,No,5\d,name and map point$/);
    expect(r[3]).toBe("Hall,Elevator,Hall Elevator,c,UNKNOWN,UNKNOWN,name only");
  });
  it("is French with the French header and words", () => {
    const fr = venuesToCsv(d, "fr");
    expect(rows(fr)[0]).toBe("Lieu,Partie,Nom,Identifiant du lieu,Étiquette fauteuil roulant,Mètres depuis la première partie,Regroupé par");
    expect(fr).toContain("Lieu principal");
    expect(fr).toContain("nom seulement");
    expect(fr).not.toMatch(/INCONN/i);
  });
  it("quotes names with commas and quotes", () => {
    const x = buildVenueGroups([at("a", 'Hall, "A"', LAT, LON), at("b", 'Hall, "A" Door', LAT, LON)]);
    const out = rows(venuesToCsv(x, "en"));
    expect(out[1]!.startsWith('"Hall, ""A""",Main place,"Hall, ""A""",a,')).toBe(true);
  });
  it("defuses a name that starts like a formula", () => {
    const x = buildVenueGroups([at("a", "=Hall", LAT, LON), at("b", "=Hall Door", LAT, LON)]);
    expect(venuesToCsv(x, "en")).toContain("'=Hall");
  });
  it("has a row for every grouped place in generated lists", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = buildVenueGroups(varied(seed, 25));
      expect(rows(venuesToCsv(g, "en"))).toHaveLength(1 + g.grouped);
    }
  });
  it("keeps each row on one line even when a name has a line break", () => {
    const x = buildVenueGroups([at("a", "Line\nbreak", LAT, LON), at("b", "Line break Door", LAT, LON)]);
    expect(rows(venuesToCsv(x, "en")).length).toBe(1 + x.grouped);
  });
});
