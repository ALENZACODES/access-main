/**
 * Reads a number the way a person would say it, so it can be read aloud or dialled by hand. The
 * number is always shown as the pack writes it; the readings here are beside it, never in its place.
 */
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export type ContactKind = "short" | "toll-free" | "ten-digit" | "other";

export interface ContactReading {
  /** Every digit, in order, with no separator. */
  readonly digits: string;
  /** The runs of digits the pack's separators make, in order. */
  readonly groups: readonly string[];
  readonly kind: ContactKind;
}

const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);

/** The digits of a number and how it is grouped. null when there is no digit at all. */
export function readContact(contact: string): ContactReading | null {
  const groups = contact.match(/[0-9]+/g);
  if (groups === null) return null;
  const digits = groups.join("");
  let kind: ContactKind = "other";
  if (digits.length === 3) kind = "short";
  else if (digits.length === 11 && digits.startsWith("1") && TOLL_FREE.has(digits.slice(1, 4))) kind = "toll-free";
  else if (digits.length === 10) kind = "ten-digit";
  return { digits, groups, kind };
}

const EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;
const FR = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"] as const;

/** One group of digits as words, a space between: "266" is "two six six". */
export function digitWords(group: string, locale: Locale): string {
  const words = locale === "fr" ? FR : EN;
  return [...group].map((d) => words[Number(d)] ?? d).join(" ");
}

/**
 * The number as it is said. Groups are separated by a comma and a space, which a screen reader reads
 * as a pause. A number of single digits ("9-8-8") is one run, as people say it: "nine eight eight".
 */
export function spokenContact(r: ContactReading, locale: Locale): string {
  if (r.groups.length <= 4 && r.groups.every((g) => g.length === 1)) return digitWords(r.digits, locale);
  return r.groups.map((g) => digitWords(g, locale)).join(", ");
}

export function kindName(kind: ContactKind, locale: Locale): string {
  switch (kind) {
    case "short":
      return t(locale, "A three-digit number", "Un numéro à trois chiffres");
    case "toll-free":
      return t(locale, "A toll-free number", "Un numéro sans frais");
    case "ten-digit":
      return t(locale, "A ten-digit number", "Un numéro à dix chiffres");
    case "other":
      return t(locale, "A number", "Un numéro");
  }
}
