// EN + FR copy for the network section, restoring from a file, the support
// summary and the printable page. Short sentences on purpose: see the
// plain-language audit. FR typography: ’ apostrophe, U+00A0 before ":",
// U+202F before ; ! ? and inside « ».

import type { Locale } from "./copyLint";
import { isSingular } from "./html";
import type { ImportProblemCode } from "./importData";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

export type MoreStatus =
  | { kind: "import-ready"; additions: number; overwrites: number; unchanged: number }
  | { kind: "import-done"; count: number }
  | { kind: "import-problem"; code: ImportProblemCode }
  | { kind: "import-rolled-back" }
  | { kind: "import-stuck"; failed: number }
  | { kind: "import-cancelled" }
  | { kind: "support-prepared" }
  | { kind: "printable-prepared" };

export interface MoreStrings {
  network: {
    heading: string;
    note: string;
    allowedHeading: string;
    self: string;
    noOthers: string;
    blockedHeading: string;
    blockedNote: string;
    noneBlocked: string;
    columns: { host: string; times: string; last: string };
    summary: (requests: number, hosts: number) => string;
  };
  importer: {
    heading: string;
    note: string;
    fileLabel: string;
    confirmButton: string;
    cancelButton: string;
  };
  buttons: { support: string; printable: string };
  support: {
    title: string;
    note: string;
    date: string;
    language: string;
    storedCount: string;
    storedBytes: string;
    names: string;
    none: string;
    consentHeading: string;
    activityCount: string;
    blockedHosts: string;
    entriesInList: string;
    langName: string;
  };
  printable: { title: string; heading: string; generated: (isoDate: string) => string; storedHeading: string; reviewed: (isoDate: string) => string };
  status: (s: MoreStatus) => string;
}

function n(locale: Locale, count: number, one: string, other: string): string {
  return `${count} ${isSingular(locale, count) ? one : other}`;
}

const IMPORT_PROBLEMS_EN: Record<ImportProblemCode, string> = {
  "too-large": "That file is too large. The limit is 1 MB.",
  "not-json": "That file is not a data file from the App.",
  "wrong-format": "That file is not a data file from the App.",
  "wrong-version": "That file was made by a different version, so it cannot be restored.",
  "wrong-prefix": "That file was made for a different App, so it cannot be restored.",
  "bad-items": "The list of items in that file is not valid.",
  "too-many-items": "That file has too many items. The limit is 200.",
  "bad-key": "That file has an item name the App does not use.",
  "value-too-large": "That file has an item that is too large.",
  "nothing-to-restore": "That file has no items to restore.",
};

const IMPORT_PROBLEMS_FR: Record<ImportProblemCode, string> = {
  "too-large": "Ce fichier est trop gros. La limite est de 1 Mo.",
  "not-json": "Ce fichier n’est pas un fichier de données de l’App.",
  "wrong-format": "Ce fichier n’est pas un fichier de données de l’App.",
  "wrong-version": "Ce fichier vient d’une autre version, donc il ne peut pas être restauré.",
  "wrong-prefix": "Ce fichier a été fait pour une autre App, donc il ne peut pas être restauré.",
  "bad-items": "La liste des éléments de ce fichier n’est pas valide.",
  "too-many-items": "Ce fichier contient trop d’éléments. La limite est de 200.",
  "bad-key": "Ce fichier contient un nom d’élément que l’App n’utilise pas.",
  "value-too-large": "Ce fichier contient un élément trop gros.",
  "nothing-to-restore": "Ce fichier ne contient aucun élément à restaurer.",
};

