import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { toCard } from "./packPlacesView";
import {
  CATALOG,
  EMPTY_PACK_QUERY,
  NBSP,
  TAG_FILTERS,
  lintCopy,
  lintFrench,
  packPlacesView,
  parsePackPlaces,
  parsePointInput,
  tagOptions,
  type Locale,
  type PackPlaceRecord,
  type PackQuery,
  type PackView,
} from "./index";

const TODAY = "2026-11-15";
const prov = { source: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrievedOn: "2026-11-13", url: "https://www.openstreetmap.org/way/1" } as const;
const place = (over: Partial<PackPlaceRecord> & { id: string }): PackPlaceRecord => ({
  name: "Place",
  tag: "yes",
  tagUnknownReason: null,
  provenance: prov,
  tier: 0,
  category: "attraction",
  address: "1 Main Street",
  note: null,
  location: null,
  ...over,
});
const places: PackPlaceRecord[] = [
  place({ id: "a", name: "Zeta Hall", tag: "yes", location: { lat: 43.656, lon: -79.38 } }),
  place({ id: "b", name: "alpha Court", tag: "no", location: { lat: 43.7, lon: -79.4 } }),
  place({ id: "c", name: "Éclair Café", tag: "limited", address: "9 Rue Wellington" }),
  place({ id: "d", name: "Delta Gate", tag: "unknown", tagUnknownReason: "not-recorded", provenance: null, location: { lat: 43.6561, lon: -79.3801 } }),
  place({ id: "e", name: null, tag: "unknown", tagUnknownReason: "missing-provenance", provenance: null }),
  place({ id: "f", name: "Beta Lot", tag: "designated", category: "parking" }),
];
const q = (over: Partial<PackQuery> = {}): PackQuery => ({ ...EMPTY_PACK_QUERY, ...over });
const view = (query: PackQuery = q(), locale: Locale = "en", list: readonly PackPlaceRecord[] = places, dropped = 0): PackView =>
  packPlacesView(list, dropped, query, { locale, today: TODAY });
const names = (v: PackView) => (v.kind === "list" ? v.cards.map((c) => c.name) : []);

describe("ordering", () => {
  it("is by name without regard to case or accents, with UNKNOWN names last", () => {
    expect(names(view())).toEqual(["alpha Court", "Beta Lot", "Delta Gate", "Éclair Café", "Zeta Hall", "Name UNKNOWN"]);
  });
  it("is stable when names tie", () => {
    const twins = [place({ id: "z2", name: "Same" }), place({ id: "z1", name: "Same" })];
    const v = view(q(), "en", twins);
    expect(v.kind === "list" && v.cards.map((c) => c.id)).toEqual(["z1", "z2"]);
  });
});

describe("text search", () => {
  it("matches name, address and kind, every word, ignoring case and accents", () => {
    expect(names(view(q({ text: "eclair" })))).toEqual(["Éclair Café"]);
    expect(names(view(q({ text: "WELLINGTON rue" })))).toEqual(["Éclair Café"]);
    expect(names(view(q({ text: "parking" })))).toEqual(["Beta Lot"]);
    expect(names(view(q({ text: "alpha zeta" })))).toEqual([]);
  });
  it("treats blank text as no filter", () => {
    expect(view(q({ text: "   " })).count).toBe(places.length);
  });
  it("can still find a place with an UNKNOWN name by its address", () => {
    expect(names(view(q({ text: "main street", tag: "unknown" })))).toEqual(["Delta Gate", "Name UNKNOWN"]);
  });
  it("does not treat search words as patterns", () => {
    expect(view(q({ text: ".*" })).kind).toBe("empty");
    expect(view(q({ text: "(" })).kind).toBe("empty");
  });
});

describe("tag filter", () => {
  it("shows only the chosen tag", () => {
    expect(names(view(q({ tag: "yes" })))).toEqual(["Zeta Hall"]);
    expect(names(view(q({ tag: "designated" })))).toEqual(["Beta Lot"]);
  });
  it("does not silently drop UNKNOWN places: it counts them and says how to see them", () => {
    const v = view(q({ tag: "yes" }));
    expect(v.unknownHiddenNotice).toBe("2 more places have an UNKNOWN wheelchair tag and are not shown. Choose UNKNOWN to see them.");
    expect(view(q({ tag: "unknown" })).unknownHiddenNotice).toBeNull();
    expect(view().unknownHiddenNotice).toBeNull();
  });
  it("counts only the UNKNOWN places that match the words", () => {
    expect(view(q({ tag: "yes", text: "delta" })).unknownHiddenNotice).toBe("1 more place has an UNKNOWN wheelchair tag and is not shown. Choose UNKNOWN to see it.");
  });
  it("lists UNKNOWN places with a plain UNKNOWN line and no 'reported'", () => {
    const v = view(q({ tag: "unknown" }));
    if (v.kind !== "list") throw new Error("list expected");
    expect(v.cards.map((c) => c.tagLine)).toEqual(Array(2).fill("OpenStreetMap wheelchair tag: UNKNOWN"));
  });
  it("labels a reported tag as a report", () => {
    const v = view(q({ tag: "limited" }));
    expect(v.kind === "list" && v.cards[0]!.tagLine).toBe("OpenStreetMap wheelchair tag: Limited (reported)");
  });
  it("offers every filter with its count", () => {
    expect(tagOptions(places, "en").map((o) => `${o.value}:${o.label}`)).toEqual([
      "any:Any (6)",
      "yes:Yes (1)",
      "limited:Limited (1)",
      "no:No (1)",
      "designated:Designated (1)",
      "unknown:UNKNOWN (2)",
    ]);
    expect(tagOptions(places, "en").map((o) => o.value)).toEqual([...TAG_FILTERS]);
  });
});

