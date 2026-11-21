// What each downloadable file promises: its name, its type and, for a spreadsheet file, its column headings.
// People open these files in other programs and keep them, so a change to a heading or a name is a change to
// something they depend on. These values are written out in full on purpose: changing one in the App without
// changing it here fails the export audit, and the change then has to be made on purpose. Node only, never shipped.

import type { Locale } from "../panel/copyLint";

export interface CsvContract {
  id: string;
  kind: "csv";
  /** The start of the file name, before the date */
  stem: Readonly<Record<Locale, string>>;
  header: Readonly<Record<Locale, readonly string[]>>;
}

export interface TextContract {
  id: string;
  kind: "text";
  stem: Readonly<Record<Locale, string>>;
  /** The first line of the file, in each language */
  title: Readonly<Record<Locale, string>>;
}

export interface JsonContract {
  id: string;
  kind: "json";
  stem: Readonly<Record<Locale, string>>;
  /** Every top-level key the file has, in order */
  keys: readonly string[];
  format: string;
  version: number;
}

export type ExportContract = CsvContract | TextContract | JsonContract;

/** The delimiter each language's spreadsheet files use. A comma is a decimal mark in French. */
export const DELIMITER: Readonly<Record<Locale, "," | ";">> = { en: ",", fr: ";" };

export const CSV_CONTRACTS: readonly CsvContract[] = [
  {
    id: "inventory",
    kind: "csv",
    stem: { en: "the-app-data-list", fr: "l-app-liste-des-donnees" },
    header: {
      en: ["Item", "Where it is kept", "Why", "How long", "Source", "Date recorded", "Licence", "Stored names"],
      fr: ["Élément", "Où c’est conservé", "Pourquoi", "Durée", "Source", "Date d’enregistrement", "Licence", "Noms conservés"],
    },
  },
  {
    id: "register",
    kind: "csv",
    stem: { en: "the-app-what-is-kept", fr: "l-app-ce-qui-est-conserve" },
    header: {
      en: ["Item", "Needs your choice before saving", "Reached by the erase button", "Source", "Recorded on"],
      fr: ["Élément", "Votre choix est requis avant l’enregistrement", "Touché par le bouton d’effacement", "Source", "Date d’inscription"],
    },
  },
  {
    id: "kept",
    kind: "csv",
    stem: { en: "the-app-everything-kept", fr: "l-app-tout-ce-qui-est-conserve" },
    header: {
      en: ["Item", "Where it is kept", "Needs your choice before saving", "Reached by the erase button", "Removed by the offline storage button", "Source", "Recorded on"],
      fr: ["Élément", "Où c’est conservé", "Votre choix est requis avant l’enregistrement", "Touché par le bouton d’effacement", "Retiré par le bouton du stockage hors ligne", "Source", "Date d’inscription"],
    },
  },
  {
    id: "features",
    kind: "csv",
    stem: { en: "the-app-browser-features", fr: "l-app-fonctions-du-navigateur" },
    header: {
      en: ["Feature", "Used by the App", "Why", "Does your browser ask you first?", "Your browser’s answer", "App header settings", "Source", "Recorded on"],
      fr: ["Fonction", "Utilisé par l’App", "Pourquoi", "Votre navigateur vous le demande-t-il d’abord\u202f?", "Réponse de votre navigateur", "Réglages d’en-tête de l’App", "Source", "Date d’inscription"],
    },
  },
  {
    id: "addresses",
    kind: "csv",
    stem: { en: "the-app-addresses-and-requests", fr: "l-app-adresses-et-requetes" },
    header: {
      en: ["Part", "Address or place", "What it is", "What it is for", "Where it goes", "Places in the code", "Source", "Recorded on"],
      fr: ["Partie", "Adresse ou endroit", "De quoi il s’agit", "À quoi cela sert", "Où cela va", "Endroits dans le code", "Source", "Date d’inscription"],
    },
  },
  {
    id: "glance",
    kind: "csv",
    stem: { en: "the-app-privacy-at-a-glance", fr: "l-app-vie-privee-en-un-coup-d-oeil" },
    header: {
      en: ["Group", "What", "How many", "Not confirmed by the App"],
      fr: ["Groupe", "Quoi", "Combien", "Non confirmé par l’App"],
    },
  },
  {
    id: "retention",
    kind: "csv",
    stem: { en: "the-app-how-long-kept", fr: "l-app-duree-de-conservation" },
    header: {
      en: ["Stored under", "What is kept", "How long", "How much", "Files read", "Recorded on"],
      fr: ["Enregistré sous", "Ce qui est gardé", "Combien de temps", "Quelle quantité", "Fichiers lus", "Date d’inscription"],
    },
  },
];

export const TEXT_CONTRACTS: readonly TextContract[] = [
  {
    id: "inventory",
    kind: "text",
    stem: { en: "the-app-data-list", fr: "l-app-liste-des-donnees" },
    title: { en: "The App: where your data is kept", fr: "L’App\u00a0: où vos données sont conservées" },
  },
  {
    id: "register",
    kind: "text",
    stem: { en: "the-app-what-is-kept", fr: "l-app-ce-qui-est-conserve" },
    title: { en: "What the App keeps on this device", fr: "Ce que l’App conserve sur cet appareil" },
  },
  {
    id: "kept",
    kind: "text",
    stem: { en: "the-app-everything-kept", fr: "l-app-tout-ce-qui-est-conserve" },
    title: { en: "What the App keeps on this device", fr: "Ce que l’App conserve sur cet appareil" },
  },
  {
    id: "features",
    kind: "text",
    stem: { en: "the-app-browser-features", fr: "l-app-fonctions-du-navigateur" },
    title: { en: "What the App asks of your browser", fr: "Ce que l’App demande à votre navigateur" },
  },
  {
    id: "addresses",
    kind: "text",
    stem: { en: "the-app-addresses-and-requests", fr: "l-app-adresses-et-requetes" },
    title: { en: "Web addresses and network requests in the App", fr: "Adresses web et requêtes réseau dans l’App" },
  },
  {
    id: "glance",
    kind: "text",
    stem: { en: "the-app-privacy-at-a-glance", fr: "l-app-vie-privee-en-un-coup-d-oeil" },
    title: { en: "Privacy at a glance", fr: "La vie privée en un coup d’œil" },
  },
  {
    id: "retention",
    kind: "text",
    stem: { en: "the-app-how-long-kept", fr: "l-app-duree-de-conservation" },
    title: { en: "How long the App keeps things", fr: "Combien de temps l’App garde les choses" },
  },
];

export const JSON_CONTRACTS: readonly JsonContract[] = [
  {
    id: "local-data",
    kind: "json",
    stem: { en: "the-app-data", fr: "l-app-donnees" },
    keys: ["format", "version", "exportedAt", "prefix", "items"],
    format: "app-local-data",
    version: 1,
  },
];

export const ALL_CONTRACTS: readonly ExportContract[] = [...CSV_CONTRACTS, ...TEXT_CONTRACTS, ...JSON_CONTRACTS];
