/** Words and files for places that share a name. Distances from the person's point appear on screen only, never in a file. */
import { csvCell } from "./exportData";
import { tagValue } from "./placeSheet";
import { formatPackDistance } from "./packGeo";
import { type SameNameFilter, type SameNameGroup, type SameNameMember, type SameNameOrder, type SameNameResult, type SameNameSize } from "./sameName";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const SAME_NAME_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-with-the-same-name.txt", fr: "lieux-du-meme-nom.txt" };
export const SAME_NAME_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-with-the-same-name.csv", fr: "lieux-du-meme-nom.csv" };

const UNKNOWN = "UNKNOWN";
const colon = (locale: Locale): string => (locale === "fr" ? "\u00a0:" : ":");
const TAGS = ["yes", "limited", "no", "designated", "unknown"] as const;

/** "1 place", "3 places"; French counts 0 and 1 as singular. */
export function placesCount(n: number, locale: Locale): string {
  const one = locale === "fr" ? n >= 0 && n < 2 : n === 1;
  return `${n} ${one ? t(locale, "place", "lieu") : t(locale, "places", "lieux")}`;
}

export function sameNameOrderLabel(o: SameNameOrder, locale: Locale): string {
  switch (o) {
    case "count":
      return t(locale, "Most places first", "Plus de lieux d’abord");
    case "name":
      return t(locale, "By name", "Par nom");
    case "nearest":
      return t(locale, "Closest to the point typed first", "Le plus près du point saisi d’abord");
  }
}

export function sameNameOrderHelp(o: SameNameOrder, hasPoint: boolean, locale: Locale): string {
  switch (o) {
    case "count":
      return t(locale, "Names with the most places come first; ties go in name order.", "Les noms qui ont le plus de lieux viennent en premier\u202f; à égalité, l’ordre des noms s’applique.");
    case "name":
      return t(locale, "Names are in alphabetical order, ignoring accents and case.", "Les noms sont en ordre alphabétique, sans tenir compte des accents ni de la casse.");
    case "nearest":
      return hasPoint
        ? t(locale, "Each name is placed by its closest place to the point typed above. Names with no measurable place come last.", "Chaque nom est placé selon son lieu le plus proche du point saisi plus haut. Les noms sans lieu mesurable viennent en dernier.")
        : t(locale, "Type a point above to measure; until then this is name order.", "Saisissez un point plus haut pour mesurer\u202f; d’ici là, c’est l’ordre des noms.");
  }
}

export function sameNameSizeLabel(n: SameNameSize, locale: Locale): string {
  return t(locale, `${n} or more places`, `${n} lieux ou plus`);
}

export function sameNameFilterLabel(f: SameNameFilter, locale: Locale): string {
  return f === "all" ? t(locale, "All names", "Tous les noms") : t(locale, "Only where the wheelchair tags differ", "Seulement si les indications pour fauteuil roulant diffèrent");
}

/** What a group is, and what it is not. */
export function sameNameCaveat(locale: Locale): string {
  return t(
    locale,
    "Places are listed together only because their names match once case, accents, punctuation, a branch number and a bracketed note are ignored. They may be unrelated, and nothing here says one is better than another.",
    "Les lieux sont réunis seulement parce que leurs noms concordent sans tenir compte de la casse, des accents, de la ponctuation, d’un numéro de succursale et d’une note entre parenthèses. Ils peuvent n’avoir aucun lien, et rien ici ne dit que l’un vaut mieux qu’un autre.",
  );
}

/** "3 names are shared by 2 or more places. 14 places have a name of their own. 2 places have no usable name: UNKNOWN." */
export function sameNameSummary(result: SameNameResult, listed: number, locale: Locale): string {
  const names = listed === 1 ? t(locale, "1 name is shared", "1 nom est partagé") : t(locale, `${listed} names are shared`, `${listed} noms sont partagés`);
  const head = t(locale, `${names} by the places on screen.`, `${names} par les lieux affichés.`);
  const alone = t(locale, ` ${placesCount(result.alone, locale)} with a name of their own.`, ` ${placesCount(result.alone, locale)} avec un nom unique.`);
  const none = result.unnamed === 0 ? "" : t(locale, ` ${placesCount(result.unnamed, locale)} with no usable name: ${UNKNOWN}.`, ` ${placesCount(result.unnamed, locale)} sans nom utilisable${colon("fr")} ${UNKNOWN}.`);
  return `${head}${alone}${none}`;
}

