/**
 * Every sentence the "Around a place" list says, in English and French.
 *
 * The wording is about distance and direction in a straight line and about the tags the pack
 * gives. It never calls a place near enough, close, convenient, suitable or reachable, never says
 * what a person can do there, and shows a missing tag as the token UNKNOWN.
 */
import { compassFrom, compassShort, compassWord, type CompassPoint } from "./aroundBearing";
import type { AroundCentre, AroundMember, AroundResult } from "./aroundSearch";
import type { RingRow, SectorRow, TagCounts } from "./aroundRings";
import { AROUND_TAG_COLUMNS } from "./aroundRings";
import { formatPackDistance } from "./packGeo";
import { nearestTagLabel } from "./packNearest";
import type { Locale } from "./stateCopy";
import { NBSP, t } from "./typography";

/** A colon with its French spacing: no space before in English, a no-break space before in French. */
export function colon(locale: Locale): string {
  return locale === "fr" ? "\u00a0: " : ": ";
}

export function placeNoun(n: number, locale: Locale): string {
  return t(locale, n === 1 ? "place" : "places", n === 1 ? "lieu" : "lieux");
}

export function noName(locale: Locale): string {
  return t(locale, "Place with no name (UNKNOWN)", "Lieu sans nom (UNKNOWN)");
}

export function aroundHeading(locale: Locale): string {
  return t(locale, "Places around one place", "Lieux autour d’un lieu");
}

export function aroundIntro(locale: Locale): string {
  return t(
    locale,
    "Choose a place from the pack to see the other places listed within a distance of it. Distances and directions are in a straight line on the map, not along streets.",
    "Choisissez un lieu du pack pour voir les autres lieux répertoriés à une certaine distance. Les distances et les directions sont en ligne droite sur la carte, pas le long des rues.",
  );
}

export function aroundToggle(open: boolean, locale: Locale): string {
  return open ? t(locale, "Hide places around a place", "Masquer les lieux autour d’un lieu") : t(locale, "Show places around a place", "Afficher les lieux autour d’un lieu");
}

export function radiusLabel(metres: number, locale: Locale): string {
  return formatPackDistance(metres, locale).replace(/[.,]0(?=\u00a0)/, "");
}

export function radiusOptionLabel(metres: number, locale: Locale): string {
  return t(locale, `Within ${radiusLabel(metres, "en")}`, `À moins de ${radiusLabel(metres, "fr")}`);
}

export function centreName(centre: Pick<AroundCentre, "name">, locale: Locale): string {
  return centre.name ?? noName(locale);
}

/** A name for the choice list: the name, with the address after it when one is given, so two places with one name can be told apart. */
export function centreOptionLabel(p: { name: string | null; address: string | null; id: string }, locale: Locale): string {
  const name = p.name ?? noName(locale);
  return p.address === null ? name : `${name}, ${p.address}`;
}

export function memberName(m: Pick<AroundMember, "name">, locale: Locale): string {
  return m.name ?? noName(locale);
}

export function tagWord(tag: keyof TagCounts, locale: Locale): string {
  return nearestTagLabel(tag, locale);
}

/** "1 Yes, 2 No, 1 UNKNOWN": only tags that have a place. Empty when there are none. */
export function tagCountsSentence(counts: TagCounts, locale: Locale): string {
  return AROUND_TAG_COLUMNS.filter((tag) => counts[tag] > 0)
    .map((tag) => `${counts[tag]}${NBSP}${tagWord(tag, locale)}`)
    .join(", ");
}

/** Distance and direction: "120 m to the north-east" / "120 m au nord-est". */
export function distanceAndDirection(metres: number, direction: CompassPoint | null, locale: Locale): string {
  const d = formatPackDistance(metres, locale);
  return direction === null ? t(locale, `${d}, at the same spot`, `${d}, au même point`) : `${d} ${compassFrom(direction, locale)}`;
}

export function memberLine(m: AroundMember, locale: Locale): string {
  const tag = t(locale, "wheelchair tag", "indication pour fauteuil roulant");
  return `${memberName(m, locale)}, ${distanceAndDirection(m.metres, m.direction, locale)}, ${tag}${colon(locale)}${tagWord(m.tag, locale)}`;
}

