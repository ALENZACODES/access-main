/** Words for "places along a straight line". A straight line is not a route; a place near it is not on a step-free way. */
import { tagText } from "./outingCopy";
import { formatPackDistance } from "./packGeo";
import type { TagFilter } from "./packPlacesView";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import type { WayProblem, WayResult, WayRow, WaySide, WayStretch, WayWidth } from "./wayPlaces";

const UNKNOWN = "UNKNOWN";
type Ok = Extract<WayResult, { ok: true }>;

export const wayNameOf = (n: string | null): string => n ?? UNKNOWN;
const places = (n: number, locale: Locale): string => `${n} ${locale === "fr" ? (n > 1 ? "lieux" : "lieu") : n === 1 ? "place" : "places"}`;
const d = (m: number, locale: Locale): string => formatPackDistance(m, locale);

export function wayHeading(locale: Locale): string {
  return t(locale, "Places along a straight line", "Lieux le long d’une ligne droite");
}

export function wayToggle(open: boolean, locale: Locale): string {
  return open
    ? t(locale, "Hide places along a straight line", "Masquer les lieux le long d’une ligne droite")
    : t(locale, "Show places along a straight line", "Afficher les lieux le long d’une ligne droite");
}

export function wayIntro(locale: Locale): string {
  return t(
    locale,
    "Type two map points, for example where a trip starts and where it ends. The places on screen within the width you choose of the straight line between them are listed in order from the first point.",
    "Saisissez deux points de carte, par exemple le départ et l’arrivée d’un trajet. Les lieux affichés qui se trouvent à la distance choisie de la ligne droite entre eux sont listés dans l’ordre depuis le premier point.",
  );
}

/** What the list is, and what it is not. */
export function wayCaveat(locale: Locale): string {
  return t(
    locale,
    "A straight line is not a route: it does not follow streets or paths. A place near the line is not on a step-free way, and the list does not say whether a place can be reached.",
    "Une ligne droite n’est pas un itinéraire\u00a0: elle ne suit ni les rues ni les chemins. Un lieu proche de la ligne n’est pas sur un trajet sans marches, et la liste n’indique pas si un lieu est accessible.",
  );
}

export function wayWidthLabel(width: WayWidth, locale: Locale): string {
  return t(locale, `Within ${d(width, locale)} of the line`, `À ${d(width, locale)} de la ligne ou moins`);
}

export function wayWidthGroupLabel(locale: Locale): string {
  return t(locale, "How far from the line", "Distance maximale de la ligne");
}

export function wayWidthHelp(locale: Locale): string {
  return t(
    locale,
    "A place is listed when it is this close to the line, or this close to either point.",
    "Un lieu est listé s’il est à cette distance de la ligne ou moins, ou de l’un des deux points.",
  );
}

/** A filter choice: the tag, with how many listed places have it. UNKNOWN stays UNKNOWN in both languages. */
export function wayTagLabel(tag: TagFilter, n: number, locale: Locale): string {
  const word = tag === "any" ? t(locale, "Any tag", "Toute indication") : tagText(tag, locale);
  return `${word} (${n})`;
}

export function wayTagGroupLabel(locale: Locale): string {
  return t(locale, "OpenStreetMap wheelchair tag", "Indication OpenStreetMap pour fauteuil roulant");
}

export function wayLimitGroupLabel(locale: Locale): string {
  return t(locale, "How many to show", "Nombre de lieux affichés");
}

export function wayProblemText(problem: WayProblem, length: number, locale: Locale): string {
  switch (problem) {
    case "same-point":
      return t(
        locale,
        "Two points that follow each other are at the same place or almost, so there is no line between them. Move or remove one of them.",
        "Deux points qui se suivent sont au même endroit ou presque, il n’y a donc pas de ligne entre eux. Déplacez ou retirez l’un d’eux.",
      );
    case "too-long":
      return t(
        locale,
        `The path is ${d(length, locale)} long in all. Paths over 50\u00a0km are not measured: straight lines that long say little about a trip.`,
        `Le trajet mesure ${d(length, locale)} en tout. Les trajets de plus de 50\u00a0km ne sont pas mesurés\u00a0: des lignes droites aussi longues en disent peu sur un trajet.`,
      );
  }
}

