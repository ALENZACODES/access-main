/**
 * A plain-text sketch of where a group's places sit, for the saved text file: north is up, each place is a
 * letter, and a legend says which place each letter is. Positions are scaled to fit, so the sketch shows
 * the layout, not the distances; the legend gives none. Two places in one square share it and are both listed
 * in the legend under their own letters, with the square's letter shown as "*".
 */
import type { PackPlaceRecord } from "./packPlaces";
import { membersByName } from "./walkGroupName";

export const SKETCH_COLUMNS = 24;
export const SKETCH_ROWS = 8;
/** Letters A to Z. A group of more places than this is not sketched. */
export const MAX_SKETCH_PLACES = 26;

export interface Sketch {
  readonly lines: readonly string[];
  readonly legend: readonly { readonly letter: string; readonly place: PackPlaceRecord; readonly shared: boolean }[];
}

export function sketchGroup(members: readonly PackPlaceRecord[], columns = SKETCH_COLUMNS, rows = SKETCH_ROWS): Sketch | null {
  const placed = members.filter((m) => m.location !== null);
  if (placed.length < 2 || placed.length > MAX_SKETCH_PLACES || columns < 2 || rows < 2) return null;
  const lats = placed.map((m) => m.location!.lat);
  const lons = placed.map((m) => m.location!.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const meanLat = (minLat + maxLat) / 2;
  // A character is about twice as tall as wide, and a degree of longitude is shorter than one of latitude.
  const widthM = Math.max(1e-9, (maxLon - minLon) * Math.cos((meanLat * Math.PI) / 180));
  const heightM = Math.max(1e-9, maxLat - minLat);
  const scale = Math.min((columns - 1) / widthM, (rows - 1) / (heightM / 2));
  const ordered = membersByName(placed);
  const cell = new Map<string, number[]>();
  const squareOf = (m: PackPlaceRecord): [number, number] => {
    const x = Math.round((m.location!.lon - minLon) * Math.cos((meanLat * Math.PI) / 180) * scale);
    const y = Math.round(((maxLat - m.location!.lat) / 2) * scale);
    return [Math.min(columns - 1, Math.max(0, x)), Math.min(rows - 1, Math.max(0, y))];
  };
  ordered.forEach((m, i) => {
    const key = squareOf(m).join(",");
    cell.set(key, [...(cell.get(key) ?? []), i]);
  });
  const grid = Array.from({ length: rows }, () => new Array<string>(columns).fill("."));
  const letter = (i: number) => String.fromCharCode(65 + i);
  for (const [key, list] of cell) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    grid[y]![x] = list.length > 1 ? "*" : letter(list[0]!);
  }
  const trimmed = grid.map((r) => r.join("").replace(/\.+$/, ""));
  const legend = ordered.map((place, i) => ({ letter: letter(i), place, shared: (cell.get(squareOf(place).join(","))?.length ?? 0) > 1 }));
  return { lines: trimmed, legend };
}
