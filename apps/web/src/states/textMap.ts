/**
 * A text map of the places in the list, for people who cannot use a map picture: a small grid of
 * the area the places cover, and, from a point the person typed, which way each place lies.
 *
 * The grid is cut from the extent of the places shown, not from streets or neighbourhoods, so it
 * changes when the filters change. Directions and distances are straight lines between map
 * points; a real route is longer and may not go that way. A place with no map point has no cell
 * and no direction: its position is UNKNOWN, and nothing is guessed.
 */
import { distanceMetres, formatPackDistance, isPoint, type Point } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import { tagValue } from "./placeSheet";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

const UNKNOWN = "UNKNOWN";

export const GRID_SIZES = [2, 3, 4] as const;
export type GridSize = (typeof GRID_SIZES)[number];
export const DEFAULT_GRID: GridSize = 3;

export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Compass = (typeof COMPASS)[number];

const COMPASS_NAMES: Readonly<Record<Compass, { en: string; fr: string }>> = {
  N: { en: "north", fr: "nord" },
  NE: { en: "north-east", fr: "nord-est" },
  E: { en: "east", fr: "est" },
  SE: { en: "south-east", fr: "sud-est" },
  S: { en: "south", fr: "sud" },
  SW: { en: "south-west", fr: "sud-ouest" },
  W: { en: "west", fr: "ouest" },
  NW: { en: "north-west", fr: "nord-ouest" },
};

export function compassName(c: Compass, locale: Locale): string {
  return COMPASS_NAMES[c][locale];
}

const rad = (d: number): number => (d * Math.PI) / 180;

/** Initial compass bearing from one point to another, in degrees clockwise from north, 0 up to but not including 360. */
export function bearingDegrees(from: Point, to: Point): number {
  const dLon = rad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(rad(to.lat));
  const x = Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) - Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** The eight-point sector a bearing falls in; each covers 45 degrees centred on its direction. */
export function compassOf(degrees: number): Compass {
  const d = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.floor((d + 22.5) / 45) % 8]!;
}

/** Closer than this, a direction means nothing, so none is given. */
export const SAME_SPOT_METRES = 5;

export interface Located {
  readonly id: string;
  readonly name: string | null;
  readonly metres: number;
  /** Null when the place is within a few metres of the point. */
  readonly compass: Compass | null;
}

export function locate(place: PackPlaceRecord, from: Point): Located | null {
  if (place.location === null || !isPoint(place.location) || !isPoint(from)) return null;
  const metres = distanceMetres(from, place.location);
  return { id: place.id, name: place.name, metres, compass: metres < SAME_SPOT_METRES ? null : compassOf(bearingDegrees(from, place.location)) };
}

// ---------------------------------------------------------------- the grid

const ROW_LABELS: Readonly<Record<GridSize, readonly { en: string; fr: string }[]>> = {
  2: [{ en: "North", fr: "Nord" }, { en: "South", fr: "Sud" }],
  3: [{ en: "North", fr: "Nord" }, { en: "Middle", fr: "Milieu" }, { en: "South", fr: "Sud" }],
  4: [{ en: "Far north", fr: "Extrême nord" }, { en: "North-middle", fr: "Nord-milieu" }, { en: "South-middle", fr: "Sud-milieu" }, { en: "Far south", fr: "Extrême sud" }],
};
const COL_LABELS: Readonly<Record<GridSize, readonly { en: string; fr: string }[]>> = {
  2: [{ en: "West", fr: "Ouest" }, { en: "East", fr: "Est" }],
  3: [{ en: "West", fr: "Ouest" }, { en: "Centre", fr: "Centre" }, { en: "East", fr: "Est" }],
  4: [{ en: "Far west", fr: "Extrême ouest" }, { en: "West-middle", fr: "Ouest-milieu" }, { en: "East-middle", fr: "Est-milieu" }, { en: "Far east", fr: "Extrême est" }],
};

export interface TextMapCell {
  readonly row: number;
  readonly col: number;
  /** For example "North, West". */
  readonly label: string;
  readonly placeIds: readonly string[];
  readonly names: readonly (string | null)[];
}

export interface TextMap {
  readonly size: GridSize;
  readonly rowLabels: readonly string[];
  readonly colLabels: readonly string[];
  /** `cells[row][col]`, row 0 the northernmost. */
  readonly cells: readonly (readonly TextMapCell[])[];
  readonly located: number;
  /** Places with no map point: not in any cell. */
  readonly unlocatedIds: readonly string[];
  /** The extent the grid is cut from, or null with no located place. */
  readonly extent: { readonly north: number; readonly south: number; readonly west: number; readonly east: number } | null;
}

/** The index of a value in `size` equal parts of [min, max]; the top edge belongs to the last part, and a zero range is the first. */
export function partOf(value: number, min: number, max: number, size: number): number {
  if (!(max > min)) return 0;
  return Math.min(size - 1, Math.max(0, Math.floor(((value - min) / (max - min)) * size)));
}

