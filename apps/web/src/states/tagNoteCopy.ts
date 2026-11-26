/**
 * Words for the tags-and-notes page, in English and French. It says which places have a tag and a note that
 * are worth reading side by side. It never says a tag or a note is wrong, and the note is always shown as
 * the pack wrote it.
 */
import { topicColon, topicSemicolon } from "./noteTopicCopy";
import { type TopicId, topicLabel } from "./noteTopicLexicon";
import { nearestTagLabel } from "./packNearest";
import type { WheelchairTag } from "./packPlaces";
import type { Locale } from "./stateCopy";
import type { TagNoteOrder } from "./tagNoteIndex";
import { TAG_NOTE_RULES, type TagNoteKind, type TagNoteRead } from "./tagNoteRules";
import { t } from "./typography";

export const tagNotesHeading = (locale: Locale): string => t(locale, "Tags and notes side by side", "Indications et notes côte à côte");
export const tagNotesToggle = (open: boolean, locale: Locale): string =>
  open ? t(locale, "Hide tags and notes", "Masquer les indications et les notes") : t(locale, "Show tags and notes", "Afficher les indications et les notes");
export const tagNotesIntro = (locale: Locale): string =>
  t(
    locale,
    "These are places whose wheelchair tag and note can be read in different directions at first sight. It is a list of places to read, not a list of mistakes: a note may well explain its tag. Each note is shown as the pack wrote it, with the words that put it on the list marked. Three readings are used, and no others.",
    "Voici des lieux dont l’indication pour fauteuil roulant et la note peuvent se lire dans des sens différents à première vue. C’est une liste de lieux à lire, pas une liste d’erreurs\u00a0: une note peut très bien expliquer son indication. Chaque note est affichée telle que le pack l’a écrite, avec les mots qui l’ont mise sur la liste en évidence. Trois lectures sont utilisées, et aucune autre.",
  );

function tagList(tags: readonly WheelchairTag[], locale: Locale): string {
  const labels = tags.map((x) => (x === "unknown" ? "UNKNOWN" : nearestTagLabel(x, locale)));
  return labels.join(t(locale, " or ", " ou "));
}

function wordList(ids: readonly TopicId[], locale: Locale): string {
  return ids.map((id) => topicLabel(id, locale)).join(topicSemicolon(locale));
}

/** The reading in a sentence: "Tag Yes or Designated, and the note uses Steps and stairs." */
export function tagNoteRuleLine(kind: TagNoteKind, locale: Locale): string {
  const rule = TAG_NOTE_RULES.find((r) => r.kind === kind)!;
  const tag = tagList(rule.tags, locale);
  const words = wordList(rule.topics, locale);
  return `${t(locale, "Tag ", "Indication ")}${tag}${t(locale, ", and the note uses: ", ", et la note emploie\u00a0: ")}${words}`;
}

export const tagNoteRulesHeading = (locale: Locale): string => t(locale, "The three readings", "Les trois lectures");
export const tagNoteRulesExtra = (locale: Locale): string =>
  t(
    locale,
    "A word right after “no”, “not” or “without” does not count, and neither does “step-free”. Tag Limited has no reading.",
    "Un mot juste après «\u202fsans\u202f», «\u202fpas\u202f», «\u202fno\u202f», «\u202fnot\u202f» ou «\u202fwithout\u202f» ne compte pas, ni «\u202fstep-free\u202f». L’indication Limité n’a aucune lecture.",
  );

export function tagNoteKindLabel(kind: TagNoteKind, locale: Locale): string {
  switch (kind) {
    case "yes-steps":
      return t(locale, "Tag Yes or Designated, note has a steps word", "Indication Oui ou Désigné, note avec un mot de marches");
    case "no-ramp-lift":
      return t(locale, "Tag No, note has a ramp or lift word", "Indication Non, note avec un mot de rampe ou d’ascenseur");
    case "unknown-words":
      return t(locale, "No tag (UNKNOWN), note has a steps, ramp or lift word", "Pas d’indication (UNKNOWN), note avec un mot de marches, de rampe ou d’ascenseur");
  }
}

export const tagNoteAllLabel = (n: number, locale: Locale): string => t(locale, `All readings (${n})`, `Toutes les lectures (${n})`);
export const tagNoteKindChoice = (kind: TagNoteKind, n: number, locale: Locale): string => `${tagNoteKindLabel(kind, locale)} (${n})`;
export const tagNoteKindGroupLabel = (locale: Locale): string => t(locale, "Which reading", "Quelle lecture");
export const tagNoteOrderGroupLabel = (locale: Locale): string => t(locale, "Order", "Ordre");
export const tagNoteOrderLabel = (o: TagNoteOrder, locale: Locale): string =>
  o === "name" ? t(locale, "By name", "Par nom") : t(locale, "By reading, then name", "Par lecture, puis par nom");

export function tagNoteCountLine(listed: number, withNote: number, locale: Locale): string {
  if (withNote === 0) return t(locale, "No place in this list has a note.", "Aucun lieu de cette liste n’a de note.");
  if (listed === 0) {
    return withNote === 1
      ? t(locale, "The note is not read in a different direction from its tag by these three readings.", "La note ne se lit pas dans un autre sens que son indication selon ces trois lectures.")
      : t(locale, `None of the ${withNote} notes is read in a different direction from its tag by these three readings.`, `Aucune des ${withNote} notes ne se lit dans un autre sens que son indication selon ces trois lectures.`);
  }
  return t(
    locale,
    `${listed} of ${withNote} ${withNote === 1 ? "note" : "notes"} ${listed === 1 ? "is" : "are"} on the list.`,
    `${listed} ${listed === 1 ? "note" : "notes"} sur ${withNote} ${listed === 1 ? "figure" : "figurent"} dans la liste.`,
  );
}

export const tagNoteNoneShownLine = (locale: Locale): string => t(locale, "No place matches this reading.", "Aucun lieu ne correspond à cette lecture.");
export const tagNoteNoteAsWritten = (locale: Locale): string => t(locale, "Note, as written in the pack", "Note, telle qu’écrite dans le pack");

/** Tag and the words that put the place on the list: the tag label and the topic names, never the note's own words. */
export function tagNoteWhyLine(read: Pick<TagNoteRead, "tag" | "topics">, locale: Locale): string {
  const tag = read.tag === "unknown" ? "UNKNOWN" : nearestTagLabel(read.tag, locale);
  return `${t(locale, "Tag", "Indication")}${topicColon(locale)}${tag}${topicSemicolon(locale)}${t(locale, "the note uses", "la note emploie")}${topicColon(locale)}${wordList(read.topics, locale)}`;
}

export const tagNoteSaveTextLabel = (locale: Locale): string => t(locale, "Save the list as text", "Enregistrer la liste en texte");
export const tagNoteSaveCsvLabel = (locale: Locale): string => t(locale, "Save the list as a table (CSV)", "Enregistrer la liste en tableau (CSV)");
