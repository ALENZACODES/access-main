import { describe, expect, it } from "vitest";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";
import { buildPath, buildWay, filterWay } from "./wayPlaces";
import { WAY_CSV_FILENAMES, WAY_FILENAMES, WAY_GEOJSON_FILENAMES, wayPointText, wayToCsv, wayToGeoJson, wayToText } from "./wayPlacesExport";
import { wayRowText } from "./wayPlacesCopy";

const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
const at = (id: string, name: string | null, lat: number, lon: number, wheelchair: string | null = "yes") => place(id, { name, lat, lon, wheelchair });
const set = [at("m", "Middle", 43.6509, -79.38), at("q", "=Quarter", 43.6501, -79.39, null), at("e", "End, side", 43.6495, -79.359, "no"), at("f", "Far", 43.67, -79.38), bare("z")];
const ok = () => {
  const r = buildWay(set, A, B);
  if (!r.ok) throw new Error(r.problem);
  return r;
};

describe("file names", () => {
  it("are plain and different for each language and kind", () => {
    const all = [WAY_FILENAMES, WAY_CSV_FILENAMES, WAY_GEOJSON_FILENAMES].flatMap((f) => [f.en, f.fr]);
    expect(new Set(all).size).toBe(6);
    for (const n of all) expect(n).toMatch(/^[a-z-]+\.(txt|csv|geojson)$/);
  });
});

describe("wayPointText", () => {
  it("writes five decimals, with a decimal comma and a narrow-spaced semicolon in French", () => {
    expect(wayPointText(A, "en")).toBe("43.65000, -79.40000");
    expect(wayPointText(A, "fr")).toBe("43,65000\u202f; -79,40000");
  });
});

describe("wayToText", () => {
  it("holds the points, the width, what the list is not, and one line per place", () => {
    const r = ok();
    const lines = wayToText(r, r.rows, "any", [A, B], "en").split("\n");
    expect(lines.slice(0, 5)).toEqual(["Places along a straight line", "", "First point: 43.65000, -79.40000", "Second point: 43.65000, -79.36000", "Within 250\u00a0m of the line"]);
    expect(lines).toContain(`1. ${wayRowText(r.rows[0]!, "en")}`);
    expect(lines).toContain(`3. ${wayRowText(r.rows[2]!, "en")}`);
    expect(lines.some((l) => l.includes("is not a route"))).toBe(true);
    expect(lines.some((l) => l.startsWith("The longest part of the line"))).toBe(true);
    expect(lines).toContain("No map point: z");
    expect(lines.some((l) => l.includes("Far"))).toBe(false);
  });

  it("names the tag when the list is narrowed to one", () => {
    const r = ok();
    const text = wayToText(r, filterWay(r.rows, "no"), "no", [A, B], "en");
    expect(text).toContain("Tag: No (1)");
    expect(text).toContain("1. End, side:");
    expect(text).not.toContain("Middle");
  });

  it("is right in French", () => {
    const r = ok();
    for (const line of wayToText(r, r.rows, "unknown", [A, B], "fr").split("\n")) expect(lintFrench(line), line).toEqual([]);
  });
});

describe("wayToCsv", () => {
  it("has a header, one row per place in order, then the places with no map point", () => {
    const r = ok();
    const csv = wayToCsv(r, r.rows, set, "en");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Position,Place,Id,Metres along the line,Metres off the line,Where,Wheelchair tag");
    expect(lines.slice(1, 4).map((l) => l.split(",")[0])).toEqual(["1", "2", "3"]);
    expect(lines[4]).toBe("UNKNOWN,UNKNOWN,z,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN");
    expect(lines.at(-1)).toBe("");
  });

  it("makes a formula plain text and quotes a comma", () => {
    const r = ok();
    const csv = wayToCsv(r, r.rows, set, "en");
    expect(csv).toContain(",'=Quarter,q,");
    expect(csv).toContain(',"End, side",e,');
  });

  it("writes whole metres and the French headers", () => {
    const r = ok();
    const rows = wayToCsv(r, r.rows, set, "fr").slice(1).split("\r\n");
    expect(rows[0]).toBe("Position,Lieu,Identifiant,Mètres le long de la ligne,Mètres d’écart à la ligne,Où,Indication fauteuil roulant");
    const middle = rows.find((l) => l.includes(",m,"))!.split(",");
    expect(middle[3]).toBe(String(r.rows.find((x) => x.id === "m")!.along));
    expect(middle[5]).toBe("à côté de la ligne");
  });
});

