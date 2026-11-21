// EN + FR copy for the privacy panel. It makes no claim about what the App
// stores: that comes from the inventory the caller passes in.
// FR typography: ’ apostrophe, U+00A0 before ":", U+202F before ; ! ? and inside « ».

import { workerSummary } from "./autoLive";
import { browserSummary } from "./browserLive";
import { liveSummary } from "./retentionLive";
import { addressSummary } from "./queryLive";
import type { Locale } from "./copyLint";
import { DEVICE_STRINGS, isDeviceStatus, type DeviceStatus } from "./copyDevice";
import { MORE_STRINGS, type MoreStatus } from "./copyMore";
import { isSingular } from "./html";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

export type Status =
  | { kind: "exported"; count: number }
  | { kind: "erased"; count: number }
  | { kind: "erase-partial"; failed: number }
  | { kind: "nothing" }
  | { kind: "unavailable" }
  | { kind: "consent-saved"; value: "granted" | "declined"; label: string }
  | { kind: "consent-withdrawn"; label: string; removed: number }
  | { kind: "save-failed" }
  | { kind: "expired-removed"; count: number }
  | { kind: "list-exported"; format: "csv" | "text" }
  | { kind: "kept-exported"; format: "csv" | "text" }
  | { kind: "features-exported"; format: "csv" | "text" }
  | { kind: "addresses-exported"; format: "csv" | "text" }
  | { kind: "glance-exported"; format: "csv" | "text" }
  | { kind: "receipt-exported"; format: "csv" | "text" }
  | { kind: "handoff-exported"; format: "csv" | "text" }
  | { kind: "retention-exported"; format: "csv" | "text" }
  | { kind: "browser-exported"; format: "csv" | "text" }
  | { kind: "browser-checked"; answered: number; asked: number }
  | { kind: "retention-checked"; compared: number; differences: number }
  | { kind: "query-exported"; format: "csv" | "text" }
  | { kind: "query-checked"; params: number; findings: number }
  | { kind: "query-unreadable" }
  | { kind: "auto-exported"; format: "csv" | "text" }
  | { kind: "workers-checked"; registered: number | null; differences: number }
  | { kind: "picks-exported"; format: "csv" | "text" }
  | { kind: "statements-exported"; format: "csv" | "text" }
  | { kind: "seen-saved" }
  | MoreStatus
  | DeviceStatus;

