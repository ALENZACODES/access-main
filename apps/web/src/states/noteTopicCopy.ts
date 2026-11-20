/**
 * Every sentence of the "Words in the notes" reader, in English and French.
 *
 * The reader groups notes by the words they use. Its sentences say that a note USES a word and never
 * that a feature is there, working, usable or enough. A missing tag is UNKNOWN, a missing note is no note.
 */
import { nearestTagLabel } from "./packNearest";
import type { WheelchairTag } from "./packPlaces";
import type { TopicOrder, TopicMode } from "./noteTopicFilter";
import { TOPICS, topicLabel, type TopicId } from "./noteTopicLexicon";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export function topicColon(locale: Locale): string {
  return locale === "fr" ? "\u00a0: " : ": ";
}

export function topicSemicolon(locale: Locale): string {
  return locale === "fr" ? "\u202f; " : "; ";
}

const noteNoun = (n: number, locale: Locale): string => t(locale, n === 1 ? "note" : "notes", "note" + (n === 1 ? "" : "s"));

export function topicsHeading(locale: Locale): string {
  return t(locale, "Words in the notes", "Mots dans les notes");
}

export function topicsToggle(open: boolean, locale: Locale): string {
  return open ? t(locale, "Hide the words in the notes", "Masquer les mots des notes") : t(locale, "Show the words in the notes", "Afficher les mots des notes");
}

export function topicsIntro(locale: Locale): string {
  return t(
    locale,
    "This groups the pack's notes by the words they use, such as steps, ramp or lift. It only shows that a note uses a word. It does not say whether the feature is there, in use or in good order, and a note that says “no steps” still counts under steps. The note itself is what to read.",
    "Cette section regroupe les notes du pack selon les mots qu’elles emploient, comme marches, rampe ou ascenseur. Elle montre seulement qu’une note emploie un mot. Elle ne dit pas si l’élément existe, s’il est en service ou en bon état, et une note qui dit «\u202fpas de marches\u202f» compte quand même sous marches. C’est la note elle-même qu’il faut lire.",
  );
}

export function topicCoverageLine(withTopic: number, withNote: number, locale: Locale): string {
  if (withNote === 0) return t(locale, "No place in the pack has a note.", "Aucun lieu du pack n’a de note.");
  return t(
    locale,
    `At least one of these words appears in ${withTopic} of ${withNote} ${noteNoun(withNote, "en")}.`,
    `${withTopic} note${withTopic === 1 ? "" : "s"} sur ${withNote} emploie${withTopic === 1 ? "" : "nt"} au moins un de ces mots.`,
  );
}

export function topicWithoutTopicLine(n: number, locale: Locale): string {
  if (n === 0) return "";
  return t(locale, `None of them appears in ${n} ${noteNoun(n, "en")}.`, `${n} note${n === 1 ? "" : "s"} n’emploie${n === 1 ? "" : "nt"} aucun de ces mots.`);
}

export function topicCheckLabel(id: TopicId, places: number, locale: Locale): string {
  return t(locale, `${topicLabel(id, "en")} (${places} ${places === 1 ? "place" : "places"})`, `${topicLabel(id, "fr")} (${places} ${places === 1 ? "lieu" : "lieux"})`);
}

export function topicTagFilterLabel(tag: WheelchairTag, locale: Locale): string {
  return t(locale, `Wheelchair tag: ${nearestTagLabel(tag, "en")}`, `Indication pour fauteuil roulant\u00a0: ${nearestTagLabel(tag, "fr")}`);
}

export function topicModeLabel(mode: TopicMode, locale: Locale): string {
  return mode === "any"
    ? t(locale, "Notes that use any of the chosen words", "Notes qui emploient l’un des mots choisis")
    : t(locale, "Notes that use all of the chosen words", "Notes qui emploient tous les mots choisis");
}

export function topicModeGroupLabel(locale: Locale): string {
  return t(locale, "When several words are chosen", "Quand plusieurs mots sont choisis");
}

export function topicSkipNegatedLabel(locale: Locale): string {
  return t(
    locale,
    "Skip notes that only use the word right after “no”, “not” or “without”",
    "Ignorer les notes qui n’emploient le mot qu’après «\u202fsans\u202f», «\u202fpas\u202f», «\u202fno\u202f», «\u202fnot\u202f» ou «\u202fwithout\u202f»",
  );
}