describe("wayToGeoJson", () => {
  it("holds the line and the listed places as [longitude, latitude]", () => {
    const r = ok();
    const g = JSON.parse(wayToGeoJson(r, r.rows, set, [A, B])) as { type: string; features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] };
    expect(g.type).toBe("FeatureCollection");
    expect(g.features[0]?.geometry).toEqual({ type: "LineString", coordinates: [[-79.4, 43.65], [-79.36, 43.65]] });
    expect(g.features[0]?.properties).toEqual({ kind: "straight-line", metres: r.length, parts: [r.length], width: 250 });
    expect(g.features.slice(1).map((f) => f.properties.id)).toEqual(r.rows.map((x) => x.id));
    expect(g.features[1]?.geometry.coordinates).toEqual([-79.39, 43.6501]);
    expect(g.features.find((f) => f.properties.id === "q")?.properties.wheelchair).toBe("UNKNOWN");
  });
});

describe("files for a path with points in between", () => {
  const C = { lat: 43.67, lon: -79.36 };
  const path = [A, B, C];
  const places = [at("w", "West", 43.6501, -79.39), at("n", "North", 43.66, -79.3591, "no"), bare("z")];
  const pathOk = () => {
    const r = buildPath(places, path);
    if (!r.ok) throw new Error(r.problem);
    return r;
  };

  it("names each point, the parts, and the part of each place in the text file", () => {
    const r = pathOk();
    const lines = wayToText(r, r.rows, "any", path, "en").split("\n");
    expect(lines.slice(2, 5)).toEqual(["First point: 43.65000, -79.40000", "Point in between 1: 43.65000, -79.36000", "Second point: 43.67000, -79.36000"]);
    expect(lines.some((l) => l.startsWith("The path has 2 parts,"))).toBe(true);
    expect(lines).toContain(`2. ${wayRowText(r.rows[1]!, "en", 2)}`);
    expect(lines.find((l) => l.startsWith("2. "))).toContain("(part 2)");
  });

  it("lists every empty part of 500 m or more", () => {
    const r = pathOk();
    const text = wayToText(r, r.rows, "any", path, "en");
    expect(text).toMatch(/\nParts with no listed place near them for 500\u00a0m or more: from /);
  });

  it("adds a part column to the CSV only for a path with points in between", () => {
    const r = pathOk();
    const lines = wayToCsv(r, r.rows, places, "en").slice(1).split("\r\n");
    expect(lines[0]).toBe("Position,Place,Id,Metres along the line,Metres off the line,Where,Part,Wheelchair tag");
    expect(lines[2]!.split(",")[6]).toBe("2");
    expect(lines[3]).toBe("UNKNOWN,UNKNOWN,z,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN");
    expect(wayToCsv(ok(), ok().rows, set, "en")).not.toContain(",Part,");
  });

  it("draws the whole path in the GeoJSON, with the length of each part", () => {
    const r = pathOk();
    const g = JSON.parse(wayToGeoJson(r, r.rows, places, path)) as { features: { geometry: { coordinates: unknown }; properties: Record<string, unknown> }[] };
    expect(g.features[0]?.geometry.coordinates).toEqual([[-79.4, 43.65], [-79.36, 43.65], [-79.36, 43.67]]);
    expect(g.features[0]?.properties.parts).toEqual(r.legs);
    expect(g.features.map((f) => f.properties.part)).toEqual([undefined, 1, 2]);
  });
});
