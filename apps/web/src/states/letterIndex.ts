/**
 * A first-letter index for the list of places on the page. A long list is slow to cross by keyboard or
 * with a screen reader, so the page offers one button for each letter that some shown name starts with.
 * Pressing it moves focus to the first shown place that starts with that letter.
 *
 * The letter is read from the name as the pack gives it, with accents removed: "Église" and "Elm Cafe"
 * both file under E. Names that start with a digit or with a character that is not a Latin letter file
 * under "#". A place with no name files under the token UNKNOWN, which comes last.
 */
import { placeCount } from "./packCategories";
import type { Locale } from "./stateCopy";
import { foldText } from "./suggest";

export const LETTER_INDEX_MIN_PLACES = 10;
export const OTHER_LETTER = "#";
export const UNKNOWN_LETTER = "UNKNOWN";

export interface LetterItem {
  readonly name: string;
  /** False when the pack has no name for the place. */
  readonly nameKnown: boolean;
}

export interface LetterGroup {
  /** "A" to "Z", "#", or UNKNOWN. */
  readonly key: string;
  readonly count: number;
  /** Position of the first place of this group in the list as shown. */
  readonly firstIndex: number;
}

export function letterOf(item: LetterItem): string {
  if (!item.nameKnown) return UNKNOWN_LETTER;
  const first = foldText(item.name).charAt(0);
  if (first >= "a" && first <= "z") return first.toUpperCase();
  return OTHER_LETTER;
}

const rank = (key: string): number => (key === UNKNOWN_LETTER ? 2 : key === OTHER_LETTER ? 1 : 0);

/** The groups in index order: A to Z, then "#", then UNKNOWN. Letters with no place are left out. */
export function buildLetterIndex(items: readonly LetterItem[]): LetterGroup[] {
  const groups = new Map<string, { count: number; firstIndex: number }>();
  items.forEach((item, index) => {
    const key = letterOf(item);
    const have = groups.get(key);
    if (have) have.count += 1;
    else groups.set(key, { count: 1, firstIndex: index });
  });
  return [...groups.entries()]
    .map(([key, g]) => ({ key, count: g.count, firstIndex: g.firstIndex }))
    .sort((a, b) => rank(a.key) - rank(b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export const showLetterIndex = (groups: readonly LetterGroup[], total: number): boolean => total >= LETTER_INDEX_MIN_PLACES && groups.length >= 2;

/** The spoken name of a letter button, such as "B, 3 places". */
export function letterButtonName(group: LetterGroup, locale: Locale): string {
  const places = placeCount(group.count, locale);
  const key = group.key === OTHER_LETTER ? (locale === "fr" ? "Chiffres et autres" : "Digits and others") : group.key;
  return `${key}, ${places}`;
}
