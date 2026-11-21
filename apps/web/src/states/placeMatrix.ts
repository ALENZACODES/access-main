/**
 * How far apart the listed places are from one another: every place against every other, with the
 * straight-line distance and the direction from the row's place to the column's place. It is a
 * table of measurements. It does not order the places, pick a route or say which to visit. A place
 * with no map point has UNKNOWN for every distance to or from it, and nothing is guessed.
 */
import { bearingDegrees, compassName, compassOf, SAME_SPOT_METRES, type Compass } from "./textMap";
import { distanceMetres, formatPackDistance, isPoint } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

const UNKNOWN = "UNKNOWN";
/** More than this and the table stops being readable; the shortlist holds fewer. */
export const MAX_MATRIX_PLACES = 30;

export interface MatrixPlace {
  readonly id: string;
  readonly name: string | null;
}

export interface MatrixCell {
  readonly fromId: string;
  readonly toId: string;
  /** Straight-line metres, or null when either place has no map point. Zero on the diagonal. */
  readonly metres: number | null;
  /** From the row's place to the column's place; null on the diagonal, within a few metres, or when metres is null. */
  readonly compass: Compass | null;
}

export interface PairFact {
  readonly aId: string;
  readonly bId: string;
  readonly metres: number;
}

export interface DistanceMatrix {
  readonly places: readonly MatrixPlace[];
  /** `cells[row][col]`, in the order of `places`. */
  readonly cells: readonly (readonly MatrixCell[])[];
  readonly located: number;
  readonly unlocatedIds: readonly string[];
  /** The two located places nearest each other, and the two furthest apart. Null with fewer than two located places. */
  readonly closest: PairFact | null;
  readonly widest: PairFact | null;
  /** True when the list was longer than the table allows and was cut. */
  readonly cut: boolean;
}

export function buildDistanceMatrix(places: readonly PackPlaceRecord[]): DistanceMatrix {
  const cut = places.length > MAX_MATRIX_PLACES;
  const used = places.slice(0, MAX_MATRIX_PLACES);
  const point = (p: PackPlaceRecord) => (p.location !== null && isPoint(p.location) ? p.location : null);
  const cells = used.map((a, i) =>
    used.map((b, j): MatrixCell => {
      const pa = point(a);
      const pb = point(b);
      if (i === j) return { fromId: a.id, toId: b.id, metres: pa === null ? null : 0, compass: null };
      if (pa === null || pb === null) return { fromId: a.id, toId: b.id, metres: null, compass: null };
      const metres = distanceMetres(pa, pb);
      return { fromId: a.id, toId: b.id, metres, compass: metres < SAME_SPOT_METRES ? null : compassOf(bearingDegrees(pa, pb)) };
    }),
  );
  let closest: PairFact | null = null;
  let widest: PairFact | null = null;
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      const m = cells[i]![j]!.metres;
      if (m === null) continue;
      const fact = { aId: used[i]!.id, bId: used[j]!.id, metres: m };
      // The earlier pair in list order wins a tie, so the answer does not depend on anything else.
      if (closest === null || m < closest.metres) closest = fact;
      if (widest === null || m > widest.metres) widest = fact;
    }
  }
  return {
    places: used.map((p) => ({ id: p.id, name: p.name })),
    cells,
    located: used.filter((p) => point(p) !== null).length,
    unlocatedIds: used.filter((p) => point(p) === null).map((p) => p.id),
    closest,
    widest,
    cut,
  };
}

/** What a table cell says: the distance and direction, "same place" on the diagonal, UNKNOWN when it cannot be measured. */
export function cellText(cell: MatrixCell, locale: Locale): string {
  if (cell.fromId === cell.toId) return t(locale, "same place", "même lieu");
  if (cell.metres === null) return UNKNOWN;
  const d = formatPackDistance(cell.metres, locale);
  if (cell.compass === null) return t(locale, `${d}, same spot`, `${d}, même endroit`);
  return `${d}, ${compassName(cell.compass, locale)}`;
}

const label = (m: DistanceMatrix, id: string): string => m.places.find((p) => p.id === id)?.name ?? UNKNOWN;

/** Descriptive sentences: how many places are measured, which two are nearest and furthest apart. Facts about the list, not advice. */
export function matrixSummary(m: DistanceMatrix, locale: Locale): string[] {
  const out: string[] = [];
  out.push(t(locale, `${m.located} of ${m.places.length} places have a map point and can be measured.`, `${m.located} lieux sur ${m.places.length} ont un point de carte et peuvent être mesurés.`));
  if (m.unlocatedIds.length > 0) out.push(t(locale, `Distances to and from ${m.unlocatedIds.length === 1 ? "the place" : "the places"} with no map point are UNKNOWN.`, `Les distances vers ${m.unlocatedIds.length === 1 ? "le lieu" : "les lieux"} sans point de carte, ou depuis ${m.unlocatedIds.length === 1 ? "lui" : "eux"}, sont UNKNOWN.`));
  if (m.closest !== null) {
    out.push(t(locale, `Nearest to each other: ${label(m, m.closest.aId)} and ${label(m, m.closest.bId)}, about ${formatPackDistance(m.closest.metres, "en")} apart.`, `Les plus proches l’un de l’autre\u00a0: ${label(m, m.closest.aId)} et ${label(m, m.closest.bId)}, à environ ${formatPackDistance(m.closest.metres, "fr")}.`));
  }
  if (m.widest !== null && m.located > 2) {
    out.push(t(locale, `Furthest apart: ${label(m, m.widest.aId)} and ${label(m, m.widest.bId)}, about ${formatPackDistance(m.widest.metres, "en")} apart.`, `Les plus éloignés l’un de l’autre\u00a0: ${label(m, m.widest.aId)} et ${label(m, m.widest.bId)}, à environ ${formatPackDistance(m.widest.metres, "fr")}.`));
  }
  if (m.cut) out.push(t(locale, `Only the first ${MAX_MATRIX_PLACES} places are measured.`, `Seuls les ${MAX_MATRIX_PLACES} premiers lieux sont mesurés.`));
  return out;
}

export function matrixCaveat(locale: Locale): string {
  return t(
    locale,
    "Distances and directions are straight lines between map points. A real route is longer and may not go that way. Each direction is from the place on the left to the place at the top.",
    "Les distances et les directions sont des lignes droites entre des points de carte. Un vrai itinéraire est plus long et peut ne pas passer par là. Chaque direction va du lieu de gauche vers le lieu du haut.",
  );
}
