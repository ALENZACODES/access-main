/**
 * Places grouped by straight-line distance from a point the person typed.
 *
 * Distances are as the crow flies. They are not a walking, rolling or driving route and say
 * nothing about whether a place can be reached. A place with no map point has no distance: it is
 * counted under its own group (UNKNOWN distance) and is never put in a distance group.
 * Nothing here ranks a band as better than another, and the typed point is not kept or exported.
 * Band edges are lower-inclusive, upper-exclusive: exactly 250 m is in "250 to 500 m".
 */
import { distanceMetres, type Point } from "./packGeo";
import { kindPercent } from "./packCategories";
import { type PackPlaceRecord, type WheelchairTag, WHEELCHAIR_TAGS } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { NBSP, NNBSP, t } from "./typography";

/** Upper edges, in metres, of the distance bands. The last band has no upper edge. */
export const BAND_EDGES_M = [250, 500, 1000, 2000, 5000] as const;

export const DISTANCE_BANDS = ["lt250", "250-500", "500-1000", "1000-2000", "2000-5000", "5000+"] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number];
export const NO_POINT_BAND = "no-point" as const;
export type BandKey = DistanceBand | typeof NO_POINT_BAND;
export const BAND_KEYS: readonly BandKey[] = [...DISTANCE_BANDS, NO_POINT_BAND];

export const BAND_TAG_ORDER: readonly WheelchairTag[] = [...WHEELCHAIR_TAGS, "unknown"];

export interface BandRow {
  readonly key: BandKey;
  readonly total: number;
  readonly byTag: Readonly<Record<WheelchairTag, number>>;
  /** Places whose wheelchair tag is reported with a source. */
  readonly reported: number;
}

export function isBandKey(value: unknown): value is BandKey {
  return typeof value === "string" && (BAND_KEYS as readonly string[]).includes(value);
}

/** The lower edge (inclusive) and upper edge (exclusive, null when open) of a distance band, in metres. */
export function bandRange(key: DistanceBand): { readonly from: number; readonly to: number | null } {
  const i = DISTANCE_BANDS.indexOf(key);
  return { from: i === 0 ? 0 : BAND_EDGES_M[i - 1]!, to: i < BAND_EDGES_M.length ? BAND_EDGES_M[i]! : null };
}

/** The band for a distance in metres. A missing or impossible distance is the no-point group. */
export function bandOf(metres: number | null): BandKey {
  if (metres === null || !Number.isFinite(metres) || metres < 0) return NO_POINT_BAND;
  const i = BAND_EDGES_M.findIndex((edge) => metres < edge);
  return DISTANCE_BANDS[i === -1 ? BAND_EDGES_M.length : i]!;
}

/** The band a place falls in from a starting point. */
export function placeBand(place: PackPlaceRecord, from: Point): BandKey {
  return bandOf(place.location === null ? null : distanceMetres(from, place.location));
}

function emptyCounts(): Record<WheelchairTag, number> {
  return { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };
}

/** One row per distance band, always all six in order, then the no-point group only if it has places. */
export function buildBands(places: readonly PackPlaceRecord[], from: Point): BandRow[] {
  const acc = new Map<BandKey, { total: number; byTag: Record<WheelchairTag, number>; reported: number }>(
    BAND_KEYS.map((key) => [key, { total: 0, byTag: emptyCounts(), reported: 0 }]),
  );
  for (const p of places) {
    const row = acc.get(placeBand(p, from))!;
    row.total += 1;
    row.byTag[p.tag] += 1;
    if (p.tag !== "unknown") row.reported += 1;
  }
  return BAND_KEYS.filter((key) => key !== NO_POINT_BAND || acc.get(key)!.total > 0).map((key) => ({ key, ...acc.get(key)! }));
}

/** Places in one band. A null band, or no starting point, means no band filter. */
export function filterByBand(places: readonly PackPlaceRecord[], from: Point | null, band: BandKey | null): PackPlaceRecord[] {
  if (band === null || from === null) return [...places];
  return places.filter((p) => placeBand(p, from) === band);
}

