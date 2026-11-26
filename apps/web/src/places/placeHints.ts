import type { PlaceLookupHint } from "@access-main/data-client";

/** The 0.5-degree pack cell that holds a point, e.g. 43.65, -79.38 -> "n43.5_w079.5". */
export function cellOf(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const south = Math.floor(lat * 2) / 2;
  const west = Math.floor(lon * 2) / 2;
  const ns = `${south < 0 ? "s" : "n"}${Math.abs(south).toFixed(1)}`;
  const ew = `${west < 0 ? "w" : "e"}${Math.abs(west).toFixed(1).padStart(5, "0")}`;
  return `${ns}_${ew}`;
}

const where = new Map<string, PlaceLookupHint>();

/** Remembers where a search found a place (its cell and tranche), for the link to its page. */
export function rememberPlace(id: string, lat: number, lon: number, tranche: string): void {
  const cell = cellOf(lat, lon);
  where.set(id, cell ? { cells: [cell], tranche } : { tranche });
}

/** Where the last searches found a place, so its link can tell the place page where to look. */
export function placeHintFor(id: string): PlaceLookupHint | undefined {
  return where.get(id);
}
