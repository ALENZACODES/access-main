/**
 * Searching, narrowing and ordering the notes.
 *
 * A typed search is read like this: words must each start a word of the note (all of them), a phrase
 * in double quotes must appear as written (ignoring case and accents), and a word with a minus sign
 * in front must not appear. Nothing here ranks a note as better or worse; ordering only changes the
 * sequence of what is already listed.
 */
import { type NoteEntry } from "./packNoteIndex";
import { type NoteLength, foldNote } from "./packNoteText";
import type { WheelchairTag } from "./packPlaces";

export interface NoteQuery {
  /** Words that must each start a word of the note. */
  readonly words: readonly string[];
  /** Phrases that must each occur in the note. */
  readonly phrases: readonly string[];
  /** Words that must not start any word of the note. */
  readonly without: readonly string[];
}

export const EMPTY_NOTE_QUERY: NoteQuery = { words: [], phrases: [], without: [] };

/** The most terms of each kind that are read; the rest of a very long search is ignored. */
export const MAX_QUERY_TERMS = 12;

export function parseNoteQuery(text: string): NoteQuery {
  const words: string[] = [];
  const phrases: string[] = [];
  const without: string[] = [];
  const pattern = /(-?)"([^"]*)"|(-?)(\S+)/gu;
  for (const m of text.matchAll(pattern)) {
    const negated = (m[1] ?? m[3]) === "-";
    const body = m[2] ?? m[4] ?? "";
    if (m[2] !== undefined) {
      const phrase = foldNote(body);
      if (phrase === "") continue;
      if (negated) without.push(...phrase.split(" "));
      else if (phrases.length < MAX_QUERY_TERMS) phrases.push(phrase);
      continue;
    }
    for (const w of foldNote(body).split(/[^\p{L}\p{N}]+/u).filter((x) => x !== "")) {
      if (negated) {
        if (without.length < MAX_QUERY_TERMS) without.push(w);
      } else if (words.length < MAX_QUERY_TERMS) words.push(w);
    }
  }
  return { words, phrases, without };
}

export function isEmptyQuery(q: NoteQuery): boolean {
  return q.words.length === 0 && q.phrases.length === 0 && q.without.length === 0;
}

/** What to mark in a note: the words and phrases wanted, never the ones excluded. */
export function highlightTerms(q: NoteQuery): readonly string[] {
  return [...q.phrases, ...q.words];
}

const startsAWord = (words: readonly string[], w: string): boolean => words.some((x) => (w.length === 1 ? x === w : x.startsWith(w)));

export function matchesQuery(e: NoteEntry, q: NoteQuery): boolean {
  const folded = ` ${e.key} `;
  for (const p of q.phrases) if (!folded.includes(p)) return false;
  for (const w of q.words) if (!startsAWord(e.words, w)) return false;
  for (const w of q.without) if (startsAWord(e.words, w)) return false;
  return true;
}

export const NOTE_ORDERS = ["name", "longest", "shortest", "tag"] as const;
export type NoteOrder = (typeof NOTE_ORDERS)[number];
export const DEFAULT_NOTE_ORDER: NoteOrder = "name";

export function isNoteOrder(v: unknown): v is NoteOrder {
  return typeof v === "string" && (NOTE_ORDERS as readonly string[]).includes(v);
}

export interface NoteFilter {
  readonly query: string;
  /** Tags to keep. Empty means every tag. */
  readonly tags: readonly WheelchairTag[];
  /** Lengths to keep. Empty means every length. */
  readonly lengths: readonly NoteLength[];
  /** Keep only notes that more than one place carries. */
  readonly repeatedOnly: boolean;
}

export const NO_NOTE_FILTER: NoteFilter = { query: "", tags: [], lengths: [], repeatedOnly: false };

export function isNoteFiltered(f: NoteFilter): boolean {
  return !isEmptyQuery(parseNoteQuery(f.query)) || f.tags.length > 0 || f.lengths.length > 0 || f.repeatedOnly;
}

export function filterNotes(entries: readonly NoteEntry[], f: NoteFilter): readonly NoteEntry[] {
  const q = parseNoteQuery(f.query);
  return entries.filter((e) => (f.tags.length === 0 || f.tags.includes(e.tag)) && (f.lengths.length === 0 || f.lengths.includes(e.length)) && (!f.repeatedOnly || e.copies > 1) && matchesQuery(e, q));
}

/** The order tags are listed in on the page; a listing order, not a ranking. */
const TAG_RANK: Readonly<Record<WheelchairTag, number>> = { yes: 0, limited: 1, no: 2, designated: 3, unknown: 4 };

function byName(a: NoteEntry, b: NoteEntry): number {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  const n = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
  return n !== 0 ? n : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function orderNotes(entries: readonly NoteEntry[], order: NoteOrder): readonly NoteEntry[] {
  const copy = entries.slice();
  switch (order) {
    case "name":
      return copy.sort(byName);
    case "longest":
      return copy.sort((a, b) => b.chars - a.chars || byName(a, b));
    case "shortest":
      return copy.sort((a, b) => a.chars - b.chars || byName(a, b));
    case "tag":
      return copy.sort((a, b) => TAG_RANK[a.tag] - TAG_RANK[b.tag] || byName(a, b));
  }
}

export function toggleIn<T>(list: readonly T[], item: T): readonly T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
