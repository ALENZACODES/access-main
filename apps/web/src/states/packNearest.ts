/**
 * The nearest place for each wheelchair tag, measured in a straight line from the point typed.
 *
 * This is a plain fact about the places shown: for each tag, which one lies closest. It does not
 * say that place is good, suitable or reachable, and a tag with no place shown has no nearest.
 * Places with no map point cannot be measured and are counted apart. The result is for the screen
 * only: it is never put in an export, because a distance to a named place says roughly where the
 * person typed from. Distances are rounded as in every other place on the page.
 */
import { distanceMetres, formatPackDistance, type Point } from "./packGeo";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";
import { BAND_TAG_ORDER } from "./packBands";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export interface NearestPlace {
  readonly id: string;
  readonly name: string | null;
  readonly metres: number;
}

export interface NearestRow {
  readonly tag: WheelchairTag;
  /** Places with this tag among those given, measured or not. */
  readonly total: number;
  /** The closest one with a map point, or null when none has one. */
  readonly nearest: NearestPlace | null;
}

export interface NearestResult {
  readonly rows: readonly NearestRow[];
  /** Places given that have no map point, so no distance. */
  readonly unmeasured: number;
}

function closer(a: NearestPlace, b: NearestPlace): boolean {
  if (a.metres !== b.metres) return a.metres < b.metres;
  // Equal distances: a named place before an unnamed one, then by name, then by id, so the answer never depends on input order.
  if ((a.name === null) !== (b.name === null)) return a.name !== null;
  const byName = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
  return byName !== 0 ? byName < 0 : a.id < b.id;
}

export function nearestByTag(places: readonly PackPlaceRecord[], from: Point): NearestResult {
  const totals = new Map<WheelchairTag, number>(BAND_TAG_ORDER.map((tag) => [tag, 0]));
  const best = new Map<WheelchairTag, NearestPlace>();
  let unmeasured = 0;
  for (const p of places) {
    totals.set(p.tag, (totals.get(p.tag) ?? 0) + 1);
    if (p.location === null) {
      unmeasured += 1;
      continue;
    }
    const candidate: NearestPlace = { id: p.id, name: p.name, metres: distanceMetres(from, p.location) };
    const current = best.get(p.tag);
    if (current === undefined || closer(candidate, current)) best.set(p.tag, candidate);
  }
  return { rows: BAND_TAG_ORDER.map((tag) => ({ tag, total: totals.get(tag) ?? 0, nearest: best.get(tag) ?? null })), unmeasured };
}

export function nearestTagLabel(tag: WheelchairTag, locale: Locale): string {
  switch (tag) {
    case "yes":
      return t(locale, "Yes", "Oui");
    case "limited":
      return t(locale, "Limited", "Limité");
    case "no":
      return t(locale, "No", "Non");
    case "designated":
      return t(locale, "Designated", "Réservé");
    case "unknown":
      return "UNKNOWN";
  }
}

export function nearestName(place: NearestPlace, locale: Locale): string {
  return place.name ?? t(locale, "Place with no name (UNKNOWN)", "Lieu sans nom (UNKNOWN)");
}

export function nearestDistance(place: NearestPlace, locale: Locale): string {
  return formatPackDistance(place.metres, locale);
}

/** What to show when a tag has no measured place: none shown, or shown but none has a map point. */
export function noNearestText(row: NearestRow, locale: Locale): string {
  return row.total === 0
    ? t(locale, "None among the places shown", "Aucun parmi les lieux affichés")
    : t(locale, "UNKNOWN (no place with this tag has a map point)", "UNKNOWN (aucun lieu avec cette indication n’a de point sur la carte)");
}

export function unmeasuredLine(count: number, locale: Locale): string {
  if (count === 0) return "";
  return t(
    locale,
    count === 1 ? "1 place has no map point, so it is left out of this list." : `${count} places have no map point, so they are left out of this list.`,
    count === 1 ? "1 lieu n’a pas de point sur la carte\u00a0: il est donc absent de cette liste." : `${count} lieux n’ont pas de point sur la carte\u00a0: ils sont donc absents de cette liste.`,
  );
}

export function nearestNote(locale: Locale): string {
  return t(
    locale,
    "The closest place for each tag, in a straight line. This is a distance, not a recommendation.",
    "Le lieu le plus proche pour chaque indication, en ligne droite. C’est une distance, pas une recommandation.",
  );
}
