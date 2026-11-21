/** Wording for the by-kind table and the comparison with an earlier findings file. Neither says which of a tag or a note is right. */
import type { Locale } from "./stateCopy";
import type { EarlierChange, EarlierProblem } from "./tagNoteEarlier";
import type { SpreadOrder, SpreadTotals } from "./tagNoteSpread";
import { t } from "./typography";

export const tsHeading = (l: Locale) => t(l, "By kind of place", "Par type de lieu");
export const tsIntro = (l: Locale) =>
  t(
    l,
    "For each kind of place: how many have a yes or no tag and a note, and how many of those point different ways. A high share may only mean that kind is described in more words.",
    "Pour chaque type de lieu\u00a0: combien ont une balise oui ou non et une note, et combien d’entre eux vont en sens contraire. Une part élevée peut seulement vouloir dire que ce type est décrit avec plus de mots.",
  );
export const tsCaption = (l: Locale) => t(l, "Places with a note, by kind", "Lieux avec une note, par type");
export const tsColumns = (l: Locale) => ({
  kind: t(l, "Kind", "Type"),
  checked: t(l, "Compared", "Comparés"),
  flagged: t(l, "Point different ways", "En sens contraire"),
  clear: t(l, "Clear cases", "Cas nets"),
  share: t(l, "Share", "Part"),
});
export const tsOrderGroup = (l: Locale) => t(l, "Order the kinds", "Ordre des types");
export const tsOrderLabel = (o: SpreadOrder, l: Locale) =>
  o === "flagged" ? t(l, "Most places first", "Plus de lieux d’abord") : o === "share" ? t(l, "Highest share first", "Part la plus élevée d’abord") : t(l, "By name", "Par nom");
export const tsPercent = (n: number, l: Locale) => (l === "fr" ? `${n}\u00a0%` : `${n}%`);
export const tsTotals = (s: SpreadTotals, l: Locale) =>
  t(
    l,
    `${s.kindsWithDifferences} of ${s.kinds} ${s.kinds === 1 ? "kind has" : "kinds have"} at least one place that points different ways (${s.flagged} of ${s.checked} compared).`,
    `${s.kindsWithDifferences} type${s.kindsWithDifferences > 1 ? "s" : ""} sur ${s.kinds} ${s.kindsWithDifferences > 1 ? "ont" : "a"} au moins un lieu qui va en sens contraire (${s.flagged} sur ${s.checked} comparés).`,
  );
export const tsNoKinds = (l: Locale) => t(l, "No place has a yes or no tag and a note, so there is nothing to group.", "Aucun lieu n’a une balise oui ou non et une note\u00a0: il n’y a rien à regrouper.");
export const tsSaveCsv = (l: Locale) => t(l, "Save the kinds as a CSV file", "Enregistrer les types en fichier CSV");
export const TS_CSV_NAME: Readonly<Record<Locale, string>> = { en: "tag-and-note-by-kind.csv", fr: "balise-et-note-par-type.csv" };
export const TS_CSV_HEADER = ["kind", "compared", "point_different_ways", "clear_cases", "share_percent"] as const;

export const teHeading = (l: Locale) => t(l, "Compare with an earlier file", "Comparer avec un fichier précédent");
export const teIntro = (l: Locale) =>
  t(
    l,
    "Paste the text of a tag-and-note CSV file you saved earlier to see which places are new, changed or no longer point different ways.",
    "Collez le texte d’un fichier CSV de balises et notes enregistré plus tôt pour voir quels lieux sont nouveaux, modifiés ou ne vont plus en sens contraire.",
  );