/** How many places lie within a distance (strictly under it). Places with no map point are never counted. */
export function countWithin(places: readonly PackPlaceRecord[], from: Point, metres: number): number {
  return places.filter((p) => p.location !== null && distanceMetres(from, p.location) < metres).length;
}

export function reportedBandShare(row: BandRow): number | null {
  return kindPercent(row.reported, row.total);
}

export function formatBandShare(value: number | null, locale: Locale): string {
  if (value === null) return "UNKNOWN";
  return locale === "fr" ? `${value}${NNBSP}%` : `${value}%`;
}

function km(metres: number, locale: Locale): string {
  const n = metres / 1000;
  return `${locale === "fr" ? String(n).replace(".", ",") : String(n)}${NBSP}km`;
}

function metresText(metres: number, locale: Locale): string {
  return metres >= 1000 ? km(metres, locale) : `${metres}${NBSP}m`;
}

export function bandLabel(key: BandKey, locale: Locale): string {
  if (key === NO_POINT_BAND) return t(locale, "No map point (UNKNOWN distance)", "Sans point sur la carte (distance UNKNOWN)");
  const { from, to } = bandRange(key);
  if (to === null) return t(locale, `${metresText(from, "en")} or more`, `${metresText(from, "fr")} ou plus`);
  if (from === 0) return t(locale, `Under ${metresText(to, "en")}`, `Moins de ${metresText(to, "fr")}`);
  return t(locale, `${metresText(from, "en")} to ${metresText(to, "en")}`, `De ${metresText(from, "fr")} à ${metresText(to, "fr")}`);
}

/** The label with how many places are in the band, for the button that shows only that band. */
export function bandShowLabel(row: BandRow, locale: Locale): string {
  return t(locale, `Show ${bandLabel(row.key, "en")} (${row.total})`, `Afficher ${bandLabel(row.key, "fr")} (${row.total})`);
}

function plural(n: number, locale: Locale, en: [string, string], fr: [string, string]): string {
  const forms = locale === "fr" ? fr : en;
  const one = locale === "fr" ? n === 0 || n === 1 : n === 1;
  return (one ? forms[0] : forms[1]).replace("{n}", String(n));
}

/** One sentence on what the table counts. It says the distances are straight lines. */
export function bandsLine(rows: readonly BandRow[], locale: Locale): string {
  const total = rows.reduce((n, r) => n + r.total, 0);
  const noPoint = rows.find((r) => r.key === NO_POINT_BAND)?.total ?? 0;
  if (total === 0) return t(locale, "No places to group by distance.", "Aucun lieu à regrouper par distance.");
  const measured = total - noPoint;
  const base = t(
    locale,
    `${plural(measured, locale, ["{n} place", "{n} places"], ["{n} lieu", "{n} lieux"])} measured in a straight line from the point you typed.`,
    `${plural(measured, locale, ["{n} lieu", "{n} lieux"], ["{n} lieu", "{n} lieux"])} mesuré${measured > 1 ? "s" : ""} en ligne droite depuis le point saisi.`,
  );
  if (noPoint === 0) return base;
  const rest = plural(noPoint, locale, ["{n} place has no map point (UNKNOWN distance).", "{n} places have no map point (UNKNOWN distance)."], ["{n} lieu n’a pas de point sur la carte (distance UNKNOWN).", "{n} lieux n’ont pas de point sur la carte (distance UNKNOWN)."]);
  return `${base} ${rest}`;
}

/** The reminder that a straight-line distance is not a route. Shown with every table and every export. */
export function straightLineNote(locale: Locale): string {
  return t(
    locale,
    "These are straight-line distances, not a walking, rolling or driving route. They do not say whether a place can be reached.",
    "Ce sont des distances en ligne droite, pas un trajet à pied, en fauteuil ou en voiture. Elles n’indiquent pas si un lieu est accessible.",
  );
}
