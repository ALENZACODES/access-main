import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { bare, place, varied } from "./placeFixtures";
import { DEFAULT_STREET_ORDER, STREET_ORDERS, buildStreetIndex, compareNames, orderGroups, orderLabel, streetCaveat, streetGroupLine, streetSummary } from "./streetIndex";
import { lintFrench } from "./typography";

const at = (id: string, address: string | null, over: Record<string, unknown> = {}) => place(id, { name: `Place ${id}`, address, ...over });
const list = [
  at("a", "279 Yonge St"),
  at("b", "281 Yonge Street", { wheelchair: null }),
  at("c", "20 Dundas Square", { wheelchair: "no" }),
  at("d", "1 Dundas Street East"),
  at("e", "Unit 2, 100 Yonge St", { wheelchair: null }),
  at("f", "PO Box 9"),
  at("g", "King & Bay"),
  bare("h"),
  at("i", "279 Yonge Street, Unit 3", { wheelchair: "limited" }),
];

describe("buildStreetIndex", () => {
  const d = buildStreetIndex(list, "en", "name");
  it("groups places by street, joining St and Street", () => {
    const yonge = d.groups.find((g) => g.key === "yonge street")!;
    expect(yonge.entries.map((e) => e.id)).toEqual(["e", "a", "i", "b"]);
    expect(yonge.name).toBe("Yonge Street");
  });
  it("keeps the two sides of a divided street apart from the street itself", () => {
    expect(d.groups.map((g) => g.key).sort()).toEqual(["dundas square", "dundas street E", "yonge street"]);
  });
  it("counts places on a street and streets with two or more", () => {
    expect(d.onStreet).toBe(6);
    expect(d.placeCount).toBe(9);
    expect(d.sharedStreets).toBe(1);
  });
  it("sets aside post office boxes, corners and places with no address, never placing them on a street", () => {
    expect(d.poBoxIds).toEqual(["f"]);
    expect(d.intersectionIds).toEqual(["g"]);
    expect(d.noAddressIds).toEqual(["h"]);
    const onStreetIds = d.groups.flatMap((g) => g.entries.map((e) => e.id));
    for (const id of ["f", "g", "h"]) expect(onStreetIds).not.toContain(id);
  });
  it("puts every place in exactly one place: a street or one of the three lists", () => {
    const ids = [...d.groups.flatMap((g) => g.entries.map((e) => e.id)), ...d.poBoxIds, ...d.intersectionIds, ...d.noAddressIds].sort();
    expect(ids).toEqual(list.map((p) => p.id).sort());
  });
  it("sorts entries by house number, then numberless ones last, then by id", () => {
    const x = buildStreetIndex([at("z", "Main Street"), at("y", "20 Main Street"), at("x", "3 Main Street"), at("w", "20 Main Street")], "en");
    expect(x.groups[0]!.entries.map((e) => e.id)).toEqual(["x", "w", "y", "z"]);
  });
  it("writes odd or even from the number, and nothing when there is none", () => {
    const yonge = d.groups.find((g) => g.key === "yonge street")!;
    expect(yonge.entries.map((e) => e.parity)).toEqual(["even", "odd", "odd", "odd"]);
    expect(buildStreetIndex([at("z", "Main Street")], "en").groups[0]!.entries[0]!.parity).toBeNull();
  });
  it("carries the unit and the address exactly as given", () => {
    const e = d.groups.find((g) => g.key === "yonge street")!.entries.find((x) => x.id === "e")!;
    expect(e.unit).toBe("Unit 2");
    expect(e.address).toBe("Unit 2, 100 Yonge St");
  });
  it("counts the wheelchair tags on each street, UNKNOWN included", () => {
    const yonge = d.groups.find((g) => g.key === "yonge street")!;
    expect(yonge.tagCounts).toEqual({ yes: 1, limited: 1, no: 0, designated: 0, unknown: 2 });
    expect(yonge.unknownCount).toBe(2);
    const total = Object.values(yonge.tagCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(yonge.entries.length);
  });
  it("names the places that share a number and street, and no others", () => {
    const yonge = d.groups.find((g) => g.key === "yonge street")!;
    expect([...yonge.sameAddressIds].sort()).toEqual(["a", "i"]);
    expect(d.groups.find((g) => g.key === "dundas square")!.sameAddressIds).toEqual([]);
  });
  it("does not call two numberless places the same address", () => {
    const x = buildStreetIndex([at("a", "Main Street"), at("b", "Main Street")], "en");
    expect(x.groups[0]!.sameAddressIds).toEqual([]);
  });
  it("gives an empty index for no places", () => {
    expect(buildStreetIndex([], "en")).toMatchObject({ groups: [], onStreet: 0, placeCount: 0, sharedStreets: 0, noAddressIds: [], poBoxIds: [], intersectionIds: [] });
  });
  it("does not change the places it is given", () => {
    const before = JSON.stringify(list);
    buildStreetIndex(list, "fr", "gaps");
    expect(JSON.stringify(list)).toBe(before);
  });
  it("gives the same answer every time", () => {
    expect(JSON.stringify(buildStreetIndex(list, "en"))).toBe(JSON.stringify(buildStreetIndex([...list].reverse(), "en")));
  });
  it("lists the places set apart in id order whatever order they came in", () => {
    const x = buildStreetIndex([bare("z"), bare("m"), bare("a")], "en");
    expect(x.noAddressIds).toEqual(["a", "m", "z"]);
    const y = buildStreetIndex([at("q", "PO Box 1"), at("b", "PO Box 2")], "en");
    expect(y.poBoxIds).toEqual(["b", "q"]);
  });
  it("keeps the order option it was given", () => {
    for (const o of STREET_ORDERS) expect(buildStreetIndex(list, "en", o).order).toBe(o);
    expect(buildStreetIndex(list, "en").order).toBe(DEFAULT_STREET_ORDER);
  });
});

describe("street orders", () => {
  const many = [at("a", "1 Zed St"), at("b", "1 Alpha St"), at("c", "2 Alpha St"), at("d", "1 Mid St", { wheelchair: null }), at("e", "2 Mid St", { wheelchair: null }), at("f", "3 Mid St"), at("g", "1 Étoile St")];
  const keys = (o: (typeof STREET_ORDERS)[number], locale: "en" | "fr" = "en") => buildStreetIndex(many, locale, o).groups.map((g) => g.key);
  it("by name: A to Z with accents ignored", () => {
    expect(keys("name")).toEqual(["alpha street", "etoile street", "mid street", "zed street"]);
  });
  it("by count: most places first, then by name", () => {
    expect(keys("count")).toEqual(["mid street", "alpha street", "etoile street", "zed street"]);
  });
  it("by gaps: most UNKNOWN first, then most places, then name", () => {
    expect(keys("gaps")).toEqual(["mid street", "alpha street", "etoile street", "zed street"]);
    const x = buildStreetIndex([at("a", "1 A St"), at("b", "1 B St", { wheelchair: null }), at("c", "1 C St", { wheelchair: null }), at("d", "2 C St")], "en", "gaps");
    expect(x.groups.map((g) => g.key)).toEqual(["c street", "b street", "a street"]);
  });
  it("orderGroups does not change the array it is given", () => {
    const groups = buildStreetIndex(many, "en", "name").groups;
    const copy = [...groups];
    orderGroups(groups, "count", "en");
    expect(groups).toEqual(copy);
  });
  it("sorts a tie on the name and then on the key so it never moves between renders", () => {
    const a = buildStreetIndex([at("a", "1 Elm St"), at("b", "1 Elm Rd")], "en", "count").groups.map((g) => g.key);
    const b = buildStreetIndex([at("b", "1 Elm Rd"), at("a", "1 Elm St")], "en", "count").groups.map((g) => g.key);
    expect(a).toEqual(b);
  });
  it("compareNames follows the language: numbers inside names sort as numbers", () => {
    expect(compareNames("Highway 7", "Highway 10", "en")).toBeLessThan(0);
    expect(compareNames("éclair", "Eclair", "fr")).toBe(0);
    expect(compareNames("b", "a", "en")).toBeGreaterThan(0);
  });
  it("has a label for every order in both languages", () => {
    for (const o of STREET_ORDERS) {
      expect(orderLabel(o, "en")).not.toBe("");
      expect(orderLabel(o, "fr")).not.toBe(orderLabel(o, "en"));
    }
  });
});

describe("streetSummary", () => {
  const d = buildStreetIndex(list, "en");
  it("says how many places are on a street and how many streets", () => {
    expect(streetSummary(d, "en")[0]).toBe("6 of 9 places have an address that reads as one street, on 3 streets.");
  });
  it("says how many streets have two or more places", () => {
    expect(streetSummary(d, "en")[1]).toBe("1 street has two or more listed places.");
  });
  it("says how many places are not on a street and why", () => {
    expect(streetSummary(d, "en")[2]).toBe("3 places are not on a street here: no address (UNKNOWN), a post office box, or a corner.");
  });
  it("uses singular forms for one", () => {
    const x = buildStreetIndex([at("a", "1 Main St"), bare("b")], "en");
    const s = streetSummary(x, "en");
    expect(s[0]).toBe("1 of 2 places have an address that reads as one street, on 1 street.");
    expect(s[1]).toBe("1 place is not on a street here: no address (UNKNOWN), a post office box, or a corner.");
  });
  it("leaves out the sentences that do not apply", () => {
    const x = buildStreetIndex([at("a", "1 Main St")], "en");
    expect(streetSummary(x, "en")).toHaveLength(1);
  });
  it("is French with a spaced colon and the token UNKNOWN", () => {
    const s = streetSummary(d, "fr");
    expect(s[0]).toBe("6 lieux sur 9 ont une adresse qui se lit comme une seule rue, sur 3 rues.");
    expect(s[2]).toContain("sur une rue ici\u00a0: aucune adresse (UNKNOWN)");
    expect(s.join(" ")).not.toMatch(/INCONN/i);
  });
  it("passes the copy checks and French typography, in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const s of [...streetSummary(d, locale), streetCaveat(locale), ...d.groups.map((g) => streetGroupLine(g, locale))]) {
        expect(lintCopy(s, locale), s).toEqual([]);
        if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    }
  });
  it("says that an odd or even number does not give the side of the street", () => {
    expect(streetCaveat("en")).toContain("does not tell you which side of the street");
    expect(streetCaveat("fr")).toContain("n’indique pas de quel côté de la rue");
  });
  it("never ranks or recommends", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = [...streetSummary(buildStreetIndex(varied(3, 15), locale), locale), streetCaveat(locale)].join(" ");
      expect(text).not.toMatch(/\b(best|better|ideal|recommended|should visit|easy|easier|safe|safer)\b|meilleur|idéal|recommand|facile|sûr/i);
    }
  });
});