export const teFileLabel = (l: Locale) => t(l, "Earlier tag-and-note file, pasted as text", "Fichier de balises et notes précédent, collé en texte");
export const teCompare = (l: Locale) => t(l, "Compare", "Comparer");
export const teClear = (l: Locale) => t(l, "Clear", "Effacer");
export const teEmpty = (l: Locale) => t(l, "Paste some text first.", "Collez d’abord du texte.");
export const teNotThisFile = (l: Locale) => t(l, "This is not a tag-and-note file saved by the App.", "Ce n’est pas un fichier de balises et notes enregistré par l’App.");
export const teProblem = (p: EarlierProblem, l: Locale, missing: readonly string[] = []): string => {
  switch (p) {
    case "empty":
      return t(l, "The file is empty.", "Le fichier est vide.");
    case "too-large":
      return t(l, "The file is too large to read here (the limit is 5 MB).", "Le fichier est trop gros pour être lu ici (la limite est de 5\u00a0Mo).");
    case "too-many-rows":
      return t(l, "The file has too many rows to read here.", "Le fichier compte trop de lignes pour être lu ici.");
    case "unterminated-quote":
      return t(l, "A quotation mark in the file is never closed, so it cannot be read safely.", "Un guillemet du fichier n’est jamais refermé\u00a0: il ne peut pas être lu sans risque.");
    case "no-header":
      return t(l, "The file has no header row.", "Le fichier n’a pas de ligne d’en-tête.");
    case "no-rows":
      return t(l, "The file has a header but no places.", "Le fichier a un en-tête mais aucun lieu.");
    case "missing-columns":
      return t(l, `Missing columns: ${missing.join(", ")}.`, `Colonnes manquantes\u00a0: ${missing.join(", ")}.`);
  }
};
export const teChangeLabel = (c: EarlierChange, l: Locale) =>
  c === "new" ? t(l, "New", "Nouveau") : c === "gone" ? t(l, "No longer", "Plus maintenant") : c === "changed" ? t(l, "Changed", "Modifié") : t(l, "Same", "Inchangé");
export const teChangeLine = (c: EarlierChange, l: Locale) =>
  c === "new"
    ? t(l, "Points different ways now; it was not in the earlier file.", "Va en sens contraire maintenant\u00a0; absent du fichier précédent.")
    : c === "gone"
      ? t(l, "Was in the earlier file; it does not point different ways now, or is no longer in the pack.", "Était dans le fichier précédent\u00a0; ne va plus en sens contraire, ou n’est plus dans le pack.")
      : c === "changed"
        ? t(l, "Pointed different ways before and now, but the tag or the note is not the same.", "Allait en sens contraire avant et maintenant, mais la balise ou la note n’est plus la même.")
        : t(l, "Points different ways, as before.", "Va en sens contraire, comme avant.");
export const teSummary = (counts: Readonly<Record<EarlierChange, number>>, l: Locale) =>
  t(
    l,
    `${counts.new} new, ${counts.changed} changed, ${counts.gone} no longer, ${counts.same} the same.`,
    `${counts.new} nouveau${counts.new > 1 ? "x" : ""}, ${counts.changed} modifié${counts.changed > 1 ? "s" : ""}, ${counts.gone} en moins, ${counts.same} inchangé${counts.same > 1 ? "s" : ""}.`,
  );
export const teSkipped = (n: number, l: Locale) => t(l, `${n} ${n === 1 ? "row was" : "rows were"} left out because ${n === 1 ? "it" : "they"} could not be read.`, `${n} ${n === 1 ? "ligne a été laissée" : "lignes ont été laissées"} de côté, faute de pouvoir être lue${n === 1 ? "" : "s"}.`);
export const teNothing = (l: Locale) => t(l, "Nothing to compare: neither the file nor the pack has a place that points different ways.", "Rien à comparer\u00a0: ni le fichier ni le pack n’a de lieu qui va en sens contraire.");
export const teCaveat = (l: Locale) => t(l, "This compares the words of the notes and the tags only. It does not say which one is right.", "Cette comparaison ne porte que sur les mots des notes et sur les balises. Elle ne dit pas laquelle est la bonne.");
export const TE_SHOWN = 20;
