import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { place, varied } from "./placeFixtures";
import { VENUE_RADIUS_METRES, buildVenueGroups, groupHeading, memberDistance, onlyDiffering, venueCaveat, venueSummary } from "./venueGroups";
import { lintFrench } from "./typography";

const at = (id: string, name: string | null, lat: number | null, lon: number | null, wheelchair: string | null = "yes") => place(id, { name, lat, lon, wheelchair });
const LAT = 43.65;
const LON = -79.38;
// 0.0005 degrees of latitude is about 55 m; 0.005 is about 555 m.
const near = (i: number) => LAT + i * 0.0005;
const far = (i: number) => LAT + i * 0.005;

const sankofa = [
  at("a", "Sankofa Square", near(0), LON, "yes"),
  at("b", "Sankofa Square Entrance", near(1), LON, "no"),
  at("c", "Sankofa Square Elevator", near(1), LON + 0.0003, "yes"),
  at("d", "Sankofa Square Underground Parking", near(2), LON, "yes"),
];

describe("buildVenueGroups: one venue", () => {
  const d = buildVenueGroups(sankofa);
  it("groups a main place with its parts", () => {
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.members.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    expect(d.grouped).toBe(4);
    expect(d.placeCount).toBe(4);
  });
  it("orders the parts main, entrance, elevator, parking whatever order they came in", () => {
    const x = buildVenueGroups([...sankofa].reverse());
    expect(x.groups[0]!.members.map((m) => m.kind)).toEqual(["main", "entrance", "elevator", "parking"]);
  });
  it("labels the venue with the main place's name", () => {
    expect(d.groups[0]!.label).toBe("Sankofa Square");
  });
  it("labels the venue from its base name when there is no main place", () => {
    const x = buildVenueGroups([at("b", "Sankofa Square Entrance", near(1), LON), at("c", "Sankofa Square Elevator", near(1), LON)]);
    expect(x.groups[0]!.label).toBe("Sankofa Square");
  });
  it("measures from the first member and gives the first no distance", () => {
    const [first, second] = d.groups[0]!.members;
    expect(first!.first).toBe(true);
    expect(first!.metres).toBeNull();
    expect(second!.first).toBe(false);
    expect(second!.metres).toBeGreaterThan(40);
    expect(second!.metres).toBeLessThan(70);
  });
  it("counts the wheelchair tags and says whether they differ", () => {
    expect(d.groups[0]!.tagCounts).toEqual({ yes: 3, limited: 0, no: 1, designated: 0, unknown: 0 });
    expect(d.groups[0]!.tagsDiffer).toBe(true);
  });
  it("says the tags do not differ when they are all the same, UNKNOWN included", () => {
    const same = sankofa.map((p, i) => at(p.id, p.name, near(i), LON, "yes"));
    expect(buildVenueGroups(same).groups[0]!.tagsDiffer).toBe(false);
    const unk = sankofa.map((p, i) => at(p.id, p.name, near(i), LON, null));
    expect(buildVenueGroups(unk).groups[0]!.tagsDiffer).toBe(false);
  });
  it("treats UNKNOWN as a tag that differs from a given one", () => {
    const x = buildVenueGroups([at("a", "Hall", near(0), LON, "yes"), at("b", "Hall Entrance", near(0), LON, null)]);
    expect(x.groups[0]!.tagsDiffer).toBe(true);
  });
  it("gives the widest straight line between located members", () => {
    expect(d.groups[0]!.spanMetres).toBeGreaterThan(100);
    expect(d.groups[0]!.spanMetres).toBeLessThan(120);
  });
  it("marks a member put here by the map as map", () => {
    for (const m of d.groups[0]!.members) expect(m.basis).toBe("map");
  });
});