export interface ConsentStrings {
  heading: string;
  note: string;
  allow: string;
  decline: string;
  granted: (isoDate: string) => string;
  declined: (isoDate: string) => string;
  unknown: string;
  stale: string;
  ariaAllow: (label: string) => string;
  ariaDecline: (label: string) => string;
}

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
  consent: ConsentStrings;
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
    consent: {
      heading: "Optional features",
      note: "Each choice applies only on this device. You can change it at any time.",
      allow: "Allow",
      decline: "Do not allow",
      granted: (d) => `Allowed since ${d}`,
      declined: (d) => `Not allowed since ${d}`,
      unknown: "Not decided yet",
      stale: "The wording changed. Please decide again.",
      ariaAllow: (l) => `Allow: ${l}`,
      ariaDecline: (l) => `Do not allow: ${l}`,
    },
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
        case "consent-saved":
          return `Saved: ${s.value === "granted" ? "allowed" : "not allowed"} for “${s.label}”.`;
        case "consent-withdrawn":
          return `Saved: not allowed for “${s.label}”. Removed from this device: ${count("en", s.removed, "item", "items")}.`;
        case "save-failed":
          return "Your choice could not be saved on this device. It will be lost when this page closes.";
        case "expired-removed":
          return `Expired items removed from this device: ${s.count}.`;
        case "list-exported":
          return `Data list prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "kept-exported":
          return `List of everything the App keeps on this device prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "features-exported":
          return `List of what the App asks of your browser prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "addresses-exported":
          return `List of web addresses and network requests prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "glance-exported":
          return `Privacy counts prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "receipt-exported":
          return `Record of your choices prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "handoff-exported":
          return `List of links that open another app prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "query-checked":
          return addressSummary("en", s.params, s.findings);
        case "query-unreadable":
          return "The address of this page could not be read, so nothing was examined.";
        case "query-exported":
          return `List of what a web address can carry prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "retention-checked":
          return liveSummary("en", s.compared, s.differences);
        case "workers-checked":
          return workerSummary("en", s.registered, s.differences);
        case "auto-exported":
          return `List of what the App does on its own prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "picks-exported":
          return `List of files the App reads when you choose them prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "browser-checked":
          return browserSummary("en", s.answered, s.asked);
        case "browser-exported":
          return `List of what the App asks your browser prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "retention-exported":
          return `List of how long the App keeps things prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "statements-exported":
          return `List of what the App says about your data prepared as ${s.format === "csv" ? "CSV" : "text"}.`;
        case "seen-saved":
          return "The list is marked as seen.";
        default:
          return isDeviceStatus(s) ? DEVICE_STRINGS.en.status(s) : MORE_STRINGS.en.status(s);
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
    consent: {
      heading: "Fonctions facultatives",
      note: "Chaque choix s’applique seulement sur cet appareil. Vous pouvez le modifier en tout temps.",
      allow: "Autoriser",
      decline: "Ne pas autoriser",
      granted: (d) => `Autorisé depuis le ${d}`,
      declined: (d) => `Refusé depuis le ${d}`,
      unknown: "Pas encore décidé",
      stale: "Le texte a changé. Veuillez décider de nouveau.",
      ariaAllow: (l) => `Autoriser${NBSP}: ${l}`,
      ariaDecline: (l) => `Ne pas autoriser${NBSP}: ${l}`,
    },
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
        case "consent-saved":
          return `Enregistré${NBSP}: ${s.value === "granted" ? "autorisation accordée" : "autorisation refusée"} pour «${NNBSP}${s.label}${NNBSP}».`;
        case "consent-withdrawn":
          return `Enregistré${NBSP}: autorisation refusée pour «${NNBSP}${s.label}${NNBSP}». Retiré de cet appareil${NBSP}: ${count("fr", s.removed, "élément", "éléments")}.`;
        case "save-failed":
          return "Votre choix n’a pas pu être enregistré sur cet appareil. Il sera perdu à la fermeture de cette page.";
        case "expired-removed":
          return `Éléments expirés retirés de cet appareil${NBSP}: ${s.count}.`;
        case "list-exported":
          return `Liste des données préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "kept-exported":
          return `Liste de tout ce que l’App conserve sur cet appareil préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "features-exported":
          return `Liste de ce que l’App demande à votre navigateur préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "addresses-exported":
          return `Liste des adresses web et des requêtes réseau préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "glance-exported":
          return `Chiffres sur la vie privée préparés ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "receipt-exported":
          return `Registre de vos choix préparé ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "handoff-exported":
          return `Liste des liens qui ouvrent une autre application préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "query-checked":
          return addressSummary("fr", s.params, s.findings);
        case "query-unreadable":
          return "L’adresse de cette page n’a pas pu être lue, donc rien n’a été examiné.";
        case "query-exported":
          return `Liste de ce qu’une adresse web peut contenir préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "retention-checked":
          return liveSummary("fr", s.compared, s.differences);
        case "workers-checked":
          return workerSummary("fr", s.registered, s.differences);
        case "auto-exported":
          return `Liste de ce que l’App fait d’elle-même préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "picks-exported":
          return `Liste des fichiers que l’App lit quand vous les choisissez préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "browser-checked":
          return browserSummary("fr", s.answered, s.asked);
        case "browser-exported":
          return `Liste de ce que l’App demande au navigateur préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "retention-exported":
          return `Liste de la durée de conservation de l’App préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "statements-exported":
          return `Liste de ce que l’App dit de vos données préparée ${s.format === "csv" ? "au format CSV" : "en texte"}.`;
        case "seen-saved":
          return "La liste est marquée comme vue.";
        default:
          return isDeviceStatus(s) ? DEVICE_STRINGS.fr.status(s) : MORE_STRINGS.fr.status(s);
      }
    },
  },
};
