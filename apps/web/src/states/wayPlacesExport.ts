/** Files for "places along a straight line": text, CSV and GeoJSON, made on this device. Nothing is sent. */
import { csvCell } from "./exportData";
import { tagText } from "./outingCopy";
import type { Point } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { TagFilter } from "./packPlacesView";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import { longestStretch, stretchesOver, type WayResult, type WayRow } from "./wayPlaces";
import { wayNameOf, wayCaveat, wayRowText, wayStretchText, wayStretchesText, waySummary, wayTagLabel, wayViaLegend, wayWidthLabel } from "./wayPlacesCopy";

/** Empty parts at least this long are listed in the text file. */
export const WAY_STRETCH_LISTED_M = 500;

type Ok = Extract<WayResult, { ok: true }>;

export const WAY_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-along-a-line.txt", fr: "lieux-le-long-d-une-ligne.txt" };
export const WAY_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-along-a-line.csv", fr: "lieux-le-long-d-une-ligne.csv" };
export const WAY_GEOJSON_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-along-a-line.geojson", fr: "lieux-le-long-d-une-ligne.geojson" };

const UNKNOWN = "UNKNOWN";

/** "43.65000, -79.38000"; in French a decimal comma and a semicolon so the two numbers are not run together. */
export function wayPointText(p: Point, locale: Locale): string {
  const f = (n: number): string => (locale === "fr" ? n.toFixed(5).replace(".", ",") : n.toFixed(5));
  return locale === "fr" ? `${f(p.lat)}\u202f; ${f(p.lon)}` : `${f(p.lat)}, ${f(p.lon)}`;
}

/** The list as plain text: the points, the width, what the list is not, then one line per place. */
export function wayToText(r: Ok, rows: readonly WayRow[], tag: TagFilter, points: readonly Point[], locale: Locale): string {
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const sep = locale === "fr" ? "\u202f; " : "; ";
  const out = [
    t(locale, "Places along a straight line", "Lieux le long d’une ligne droite"),
    "",
    ...points.map((p, i) => `${i === 0 ? t(locale, "First point", "Premier point") : i === points.length - 1 ? t(locale, "Second point", "Deuxième point") : wayViaLegend(i, locale)}${colon} ${wayPointText(p, locale)}`),
    wayWidthLabel(r.width, locale),
    ...(tag === "any" ? [] : [`${t(locale, "Tag", "Indication")}${colon} ${wayTagLabel(tag, rows.length, locale)}`]),
    wayCaveat(locale),
    waySummary(r, locale),
  ];
  const stretch = wayStretchText(longestStretch(rows, r.length), r.length, locale);
  if (stretch !== "") out.push(stretch);
  const many = wayStretchesText(stretchesOver(rows, r.length, WAY_STRETCH_LISTED_M), WAY_STRETCH_LISTED_M, locale);
  if (many !== "" && rows.length > 0) out.push(many);
  out.push("");
  for (const row of rows) out.push(`${row.position}. ${wayRowText(row, locale, r.legs.length)}`);
  if (r.unlocatedIds.length > 0) out.push("", `${t(locale, "No map point", "Aucun point de carte")}${colon} ${r.unlocatedIds.join(sep)}`);
  return `${out.join("\n")}\n`;
}

/** One row per place in the band, in order from the first point, then one per place with no map point. */
export function wayToCsv(r: Ok, rows: readonly WayRow[], all: readonly PackPlaceRecord[], locale: Locale): string {
  const header = [
    t(locale, "Position", "Position"),
    t(locale, "Place", "Lieu"),
    t(locale, "Id", "Identifiant"),
    t(locale, "Metres along the line", "Mètres le long de la ligne"),
    t(locale, "Metres off the line", "Mètres d’écart à la ligne"),
    t(locale, "Where", "Où"),
    ...(r.legs.length > 1 ? [t(locale, "Part", "Partie")] : []),
    t(locale, "Wheelchair tag", "Indication fauteuil roulant"),
  ];
  const parts = r.legs.length > 1;
  const where = (row: WayRow): string => (row.side === "start" ? t(locale, "before the first point", "avant le premier point") : row.side === "end" ? t(locale, "past the second point", "après le deuxième point") : t(locale, "beside the line", "à côté de la ligne"));
  const lines = rows.map((x) => [String(x.position), wayNameOf(x.name), x.id, String(x.along), String(x.off), where(x), ...(parts ? [String(x.leg)] : []), tagText(x.tag, locale)]);
  const byId = new Map(all.map((p) => [p.id, p] as const));
  const rest = r.unlocatedIds.map((id) => [UNKNOWN, wayNameOf(byId.get(id)?.name ?? null), id, UNKNOWN, UNKNOWN, UNKNOWN, ...(parts ? [UNKNOWN] : []), tagText(byId.get(id)?.tag ?? "unknown", locale)]);
  return `\uFEFF${[header, ...lines, ...rest].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * The line and the places in the band as GeoJSON, to open in a map app. Coordinates are
 * [longitude, latitude] as GeoJSON asks. Names are the pack's, as read; nothing is added.
 */
export function wayToGeoJson(r: Ok, rows: readonly WayRow[], all: readonly PackPlaceRecord[], points: readonly Point[]): string {
  const byId = new Map(all.map((p) => [p.id, p] as const));
  const line = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: points.map((p) => [p.lon, p.lat]) },
    properties: { kind: "straight-line", metres: r.length, parts: r.legs, width: r.width },
  };
  const marks = rows.flatMap((row) => {
    const at = byId.get(row.id)?.location;
    if (!at) return [];
    return [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [at.lon, at.lat] },
        properties: { position: row.position, id: row.id, name: row.name ?? UNKNOWN, along: row.along, off: row.off, where: row.side, part: row.leg, wheelchair: row.tag === "unknown" ? UNKNOWN : row.tag },
      },
    ];
  });
  return `${JSON.stringify({ type: "FeatureCollection", features: [line, ...marks] }, null, 2)}\n`;
}
