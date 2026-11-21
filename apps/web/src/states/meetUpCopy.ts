/** Words and files for "places for two people to meet". Straight lines only; an order is not a recommendation. */
import { csvCell } from "./exportData";
import { type MeetUpOrder, type MeetUpResult, type MeetUpRow, type Nearer } from "./meetUp";
import { type MeetUpPaces, NO_PACES, hasPace, meetUpMinutes, meetUpPaceNote, meetUpTimeText } from "./meetUpTime";
import { type Point, formatPackDistance } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const MEET_UP_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-to-meet.txt", fr: "lieux-de-rencontre.txt" };
export const MEET_UP_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-to-meet.csv", fr: "lieux-de-rencontre.csv" };

const UNKNOWN = "UNKNOWN";
const colon = (locale: Locale): string => (locale === "fr" ? "\u00a0:" : ":");
const nameOf = (n: string | null): string => n ?? UNKNOWN;
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "43.65000, -79.38000"; in French a decimal comma and a semicolon so the two numbers are not run together. */
export function meetUpPointText(p: Point, locale: Locale): string {
  const f = (n: number): string => (locale === "fr" ? n.toFixed(5).replace(".", ",") : n.toFixed(5));
  return locale === "fr" ? `${f(p.lat)}\u202f; ${f(p.lon)}` : `${f(p.lat)}, ${f(p.lon)}`;
}

export function meetUpOrderLabel(order: MeetUpOrder, locale: Locale): string {
  switch (order) {
    case "balanced":
      return t(locale, "Balanced: the longer of the two distances is as short as possible", "Équilibré\u00a0: la plus longue des deux distances est la plus courte possible");
    case "total":
      return t(locale, "Shortest total of the two distances", "Plus petit total des deux distances");
    case "a":
      return t(locale, "Nearest to the first point", "Le plus proche du premier point");
    case "b":
      return t(locale, "Nearest to the second point", "Le plus proche du deuxième point");
  }
}

export function meetUpOrderHelp(order: MeetUpOrder, locale: Locale): string {
  switch (order) {
    case "balanced":
      return t(locale, "Places are ordered by the larger of their two distances, so nobody is much further than they need to be. Ties go to the smaller total.", "Les lieux sont classés selon la plus grande de leurs deux distances, pour que personne ne soit beaucoup plus loin que nécessaire. À égalité, le plus petit total passe en premier.");
    case "total":
      return t(locale, "Places are ordered by the two distances added together. A place can be very near one point and far from the other.", "Les lieux sont classés selon la somme de leurs deux distances. Un lieu peut être très près d’un point et loin de l’autre.");
    case "a":
      return t(locale, "Places are ordered by distance from the first point only.", "Les lieux sont classés selon la distance au premier point seulement.");
    case "b":
      return t(locale, "Places are ordered by distance from the second point only.", "Les lieux sont classés selon la distance au deuxième point seulement.");
  }
}

/** What the distances are, and what they are not. */
export function meetUpCaveat(locale: Locale): string {
  return t(
    locale,
    "These are straight lines between map points, not routes. A short distance does not mean a place can be reached by a step-free way, and the order is not a recommendation.",
    "Ce sont des lignes droites entre des points de carte, pas des itinéraires. Une courte distance n’indique pas qu’un lieu est accessible sans marches, et l’ordre n’est pas une recommandation.",
  );
}

/** "The two points are 3.2 km apart. Halfway is 43.65000, -79.38000." */
export function meetUpApartText(r: MeetUpResult, locale: Locale): string {
  const d = formatPackDistance(r.apartMetres, locale);
  const mid = meetUpPointText(r.middle, locale);
  return t(locale, `The two points are ${d} apart in a straight line. Halfway between them is ${mid}.`, `Les deux points sont à ${d} en ligne droite. Le milieu entre eux est ${mid}.`);
}

/** How many places were measured, and how many could not be. */
export function meetUpCountText(r: MeetUpResult, locale: Locale): string {
  const placed = count(r.rows.length, locale === "en" ? "place" : "lieu", locale === "en" ? "places" : "lieux");
  const none = r.unlocatedIds.length === 0 ? "" : t(locale, ` ${r.unlocatedIds.length} with no map point: UNKNOWN.`, ` ${r.unlocatedIds.length} sans point de carte\u00a0: UNKNOWN.`);
  if (r.rows.length === 0) return t(locale, `No places with a map point to measure.${none}`, `Aucun lieu avec un point de carte à mesurer.${none}`);
  return t(locale, `${placed} measured from both points.${none}`, `${placed} mesuré${r.rows.length === 1 ? "" : "s"} depuis les deux points.${none}`);
}

export function nearerText(n: Nearer, locale: Locale): string {
  switch (n) {
    case "a":
      return t(locale, "nearer the first point", "plus près du premier point");
    case "b":
      return t(locale, "nearer the second point", "plus près du deuxième point");
    case "same":
      return t(locale, "the same distance from both", "à la même distance des deux");
  }
}

