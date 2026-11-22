/**
 * Wording for the "language of the names" section. It says what words it found and never says what language a
 * name is in: a name made of a person's name, a brand or a town points to no language.
 */
import type { AddressReading, NameAddressMatch } from "./addressLanguage";
import type { NameFilter, NameLanguageReport, NameOrder } from "./nameLanguageReport";
import type { NameLanguage, NameReading } from "./nameLanguage";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const q = (s: string, l: Locale) => (l === "fr" ? `«\u00a0${s}\u00a0»` : `“${s}”`);
const list = (words: readonly string[], l: Locale) => words.map((w) => q(w, l)).join(l === "fr" ? ", " : ", ");

export const nlHeading = (l: Locale) => t(l, "Language of the names", "Langue des noms");
export const nlToggle = (open: boolean, l: Locale) => (open ? t(l, "Hide the language of the names", "Masquer la langue des noms") : t(l, "Look at the language of the names", "Examiner la langue des noms"));
export const nlIntro = (l: Locale) =>
  t(
    l,
    "Each name is checked for everyday words that point to French or to English, such as “rue” or “library”. It is a guess from common words. A name made of a person’s name, a brand or a town points to no language.",
    "Chaque nom est examiné à la recherche de mots courants qui évoquent le français ou l’anglais, comme «\u00a0rue\u00a0» ou «\u00a0library\u00a0». C’est une supposition fondée sur des mots courants. Un nom fait d’un nom de personne, d’une marque ou d’une ville n’évoque aucune langue.",
  );
export const nlCoverage = (named: number, unnamed: number, l: Locale) =>
  t(
    l,
    `${named} ${plural(named, "place has", "places have")} a name to read${unnamed > 0 ? `; ${unnamed} ${plural(unnamed, "has", "have")} none` : ""}.`,
    `${named} lieu${named > 1 ? "x ont" : " a"} un nom à lire${unnamed > 0 ? `\u00a0; ${unnamed} n’en ${unnamed > 1 ? "ont" : "a"} aucun` : ""}.`,
  );
export const nlReadingLabel = (r: NameReading, l: Locale): string => {
  switch (r) {
    case "french": return t(l, "Words that point to French", "Mots qui évoquent le français");
    case "english": return t(l, "Words that point to English", "Mots qui évoquent l’anglais");
    case "both": return t(l, "Words from both languages", "Mots des deux langues");
    case "neither": return t(l, "No words that point to a language", "Aucun mot qui évoque une langue");
    case "other-script": return t(l, "Written in another alphabet", "Écrit dans un autre alphabet");
    case "no-name": return t(l, "No name in the pack", "Aucun nom dans le pack");
  }
};
export const nlTallyLine = (r: NameReading, n: number, pct: number | null, l: Locale) =>
  t(l, `${nlReadingLabel(r, "en")}: ${n}${pct === null ? "" : ` (${pct}%)`}`, `${nlReadingLabel(r, "fr")} : ${n}${pct === null ? "" : ` (${pct}\u00a0%)`}`);
export const nlFilterGroup = (l: Locale) => t(l, "Show", "Afficher");
export const nlOrderGroup = (l: Locale) => t(l, "Order", "Ordre");
export const nlFilterLabel = (f: NameFilter, l: Locale): string => {
  if (f === "all") return t(l, "All named places", "Tous les lieux nommés");
  if (f === "pairs") return t(l, "A French half and an English half", "Une moitié française et une moitié anglaise");
  if (f === "differs") return t(l, "Name and address point to different languages", "Le nom et l’adresse évoquent des langues différentes");
  if (f === "accented") return t(l, "A French accent and no word that points to a language", "Un accent français et aucun mot qui évoque une langue");
  return nlReadingLabel(f, l);
};
export const nlOrderLabel = (o: NameOrder, l: Locale) => (o === "pack" ? t(l, "As in the pack", "Comme dans le pack") : o === "name" ? t(l, "By name", "Par nom") : t(l, "By what the words point to", "Selon ce qu’évoquent les mots"));
export const nlSummary = (r: Pick<NameLanguageReport, "named" | "byReading">, l: Locale) => {
  const fr = r.byReading.french;
  const en = r.byReading.english;
  const both = r.byReading.both;
  if (r.named === 0) return t(l, "No place has a name to read.", "Aucun lieu n’a de nom à lire.");
  return t(
    l,
    `${fr} ${plural(fr, "name has", "names have")} words that point to French, ${en} to English and ${both} to both.`,
    `${fr} nom${fr > 1 ? "s ont" : " a"} des mots qui évoquent le français, ${en} l’anglais et ${both} les deux.`,
  );
};
export const nlAccentLine = (n: number, l: Locale) =>
  n === 0 ? "" : t(l, `${n} ${plural(n, "name has", "names have")} a French accent but no word that points to a language.`, `${n} nom${n > 1 ? "s ont" : " a"} un accent français mais aucun mot qui évoque une langue.`);
export const nlPairLine = (n: number, l: Locale) =>
  n === 0 ? "" : t(l, `${n} ${plural(n, "name gives", "names give")} a French half and an English half, as in “Bibliothèque / Library”.`, `${n} nom${n > 1 ? "s donnent" : " donne"} une moitié française et une moitié anglaise, comme dans «\u00a0Bibliothèque / Library\u00a0».`);
export const nlDiffersLine = (n: number, l: Locale) =>
  n === 0 ? "" : t(l, `${n} ${plural(n, "place has", "places have")} a name and an address that point to different languages.`, `${n} lieu${n > 1 ? "x ont" : " a"} un nom et une adresse qui évoquent des langues différentes.`);
