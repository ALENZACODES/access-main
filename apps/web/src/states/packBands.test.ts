import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { distanceMetres, type Point } from "./packGeo";
import {
  BAND_EDGES_M,
  BAND_KEYS,
  type BandKey,
  DISTANCE_BANDS,
  NO_POINT_BAND,
  bandLabel,
  bandOf,
  bandRange,
  bandShowLabel,
  bandsLine,
  buildBands,
  countWithin,
  filterByBand,
  formatBandShare,
  isBandKey,
  placeBand,
  reportedBandShare,
  straightLineNote,
} from "./packBands";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";

const FROM: Point = { lat: 43.65, lon: -79.38 };
const EARTH_RADIUS_M = 6_371_008.8;
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };

/** A point due north of FROM by the given number of metres, on the same sphere the distance uses. */
function north(metres: number): Point {
  return { lat: FROM.lat + ((metres / EARTH_RADIUS_M) * 180) / Math.PI, lon: FROM.lon };
}
function place(id: string, metres: number | null, over: Record<string, unknown> = {}): PackPlaceRecord {
  const at = metres === null ? {} : { lat: north(metres).lat, lon: north(metres).lon };
  return parsePackPlaces([{ id, name: id, wheelchair: "yes", provenance: OSM, ...at, ...over }]).places[0]!;
}

describe("the band list", () => {
  it("has six distance bands in order and one no-point group last", () => {
    expect(DISTANCE_BANDS).toEqual(["lt250", "250-500", "500-1000", "1000-2000", "2000-5000", "5000+"]);
    expect(BAND_KEYS).toEqual([...DISTANCE_BANDS, "no-point"]);
  });
  it("has one fewer edge than distance bands, rising", () => {
    expect(BAND_EDGES_M).toHaveLength(DISTANCE_BANDS.length - 1);
    for (let i = 1; i < BAND_EDGES_M.length; i++) expect(BAND_EDGES_M[i]!).toBeGreaterThan(BAND_EDGES_M[i - 1]!);
  });
  it("knows its own keys", () => {
    for (const key of BAND_KEYS) expect(isBandKey(key)).toBe(true);
    for (const v of ["", "lt250 ", "NO-POINT", "5000", null, undefined, 3, {}]) expect(isBandKey(v), String(v)).toBe(false);
  });
});

describe("bandRange", () => {
  it("starts at 0 and has an upper edge for every band but the last", () => {
    expect(bandRange("lt250")).toEqual({ from: 0, to: 250 });
    expect(bandRange("1000-2000")).toEqual({ from: 1000, to: 2000 });
    expect(bandRange("5000+")).toEqual({ from: 5000, to: null });
  });
  it("leaves no gap and no overlap between bands", () => {
    for (let i = 1; i < DISTANCE_BANDS.length; i++) expect(bandRange(DISTANCE_BANDS[i]!).from).toBe(bandRange(DISTANCE_BANDS[i - 1]!).to);
  });
});

describe("bandOf", () => {
  it("puts a distance in the band it falls in", () => {
    const cases: Array<[number, BandKey]> = [
      [0, "lt250"],
      [1, "lt250"],
      [249.99, "lt250"],
      [250.5, "250-500"],
      [499, "250-500"],
      [750, "500-1000"],
      [1500, "1000-2000"],
      [3000, "2000-5000"],
      [6000, "5000+"],
      [1_000_000, "5000+"],
    ];
    for (const [m, band] of cases) expect(bandOf(m), String(m)).toBe(band);
  });
  it("puts an edge in the band that starts there, never the one that ends there", () => {
    for (let i = 0; i < BAND_EDGES_M.length; i++) expect(bandOf(BAND_EDGES_M[i]!)).toBe(DISTANCE_BANDS[i + 1]);
  });
  it("puts a distance just under an edge in the band below it", () => {
    for (let i = 0; i < BAND_EDGES_M.length; i++) expect(bandOf(BAND_EDGES_M[i]! - 0.001)).toBe(DISTANCE_BANDS[i]);
  });
  it("sends a missing or impossible distance to the no-point group", () => {
    for (const m of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.001]) expect(bandOf(m), String(m)).toBe(NO_POINT_BAND);
  });
  it("treats negative zero as zero", () => {
    expect(bandOf(-0)).toBe("lt250");
  });
});