/** "Alpha: 120 m from the first point, 180 m from the second; nearer the first point by 60 m." */
export function meetUpRowText(row: MeetUpRow, locale: Locale): string {
  const a = formatPackDistance(row.metresA, locale);
  const b = formatPackDistance(row.metresB, locale);
  const head = t(locale, `${nameOf(row.name)}: ${a} from the first point, ${b} from the second`, `${nameOf(row.name)}\u00a0: ${a} du premier point, ${b} du deuxième`);
  const semi = locale === "fr" ? "\u202f;" : ";";
  if (row.nearer === "same") return `${head}${semi} ${nearerText("same", locale)}.`;
  return `${head}${semi} ${nearerText(row.nearer, locale)} ${t(locale, "by", "de")} ${formatPackDistance(row.gap, locale)}.`;
}

/** The status said after a choice: the order, and how many places are shown of how many. */
export function meetUpStatus(order: MeetUpOrder, shown: number, total: number, locale: Locale): string {
  const label = meetUpOrderLabel(order, locale);
  return t(locale, `Ordered by: ${label}. Showing ${shown} of ${total}.`, `Ordre\u00a0: ${label}. ${shown} affichés sur ${total}.`);
}

export function meetUpToText(r: MeetUpResult, a: Point, b: Point, locale: Locale, paces: MeetUpPaces = NO_PACES): string {
  const sep = locale === "fr" ? "\u202f; " : "; ";
  const out = [
    t(locale, "Places for two people to meet", "Lieux de rencontre pour deux personnes"),
    "",
    `${t(locale, "First point", "Premier point")}${colon(locale)} ${meetUpPointText(a, locale)}`,
    `${t(locale, "Second point", "Deuxième point")}${colon(locale)} ${meetUpPointText(b, locale)}`,
    meetUpApartText(r, locale),
    `${t(locale, "Order", "Ordre")}${colon(locale)} ${meetUpOrderLabel(r.order, locale)}`,
    meetUpCaveat(locale),
    ...(hasPace(paces) ? [meetUpPaceNote(locale)] : []),
    meetUpCountText(r, locale),
    "",
  ];
  for (const row of r.rows) {
    const time = meetUpTimeText(meetUpMinutes(row, paces), locale);
    out.push(`${row.position}. ${meetUpRowText(row, locale)}${time === "" ? "" : ` ${time}`}`);
  }
  if (r.unlocatedIds.length > 0) out.push("", `${t(locale, "No map point", "Aucun point de carte")}${colon(locale)} ${r.unlocatedIds.join(sep)}`);
  return `${out.join("\n")}\n`;
}

/** One row per placed place, in the order chosen, then one per place with no map point. Distances are whole metres. */
export function meetUpToCsv(r: MeetUpResult, places: readonly PackPlaceRecord[], locale: Locale, paces: MeetUpPaces = NO_PACES): string {
  const timed = hasPace(paces);
  const header = [t(locale, "Position", "Position"), t(locale, "Place", "Lieu"), t(locale, "Id", "Identifiant"), t(locale, "Metres from first point", "Mètres du premier point"), t(locale, "Metres from second point", "Mètres du deuxième point"), t(locale, "Longer distance (metres)", "Plus longue distance (mètres)"), t(locale, "Total (metres)", "Total (mètres)"), t(locale, "Difference (metres)", "Écart (mètres)"), ...(timed ? [t(locale, "Least minutes, first person", "Minutes minimales, première personne"), t(locale, "Least minutes, second person", "Minutes minimales, deuxième personne")] : []), t(locale, "Nearer", "Plus proche")].map(csvCell).join(",");
  const word = (n: Nearer): string => (n === "a" ? t(locale, "first", "premier") : n === "b" ? t(locale, "second", "deuxième") : t(locale, "same", "égal"));
  const minutes = (n: number | null): string => (n === null ? UNKNOWN : String(n));
  const rows = r.rows.map((x) => {
    const m = meetUpMinutes(x, paces);
    return [String(x.position), nameOf(x.name), x.id, String(x.metresA), String(x.metresB), String(x.longer), String(x.total), String(x.gap), ...(timed ? [minutes(m.a), minutes(m.b)] : []), word(x.nearer)].map(csvCell).join(",");
  });
  const byId = new Map(places.map((p) => [p.id, p] as const));
  const blanks = Array.from({ length: timed ? 8 : 6 }, () => UNKNOWN);
  const rest = r.unlocatedIds.map((id) => [UNKNOWN, nameOf(byId.get(id)?.name ?? null), id, ...blanks].map(csvCell).join(","));
  return `\uFEFF${[header, ...rows, ...rest].join("\r\n")}\r\n`;
}
