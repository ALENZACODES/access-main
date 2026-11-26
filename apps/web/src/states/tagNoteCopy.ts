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
/** Wording for the tag-and-note check. It says "may point different ways" and never says which is right. */
import type { DisagreementFilter, DisagreementKind, DisagreementOrder, Weight } from "./tagNoteCheck";
import type { SignalDirection } from "./tagNoteSignals";

export const tnHeading = (l: Locale) => t(l, "Tag and note", "Balise et note");
export const tnToggle = (open: boolean, l: Locale) => (open ? t(l, "Hide the tag and note check", "Masquer la comparaison de la balise et de la note") : t(l, "Look for a tag and a note that point different ways", "Chercher une balise et une note qui vont en sens contraire"));
export const tnIntro = (l: Locale) =>
  t(
    l,
    "Each place has one wheelchair tag and may have a free-text note. Where the tag says yes and the note uses words like steps or stairs, or the tag says no and the note uses words like ramp or step free, the two may point different ways. Either may be out of date, too simple, or about another part of the place. This reads the words only. It does not say which one is right, and it changes neither.",
    "Chaque lieu a une balise d’accès en fauteuil roulant et peut avoir une note. Quand la balise dit oui et que la note emploie des mots comme marches ou escalier, ou que la balise dit non et que la note emploie des mots comme rampe ou de plain pied, les deux peuvent aller en sens contraire. L’une ou l’autre peut être périmée, trop simple ou viser une autre partie du lieu. Cela ne lit que les mots. Cela ne dit pas laquelle est la bonne et ne modifie ni l’une ni l’autre.",
  );
export const tnCoverage = (checked: number, l: Locale) => t(l, `${checked} ${checked === 1 ? "place has" : "places have"} a yes or no tag and a note to compare.`, `${checked} ${checked === 1 ? "lieu a" : "lieux ont"} une balise oui ou non et une note à comparer.`);
export const tnSummary = (n: number, l: Locale) => (n === 0 ? t(l, "None of them point different ways.", "Aucun ne va en sens contraire.") : t(l, `${n} ${n === 1 ? "place points" : "places point"} different ways.`, `${n} ${n === 1 ? "lieu va" : "lieux vont"} en sens contraire.`));
export const tnLeftOut = (withoutNote: number, noTag: number, l: Locale) => {
  const a = withoutNote === 0 ? "" : t(l, `${withoutNote} ${withoutNote === 1 ? "place has" : "places have"} no note.`, `${withoutNote} ${withoutNote === 1 ? "lieu n’a" : "lieux n’ont"} pas de note.`);
  const b = noTag === 0 ? "" : t(l, `${noTag} ${noTag === 1 ? "note has" : "notes have"} a tag of limited or UNKNOWN, which a note cannot contradict.`, `${noTag} ${noTag === 1 ? "note a" : "notes ont"} une balise limitée ou UNKNOWN, qu’une note ne peut pas contredire.`);
  return [a, b].filter(Boolean).join(" ");
};
export const tnNone = (l: Locale) => t(l, "No place on this list has a tag and a note that point different ways.", "Aucun lieu de cette liste n’a une balise et une note qui vont en sens contraire.");
export const tnNoMatch = (l: Locale) => t(l, "No place matches that choice.", "Aucun lieu ne correspond à ce choix.");
export const tnFilterGroup = (l: Locale) => t(l, "Show", "Afficher");
export const tnFilterLabel = (f: DisagreementFilter, l: Locale) =>
  f === "all" ? t(l, "All", "Tous") : f === "yes-but-barrier" ? t(l, "Tag says yes, note uses barrier words", "Balise oui, note aux mots d’obstacle") : t(l, "Tag says no, note uses access words", "Balise non, note aux mots d’accès");
export const tnOrderGroup = (l: Locale) => t(l, "Order", "Ordre");
export const tnOrderLabel = (o: DisagreementOrder, l: Locale) => (o === "one-sided-first" ? t(l, "Clear cases first", "Cas nets d’abord") : o === "name" ? t(l, "By name", "Par nom") : t(l, "Pack order", "Ordre du pack"));
export const tnNoName = (l: Locale) => t(l, "Name not in the pack", "Nom absent du pack");
export const tnTagLine = (tag: string, l: Locale) => t(l, `Tag: ${tag}`, `Balise\u00a0: ${tag}`);
export const tnKindLine = (k: DisagreementKind, l: Locale) => (k === "yes-but-barrier" ? t(l, "The tag says yes; the note uses words that read as barriers.", "La balise dit oui\u00a0; la note emploie des mots qui se lisent comme des obstacles.") : t(l, "The tag says no; the note uses words that read as access.", "La balise dit non\u00a0; la note emploie des mots qui se lisent comme de l’accès."));
export const tnWeightLine = (w: Weight, l: Locale) => (w === "one-sided" ? t(l, "All the marked words point the same way.", "Tous les mots marqués vont dans le même sens.") : t(l, "The note uses words both ways, so it may be describing more than one part of the place.", "La note emploie des mots dans les deux sens, elle décrit donc peut-être plus d’une partie du lieu."));
export const tnDirectionLabel = (d: SignalDirection, l: Locale) => (d === "access" ? t(l, "access", "accès") : t(l, "barrier", "obstacle"));
export const tnLegend = (l: Locale) => t(l, "Marked words: each is shown with “access” or “barrier” after it. The note is shown as written.", "Mots marqués\u00a0: chacun est suivi de « accès » ou « obstacle ». La note est montrée telle qu’écrite.");
export const tnCaveat = (l: Locale) => t(l, "Not a finding. Either the tag or the note may be right, and the pack does not say which.", "Ce n’est pas une conclusion. La balise ou la note peut être la bonne, et le pack ne dit pas laquelle.");

export const tnSaveText = (l: Locale) => t(l, "Save as a text file", "Enregistrer en fichier texte");
export const tnSaveCsv = (l: Locale) => t(l, "Save as a CSV file", "Enregistrer en fichier CSV");
export const tnSavedLine = (name: string, l: Locale) => t(l, `Saved ${name}.`, `Fichier ${name} enregistré.`);
export const tnCannotSave = (l: Locale) => t(l, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
export const TN_TEXT_NAME: Readonly<Record<Locale, string>> = { en: "tag-and-note.txt", fr: "balise-et-note.txt" };
export const TN_CSV_NAME: Readonly<Record<Locale, string>> = { en: "tag-and-note.csv", fr: "balise-et-note.csv" };
export const TN_CSV_HEADER = ["place_id", "place_name", "wheelchair_tag", "kind", "weight", "words_against_tag", "words_with_tag", "note"] as const;
