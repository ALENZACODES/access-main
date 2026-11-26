/**
 * Reads what language the words in a place's name point to. It is a guess from common words: a name made of a
 * person's name, a brand or a town ("Tim Hortons", "Smith") points to no language and reads as "neither". Nothing
 * here says what language a name is in, and the name is never changed.
 */
import { ENGLISH_NAME_WORDS, FRENCH_ACCENT_LETTERS, FRENCH_NAME_WORDS } from "./nameLexicon";

export type NameReading = "no-name" | "other-script" | "french" | "english" | "both" | "neither";
export const NAME_READINGS: readonly NameReading[] = ["french", "english", "both", "neither", "other-script", "no-name"];

export interface NameLanguage {
  readonly reading: NameReading;
  /** French words found, folded, each once, in the order they appear. */
  readonly french: readonly string[];
  readonly english: readonly string[];
  /** Letters that only French uses (é, ç...), counted. */
  readonly accents: number;
  /** True when two halves of the name, split by a slash or a vertical bar, read as French and English. */
  readonly pair: boolean;
}

const LATIN = /\p{Script=Latin}/u;
const LETTER = /\p{L}/u;
const PAIR_SPLIT = /\s+[/|]\s+|\s*[/|]\s*(?=\p{L})/u;
const ELISION = /(^|[^\p{L}])([ld])['’]\s?(?=\p{L})/giu;

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Letters of any alphabet in the text, and how many are Latin. */
export function scriptCounts(s: string): { letters: number; latin: number } {
  let letters = 0;
  let latin = 0;
  for (const ch of s) {
    if (!LETTER.test(ch)) continue;
    letters += 1;
    if (LATIN.test(ch)) latin += 1;
  }
  return { letters, latin };
}

export function countAccents(s: string): number {
  let n = 0;
  for (const ch of s.toLowerCase()) if (FRENCH_ACCENT_LETTERS.includes(ch)) n += 1;
  return n;
}

/** Folded words of a name. Hyphens and apostrophes split words; a lone "l" or "d" before an apostrophe is kept as "l'" or "d'". */
export function nameWords(name: string): string[] {
  const elided: string[] = [];
  const stripped = name.replace(ELISION, (_m, pre: string, letter: string) => {
    elided.push(`${letter.toLowerCase()}'`);
    return `${pre} `;
  });
  const words = fold(stripped)
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== "" && !/^\d+$/.test(w));
  return [...elided, ...words];
}

function seen(words: readonly string[], set: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const w of words) if ((set.has(w) || (w.endsWith("'") && set === FRENCH_NAME_WORDS)) && !out.includes(w)) out.push(w);
  return out;
}

function readHalf(text: string): { french: string[]; english: string[] } {
  const words = nameWords(text);
  return { french: seen(words, FRENCH_NAME_WORDS), english: seen(words, ENGLISH_NAME_WORDS) };
}

export function readNameLanguage(name: string | null): NameLanguage {
  const empty = { french: [], english: [], accents: 0, pair: false } as const;
  if (name === null || name.trim() === "") return { reading: "no-name", ...empty };
  const { letters, latin } = scriptCounts(name);
  if (letters > 0 && latin * 2 < letters) return { reading: "other-script", ...empty };
  const { french, english } = readHalf(name);
  const accents = countAccents(name);
  const halves = name.split(PAIR_SPLIT).filter((h) => h.trim() !== "");
  let pair = false;
  if (halves.length === 2) {
    const [a, b] = [readHalf(halves[0]!), readHalf(halves[1]!)];
    pair = (a.french.length > 0 && a.english.length === 0 && b.english.length > 0 && b.french.length === 0) || (b.french.length > 0 && b.english.length === 0 && a.english.length > 0 && a.french.length === 0);
  }
  const reading: NameReading = french.length > 0 && english.length > 0 ? "both" : french.length > 0 ? "french" : english.length > 0 ? "english" : "neither";
  return { reading, french, english, accents, pair };
}
