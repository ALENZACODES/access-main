/**
 * Every sentence of the "Notes in the pack" reader, in English and French.
 *
 * The notes themselves are never reworded here. The sentences around them count what the pack
 * holds and say plainly that a note is the pack's own wording, shown as written. They never say a
 * note is right, confirmed or enough, and they show a missing note as no note, a missing tag as UNKNOWN.
 */
import type { NoteTagCounts } from "./packNoteIndex";
import type { NoteLength } from "./packNoteText";
import { nearestTagLabel } from "./packNearest";
import type { WheelchairTag } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { NBSP, t } from "./typography";

const TAGS: readonly WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];

export function colonFor(locale: Locale): string {
  return locale === "fr" ? "\u00a0: " : ": ";
}

export function placesNoun(n: number, locale: Locale): string {
  return t(locale, n === 1 ? "place" : "places", n === 1 ? "lieu" : "lieux");
}

export function noteNoun(n: number, locale: Locale): string {
  return t(locale, n === 1 ? "note" : "notes", n === 1 ? "note" : "notes");
}

export function noteHeading(locale: Locale): string {
  return t(locale, "Notes in the pack", "Notes dans le pack");
}

export function noteIntro(locale: Locale): string {
  return t(
    locale,
    "Some places in the pack come with a note written by whoever mapped them. Here the notes are shown exactly as written, and you can search them. A note is the pack's wording: this page does not change it or add to it.",
    "Certains lieux du pack ont une note écrite par la personne qui les a cartographiés. Les notes sont affichées ici telles qu’elles ont été écrites, et vous pouvez les chercher. Une note reprend les mots du pack\u00a0: cette page ne la modifie pas et n’y ajoute rien.",
  );
}

export function noteToggle(open: boolean, locale: Locale): string {
  return open ? t(locale, "Hide the notes", "Masquer les notes") : t(locale, "Show the notes", "Afficher les notes");
}

export function noNotesAtAll(locale: Locale): string {
  return t(locale, "None of the places shown has a note in the pack.", "Aucun des lieux affichés n’a de note dans le pack.");
}

/** "3 of 10 places have a note." */
export function coverageSentence(withNote: number, total: number, locale: Locale): string {
  return t(
    locale,
    `${withNote} of ${total} ${placesNoun(total, "en")} ${withNote === 1 ? "has" : "have"} a note.`,
    `${withNote} ${placesNoun(withNote, "fr")} sur ${total} ${withNote === 1 ? "a" : "ont"} une note.`,
  );
}

export function withoutSentence(without: number, locale: Locale): string {
  if (without === 0) return "";
  return t(
    locale,
    `${without} ${placesNoun(without, "en")} ${without === 1 ? "has" : "have"} no note. That does not mean there is nothing to know about ${without === 1 ? "it" : "them"}.`,
    `${without} ${placesNoun(without, "fr")} ${without === 1 ? "n’a" : "n’ont"} pas de note. Cela ne veut pas dire qu’il n’y a rien à savoir ${without === 1 ? "sur ce lieu" : "sur ces lieux"}.`,
  );
}

/** "2 Yes, 1 UNKNOWN": tags that have a place, in the page's order. Empty when there are none. */
export function tagCountsLine(counts: NoteTagCounts, locale: Locale): string {
  return TAGS.filter((tag) => counts[tag] > 0)
    .map((tag) => `${counts[tag]}${NBSP}${nearestTagLabel(tag, locale)}`)
    .join(", ");
}

export function lengthLabel(length: NoteLength, locale: Locale): string {
  switch (length) {
    case "short":
      return t(locale, "Short (up to 60 characters)", "Courte (jusqu’à 60 caractères)");
    case "medium":
      return t(locale, "Medium (61 to 200 characters)", "Moyenne (de 61 à 200 caractères)");
    case "long":
      return t(locale, "Long (over 200 characters)", "Longue (plus de 200 caractères)");
  }
}

export function lengthWord(length: NoteLength, locale: Locale): string {
  switch (length) {
    case "short":
      return t(locale, "short", "courte");
    case "medium":
      return t(locale, "medium", "moyenne");
    case "long":
      return t(locale, "long", "longue");
  }
}

export function charsPhrase(chars: number, locale: Locale): string {
  return t(locale, `${chars} ${chars === 1 ? "character" : "characters"}`, `${chars} ${chars === 1 ? "caractère" : "caractères"}`);
}

export function searchLabel(locale: Locale): string {
  return t(locale, "Search the notes", "Chercher dans les notes");
}

export function searchHelp(locale: Locale): string {
  return t(
    locale,
    "Words must each start a word of the note. Put a phrase in double quotes. Put a minus sign before a word to leave out notes that have it.",
    "Chaque mot doit commencer un mot de la note. Mettez une expression entre guillemets droits. Mettez un signe moins devant un mot pour écarter les notes qui le contiennent.",
  );
}

export function orderLabelFor(order: string, locale: Locale): string {
  switch (order) {
    case "name":
      return t(locale, "By place name", "Par nom de lieu");
    case "longest":
      return t(locale, "Longest note first", "Note la plus longue d’abord");
    case "shortest":
      return t(locale, "Shortest note first", "Note la plus courte d’abord");
    default:
      return t(locale, "By wheelchair tag", "Par indication pour fauteuil roulant");
  }
}

export function shownSentence(shown: number, listed: number, filtered: boolean, locale: Locale): string {
  if (!filtered) return t(locale, `${listed} ${noteNoun(listed, "en")} listed.`, `${listed} ${noteNoun(listed, "fr")} listée${listed === 1 ? "" : "s"}.`);
  return t(locale, `${shown} of ${listed} ${noteNoun(listed, "en")} match your search and filters.`, `${shown} ${noteNoun(shown, "fr")} sur ${listed} correspondent à votre recherche et à vos filtres.`);
}

export function noMatchSentence(locale: Locale): string {
  return t(locale, "No note matches your search and filters.", "Aucune note ne correspond à votre recherche et à vos filtres.");
}

export function repeatedLabel(copies: number, locale: Locale): string {
  return t(locale, `The same note is on ${copies} places.`, `La même note figure sur ${copies} lieux.`);
}

export function repeatedOnlyLabel(locale: Locale): string {
  return t(locale, "Only notes that appear on more than one place", "Seulement les notes qui figurent sur plusieurs lieux");
}

export function duplicatesHeading(groups: number, locale: Locale): string {
  return t(
    locale,
    groups === 1 ? "1 note appears on more than one place" : `${groups} notes appear on more than one place`,
    groups === 1 ? "1 note figure sur plusieurs lieux" : `${groups} notes figurent sur plusieurs lieux`,
  );
}

export function showWhole(locale: Locale): string {
  return t(locale, "Show the whole note", "Afficher toute la note");
}

export function showLess(locale: Locale): string {
  return t(locale, "Show less", "Afficher moins");
}

export function noteNoName(locale: Locale): string {
  return t(locale, "Place with no name (UNKNOWN)", "Lieu sans nom (UNKNOWN)");
}

export function tagLine(tag: WheelchairTag, locale: Locale): string {
  return `${t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")}${colonFor(locale)}${nearestTagLabel(tag, locale)}`;
}

export function noteAsWritten(locale: Locale): string {
  return t(locale, "Note, as written in the pack", "Note, telle qu’écrite dans le pack");
}
