/**
 * Whole numbers written out in words, in English and French, for reading a civic number aloud on
 * the phone. English follows Canadian use ("one hundred twenty-three", no "and"). French follows
 * the standard forms: "soixante et onze", "quatre-vingts" (with an s only when nothing follows),
 * "deux cents" but "deux cent un", and an invariable "mille".
 *
 * Works from 0 to 99 999. Anything else returns null and the caller reads the digits instead.
 */
import type { Locale } from "./stateCopy";

export const MAX_SPOKEN_NUMBER = 99_999;

const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"] as const;
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"] as const;

function enBelow1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h > 0) parts.push(`${EN_ONES[h]} hundred`);
  if (r > 0) {
    if (r < 20) parts.push(EN_ONES[r]!);
    else parts.push(r % 10 === 0 ? EN_TENS[Math.floor(r / 10)]! : `${EN_TENS[Math.floor(r / 10)]}-${EN_ONES[r % 10]}`);
  }
  return parts.join(" ");
}

function english(n: number): string {
  if (n === 0) return "zero";
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  return [th > 0 ? `${enBelow1000(th)} thousand` : "", r > 0 ? enBelow1000(r) : ""].filter(Boolean).join(" ");
}

const FR_ONES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"] as const;
const FR_TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"] as const;

/** 0 to 99. `final` is true when nothing is said after it, which is when "quatre-vingts" takes its s. */
function frBelow100(n: number, final: boolean): string {
  if (n < 20) return FR_ONES[n]!;
  if (n < 70) {
    const t = FR_TENS[Math.floor(n / 10)]!;
    const u = n % 10;
    return u === 0 ? t : u === 1 ? `${t} et un` : `${t}-${FR_ONES[u]}`;
  }
  if (n < 80) {
    const u = n - 60;
    return u === 11 ? "soixante et onze" : `soixante-${FR_ONES[u]}`;
  }
  const u = n - 80;
  return u === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${FR_ONES[u]}`;
}

function frBelow1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return frBelow100(r, final);
  const hundreds = h === 1 ? "cent" : `${FR_ONES[h]} cent${r === 0 && final ? "s" : ""}`;
  return r === 0 ? hundreds : `${hundreds} ${frBelow100(r, final)}`;
}

function french(n: number): string {
  if (n === 0) return "zéro";
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const head = th === 0 ? "" : th === 1 ? "mille" : `${frBelow1000(th, false)} mille`;
  const tail = r === 0 ? "" : frBelow1000(r, true);
  return [head, tail].filter(Boolean).join(" ");
}

/** The number in words, or null when it is not a whole number from 0 to 99 999. */
export function numberWords(n: number, locale: Locale): string | null {
  if (!Number.isInteger(n) || n < 0 || n > MAX_SPOKEN_NUMBER) return null;
  return locale === "fr" ? french(n) : english(n);
}

const EN_DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;
const FR_DIGITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"] as const;

/** Each digit of a string read on its own, other characters dropped: "2650" is "two six five zero". */
export function digitWords(text: string, locale: Locale): string {
  const words = locale === "fr" ? FR_DIGITS : EN_DIGITS;
  return [...text].filter((c) => c >= "0" && c <= "9").map((c) => words[Number(c)]!).join(" ");
}
