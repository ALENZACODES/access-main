/**
 * A name reduced to what matters for comparing: no accents or case, "&" as "and", no punctuation,
 * no leading article, and common spelling variants made alike. The name as written is never changed;
 * this is only a key for comparing.
 */
import { foldText } from "./suggest";

/** Words dropped when they start a name, in both languages. */
const ARTICLES = new Set(["the", "a", "an", "le", "la", "les", "l", "un", "une", "chez"]);

/** Words dropped anywhere: they say what the place is for the person reading, not which place it is. */
const FILLER = new Set(["inc", "ltd", "ltee", "limitee", "corp", "co", "enr", "llc", "sencrl"]);

/** Spelling variants made one. */
const VARIANTS: Readonly<Record<string, string>> = { saint: "st", sainte: "ste", mount: "mt", centre: "center", theatre: "theater", mcdonalds: "mcdonald", restaurant: "resto" };

export function foldPlaceName(name: string): string {
  const folded = foldText(name.replace(/&/g, " and ").replace(/['’`´]/g, " "));
  const words = folded.split(" ").filter(Boolean);
  while (words.length > 1 && ARTICLES.has(words[0]!)) words.shift();
  return words
    .filter((w) => !FILLER.has(w))
    .map((w) => VARIANTS[w] ?? w)
    .join(" ");
}

/** A short key for grouping candidates: the first two letters of the first word that is not a number. Empty when the name has none. */
export function nameBlock(key: string): string {
  const w = key.split(" ").find((x) => /^[a-z]{2,}/.test(x));
  return w ? w.slice(0, 2) : "";
}