export function buildTextMap(places: readonly PackPlaceRecord[], size: GridSize, locale: Locale): TextMap {
  const rowLabels = ROW_LABELS[size].map((l) => l[locale]);
  const colLabels = COL_LABELS[size].map((l) => l[locale]);
  const located = places.filter((p): p is PackPlaceRecord & { location: Point } => p.location !== null && isPoint(p.location));
  const unlocatedIds = places.filter((p) => !(p.location !== null && isPoint(p.location))).map((p) => p.id);
  const buckets: PackPlaceRecord[][][] = Array.from({ length: size }, () => Array.from({ length: size }, () => []));
  let extent: TextMap["extent"] = null;
  if (located.length > 0) {
    const lats = located.map((p) => p.location.lat);
    const lons = located.map((p) => p.location.lon);
    extent = { north: Math.max(...lats), south: Math.min(...lats), west: Math.min(...lons), east: Math.max(...lons) };
    for (const p of located) {
      // Row 0 is north, so it counts down from the northern edge.
      const row = size - 1 - partOf(p.location.lat, extent.south, extent.north, size);
      const col = partOf(p.location.lon, extent.west, extent.east, size);
      buckets[extent.north > extent.south ? row : 0]![col]!.push(p);
    }
  }
  const cells = buckets.map((rowBuckets, row) =>
    rowBuckets.map((list, col): TextMapCell => ({ row, col, label: `${rowLabels[row]!}, ${colLabels[col]!}`, placeIds: list.map((p) => p.id), names: list.map((p) => p.name) })),
  );
  return { size, rowLabels, colLabels, cells, located: located.length, unlocatedIds, extent };
}

// ---------------------------------------------------------------- around a point

export interface Sector {
  readonly compass: Compass;
  readonly name: string;
  /** Nearest first. Ordering by distance says how far a place is, not that it is better. */
  readonly places: readonly Located[];
}

export interface Around {
  readonly sectors: readonly Sector[];
  /** Places within a few metres of the point. */
  readonly here: readonly Located[];
  readonly unlocatedIds: readonly string[];
}

export function buildAround(places: readonly PackPlaceRecord[], from: Point, locale: Locale): Around {
  const found: Located[] = [];
  const unlocatedIds: string[] = [];
  for (const p of places) {
    const l = locate(p, from);
    if (l === null) unlocatedIds.push(p.id);
    else found.push(l);
  }
  const byDistance = (a: Located, b: Located) => a.metres - b.metres || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    sectors: COMPASS.map((compass) => ({ compass, name: compassName(compass, locale), places: found.filter((l) => l.compass === compass).sort(byDistance) })),
    here: found.filter((l) => l.compass === null).sort(byDistance),
    unlocatedIds,
  };
}

// ---------------------------------------------------------------- sentences

export function straightLineCaveat(locale: Locale): string {
  return t(
    locale,
    "Directions and distances are straight lines between map points. A real route is longer and may not go that way.",
    "Les directions et les distances sont des lignes droites entre des points de carte. Un vrai itinéraire est plus long et peut ne pas passer par là.",
  );
}

export function gridCaveat(locale: Locale): string {
  return t(
    locale,
    "The grid divides the area these places cover. It is not a street or neighbourhood map, and it changes when you change the filters.",
    "La grille divise la zone couverte par ces lieux. Ce n’est pas un plan de rues ni de quartiers, et elle change quand vous changez les filtres.",
  );
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function gridSummary(map: TextMap, locale: Locale): string {
  const placed = plural(map.located, locale === "en" ? "place" : "lieu", locale === "en" ? "places" : "lieux");
  const head = t(locale, `${placed} in a ${map.size} by ${map.size} grid.`, `${placed} dans une grille de ${map.size} sur ${map.size}.`);
  if (map.unlocatedIds.length === 0) return head;
  const n = map.unlocatedIds.length;
  return `${head} ${t(locale, `${plural(n, "place has", "places have")} no map point: its position is UNKNOWN.`, `${plural(n, "lieu n’a", "lieux n’ont")} aucun point de carte\u00a0: ${n === 1 ? "sa position est" : "leur position est"} UNKNOWN.`)}`;
}

export function directionLine(l: Located, locale: Locale): string {
  const d = formatPackDistance(l.metres, locale);
  const name = l.name ?? UNKNOWN;
  if (l.compass === null) return t(locale, `${name}: here, within ${SAME_SPOT_METRES} m of your point.`, `${name}\u00a0: ici, à moins de ${SAME_SPOT_METRES}\u00a0m de votre point.`);
  return t(locale, `${name}: ${d} to the ${compassName(l.compass, "en")}.`, `${name}\u00a0: ${d} vers le ${compassName(l.compass, "fr")}.`);
}

const TAG_ORDER = ["yes", "limited", "no", "designated", "unknown"] as const;

/** "Yes 2, No 1, UNKNOWN 1": how many places in a cell carry each tag, in a fixed order, leaving out tags with none. Counts only. */
export function tagMix(places: readonly PackPlaceRecord[], locale: Locale): string {
  const parts: string[] = [];
  for (const tag of TAG_ORDER) {
    const n = places.filter((p) => p.tag === tag).length;
    if (n > 0) parts.push(`${tagValue(tag, locale)} ${n}`);
  }
  return parts.join(", ");
}

/** One sentence for a cell: how many places, and the tag mix. An empty cell says so. */
export function cellSentence(count: number, mix: string, locale: Locale): string {
  if (count === 0) return t(locale, "No places", "Aucun lieu");
  const head = plural(count, locale === "en" ? "place" : "lieu", locale === "en" ? "places" : "lieux");
  return mix === "" ? head : `${head}${locale === "fr" ? "\u00a0" : ""}: ${mix}`;
}
