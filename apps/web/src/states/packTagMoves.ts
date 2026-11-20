/**
 * How wheelchair tags moved between a places file saved earlier and the pack stored now.
 *
 * Built only from a PackDiff. Each place counts once, in the cell for the tag it had then (or
 * "not in the earlier file") and the tag it has now (or "not listed now"). A place whose tag did
 * not change is not in any cell: this table is about movement, not about every place. UNKNOWN is a
 * tag like the others here, so a move from UNKNOWN to a value is a move. Nothing says a move is an
 * improvement or a decline, and a place going from one tag to another is not a ruling on the place.
 */
import type { PackDiff } from "./packDiff";
import type { WheelchairTag } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const MOVE_TAGS: readonly WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];
/** The side of a move where the place is not: not in the earlier file (added) or not listed now (no longer listed). */
export const ABSENT = "absent" as const;
export type MoveKey = WheelchairTag | typeof ABSENT;
export const MOVE_KEYS: readonly MoveKey[] = [...MOVE_TAGS, ABSENT];

export interface MovedPlace {
  readonly id: string;
  readonly name: string | null;
}

export interface TagMoves {
  /** cells[from][to]: how many places went from `from` to `to`. The diagonal is always 0. */
  readonly cells: Readonly<Record<MoveKey, Readonly<Record<MoveKey, number>>>>;
  /** The places in each cell, in id order. */
  readonly places: ReadonlyMap<string, readonly MovedPlace[]>;
  /** Places in both files whose tag differs. */
  readonly tagChanges: number;
  /** Of those: UNKNOWN to a reported tag, a reported tag to UNKNOWN, and between two reported tags. */
  readonly nowReported: number;
  readonly nowUnknown: number;
  readonly betweenReported: number;
  readonly added: number;
  readonly removed: number;
  /** Tag changes whose text was not a tag this App knows. Never counted in a cell. */
  readonly unrecognised: number;
}

export const cellKey = (from: MoveKey, to: MoveKey): string => `${from}>${to}`;

/** A tag as the diff writes it (the token UNKNOWN or a tag name) back to a tag, or null when it is neither. */
export function tagFromToken(token: string): WheelchairTag | null {
  if (token === "UNKNOWN") return "unknown";
  return (MOVE_TAGS as readonly string[]).includes(token) && token !== "unknown" ? (token as WheelchairTag) : null;
}

function emptyCells(): Record<MoveKey, Record<MoveKey, number>> {
  const row = (): Record<MoveKey, number> => ({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0, absent: 0 });
  return { yes: row(), limited: row(), no: row(), designated: row(), unknown: row(), absent: row() };
}

export function buildTagMoves(diff: PackDiff): TagMoves {
  const cells = emptyCells();
  const lists = new Map<string, MovedPlace[]>();
  const put = (from: MoveKey, to: MoveKey, place: MovedPlace) => {
    cells[from][to] += 1;
    const key = cellKey(from, to);
    const list = lists.get(key);
    if (list) list.push(place);
    else lists.set(key, [place]);
  };
  let nowReported = 0;
  let nowUnknown = 0;
  let betweenReported = 0;
  let unrecognised = 0;
  let tagChanges = 0;
  for (const p of diff.added) put(ABSENT, p.tag, { id: p.id, name: p.name });
  for (const p of diff.removed) put(p.tag, ABSENT, { id: p.id, name: p.name });
  for (const c of diff.changed) {
    const change = c.changes.find((x) => x.field === "tag");
    if (change === undefined) continue;
    const from = tagFromToken(change.before);
    const to = tagFromToken(change.after);
    if (from === null || to === null || from === to) {
      unrecognised += 1;
      continue;
    }
    tagChanges += 1;
    if (from === "unknown") nowReported += 1;
    else if (to === "unknown") nowUnknown += 1;
    else betweenReported += 1;
    put(from, to, { id: c.id, name: c.name });
  }
  for (const list of lists.values()) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { cells, places: lists, tagChanges, nowReported, nowUnknown, betweenReported, added: diff.added.length, removed: diff.removed.length, unrecognised };
}

/** The places in one cell. */
export function placesIn(moves: TagMoves, from: MoveKey, to: MoveKey): readonly MovedPlace[] {
  return moves.places.get(cellKey(from, to)) ?? [];
}

