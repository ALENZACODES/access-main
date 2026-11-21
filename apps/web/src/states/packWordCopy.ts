/**
 * The words around the pack's word help, in English and French. Words that were typed or that the pack
 * holds (a search word, a place's word) are put in from outside t(), so the French typography rules never
 * rewrite them. Nothing here says what a person meant or which word is right: it says which words the pack
 * has and how many places have each.
 */
import { placeCount } from "./packCategories";
import { searchQuoted } from "./packSearchExplain";
import type { NearReason } from "./packWordNear";
import type { WordField } from "./packWordIndex";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const wordsHeading = (locale: Locale): string => t(locale, "Words in this pack", "Mots du pack");
export const wordsToggle = (open: boolean, locale: Locale): string =>
  open ? t(locale, "Hide the words", "Masquer les mots") : t(locale, "Show the words", "Afficher les mots");
export const wordsIntro = (locale: Locale): string =>
  t(
    locale,
    "These are the words the pack uses, with the number of places that have each. Press a word to search for it. Words are shown without accents or capitals, as the search reads them.",
    "Voici les mots employés dans le pack, avec le nombre de lieux qui contiennent chacun. Appuyez sur un mot pour le chercher. Les mots sont affichés sans accents ni majuscules, comme la recherche les lit.",
  );
export const wordsFieldGroupLabel = (locale: Locale): string => t(locale, "Where to look for words", "Où chercher les mots");

export function wordFieldLabel(field: WordField, locale: Locale): string {
  switch (field) {
    case "any":
      return t(locale, "Name, address or kind", "Nom, adresse ou genre");
    case "name":
      return t(locale, "Names", "Noms");
    case "address":
      return t(locale, "Addresses", "Adresses");
    case "kind":
      return t(locale, "Kinds", "Genres");
    case "note":
      return t(locale, "Notes", "Notes");
  }
}

/** "No place has the word “x”", then where it was looked for. */
export function missingWordLine(word: string, field: WordField, locale: Locale): string {
  const where: Record<WordField, [string, string]> = {
    any: [" in its name, address or kind.", " dans son nom, son adresse ou son genre."],
    name: [" in a name.", " dans un nom."],
    address: [" in an address.", " dans une adresse."],
    kind: [" as a kind.", " comme genre."],
    note: [" in a note.", " dans une note."],
  };
  return `${t(locale, "No place has the word ", "Aucun lieu n’a le mot ")}${searchQuoted(word, locale)}${t(locale, where[field][0], where[field][1])}`;
}

export const missingWordsHeading = (locale: Locale): string => t(locale, "Words that no place has", "Mots qu’aucun lieu ne contient");

export function nearWordLine(text: string, places: number, reason: NearReason, locale: Locale): string {
  const lead =
    reason === "french-kind"
      ? t(locale, "The pack names this kind ", "Le pack nomme ce genre ")
      : t(locale, "Close in spelling: ", "Proche par l’orthographe\u00a0: ");
  return `${lead}${searchQuoted(text, locale)} (${placeCount(places, locale)})`;
}

export const nearWordNoneLine = (locale: Locale): string =>
  t(locale, "No word in the pack is close in spelling to it.", "Aucun mot du pack n’est proche de celui-ci par l’orthographe.");

export function searchForWordLabel(text: string, locale: Locale): string {
  return `${t(locale, "Search for ", "Chercher ")}${searchQuoted(text, locale)}`;
}

export function wordButtonLabel(word: string, places: number): string {
  return `${word} (${places})`;
}

export function wordCountLine(shown: number, total: number, locale: Locale): string {
  if (total === 0) return t(locale, "The pack has no words in this part of its places.", "Le pack n’a aucun mot dans cette partie de ses lieux.");
  if (shown >= total) return t(locale, `${total} words, all shown.`, `${total} mots, tous affichés.`);
  return t(locale, `${shown} of ${total} words shown, the ones in the most places first.`, `${shown} mots sur ${total} affichés, ceux de plus de lieux d’abord.`);
}

export const wordsShowAllLabel = (total: number, locale: Locale): string => t(locale, `Show all ${total} words`, `Afficher les ${total} mots`);
export const wordsShowFewerLabel = (locale: Locale): string => t(locale, "Show fewer words", "Afficher moins de mots");
export const wordsSaveTextLabel = (locale: Locale): string => t(locale, "Save the words as text", "Enregistrer les mots en texte");
export const wordsSaveCsvLabel = (locale: Locale): string => t(locale, "Save the words as a table (CSV)", "Enregistrer les mots en tableau (CSV)");
