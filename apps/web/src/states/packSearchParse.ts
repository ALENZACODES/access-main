/**
 * Reads what was typed in the pack search into terms. Plain words work as they always did: every word
 * must be somewhere in the name, address or kind. On top of that:
 *
 *   "main street"      words in that order          -bar        leaves out places that match
 *   cafe OR bar        either one (OR / OU, capitals) kind:cafe   one field only
 *   tag:yes            a wheelchair tag value        has:note    the place has that detail
 *   no:address         the place has not            note:ramp   words in the note
 *
 * Field words come in English and French (nom, adresse, rue, genre, indication, avec, sans). Something that
 * looks like an operator but is not one is never guessed at: an unknown field is searched as plain text,
 * and a value that cannot be read is left out. Either way it is listed in `problems`, so the page can say so.
 * Nothing here reads or changes a place; it only reads the text.
 */
import { normalizeText } from "./filters";
import type { WheelchairTag } from "./packPlaces";
import { boundedDistance } from "./suggest";

export const SEARCH_MAX_CHARS = 200;
export const SEARCH_MAX_TERMS = 24;

export type SearchTextField = "any" | "name" | "address" | "kind" | "note";
export const SEARCH_HAS_KEYS = ["note", "address", "name", "kind", "tag", "source", "location"] as const;
export type SearchHasKey = (typeof SEARCH_HAS_KEYS)[number];

export type SearchTerm =
  | { readonly type: "text"; readonly field: SearchTextField; readonly value: string; readonly phrase: boolean; readonly negated: boolean }
  | { readonly type: "tag"; readonly value: WheelchairTag; readonly negated: boolean }
  | { readonly type: "has"; readonly key: SearchHasKey; readonly negated: boolean };

/** Alternatives joined by OR. A place passes a clause when it passes any of them. Clauses are all required. */
export interface SearchClause {
  readonly alternatives: readonly SearchTerm[];
  /** The clause as it was typed (alternatives joined with OR), so it can be taken out of the search text again. */
  readonly typed: string;
}

export type SearchProblemKind = "unknown-field" | "bad-tag-value" | "bad-has-value" | "empty-value" | "open-quote" | "dangling-or" | "too-many-terms" | "too-long";

export interface SearchProblem {
  readonly kind: SearchProblemKind;
  /** The part of the search it is about, as typed. */
  readonly text: string;
  /** Another word that could have been meant, or null. */
  readonly suggestion: string | null;
}

export interface ParsedSearch {
  readonly clauses: readonly SearchClause[];
  readonly problems: readonly SearchProblem[];
  /** True when anything beyond plain words was used or went wrong. */
  readonly usesOperators: boolean;
}

export const EMPTY_PARSED_SEARCH: ParsedSearch = { clauses: [], problems: [], usesOperators: false };

/** Field words, folded, and what each means. */
export const SEARCH_FIELD_WORDS: Readonly<Record<string, SearchTextField | "tag" | "has" | "no">> = {
  name: "name", nom: "name",
  address: "address", adresse: "address", street: "address", rue: "address",
  kind: "kind", genre: "kind", type: "kind",
  note: "note",
  tag: "tag", indication: "tag",
  has: "has", avec: "has",
  no: "no", sans: "no",
};

/** Tag words, folded. The pack's UNKNOWN stays UNKNOWN: it is not given a French word. */
export const SEARCH_TAG_WORDS: Readonly<Record<string, WheelchairTag>> = {
  yes: "yes", oui: "yes", limited: "limited", limite: "limited", no: "no", non: "no", designated: "designated", designe: "designated", unknown: "unknown",
};

export const SEARCH_HAS_WORDS: Readonly<Record<string, SearchHasKey>> = {
  note: "note", address: "address", adresse: "address", name: "name", nom: "name", kind: "kind", genre: "kind", tag: "tag", indication: "tag", source: "source", location: "location", position: "location",
};

const OPEN_QUOTES = new Set(['"', "“", "«"]);
const CLOSE_QUOTES = new Set(['"', "”", "»"]);

interface RawToken {
  readonly negated: boolean;
  readonly field: string | null;
  readonly value: string;
  readonly quoted: boolean;
  readonly open: boolean;
  readonly typed: string;
}

function readTokens(text: string): RawToken[] {
  const out: RawToken[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (/\s/.test(text[i]!)) {
      i += 1;
      continue;
    }
    const start = i;
    let negated = false;
    if (text[i] === "-" && i + 1 < n && !/\s/.test(text[i + 1]!)) {
      negated = true;
      i += 1;
    }
    let field: string | null = null;
    const key = /^[\p{L}]+:/u.exec(text.slice(i));
    if (key !== null) {
      field = key[0].slice(0, -1);
      i += key[0].length;
    }
    let value = "";
    let quoted = false;
    let open = false;
    if (i < n && OPEN_QUOTES.has(text[i]!)) {
      quoted = true;
      i += 1;
      const from = i;
      while (i < n && !CLOSE_QUOTES.has(text[i]!)) i += 1;
      value = text.slice(from, i);
      if (i < n) i += 1;
      else open = true;
    } else {
      const from = i;
      while (i < n && !/\s/.test(text[i]!)) i += 1;
      value = text.slice(from, i);
    }
    out.push({ negated, field, value, quoted, open, typed: text.slice(start, i) });
  }
  return out;
}

