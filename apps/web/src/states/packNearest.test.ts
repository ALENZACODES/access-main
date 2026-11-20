import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { distanceMetres, type Point } from "./packGeo";
import { BAND_TAG_ORDER } from "./packBands";
import { nearestByTag, nearestDistance, nearestName, nearestNote, nearestTagLabel, noNearestText, unmeasuredLine } from "./packNearest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";

const FROM: Point = { lat: 43.65, lon: -79.38 };
const R = 6_371_008.8;
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const at = (metres: number | null) => (metres === null ? {} : { lat: FROM.lat + ((metres / R) * 180) / Math.PI, lon: FROM.lon });
function mk(id: string, metres: number | null, over: Record<string, unknown> = {}): PackPlaceRecord {
  return parsePackPlaces([{ id, name: id, wheelchair: "yes", provenance: OSM, ...at(metres), ...over }]).places[0]!;
}

describe("nearestByTag", () => {
  it("gives one row for every tag, in the fixed order, even when no place has it", () => {
    const { rows } = nearestByTag([mk("a", 100)], FROM);
    expect(rows.map((r) => r.tag)).toEqual([...BAND_TAG_ORDER]);
    expect(rows.find((r) => r.tag === "no")).toEqual({ tag: "no", total: 0, nearest: null });
  });
  it("finds the closest place for each tag", () => {
    const places = [mk("far", 900), mk("near", 120), mk("mid", 400), mk("lim", 700, { wheelchair: "limited" }), mk("no", 50, { wheelchair: "no" })];
    const { rows } = nearestByTag(places, FROM);
    const by = Object.fromEntries(rows.map((r) => [r.tag, r.nearest?.id ?? null]));
    expect(by).toEqual({ yes: "near", limited: "lim", no: "no", designated: null, unknown: null });
  });
  it("reports the distance from the starting point", () => {
    const { rows } = nearestByTag([mk("a", 321)], FROM);
    expect(rows[0]!.nearest!.metres).toBeCloseTo(321, 3);
    expect(rows[0]!.nearest!.metres).toBe(distanceMetres(FROM, mk("a", 321).location!));
  });
  it("counts every place with a tag, measured or not", () => {
    const { rows, unmeasured } = nearestByTag([mk("a", 100), mk("b", null), mk("c", 200)], FROM);
    expect(rows.find((r) => r.tag === "yes")!.total).toBe(3);
    expect(unmeasured).toBe(1);
  });
  it("never picks a place with no map point as the closest", () => {
    const { rows } = nearestByTag([mk("a", null)], FROM);
    expect(rows.find((r) => r.tag === "yes")).toEqual({ tag: "yes", total: 1, nearest: null });
  });
  it("counts a tag that is UNKNOWN as its own tag", () => {
    const { rows } = nearestByTag([mk("a", 10, { wheelchair: undefined }), mk("b", 20, { wheelchair: "maybe" })], FROM);
    expect(rows.find((r) => r.tag === "unknown")).toMatchObject({ total: 2 });
    expect(rows.find((r) => r.tag === "unknown")!.nearest!.id).toBe("a");
  });
  it("treats a tag with no source as UNKNOWN, as the pack reader does", () => {
    const { rows } = nearestByTag([mk("a", 10, { provenance: undefined })], FROM);
    expect(rows.find((r) => r.tag === "unknown")!.total).toBe(1);
    expect(rows.find((r) => r.tag === "yes")!.total).toBe(0);
  });
  it("is empty and has nothing unmeasured for no places", () => {
    const result = nearestByTag([], FROM);
    expect(result.unmeasured).toBe(0);
    expect(result.rows.every((r) => r.total === 0 && r.nearest === null)).toBe(true);
  });
  it("does not depend on the order the places come in", () => {
    const places = [mk("a", 300), mk("b", 100), mk("c", 200), mk("d", 100, { wheelchair: "no" }), mk("e", null)];
    expect(nearestByTag([...places].reverse(), FROM)).toEqual(nearestByTag(places, FROM));
  });
  it("does not change the places it is given", () => {
    const places = [mk("a", 300), mk("b", 100)];
    const before = JSON.stringify(places);
    nearestByTag(places, FROM);
    expect(JSON.stringify(places)).toBe(before);
  });
});

