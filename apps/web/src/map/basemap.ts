/**
 * The street basemap under the places: OpenStreetMap roads, street names, parks
 * and water, cut per region by scripts/build-basemap.mjs and served from this
 * site (data/basemap/). No outside map server is contacted.
 *
 * When the site has no basemap (a local build, the tests), readBasemapIndex
 * returns null and the map keeps its plain background.
 */
import { layers as protomapsLayers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification } from "maplibre-gl";
import type { BBox } from "./tileCache.ts";

export type BasemapFile = { id: string; bbox: BBox; url: string; maxzoom: number };
export type BasemapIndex = { overview: BasemapFile; regions: BasemapFile[]; glyphs: string | null; sprite: string | null };

/** Below this zoom the Ontario overview draws the streets; from it up, each region's own file does. */
export const REGION_FROM_ZOOM = 9;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseFile(value: unknown, baseUrl: string, fallbackId: string): BasemapFile | null {
  if (!isRecord(value) || typeof value.path !== "string" || !/^[a-z0-9-]+\.pmtiles$/.test(value.path)) return null;
  const bbox = value.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return {
    id: typeof value.id === "string" && /^[a-z0-9-]+$/.test(value.id) ? value.id : fallbackId,
    bbox: bbox as BBox,
    url: new URL(value.path, baseUrl).href,
    maxzoom: typeof value.maxzoom === "number" ? value.maxzoom : 14,
  };
}

/** The list of basemap files, or null when this site has none. */
export function parseBasemapIndex(value: unknown, baseUrl: string): BasemapIndex | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const overview = parseFile(value.overview, baseUrl, "overview");
  if (!overview) return null;
  const regions = Array.isArray(value.regions) ? value.regions.map((entry, i) => parseFile(entry, baseUrl, `region-${i}`)).filter((f): f is BasemapFile => f !== null) : [];
  const relative = (field: unknown) => (typeof field === "string" && !field.includes("..") ? new URL(field, baseUrl).href.replace(/%7B/g, "{").replace(/%7D/g, "}") : null);
  return { overview, regions, glyphs: relative(value.glyphs), sprite: relative(value.sprite) };
}

export async function readBasemapIndex(dataBase: string): Promise<BasemapIndex | null> {
  const baseUrl = new URL("basemap/", dataBase).href;
  try {
    const response = await fetch(new URL("index.json", baseUrl).href);
    if (!response.ok) return null;
    return parseBasemapIndex(await response.json(), baseUrl);
  } catch {
    return null;
  }
}

export const overlaps = (a: BBox, b: BBox): boolean => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/**
 * The light street style for one basemap source, drawn only between minzoom and maxzoom.
 * Its own background is left out: the map keeps the App's background colour.
 */
export function basemapLayers(sourceId: string, lang: "en" | "fr", minzoom: number, maxzoom: number): LayerSpecification[] {
  return (protomapsLayers(sourceId, namedFlavor("light"), { lang }) as LayerSpecification[])
    // No background (the App keeps its own) and no shop or office icons: the places are the map's points.
    .filter((layer) => layer.type !== "background" && layer.id !== "pois")
    .map((layer) => ({
      ...layer,
      id: `${sourceId}:${layer.id}`,
      minzoom: Math.max(layer.minzoom ?? 0, minzoom),
      maxzoom: Math.min(layer.maxzoom ?? 24, maxzoom),
    }) as LayerSpecification);
}