function closestWord(word: string, words: readonly string[]): string | null {
  const folded = normalizeText(word);
  if (folded.length < 3) return null;
  let best: string | null = null;
  let bestD = 3;
  for (const w of words) {
    const d = boundedDistance(folded, w, 2);
    if (d < bestD) {
      best = w;
      bestD = d;
    }
  }
  return best;
}

/** A word looked up in one of the tables above. Own keys only, so "constructor" or "__proto__" typed into the box is just an unknown word. */
function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

const FIELD_NAMES = Object.keys(SEARCH_FIELD_WORDS);

export function parsePackSearch(input: string): ParsedSearch {
  const problems: SearchProblem[] = [];
  let text = input;
  if (text.length > SEARCH_MAX_CHARS) {
    problems.push({ kind: "too-long", text: "", suggestion: null });
    text = text.slice(0, SEARCH_MAX_CHARS);
  }
  const tokens = readTokens(text);
  const clauses: SearchClause[] = [];
  let pending: SearchTerm[] = [];
  let pendingTyped: string[] = [];
  let expectOr = false;
  let termCount = 0;
  let tooMany = false;
  let usesOperators = false;
  let orSeen = false;

  const flush = () => {
    if (pending.length > 0) clauses.push({ alternatives: pending, typed: pendingTyped.join(" OR ") });
    pending = [];
    pendingTyped = [];
  };

  for (const tok of tokens) {
    const isOr = !tok.negated && tok.field === null && !tok.quoted && (tok.value === "OR" || tok.value === "OU");
    if (isOr) {
      usesOperators = true;
      if (pending.length === 0) {
        problems.push({ kind: "dangling-or", text: tok.typed, suggestion: null });
        continue;
      }
      orSeen = true;
      expectOr = true;
      continue;
    }
    if (tok.open) {
      problems.push({ kind: "open-quote", text: tok.typed, suggestion: null });
      usesOperators = true;
    }
    const term = termFor(tok, problems);
    if (tok.quoted || tok.negated || tok.field !== null) usesOperators = true;
    if (term === null) continue;
    if (termCount >= SEARCH_MAX_TERMS) {
      tooMany = true;
      continue;
    }
    termCount += 1;
    if (expectOr) {
      pending.push(term);
      pendingTyped.push(tok.typed);
      expectOr = false;
    } else {
      flush();
      pending = [term];
      pendingTyped = [tok.typed];
    }
  }
  if (expectOr) {
    // The search ended right after an OR: it joins nothing.
    problems.push({ kind: "dangling-or", text: "OR", suggestion: null });
  }
  flush();
  if (tooMany) problems.push({ kind: "too-many-terms", text: "", suggestion: null });
  if (orSeen || problems.length > 0) usesOperators = true;
  return { clauses, problems, usesOperators };
}

/** One token as a term, or null when it says nothing (and the reason is added to `problems` when it is a mistake). */
function termFor(tok: RawToken, problems: SearchProblem[]): SearchTerm | null {
  const folded = normalizeText(tok.value).replace(/\s+/g, " ");
  if (tok.field === null) return folded === "" ? null : { type: "text", field: "any", value: folded, phrase: tok.quoted && folded.includes(" "), negated: tok.negated };
  const key = normalizeText(tok.field);
  const kind = own(SEARCH_FIELD_WORDS, key);
  if (kind === undefined) {
    problems.push({ kind: "unknown-field", text: `${tok.field}:`, suggestion: closestWord(tok.field, FIELD_NAMES) });
    const literal = normalizeText(`${tok.field}:${tok.value}`).replace(/\s+/g, " ");
    return { type: "text", field: "any", value: literal, phrase: false, negated: tok.negated };
  }
  if (folded === "") {
    problems.push({ kind: "empty-value", text: `${tok.field}:`, suggestion: null });
    return null;
  }
  if (kind === "tag") {
    const value = own(SEARCH_TAG_WORDS, folded);
    if (value === undefined) {
      problems.push({ kind: "bad-tag-value", text: tok.typed, suggestion: closestWord(folded, Object.keys(SEARCH_TAG_WORDS)) });
      return null;
    }
    return { type: "tag", value, negated: tok.negated };
  }
  if (kind === "has" || kind === "no") {
    const hasKey = own(SEARCH_HAS_WORDS, folded);
    if (hasKey === undefined) {
      problems.push({ kind: "bad-has-value", text: tok.typed, suggestion: closestWord(folded, Object.keys(SEARCH_HAS_WORDS)) });
      return null;
    }
    // "no:note" is "has" turned round; "-no:note" turns it round again.
    return { type: "has", key: hasKey, negated: kind === "no" ? !tok.negated : tok.negated };
  }
  return { type: "text", field: kind, value: folded, phrase: tok.quoted && folded.includes(" "), negated: tok.negated };
}

/** The plain words of a parsed search, for callers that only want those. */
export function plainWordsOf(parsed: ParsedSearch): string[] {
  return parsed.clauses.flatMap((c) => c.alternatives).filter((t): t is Extract<SearchTerm, { type: "text" }> => t.type === "text" && t.field === "any" && !t.negated && !t.phrase).map((t) => t.value);
}