/** "The line is 3.2 km long. 6 places are within 250 m of it, out of 40 with a map point. 2 have no map point: UNKNOWN." */
export function waySummary(r: Ok, locale: Locale): string {
  const located = r.rows.length + r.outside;
  const head = r.legs.length > 1 ? wayLegsText(r.legs, locale) : t(locale, `The line is ${d(r.length, locale)} long.`, `La ligne mesure ${d(r.length, locale)}.`);
  const count =
    r.rows.length === 0
      ? t(locale, `No place is within ${d(r.width, locale)} of it, out of ${places(located, locale)} with a map point.`, `Aucun lieu n’est à ${d(r.width, locale)} d’elle ou moins, sur ${places(located, locale)} avec un point de carte.`)
      : t(
          locale,
          `${places(r.rows.length, locale)} ${r.rows.length === 1 ? "is" : "are"} within ${d(r.width, locale)} of it, out of ${located} with a map point.`,
          `${places(r.rows.length, locale)} ${r.rows.length > 1 ? "sont" : "est"} à ${d(r.width, locale)} d’elle ou moins, sur ${located} avec un point de carte.`,
        );
  const none = r.unlocatedIds.length === 0 ? "" : t(locale, ` ${r.unlocatedIds.length} with no map point: UNKNOWN.`, ` ${r.unlocatedIds.length} sans point de carte\u00a0: UNKNOWN.`);
  return `${head} ${count}${none}`;
}

/** "The path has 2 parts, 3.2 km in all: 1.2 km, then 2.0 km." */
export function wayLegsText(legs: readonly number[], locale: Locale): string {
  const total = d(legs.reduce((s, x) => s + x, 0), locale);
  const each = legs.map((x) => d(x, locale)).join(t(locale, ", then ", ", puis "));
  return t(locale, `The path has ${legs.length} parts, ${total} in all: ${each}.`, `Le trajet a ${legs.length} parties, ${total} en tout\u00a0: ${each}.`);
}

export function waySideText(side: WaySide, locale: Locale): string {
  switch (side) {
    case "start":
      return t(locale, "before the first point", "avant le premier point");
    case "end":
      return t(locale, "past the second point", "après le deuxième point");
    case "line":
      return t(locale, "beside the line", "à côté de la ligne");
  }
}

/** "1.2 km along" or "before the first point": where the place sits on the way. */
export function wayAlongText(row: WayRow, locale: Locale): string {
  if (row.side !== "line") return waySideText(row.side, locale);
  return t(locale, `${d(row.along, locale)} along`, `à ${d(row.along, locale)} du départ`);
}

/** "Alpha: 1.2 km along, 80 m off the line. Wheelchair tag: yes." With more than one part, the part is named. */
export function wayRowText(row: WayRow, locale: Locale, parts = 1): string {
  const off = t(locale, `${d(row.off, locale)} off the line`, `à ${d(row.off, locale)} de la ligne`);
  const tag = t(locale, `Wheelchair tag: ${tagText(row.tag, locale)}`, `Indication fauteuil roulant\u00a0: ${tagText(row.tag, locale)}`);
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const part = parts > 1 ? t(locale, ` (part ${row.leg})`, ` (partie ${row.leg})`) : "";
  return `${wayNameOf(row.name)}${colon} ${wayAlongText(row, locale)}${part}, ${off}. ${tag}.`;
}

/** The longest part of the line with no listed place near it, or "" when there is none worth saying. */
export function wayStretchText(s: WayStretch | undefined, length: number, locale: Locale): string {
  if (!s) return "";
  if (s.from === 0 && s.to === length)
    return t(locale, "No place on the list is near any part of the line.", "Aucun lieu de la liste n’est près d’une partie de la ligne.");
  return t(
    locale,
    `The longest part of the line with no listed place near it is ${d(s.to - s.from, locale)}, from ${d(s.from, locale)} to ${d(s.to, locale)} along. This is where the list has nothing, not proof that nothing is there.`,
    `La plus longue partie de la ligne sans lieu listé à proximité mesure ${d(s.to - s.from, locale)}, de ${d(s.from, locale)} à ${d(s.to, locale)} du départ. C’est là où la liste n’a rien, pas la preuve qu’il n’y a rien.`,
  );
}

/** "Parts with no listed place near them for 500 m or more: from 1.2 km to 2.6 km; from 3.0 km to 3.8 km." */
export function wayStretchesText(stretches: readonly WayStretch[], min: number, locale: Locale): string {
  if (stretches.length === 0) return "";
  const each = stretches.map((s) => t(locale, `from ${d(s.from, locale)} to ${d(s.to, locale)}`, `de ${d(s.from, locale)} à ${d(s.to, locale)}`)).join(locale === "fr" ? "\u202f; " : "; ");
  return t(locale, `Parts with no listed place near them for ${d(min, locale)} or more: ${each}.`, `Parties sans lieu listé à proximité sur ${d(min, locale)} ou plus\u00a0: ${each}.`);
}

export function wayPickLabel(locale: Locale): string {
  return t(locale, "Use a place on screen as a point", "Utiliser un lieu affiché comme point");
}