describe("streetGroupLine", () => {
  const d = buildStreetIndex(list, "en", "name");
  const yonge = d.groups.find((g) => g.key === "yonge street")!;
  it("names the street, the number of places and how many have the tag UNKNOWN", () => {
    expect(streetGroupLine(yonge, "en")).toBe("Yonge Street: 4 places, 2 with the wheelchair tag UNKNOWN");
  });
  it("leaves out the UNKNOWN part when there is none, and uses the singular", () => {
    expect(streetGroupLine(d.groups.find((g) => g.key === "dundas square")!, "en")).toBe("Dundas Square: 1 place");
  });
  it("spaces the French colon", () => {
    expect(streetGroupLine(yonge, "fr")).toBe("Yonge Street\u00a0: 4 lieux, 2 avec l’étiquette fauteuil roulant UNKNOWN");
  });
});

describe("generated lists", () => {
  it("always account for every place once", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const ps = varied(seed, 30);
      const d = buildStreetIndex(ps, "en");
      const ids = [...d.groups.flatMap((g) => g.entries.map((e) => e.id)), ...d.poBoxIds, ...d.intersectionIds, ...d.noAddressIds];
      expect(ids.sort(), `seed ${seed}`).toEqual(ps.map((p) => p.id).sort());
      expect(d.onStreet).toBe(d.groups.reduce((n, g) => n + g.entries.length, 0));
    }
  });
});