/** True when there is nothing to show: no tag changed and no place was added or removed. */
export function noTagMoves(moves: TagMoves): boolean {
  return moves.tagChanges === 0 && moves.added === 0 && moves.removed === 0;
}

export interface RankedMove {
  readonly from: MoveKey;
  readonly to: MoveKey;
  readonly places: number;
}

/** The cells that have places, most places first, then in table order. Only an ordering by how many, never by how good. */
export function rankedMoves(moves: TagMoves): RankedMove[] {
  const out: RankedMove[] = [];
  for (const from of MOVE_KEYS) for (const to of MOVE_KEYS) if (moves.cells[from][to] > 0) out.push({ from, to, places: moves.cells[from][to] });
  return out.map((m, i) => ({ m, i })).sort((a, b) => b.m.places - a.m.places || a.i - b.i).map(({ m }) => m);
}

export function moveKeyLabel(key: MoveKey, locale: Locale, side: "from" | "to"): string {
  switch (key) {
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
    case "absent":
      return side === "from" ? t(locale, "Not in the earlier file", "Absent du fichier précédent") : t(locale, "Not listed now", "Ne figure plus");
  }
}

/** "Yes to Limited", "Not in the earlier file to Yes": one move in words. */
export function moveLabel(from: MoveKey, to: MoveKey, locale: Locale): string {
  return t(locale, `${moveKeyLabel(from, "en", "from")} to ${moveKeyLabel(to, "en", "to")}`, `${moveKeyLabel(from, "fr", "from")} vers ${moveKeyLabel(to, "fr", "to")}`);
}

function plural(n: number, locale: Locale, en: [string, string], fr: [string, string]): string {
  const forms = locale === "fr" ? fr : en;
  const one = locale === "fr" ? n === 0 || n === 1 : n === 1;
  return (one ? forms[0] : forms[1]).replace("{n}", String(n));
}

/** One sentence on the tags that changed in places present in both files. Says nothing about better or worse. */
export function tagMovesLine(moves: TagMoves, locale: Locale): string {
  if (moves.tagChanges === 0) return t(locale, "No wheelchair tag changed in the places found in both.", "Aucune indication pour fauteuil roulant n’a changé dans les lieux présents dans les deux.");
  const parts: string[] = [];
  if (moves.nowReported > 0) parts.push(t(locale, `${moves.nowReported} from UNKNOWN to a reported tag`, `${moves.nowReported} de UNKNOWN à une indication fournie`));
  if (moves.nowUnknown > 0) parts.push(t(locale, `${moves.nowUnknown} from a reported tag to UNKNOWN`, `${moves.nowUnknown} d’une indication fournie à UNKNOWN`));
  if (moves.betweenReported > 0) parts.push(t(locale, `${moves.betweenReported} from one reported tag to another`, `${moves.betweenReported} d’une indication fournie à une autre`));
  const head = plural(moves.tagChanges, locale, ["{n} place changed its wheelchair tag", "{n} places changed their wheelchair tag"], ["{n} lieu a changé d’indication pour fauteuil roulant", "{n} lieux ont changé d’indication pour fauteuil roulant"]);
  return `${head}${locale === "fr" ? "\u00a0:" : ":"} ${parts.join(locale === "fr" ? "\u202f; " : "; ")}.`;
}

/** The places added and no longer listed, by count. Empty when there are none. */
export function addedRemovedLine(moves: TagMoves, locale: Locale): string {
  const parts: string[] = [];
  if (moves.added > 0) parts.push(plural(moves.added, locale, ["{n} place added", "{n} places added"], ["{n} lieu ajouté", "{n} lieux ajoutés"]));
  if (moves.removed > 0) parts.push(plural(moves.removed, locale, ["{n} place no longer listed", "{n} places no longer listed"], ["{n} lieu ne figure plus", "{n} lieux ne figurent plus"]));
  return parts.length === 0 ? "" : `${parts.join(locale === "fr" ? "\u202f; " : "; ")}.`;
}

/** The reminder shown with the table and every export. */
export function tagMovesNote(locale: Locale): string {
  return t(
    locale,
    "A move is only a difference between two lists. It is not a rating of the place, and it does not say which tag is right now.",
    "Un changement n’est qu’une différence entre deux listes. Ce n’est pas une évaluation du lieu, et il ne dit pas quelle indication est juste aujourd’hui.",
  );
}
