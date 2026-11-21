/**
 * Finds the words of a search that no place has, and what the pack has close to each. It reads the parsed
 * search and the places and changes neither. Only words that were typed to be found count: a word after
 * "-" is asked to be left out, so it matching nothing is no problem, and a phrase is more than a word.
 */
import { normalizeText } from "./filters";
import { filterBySearch, matchSearchTerm } from "./packSearchMatch";
import type { ParsedSearch, SearchTerm } from "./packSearchParse";
import type { PackPlaceRecord } from "./packPlaces";
import { buildWordIndex, type WordField, type WordIndex } from "./packWordIndex";
import { type NearWord, nearWords } from "./packWordNear";

export const MISSING_WORDS_MAX = 3;

export interface WordOption {
  readonly text: string;
  /** Places the search finds for this word in the same field, counted with the search itself. */
  readonly places: number;
  readonly reason: NearWord["reason"];
  /** The whole search with the typed word replaced, as the person typed everything else. */
  readonly searchText: string;
}

export interface MissingWord {
  /** The word as folded for the search. */
  readonly word: string;
  readonly field: WordField;
  readonly options: readonly WordOption[];
}

type TextTerm = Extract<SearchTerm, { type: "text" }>;

function isWordTerm(term: SearchTerm): term is TextTerm {
  return term.type === "text" && !term.negated && !term.phrase && /^[\p{L}\p{N}'’-]+$/u.test(term.value);
}

/** The typed pieces of a search: a leading "-", a "field:", quotes and the word. Used to swap one word and keep the rest. */
const PIECE = /^(-?)((?:[^\s:"“«]+:)?)([“"«]?)(.*?)([”"»]?)$/u;

/**
 * The search text with every typed word that folds to `folded` replaced. A word with a field before it keeps the
 * field; everything else, spacing included, is kept as typed. A replacement of several words is put in quotes.
 * A word with no field gets `addField:` in front when one is given.
 */
export function replaceTypedWord(text: string, folded: string, replacement: string, addField?: string): string {
  const quoted = /\s/.test(replacement) ? `"${replacement}"` : replacement;
  return text
    .split(/(\s+)/u)
    .map((piece) => {
      if (piece.trim() === "") return piece;
      const m = PIECE.exec(piece);
      if (m === null) return piece;
      const [, minus, field, , core] = m;
      if (minus === "-" || normalizeText(core ?? "") !== folded) return piece;
      return `${field ? field : addField ? `${addField}:` : ""}${quoted}`;
    })
    .join("");
}

function countFor(places: readonly PackPlaceRecord[], field: WordField, text: string): number {
  const term: TextTerm = { type: "text", field, value: normalizeText(text), phrase: false, negated: false };
  return places.filter((p) => matchSearchTerm(p, term)).length;
}

/** Up to MISSING_WORDS_MAX words, in the order typed, with no word twice for the same field. */
export function findMissingWords(places: readonly PackPlaceRecord[], text: string, parsed: ParsedSearch, index: WordIndex = buildWordIndex(places)): MissingWord[] {
  if (places.length === 0) return [];
  const out: MissingWord[] = [];
  for (const clause of parsed.clauses) {
    for (const term of clause.alternatives) {
      if (!isWordTerm(term)) continue;
      if (out.some((m) => m.word === term.value && m.field === term.field)) continue;
      if (places.some((p) => matchSearchTerm(p, term))) continue;
      // The pack's words have no apostrophes or hyphens in them, so a word typed with one is looked up without.
      const options = nearWords(index, term.field, term.value.replace(/['’-]/g, "")).map((n): WordOption => {
        // Plain words do not read "post_office" as two words, so a kind of two words is searched as a kind.
        const asKind = n.reason === "french-kind" && n.text.includes(" ");
        return {
          text: n.text,
          places: countFor(places, asKind ? "kind" : term.field, n.text),
          reason: n.reason,
          searchText: replaceTypedWord(text, term.value, n.text, asKind ? "kind" : undefined),
        };
      });
      out.push({ word: term.value, field: term.field, options: options.filter((o) => o.places > 0) });
      if (out.length === MISSING_WORDS_MAX) return out;
    }
  }
  return out;
}

/** True when the search finds no place although it has words: the case the page speaks up about first. */
export function searchFindsNothing(places: readonly PackPlaceRecord[], parsed: ParsedSearch): boolean {
  return parsed.clauses.length > 0 && filterBySearch(places, parsed).length === 0;
}
