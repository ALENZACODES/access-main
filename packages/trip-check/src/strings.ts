import type { Lang } from "./types";

export interface UiStrings {
  title: string;
  intro: string;
  yes: string;
  no: string;
  unknown: string;
  draftLabel: string;
  saved: string;
  notChecked: string;
  exportButton: string;
  exportDone: string;
  nothingToExport: string;
  localCount: string;
}

/** `{n}` in localCount is replaced with a real local count. */
export const STRINGS: Record<Lang, UiStrings> = {
  en: {
    title: "Quick checks for this trip",
    intro:
      "One tap per question. Answers stay on this device as unverified drafts until you export a file. Nothing is sent or published.",
    yes: "Yes",
    no: "No",
    unknown: "I could not check",
    draftLabel: "Unverified draft",
    saved: "Saved on this device. Not shared.",
    notChecked: "Not answered",
    exportButton: "Export drafts as a file",
    exportDone: "File created. You choose where to send it.",
    nothingToExport: "No drafts to export yet.",
    localCount: "{n} unverified drafts on this device",
  },
  fr: {
    title: "V\u00e9rifications rapides pour ce trajet",
    intro:
      "Un geste par question. Les r\u00e9ponses restent sur cet appareil comme brouillons non v\u00e9rifi\u00e9s jusqu’\u00e0 l’exportation d’un fichier. Rien n’est envoy\u00e9 ni publi\u00e9.",
    yes: "Oui",
    no: "Non",
    unknown: "Je n’ai pas pu v\u00e9rifier",
    draftLabel: "Brouillon non v\u00e9rifi\u00e9",
    saved: "Enregistr\u00e9 sur cet appareil. Non partag\u00e9.",
    notChecked: "Sans r\u00e9ponse",
    exportButton: "Exporter les brouillons en fichier",
    exportDone: "Fichier cr\u00e9\u00e9. Vous choisissez o\u00f9 l’envoyer.",
    nothingToExport: "Aucun brouillon \u00e0 exporter pour l’instant.",
    localCount: "{n} brouillons non v\u00e9rifi\u00e9s sur cet appareil",
  },
};

export function answerLabel(lang: Lang, a: "yes" | "no" | "UNKNOWN"): string {
  const s = STRINGS[lang];
  return a === "yes" ? s.yes : a === "no" ? s.no : s.unknown;
}
