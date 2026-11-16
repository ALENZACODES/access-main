// EN + FR copy for the privacy panel. It makes no claim about what the App
// stores: that comes from the inventory the caller passes in.
// FR typography: ’ apostrophe, U+00A0 before ":", U+202F before ; ! ? and inside « ».

import type { Locale } from "./copyLint";
import { isSingular } from "./html";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

export type Status =
  | { kind: "exported"; count: number }
  | { kind: "erased"; count: number }
  | { kind: "erase-partial"; failed: number }
  | { kind: "nothing" }
  | { kind: "unavailable" };

export interface PanelStrings {
  title: string;
  scopeNote: string;
  inventoryCaption: string;
  columns: { item: string; where: string; purpose: string; keptFor: string; source: string };
  unknown: string;
  languageLegend: string;
  exportButton: string;
  eraseButton: string;
  confirmTitle: string;
  confirmBody: string;
  confirmYes: string;
  confirmNo: string;
  status: (s: Status) => string;
}

function count(locale: Locale, n: number, one: string, other: string): string {
  return `${n} ${isSingular(locale, n) ? one : other}`;
}

export const PANEL_STRINGS: Record<Locale, PanelStrings> = {
  en: {
    title: "Your data on this device",
    scopeNote:
      "This covers only what the App stored in this browser. It does not cover data held on a server.",
    inventoryCaption: "What the App keeps, and where",
    columns: {
      item: "Item",
      where: "Where it is kept",
      purpose: "Why",
      keptFor: "How long",
      source: "Source and date",
    },
    unknown: "Not known",
    languageLegend: "Language",
    exportButton: "Download my data",
    eraseButton: "Erase data on this device",
    confirmTitle: "Erase data on this device?",
    confirmBody:
      "This removes what the App stored in this browser. Data sent to a server is not removed by this button.",
    confirmYes: "Yes, erase",
    confirmNo: "Keep my data",
    status: (s) => {
      switch (s.kind) {
        case "exported":
          return `Download prepared: ${count("en", s.count, "item", "items")}.`;
        case "erased":
          return `Erased: ${count("en", s.count, "item", "items")}.`;
        case "erase-partial":
          return `Partly erased: ${count("en", s.failed, "item", "items")} could not be erased.`;
        case "nothing":
          return "Nothing from the App was found on this device.";
        case "unavailable":
          return "This browser does not let the App store data, so there is nothing to download or erase.";
      }
    },
  },
  fr: {
    title: "Vos données sur cet appareil",
    scopeNote:
      "Cela couvre seulement ce que l’App a enregistré dans ce navigateur. Les données conservées sur un serveur ne sont pas incluses.",
    inventoryCaption: "Ce que l’App conserve, et où",
    columns: {
      item: "Élément",
      where: "Où c’est conservé",
      purpose: "Pourquoi",
      keptFor: "Durée",
      source: "Source et date",
    },
    unknown: "Inconnu",
    languageLegend: "Langue",
    exportButton: "Télécharger mes données",
    eraseButton: "Effacer les données de cet appareil",
    confirmTitle: `Effacer les données de cet appareil${NNBSP}?`,
    confirmBody:
      "Cela supprime ce que l’App a enregistré dans ce navigateur. Les données envoyées à un serveur ne sont pas supprimées par ce bouton.",
    confirmYes: "Oui, effacer",
    confirmNo: "Garder mes données",
    status: (s) => {
      switch (s.kind) {
        case "exported":
          return `Téléchargement préparé${NBSP}: ${count("fr", s.count, "élément", "éléments")}.`;
        case "erased":
          return `Effacement terminé${NBSP}: ${count("fr", s.count, "élément", "éléments")}.`;
        case "erase-partial":
          return `Effacement partiel${NBSP}: ${s.failed} ${
            isSingular("fr", s.failed) ? "élément n’a pas pu être effacé" : "éléments n’ont pas pu être effacés"
          }.`;
        case "nothing":
          return "Rien de l’App n’a été trouvé sur cet appareil.";
        case "unavailable":
          return `Ce navigateur ne permet pas à l’App d’enregistrer des données${NBSP}: il n’y a rien à télécharger ni à effacer.`;
      }
    },
  },
};