describe("buildVenueGroups: what is not grouped", () => {
  it("leaves out a place with a name of its own", () => {
    const d = buildVenueGroups([...sankofa, at("z", "Dundas Square", near(0), LON)]);
    expect(d.groups).toHaveLength(1);
    expect(d.grouped).toBe(4);
  });
  it("leaves out places with no name", () => {
    const d = buildVenueGroups([at("a", null, near(0), LON), at("b", null, near(0), LON)]);
    expect(d.groups).toEqual([]);
  });
  it("leaves out a part word alone, which names no venue", () => {
    const d = buildVenueGroups([at("a", "Entrance", near(0), LON), at("b", "Entrance", near(0), LON)]);
    expect(d.groups).toEqual([]);
  });
  it("does not group one place with itself", () => {
    expect(buildVenueGroups([sankofa[0]!]).groups).toEqual([]);
  });
  it("gives an empty result for no places", () => {
    expect(buildVenueGroups([])).toEqual({ groups: [], apart: [], unplacedIds: [], placeCount: 0, grouped: 0 });
  });
  it("splits parts that are too far apart and says the name is shared", () => {
    const d = buildVenueGroups([at("a", "Jack Astor's", near(0), LON), at("b", "Jack Astor's", far(2), LON)]);
    expect(d.groups).toEqual([]);
    expect(d.apart).toHaveLength(1);
    expect(d.apart[0]).toMatchObject({ key: "jack astor's", label: "Jack Astor's", places: 2 });
    expect(d.apart[0]!.nearestMetres).toBeGreaterThan(VENUE_RADIUS_METRES);
  });
  it("keeps the near parts of a far-apart name as groups and the far one apart", () => {
    const d = buildVenueGroups([at("a", "Hall", near(0), LON), at("b", "Hall Entrance", near(1), LON), at("c", "Hall", far(4), LON)]);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.members.map((m) => m.id)).toEqual(["a", "b"]);
    expect(d.apart[0]).toMatchObject({ key: "hall", places: 2 });
  });
  it("chains parts that are each within the radius of the next, even if the ends are further apart", () => {
    const step = 0.0016; // about 178 m
    const d = buildVenueGroups([at("a", "Hall", LAT, LON), at("b", "Hall Entrance", LAT + step, LON), at("c", "Hall Parking", LAT + 2 * step, LON)]);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.members).toHaveLength(3);
    expect(d.groups[0]!.spanMetres).toBeGreaterThan(VENUE_RADIUS_METRES);
  });
  it("uses the radius as an inclusive limit", () => {
    const just = 0.0017; // about 189 m, inside
    const over = 0.0023; // about 256 m, outside
    expect(buildVenueGroups([at("a", "Hall", LAT, LON), at("b", "Hall Entrance", LAT + just, LON)]).groups).toHaveLength(1);
    expect(buildVenueGroups([at("a", "Hall", LAT, LON), at("b", "Hall Entrance", LAT + over, LON)]).groups).toHaveLength(0);
  });
});

describe("buildVenueGroups: places with no map point", () => {
  it("joins a place with no map point when only one venue has the name, and says by name only", () => {
    const d = buildVenueGroups([at("a", "Hall", near(0), LON), at("b", "Hall Entrance", null, null)]);
    expect(d.groups[0]!.members.map((m) => [m.id, m.basis])).toEqual([["a", "map"], ["b", "name"]]);
    expect(d.groups[0]!.members[1]!.metres).toBeNull();
  });
  it("groups places that all have no map point, by name only", () => {
    const d = buildVenueGroups([at("a", "Hall", null, null), at("b", "Hall Entrance", null, null)]);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.members.every((m) => m.basis === "name")).toBe(true);
    expect(d.groups[0]!.spanMetres).toBeNull();
  });
  it("does not choose a venue for a place with no map point when two venues share the name", () => {
    const d = buildVenueGroups([at("a", "Hall", near(0), LON), at("b", "Hall", far(4), LON), at("c", "Hall Entrance", null, null)]);
    expect(d.unplacedIds).toEqual(["c"]);
    for (const g of d.groups) expect(g.members.map((m) => m.id)).not.toContain("c");
  });
  it("lists unplaced ids in id order whatever order they came in", () => {
    const list = [at("a", "Hall", near(0), LON), at("b", "Hall", far(4), LON), at("z", "Hall Door", null, null), at("m", "Hall Ramp", null, null)];
    expect(buildVenueGroups(list).unplacedIds).toEqual(["m", "z"]);
    expect(buildVenueGroups([...list].reverse()).unplacedIds).toEqual(["m", "z"]);
  });
  it("never counts a place with no map point as measured", () => {
    const d = buildVenueGroups([at("a", "Hall", near(0), LON), at("b", "Hall Entrance", null, null), at("c", "Hall Parking", near(1), LON)]);
    expect(d.groups[0]!.members.find((m) => m.id === "b")!.metres).toBeNull();
    expect(d.groups[0]!.spanMetres).not.toBeNull();
  });
});

describe("buildVenueGroups: other properties", () => {
  it("accounts for each place at most once", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const d = buildVenueGroups(varied(seed, 30));
      const ids = d.groups.flatMap((g) => g.members.map((m) => m.id));
      expect(new Set(ids).size, `seed ${seed}`).toBe(ids.length);
      expect(d.grouped).toBe(ids.length);
    }
  });
  it("gives the same groups for the same places in another order", () => {
    const list = [...sankofa, at("e", "Jack Astor's", far(5), LON), at("f", "Jack Astor's", far(9), LON), at("g", "Hall", null, null), at("h", "Hall Entrance", null, null)];
    expect(JSON.stringify(buildVenueGroups(list))).toBe(JSON.stringify(buildVenueGroups([...list].reverse())));
  });
  it("sorts the venues by size, then by name", () => {
    const d = buildVenueGroups([at("a", "Beta", near(0), LON), at("b", "Beta Door", near(0), LON), at("c", "Alpha", far(8), LON), at("d", "Alpha Door", far(8), LON), ...sankofa.map((p, i) => at(`s${i}`, p.name, far(20) + i * 0.0005, LON))]);
    expect(d.groups.map((g) => g.label)).toEqual(["Sankofa Square", "Alpha", "Beta"]);
  });
  it("does not change the places it is given", () => {
    const before = JSON.stringify(sankofa);
    buildVenueGroups(sankofa);
    expect(JSON.stringify(sankofa)).toBe(before);
  });
  it("onlyDiffering keeps the venues whose tags differ, in order", () => {
    const d = buildVenueGroups([...sankofa, at("x", "Hall", far(8), LON), at("y", "Hall Door", far(8), LON)]);
    expect(onlyDiffering(d.groups).map((g) => g.label)).toEqual(["Sankofa Square"]);
    expect(onlyDiffering([])).toEqual([]);
  });
});