describe("placeBand", () => {
  it("uses the distance from the starting point", () => {
    expect(placeBand(place("a", 100), FROM)).toBe("lt250");
    expect(placeBand(place("b", 600), FROM)).toBe("500-1000");
    expect(placeBand(place("c", 7000), FROM)).toBe("5000+");
  });
  it("uses the no-point group for a place with no map point", () => {
    expect(placeBand(place("d", null), FROM)).toBe(NO_POINT_BAND);
  });
  it("agrees with the distance function", () => {
    const p = place("e", 1234);
    expect(bandOf(distanceMetres(FROM, p.location!))).toBe(placeBand(p, FROM));
  });
});

describe("buildBands", () => {
  const places = [place("a", 100), place("b", 120, { wheelchair: "no" }), place("c", 300, { wheelchair: undefined }), place("d", 800), place("e", null), place("f", null, { wheelchair: "limited" })];
  it("gives all six distance bands, even the empty ones, in order", () => {
    const rows = buildBands([place("a", 100)], FROM);
    expect(rows.map((r) => r.key)).toEqual([...DISTANCE_BANDS]);
    expect(rows.map((r) => r.total)).toEqual([1, 0, 0, 0, 0, 0]);
  });
  it("adds the no-point group only when a place has no map point", () => {
    expect(buildBands(places, FROM).map((r) => r.key)).toEqual([...DISTANCE_BANDS, "no-point"]);
    expect(buildBands([place("a", 100)], FROM).some((r) => r.key === NO_POINT_BAND)).toBe(false);
  });
  it("counts places and tags in each band", () => {
    const rows = buildBands(places, FROM);
    const first = rows.find((r) => r.key === "lt250")!;
    expect(first.total).toBe(2);
    expect(first.byTag).toEqual({ yes: 1, limited: 0, no: 1, designated: 0, unknown: 0 });
    const second = rows.find((r) => r.key === "250-500")!;
    expect(second.byTag.unknown).toBe(1);
    const none = rows.find((r) => r.key === NO_POINT_BAND)!;
    expect(none.total).toBe(2);
    expect(none.byTag.limited).toBe(1);
  });
  it("counts reported tags as those that are not UNKNOWN", () => {
    const rows = buildBands(places, FROM);
    expect(rows.find((r) => r.key === "lt250")!.reported).toBe(2);
    expect(rows.find((r) => r.key === "250-500")!.reported).toBe(0);
  });
  it("counts every place exactly once", () => {
    expect(buildBands(places, FROM).reduce((n, r) => n + r.total, 0)).toBe(places.length);
  });
  it("gives six empty rows for no places", () => {
    const rows = buildBands([], FROM);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });
  it("does not depend on the order of the places", () => {
    expect(buildBands([...places].reverse(), FROM)).toEqual(buildBands(places, FROM));
  });
  it("does not change the places it is given", () => {
    const before = JSON.stringify(places);
    buildBands(places, FROM);
    expect(JSON.stringify(places)).toBe(before);
  });
});

