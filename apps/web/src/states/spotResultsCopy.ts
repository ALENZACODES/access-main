/**
 * Words for reading a filled-in sheet back, in English and French. Counts are given as counts.
 * A difference is "what you saw differs from what the pack reports": it is not called an error in
 * the pack, and nothing is said to have been sent or changed.
 */
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import type { CellProblem, ResultsProblem } from "./spotResults";
import type { SpotMatchKind, SpotSummary } from "./spotSummary";

const places = (n: number, locale: Locale): string => t(locale, `${n} ${n === 1 ? "place" : "places"}`, `${n} ${n === 1 ? "lieu" : "lieux"}`);

export const resultsToggle = (open: boolean, locale: Locale): string =>
  open ? t(locale, "Hide reading your answers", "Masquer la lecture de vos réponses") : t(locale, "Read your filled-in sheet back", "Relire votre feuille remplie");

export const resultsIntro = (locale: Locale): string =>
  t(
    locale,
    "After you have looked, type your answers into the CSV from the sheet, then paste all of it here. It is read on this device only. Nothing is sent or saved, and nothing in the pack is changed.",
    "Après votre visite, saisissez vos réponses dans le fichier CSV de la feuille, puis collez-le en entier ici. Il est lu uniquement sur cet appareil. Rien n’est envoyé ni enregistré, et rien n’est modifié dans le jeu de lieux.",
  );

export const resultsPasteLabel = (locale: Locale): string => t(locale, "Paste your filled-in CSV", "Collez votre fichier CSV rempli");

export function resultsProblem(problem: ResultsProblem, locale: Locale): string {
  switch (problem) {
    case "empty":
      return t(locale, "Paste the CSV to read it.", "Collez le fichier CSV pour le lire.");
    case "too-large":
      return t(locale, "That text is too large to be a spot-check sheet.", "Ce texte est trop volumineux pour être une feuille d’observation.");
    case "not-csv":
      return t(locale, "That does not read as a CSV file. A quote may be left open.", "Ce texte n’a pas la forme d’un fichier CSV. Un guillemet est peut-être resté ouvert.");
    case "wrong-header":
      return t(locale, "The first line is not the one from a spot-check sheet. Use the CSV saved from the sheet, and keep its first line.", "La première ligne n’est pas celle d’une feuille d’observation. Utilisez le fichier CSV enregistré depuis la feuille, en gardant sa première ligne.");
    case "no-rows":
      return t(locale, "The CSV has no places in it.", "Le fichier CSV ne contient aucun lieu.");
    case "too-many-rows":
      return t(locale, "The CSV has more rows than a spot-check sheet holds.", "Le fichier CSV contient plus de lignes qu’une feuille d’observation.");
  }
}

export function resultsRead(rows: number, skipped: number, locale: Locale): string {
  const base = t(locale, `Read ${places(rows, locale)}.`, `${places(rows, locale)} ${rows === 1 ? "lu" : "lus"}.`);
  if (skipped === 0) return base;
  return `${base} ${t(locale, `${skipped} ${skipped === 1 ? "row" : "rows"} with no place id ${skipped === 1 ? "was" : "were"} left out.`, `${skipped} ${skipped === 1 ? "ligne sans identifiant a été laissée de côté" : "lignes sans identifiant ont été laissées de côté"}.`)}`;
}

export function matchWord(kind: SpotMatchKind, n: number, locale: Locale): string {
  const one = n === 1;
  switch (kind) {
    case "same":
      return t(locale, "matched the tag", one ? "correspond à l’étiquette" : "correspondent à l’étiquette");
    case "different":
      return t(locale, "differed from the tag", one ? "diffère de l’étiquette" : "diffèrent de l’étiquette");
    case "could-not-tell":
      return t(locale, "could not be judged", one ? "n’a pas pu être jugé" : "n’ont pas pu être jugés");
    case "not-answered":
      return t(locale, "not answered", "sans réponse");
  }
}

export function spotSummaryLine(s: SpotSummary, locale: Locale): string {
  const parts = (["same", "different", "could-not-tell", "not-answered"] as const).filter((k) => s.byMatch[k] > 0).map((k) => `${s.byMatch[k]} ${matchWord(k, s.byMatch[k], locale)}`);
  return t(locale, `Of ${places(s.total, locale)} on the sheet: ${parts.join(", ")}.`, `Sur ${places(s.total, locale)} de la feuille\u00a0: ${parts.join(", ")}.`);
}

export const noAnswers = (locale: Locale): string => t(locale, "No answers were typed in yet, so there is nothing to summarise.", "Aucune réponse n’a encore été saisie\u00a0: il n’y a rien à résumer.");

export const tagTallyHeading = (locale: Locale): string => t(locale, "By the tag the pack reports", "Selon l’étiquette rapportée par le jeu de lieux");

export function tagTallyLine(tag: string, total: number, same: number, different: number, locale: Locale): string {
  return t(locale, `${tag}: ${places(total, locale)}, ${same} matched, ${different} differed`, `${tag}\u00a0: ${places(total, locale)}, ${same} ${same === 1 ? "correspond" : "correspondent"}, ${different} ${different === 1 ? "diffère" : "diffèrent"}`);
}

export const noRateNote = (locale: Locale): string =>
  t(
    locale,
    "These are counts for the places you chose to look at. They are not a rate, and they say nothing about the places you did not look at.",
    "Ce sont des comptes pour les lieux que vous avez choisi d’aller voir. Ce n’est pas un taux, et cela ne dit rien des lieux que vous n’avez pas vus.",
  );

export function problemsLine(count: number, locale: Locale): string {
  return t(locale, `${places(count, locale)} had a cell that could not be read. Check the answers in that row: use Yes, No, Not sure, Same, Different or Could not tell, and a date as YYYY-MM-DD.`, `${places(count, locale)} ${count === 1 ? "contient" : "contiennent"} une cellule illisible. Relisez les réponses de cette ligne\u00a0: Oui, Non, Pas certain, Pareil, Différent ou Impossible à dire, et une date sous la forme AAAA-MM-JJ.`);
}

export function cellProblemWord(p: CellProblem, column: string, locale: Locale): string {
  return p === "answer-not-understood" ? t(locale, `answer in “${column}” not understood`, `réponse de «\u202f${column}\u202f» non comprise`) : t(locale, "date not understood", "date non comprise");
}

export const reportButton = (locale: Locale): string => t(locale, "Copy a note of the differences", "Copier une note des différences");
export const reportSaveButton = (locale: Locale): string => t(locale, "Save the note of the differences (text)", "Enregistrer la note des différences (texte)");
export const reportCopied = (locale: Locale): string => t(locale, "Note copied.", "Note copiée.");
export const reportCopyFailed = (locale: Locale): string => t(locale, "This browser could not copy. Save the note as a file instead.", "Ce navigateur n’a pas pu copier. Enregistrez plutôt la note dans un fichier.");
export const SPOT_REPORT_FILENAMES: Readonly<Record<Locale, string>> = { en: "spot-check-differences.txt", fr: "differences-observees-sur-place.txt" };
export const differencesHeading = (n: number, locale: Locale): string => t(locale, `Differences you saw (${n})`, `Différences que vous avez constatées (${n})`);
export const noDifferences = (locale: Locale): string => t(locale, "You did not record any difference.", "Vous n’avez noté aucune différence.");
