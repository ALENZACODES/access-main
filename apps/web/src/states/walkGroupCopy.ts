/**
 * Wording for the "places close together" section. It says straight-line distance, says it is not a route,
 * and never says a group is a good or a bad place to go.
 */
import type { Locale } from "./stateCopy";
import { formatPackDistance } from "./packGeo";
import type { WheelchairTag } from "./packPlaces";
import { t } from "./typography";
import type { WalkGroupName } from "./walkGroupName";
import type { WalkGroupFilter, WalkGroupOrder, WalkGroupStats } from "./walkGroupStats";
import type { WalkDistance } from "./walkGroups";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const wgHeading = (l: Locale) => t(l, "Places close together", "Lieux rapprochés");
export const wgToggle = (open: boolean, l: Locale) => (open ? t(l, "Hide the places close together", "Masquer les lieux rapprochés") : t(l, "Group the places that are close together", "Regrouper les lieux rapprochés"));
export const wgIntro = (l: Locale) =>
  t(
    l,
    "Places are grouped when they are within the chosen distance of each other in a straight line, joined end to end. A group is not a route. The way between two places may be longer, and nothing here says it can be used with a wheelchair.",
    "Les lieux sont regroupés quand ils sont à moins de la distance choisie les uns des autres, en ligne droite, de proche en proche. Un groupe n’est pas un itinéraire. Le trajet entre deux lieux peut être plus long, et rien ici n’indique qu’il est praticable en fauteuil roulant.",
  );
export const wgDistanceGroup = (l: Locale) => t(l, "Distance between places", "Distance entre les lieux");
export const wgDistanceLabel = (d: WalkDistance, l: Locale) => t(l, `Within ${formatPackDistance(d, l)}`, `À moins de ${formatPackDistance(d, l)}`);
export const wgSummary = (s: WalkGroupStats, l: Locale) =>
  s.groups === 0
    ? t(l, "No two places are that close together.", "Aucun lieu n’est aussi proche d’un autre.")
    : t(
        l,
        `${s.groups} ${plural(s.groups, "group", "groups")} holding ${s.grouped} places (${s.percentGrouped}% of the places with a map point). The largest has ${s.largest}.`,
        `${s.groups} groupe${s.groups > 1 ? "s" : ""} de ${s.grouped} lieux (${s.percentGrouped}\u00a0% des lieux placés sur la carte). Le plus grand compte ${s.largest} lieux.`,
      );
export const wgAlone = (alone: number, l: Locale) =>
  alone === 0 ? "" : t(l, `${alone} ${plural(alone, "place has", "places have")} no other place that close.`, `${alone} lieu${alone > 1 ? "x n’ont" : " n’a"} aucun autre lieu aussi proche.`);
export const wgLeftOut = (withoutPoint: number, cut: number, l: Locale) => {
  const a = withoutPoint === 0 ? "" : t(l, `${withoutPoint} ${plural(withoutPoint, "place has", "places have")} no map point and ${plural(withoutPoint, "is", "are")} not grouped.`, `${withoutPoint} lieu${withoutPoint > 1 ? "x n’ont" : " n’a"} pas de point sur la carte et ${withoutPoint > 1 ? "ne sont" : "n’est"} pas regroupé${withoutPoint > 1 ? "s" : ""}.`);
  const b = cut === 0 ? "" : t(l, `${cut} ${plural(cut, "place was", "places were")} left out because the list is very long.`, `${cut} lieu${cut > 1 ? "x ont" : " a"} été laissé${cut > 1 ? "s" : ""} de côté, la liste étant très longue.`);
  return [a, b].filter(Boolean).join(" ");
};
export const wgNone = (l: Locale) => t(l, "Try a longer distance.", "Essayez une distance plus longue.");
export const wgNoMatch = (l: Locale) => t(l, "No group matches that choice.", "Aucun groupe ne correspond à ce choix.");
export const wgFilterGroup = (l: Locale) => t(l, "Show", "Afficher");
export const wgFilterLabel = (f: WalkGroupFilter, l: Locale) =>
  f === "all"
    ? t(l, "All groups", "Tous les groupes")
    : f === "mixed"
      ? t(l, "Different tags in the group", "Balises différentes dans le groupe")
      : f === "none-known"
        ? t(l, "Every tag UNKNOWN", "Toutes les balises UNKNOWN")
        : f === "several-unknown"
          ? t(l, "Two or more tags UNKNOWN", "Au moins deux balises UNKNOWN")
          : t(l, "A place tagged no", "Un lieu balisé non");
