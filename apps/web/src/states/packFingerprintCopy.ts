/**
 * Words for the pack fingerprint tool, in English and French. A match is reported as "the same
 * saved records, as read" and never as correct, complete or up to date, and a difference never
 * says which device is right.
 */
import type { CodeProblem } from "./packFingerprintCode";
import type { BucketDiff, CompareKind, Comparison } from "./packFingerprintCompare";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const FINGERPRINT_FILENAMES: Readonly<Record<Locale, string>> = { en: "saved-places-fingerprint.txt", fr: "empreinte-lieux-enregistres.txt" };

export const COMPARISON_FILENAMES: Readonly<Record<Locale, string>> = { en: "saved-places-comparison.txt", fr: "comparaison-lieux-enregistres.txt" };
export const comparisonSaveButton = (locale: Locale): string => t(locale, "Save the comparison as a text file", "Enregistrer la comparaison dans un fichier texte");

const places = (n: number, locale: Locale): string => t(locale, `${n} ${n === 1 ? "place" : "places"}`, `${n} ${n === 1 ? "lieu" : "lieux"}`);

export function fingerprintToggle(open: boolean, locale: Locale): string {
  return open
    ? t(locale, "Hide the match check between devices", "Masquer la comparaison entre appareils")
    : t(locale, "Check that another device has the same saved places", "Comparer les lieux enregistrés avec un autre appareil");
}

export function fingerprintIntro(locale: Locale): string {
  return t(
    locale,
    "This makes a short code from the places saved on this device. Copy it to another device and paste it there, or paste a code from another device here. The code holds counts and scrambled values only: no names, notes or addresses.",
    "Cet outil produit un court code à partir des lieux enregistrés sur cet appareil. Copiez-le sur un autre appareil et collez-le là-bas, ou collez ici un code venant d’un autre appareil. Le code ne contient que des nombres et des valeurs brouillées\u00a0: ni noms, ni notes, ni adresses.",
  );
}

export function fingerprintNoPlaces(locale: Locale): string {
  return t(locale, "No places are saved on this device, so there is no code to make.", "Aucun lieu n’est enregistré sur cet appareil\u00a0: il n’y a donc pas de code à produire.");
}

export function fingerprintCountLine(n: number, locale: Locale): string {
  return t(locale, `The code is made from ${places(n, locale)} saved on this device.`, `Le code est produit à partir de ${places(n, locale)} enregistré${n === 1 ? "" : "s"} sur cet appareil.`);
}

export const fingerprintCodeLabel = (locale: Locale): string => t(locale, "Code for this device", "Code de cet appareil");
export const fingerprintButtonsLabel = (locale: Locale): string => t(locale, "Copy or save the code", "Copier ou enregistrer le code");
export const fingerprintCopyButton = (locale: Locale): string => t(locale, "Copy the code", "Copier le code");
export const fingerprintSaveButton = (locale: Locale): string => t(locale, "Save the code as a text file", "Enregistrer le code dans un fichier texte");
export const fingerprintCopied = (locale: Locale): string => t(locale, "Code copied.", "Code copié.");
export const fingerprintCopyFailed = (locale: Locale): string =>
  t(locale, "This browser could not copy. The code is shown above so you can select it.", "Ce navigateur n’a pas pu copier. Le code est affiché ci-dessus pour que vous puissiez le sélectionner.");
export const fingerprintSaved = (name: string, locale: Locale): string => t(locale, `Saved ${name}.`, `Fichier ${name} enregistré.`);
export const fingerprintSaveFailed = (locale: Locale): string => t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
export const fingerprintPasteLabel = (locale: Locale): string => t(locale, "Paste a code from another device", "Collez un code d’un autre appareil");
export const fingerprintPastePlaceholder = "PACKFP v1 n=… ids=… all=…";

export function fingerprintProblem(problem: CodeProblem, token: string | undefined, locale: Locale): string {
  switch (problem) {
    case "empty":
      return t(locale, "Paste a code to compare.", "Collez un code à comparer.");
    case "too-long":
      return t(locale, "That text is too long to be a code from this App. Paste only the code.", "Ce texte est trop long pour être un code de cette application. Collez uniquement le code.");
    case "not-a-code":
      return t(locale, "That is not a code from this App. A code starts with PACKFP.", "Ce n’est pas un code de cette application. Un code commence par PACKFP.");
    case "unsupported-version":
      return t(locale, "This code was made by a different version of the App, so it cannot be compared.", "Ce code a été produit par une autre version de l’application\u00a0: il ne peut pas être comparé.");
    case "incomplete":
      return t(locale, "The code is cut short. Copy all of it, including the last line.", "Le code est tronqué. Copiez-le en entier, y compris la dernière ligne.");
    case "malformed":
      return token ? t(locale, `Part of the code cannot be read (${token}). Copy it again.`, `Une partie du code est illisible (${token}). Copiez-le de nouveau.`) : t(locale, "Part of the code cannot be read. Copy it again.", "Une partie du code est illisible. Copiez-le de nouveau.");
    case "typo":
      return t(locale, "The code has a typo or was changed after it was made, so it is not compared. Copy it again.", "Le code contient une faute de frappe ou a été modifié après sa création\u00a0: il n’est pas comparé. Copiez-le de nouveau.");
  }
}

