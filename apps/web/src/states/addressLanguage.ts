/**
 * Reads what language the street words in an address point to ("Rue Principale", "Main Street"), and compares that
 * with what the name points to. Only the street part (before the first comma) is read, and only the street type
 * and the direction after it, since the rest is mostly a person's name or a number. "St" counts as a street type
 * only at the end, so "St. Clair Avenue" is not read as English by its "St". A guess from common words, like the
 * name reading: it never says what language an address is in.
 */
import { nameWords, type NameReading } from "./nameLanguage";

export type AddressReading = "no-address" | "french" | "english" | "both" | "neither";
export const ADDRESS_READINGS: readonly AddressReading[] = ["french", "english", "both", "neither", "no-address"];

/** Street types and directions that point to French. Folded. "est" and "avenue" are left out: both languages use them. */
export const FRENCH_STREET_WORDS: ReadonlySet<string> = new Set(["rue", "chemin", "ruelle", "impasse", "rang", "montee", "allee", "boul", "ouest", "nord", "sud"]);
export const ENGLISH_STREET_WORDS: ReadonlySet<string> = new Set(["street", "st", "road", "rd", "drive", "dr", "lane", "ln", "crescent", "cres", "trail", "way", "line", "concession", "sideroad", "north", "south", "east", "west"]);

/** Words after a street type that only give a direction. */
const DIRECTION_WORDS = new Set(["n", "s", "e", "w", "o", "ne", "nw", "se", "sw", "no", "so", "nord", "sud", "est", "ouest", "north", "south", "east", "west"]);

export interface AddressLanguage {
  readonly reading: AddressReading;
  readonly french: readonly string[];
  readonly english: readonly string[];
}

const push = (list: string[], w: string) => {
  if (!list.includes(w)) list.push(w);
};

export function readAddressLanguage(address: string | null): AddressLanguage {
  if (address === null || address.trim() === "") return { reading: "no-address", french: [], english: [] };
  const words = nameWords((address.split(",")[0] ?? "").trim());
  const french: string[] = [];
  const english: string[] = [];
  const first = words[0];
  // A French type comes first ("Rue Principale", "Chemin du Lac") and can also come last ("Principale Rue" is rare, so only the first place is read for rue-like words).
  if (first !== undefined && FRENCH_STREET_WORDS.has(first) && !DIRECTION_WORDS.has(first)) push(french, first);
  let i = words.length - 1;
  const trailing: string[] = [];
  while (i > 0 && DIRECTION_WORDS.has(words[i]!)) {
    trailing.push(words[i]!);
    i -= 1;
  }
  const typeWord = i > 0 ? words[i]! : undefined;
  if (typeWord !== undefined) {
    if (ENGLISH_STREET_WORDS.has(typeWord) && !DIRECTION_WORDS.has(typeWord)) push(english, typeWord);
    if (FRENCH_STREET_WORDS.has(typeWord) && !DIRECTION_WORDS.has(typeWord)) push(french, typeWord);
  }
  for (const d of trailing.reverse()) {
    if (FRENCH_STREET_WORDS.has(d) && d !== "est") push(french, d);
    if (ENGLISH_STREET_WORDS.has(d)) push(english, d);
  }
  const reading: AddressReading = french.length > 0 && english.length > 0 ? "both" : french.length > 0 ? "french" : english.length > 0 ? "english" : "neither";
  return { reading, french, english };
}

export type NameAddressMatch = "same" | "differs" | "one-side" | "neither" | "missing";
export const NAME_ADDRESS_MATCHES: readonly NameAddressMatch[] = ["same", "differs", "one-side", "neither", "missing"];

const languagesOf = (reading: NameReading | AddressReading): ("french" | "english")[] =>
  reading === "french" ? ["french"] : reading === "english" ? ["english"] : reading === "both" ? ["french", "english"] : [];

/** Compares what a name and an address point to. Both must be there to be compared. */
export function compareNameAndAddress(name: NameReading, address: AddressReading): NameAddressMatch {
  if (name === "no-name" || address === "no-address") return "missing";
  const n = languagesOf(name);
  const a = languagesOf(address);
  if (n.length > 0 && a.length > 0) return n.some((x) => a.includes(x)) ? "same" : "differs";
  if (n.length > 0 || a.length > 0) return "one-side";
  return "neither";
}
