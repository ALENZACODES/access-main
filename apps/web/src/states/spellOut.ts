/**
 * Spelling a name or a street out letter by letter, for a phone call where the person on the line
 * cannot see it. English uses the usual spelling alphabet (Alfa, Bravo, Charlie), French the
 * telephone alphabet (Anatole, Berthe, Célestin). Accents are named, because "Café" and "Cafe"
 * are different words to the person writing it down. Characters the alphabets do not cover are
 * named plainly (space, hyphen, apostrophe) and anything else is called a symbol, never skipped.
 */
import type { Locale } from "./stateCopy";
import { digitWords } from "./numberWords";

export const MAX_SPELL_CHARS = 40;

const EN_ALPHABET: Readonly<Record<string, string>> = {
  a: "Alfa", b: "Bravo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot", g: "Golf", h: "Hotel", i: "India", j: "Juliett", k: "Kilo", l: "Lima", m: "Mike",
  n: "November", o: "Oscar", p: "Papa", q: "Quebec", r: "Romeo", s: "Sierra", t: "Tango", u: "Uniform", v: "Victor", w: "Whiskey", x: "X-ray", y: "Yankee", z: "Zulu",
};

const FR_ALPHABET: Readonly<Record<string, string>> = {
  a: "Anatole", b: "Berthe", c: "Célestin", d: "Désiré", e: "Émile", f: "François", g: "Gaston", h: "Henri", i: "Irma", j: "Joseph", k: "Kléber", l: "Louis", m: "Marcel",
  n: "Nicolas", o: "Oscar", p: "Pierre", q: "Quentin", r: "Raoul", s: "Suzanne", t: "Thérèse", u: "Ursule", v: "Victor", w: "William", x: "Xavier", y: "Yvonne", z: "Zoé",
};

export const SPELLING_WORDS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = { en: EN_ALPHABET, fr: FR_ALPHABET };

/** Combining marks the spelling names, by code point. */
const ACCENTS: Readonly<Record<string, { en: string; fr: string }>> = {
  "\u0301": { en: "acute accent", fr: "accent aigu" },
  "\u0300": { en: "grave accent", fr: "accent grave" },
  "\u0302": { en: "circumflex", fr: "accent circonflexe" },
  "\u0308": { en: "diaeresis", fr: "tréma" },
  "\u0327": { en: "cedilla", fr: "cédille" },
};

const SYMBOLS: Readonly<Record<string, { en: string; fr: string }>> = {
  " ": { en: "space", fr: "espace" },
  "-": { en: "hyphen", fr: "trait d’union" },
  "’": { en: "apostrophe", fr: "apostrophe" },
  "'": { en: "apostrophe", fr: "apostrophe" },
  ".": { en: "period", fr: "point" },
  ",": { en: "comma", fr: "virgule" },
  "&": { en: "ampersand", fr: "esperluette" },
  "/": { en: "slash", fr: "barre oblique" },
  "#": { en: "number sign", fr: "dièse" },
  "(": { en: "open bracket", fr: "parenthèse ouvrante" },
  ")": { en: "close bracket", fr: "parenthèse fermante" },
  "@": { en: "at sign", fr: "arobase" },
};

export type SpellKind = "letter" | "digit" | "symbol";

export interface SpellUnit {
  /** The character as written, with its accent. */
  readonly char: string;
  readonly kind: SpellKind;
  /** What to say for it. */
  readonly say: string;
}

export interface Spelling {
  readonly units: readonly SpellUnit[];
  /** True when the text was longer than MAX_SPELL_CHARS and was cut. */
  readonly cut: boolean;
}

function letterSay(base: string, marks: readonly string[], locale: Locale): string {
  const word = SPELLING_WORDS[locale][base]!;
  const accent = marks.map((m) => ACCENTS[m]?.[locale]).filter((x): x is string => x !== undefined);
  const letter = base.toUpperCase();
  if (locale === "fr") return `${letter}${accent.length ? ` ${accent.join(" ")}` : ""} comme ${word}`;
  if (accent.length === 0) return `${letter} as in ${word}`;
  const article = /^[aeiou]/.test(accent[0]!) ? "an" : "a";
  return `${letter} with ${article} ${accent.join(" and ")} as in ${word}`;
}

/** One unit for each character, in order. Collapses nothing: a doubled letter is said twice. */
export function spellUnits(text: string, locale: Locale): Spelling {
  // Whitespace runs read as one space; the text is cut by characters, not by UTF-16 units.
  const chars = [...text.normalize("NFC").replace(/\s+/g, " ").trim()];
  const cut = chars.length > MAX_SPELL_CHARS;
  const units: SpellUnit[] = [];
  for (const char of chars.slice(0, MAX_SPELL_CHARS)) {
    const decomposed = char.normalize("NFD");
    const base = decomposed[0]!.toLowerCase();
    const marks = [...decomposed.slice(1)];
    if (/^[a-z]$/.test(base) && marks.every((m) => m in ACCENTS)) {
      units.push({ char, kind: "letter", say: letterSay(base, marks, locale) });
    } else if (/^[0-9]$/.test(char)) {
      units.push({ char, kind: "digit", say: digitWords(char, locale) });
    } else {
      const named = SYMBOLS[char];
      units.push({ char, kind: "symbol", say: named ? named[locale] : locale === "fr" ? `le symbole\u202f« ${char} »` : `the symbol “${char}”` });
    }
  }
  return { units, cut };
}

/** The whole spelling as one line, units separated by commas. */
export function spellLine(text: string, locale: Locale): string {
  return spellUnits(text, locale).units.map((u) => u.say).join(", ");
}

/** Whether a word is worth spelling: it has a letter the person might hear wrongly. Short common words and plain numbers are not. */
export function worthSpelling(word: string): boolean {
  const w = word.normalize("NFD");
  const letters = (w.match(/[a-z]/gi) ?? []).length;
  if (letters < 4) return false;
  return /[\u0300-\u036f]|[-’'&]|[qxzkwyj]/i.test(w) || letters >= 9;
}