export function sameNameEmptyText(result: SameNameResult, locale: Locale): string {
  return result.groups.length === 0
    ? t(locale, "No two places on screen share a name.", "Aucun nom n’est partagé par deux lieux affichés.")
    : t(locale, "No shared name matches these choices.", "Aucun nom partagé ne correspond à ces choix.");
}

/** "Yes 2, No 1": the tags in a group in a fixed order, counts only. */
export function sameNameTagMix(g: SameNameGroup, locale: Locale): string {
  const parts: string[] = [];
  for (const tag of TAGS) {
    const n = g.members.filter((m) => m.tag === tag).length;
    if (n > 0) parts.push(`${tagValue(tag, locale)} ${n}`);
  }
  return parts.join(", ");
}

export function sameNameHeading(g: SameNameGroup, locale: Locale): string {
  return t(locale, `${g.label}: ${placesCount(g.members.length, locale)}`, `${g.label}\u00a0: ${placesCount(g.members.length, locale)}`);
}

/** "The tags differ: Yes 2, No 1." or "All carry the same tag: Yes 3." */
export function sameNameTagsLine(g: SameNameGroup, locale: Locale): string {
  const mix = sameNameTagMix(g, locale);
  return g.tagsDiffer
    ? t(locale, `The wheelchair tags differ: ${mix}.`, `Les indications pour fauteuil roulant diffèrent\u00a0: ${mix}.`)
    : t(locale, `All carry the same wheelchair tag: ${mix}.`, `Tous portent la même indication pour fauteuil roulant\u00a0: ${mix}.`);
}

/** One member on screen: address, tag and, when a point is typed, a straight-line distance. */
export function sameNameMemberText(m: SameNameMember, locale: Locale, withDistance: boolean): string {
  const addr = m.address ?? UNKNOWN;
  const tag = t(locale, `wheelchair tag ${tagValue(m.tag, locale)}`, `indication pour fauteuil roulant ${tagValue(m.tag, locale)}`);
  const dist = withDistance && m.metres !== null ? t(locale, `, ${formatPackDistance(m.metres, locale)} from the point typed`, `, à ${formatPackDistance(m.metres, locale)} du point saisi`) : "";
  return `${addr}${locale === "fr" ? "\u202f; " : "; "}${tag}${dist}`;
}

/** What is saved: the groups listed, with no distance from the person's point. */
export function sameNameToText(result: SameNameResult, groups: readonly SameNameGroup[], locale: Locale): string {
  const out = [t(locale, "Places that share a name", "Lieux qui portent le même nom"), "", sameNameCaveat(locale), sameNameSummary(result, result.groups.length, locale), ""];
  if (groups.length === 0) out.push(sameNameEmptyText(result, locale));
  for (const g of groups) {
    out.push(sameNameHeading(g, locale), sameNameTagsLine(g, locale));
    for (const m of g.members) out.push(`- ${m.name} (${m.id})${colon(locale)} ${sameNameMemberText(m, locale, false)}`);
    out.push("");
  }
  return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

/** One row per member of each group listed. No distance column: where the person is stays on screen. */
export function sameNameToCsv(groups: readonly SameNameGroup[], locale: Locale): string {
  const header = [t(locale, "Name", "Nom"), t(locale, "Places with this name", "Lieux de ce nom"), t(locale, "Tags differ", "Indications différentes"), t(locale, "Place", "Lieu"), t(locale, "Id", "Identifiant"), t(locale, "Address", "Adresse"), t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")].map(csvCell).join(",");
  const yes = t(locale, "yes", "oui");
  const no = t(locale, "no", "non");
  const rows = groups.flatMap((g) => g.members.map((m) => [g.label, String(g.members.length), g.tagsDiffer ? yes : no, m.name, m.id, m.address ?? UNKNOWN, m.tag === "unknown" ? UNKNOWN : tagValue(m.tag, locale)].map(csvCell).join(",")));
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
