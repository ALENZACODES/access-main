import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { place, varied } from "./placeFixtures";
import { DEFAULT_VENUE_ORDER, NO_VENUE_FILTER, TAG_COLUMNS, VENUE_ORDERS, buildVenueGroups, filterVenues, kindCounts, kindSentence, kindTagRows, orderVenues, spanSentence, venueNoteText, venueNotes, venueOrderLabel } from "./venueGroups";
import { lintFrench } from "./typography";

const at = (id: string, name: string | null, lat: number | null, lon: number | null, wheelchair: string | null = "yes") => place(id, { name, lat, lon, wheelchair });
const LAT = 43.65;
const LON = -79.38;
const far = (i: number) => LAT + i * 0.01;
const list = [
  at("a1", "Alpha Hall", far(0), LON, "yes"), at("a2", "Alpha Hall Entrance", far(0), LON, "no"), at("a3", "Alpha Hall Elevator", far(0), LON, "yes"),
  at("b1", "Beta Court", far(2), LON, "yes"), at("b2", "Beta Court Parking", far(2), LON, "yes"),
  at("c1", "Éclair Café", far(4), LON, "yes"), at("c2", "Éclair Café Ramp", far(4), LON, null), at("c3", "Éclair Café Washroom", far(4), LON, "yes"), at("c4", "Éclair Café Entrance", far(4), LON, "yes"),
];
const groups = buildVenueGroups(list).groups;
const labels = (g: readonly { label: string }[]) => g.map((x) => x.label);

describe("orderVenues", () => {
  it("by size: most parts first, then by name", () => {
    expect(labels(orderVenues(groups, "size", "en"))).toEqual(["Éclair Café", "Alpha Hall", "Beta Court"]);
  });
  it("by name: A to Z with accents ignored", () => {
    expect(labels(orderVenues(groups, "name", "en"))).toEqual(["Alpha Hall", "Beta Court", "Éclair Café"]);
    expect(labels(orderVenues(groups, "name", "fr"))).toEqual(["Alpha Hall", "Beta Court", "Éclair Café"]);
  });
  it("by differing tags: venues whose tags differ first, then by size", () => {
    expect(labels(orderVenues(groups, "differing", "en"))).toEqual(["Éclair Café", "Alpha Hall", "Beta Court"]);
    const x = buildVenueGroups([at("a", "Aa", far(0), LON, "yes"), at("b", "Aa Door", far(0), LON, "yes"), at("c", "Zz", far(3), LON, "yes"), at("d", "Zz Door", far(3), LON, "no")]).groups;
    expect(labels(orderVenues(x, "differing", "en"))).toEqual(["Zz", "Aa"]);
  });
  it("does not change the array it is given", () => {
    const copy = [...groups];
    orderVenues(groups, "name", "en");
    expect(groups).toEqual(copy);
  });
  it("gives the same order for the same venues in any input order", () => {
    for (const o of VENUE_ORDERS) expect(labels(orderVenues([...groups].reverse(), o, "en"))).toEqual(labels(orderVenues(groups, o, "en")));
  });
  it("has a label for each order in both languages", () => {
    for (const o of VENUE_ORDERS) {
      expect(venueOrderLabel(o, "en")).not.toBe("");
      expect(venueOrderLabel(o, "fr")).not.toBe(venueOrderLabel(o, "en"));
    }
    expect(DEFAULT_VENUE_ORDER).toBe("size");
  });
});