export const nlAddressReadingLabel = (r: AddressReading, l: Locale): string => {
  switch (r) {
    case "french": return t(l, "Street words that point to French", "Mots de rue qui évoquent le français");
    case "english": return t(l, "Street words that point to English", "Mots de rue qui évoquent l’anglais");
    case "both": return t(l, "Street words from both languages", "Mots de rue des deux langues");
    case "neither": return t(l, "No street words that point to a language", "Aucun mot de rue qui évoque une langue");
    case "no-address": return t(l, "No address in the pack", "Aucune adresse dans le pack");
  }
};
export const nlMatchLabel = (m: NameAddressMatch, l: Locale): string => {
  switch (m) {
    case "same": return t(l, "Name and address share a language", "Le nom et l’adresse ont une langue en commun");
    case "differs": return t(l, "Name and address point to different languages", "Le nom et l’adresse évoquent des langues différentes");
    case "one-side": return t(l, "Only one of them points to a language", "Un seul des deux évoque une langue");
    case "neither": return t(l, "Neither points to a language", "Aucun des deux n’évoque une langue");
    case "missing": return t(l, "The name or the address is not in the pack", "Le nom ou l’adresse est absent du pack");
  }
};
export const nlKindsLine = (kinds: readonly { kind: string; count: number }[], l: Locale) =>
  kinds.length === 0 ? "" : t(l, `Most often: ${kinds.map((k) => `${k.kind} (${k.count})`).join(", ")}.`, `Le plus souvent: ${kinds.map((k) => `${k.kind} (${k.count})`).join(", ")}.`);
export const nlAddressLine = (r: AddressReading, address: string | null, l: Locale) => (address === null ? nlAddressReadingLabel("no-address", l) : `${address}${t(l, " — ", " — ")}${nlAddressReadingLabel(r, l)}`);
export const nlKindTableHeading = (l: Locale) => t(l, "Kinds of place and what their names point to", "Genres de lieu et ce qu’évoquent leurs noms");
export const nlKindColumn = (c: "kind" | "total" | "differs", l: Locale) => (c === "kind" ? t(l, "Kind", "Genre") : c === "total" ? t(l, "Named places", "Lieux nommés") : t(l, "Name and address differ", "Nom et adresse différents"));
export const nlKindColumnShort = (r: NameReading, l: Locale): string => {
  switch (r) {
    case "french": return t(l, "French", "Français");
    case "english": return t(l, "English", "Anglais");
    case "both": return t(l, "Both", "Les deux");
    case "neither": return t(l, "Neither", "Aucune");
    case "other-script": return t(l, "Other alphabet", "Autre alphabet");
    case "no-name": return t(l, "No name", "Sans nom");
  }
};
export const nlKindsMore = (n: number, l: Locale) => (n === 0 ? "" : t(l, `${n} more ${plural(n, "kind is", "kinds are")} in the saved file.`, `${n} autre${n > 1 ? "s" : ""} genre${n > 1 ? "s figurent" : " figure"} dans le fichier enregistré.`));
export const nlSaveKinds = (l: Locale) => t(l, "Save the kinds as a CSV file", "Enregistrer les genres en fichier CSV");
export const NL_KINDS_CSV_NAME: Readonly<Record<Locale, string>> = { en: "language-of-names-by-kind.csv", fr: "langue-des-noms-par-genre.csv" };
export const nlNoName = (l: Locale) => t(l, "Name not in the pack", "Nom absent du pack");
export const nlNoMatch = (l: Locale) => t(l, "No place matches that choice.", "Aucun lieu ne correspond à ce choix.");
export const nlRowLine = (lang: NameLanguage, l: Locale): string => {
  if (lang.french.length === 0 && lang.english.length === 0) return `${nlReadingLabel(lang.reading, l)}.`;
  const join = (en: string[], fr: string[]) => t(l, en.join(lang.pair ? "; a pair: " : "; ") + ".", fr.join(lang.pair ? "; une paire: " : "; ") + ".");
  const en: string[] = [];
  const fr: string[] = [];
  if (lang.french.length > 0) {
    en.push(`French: ${list(lang.french, "en")}`);
    fr.push(`Français: ${list(lang.french, "fr")}`);
  }
  if (lang.english.length > 0) {
    en.push(`English: ${list(lang.english, "en")}`);
    fr.push(`Anglais: ${list(lang.english, "fr")}`);
  }
  return join(en, fr);
};
export const nlMoreLine = (n: number, l: Locale) => t(l, `${n} more ${plural(n, "place is", "places are")} in the saved files.`, `${n} autre${n > 1 ? "s" : ""} lieu${n > 1 ? "x figurent" : " figure"} dans les fichiers enregistrés.`);
export const nlCaveat = (l: Locale) => t(l, "A guess from common words, not a statement of the language of a name. The names are shown as the pack gives them and nothing is changed.", "Une supposition fondée sur des mots courants, pas une affirmation sur la langue d’un nom. Les noms sont montrés tels que le pack les donne et rien n’est modifié.");
export const nlSaveText = (l: Locale) => t(l, "Save as a text file", "Enregistrer en fichier texte");
export const nlSaveCsv = (l: Locale) => t(l, "Save as a CSV file", "Enregistrer en fichier CSV");
export const nlSavedLine = (name: string, l: Locale) => t(l, `Saved ${name}.`, `Fichier ${name} enregistré.`);
export const nlCannotSave = (l: Locale) => t(l, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
export const NL_TEXT_NAME: Readonly<Record<Locale, string>> = { en: "language-of-names.txt", fr: "langue-des-noms.txt" };
export const NL_CSV_NAME: Readonly<Record<Locale, string>> = { en: "language-of-names.csv", fr: "langue-des-noms.csv" };
export const NL_CSV_HEADER = ["place_id", "place_name", "kind", "reads_as", "french_words", "english_words", "french_accents", "pair", "address_reads_as", "name_and_address"] as const;
