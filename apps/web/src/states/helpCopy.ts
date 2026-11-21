/** Words for the saved help numbers. They describe copies; none says a line is open or will answer. */
import { kindName, spokenContact } from "./helpContact";
import type { HelpRow } from "./helpView";
import { formatDate } from "./provenance";
import { tierLabel } from "./recordTier";
import type { HelpNumber } from "./packHelp";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export function helpHeading(locale: Locale): string {
  return t(locale, "Saved help numbers", "Numéros d’aide enregistrés");
}

export function helpLead(locale: Locale): string {
  return t(
    locale,
    "These are copies of numbers from when the pack was built. A number may have changed. Check a number with its source before you rely on it.",
    "Ce sont des copies de numéros prises à la construction du lot. Un numéro peut avoir changé. Renseignez-vous auprès de la source avant de compter sur un numéro.",
  );
}

export function helpDropped(n: number, locale: Locale): string {
  if (n <= 0) return "";
  return t(
    locale,
    `${n} saved ${n === 1 ? "record" : "records"} could not be read and ${n === 1 ? "is" : "are"} not shown.`,
    `${n} ${n === 1 ? "enregistrement n’a pas pu être lu et n’est pas affiché" : "enregistrements n’ont pas pu être lus et ne sont pas affichés"}.`,
  );
}

export function nameOrId(row: HelpRow, locale: Locale): string {
  return row.name?.text ?? t(locale, `Unnamed entry ${row.item.id}`, `Entrée sans nom ${row.item.id}`);
}

export function noNumberNote(locale: Locale): string {
  return t(locale, "No number is saved for this entry.", "Aucun numéro n’est enregistré pour cette entrée.");
}

export function noHowNote(locale: Locale): string {
  return t(locale, "No description is saved for this entry.", "Aucune description n’est enregistrée pour cette entrée.");
}

export function otherLanguageNote(lang: Locale, locale: Locale): string {
  if (lang === locale) return "";
  return lang === "en" ? t(locale, "Shown in English; no French is saved.", "Affiché en anglais\u00a0; aucun français n’est enregistré.") : t(locale, "Shown in French; no English is saved.", "Affiché en français\u00a0; aucun anglais n’est enregistré.");
}

export function saidLine(row: HelpRow, locale: Locale): string {
  if (row.reading === null) return "";
  return t(locale, `Said aloud: ${spokenContact(row.reading, "en")}.`, `À dire à voix haute\u00a0: ${spokenContact(row.reading, "fr")}.`);
}

export function kindLine(row: HelpRow, locale: Locale): string {
  return row.reading === null ? "" : `${kindName(row.reading.kind, locale)}.`;
}

export function pageLine(item: HelpNumber, locale: Locale): string {
  return item.url === null ? "" : t(locale, `Page: ${item.url}`, `Page\u00a0: ${item.url}`);
}

export function helpSourceLine(i: Pick<HelpNumber, "sourceName" | "licence" | "retrievedOn" | "tier">, locale: Locale): string {
  const unknown = "UNKNOWN";
  const date = i.retrievedOn === null ? unknown : formatDate(i.retrievedOn, locale);
  return t(
    locale,
    `Source: ${i.sourceName ?? unknown}. Licence: ${i.licence ?? unknown}. Retrieved ${date}. ${tierLabel(i.tier, locale)}, saved copy.`,
    `Source\u00a0: ${i.sourceName ?? unknown}. Licence\u00a0: ${i.licence ?? unknown}. Consulté le ${date}. ${tierLabel(i.tier, locale)}, copie enregistrée.`,
  );
}

export function helpToolsLabel(open: boolean, locale: Locale): string {
  return open ? t(locale, "Hide search and saving", "Masquer la recherche et l’enregistrement") : t(locale, "Search and save the numbers", "Chercher et enregistrer les numéros");
}

export function helpSearchLabel(locale: Locale): string {
  return t(locale, "Search the help numbers", "Chercher dans les numéros d’aide");
}

export function helpSearchHelp(locale: Locale): string {
  return t(locale, "A name, a word from the description or digits of the number, in English or French.", "Un nom, un mot de la description ou des chiffres du numéro, en français ou en anglais.");
}

export function helpSortLabel(locale: Locale): string {
  return t(locale, "Order", "Ordre");
}

export function helpSortName(sort: "pack" | "name", locale: Locale): string {
  return sort === "pack" ? t(locale, "As saved", "Comme enregistré") : t(locale, "By name", "Par nom");
}

export function helpSaveText(locale: Locale): string {
  return t(locale, "Save as a text file", "Enregistrer en fichier texte");
}

export function helpSaveCsv(locale: Locale): string {
  return t(locale, "Save as a CSV file", "Enregistrer en fichier CSV");
}

export function helpSaveAudit(locale: Locale): string {
  return t(locale, "Save a check for gaps", "Enregistrer un contrôle des lacunes");
}

export function helpSaved(file: string, locale: Locale): string {
  return t(locale, `Saved ${file}.`, `${file} enregistré.`);
}

export function helpSaveFailed(locale: Locale): string {
  return t(locale, "This browser could not make a file here.", "Ce navigateur n’a pas pu créer de fichier ici.");
}
