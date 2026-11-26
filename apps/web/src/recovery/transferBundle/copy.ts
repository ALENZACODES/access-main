import type { BundleMember, BundleProblemCode } from "./model";

export type BundleLocale = "en" | "fr";

const englishKinds: Record<BundleMember["kind"], string> = {
  receipt: "Handoff receipts",
  witness: "Transfer witness register",
  chain: "Handoff chain",
  reconciliation: "Reconciliation register",
  drill: "Recovery rehearsal log",
  packet: "Recovery evidence packet",
  guided: "Guided recovery review",
  brief: "Recovery support brief",
  refresh: "Source refresh desk",
};

const frenchKinds: typeof englishKinds = {
  receipt: "Reçus de transfert",
  witness: "Registre des transferts",
  chain: "Chaîne de transfert",
  reconciliation: "Registre de rapprochement",
  drill: "Journal de répétition de récupération",
  packet: "Dossier de récupération",
  guided: "Examen guidé de récupération",
  brief: "Fiche de soutien à la récupération",
  refresh: "Suivi des mises à jour des sources",
};

const englishProblems: Record<BundleProblemCode, string> = {
  empty: "This file is empty or contains no exports. Choose a file containing recovery data.",
  "member-count": "This selection exceeds the number of files allowed in one bundle.",
  "member-size": "A file exceeds the size limit for its recovery format.",
  "total-size": "The selected files exceed the combined size limit. Use a second bundle for some files.",
  "bundle-size": "This bundle exceeds the size limit for a transfer file.",
  read: "The file could not be read. Choose it again.",
  encoding: "The file could not be read as UTF-8 text. Choose the original JSON export.",
  "native-format": "Choose a valid JSON export from one of the supported recovery tools.",
  crypto: "The browser could not calculate the file fingerprint. Try opening the App in a secure browser context.",
  duplicate: "The same file contents appear twice. Choose each file only once.",
  envelope: "Choose a recovery transfer bundle with a complete file list.",
  version: "This version of the recovery transfer bundle is unsupported.",
  payload: "The bundle contains unreadable file data. Ask for another copy.",
  integrity: "The file data do not match their recorded details. Ask for another copy.",
};

const frenchProblems: typeof englishProblems = {
  empty: "Ce fichier est vide ou ne contient aucun fichier exporté. Choisissez un fichier contenant des données de récupération.",
  "member-count": "Cette sélection dépasse le nombre de fichiers autorisé par lot.",
  "member-size": "Un fichier dépasse la taille permise pour son format de récupération.",
  "total-size": "Les fichiers sélectionnés dépassent la taille totale permise. Placez certains fichiers dans un deuxième lot.",
  "bundle-size": "Ce lot dépasse la taille permise pour un fichier de transfert.",
  read: "La lecture du fichier a échoué. Choisissez-le de nouveau.",
  encoding: "Impossible de lire le texte du fichier au format UTF-8. Choisissez le fichier JSON exporté à l’origine.",
  "native-format": "Choisissez un fichier JSON valide exporté par un des outils de récupération pris en charge.",
  crypto: "Le navigateur n’a pas pu calculer l’empreinte du fichier. Essayez d’ouvrir l’application dans un contexte sécurisé.",
  duplicate: "Deux fichiers ont le même contenu. Choisissez chaque fichier une seule fois.",
  envelope: "Choisissez un lot de transfert de récupération dont la liste de fichiers est complète.",
  version: "Cette version du lot de transfert de récupération n’est pas prise en charge.",
  payload: "Le lot contient des données de fichier illisibles. Demandez une autre copie.",
  integrity: "Les données des fichiers ne correspondent pas aux renseignements consignés. Demandez une autre copie.",
};