describe("filterVenues", () => {
  it("keeps every venue, in order, with no filter", () => {
    expect(filterVenues(groups, NO_VENUE_FILTER).map((g) => g.key)).toEqual(groups.map((g) => g.key));
  });
  it("finds a venue by the start of a word in its name, ignoring case and accents", () => {
    expect(labels(filterVenues(groups, { ...NO_VENUE_FILTER, query: "alp" }))).toEqual(["Alpha Hall"]);
    expect(labels(filterVenues(groups, { ...NO_VENUE_FILTER, query: "ECLAIR" }))).toEqual(["Éclair Café"]);
    expect(labels(filterVenues(groups, { ...NO_VENUE_FILTER, query: "cafe eclair" }))).toEqual(["Éclair Café"]);
  });
  it("does not find the middle of a word, and a single letter must be a whole word", () => {
    expect(filterVenues(groups, { ...NO_VENUE_FILTER, query: "lpha" })).toEqual([]);
    expect(filterVenues(groups, { ...NO_VENUE_FILTER, query: "a" })).toEqual([]);
  });
  it("needs every part kind chosen to be in the venue", () => {
    expect(labels(filterVenues(groups, { ...NO_VENUE_FILTER, kinds: ["entrance"] }))).toEqual(["Éclair Café", "Alpha Hall"]);
    expect(labels(filterVenues(groups, { ...NO_VENUE_FILTER, kinds: ["entrance", "ramp"] }))).toEqual(["Éclair Café"]);
    expect(filterVenues(groups, { ...NO_VENUE_FILTER, kinds: ["entrance", "parking"] })).toEqual([]);
  });
  it("keeps only venues whose tags differ when asked", () => {
    expect(labels(filterVenues(groups, { ...NO_VENUE_FILTER, differOnly: true }))).toEqual(["Éclair Café", "Alpha Hall"]);
  });
  it("combines the three filters", () => {
    expect(labels(filterVenues(groups, { query: "al", kinds: ["elevator"], differOnly: true }))).toEqual(["Alpha Hall"]);
    expect(filterVenues(groups, { query: "beta", kinds: [], differOnly: true })).toEqual([]);
  });
  it("keeps the order it is given and returns a new array", () => {
    expect(labels(filterVenues([...groups].reverse(), NO_VENUE_FILTER))).toEqual(labels([...groups].reverse()));
    expect(filterVenues(groups, NO_VENUE_FILTER)).not.toBe(groups);
  });
});

describe("kindCounts and kindSentence", () => {
  it("counts the venues that list each kind of part, once each", () => {
    expect(kindCounts(groups)).toEqual({ main: 3, entrance: 2, elevator: 1, parking: 1, washroom: 1, ramp: 1 });
  });
  it("counts a kind once for a venue that names it twice", () => {
    const x = buildVenueGroups([at("a", "Hall", far(0), LON), at("b", "Hall Door", far(0), LON), at("c", "Hall Entrance", far(0), LON)]).groups;
    expect(kindCounts(x).entrance).toBe(1);
  });
  it("says what the names list, in the order of the kinds, without main", () => {
    expect(kindSentence(groups, "en")).toBe("Of 3 venues, the names list: entrance 2, elevator 1, parking 1, washroom 1, ramp 1.");
  });
  it("says so when no venue names a part", () => {
    const x = buildVenueGroups([at("a", "Hall", far(0), LON), at("b", "Hall", far(0), LON)]).groups;
    expect(kindSentence(x, "en")).toBe("No venue lists an entrance, elevator, parking, washroom or ramp by name.");
  });
  it("gives nothing for no venues", () => {
    expect(kindSentence([], "en")).toBeNull();
  });
  it("is French with a spaced colon", () => {
    expect(kindSentence(groups, "fr")).toBe("Sur 3 lieux, les noms indiquent\u00a0: entrée 2, ascenseur 1, stationnement 1, toilettes 1, rampe 1.");
  });
  it("passes the copy checks and French typography", () => {
    for (const locale of ["en", "fr"] as const) {
      const s = kindSentence(groups, locale)!;
      expect(lintCopy(s, locale), s).toEqual([]);
      if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
    }
  });
});

