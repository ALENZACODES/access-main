/** The text map as plain text and as CSV, for a note or a spreadsheet. Same words as on the page. */
import { csvCell } from "./exportData";
import type { Point } from "./packGeo";
import { formatPackDistance } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { type Around, type TextMap, compassName, directionLine, gridCaveat, gridSummary, locate, straightLineCaveat } from "./textMap";
import { t } from "./typography";

export const TEXT_MAP_FILENAMES: Readonly<Record<Locale, string>> = { en: "text-map.txt", fr: "carte-en-texte.txt" };
export const TEXT_MAP_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "text-map.csv", fr: "carte-en-texte.csv" };

const UNKNOWN = "UNKNOWN";
const name = (n: string | null): string => n ?? UNKNOWN;

/** The grid as text: one block for each cell that holds places, in reading order, then the places with no map point. */
export function textMapToText(map: TextMap, locale: Locale): string {
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const out = [t(locale, "Text map of the places", "Carte en texte des lieux"), "", gridSummary(map, locale), gridCaveat(locale), ""];
  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.placeIds.length === 0) continue;
      out.push(`${cell.label}${colon} ${cell.names.map(name).join("; ")}`);
    }
  }
  if (map.unlocatedIds.length > 0) out.push(`${t(locale, "No map point", "Aucun point de carte")}${colon} ${map.unlocatedIds.join("; ")}`);
  return `${out.join("\n")}\n`;
}

/** Around a point as text: a block for each direction that holds places, nearest first. */
export function aroundToText(around: Around, locale: Locale): string {
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const out = [t(locale, "Places around the point you typed", "Lieux autour du point saisi"), "", straightLineCaveat(locale), ""];
  if (around.here.length > 0) {
    out.push(t(locale, "Here", "Ici") + colon);
    for (const l of around.here) out.push(`- ${directionLine(l, locale)}`);
  }
  for (const s of around.sectors) {
    if (s.places.length === 0) continue;
    out.push(`${s.name.charAt(0).toUpperCase()}${s.name.slice(1)}${colon}`);
    for (const l of s.places) out.push(`- ${directionLine(l, locale)}`);
  }
  if (around.unlocatedIds.length > 0) out.push(`${t(locale, "No map point", "Aucun point de carte")}${colon} ${around.unlocatedIds.join("; ")}`);
  return `${out.join("\n")}\n`;
}

/** CSV of the grid: one row per place with its cell. A place with no map point has UNKNOWN for row and column. Numbers are written as they are. */
export function textMapToCsv(map: TextMap, places: readonly PackPlaceRecord[], locale: Locale): string {
  const header = [t(locale, "Place", "Lieu"), t(locale, "Id", "Identifiant"), t(locale, "Row", "Rangée"), t(locale, "Column", "Colonne")].map(csvCell).join(",");
  const byId = new Map(places.map((p) => [p.id, p] as const));
  const rows: string[] = [];
  for (const row of map.cells) {
    for (const cell of row) {
      cell.placeIds.forEach((id, i) => rows.push([name(cell.names[i] ?? null), id, map.rowLabels[cell.row]!, map.colLabels[cell.col]!].map(csvCell).join(",")));
    }
  }
  for (const id of map.unlocatedIds) rows.push([name(byId.get(id)?.name ?? null), id, UNKNOWN, UNKNOWN].map(csvCell).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

/** CSV around a point: place, direction, distance in metres (a plain number), and the distance as written on the page. */
export function aroundToCsv(places: readonly PackPlaceRecord[], from: Point, locale: Locale): string {
  const header = [t(locale, "Place", "Lieu"), t(locale, "Id", "Identifiant"), t(locale, "Direction", "Direction"), t(locale, "Metres", "Mètres"), t(locale, "Distance", "Distance")].map(csvCell).join(",");
  const rows = places.map((p) => {
    const l = locate(p, from);
    if (l === null) return [name(p.name), p.id, UNKNOWN, UNKNOWN, UNKNOWN].map(csvCell).join(",");
    return [csvCell(name(p.name)), csvCell(p.id), csvCell(l.compass === null ? t(locale, "here", "ici") : compassName(l.compass, locale)), String(Math.round(l.metres)), csvCell(formatPackDistance(l.metres, locale))].join(",");
  });
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