describe("filterByBand", () => {
  const places = [place("a", 100), place("b", 300), place("c", 320), place("d", null)];
  it("keeps the places in the band, in their order", () => {
    expect(filterByBand(places, FROM, "250-500").map((p) => p.id)).toEqual(["b", "c"]);
  });
  it("keeps the places with no map point for the no-point group", () => {
    expect(filterByBand(places, FROM, NO_POINT_BAND).map((p) => p.id)).toEqual(["d"]);
  });
  it("keeps everyone when no band is chosen", () => {
    expect(filterByBand(places, FROM, null).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("keeps everyone when there is no starting point, whatever the band", () => {
    expect(filterByBand(places, null, "lt250")).toHaveLength(4);
  });
  it("returns a new array each time", () => {
    expect(filterByBand(places, FROM, null)).not.toBe(places);
  });
  it("finds nothing in an empty band", () => {
    expect(filterByBand(places, FROM, "5000+")).toEqual([]);
  });
});

describe("countWithin", () => {
  const places = [place("a", 100), place("b", 600), place("c", 5000.5), place("d", null)];
  it("counts places strictly nearer than the distance", () => {
    expect(countWithin(places, FROM, 500)).toBe(1);
    expect(countWithin(places, FROM, 1000)).toBe(2);
    expect(countWithin(places, FROM, 10_000)).toBe(3);
  });
  it("never counts a place with no map point", () => {
    expect(countWithin(places, FROM, Number.POSITIVE_INFINITY)).toBe(3);
  });
  it("is 0 for a distance of 0", () => {
    expect(countWithin(places, FROM, 0)).toBe(0);
  });
});

describe("shares", () => {
  it("rounds down, so a band is never shown as fuller than it is", () => {
    const row = buildBands([place("a", 10), place("b", 10), place("c", 10, { wheelchair: undefined })], FROM)[0]!;
    expect(reportedBandShare(row)).toBe(66);
  });
  it("is UNKNOWN for a band with no places", () => {
    expect(formatBandShare(reportedBandShare(buildBands([], FROM)[0]!), "en")).toBe("UNKNOWN");
    expect(formatBandShare(null, "fr")).toBe("UNKNOWN");
  });
  it("puts a thin space before the percent sign in French", () => {
    expect(formatBandShare(50, "fr")).toBe("50\u202f%");
    expect(formatBandShare(50, "en")).toBe("50%");
  });
});

describe("labels", () => {
  it("reads in English", () => {
    expect(DISTANCE_BANDS.map((k) => bandLabel(k, "en"))).toEqual(["Under 250\u00a0m", "250\u00a0m to 500\u00a0m", "500\u00a0m to 1\u00a0km", "1\u00a0km to 2\u00a0km", "2\u00a0km to 5\u00a0km", "5\u00a0km or more"]);
  });
  it("reads in French", () => {
    expect(DISTANCE_BANDS.map((k) => bandLabel(k, "fr"))).toEqual(["Moins de 250\u00a0m", "De 250\u00a0m à 500\u00a0m", "De 500\u00a0m à 1\u00a0km", "De 1\u00a0km à 2\u00a0km", "De 2\u00a0km à 5\u00a0km", "5\u00a0km ou plus"]);
  });
  it("uses the token UNKNOWN for the no-point group in both languages", () => {
    expect(bandLabel(NO_POINT_BAND, "en")).toBe("No map point (UNKNOWN distance)");
    expect(bandLabel(NO_POINT_BAND, "fr")).toBe("Sans point sur la carte (distance UNKNOWN)");
  });
  it("is distinct for every band and clean copy in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const labels = BAND_KEYS.map((k) => bandLabel(k, locale));
      expect(new Set(labels).size).toBe(labels.length);
      for (const label of labels) expect(lintCopy(label, locale), label).toEqual([]);
    }
  });
  it("puts the band and its count in the button label", () => {
    const row = buildBands([place("a", 10), place("b", 20)], FROM)[0]!;
    expect(bandShowLabel(row, "en")).toBe("Show Under 250\u00a0m (2)");
    expect(bandShowLabel(row, "fr")).toBe("Afficher Moins de 250\u00a0m (2)");
  });
});

describe("bandsLine", () => {
  it("says nothing to group when there are no places", () => {
    expect(bandsLine(buildBands([], FROM), "en")).toBe("No places to group by distance.");
    expect(bandsLine(buildBands([], FROM), "fr")).toBe("Aucun lieu à regrouper par distance.");
  });
  it("says how many places were measured, in a straight line, from the point typed", () => {
    expect(bandsLine(buildBands([place("a", 10), place("b", 900)], FROM), "en")).toBe("2 places measured in a straight line from the point you typed.");
    expect(bandsLine(buildBands([place("a", 10)], FROM), "en")).toBe("1 place measured in a straight line from the point you typed.");
  });
  it("agrees in French for one place and for several", () => {
    expect(bandsLine(buildBands([place("a", 10)], FROM), "fr")).toBe("1 lieu mesuré en ligne droite depuis le point saisi.");
    expect(bandsLine(buildBands([place("a", 10), place("b", 20)], FROM), "fr")).toBe("2 lieux mesurés en ligne droite depuis le point saisi.");
  });
  it("adds how many places have no map point, singular and plural", () => {
    const one = bandsLine(buildBands([place("a", 10), place("b", null)], FROM), "en");
    expect(one).toBe("1 place measured in a straight line from the point you typed. 1 place has no map point (UNKNOWN distance).");
    const many = bandsLine(buildBands([place("a", 10), place("b", null), place("c", null)], FROM), "en");
    expect(many.endsWith("2 places have no map point (UNKNOWN distance).")).toBe(true);
  });
  it("does not count places with no map point as measured", () => {
    expect(bandsLine(buildBands([place("b", null)], FROM), "en")).toMatch(/^0 places measured/);
  });
});

describe("straightLineNote", () => {
  it("says a distance is not a route and does not say whether a place can be reached", () => {
    expect(straightLineNote("en")).toBe("These are straight-line distances, not a walking, rolling or driving route. They do not say whether a place can be reached.");
    expect(straightLineNote("fr")).toContain("pas un trajet");
  });
  it("is clean copy in both languages", () => {
    for (const locale of ["en", "fr"] as const) expect(lintCopy(straightLineNote(locale), locale)).toEqual([]);
  });
});
