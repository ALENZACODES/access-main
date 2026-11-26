/** Words and files for the nearest-neighbour view of "places close together". Straight lines only. */
import { csvCell } from "./exportData";
import type { Neighbours, NeighbourRow } from "./nearNeighbour";
import { formatPackDistance, type Point } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { compassName } from "./textMap";
import { t } from "./typography";

export const NEIGHBOUR_FILENAMES: Readonly<Record<Locale, string>> = { en: "nearest-places.txt", fr: "lieux-les-plus-proches.txt" };
export const NEIGHBOUR_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "nearest-places.csv", fr: "lieux-les-plus-proches.csv" };

const UNKNOWN = "UNKNOWN";
const colon = (locale: Locale): string => (locale === "fr" ? "\u00a0:" : ":");
const nameOf = (n: string | null): string => n ?? UNKNOWN;

/** "44 m to the north", or "at the same spot". */
export function neighbourWhere(r: NeighbourRow, locale: Locale): string {
  if (r.compass === null) return t(locale, "at the same spot", "au même endroit");
  const d = formatPackDistance(r.metres, locale);
  return t(locale, `${d} to the ${compassName(r.compass, "en")}`, `${d} vers le ${compassName(r.compass, "fr")}`);
}

/** "Alpha: Bravo, 44 m to the north." */
export const neighbourLine = (r: NeighbourRow, locale: Locale): string => `${nameOf(r.name)}${colon(locale)} ${nameOf(r.nearestName)}, ${neighbourWhere(r, locale)}.`;

/** One sentence per distance: how many of the located places have another within it. */
export function neighbourCountText(n: Neighbours, radius: number, locale: Locale): string {
  const c = n.counts.find((x) => x.radius === radius)?.count ?? 0;
  const d = formatPackDistance(radius, locale);
  const of = n.located;
  return t(locale, `${c} of ${of} places have another place within ${d}.`, `${c} lieux sur ${of} ont un autre lieu à moins de ${d}.`);
}

export function neighbourSummary(n: Neighbours, locale: Locale): string {
  if (n.located < 2) return t(locale, "At least two places with a map point are needed to find a nearest place.", "Il faut au moins deux lieux avec un point de carte pour trouver le lieu le plus proche.");
  const none = n.unlocatedIds.length === 0 ? "" : t(locale, ` ${n.unlocatedIds.length} with no map point: UNKNOWN.`, ` ${n.unlocatedIds.length} sans point de carte${colon("fr")} UNKNOWN.`);
  return t(locale, `${n.located} places with a map point, each paired with the nearest other place in a straight line.${none}`, `${n.located} lieux avec un point de carte, chacun associé au lieu le plus proche en ligne droite.${none}`);
}

/** "43.65010, -79.37980"; in French a decimal comma and a semicolon, so the two numbers are not run together. */
export const pointText = (p: Point, locale: Locale = "en"): string => (locale === "fr" ? `${p.lat.toFixed(5).replace(".", ",")}\u202f; ${p.lon.toFixed(5).replace(".", ",")}` : `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`);

export function neighbourToText(n: Neighbours, radii: readonly number[], locale: Locale): string {
  const out = [t(locale, "Nearest place to each place", "Lieu le plus proche de chaque lieu"), "", neighbourSummary(n, locale), ""];
  if (n.located >= 2) {
    for (const r of radii) out.push(neighbourCountText(n, r, locale));
    out.push("");
    for (const row of n.rows) out.push(neighbourLine(row, locale));
  }
  return `${out.join("\n")}\n`;
}

export function neighbourToCsv(n: Neighbours, places: readonly PackPlaceRecord[], locale: Locale): string {
  const byId = new Map(places.map((p) => [p.id, p] as const));
  const header = [t(locale, "Place", "Lieu"), t(locale, "Id", "Identifiant"), t(locale, "Nearest place", "Lieu le plus proche"), t(locale, "Nearest id", "Identifiant le plus proche"), t(locale, "Metres", "Mètres"), t(locale, "Direction", "Direction")].map(csvCell).join(",");
  const rows = n.rows.map((r) => [nameOf(r.name), r.id, nameOf(r.nearestName), r.nearestId, String(r.metres), r.compass === null ? t(locale, "same spot", "même endroit") : compassName(r.compass, locale)].map(csvCell).join(","));
  const rest = n.unlocatedIds.map((id) => [nameOf(byId.get(id)?.name ?? null), id, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN].map(csvCell).join(","));
  return `\uFEFF${[header, ...rows, ...rest].join("\r\n")}\r\n`;
}
