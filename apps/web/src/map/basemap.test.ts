import { describe, expect, it } from "vitest";
import { basemapLayers, overlaps, parseBasemapIndex } from "./basemap.ts";

const BASE = "https://example.test/access-main/data/basemap/";
const index = {
  version: 1,
  overview: { path: "ontario-overview.pmtiles", bbox: [-95.2, 41.6, -74.3, 56.9], maxzoom: 8 },
  regions: [
    { id: "toronto", path: "toronto.pmtiles", bbox: [-79.64, 43.58, -79.11, 43.86], maxzoom: 15 },
    { id: "bad", path: "../secret.pmtiles", bbox: [0, 0, 1, 1] },
  ],
  glyphs: "fonts/{fontstack}/{range}.pbf",
  sprite: "sprites/light",
};

describe("street basemap", () => {
  it("reads the index, with URLs on this site and unsafe paths dropped", () => {
    const parsed = parseBasemapIndex(index, BASE)!;
    expect(parsed.overview.url).toBe(`${BASE}ontario-overview.pmtiles`);
    expect(parsed.regions.map((r) => r.id)).toEqual(["toronto"]);
    expect(parsed.glyphs).toBe(`${BASE}fonts/{fontstack}/{range}.pbf`);
    expect(parsed.sprite).toBe(`${BASE}sprites/light`);
  });

  it("has no basemap for a missing or unknown index", () => {
    expect(parseBasemapIndex(null, BASE)).toBeNull();
    expect(parseBasemapIndex({ version: 2 }, BASE)).toBeNull();
    expect(parseBasemapIndex({ version: 1, regions: [] }, BASE)).toBeNull();
  });

  it("knows which region boxes touch the view", () => {
    expect(overlaps([-79.64, 43.58, -79.11, 43.86], [-79.4, 43.6, -79.3, 43.7])).toBe(true);
    expect(overlaps([-79.64, 43.58, -79.11, 43.86], [-75.8, 45.3, -75.6, 45.5])).toBe(false);
  });

  it("styles one source with unique layer ids, no background or shop icons, and a zoom band", () => {
    const layers = basemapLayers("basemap-toronto", "fr", 9, 24);
    expect(layers.length).toBeGreaterThan(20);
    expect(layers.every((layer) => layer.id.startsWith("basemap-toronto:"))).toBe(true);
    expect(layers.some((layer) => layer.type === "background")).toBe(false);
    expect(layers.some((layer) => layer.id.endsWith(":pois"))).toBe(false);
    expect(layers.every((layer) => (layer.minzoom ?? 0) >= 9)).toBe(true);
    expect(new Set(layers.map((layer) => layer.id)).size).toBe(layers.length);
  });
});