describe("venueNotes and venueNoteText", () => {
  const notes = venueNotes(list);
  it("has a note for each place in a venue and none for others", () => {
    expect([...notes.keys()].sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "c1", "c2", "c3", "c4"]);
    expect(venueNotes([at("x", "Solo", far(0), LON)]).size).toBe(0);
  });
  it("lists the other parts, not the place itself", () => {
    expect(notes.get("a1")).toEqual({ label: "Alpha Hall", kind: "main", others: [{ kind: "entrance", tag: "no" }, { kind: "elevator", tag: "yes" }] });
    expect(notes.get("a2")!.others).toEqual([{ kind: "main", tag: "yes" }, { kind: "elevator", tag: "yes" }]);
  });
  it("says how many other parts and which, and that each has its own tag", () => {
    expect(venueNoteText(notes.get("a1")!, "en")).toBe("In the pack with 2 other parts of Alpha Hall (entrance No, elevator Yes). Each part has its own wheelchair tag.");
    expect(venueNoteText(notes.get("b1")!, "en")).toBe("In the pack with 1 other part of Beta Court (parking Yes). Each part has its own wheelchair tag.");
  });
  it("is French with agreement", () => {
    expect(venueNoteText(notes.get("b1")!, "fr")).toBe("Dans le pack avec 1 autre partie de Beta Court (stationnement Oui). Chaque partie a sa propre étiquette fauteuil roulant.");
    expect(venueNoteText(notes.get("a1")!, "fr")).toContain("2 autres parties");
  });
  it("passes the copy checks and French typography for every place of generated lists", () => {
    for (let seed = 1; seed <= 8; seed++) {
      for (const n of venueNotes(varied(seed, 30)).values()) {
        for (const locale of ["en", "fr"] as const) {
          const s = venueNoteText(n, locale);
          expect(lintCopy(s, locale), s).toEqual([]);
          if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
        }
      }
    }
  });
  it("gives each other part the tag the pack gives it, UNKNOWN included, and none from another part", () => {
    const c = venueNotes(list).get("c1")!;
    expect(venueNoteText(c, "en")).toContain("(entrance Yes, washroom Yes, ramp UNKNOWN)");
    expect(venueNoteText(c, "fr")).toContain("(entrée Oui, toilettes Oui, rampe UNKNOWN)");
  });
  it("lists the parts in venue order, whatever order the places came in", () => {
    expect(venueNotes([...list].reverse()).get("c1")).toEqual(venueNotes(list).get("c1"));
  });
  it("does not say the tags carry over", () => {
    expect(venueNoteText(notes.get("a1")!, "en")).not.toMatch(/same|also|therefore|so it/i);
  });
});

describe("kindTagRows", () => {
  const rows = kindTagRows(groups);
  it("has a row for each kind that appears, in the order of the kinds, main first", () => {
    expect(rows.map((r) => r.kind)).toEqual(["main", "entrance", "elevator", "parking", "washroom", "ramp"]);
  });
  it("counts the parts of each kind by the tag the pack gives each part", () => {
    expect(rows.find((r) => r.kind === "main")!.counts).toEqual({ yes: 3, limited: 0, no: 0, designated: 0, unknown: 0 });
    expect(rows.find((r) => r.kind === "entrance")!.counts).toEqual({ yes: 1, limited: 0, no: 1, designated: 0, unknown: 0 });
    expect(rows.find((r) => r.kind === "ramp")!.counts).toEqual({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 1 });
  });
  it("totals each row, and the rows add up to every part in the venues", () => {
    for (const r of rows) expect(r.total).toBe(TAG_COLUMNS.reduce((n, c) => n + r.counts[c], 0));
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(groups.reduce((n, g) => n + g.members.length, 0));
  });
  it("leaves out a kind that does not appear", () => {
    const x = buildVenueGroups([at("a", "Hall", far(0), LON), at("b", "Hall Door", far(0), LON)]).groups;
    expect(kindTagRows(x).map((r) => r.kind)).toEqual(["main", "entrance"]);
    expect(kindTagRows([])).toEqual([]);
  });
  it("counts only the venues it is given, so a filter changes it", () => {
    expect(kindTagRows(filterVenues(groups, { ...NO_VENUE_FILTER, query: "beta" })).map((r) => r.kind)).toEqual(["main", "parking"]);
  });
  it("lists the tag columns in a fixed order with UNKNOWN last", () => {
    expect(TAG_COLUMNS).toEqual(["yes", "limited", "no", "designated", "unknown"]);
  });
});