describe("venueSummary, venueCaveat, groupHeading and memberDistance", () => {
  const d = buildVenueGroups([...sankofa, at("e", "Jack Astor's", far(5), LON), at("f", "Jack Astor's", far(9), LON)]);
  it("says how many places fall into how many venues", () => {
    expect(venueSummary(d, "en")[0]).toBe("4 of 6 places fall into 1 venue by name.");
  });
  it("says how many venues have different tags", () => {
    expect(venueSummary(d, "en")[1]).toBe("1 venue has parts with different wheelchair tags in the pack.");
  });
  it("says which names are shared by places that are too far apart", () => {
    expect(venueSummary(d, "en").some((s) => /^Jack Astor's: 2 places have this name, at least [\d.,]+\u00a0(m|km) apart, so they are not grouped\.$/.test(s.replace(/\u202f/g, "\u00a0")))).toBe(true);
  });
  it("says when nothing is grouped", () => {
    expect(venueSummary(buildVenueGroups([]), "en")).toEqual(["No listed places share a venue name."]);
  });
  it("says how many places could not be placed", () => {
    const x = buildVenueGroups([at("a", "Hall", near(0), LON), at("b", "Hall", far(4), LON), at("c", "Hall Door", null, null)]);
    expect(venueSummary(x, "en").at(-1)).toBe("1 place has a name that fits more than one venue and no map point, so it is not grouped.");
  });
  it("is French with spaced colons and the token UNKNOWN", () => {
    const s = venueSummary(d, "fr");
    expect(s[0]).toBe("4 lieux sur 6 forment 1 lieu d’après le nom.");
    expect(s.some((l) => l.startsWith("Jack Astor\u2019s\u00a0: 2 lieux portent ce nom"))).toBe(true);
    expect(s.join(" ")).not.toMatch(/INCONN/i);
  });
  it("passes the copy checks and French typography in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const s of [...venueSummary(d, locale), venueCaveat(locale), ...d.groups.map((g) => groupHeading(g, locale))]) {
        expect(lintCopy(s, locale), s).toEqual([]);
        if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    }
  });
  it("says in the caveat that grouping does not mean an entrance leads to the place", () => {
    expect(venueCaveat("en")).toContain("does not mean an entrance leads to the place");
    expect(venueCaveat("en")).toContain("200 m");
    expect(venueCaveat("fr")).toContain("ne signifie pas qu’une entrée mène au lieu");
  });
  it("writes the heading with the number of parts", () => {
    expect(groupHeading(d.groups[0]!, "en")).toBe("Sankofa Square: 4 parts");
    expect(groupHeading(d.groups[0]!, "fr")).toBe("Sankofa Square\u00a0: 4 parties");
    const two = buildVenueGroups([at("a", "Hall", near(0), LON), at("b", "Hall Door", near(0), LON)]).groups[0]!;
    expect(groupHeading(two, "en")).toBe("Hall: 2 parts");
  });
  it("writes the distance of a member: starting point, a distance, or UNKNOWN", () => {
    const x = buildVenueGroups([at("a", "Hall", near(0), LON), at("b", "Hall Door", near(1), LON), at("c", "Hall Ramp", null, null)]).groups[0]!;
    expect(memberDistance(x.members[0]!, "en")).toBe("starting point");
    expect(memberDistance(x.members[0]!, "fr")).toBe("point de départ");
    expect(memberDistance(x.members[1]!, "en")).toMatch(/^55\u00a0m$|^5\d\u00a0m$/);
    expect(memberDistance(x.members[2]!, "en")).toBe("UNKNOWN");
  });
  it("never ranks or recommends", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = [...venueSummary(buildVenueGroups(varied(3, 20)), locale), venueCaveat(locale)].join(" ");
      expect(text).not.toMatch(/\b(best|better|ideal|recommended|should|easy|easier|safe|safer)\b|meilleur|idéal|recommand|facile|sûr/i);
    }
  });
});