export function noPointCentre(centre: AroundCentre, locale: Locale): string {
  return t(
    locale,
    `${centreName(centre, "en")} has no map point in the pack, so the places around it cannot be measured. Choose a place that has one.`,
    `${centreName(centre, "fr")} n’a pas de point sur la carte dans le pack\u00a0: les lieux autour de lui ne peuvent donc pas être mesurés. Choisissez un lieu qui en a un.`,
  );
}

export function centreNotFound(locale: Locale): string {
  return t(locale, "That place is no longer in the list shown. Choose another.", "Ce lieu n’est plus dans la liste affichée. Choisissez-en un autre.");
}

export function chooseFirst(locale: Locale): string {
  return t(locale, "Choose a place to see what is listed around it.", "Choisissez un lieu pour voir ce qui est répertorié autour de lui.");
}

/** The headline: how many places are listed within the distance, and their tags. */
export function aroundSummary(result: Extract<AroundResult, { status: "ok" }>, shown: number, filtered: boolean, locale: Locale): string {
  const name = centreName(result.centre, locale);
  const total = result.members.length;
  if (total === 0) {
    return t(
      locale,
      `No other place with a map point is listed within ${radiusLabel(result.radius, "en")} of ${name}.`,
      `Aucun autre lieu avec un point sur la carte n’est répertorié à moins de ${radiusLabel(result.radius, "fr")} de ${name}.`,
    );
  }
  const head = t(
    locale,
    `${total} ${placeNoun(total, "en")} listed within ${radiusLabel(result.radius, "en")} of ${name}.`,
    `${total} ${placeNoun(total, "fr")} répertorié${total === 1 ? "" : "s"} à moins de ${radiusLabel(result.radius, "fr")} de ${name}.`,
  );
  if (!filtered) return head;
  return t(locale, `${head} ${shown} shown after your filters.`, `${head} ${shown} affiché${shown === 1 ? "" : "s"} après vos filtres.`);
}

export function beyondLine(n: number, radius: number, locale: Locale): string {
  if (n === 0) return "";
  return t(
    locale,
    `${n} more ${placeNoun(n, "en")} with a map point ${n === 1 ? "lies" : "lie"} farther than ${radiusLabel(radius, "en")}.`,
    `${n} autre${n === 1 ? "" : "s"} ${placeNoun(n, "fr")} avec un point sur la carte ${n === 1 ? "se trouve" : "se trouvent"} à plus de ${radiusLabel(radius, "fr")}.`,
  );
}

export function aroundUnmeasuredLine(n: number, locale: Locale): string {
  if (n === 0) return "";
  return t(
    locale,
    n === 1 ? "1 place has no map point, so it is left out." : `${n} places have no map point, so they are left out.`,
    n === 1 ? "1 lieu n’a pas de point sur la carte\u00a0: il est donc absent." : `${n} lieux n’ont pas de point sur la carte\u00a0: ils sont donc absents.`,
  );
}

export function aroundCaveat(locale: Locale): string {
  return t(
    locale,
    "A place being listed here says only where it is on the map. It does not say the way between the two is open, step-free or short.",
    "Qu’un lieu figure ici indique seulement où il se trouve sur la carte. Cela ne dit pas que le chemin entre les deux est ouvert, sans marche ou court.",
  );
}

export function noMatchesLine(locale: Locale): string {
  return t(locale, "None of the places around it match your filters.", "Aucun des lieux autour de lui ne correspond à vos filtres.");
}

export function ringLabel(row: Pick<RingRow, "from" | "upTo">, locale: Locale): string {
  return row.from === 0
    ? t(locale, `Up to ${radiusLabel(row.upTo, "en")}`, `Jusqu’à ${radiusLabel(row.upTo, "fr")}`)
    : t(locale, `${radiusLabel(row.from, "en")} to ${radiusLabel(row.upTo, "en")}`, `De ${radiusLabel(row.from, "fr")} à ${radiusLabel(row.upTo, "fr")}`);
}

export function sectorLabel(row: Pick<SectorRow, "point">, locale: Locale): string {
  if (row.point === null) return t(locale, "At the same spot", "Au même point");
  return `${compassWord(row.point, locale)} (${compassShort(row.point, locale)})`;
}

export function nearestInSector(row: SectorRow, locale: Locale): string {
  if (row.nearest === null) return "";
  return `${row.nearest.name ?? noName(locale)}, ${formatPackDistance(row.nearest.metres, locale)}`;
}
