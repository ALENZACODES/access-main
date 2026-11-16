// Plain-language checks for the App's copy. These are rough, openly heuristic
// measures (syllables are counted by rule, not from a dictionary), so the
// limits are set to catch long, dense or jargon-heavy text, not to grade prose.

import type { Locale } from "./copyLint";

export interface Readability {
  words: number;
  sentences: number;
  longestSentence: number;
  wordsPerSentence: number;
  syllablesPerWord: number;
  /** Flesch-Kincaid grade level (English). Lower is easier. */
  gradeEn: number;
  /** Kandel and Moles score (French). Higher is easier; 60 to 70 is standard. */
  kandelMoles: number;
}

export type PlainCode = "sentence-too-long" | "grade-too-high" | "hard-to-read" | "jargon";

export interface PlainProblem {
  code: PlainCode;
  detail: string;
}

export interface PlainLimits {
  maxSentenceWords: number;
  maxGradeEn: number;
  minKandelMoles: number;
  /** Texts shorter than this are labels, not prose, and are only checked for jargon. */
  minWordsToScore: number;
}

export const DEFAULT_LIMITS: PlainLimits = {
  maxSentenceWords: 25,
  maxGradeEn: 9,
  minKandelMoles: 50,
  minWordsToScore: 8,
};

const JARGON: Readonly<Record<Locale, readonly string[]>> = {
  en: ["utilize", "utilise", "leverage", "pursuant", "aforementioned", "herein", "notwithstanding", "telemetry", "metadata", "sandbox", "payload", "heuristic"],
  fr: ["télémétrie", "métadonnées", "aux fins de", "susmentionné", "ci-après", "nonobstant", "charge utile", "heuristique", "exploiter les données"],
};

const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
const VOWELS_EN = /[aeiouy]+/g;
const VOWELS_FR = /[aeiouyàâäéèêëîïôöùûüœæ]+/g;

export function splitSentences(text: string): string[] {
  const parts = text
    .replace(/(\d)\.(\d)/g, "$1\u0000$2")
    .split(/(?<=[.!?…])[\s\u00a0\u202f]+/u)
    .map((s) => s.replace(/\u0000/g, ".").trim())
    .filter((s) => s !== "");
  return parts;
}

export function countSyllables(locale: Locale, word: string): number {
  const w = word.toLocaleLowerCase().replace(/[’'-]/g, "");
  if (w === "") return 0;
  let n = (w.match(locale === "fr" ? VOWELS_FR : VOWELS_EN) ?? []).length;
  if (locale === "fr") {
    // a final mute "e" or "es" after a consonant does not count
    if (n > 1 && /[^aeiouyàâäéèêëîïôöùûüœæ]es?$/.test(w)) n -= 1;
  } else {
    if (n > 1 && /[^aeiouy]e$/.test(w) && !/le$/.test(w)) n -= 1;
    else if (n > 1 && /[^aeiouy]es$|[^aeiouy]ed$/.test(w) && !/(?:ted|ded|ses|ces|ges|xes|zes)$/.test(w)) n -= 1;
  }
  return Math.max(1, n);
}

export function analyze(locale: Locale, text: string): Readability {
  const sentences = splitSentences(text);
  const wordsBy = sentences.map((s) => s.match(WORD) ?? []);
  const words = wordsBy.reduce((n, w) => n + w.length, 0);
  const syllables = wordsBy.flat().reduce((n, w) => n + countSyllables(locale, w), 0);
  const sCount = Math.max(1, sentences.length);
  const wps = words / sCount;
  const spw = words === 0 ? 0 : syllables / words;
  return {
    words,
    sentences: sentences.length,
    longestSentence: Math.max(0, ...wordsBy.map((w) => w.length)),
    wordsPerSentence: wps,
    syllablesPerWord: spw,
    gradeEn: 0.39 * wps + 11.8 * spw - 15.59,
    kandelMoles: 207 - 1.015 * wps - 73.6 * spw,
  };
}

export function checkPlain(locale: Locale, text: string, limits: PlainLimits = DEFAULT_LIMITS): PlainProblem[] {
  const out: PlainProblem[] = [];
  const lower = text.toLocaleLowerCase();
  for (const j of JARGON[locale]) {
    if (lower.includes(j)) out.push({ code: "jargon", detail: `"${j}"` });
  }
  const r = analyze(locale, text);
  if (r.words < limits.minWordsToScore) return out;
  if (r.longestSentence > limits.maxSentenceWords) {
    out.push({ code: "sentence-too-long", detail: `${r.longestSentence} words, limit ${limits.maxSentenceWords}` });
  }
  if (locale === "en" && r.gradeEn > limits.maxGradeEn) {
    out.push({ code: "grade-too-high", detail: `grade ${r.gradeEn.toFixed(1)}, limit ${limits.maxGradeEn}` });
  }
  if (locale === "fr" && r.kandelMoles < limits.minKandelMoles) {
    out.push({ code: "hard-to-read", detail: `score ${r.kandelMoles.toFixed(0)}, minimum ${limits.minKandelMoles}` });
  }
  return out;
}
