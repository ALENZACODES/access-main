/**
 * Words in the pack that are close to a word that matched nothing. Two kinds of help, both plain:
 * a word that differs by a letter or two (counted as in the place suggestions, and never for words of
 * three letters or fewer), and a French word for a kind the pack names in English. Neither says what
 * the person meant. They say which words the pack has and how many places have each.
 */
import { type WordField, type WordIndex, wordPlaces } from "./packWordIndex";
import { allowedEdits, boundedDistance } from "./suggest";

export const NEAR_WORDS_MAX = 3;

/**
 * French words, folded, for kinds the pack names in English, and the words of that kind as the pack
 * writes it. Only words with one plain meaning are listed; a kind is offered only if the pack has it.
 */
export const FRENCH_KIND_WORDS: Readonly<Record<string, readonly string[]>> = {
  pharmacie: ["pharmacy"],
  stationnement: ["parking"],
  poste: ["post", "office"],
  postes: ["post", "office"],
  bijouterie: ["jewelry"],
  billets: ["ticket"],
  billet: ["ticket"],
  epicerie: ["supermarket"],
  banque: ["bank"],
  hopital: ["hospital"],
  toilettes: ["toilets"],
  hotel: ["hotel"],
};

export type NearReason = "spelling" | "french-kind";

export interface NearWord {
  /** What to search for instead: one word, or the words of a kind joined with a space. */
  readonly text: string;
  /** Places that have it as a word of the field. The page recounts with the search itself before it shows a number. */
  readonly places: number;
  readonly reason: NearReason;
}

/** Words of the field within the allowed edits of `folded`, closest first; never the word itself. */
export function spellingWords(index: WordIndex, field: WordField, folded: string, max = NEAR_WORDS_MAX): NearWord[] {
  const allowed = allowedEdits(folded.length);
  if (allowed === 0 || max <= 0) return [];
  const found: Array<NearWord & { readonly distance: number }> = [];
  for (const [word, places] of index[field]) {
    if (word === folded) continue;
    const distance = boundedDistance(folded, word, allowed);
    if (distance <= allowed) found.push({ text: word, places, reason: "spelling", distance });
  }
  found.sort((a, b) => a.distance - b.distance || b.places - a.places || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  return found.slice(0, max).map(({ text, places, reason }) => ({ text, places, reason }));
}

/** The kind the pack names for a French word, when the pack has a place of that kind; otherwise null. */
export function frenchKindWord(index: WordIndex, folded: string): NearWord | null {
  // Own keys only: a word such as "constructor" must not reach something inherited.
  if (!Object.hasOwn(FRENCH_KIND_WORDS, folded)) return null;
  const words = FRENCH_KIND_WORDS[folded]!;
  // The kind is offered when every one of its words is a word of some place's kind; the search recounts exactly.
  const counts = words.map((w) => wordPlaces(index, "kind", w));
  const places = Math.min(...counts);
  return places > 0 ? { text: words.join(" "), places, reason: "french-kind" } : null;
}

/** The French kind first when there is one, then the spellings, with no word twice. */
export function nearWords(index: WordIndex, field: WordField, folded: string, max = NEAR_WORDS_MAX): NearWord[] {
  const out: NearWord[] = [];
  if (field === "any" || field === "kind") {
    const kind = frenchKindWord(index, folded);
    if (kind !== null) out.push(kind);
  }
  for (const s of spellingWords(index, field, folded, max)) {
    if (!out.some((o) => o.text === s.text)) out.push(s);
  }
  return out.slice(0, max);
}
