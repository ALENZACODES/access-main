/** The notes of the places on screen, read and put in order. Places with no note are counted, never listed. */
import { noteLocale } from "./noteLanguage";
import { READING_BANDS, readNote, type Reading, type ReadingBand } from "./noteReadability";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";

export interface ReadingEntry {
  readonly id: string;
  readonly name: string | null;
  readonly note: string;
  readonly reading: Reading;
}

export type ReadingOrder = "hardest" | "easiest" | "name" | "pack";
export const READING_ORDERS: readonly ReadingOrder[] = ["hardest", "easiest", "name", "pack"];
export const DEFAULT_READING_ORDER: ReadingOrder = "hardest";
export const isReadingOrder = (v: unknown): v is ReadingOrder => typeof v === "string" && (READING_ORDERS as readonly string[]).includes(v);

/** What to list: every scored note, or one band. */
export type ReadingFilter = "all" | ReadingBand;
export const READING_FILTERS: readonly ReadingFilter[] = ["all", ...READING_BANDS];
export const isReadingFilter = (v: unknown): v is ReadingFilter => typeof v === "string" && (READING_FILTERS as readonly string[]).includes(v);

export interface ReadingIndex {
  readonly entries: readonly ReadingEntry[];
  readonly withNote: number;
  readonly withoutNote: number;
  /** Notes with a note but too short to score. */
  readonly tooShort: number;
  readonly scored: number;
  readonly bands: Readonly<Record<ReadingBand, number>>;
  /** Notes read as French although the page is in English, or the other way round. */
  readonly otherLanguage: number;
  /** The average score of the scored notes, rounded; null when none was scored. */
  readonly averageScore: number | null;
}

export function buildReadingIndex(places: readonly PackPlaceRecord[], pageLocale: Locale): ReadingIndex {
  const entries: ReadingEntry[] = [];
  const bands: Record<ReadingBand, number> = { easy: 0, fair: 0, hard: 0, "very-hard": 0 };
  let withoutNote = 0;
  let tooShort = 0;
  let otherLanguage = 0;
  let sum = 0;
  let scored = 0;
  for (const p of places) {
    if (p.note === null || p.note.trim() === "") {
      withoutNote += 1;
      continue;
    }
    const locale = noteLocale(p.note, pageLocale);
    if (locale !== pageLocale) otherLanguage += 1;
    const reading = readNote(p.note, locale);
    entries.push({ id: p.id, name: p.name, note: p.note, reading });
    if (reading.score === null) {
      tooShort += 1;
    } else {
      scored += 1;
      sum += reading.score;
      bands[reading.band!] += 1;
    }
  }
  return { entries, withNote: entries.length, withoutNote, tooShort, scored, bands, otherLanguage, averageScore: scored === 0 ? null : Math.round(sum / scored) };
}

export function filterReadings(entries: readonly ReadingEntry[], filter: ReadingFilter): ReadingEntry[] {
  if (filter === "all") return entries.filter((e) => e.reading.score !== null);
  return entries.filter((e) => e.reading.band === filter);
}

const nameKey = (e: ReadingEntry): string => (e.name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A new list in the order asked for. Ties and unnamed places keep their pack order. */
export function orderReadings(entries: readonly ReadingEntry[], order: ReadingOrder): ReadingEntry[] {
  const indexed = entries.map((e, i) => ({ e, i }));
  const byScore = (a: { e: ReadingEntry }, b: { e: ReadingEntry }, dir: 1 | -1): number => dir * ((a.e.reading.score ?? 101) - (b.e.reading.score ?? 101));
  switch (order) {
    case "hardest":
      indexed.sort((a, b) => byScore(a, b, 1) || a.i - b.i);
      break;
    case "easiest":
      indexed.sort((a, b) => byScore(a, b, -1) || a.i - b.i);
      break;
    case "name":
      indexed.sort((a, b) => (nameKey(a.e) === "" ? 1 : 0) - (nameKey(b.e) === "" ? 1 : 0) || nameKey(a.e).localeCompare(nameKey(b.e)) || a.i - b.i);
      break;
    case "pack":
      break;
  }
  return indexed.map((x) => x.e);
}
