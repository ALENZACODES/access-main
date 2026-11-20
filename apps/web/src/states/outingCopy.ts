/**
 * The words of the outing planner, in English and French. Every sentence describes distances
 * between map points or what the pack reports. None of them says an order is better, easier or
 * safer, or that a trip is possible.
 */
import { message, type MessageId } from "./messages";
import { formatPackDistance } from "./packGeo";
import type { WheelchairTag } from "./packPlaces";
import type { OutingMode, Outing } from "./outingPlan";
import { formatMinutes, minutesAt } from "./outingPace";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const UNKNOWN = "UNKNOWN";

/** A tag as shown: the pack's words, and the token UNKNOWN (never a translation of it) for none. */
export function tagText(tag: WheelchairTag, locale: Locale): string {
  return tag === "unknown" ? UNKNOWN : message(`pack.tag.${tag}` as MessageId, locale);
}

export function modeLabel(mode: OutingMode, locale: Locale): string {
  switch (mode) {
    case "added":
      return t(locale, "As added to the list", "Selon l’ajout à la liste");
    case "nearest":
      return t(locale, "Nearest next", "Le plus proche d’abord");
    case "mine":
      return t(locale, "My own order", "Mon propre ordre");
  }
}

export function modeHint(mode: OutingMode, locale: Locale): string {
  switch (mode) {
    case "added":
      return t(locale, "The places in the order you added them.", "Les lieux dans l’ordre où vous les avez ajoutés.");
    case "nearest":
      return t(locale, "Starts at the place nearest your starting point, then goes to the nearest place left. A simple rule, not the shortest possible tour.", "Commence par le lieu le plus proche de votre point de départ, puis va au plus proche des lieux restants. Une règle simple, pas le trajet le plus court possible.");
    case "mine":
      return t(locale, "Move places up or down to set the order yourself.", "Montez ou descendez les lieux pour fixer l’ordre vous-même.");
  }
}

export const planTitle = (locale: Locale): string => t(locale, "Plan an outing", "Planifier une sortie");

/** What the distances are, and are not. Shown wherever a distance is. */
export function outingStraightLineNote(locale: Locale): string {
  return t(
    locale,
    "Distances are straight lines between map points. They are not walking or rolling routes: they ignore streets, crossings, slopes and closures, and a real route is longer.",
    "Les distances sont des lignes droites entre des points de carte. Ce ne sont pas des itinéraires à pied ou en fauteuil\u00a0: elles ignorent les rues, les traversées, les pentes et les fermetures, et un vrai itinéraire est plus long.",
  );
}

export function paceNote(locale: Locale): string {
  return t(
    locale,
    "The time is a minimum along a straight line at the pace you typed. It leaves out waiting, rests and anything in the way. The pace is not saved.",
    "La durée est un minimum en ligne droite au rythme que vous avez saisi. Elle ne compte ni l’attente, ni les pauses, ni les obstacles. Le rythme n’est pas enregistré.",
  );
}

export const startLine = (has: boolean, locale: Locale): string =>
  has ? t(locale, "The first distance is from your starting point.", "La première distance part de votre point de départ.") : t(locale, "No starting point is set, so the first stop has no distance.", "Aucun point de départ n’est défini\u00a0: le premier arrêt n’a donc pas de distance.");

function placesPhrase(n: number, locale: Locale): string {
  return t(locale, n === 1 ? "1 stop" : `${n} stops`, n === 1 ? "1 arrêt" : `${n} arrêts`);
}

/** One sentence: how many stops, the known total, and what is missing from it. */
export function summaryLine(outing: Outing, locale: Locale, kmh: number | null): string {
  const stops = placesPhrase(outing.stops.length, locale);
  if (outing.legCount === 0) return t(locale, `${stops}. There is no distance to add up.`, `${stops}. Il n’y a aucune distance à additionner.`);
  const dist = formatPackDistance(outing.totalMetres, locale);
  const timeEn = kmh === null ? "" : ` At least ${formatMinutes(minutesAt(outing.totalMetres, kmh))} at your pace.`;
  const timeFr = kmh === null ? "" : ` Au moins ${formatMinutes(minutesAt(outing.totalMetres, kmh))} à votre rythme.`;
  if (outing.complete) return t(locale, `${stops}, about ${dist} in straight lines in all.${timeEn}`, `${stops}, environ ${dist} en lignes droites au total.${timeFr}`);
  const missing = outing.legCount - outing.legsKnown;
  const legs = (n: number, l: Locale) => t(l, n === 1 ? "1 distance is" : `${n} distances are`, n === 1 ? "1 distance est" : `${n} distances sont`);
  return t(
    locale,
    `${stops}. The ${outing.legsKnown} known ${outing.legsKnown === 1 ? "distance adds" : "distances add"} up to about ${dist}, and ${legs(missing, "en")} UNKNOWN because a place has no map point.${timeEn}`,
    `${stops}. ${outing.legsKnown === 1 ? "La distance connue fait" : `Les ${outing.legsKnown} distances connues font`} environ ${dist}, et ${legs(missing, "fr")} UNKNOWN faute de point de carte pour un lieu.${timeFr}`,
  );
}

/** "350 m", or UNKNOWN when the leg has no distance. */
export function legText(metres: number | null, locale: Locale): string {
  return metres === null ? UNKNOWN : formatPackDistance(metres, locale);
}

export function legTimeText(metres: number | null, kmh: number | null): string {
  if (kmh === null) return "";
  return metres === null ? UNKNOWN : formatMinutes(minutesAt(metres, kmh));
}

export function movedLine(name: string, position: number, total: number, locale: Locale): string {
  return t(locale, `${name} moved to position ${position} of ${total}.`, `${name} déplacé à la position ${position} sur ${total}.`);
}

export function cannotMoveLine(name: string, position: number, step: -1 | 1, locale: Locale): string {
  const first = step === -1;
  return t(
    locale,
    `${name} is already ${first ? "first" : "last"} (position ${position}).`,
    `${name} est déjà ${first ? "premier" : "dernier"} (position ${position}).`,
  );
}
