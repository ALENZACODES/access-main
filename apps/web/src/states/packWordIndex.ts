/**
 * The words the pack uses, counted by place. A word is a run of letters or digits in a name, an address,
 * a kind or a note, folded the way the search folds text (no accents, no capitals). Counting is by place:
 * a word that appears three times in one place's name is one place. Nothing here judges a word. It says
 * which words are in the pack and how many places have each, so a search can be matched to them.
 */
import { normalizeText } from "./filters";
import type { PackPlaceRecord } from "./packPlaces";

export const WORD_FIELDS = ["any", "name", "address", "kind", "note"] as const;
export type WordField = (typeof WORD_FIELDS)[number];

export const WORD_MIN_LENGTH = 2;
export const WORD_MAX_LENGTH = 40;

export interface WordEntry {
  /** Folded word. */
  readonly word: string;
  /** Places that have it in this field. */
  readonly places: number;
}

export type WordIndex = Readonly<Record<WordField, ReadonlyMap<string, number>>>;

/** Words of a text, folded, in order, with repeats. "fast_food" is two words, as the kind search reads it. */
export function wordTokens(text: string | null): string[] {
  if (text === null) return [];
  const out: string[] = [];
  for (const m of normalizeText(text).replace(/_/g, " ").matchAll(/[\p{L}\p{N}]+/gu)) {
    if (m[0].length >= WORD_MIN_LENGTH && m[0].length <= WORD_MAX_LENGTH) out.push(m[0]);
  }
  return out;
}

function bump(map: Map<string, number>, words: Iterable<string>): void {
  for (const w of new Set(words)) map.set(w, (map.get(w) ?? 0) + 1);
}

export function buildWordIndex(places: readonly PackPlaceRecord[]): WordIndex {
  const maps: Record<WordField, Map<string, number>> = { any: new Map(), name: new Map(), address: new Map(), kind: new Map(), note: new Map() };
  for (const p of places) {
    const name = wordTokens(p.name);
    const address = wordTokens(p.address);
    const kind = wordTokens(p.category);
    bump(maps.name, name);
    bump(maps.address, address);
    bump(maps.kind, kind);
    bump(maps.note, wordTokens(p.note));
    // Plain words look in the name, address and kind together, so a word in two of them is still one place.
    bump(maps.any, [...name, ...address, ...kind]);
  }
  return maps;
}

/** Most places first, then alphabetical, so the order never depends on the order of the pack. */
export function wordList(index: WordIndex, field: WordField, limit = Number.POSITIVE_INFINITY): WordEntry[] {
  const all = [...index[field]].map(([word, places]): WordEntry => ({ word, places }));
  all.sort((a, b) => b.places - a.places || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return limit >= all.length ? all : all.slice(0, Math.max(0, limit));
}

export function wordPlaces(index: WordIndex, field: WordField, word: string): number {
  return index[field].get(word) ?? 0;
}

export function isWordField(value: string): value is WordField {
  return (WORD_FIELDS as readonly string[]).includes(value);
}
