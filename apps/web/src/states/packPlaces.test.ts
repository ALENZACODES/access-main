import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { cleanText, countByTag, normaliseTag, parsePackPlace, parsePackPlaces, readPackProvenance } from "./index";

const prov = (over: Record<string, unknown> = {}) => ({
  source_name: "OpenStreetMap, Geofabrik Ontario extract",
  source_url: "https://www.openstreetmap.org/way/1",
  licence: "ODbL-1.0",
  licence_url: "https://opendatacommons.org/licenses/odbl/1-0/",
  source_date: "2026-11-13",
  retrieved_at: "2026-11-13",
  tier: 0,
  prototype_label: "SEEDED-OPEN-DATA",
  freshness: "unknown",
  ...over,
});
const raw = (over: Record<string, unknown> = {}) => ({
  id: "osm:way/1",
  name: "Hall",
  category: "attraction",
  wheelchair: "yes",
  wheelchair_description: "UNKNOWN",
  address: "1 Main Street",
  lat: 43.65,
  lon: -79.38,
  provenance: prov(),
  ...over,
});

describe("cleanText", () => {
  it("turns the pack's UNKNOWN, blanks and non-strings into null", () => {
    for (const v of ["UNKNOWN", "unknown", " Unknown ", "", "   ", null, undefined, 5, {}, ["a"]]) expect(cleanText(v)).toBeNull();
  });
  it("trims, collapses whitespace and strips control and bidi characters", () => {
    expect(cleanText("  Main \n\t Street  ")).toBe("Main Street");
    expect(cleanText("a\u0000b‮c⁧d")).toBe("abcd");
  });
  it("caps the length with an ellipsis", () => {
    const long = cleanText("x".repeat(900), 50)!;
    expect(long).toHaveLength(50);
    expect(long.endsWith("…")).toBe(true);
  });
  it("keeps markup as plain text for the renderer to escape", () => {
    expect(cleanText("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("normaliseTag", () => {
  it.each([
    ["yes", "yes"],
    ["Yes", "yes"],
    [" LIMITED ", "limited"],
    ["no", "no"],
    ["designated", "designated"],
  ])("%j is reported as %s", (v, tag) => expect(normaliseTag(v)).toEqual({ tag, reason: null }));
  it("keeps a missing value UNKNOWN as not recorded", () => {
    for (const v of ["UNKNOWN", "unknown", "", undefined, null]) expect(normaliseTag(v)).toEqual({ tag: "unknown", reason: "not-recorded" });
  });
  it("never upgrades an unrecognised value", () => {
    for (const v of ["accessible", "true", "1", "yes;no", "fully", 1, true, {}]) {
      expect(normaliseTag(v)).toEqual({ tag: "unknown", reason: v === 1 || v === true || (typeof v === "object") ? "not-recorded" : "unrecognised-value" });
    }
  });
});

describe("readPackProvenance", () => {
  it("reads the pack's fields into the App's provenance", () => {
    expect(readPackProvenance(prov({ retrieved_at: "2026-11-13T04:05:06Z" }))).toEqual({
      source: "OpenStreetMap, Geofabrik Ontario extract",
      licence: "ODbL-1.0",
      retrievedOn: "2026-11-13",
      url: "https://www.openstreetmap.org/way/1",
    });
  });
  it("drops a link that is not https instead of failing", () => {
    expect(readPackProvenance(prov({ source_url: "http://x.example/a" }))?.url).toBeUndefined();
    expect(readPackProvenance(prov({ source_url: "javascript:alert(1)" }))?.url).toBeUndefined();
    expect(readPackProvenance(prov({ source_url: null }))).not.toBeNull();
  });
  it.each([
    ["no object", null],
    ["a string", "x"],
    ["no source name", prov({ source_name: "" })],
    ["a licence that is not open", prov({ licence: "All rights reserved" })],
    ["no licence", prov({ licence: undefined })],
    ["a bad date", prov({ retrieved_at: "13/11/2026" })],
    ["an impossible date", prov({ retrieved_at: "2026-02-31" })],
    ["no date", prov({ retrieved_at: undefined })],
  ])("returns nothing for %s", (_name, input) => expect(readPackProvenance(input)).toBeNull());
});

describe("parsePackPlace", () => {
  it("reads a complete record", () => {
    expect(parsePackPlace(raw({ wheelchair_description: "Ramp at the side door." }))).toMatchObject({
      id: "osm:way/1",
      name: "Hall",
      tag: "yes",
      tagUnknownReason: null,
      category: "attraction",
      address: "1 Main Street",
      note: "Ramp at the side door.",
      location: { lat: 43.65, lon: -79.38 },
    });
  });
  it("keeps UNKNOWN fields null instead of printing the pack's placeholder", () => {
    const p = parsePackPlace(raw({ name: "UNKNOWN", address: "UNKNOWN", category: "UNKNOWN" }))!;
    expect([p.name, p.address, p.category, p.note]).toEqual([null, null, null, null]);
  });
  it("shows a tag as UNKNOWN when its source is unusable, and says why", () => {
    for (const provenance of [undefined, null, prov({ licence: "proprietary" }), prov({ retrieved_at: "later" })]) {
      expect(parsePackPlace(raw({ provenance }))).toMatchObject({ tag: "unknown", tagUnknownReason: "missing-provenance", provenance: null });
    }
  });
  it("does not blame the source when the tag itself is missing", () => {
    expect(parsePackPlace(raw({ wheelchair: "UNKNOWN", provenance: null }))).toMatchObject({ tag: "unknown", tagUnknownReason: "not-recorded" });
  });
  it("leaves the location null for coordinates that are not real", () => {
    for (const [lat, lon] of [[91, 0], [0, 181], ["43", "-79"], [null, null], [Number.NaN, 1]]) {
      expect(parsePackPlace(raw({ lat, lon }))?.location).toBeNull();
    }
  });
  it.each([
    ["a missing id", { id: undefined }],
    ["an empty id", { id: "" }],
    ["an id with spaces", { id: "a b" }],
    ["an id with a newline", { id: "a\nb" }],
    ["an id that is too long", { id: "x".repeat(201) }],
    ["a numeric id", { id: 5 }],
  ])("drops a record with %s", (_n, over) => expect(parsePackPlace(raw(over))).toBeNull());
  it("drops things that are not records", () => {
    for (const v of [null, undefined, 5, "x", [], [raw()]]) expect(parsePackPlace(v)).toBeNull();
  });
  it("does not read inherited or prototype fields", () => {
    const p = parsePackPlace(JSON.parse('{"id":"a","__proto__":{"name":"Evil"}}'))!;
    expect(p.name).toBeNull();
  });
});

describe("parsePackPlaces", () => {
  it("counts dropped records and keeps the first of a duplicated id", () => {
    const r = parsePackPlaces([raw(), raw({ name: "Other" }), null, { id: "" }, raw({ id: "osm:way/2" })]);
    expect(r.places.map((p) => p.name)).toEqual(["Hall", "Hall"]);
    expect(r.dropped).toBe(3);
  });
  it("returns nothing for anything that is not an array", () => {
    for (const v of [null, undefined, {}, "x", 5]) expect(parsePackPlaces(v)).toEqual({ places: [], dropped: 0 });
  });
});

describe("the Toronto pack shipped with the app", () => {
  const content = JSON.parse(contentText) as { places: Array<Record<string, unknown>> };
  const parsed = parsePackPlaces(content.places);

  it("parses every place and drops none", () => {
    expect(parsed.places).toHaveLength(content.places.length);
    expect(parsed.dropped).toBe(0);
  });
  it("tallies the tags exactly as the file does", () => {
    const expected = { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };
    for (const p of content.places) {
      const v = String(p.wheelchair).toLowerCase();
      expected[(v in expected ? v : "unknown") as keyof typeof expected] += 1;
    }
    expect(countByTag(parsed.places)).toEqual(expected);
  });
  it("reports a tag only where a usable source and open licence are recorded", () => {
    for (const p of parsed.places) {
      if (p.tag !== "unknown") {
        expect(p.provenance, p.id).not.toBeNull();
        expect(p.provenance!.licence).toBe("ODbL-1.0");
        expect(p.provenance!.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
  it("shows UNKNOWN for every place the file leaves UNKNOWN", () => {
    for (const rawPlace of content.places) {
      if (String(rawPlace.wheelchair).toUpperCase() === "UNKNOWN") {
        expect(parsed.places.find((p) => p.id === rawPlace.id)?.tag).toBe("unknown");
      }
    }
  });
  it("turns every reported tag UNKNOWN when its provenance is removed", () => {
    const stripped = parsePackPlaces(content.places.map((p) => ({ ...p, provenance: undefined })));
    expect(stripped.places.every((p) => p.tag === "unknown")).toBe(true);
  });
});
