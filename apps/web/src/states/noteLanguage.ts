/**
 * Which language a note is written in, guessed from common small words. A pack note can be English or
 * French whatever language the page is in, and each has its own reading formula. It only chooses between
 * those two; with too little to go on, or a tie, it says "unsure" and the caller uses the page's language.
 */
import type { Locale } from "./stateCopy";
import { foldText } from "./suggest";

const EN = new Set(["the", "and", "is", "are", "at", "to", "of", "in", "on", "for", "with", "no", "not", "a", "an", "it", "you", "your", "will", "can", "door", "entrance", "ramp", "steps", "stairs", "ring", "bell", "open", "from", "there", "this", "that", "by", "be", "have", "has", "only", "floor", "side", "front", "back"]);
const FR = new Set(["le", "la", "les", "et", "est", "sont", "au", "aux", "du", "des", "de", "un", "une", "en", "sur", "pour", "avec", "pas", "ne", "il", "vous", "votre", "sonnez", "porte", "entree", "rampe", "marches", "escalier", "ascenseur", "ouvert", "dans", "par", "que", "qui", "cote", "sous", "salle", "sonnette", "disponible"]);

export interface LanguageGuess {
  readonly language: Locale | "unsure";
  readonly en: number;
  readonly fr: number;
}

/** Counts the common words of each language. Needs at least two hits in all and a clear lead; otherwise "unsure". */
export function guessNoteLanguage(note: string): LanguageGuess {
  let en = 0;
  let fr = 0;
  for (const w of foldText(note).split(/[^a-z0-9]+/).filter(Boolean)) {
    if (EN.has(w)) en += 1;
    if (FR.has(w)) fr += 1;
  }
  const language: LanguageGuess["language"] = en + fr < 2 || en === fr ? "unsure" : en > fr ? "en" : "fr";
  return { language, en, fr };
}

/** The language to read this note in: the guess when there is one, else the page's language. */
export function noteLocale(note: string, pageLocale: Locale): Locale {
  const g = guessNoteLanguage(note).language;
  return g === "unsure" ? pageLocale : g;
}