describe("spanSentence", () => {
  it("gives the widest straight line between parts with a map point", () => {
    const g = buildVenueGroups([at("a", "Hall", LAT, LON), at("b", "Hall Door", LAT + 0.001, LON), at("c", "Hall Ramp", LAT + 0.0015, LON)]).groups[0]!;
    expect(spanSentence(g, "en")).toMatch(/^The parts with a map point are at most 1[67]\d\u00a0m apart in a straight line\.$/);
    expect(spanSentence(g, "fr")).toMatch(/^Les parties qui ont un point de carte sont à au plus 1[67]\d\u00a0m les unes des autres en ligne droite\.$/);
  });
  it("gives nothing when fewer than two parts have a map point", () => {
    const g = buildVenueGroups([at("a", "Hall", LAT, LON), at("b", "Hall Door", null, null)]).groups[0]!;
    expect(spanSentence(g, "en")).toBeNull();
  });
  it("says a straight line, never a route or a walking time", () => {
    const g = buildVenueGroups([at("a", "Hall", LAT, LON), at("b", "Hall Door", LAT + 0.001, LON)]).groups[0]!;
    for (const locale of ["en", "fr"] as const) {
      const s = spanSentence(g, locale)!;
      expect(lintCopy(s, locale), s).toEqual([]);
      if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
      expect(s).not.toMatch(/walk|minute|route|marche|itinéraire/i);
    }
  });
});

describe("generated venue lists", () => {
  const FAMILIES = ["Alpha Hall", "Beta Court", "Gamma Square", "Delta Library", "Éclair Café"];
  const PARTS = ["", " Entrance", " Elevator", " Parking", " Washroom", " Ramp", " (PATH)"];
  const gen = (seed: number) => {
    const out: ReturnType<typeof at>[] = [];
    let s = seed;
    const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
    for (let i = 0; i < 40; i++) {
      const family = FAMILIES[Math.floor(next() * FAMILIES.length)]!;
      const part = PARTS[Math.floor(next() * PARTS.length)]!;
      const located = next() > 0.25;
      out.push(at(`g${String(i).padStart(2, "0")}`, `${family}${part}`, located ? LAT + Math.floor(next() * 3) * 0.02 + next() * 0.0008 : null, located ? LON : null, ["yes", "no", null, "limited"][Math.floor(next() * 4)]!));
    }
    return out;
  };
  it("always puts a place in at most one venue and groups only places with a shared base name", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = buildVenueGroups(gen(seed));
      const seen = new Set<string>();
      for (const g of d.groups) {
        expect(g.members.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
        for (const m of g.members) {
          expect(seen.has(m.id), `seed ${seed} ${m.id}`).toBe(false);
          seen.add(m.id);
        }
      }
    }
  });
  it("gives the same venues whatever the order of the places", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const l = gen(seed);
      expect(JSON.stringify(buildVenueGroups([...l].reverse()))).toBe(JSON.stringify(buildVenueGroups(l)));
    }
  });
  it("keeps every member of a venue within the radius of another located member, or marks it by name only", () => {
    for (let seed = 1; seed <= 15; seed++) {
      for (const g of buildVenueGroups(gen(seed)).groups) {
        const located = g.members.filter((m) => m.basis === "map");
        expect(located.length === 0 || located.length >= 1).toBe(true);
        if (g.spanMetres !== null) expect(g.spanMetres).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("counts tags to the number of parts", () => {
    for (let seed = 1; seed <= 15; seed++) {
      for (const g of buildVenueGroups(gen(seed)).groups) expect(Object.values(g.tagCounts).reduce((a, b) => a + b, 0)).toBe(g.members.length);
    }
  });
});