export const wgOrderGroup = (l: Locale) => t(l, "Order", "Ordre");
export const wgOrderLabel = (o: WalkGroupOrder, l: Locale) =>
  o === "size" ? t(l, "Largest first", "Plus grands d’abord") : o === "tight" ? t(l, "Tightest first", "Plus serrés d’abord") : o === "name" ? t(l, "By name", "Par nom") : t(l, "Pack order", "Ordre du pack");
export const wgGroupTitle = (name: WalkGroupName, l: Locale) =>
  name.kind === "street"
    ? t(l, `Around ${name.text}`, `Autour de ${name.text}`)
    : name.kind === "place"
      ? t(l, `Around ${name.text}`, `Autour de ${name.text}`)
      : t(l, "A group with no name in the pack", "Un groupe sans nom dans le pack");
export const wgSizeLine = (n: number, spreadM: number, widthM: number | null, l: Locale) => {
  const base = t(l, `${n} places, all within ${formatPackDistance(spreadM, l)} of the middle`, `${n} lieux, tous à moins de ${formatPackDistance(spreadM, l)} du centre`);
  return widthM === null ? `${base}.` : t(l, `${base}; the two furthest apart are ${formatPackDistance(widthM, l)} apart.`, `${base}\u00a0; les deux plus éloignés sont à ${formatPackDistance(widthM, l)} l’un de l’autre.`);
};
const TAG_ORDER: readonly WheelchairTag[] = ["yes", "designated", "limited", "no", "unknown"];
export const wgTagWord = (tag: WheelchairTag) => (tag === "unknown" ? "UNKNOWN" : tag);
export const wgTagMix = (tags: Readonly<Record<WheelchairTag, number>>, l: Locale) => {
  const parts = TAG_ORDER.filter((x) => tags[x] > 0).map((x) => `${tags[x]} ${wgTagWord(x)}`);
  return t(l, `Tags: ${parts.join(", ")}`, `Balises\u00a0: ${parts.join(", ")}`);
};
export const wgMoreLine = (n: number, l: Locale) => t(l, `and ${n} more in the saved files`, `et ${n} autres dans les fichiers enregistrés`);
export const wgNoName = (l: Locale) => t(l, "Name not in the pack", "Nom absent du pack");
export const wgMoreGroups = (n: number, l: Locale) => t(l, `${n} more ${plural(n, "group is", "groups are")} in the saved files.`, `${n} autre${n > 1 ? "s" : ""} groupe${n > 1 ? "s" : ""} ${n > 1 ? "figurent" : "figure"} dans les fichiers enregistrés.`);
export const wgCaveat = (l: Locale) => t(l, "Straight-line distances from the map points in the pack. Not a route, and not a statement about any path between places.", "Distances en ligne droite entre les points du pack. Ce n’est pas un itinéraire, et rien n’est dit sur un trajet entre les lieux.");
export const wgSaveText = (l: Locale) => t(l, "Save the groups as a text file", "Enregistrer les groupes en fichier texte");
export const wgSaveCsv = (l: Locale) => t(l, "Save the groups as a CSV file", "Enregistrer les groupes en fichier CSV");
export const wgSavedLine = (name: string, l: Locale) => t(l, `Saved ${name}.`, `Fichier ${name} enregistré.`);
export const wgCannotSave = (l: Locale) => t(l, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
export const WG_TEXT_NAME: Readonly<Record<Locale, string>> = { en: "places-close-together.txt", fr: "lieux-rapproches.txt" };
export const WG_CSV_NAME: Readonly<Record<Locale, string>> = { en: "places-close-together.csv", fr: "lieux-rapproches.csv" };
export const WG_CSV_HEADER = ["group", "group_name", "group_size", "spread_m", "width_m", "place_id", "place_name", "wheelchair_tag", "address", "latitude", "longitude", "nearest_other_m", "links_group"] as const;

/** Names of the places that link a group, as a short line. "and N more" past three. */
export const wgLinksLine = (names: readonly string[], distanceM: number, l: Locale) => {
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? t(l, ` and ${names.length - 3} more`, ` et ${names.length - 3} autres`) : "";
  return t(
    l,
    `Without ${names.length === 1 ? "this place" : "one of these places"} the rest of the group would split into parts more than ${formatPackDistance(distanceM, l)} apart: ${shown}${more}.`,
    `Sans ${names.length === 1 ? "ce lieu" : "l’un de ces lieux"}, le reste du groupe se diviserait en parties distantes de plus de ${formatPackDistance(distanceM, l)}\u00a0: ${shown}${more}.`,
  );
};
export const wgApartLine = (name: string, metres: number, l: Locale) =>
  t(l, `${name} is the furthest from its nearest neighbour in the group, ${formatPackDistance(metres, l)}.`, `${name} est le plus éloigné de son voisin le plus proche dans le groupe, à ${formatPackDistance(metres, l)}.`);
export const wgUnknownLine = (n: number, l: Locale) =>
  t(l, `${n} ${n === 1 ? "place here has" : "places here have"} no wheelchair tag (UNKNOWN).`, `${n} lieu${n > 1 ? "x" : ""} ${n > 1 ? "n’ont" : "n’a"} pas de balise d’accès en fauteuil roulant (UNKNOWN).`);

export const wgSweepHeading = (l: Locale) => t(l, "How the distance changes the groups", "Effet de la distance sur les groupes");
export const wgSweepCaption = (l: Locale) => t(l, "The same places grouped at each distance", "Les mêmes lieux regroupés à chaque distance");
export const wgSweepColumns = (l: Locale) => ({
  distance: t(l, "Distance", "Distance"),
  groups: t(l, "Groups", "Groupes"),
  grouped: t(l, "Places in a group", "Lieux dans un groupe"),
  largest: t(l, "Largest group", "Plus grand groupe"),
  alone: t(l, "Places alone", "Lieux isolés"),
});
export const wgNoneAt = (d: WalkDistance, l: Locale) => t(l, `Groups start to form at ${formatPackDistance(d, l)}.`, `Des groupes commencent à se former à ${formatPackDistance(d, l)}.`);
export const wgNoneAtAll = (l: Locale) => t(l, "No two places are close enough to group at any of these distances.", "Aucun lieu n’est assez proche d’un autre pour être regroupé à l’une de ces distances.");
export const wgSketchHeading = (l: Locale) => t(l, "Layout, north at the top (not to scale):", "Disposition, nord en haut (pas à l’échelle)\u00a0:");
export const wgSketchShared = (l: Locale) => t(l, "shares a square with another place (*)", "partage une case avec un autre lieu (*)");

/** What the next distance would change: groups that would join, new groups, places that would be taken in. */
export const wgNextLine = (next: WalkDistance, joined: number, fresh: number, l: Locale) => {
  const parts: string[] = [];
  if (joined > 0) parts.push(t(l, `${joined} ${plural(joined, "group", "groups")} would join into larger ones`, `${joined} groupe${joined > 1 ? "s" : ""} ${joined > 1 ? "se joindraient" : "se joindrait"} à des groupes plus grands`));
  if (fresh > 0) parts.push(t(l, `${fresh} new ${plural(fresh, "group", "groups")} would form`, `${fresh} nouveau${fresh > 1 ? "x" : ""} groupe${fresh > 1 ? "s" : ""} ${fresh > 1 ? "se formeraient" : "se formerait"}`));
  if (parts.length === 0) return t(l, `At ${formatPackDistance(next, l)} the groups would only get larger or stay the same.`, `À ${formatPackDistance(next, l)}, les groupes ne feraient que grandir ou resteraient identiques.`);
  return t(l, `At ${formatPackDistance(next, l)}: ${parts.join("; ")}.`, `À ${formatPackDistance(next, l)}\u00a0: ${parts.join("\u00a0; ")}.`);
};
