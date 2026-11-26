/**
 * The notes of the places in the pack, ready to search and count.
 *
 * Counts say how many places have a note and how many do not, by wheelchair tag. A place with no
 * note is not a place with nothing to know: the note is one optional field. Two places whose notes
 * are the same words (ignoring case, accents and spacing) are grouped, because the same text on two
 * places is worth seeing, and is never merged or dropped.
 */
import { NOTE_LENGTHS, type NoteLength, foldNote, lengthClass, noteChars, noteWords } from "./packNoteText";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";

export interface NoteEntry {
  readonly id: string;
  readonly name: string | null;
  readonly tag: WheelchairTag;
  readonly address: string | null;
  readonly category: string | null;
  /** The note exactly as the pack gives it, trimmed and cleaned of control characters. */
  readonly note: string;
  readonly key: string;
  readonly words: readonly string[];
  readonly chars: number;
  readonly length: NoteLength;
  /** How many places carry this same note, this one included. */
  readonly copies: number;
}

export interface DuplicateGroup {
  readonly key: string;
  /** The note as the first place in id order writes it. */
  readonly note: string;
  readonly ids: readonly string[];
  readonly names: ReadonlyArray<string | null>;
}

export type NoteTagCounts = Readonly<Record<WheelchairTag, number>>;

export interface NoteIndex {
  /** Places that have a note, in id order. */
  readonly entries: readonly NoteEntry[];
  readonly total: number;
  readonly withNote: number;
  readonly withoutNote: number;
  readonly withByTag: NoteTagCounts;
  readonly withoutByTag: NoteTagCounts;
  readonly duplicates: readonly DuplicateGroup[];
  readonly byLength: Readonly<Record<NoteLength, number>>;
}

function zeroTags(): Record<WheelchairTag, number> {
  return { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildNoteIndex(places: readonly PackPlaceRecord[]): NoteIndex {
  const seen = new Set<string>();
  const unique = places.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice().sort(byId);
  const withByTag = zeroTags();
  const withoutByTag = zeroTags();
  const byLength: Record<NoteLength, number> = { short: 0, medium: 0, long: 0 };
  const groups = new Map<string, PackPlaceRecord[]>();
  for (const p of unique) {
    const note = p.note === null ? "" : p.note.trim();
    const key = foldNote(note);
    if (key === "") {
      withoutByTag[p.tag] += 1;
      continue;
    }
    withByTag[p.tag] += 1;
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [p]);
    else list.push(p);
  }
  const entries: NoteEntry[] = [];
  const duplicates: DuplicateGroup[] = [];
  for (const [key, list] of groups) {
    for (const p of list) {
      const note = p.note!.trim();
      const chars = noteChars(note);
      const length = lengthClass(chars);
      byLength[length] += 1;
      entries.push({ id: p.id, name: p.name, tag: p.tag, address: p.address, category: p.category, note, key, words: noteWords(note), chars, length, copies: list.length });
    }
    if (list.length > 1) duplicates.push({ key, note: list[0]!.note!.trim(), ids: list.map((p) => p.id), names: list.map((p) => p.name) });
  }
  entries.sort(byId);
  duplicates.sort((a, b) => b.ids.length - a.ids.length || (a.ids[0]! < b.ids[0]! ? -1 : 1));
  const withNote = entries.length;
  return { entries, total: unique.length, withNote, withoutNote: unique.length - withNote, withByTag, withoutByTag, duplicates, byLength };
}

/** The places in `index` for one length class. */
export function entriesOfLength(index: NoteIndex, length: NoteLength): readonly NoteEntry[] {
  return index.entries.filter((e) => e.length === length);
}

/** Whether every length class adds up to the places that have a note. For tests and sanity checks. */
export function lengthsAddUp(index: NoteIndex): boolean {
  return NOTE_LENGTHS.reduce((n, l) => n + index.byLength[l], 0) === index.withNote;
}

/** The longest and the shortest note, by characters, ties by id. Null when no place has a note. */
export function noteExtremes(index: NoteIndex): { readonly longest: NoteEntry; readonly shortest: NoteEntry } | null {
  if (index.entries.length === 0) return null;
  let longest = index.entries[0]!;
  let shortest = index.entries[0]!;
  for (const e of index.entries) {
    if (e.chars > longest.chars) longest = e;
    if (e.chars < shortest.chars) shortest = e;
  }
  return { longest, shortest };
}
