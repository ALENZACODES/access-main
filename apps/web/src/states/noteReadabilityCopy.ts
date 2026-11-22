/** Wording for the note reading check. English and French. It says what is measured and what is not. */
import type { Locale } from "./stateCopy";
import type { ReadingBand } from "./noteReadability";
import type { ReadingFilter, ReadingOrder } from "./noteReadabilityIndex";
import { t } from "./typography";

export const readHeading = (l: Locale) => t(l, "Reading ease of the notes", "Facilité de lecture des notes");
export const readToggle = (open: boolean, l: Locale) => (open ? t(l, "Hide the reading ease of the notes", "Masquer la facilité de lecture des notes") : t(l, "Show the reading ease of the notes", "Afficher la facilité de lecture des notes"));
export const readIntro = (l: Locale) =>
  t(
    l,
    "A rough score for how easily each note reads, from the length of its sentences and words. It does not say whether a note is right or complete, and it can be a little off for short notes, names and numbers. Notes are read as written and never changed.",
    "Un score approximatif de la facilité de lecture de chaque note, d’après la longueur de ses phrases et de ses mots. Il ne dit pas si une note est juste ou complète, et il peut s’écarter un peu pour les notes courtes, les noms et les nombres. Les notes sont lues telles qu’écrites et jamais modifiées.",
  );

const BAND_EN: Record<ReadingBand, string> = { easy: "Easy", fair: "Fair", hard: "Hard", "very-hard": "Very hard" };
const BAND_FR: Record<ReadingBand, string> = { easy: "Facile", fair: "Moyenne", hard: "Difficile", "very-hard": "Très difficile" };
export const readingBandLabel = (b: ReadingBand, l: Locale) => (l === "fr" ? BAND_FR[b] : BAND_EN[b]);

export const filterGroupLabel = (l: Locale) => t(l, "Show notes that read as", "Afficher les notes qui se lisent comme");
export const readingFilterLabel = (f: ReadingFilter, l: Locale) => (f === "all" ? t(l, "Every scored note", "Toutes les notes évaluées") : readingBandLabel(f, l));
export const orderGroupLabel = (l: Locale) => t(l, "Order", "Ordre");
export const readingOrderLabel = (o: ReadingOrder, l: Locale) =>
  o === "hardest" ? t(l, "Hardest first", "Les plus difficiles d’abord") : o === "easiest" ? t(l, "Easiest first", "Les plus faciles d’abord") : o === "name" ? t(l, "By name", "Par nom") : t(l, "Pack order", "Ordre du pack");

export const readNoName = (l: Locale) => t(l, "Name not in the pack", "Nom absent du pack");
export const readNoNotes = (l: Locale) => t(l, "None of these places has a note to read.", "Aucun de ces lieux n’a de note à lire.");
export const readNoMatch = (l: Locale) => t(l, "No note reads that way.", "Aucune note ne se lit ainsi.");

export const readCoverageLine = (scored: number, withNote: number, l: Locale) =>
  t(l, `${scored} of ${withNote} ${withNote === 1 ? "note" : "notes"} could be scored.`, `${scored} ${withNote === 1 ? "note" : "notes"} sur ${withNote} ${scored > 1 ? "ont pu être évaluées" : "a pu être évaluée"}.`);
export const readTooShortLine = (n: number, l: Locale) => (n === 0 ? "" : t(l, `${n} ${n === 1 ? "note is" : "notes are"} too short to score.`, `${n} ${n === 1 ? "note est trop courte" : "notes sont trop courtes"} pour être évaluée${n === 1 ? "" : "s"}.`));
export const readWithoutLine = (n: number, l: Locale) => (n === 0 ? "" : t(l, `${n} ${n === 1 ? "place has" : "places have"} no note.`, `${n} ${n === 1 ? "lieu n’a" : "lieux n’ont"} pas de note.`));
export const readOtherLanguageLine = (n: number, l: Locale) =>
  n === 0 ? "" : t(l, `${n} ${n === 1 ? "note looks" : "notes look"} to be in the other language and ${n === 1 ? "was" : "were"} scored with that language’s formula.`, `${n} ${n === 1 ? "note semble" : "notes semblent"} rédigée${n === 1 ? "" : "s"} dans l’autre langue et ${n === 1 ? "a été évaluée" : "ont été évaluées"} avec la formule de cette langue.`);
export const readAverageLine = (avg: number | null, l: Locale) => (avg === null ? "" : t(l, `Average score: ${avg} out of 100 (higher reads more easily).`, `Score moyen\u00a0: ${avg} sur 100 (plus il est élevé, plus la lecture est facile).`));

export const readTableCaption = (l: Locale) => t(l, "Notes by how easily they read", "Notes selon leur facilité de lecture");
export const readColumns = (l: Locale) => ({
  place: t(l, "Place", "Lieu"),
  score: t(l, "Score", "Score"),
  band: t(l, "Reads as", "Se lit comme"),
  words: t(l, "Words", "Mots"),
  sentence: t(l, "Words per sentence", "Mots par phrase"),
});
export const readLongWordsLine = (words: readonly string[], l: Locale) => (words.length === 0 ? "" : t(l, `Long words: ${words.join(", ")}.`, `Mots longs\u00a0: ${words.join(", ")}.`));
export const readLongSentencesLine = (n: number, l: Locale) => (n === 0 ? "" : t(l, `${n} long ${n === 1 ? "sentence" : "sentences"} (over 20 words).`, `${n} ${n === 1 ? "longue phrase" : "longues phrases"} (plus de 20 mots).`));
export const readShownLine = (shown: number, total: number, l: Locale) => t(l, `Showing ${shown} of ${total}.`, `${shown} affichée${shown > 1 ? "s" : ""} sur ${total}.`);

export const readSaveText = (l: Locale) => t(l, "Save as a text file", "Enregistrer en fichier texte");
export const readSaveCsv = (l: Locale) => t(l, "Save as a CSV file", "Enregistrer en fichier CSV");
export const readSavedLine = (name: string, l: Locale) => t(l, `Saved ${name}.`, `Fichier ${name} enregistré.`);
export const readCannotSave = (l: Locale) => t(l, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
export const READ_TEXT_NAME: Readonly<Record<Locale, string>> = { en: "note-reading-ease.txt", fr: "facilite-lecture-notes.txt" };
export const READ_CSV_NAME: Readonly<Record<Locale, string>> = { en: "note-reading-ease.csv", fr: "facilite-lecture-notes.csv" };
export const READ_CSV_HEADER = ["place_id", "place_name", "note_language", "score", "reads_as", "words", "sentences", "words_per_sentence", "long_words", "long_sentences"] as const;
export const readTextCaveat = (l: Locale) => t(l, "Rough score from sentence and word length. Not a judgement of whether a note is right or complete.", "Score approximatif d’après la longueur des phrases et des mots. Ce n’est pas un jugement sur l’exactitude ou l’exhaustivité d’une note.");