export function wayPickNone(locale: Locale): string {
  return t(locale, "Choose a place", "Choisissez un lieu");
}

/** "Alpha (a1)": the id tells apart two places with the same name. */
export function wayPickOption(name: string | null, id: string): string {
  return `${wayNameOf(name)} (${id})`;
}

export function wayPickMore(more: number, locale: Locale): string {
  if (more <= 0) return "";
  return t(locale, `${more} more places are not in this list. Search the places above to narrow it.`, `${more} autres lieux ne sont pas dans cette liste. Cherchez parmi les lieux plus haut pour la réduire.`);
}

export function wayPickedText(which: "first" | "second", name: string | null, locale: Locale): string {
  return which === "first"
    ? t(locale, `The first point is now ${wayNameOf(name)}.`, `Le premier point est maintenant ${wayNameOf(name)}.`)
    : t(locale, `The second point is now ${wayNameOf(name)}.`, `Le deuxième point est maintenant ${wayNameOf(name)}.`);
}

export function wayPickFirst(locale: Locale): string {
  return t(locale, "Use as the first point", "Utiliser comme premier point");
}

export function wayPickSecond(locale: Locale): string {
  return t(locale, "Use as the second point", "Utiliser comme deuxième point");
}

export function wayPickNothing(locale: Locale): string {
  return t(locale, "Choose a place in the list first.", "Choisissez d’abord un lieu dans la liste.");
}

export function wayViaLegend(n: number, locale: Locale): string {
  return t(locale, `Point in between ${n}`, `Point intermédiaire ${n}`);
}

export function wayViaAdd(locale: Locale): string {
  return t(locale, "Add a point in between", "Ajouter un point intermédiaire");
}

export function wayViaRemove(n: number, locale: Locale): string {
  return t(locale, `Remove point in between ${n}`, `Retirer le point intermédiaire ${n}`);
}

export function wayViaFull(max: number, locale: Locale): string {
  return t(locale, `A path can have up to ${max} points in between.`, `Un trajet peut avoir jusqu’à ${max} points intermédiaires.`);
}

/** Said after a change: how many are shown, of how many, and with which tag. */
export function wayStatus(shown: number, total: number, tag: TagFilter, locale: Locale): string {
  const which = tag === "any" ? "" : t(locale, ` with the tag ${tagText(tag, locale)}`, ` avec l’indication ${tagText(tag, locale)}`);
  return t(locale, `Showing ${shown} of ${total} places${which}.`, `${shown} lieux affichés sur ${total}${which}.`);
}

export function wayMoreText(more: number, locale: Locale): string {
  if (more <= 0) return "";
  return t(locale, `${more} more places are not shown. Save a file to see all of them.`, `${more} autres lieux ne sont pas affichés. Enregistrez un fichier pour les voir tous.`);
}

export function wayCaption(shown: number, total: number, locale: Locale): string {
  return t(
    locale,
    `Showing ${shown} of ${total} places, in order from the first point. Distances are straight lines.`,
    `${shown} lieux affichés sur ${total}, dans l’ordre depuis le premier point. Les distances sont des lignes droites.`,
  );
}

export function wayColumns(locale: Locale): { position: string; place: string; along: string; off: string; tag: string } {
  return {
    position: t(locale, "Position", "Position"),
    place: t(locale, "Place", "Lieu"),
    along: t(locale, "Along the line", "Le long de la ligne"),
    off: t(locale, "Off the line", "Écart à la ligne"),
    tag: t(locale, "Wheelchair tag", "Indication fauteuil roulant"),
  };
}

export function wayWaitText(locale: Locale): string {
  return t(locale, "Type every point to see the list.", "Saisissez tous les points pour voir la liste.");
}

export function wayNoMatchText(locale: Locale): string {
  return t(locale, "No place in the band has this tag. Choose another tag to see the others.", "Aucun lieu de la bande n’a cette indication. Choisissez-en une autre pour voir les autres.");
}

export function wayPointError(locale: Locale): string {
  return t(
    locale,
    "Type a latitude from -90 to 90 and a longitude from -180 to 180, for example 43.65 and -79.38.",
    "Saisissez une latitude de -90 à 90 et une longitude de -180 à 180, par exemple 43,65 et -79,38.",
  );
}

export function waySavedText(name: string, locale: Locale): string {
  return t(locale, `Saved ${name}.`, `Fichier ${name} enregistré.`);
}

export function wayCannotSaveText(locale: Locale): string {
  return t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
}

export function wayReversedText(locale: Locale): string {
  return t(locale, "The points are now in the other order. Places are listed from the other end.", "Les points sont maintenant dans l’autre ordre. Les lieux sont listés depuis l’autre bout.");
}