const en = {
  title: "Recovery transfer bundle",
  compose: "Create a bundle",
  inspect: "Open a bundle",
  privacy: "A bundle includes the complete contents of each export, including any notes. Check which files you want to share. The selection is held in memory until you clear it or leave this page.",
  chooseExports: "Add recovery exports",
  allowed: "Supported recovery exports",
  draftList: "Files selected for the bundle",
  saveBundle: "Save bundle",
  clearDraft: "Clear selection",
  cancelAdd: "Cancel adding files",
  chooseBundle: "Choose a transfer bundle",
  openHelp: "Individual files are available to save once every file in the bundle passes its checks. The fingerprint checks compare file contents. They do not establish who supplied a file.",
  openedList: "Files in the opened bundle",
  closeBundle: "Close bundle",
  cancelOpen: "Cancel opening bundle",
  checking: "Checking the files in the bundle…",
  cancelled: "File selection cancelled.",
  cleared: "Selection cleared.",
  closed: "Bundle closed.",
  savedBundle: "Bundle ready to download.",
  saveFailed: "The browser could not start the download. Try saving again.",
  kindLabels: englishKinds,
  problems: englishProblems,
};

const fr: typeof en = {
  title: "Lot de transfert de récupération",
  compose: "Créer un lot",
  inspect: "Ouvrir un lot",
  privacy: "Le lot contient chaque fichier exporté au complet, y compris les notes. Examinez les fichiers que vous souhaitez partager. La sélection reste en mémoire jusqu’à ce que vous l’effaciez ou quittiez cette page.",
  chooseExports: "Ajouter des fichiers de récupération",
  allowed: "Fichiers de récupération pris en charge",
  draftList: "Fichiers sélectionnés pour le lot",
  saveBundle: "Enregistrer le lot",
  clearDraft: "Effacer la sélection",
  cancelAdd: "Annuler l’ajout des fichiers",
  chooseBundle: "Choisir un lot de transfert",
  openHelp: "Vous pouvez enregistrer des copies individuelles dès que tous les fichiers du lot ont passé les contrôles. Les empreintes servent à comparer le contenu des fichiers. Elles ne permettent pas d’identifier la personne qui les a fournis.",
  openedList: "Fichiers du lot ouvert",
  closeBundle: "Fermer le lot",
  cancelOpen: "Annuler l’ouverture du lot",
  checking: "Contrôle des fichiers du lot…",
  cancelled: "Sélection de fichiers annulée.",
  cleared: "Sélection effacée.",
  closed: "Lot fermé.",
  savedBundle: "Le lot est prêt à télécharger.",
  saveFailed: "Le navigateur n’a pas pu lancer le téléchargement. Essayez de nouveau.",
  kindLabels: frenchKinds,
  problems: frenchProblems,
};

export const bundleCopy = { en, fr } as const;

export function formatBundleAmount(locale: BundleLocale, amount: number): string {
  return new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA").format(amount);
}

export function fileSlot(locale: BundleLocale, slot: number): string {
  return locale === "en" ? `File ${slot}` : `Fichier ${slot}`;
}

export function fileAction(locale: BundleLocale, action: "remove" | "save", slot: number): string {
  if (locale === "fr") return action === "remove" ? `Retirer le fichier ${slot}` : `Enregistrer le fichier ${slot}`;
  return action === "remove" ? `Remove file ${slot}` : `Save file ${slot}`;
}

export function fileSize(locale: BundleLocale, bytes: number): string {
  const amount = formatBundleAmount(locale, bytes);
  if (locale === "fr") return `${amount} ${bytes > 1 ? "octets" : "octet"}`;
  return `${amount} ${bytes === 1 ? "byte" : "bytes"}`;
}

export function fileCount(locale: BundleLocale, files: number): string {
  const amount = formatBundleAmount(locale, files);
  if (locale === "fr") return `${amount} ${files > 1 ? "fichiers" : "fichier"}`;
  return `${amount} ${files === 1 ? "file" : "files"}`;
}

export function recordCount(locale: BundleLocale, count: number): string {
  const amount = formatBundleAmount(locale, count);
  if (locale === "fr") return `${amount} ${count > 1 ? "enregistrements" : "enregistrement"}`;
  return `${amount} ${count === 1 ? "record" : "records"}`;
}

export function draftLimits(locale: BundleLocale, files: number, maxBytes: number): string {
  if (locale === "fr") return `Choisissez jusqu’à ${fileCount(locale, files)} JSON, pour un total de ${fileSize(locale, maxBytes)} au maximum. Les fichiers d’une même sélection sont ajoutés ensemble après vérification.`;
  return `Choose up to ${files} JSON files with a combined maximum of ${fileSize(locale, maxBytes)}. Files selected together are added only if they all pass the checks.`;
}