describe("card text", () => {
  const card = (id: string, locale: Locale = "en") => {
    const v = view(q(), locale);
    if (v.kind !== "list") throw new Error("list expected");
    return v.cards.find((c) => c.id === id)!;
  };
  it("writes UNKNOWN for missing name, address and kind", () => {
    const c = card("e");
    expect(c).toMatchObject({ name: "Name UNKNOWN", nameKnown: false, category: "Kind as tagged: attraction" });
    const bare = packPlacesView([place({ id: "x", name: null, address: null, category: null, provenance: null, tag: "unknown" })], 0, q(), { locale: "en", today: TODAY });
    if (bare.kind !== "list") throw new Error("list expected");
    expect([bare.cards[0]!.address, bare.cards[0]!.category]).toEqual(["Address: UNKNOWN", "Kind as tagged: UNKNOWN"]);
  });
  it("explains an UNKNOWN tag whose source was unusable", () => {
    expect(card("e").noSourceNotice).toBe("No usable source is recorded, so the tag is shown as UNKNOWN.");
    expect(card("d").noSourceNotice).toBeNull();
  });
  it("gives the source, licence and retrieval date, and the age without calling it current", () => {
    const c = card("a");
    expect(c.sourceLine).toBe("Source: OpenStreetMap, Geofabrik Ontario extract. Licence: ODbL 1.0. Retrieved 13 November 2026.");
    expect(c.ageText).toBe("Retrieved 2 days ago");
    expect(c.staleNotice).toBeNull();
    expect(c.sourceUrl).toBe("https://www.openstreetmap.org/way/1");
  });
  it("flags details retrieved over a year ago", () => {
    const old = packPlacesView([place({ id: "o", provenance: { ...prov, retrievedOn: "2025-01-01" } })], 0, q(), { locale: "en", today: TODAY });
    expect(old.kind === "list" && old.cards[0]!.staleNotice).toBe("Retrieved over a year ago. This may be out of date.");
  });
  it("labels a contributor note as a note, not as a fact", () => {
    const v = packPlacesView([place({ id: "n", note: "Side door has a ramp." })], 0, q(), { locale: "en", today: TODAY });
    expect(v.kind === "list" && v.cards[0]!.note).toBe("Note from contributors: Side door has a ramp.");
  });
  it("has no link when the source has no usable URL", () => {
    const c = card("d");
    expect(c.sourceUrl).toBeNull();
    expect(c.sourceLinkLabel).toBeNull();
  });
  it("uses French wording and typography", () => {
    const c = card("a", "fr");
    expect(c.tagLine).toBe(`Indication OpenStreetMap pour fauteuil roulant${NBSP}: Oui (signalée)`);
    expect(c.sourceLine).toContain("Consulté le 13 novembre 2026");
    expect(c.address).toBe(`Adresse${NBSP}: 1 Main Street`);
    expect(card("d", "fr").tagLine).toContain("INCONNUE");
  });
});

describe("distance sort", () => {
  const from = parsePointInput("43.6561", "-79.3801");
  it("sorts nearest first and states the distance", () => {
    const v = view(q({ near: from }));
    if (v.kind !== "list") throw new Error("list expected");
    expect(v.cards.slice(0, 3).map((c) => c.id)).toEqual(["d", "a", "b"]);
    expect(v.cards[0]!.distanceText).toBe(`0${NBSP}m away`);
  });
  it("puts places with no location after the others, in name order", () => {
    const v = view(q({ near: from }));
    if (v.kind !== "list") throw new Error("list expected");
    expect(v.cards.slice(3).map((c) => c.name)).toEqual(["Beta Lot", "Éclair Café", "Name UNKNOWN"]);
    expect(v.cards.slice(3).every((c) => c.distanceText === null)).toBe(true);
  });
  it("shows an error and the ordinary order for a bad point", () => {
    const v = view(q({ near: parsePointInput("95", "1") }));
    expect(v.nearError).toBe("Enter a latitude from -90 to 90 and a longitude from -180 to 180.");
    expect(names(v)).toEqual(names(view()));
    expect(view(q({ near: parsePointInput("95", "1") }), "fr").nearError).toContain("Saisissez une latitude de -90 à 90");
  });
  it("shows no distances without a point", () => {
    const v = view();
    expect(v.kind === "list" && v.cards.every((c) => c.distanceText === null)).toBe(true);
  });
});