describe("ties", () => {
  it("prefers a named place to an unnamed one at the same distance", () => {
    const places = [mk("a", 100, { name: "" }), mk("b", 100, { name: "Zed" })];
    expect(nearestByTag(places, FROM).rows[0]!.nearest!.id).toBe("b");
    expect(nearestByTag([...places].reverse(), FROM).rows[0]!.nearest!.id).toBe("b");
  });
  it("then takes the name that sorts first, ignoring case and accents", () => {
    const places = [mk("a", 100, { name: "Zebra" }), mk("b", 100, { name: "école" }), mk("c", 100, { name: "Apple" })];
    expect(nearestByTag(places, FROM).rows[0]!.nearest!.id).toBe("c");
  });
  it("then takes the lower id", () => {
    const places = [mk("p2", 100, { name: "Same" }), mk("p1", 100, { name: "Same" })];
    expect(nearestByTag(places, FROM).rows[0]!.nearest!.id).toBe("p1");
    expect(nearestByTag([...places].reverse(), FROM).rows[0]!.nearest!.id).toBe("p1");
  });
  it("still takes the closer place when it has no name", () => {
    const places = [mk("a", 100, { name: "" }), mk("b", 200, { name: "Named" })];
    expect(nearestByTag(places, FROM).rows[0]!.nearest!.id).toBe("a");
  });
});

describe("nearestTagLabel", () => {
  it("reads in both languages and keeps UNKNOWN as the token", () => {
    expect(BAND_TAG_ORDER.map((t) => nearestTagLabel(t, "en"))).toEqual(["Yes", "Limited", "No", "Designated", "UNKNOWN"]);
    expect(BAND_TAG_ORDER.map((t) => nearestTagLabel(t, "fr"))).toEqual(["Oui", "Limité", "Non", "Réservé", "UNKNOWN"]);
  });
});

describe("nearestName and nearestDistance", () => {
  it("shows the pack's name, or says the place has none", () => {
    expect(nearestName({ id: "a", name: "Alpha", metres: 1 }, "en")).toBe("Alpha");
    expect(nearestName({ id: "a", name: null, metres: 1 }, "en")).toBe("Place with no name (UNKNOWN)");
    expect(nearestName({ id: "a", name: null, metres: 1 }, "fr")).toBe("Lieu sans nom (UNKNOWN)");
  });
  it("rounds the distance as the rest of the page does", () => {
    expect(nearestDistance({ id: "a", name: "A", metres: 54.4 }, "en")).toBe("54\u00a0m");
    expect(nearestDistance({ id: "a", name: "A", metres: 123 }, "en")).toBe("120\u00a0m");
    expect(nearestDistance({ id: "a", name: "A", metres: 1234 }, "en")).toBe("1.2\u00a0km");
    expect(nearestDistance({ id: "a", name: "A", metres: 1234 }, "fr")).toBe("1,2\u00a0km");
  });
});

describe("noNearestText", () => {
  it("says none among the places shown when the tag has no place", () => {
    expect(noNearestText({ tag: "no", total: 0, nearest: null }, "en")).toBe("None among the places shown");
    expect(noNearestText({ tag: "no", total: 0, nearest: null }, "fr")).toBe("Aucun parmi les lieux affichés");
  });
  it("says UNKNOWN when places have the tag but none has a map point", () => {
    expect(noNearestText({ tag: "yes", total: 2, nearest: null }, "en")).toBe("UNKNOWN (no place with this tag has a map point)");
    expect(noNearestText({ tag: "yes", total: 2, nearest: null }, "fr")).toContain("UNKNOWN");
  });
});

describe("unmeasuredLine", () => {
  it("is empty for none", () => {
    expect(unmeasuredLine(0, "en")).toBe("");
  });
  it("is singular for one and plural for more, in both languages", () => {
    expect(unmeasuredLine(1, "en")).toBe("1 place has no map point, so it is left out of this list.");
    expect(unmeasuredLine(3, "en")).toBe("3 places have no map point, so they are left out of this list.");
    expect(unmeasuredLine(1, "fr")).toBe("1 lieu n’a pas de point sur la carte\u00a0: il est donc absent de cette liste.");
    expect(unmeasuredLine(3, "fr")).toBe("3 lieux n’ont pas de point sur la carte\u00a0: ils sont donc absents de cette liste.");
  });
});

describe("the copy", () => {
  it("says a distance is not a recommendation", () => {
    expect(nearestNote("en")).toContain("not a recommendation");
    expect(nearestNote("fr")).toContain("pas une recommandation");
  });
  it("is clean in both languages and makes no claim about a place", () => {
    for (const locale of ["en", "fr"] as const) {
      const lines = [nearestNote(locale), unmeasuredLine(2, locale), noNearestText({ tag: "no", total: 0, nearest: null }, locale), noNearestText({ tag: "no", total: 1, nearest: null }, locale)];
      for (const line of lines) {
        expect(lintCopy(line, locale), line).toEqual([]);
        expect(line).not.toMatch(/\b(best|safe|suitable|recommended)\b|meilleur|sûr/i);
      }
    }
  });
});