export function topicOrderLabel(order: TopicOrder, locale: Locale): string {
  switch (order) {
    case "name":
      return t(locale, "By place name", "Par nom de lieu");
    case "topics":
      return t(locale, "Most different words first", "Le plus de mots différents d’abord");
    case "tag":
      return t(locale, "By wheelchair tag", "Par indication pour fauteuil roulant");
  }
}

export function topicShownLine(shown: number, withNote: number, filtered: boolean, locale: Locale): string {
  if (!filtered) return t(locale, `Showing all ${withNote} ${noteNoun(withNote, "en")}.`, `${withNote} note${withNote === 1 ? "" : "s"} affichée${withNote === 1 ? "" : "s"}.`);
  return t(locale, `Showing ${shown} of ${withNote} ${noteNoun(withNote, "en")}.`, `${shown} note${shown === 1 ? "" : "s"} affichée${shown === 1 ? "" : "s"} sur ${withNote}.`);
}

export function topicNoMatchLine(locale: Locale): string {
  return t(locale, "No note matches the words and tags chosen.", "Aucune note ne correspond aux mots et aux indications choisis.");
}

export function topicWordsUsedLine(ids: readonly TopicId[], locale: Locale): string {
  const list = ids.map((id) => topicLabel(id, locale)).join(topicSemicolon(locale));
  return `${t(locale, "Words used", "Mots employés")}${topicColon(locale)}${list}`;
}

export function topicNegatedLine(ids: readonly TopicId[], locale: Locale): string {
  const list = ids.map((id) => topicLabel(id, locale)).join(topicSemicolon(locale));
  return `${t(locale, "Only right after “no”, “not” or “without”", "Seulement après «\u202fsans\u202f», «\u202fpas\u202f», «\u202fno\u202f», «\u202fnot\u202f» ou «\u202fwithout\u202f»")}${topicColon(locale)}${list}`;
}

export function topicNoWordsLine(locale: Locale): string {
  return t(locale, "None of the listed words.", "Aucun des mots de la liste.");
}

export function topicNoteAsWritten(locale: Locale): string {
  return t(locale, "Note, as written in the pack", "Note, telle qu’écrite dans le pack");
}

export function topicNoName(locale: Locale): string {
  return t(locale, "Place with no name (UNKNOWN)", "Lieu sans nom (UNKNOWN)");
}

export function topicTagLine(tag: WheelchairTag, locale: Locale): string {
  return `${t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")}${topicColon(locale)}${nearestTagLabel(tag, locale)}`;
}

export function topicTableCaption(locale: Locale): string {
  return t(locale, "Places by word and wheelchair tag", "Lieux par mot et par indication pour fauteuil roulant");
}

export function topicTableWordHeader(locale: Locale): string {
  return t(locale, "Word group", "Groupe de mots");
}

export function topicTableTotalHeader(locale: Locale): string {
  return t(locale, "Places", "Lieux");
}

export function topicTableTagHeader(tag: WheelchairTag, locale: Locale): string {
  return nearestTagLabel(tag, locale);
}

export function topicPairsLine(a: TopicId, b: TopicId, places: number, locale: Locale): string {
  return t(
    locale,
    `${topicLabel(a, "en")} and ${topicLabel(b, "en")}: ${places} ${noteNoun(places, "en")}`,
    `${topicLabel(a, "fr")} et ${topicLabel(b, "fr")}\u00a0: ${places} note${places === 1 ? "" : "s"}`,
  );
}

export function topicPairsHeading(locale: Locale): string {
  return t(locale, "Words used together in the same note", "Mots employés ensemble dans une même note");
}

export function topicMentionsLine(places: number, mentions: number, locale: Locale): string {
  return t(
    locale,
    `${places} ${places === 1 ? "place" : "places"}, ${mentions} ${mentions === 1 ? "use" : "uses"} of these words`,
    `${places} ${places === 1 ? "lieu" : "lieux"}, ${mentions} emploi${mentions === 1 ? "" : "s"} de ces mots`,
  );
}

export function topicWordsListHeading(locale: Locale): string {
  return t(locale, "Words looked for", "Mots recherchés");
}

/** The cues of a topic as they would be typed, for the list of words looked for. */
export function topicCuesOf(id: TopicId): string {
  return TOPICS.find((d) => d.id === id)?.cues.join(", ") ?? "";
}
