/** Words and files for the order of the places list. English and French; an order is a rule, never a ranking. */
import { csvCell } from "./exportData";
import type { PackPlaceRecord } from "./packPlaces";
import { type PackSort, type SortRun } from "./packSort";
import { tagValue } from "./placeSheet";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const PACK_SORT_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-in-order.txt", fr: "lieux-en-ordre.txt" };
export const PACK_SORT_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-in-order.csv", fr: "lieux-en-ordre.csv" };

const UNKNOWN = "UNKNOWN";
const colon = (locale: Locale): string => (locale === "fr" ? "\u00a0:" : ":");
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The name of an order, as it is offered as a choice. */
export function packSortLabel(sort: PackSort, locale: Locale): string {
  switch (sort) {
    case "default":
      return t(locale, "Nearest first when a point is typed, otherwise by name", "Les plus proches d’abord si un point est saisi, sinon par nom");
    case "name":
      return t(locale, "Name, A to Z", "Nom, de A à Z");
    case "name-desc":
      return t(locale, "Name, Z to A", "Nom, de Z à A");
    case "kind":
      return t(locale, "Kind of place", "Type de lieu");
    case "street":
      return t(locale, "Street, then number", "Rue, puis numéro");
    case "tag":
      return t(locale, "Wheelchair tag", "Étiquette fauteuil roulant");
    case "oldest":
      return t(locale, "Record retrieved, oldest first", "Fiche consultée, la plus ancienne d’abord");
    case "newest":
      return t(locale, "Record retrieved, newest first", "Fiche consultée, la plus récente d’abord");
  }
}

/** One sentence on what an order does with a place whose record does not state the field. */
export function packSortHelp(sort: PackSort, locale: Locale): string {
  switch (sort) {
    case "default":
      return t(locale, "A place with no map point comes after the others when a point is typed.", "Un lieu sans point de carte vient après les autres quand un point est saisi.");
    case "name":
    case "name-desc":
      return t(locale, "A place with no name is last.", "Un lieu sans nom vient en dernier.");
    case "kind":
      return t(locale, "A place with no kind is last.", "Un lieu sans type vient en dernier.");
    case "street":
      return t(locale, "A place with no street in its address is last.", "Un lieu sans rue dans son adresse vient en dernier.");
    case "tag":
      return t(locale, "Tags are listed Yes, Limited, No, Designated. A place whose tag is UNKNOWN is last.", "Les étiquettes sont classées Oui, Limité, Non, Désigné. Un lieu dont l’étiquette est UNKNOWN vient en dernier.");
    case "oldest":
    case "newest":
      return t(locale, "A place with no retrieval date is last.", "Un lieu sans date de consultation vient en dernier.");
  }
}

/** The line that says an order is not a ranking. */
export function packSortNotRanking(locale: Locale): string {
  return t(locale, "An order is only a way to find places. It does not say that one place is better or easier than another.", "Un ordre sert seulement à trouver des lieux. Il n’indique pas qu’un lieu est meilleur ou plus facile qu’un autre.");
}

/** Said after an order is chosen: which order (and second order), and how many places are in it. */
export function packSortStatus(sort: PackSort, total: number, locale: Locale, then: PackSort | null = null): string {
  const label = packSortLabel(sort, locale);
  const chain = then === null ? label : t(locale, `${label}, then ${packSortLabel(then, "en")}`, `${label}, puis ${packSortLabel(then, "fr")}`);
  const n = count(total, locale === "en" ? "place" : "lieu", locale === "en" ? "places" : "lieux");
  return t(locale, `Ordered by: ${chain}. ${n}.`, `Ordre\u00a0: ${chain}. ${n}.`);
}

/** "Café: 2 places". */
export function sortRunLine(run: SortRun, locale: Locale): string {
  return `${run.label}${colon(locale)} ${count(run.count, locale === "en" ? "place" : "lieu", locale === "en" ? "places" : "lieux")}`;
}

const kindOf = (p: PackPlaceRecord): string => (p.category === null || p.category.trim() === "" ? UNKNOWN : p.category.replace(/_/g, " "));

/** The listed places as numbered lines, in the order they are shown. */
export function orderedToText(places: readonly PackPlaceRecord[], sort: PackSort, locale: Locale, then: PackSort | null = null): string {
  const out = [t(locale, "Places in order", "Lieux en ordre"), "", packSortStatus(sort, places.length, locale, then), packSortHelp(sort, locale), packSortNotRanking(locale), ""];
  places.forEach((p, i) => {
    const parts = [p.name ?? UNKNOWN, kindOf(p), p.address ?? UNKNOWN, tagValue(p.tag, locale)];
    out.push(`${i + 1}. ${parts.join(locale === "fr" ? "\u202f; " : "; ")}`);
  });
  return `${out.join("\n")}\n`;
}

/** One row per place in the shown order, with its position. The retrieval date is ISO so a spreadsheet sorts it. */
export function orderedToCsv(places: readonly PackPlaceRecord[], locale: Locale): string {
  const header = [t(locale, "Position", "Position"), t(locale, "Place", "Lieu"), t(locale, "Id", "Identifiant"), t(locale, "Kind", "Type"), t(locale, "Address", "Adresse"), t(locale, "Wheelchair tag", "Étiquette fauteuil roulant"), t(locale, "Retrieved", "Consulté")].map(csvCell).join(",");
  const rows = places.map((p, i) => [String(i + 1), p.name ?? UNKNOWN, p.id, kindOf(p), p.address ?? UNKNOWN, tagValue(p.tag, locale), p.provenance?.retrievedOn ?? UNKNOWN].map(csvCell).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