export function comparisonHeadline(kind: CompareKind, locale: Locale): string {
  switch (kind) {
    case "both-empty":
      return t(locale, "Neither device has saved places, so there is nothing to compare.", "Aucun des deux appareils n’a de lieux enregistrés\u00a0: il n’y a rien à comparer.");
    case "same":
      return t(locale, "Both devices hold the same saved places with the same details, as read.", "Les deux appareils contiennent les mêmes lieux enregistrés avec les mêmes détails, tels qu’ils sont lus.");
    case "same-ids-different-details":
      return t(locale, "Both devices hold the same places, but some details differ.", "Les deux appareils contiennent les mêmes lieux, mais certains détails diffèrent.");
    case "different-places":
      return t(locale, "The two devices hold different saved places.", "Les deux appareils contiennent des lieux enregistrés différents.");
  }
}

export function comparisonCounts(c: Comparison, locale: Locale): string {
  return t(locale, `This device: ${places(c.here, locale)}. The other device: ${places(c.there, locale)}.`, `Cet appareil\u00a0: ${places(c.here, locale)}. L’autre appareil\u00a0: ${places(c.there, locale)}.`);
}

export function comparisonGroups(c: Comparison, locale: Locale): string {
  const n = c.differing.length;
  if (c.kind === "same" || c.kind === "both-empty") return "";
  return t(
    locale,
    `${n} of 16 groups differ: ${c.differing.join(", ")}.`,
    `${n} groupe${n === 1 ? "" : "s"} sur 16 ${n === 1 ? "diffère" : "diffèrent"}\u00a0: ${c.differing.join(", ")}.`,
  );
}

export function groupRowLabel(d: BucketDiff, locale: Locale): string {
  const state = d.differs ? t(locale, "differs", "diffère") : t(locale, "same", "identique");
  return t(locale, `Group ${d.key}: ${d.here} here, ${d.there} there, ${state}`, `Groupe ${d.key}\u00a0: ${d.here} ici, ${d.there} là-bas, ${state}`);
}

export const groupTableCaption = (locale: Locale): string => t(locale, "Groups of places, by id", "Groupes de lieux, selon l’identifiant");
export const groupColumn = (locale: Locale): string => t(locale, "Group", "Groupe");
export const hereColumn = (locale: Locale): string => t(locale, "This device", "Cet appareil");
export const thereColumn = (locale: Locale): string => t(locale, "Other device", "Autre appareil");
export const stateColumn = (locale: Locale): string => t(locale, "Result", "Résultat");
export const stateWord = (differs: boolean, locale: Locale): string => (differs ? t(locale, "Differs", "Diffère") : t(locale, "Same", "Identique"));

export function groupsExplain(locale: Locale): string {
  return t(
    locale,
    "Places are put in 16 groups by their ids, so a group is not an area of the map or a kind of place. It only narrows down where a difference is.",
    "Les lieux sont répartis en 16 groupes selon leurs identifiants\u00a0: un groupe n’est ni un secteur de la carte ni un type de lieu. Il sert seulement à cerner où se trouve une différence.",
  );
}

export function fingerprintLimit(locale: Locale): string {
  return t(
    locale,
    "A match means the saved records are the same on both devices. It does not say they are correct or up to date, and a difference does not say which device is right.",
    "Une correspondance signifie que les enregistrements sont les mêmes sur les deux appareils. Elle ne dit pas qu’ils sont exacts ni à jour, et une différence ne dit pas quel appareil a raison.",
  );
}

export function hereListHeading(n: number, shown: number, locale: Locale): string {
  return shown < n
    ? t(locale, `Places on this device in the groups that differ (first ${shown} of ${n})`, `Lieux de cet appareil dans les groupes qui diffèrent (${shown} premiers sur ${n})`)
    : t(locale, `Places on this device in the groups that differ (${n})`, `Lieux de cet appareil dans les groupes qui diffèrent (${n})`);
}
