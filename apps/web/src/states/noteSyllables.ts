/**
 * An estimate of how many syllables a word has, by its letters alone. It is a rule of thumb used for
 * a reading score, not a dictionary: it will be off by one for some words, and the score that uses it
 * says so. English and French have their own rules.
 */
import type { Locale } from "./stateCopy";

const EN_VOWELS = /[aeiouy]+/g;
const FR_VOWELS = /[aeiouyàâäéèêëîïôöùûüœæ]+/g;

/** Letters only, lower case, accents kept (French needs them). */
export function wordLetters(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}]/gu, "");
}

function englishSyllables(w: string): number {
  if (w.length <= 3) return 1;
  let s = w;
  // A silent final "e", "es" or "ed" does not make a syllable. "-le" after a consonant ("table") does, and so do "-ted", "-ded" and sibilant "-es" ("boxes").
  if (/[^aeiouy]le$/.test(s)) {
    // "table" keeps its last syllable
  } else if (/[^aeiouy]e$/.test(s)) {
    s = s.slice(0, -1);
  } else if (/[^aeiouy]es$/.test(s) && !/(?:s|x|z|ch|sh|c|g)es$/.test(s)) {
    s = s.slice(0, -2);
  } else if (/[^aeiouy]ed$/.test(s) && !/[td]ed$/.test(s)) {
    s = s.slice(0, -2);
  }
  const groups = s.match(EN_VOWELS);
  return Math.max(1, groups ? groups.length : 1);
}

function frenchSyllables(w: string): number {
  if (w.length <= 2) return 1;
  let s = w;
  // A final unstressed "e", "es" or the verb ending "ent" is not said, but a word made of just that ending is kept as one.
  if (/[qg]ue$/.test(s)) s = s.slice(0, -2);
  else if (/[^aeiouyàâäéèêëîïôöùûüœæ]e$/.test(s)) s = s.slice(0, -1);
  else if (/[^aeiouyàâäéèêëîïôöùûüœæ]es$/.test(s)) s = s.slice(0, -2);
  else if (/[^aeiouyàâäéèêëîïôöùûüœæm]ent$/.test(s) && s.length > 5) s = s.slice(0, -3);
  const groups = s.match(FR_VOWELS);
  return Math.max(1, groups ? groups.length : 1);
}

/** Syllables of one word; letters only are read. A word with no letters has none. */
export function countSyllables(word: string, locale: Locale): number {
  const w = wordLetters(word);
  if (w === "") return 0;
  return locale === "fr" ? frenchSyllables(w) : englishSyllables(w);
}

/** A number is read digit by digit, so "10" counts as two and "2" as one. */
export function numberSyllables(digits: string): number {
  return Math.max(1, digits.replace(/\D/g, "").length);
}