export const MORE_STRINGS: Record<Locale, MoreStrings> = {
  en: {
    network: {
      heading: "Network connections",
      note: "The App contacts only the addresses listed here. A request to any other address is stopped on this device.",
      allowedHeading: "Addresses the App may contact",
      self: "This App (its own address)",
      noOthers: "No other addresses.",
      blockedHeading: "Requests that were stopped",
      blockedNote: "Only the address name is kept, never the path or contents. It is kept up to 30 days.",
      noneBlocked: "No requests have been stopped.",
      columns: { host: "Address", times: "Times", last: "Last time" },
      summary: (r, h) => `${n("en", r, "request was", "requests were")} stopped, to ${n("en", h, "address", "addresses")}.`,
    },
    importer: {
      heading: "Restore from a file",
      note: "Choose a file you saved earlier with “Download my data”. Nothing changes until you confirm.",
      fileLabel: "Choose a data file",
      confirmButton: "Restore these items",
      cancelButton: "Cancel",
    },
    buttons: { support: "Download a support summary", printable: "Download a printable page" },
    support: {
      title: "The App: support summary",
      note: "This file lists names and sizes only. It has no contents of your data.",
      date: "Date",
      language: "Language",
      storedCount: "Items stored",
      storedBytes: "Total size in bytes",
      names: "Stored names",
      none: "None",
      consentHeading: "Optional features",
      activityCount: "Privacy actions listed",
      blockedHosts: "Addresses with stopped requests",
      entriesInList: "Entries in the data list",
      langName: "English",
    },
    printable: {
      title: "The App: your data on this device",
      heading: "Your data on this device",
      generated: (d) => `Page made on ${d}.`,
      storedHeading: "Stored in this browser when this page was made",
      reviewed: (d) => `The list was last reviewed on ${d}.`,
    },
    status: (s) => {
      switch (s.kind) {
        case "import-ready":
          return `Ready to restore. New items: ${s.additions}. Replaced items: ${s.overwrites}. Already the same: ${s.unchanged}.`;
        case "import-done":
          return `Restored: ${n("en", s.count, "item", "items")}.`;
        case "import-problem":
          return IMPORT_PROBLEMS_EN[s.code];
        case "import-rolled-back":
          return "The restore failed, so nothing was changed.";
        case "import-stuck":
          return `The restore failed and ${n("en", s.failed, "item", "items")} could not be put back.`;
        case "import-cancelled":
          return "Restore cancelled. Nothing was changed.";
        case "support-prepared":
          return "Support summary prepared.";
        case "printable-prepared":
          return "Printable page prepared.";
      }
    },
  },
  fr: {
    network: {
      heading: "Connexions réseau",
      note: "L’App contacte seulement les adresses listées ici. Une demande vers toute autre adresse est arrêtée sur cet appareil.",
      allowedHeading: "Adresses que l’App peut contacter",
      self: "Cette App (sa propre adresse)",
      noOthers: "Aucune autre adresse.",
      blockedHeading: "Demandes arrêtées",
      blockedNote: "Seul le nom de l’adresse est gardé, jamais le chemin ni le contenu. Il est gardé jusqu’à 30 jours.",
      noneBlocked: "Aucune demande n’a été arrêtée.",
      columns: { host: "Adresse", times: "Fois", last: "Dernière fois" },
      summary: (r, h) =>
        `${r} ${isSingular("fr", r) ? "demande a été arrêtée" : "demandes ont été arrêtées"}, vers ${n("fr", h, "adresse", "adresses")}.`,
    },
    importer: {
      heading: "Restaurer à partir d’un fichier",
      note: `Choisissez un fichier enregistré plus tôt avec «${NNBSP}Télécharger mes données${NNBSP}». Rien ne change avant votre confirmation.`,
      fileLabel: "Choisir un fichier de données",
      confirmButton: "Restaurer ces éléments",
      cancelButton: "Annuler",
    },
    buttons: { support: "Télécharger un résumé pour l’aide", printable: "Télécharger une page à imprimer" },
    support: {
      title: `L’App${NBSP}: résumé pour l’aide`,
      note: "Ce fichier liste seulement des noms et des tailles. Il ne contient pas vos données.",
      date: "Date",
      language: "Langue",
      storedCount: "Éléments conservés",
      storedBytes: "Taille totale en octets",
      names: "Noms conservés",
      none: "Aucun",
      consentHeading: "Fonctions facultatives",
      activityCount: "Actions de confidentialité listées",
      blockedHosts: "Adresses avec demandes arrêtées",
      entriesInList: "Entrées dans la liste des données",
      langName: "Français",
    },
    printable: {
      title: `L’App${NBSP}: vos données sur cet appareil`,
      heading: "Vos données sur cet appareil",
      generated: (d) => `Page faite le ${d}.`,
      storedHeading: "Conservé dans ce navigateur au moment où cette page a été faite",
      reviewed: (d) => `La liste a été revue le ${d}.`,
    },
    status: (s) => {
      switch (s.kind) {
        case "import-ready":
          return `Prêt à restaurer. Nouveaux${NBSP}: ${s.additions}. Remplacés${NBSP}: ${s.overwrites}. Identiques${NBSP}: ${s.unchanged}.`;
        case "import-done":
          return `Restauration terminée${NBSP}: ${n("fr", s.count, "élément", "éléments")}.`;
        case "import-problem":
          return IMPORT_PROBLEMS_FR[s.code];
        case "import-rolled-back":
          return "La restauration a échoué. Rien n’a été modifié.";
        case "import-stuck":
          return `La restauration a échoué et ${n("fr", s.failed, "élément", "éléments")} n’ont pas pu être remis en place.`;
        case "import-cancelled":
          return "Restauration annulée. Rien n’a été modifié.";
        case "support-prepared":
          return "Résumé pour l’aide préparé.";
        case "printable-prepared":
          return "Page à imprimer préparée.";
      }
    },
  },
};
