/**
 * A reading score for the note of a place, worked out from sentence length and word length alone.
 * English uses Flesch reading ease; French uses Kandel and Moles. Both are rough: they see how long
 * the sentences and words are, not whether the note is right, clear in meaning or complete. The score
 * is an estimate and is shown as one. A note too short to score is said to be too short.
 */
import { countSyllables, numberSyllables } from "./noteSyllables";
import { splitSentences, tokensOf } from "./noteSentences";
import type { Locale } from "./stateCopy";

/** Fewer words than this are not scored: the averages mean nothing on a handful of words. */
export const MIN_SCORED_WORDS = 6;
/** A sentence with more words than this is called long. */
export const LONG_SENTENCE_WORDS = 20;
/** A word with this many syllables or more is called long. */
export const LONG_WORD_SYLLABLES = 4;

export type ReadingBand = "easy" | "fair" | "hard" | "very-hard";
export const READING_BANDS: readonly ReadingBand[] = ["easy", "fair", "hard", "very-hard"];

export interface SentenceStat {
  readonly text: string;
  readonly words: number;
}

export interface Reading {
  readonly locale: Locale;
  readonly sentences: number;
  readonly words: number;
  readonly syllables: number;
  readonly longWords: readonly string[];
  readonly longSentences: readonly SentenceStat[];
  readonly wordsPerSentence: number;
  readonly syllablesPerWord: number;
  /** The score, rounded to a whole number. Higher reads more easily. Null when the note is too short to score. */
  readonly score: number | null;
  readonly band: ReadingBand | null;
}

/** Flesch for English, Kandel and Moles for French. Not clamped here; see `clampScore`. */
export function rawScore(wordsPerSentence: number, syllablesPerWord: number, locale: Locale): number {
  return locale === "fr" ? 207 - 1.015 * wordsPerSentence - 73.6 * syllablesPerWord : 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
}

/** Scores are kept in 0 to 100 so a very short, very plain note does not show as 120. */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** The band for a score: 70 and up easy, 50 to 69 fair, 30 to 49 hard, below 30 very hard. */
export function readingBandOf(score: number): ReadingBand {
  if (score >= 70) return "easy";
  if (score >= 50) return "fair";
  if (score >= 30) return "hard";
  return "very-hard";
}

/** Read one note. A null or blank note has no words and no score. */
export function readNote(note: string | null, locale: Locale): Reading {
  const sentences = note === null ? [] : splitSentences(note);
  let words = 0;
  let syllables = 0;
  const longWords: string[] = [];
  const longSentences: SentenceStat[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const tokens = tokensOf(sentence);
    for (const tk of tokens) {
      if (tk.kind === "number") {
        words += 1;
        syllables += numberSyllables(tk.text);
        continue;
      }
      // A hyphenated word is read part by part.
      const parts = tk.text.split(/['’-]/).filter(Boolean);
      const count = parts.reduce((n, p) => n + countSyllables(p, locale), 0);
      words += 1;
      syllables += Math.max(1, count);
      if (count >= LONG_WORD_SYLLABLES) {
        const key = tk.text.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          longWords.push(tk.text);
        }
      }
    }
    if (tokens.length > LONG_SENTENCE_WORDS) longSentences.push({ text: sentence, words: tokens.length });
  }
  const sentenceCount = sentences.filter((s) => tokensOf(s).length > 0).length;
  const wordsPerSentence = sentenceCount === 0 ? 0 : words / sentenceCount;
  const syllablesPerWord = words === 0 ? 0 : syllables / words;
  const scored = words >= MIN_SCORED_WORDS && sentenceCount > 0;
  const score = scored ? clampScore(rawScore(wordsPerSentence, syllablesPerWord, locale)) : null;
  return { locale, sentences: sentenceCount, words, syllables, longWords, longSentences, wordsPerSentence, syllablesPerWord, score, band: score === null ? null : readingBandOf(score) };
}
