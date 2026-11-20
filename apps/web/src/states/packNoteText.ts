/**
 * Reading the free-text note a pack place carries, without changing it.
 *
 * The note is the pack's own wording (for OpenStreetMap places, the wheelchair description). This
 * file only folds it for matching, finds where typed words occur in it so they can be marked, and
 * cuts a long note to a window around a match. It never rewrites, translates, scores or interprets a
 * note: what a note says about a place is for the person to read, exactly as written.
 */

/** A piece of a note, and whether it is text that matched what was typed. Joined, the pieces are the note. */
export interface NoteSegment {
  readonly text: string;
  readonly match: boolean;
}

const MARKS = /\p{M}/u;

/** Folds one character: lower case, no accents, curly quotes straight. May give zero or more characters. */
function foldChar(c: string): string {
  if (c === "’" || c === "‘" || c === "ʼ") return "'";
  let out = "";
  for (const d of c.normalize("NFD").toLowerCase()) if (!MARKS.test(d)) out += d;
  return out;
}

export interface Folded {
  readonly folded: string;
  /** For each UTF-16 unit of `folded`, the index in the original where its character starts. */
  readonly starts: readonly number[];
  /** For each UTF-16 unit of `folded`, the index in the original just after its character. */
  readonly ends: readonly number[];
}

/** The folded text with a map back to the original, so a match can be marked where it was written. */
export function foldWithMap(text: string): Folded {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k += 1) {
      starts.push(i);
      ends.push(i + ch.length);
    }
    folded += f;
    i += ch.length;
  }
  return { folded, starts, ends };
}

/** Folded, with every run of white space as one space and the ends trimmed. For comparing two notes. */
export function foldNote(text: string): string {
  return foldWithMap(text).folded.replace(/\s+/g, " ").trim();
}

/** The words of a note: runs of letters and digits, folded. An apostrophe splits a word. */
export function noteWords(text: string): string[] {
  return foldNote(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w !== "");
}

/** Characters as a person counts them: a letter with its accent, or an emoji, is one. */
export function noteChars(text: string): number {
  return Array.from(text).length;
}

export const NOTE_LENGTHS = ["short", "medium", "long"] as const;
export type NoteLength = (typeof NOTE_LENGTHS)[number];
export const SHORT_NOTE_MAX = 60;
export const MEDIUM_NOTE_MAX = 200;

export function lengthClass(chars: number): NoteLength {
  return chars <= SHORT_NOTE_MAX ? "short" : chars <= MEDIUM_NOTE_MAX ? "medium" : "long";
}

/** Merge touching or overlapping [start, end) ranges, in order. */
function mergeRanges(ranges: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const sorted = ranges.map((r) => [r[0], r[1]] as [number, number]).filter((r) => r[1] > r[0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

/** The ranges of the original text where any of the terms occurs, as folded text. Empty terms are ignored. */
export function matchRanges(text: string, terms: readonly string[]): Array<[number, number]> {
  const { folded, starts, ends } = foldWithMap(text);
  const found: Array<[number, number]> = [];
  for (const raw of terms) {
    const term = foldNote(raw);
    if (term === "") continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at < 0) break;
      let end = ends[at + term.length - 1]!;
      // A match covers the accent marks that follow its last letter, so a mark is never cut off from its letter.
      while (end < text.length) {
        const next = String.fromCodePoint(text.codePointAt(end)!);
        if (!MARKS.test(next)) break;
        end += next.length;
      }
      found.push([starts[at]!, end]);
      from = at + 1;
    }
  }
  return mergeRanges(found);
}

/** The note cut into pieces, marking where the terms occur. The pieces joined are always exactly the note. */
export function highlightSegments(text: string, terms: readonly string[]): NoteSegment[] {
  const ranges = matchRanges(text, terms);
  if (ranges.length === 0) return text === "" ? [] : [{ text, match: false }];
  const out: NoteSegment[] = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) out.push({ text: text.slice(pos, s), match: false });
    out.push({ text: text.slice(s, e), match: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), match: false });
  return out;
}

/** How many characters a window edge may move to land on a word edge. */
const SNAP = 14;

export interface Snippet {
  readonly text: string;
  /** True when the text was cut at the start or the end. */
  readonly cut: boolean;
  readonly before: boolean;
  readonly after: boolean;
}

/**
 * At most `max` characters of the note: the whole note when it fits, otherwise a window that
 * starts at a word, around the first match when there is one, with a flag for each cut end.
 */
export function noteSnippet(text: string, terms: readonly string[], max: number): Snippet {
  const limit = Math.max(1, Math.floor(max));
  const chars = Array.from(text);
  if (chars.length <= limit) return { text, cut: false, before: false, after: false };
  const first = matchRanges(text, terms)[0];
  const firstChar = first === undefined ? 0 : Array.from(text.slice(0, first[0])).length;
  const lastChar = first === undefined ? 0 : firstChar + Array.from(text.slice(first[0], first[1])).length;
  let start = Math.max(0, Math.min(chars.length - limit, firstChar - Math.floor(limit / 4)));
  // Start at the beginning of a word when one begins close by, but never move past the match.
  if (start > 0) {
    let s = start;
    while (s < Math.min(chars.length, start + SNAP, firstChar) && !/\s/.test(chars[s - 1]!)) s += 1;
    if (/\s/.test(chars[s - 1]!)) start = s;
  }
  let end = Math.min(chars.length, start + limit);
  // End at the end of a word when one ends close by, but never cut into the match.
  if (end < chars.length) {
    let e = end;
    while (e > Math.max(start + 1, end - SNAP, lastChar) && !/\s/.test(chars[e]!)) e -= 1;
    if (/\s/.test(chars[e]!)) end = e;
  }
  const slice = chars.slice(start, end).join("").trim();
  return { text: slice, cut: true, before: start > 0, after: end < chars.length };
}
