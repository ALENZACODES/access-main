/** Words and files for "places close together". Counting and measuring only: no claim about getting from one place to another. */
import { csvCell } from "./exportData";
import { formatPackDistance } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { NearGroup, NearGroups } from "./nearGroup";
import type { Locale } from "./stateCopy";
import { tagMix } from "./textMap";
import { t } from "./typography";

export const NEAR_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-close-together.txt", fr: "lieux-proches.txt" };
export const NEAR_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-close-together.csv", fr: "lieux-proches.csv" };

const UNKNOWN = "UNKNOWN";
const colon = (locale: Locale): string => (locale === "fr" ? "\u00a0:" : ":");
const semicolon = (locale: Locale): string => (locale === "fr" ? "\u202f; " : "; ");
const nameOf = (n: string | null): string => n ?? UNKNOWN;

/** "50 m", "100 m", "250 m", "500 m". */
export const nearRadiusText = (radius: number, locale: Locale): string => formatPackDistance(radius, locale);

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The one-line result: how many groups, how many places in them, how many alone, how many without a map point. */
export function nearSummary(r: NearGroups, locale: Locale): string {
  const inGroups = r.groups.reduce((n, g) => n + g.ids.length, 0);
  const radius = nearRadiusText(r.radius, locale);
  if (r.groups.length === 0 && r.aloneIds.length === 0 && r.unlocatedIds.length === 0) return t(locale, "There are no places to compare.", "Il n’y a aucun lieu à comparer.");
  const head =
    r.groups.length === 0
      ? t(locale, `No two places are within ${radius} of each other.`, `Aucun lieu n’est à moins de ${radius} d’un autre.`)
      : t(
          locale,
          `${count(r.groups.length, "group", "groups")} with ${count(inGroups, "place", "places")}, each place within ${radius} of another in its group.`,
          `${count(r.groups.length, "groupe", "groupes")} de ${count(inGroups, "lieu", "lieux")}, chaque lieu à moins de ${radius} d’un autre de son groupe.`,
        );
  const n = r.aloneIds.length;
  const alone = t(locale, `${count(n, "place", "places")} on ${n === 1 ? "its" : "their"} own.`, `${count(n, "lieu", "lieux")} ${n === 1 ? "seul" : "seuls"}.`);
  const none = r.unlocatedIds.length === 0 ? "" : t(locale, ` ${r.unlocatedIds.length} with no map point: UNKNOWN.`, ` ${r.unlocatedIds.length} sans point de carte${colon("fr")} UNKNOWN.`);
  return `${head} ${alone}${none}`;
}

/** What "close" means here, and what it does not mean. */
export function nearCaveat(locale: Locale): string {
  return t(
    locale,
    "Close means a short straight line between map points. A group can be longer than that distance when places are chained one after another. It does not say that a person can get from one place to the next.",
    "Proche veut dire une courte ligne droite entre des points de carte. Un groupe peut être plus long que cette distance quand les lieux s’enchaînent. Cela n’indique pas qu’on peut aller d’un lieu au suivant.",
  );
}

export const nearGroupTitle = (g: NearGroup, locale: Locale): string => t(locale, `Group ${g.no}`, `Groupe ${g.no}`);

/** "3 places, furthest apart 120 m: Yes 2, UNKNOWN 1". */
export function nearGroupLine(g: NearGroup, places: ReadonlyMap<string, PackPlaceRecord>, locale: Locale): string {
  const members = g.ids.flatMap((id) => places.get(id) ?? []);
  const mix = tagMix(members, locale);
  const span = g.spanMetres === 0 ? t(locale, "at the same point", "au même point") : t(locale, `furthest apart ${formatPackDistance(g.spanMetres, locale)}`, `à ${formatPackDistance(g.spanMetres, locale)} au plus l’un de l’autre`);
  const head = `${count(g.ids.length, locale === "en" ? "place" : "lieu", locale === "en" ? "places" : "lieux")}, ${span}`;
  return mix === "" ? head : `${head}${colon(locale)} ${mix}`;
}

export function nearToText(r: NearGroups, places: readonly PackPlaceRecord[], locale: Locale): string {
  const byId = new Map(places.map((p) => [p.id, p] as const));
  const out = [t(locale, "Places close together", "Lieux proches les uns des autres"), "", nearSummary(r, locale), nearCaveat(locale), ""];
  for (const g of r.groups) out.push(`${nearGroupTitle(g, locale)}${colon(locale)} ${nearGroupLine(g, byId, locale)}`, `  ${g.names.map(nameOf).join(semicolon(locale))}`);
  if (r.aloneIds.length > 0) out.push(`${t(locale, "On their own", "Seuls")}${colon(locale)} ${r.aloneIds.map((id) => nameOf(byId.get(id)?.name ?? null)).join(semicolon(locale))}`);
  if (r.unlocatedIds.length > 0) out.push(`${t(locale, "No map point", "Aucun point de carte")}${colon(locale)} ${r.unlocatedIds.map((id) => nameOf(byId.get(id)?.name ?? null)).join(semicolon(locale))}`);
  return `${out.join("\n")}\n`;
}

/** One row per place: its group (a number, or "alone", or UNKNOWN when it has no map point) and the group's span in metres. */
export function nearToCsv(r: NearGroups, places: readonly PackPlaceRecord[], locale: Locale): string {
  const header = [t(locale, "Place", "Lieu"), t(locale, "Id", "Identifiant"), t(locale, "Group", "Groupe"), t(locale, "Group span (metres)", "Étendue du groupe (mètres)"), t(locale, "Radius (metres)", "Rayon (mètres)")].map(csvCell).join(",");
  const byId = new Map(places.map((p) => [p.id, p] as const));
  const alone = t(locale, "alone", "seul");
  const rows: string[] = [];
  for (const g of r.groups) g.ids.forEach((id, i) => rows.push([nameOf(g.names[i] ?? null), id, String(g.no), String(g.spanMetres), String(r.radius)].map(csvCell).join(",")));
  for (const id of r.aloneIds) rows.push([nameOf(byId.get(id)?.name ?? null), id, alone, "0", String(r.radius)].map(csvCell).join(","));
  for (const id of r.unlocatedIds) rows.push([nameOf(byId.get(id)?.name ?? null), id, UNKNOWN, UNKNOWN, String(r.radius)].map(csvCell).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