describe("announcements and empty states", () => {
  it("counts with the right plural in both languages", () => {
    expect(view(q({ text: "zeta" })).announcement).toBe("1 place shown.");
    expect(view().announcement).toBe("6 places shown.");
    expect(view(q({ text: "zeta" }), "fr").announcement).toBe("1 lieu affiché.");
    expect(view(q(), "fr").announcement).toBe("6 lieux affichés.");
  });
  it("uses the shared search empty state, with a clear-search action of at least 44px", () => {
    const v = view(q({ text: "nothing like this" }));
    if (v.kind !== "empty") throw new Error("empty expected");
    expect(v.view.title).toBe("No places match this search");
    expect(v.view.role).toBe("status");
    expect(v.view.actions.map((a) => a.id)).toEqual(["clear-search"]);
    expect(v.view.actions[0]!.minTargetPx).toBeGreaterThanOrEqual(44);
    expect(v.count).toBe(0);
  });
  it("is empty, in French too, when a filter matches nothing", () => {
    const only = [place({ id: "a", tag: "yes" })];
    const v = view(q({ tag: "no" }), "fr", only);
    expect(v.kind === "empty" && v.view.title).toBe("Aucun lieu ne correspond à cette recherche");
  });
  it("reports dropped records with the right plural", () => {
    expect(view(q(), "en", places, 1).droppedNotice).toBe("1 record in the pack could not be shown because it was incomplete.");
    expect(view(q(), "en", places, 3).droppedNotice).toBe("3 records in the pack could not be shown because they were incomplete.");
    expect(view(q(), "fr", places, 2).droppedNotice).toBe("2 fiches du pack n’ont pas pu être affichées parce qu’elles étaient incomplètes.");
    expect(view().droppedNotice).toBeNull();
  });
});

describe("every pack string is clean", () => {
  const real = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places);
  const strings = (locale: Locale): string[] => {
    const out: string[] = [];
    const queries: PackQuery[] = [q(), ...TAG_FILTERS.map((tag) => q({ tag })), q({ near: parsePointInput("43.65", "-79.38") }), q({ near: parsePointInput("x", "1") }), q({ text: "zzzz" })];
    for (const list of [real.places, places]) {
      for (const query of queries) {
        const v = view(query, locale, list, 2);
        out.push(v.announcement, ...(v.unknownHiddenNotice ? [v.unknownHiddenNotice] : []), ...(v.droppedNotice ? [v.droppedNotice] : []), ...(v.nearError ? [v.nearError] : []));
        out.push(...v.tagOptions.map((o) => o.label));
        if (v.kind === "empty") out.push(v.view.title, v.view.description);
        else for (const c of v.cards) out.push(c.tagLine, c.category, c.address, ...(c.sourceLine ? [c.sourceLine] : []), ...(c.ageText ? [c.ageText] : []), ...(c.staleNotice ? [c.staleNotice] : []), ...(c.noSourceNotice ? [c.noSourceNotice] : []), ...(c.distanceText ? [c.distanceText] : []));
      }
    }
    return out;
  };
  for (const locale of ["en", "fr"] as const) {
    it(`passes the copy lint in ${locale}`, () => {
      for (const s of strings(locale)) expect(lintCopy(s, locale), s).toEqual([]);
    });
  }
  it("passes the French typography check", () => {
    for (const s of strings("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("never claims more than a report", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const s of strings(locale)) expect(s).not.toMatch(/\b(accessible|certified|confirmed|guaranteed|safe)\b|accessibilité confirmée/i);
    }
  });
  it("has an entry in the catalogue for every pack message", () => {
    expect(Object.keys(CATALOG).filter((k) => k.startsWith("pack.")).length).toBeGreaterThanOrEqual(30);
  });
});

describe("tier line on a card", () => {
  const card = (p: PackPlaceRecord, locale: "en" | "fr") => toCard(p, { locale, today: TODAY }, null);
  it("shows the stated tier in both languages", () => {
    expect(card(place({ id: "t0", tier: 0 }), "en").tierText).toBe("Tier 0. Open data or another import. Not measured by the App.");
    expect(card(place({ id: "t1", tier: 1 }), "fr").tierText).toContain("Niveau 1.");
  });
  it("says UNKNOWN when no tier is stated", () => {
    expect(card(place({ id: "tn", tier: null }), "en").tierText).toBe("Tier UNKNOWN. The record does not state a tier.");
  });
  it("flags a tier a prototype pack should not hold", () => {
    expect(card(place({ id: "t3", tier: 3 }), "en").tierText).toContain("does not normally hold");
  });
});
