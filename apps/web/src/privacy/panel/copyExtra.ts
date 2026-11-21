// EN + FR copy for the activity log, the stored-items table, the change list and
// the data list downloads. FR typography: ’ apostrophe, U+00A0 before ":" and
// before units, U+202F before ; ! ? and inside « ».

import type { ActivityEntry } from "./activityLog";
import type { Locale } from "./copyLint";
import { isSingular } from "./html";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

export interface ExtraStrings {
  activity: { heading: string; note: string; empty: string };
  stored: {
    heading: string;
    note: string;
    columns: { name: string; size: string; expires: string; described: string };
    unlisted: string;
    noExpiry: string;
    empty: string;
    unmatchable: string;
  };
  changes: {
    heading: string;
    firstView: string;
    none: (isoDate: string) => string;
    since: (isoDate: string) => string;
    added: string;
    changed: string;
    removed: string;
    markSeen: string;
  };
  list: { csvButton: string; textButton: string; title: string; storedNames: string; keptCsvButton: string; keptTextButton: string };
  csvHeader: string[];
}

export const EXTRA_STRINGS: Record<Locale, ExtraStrings> = {
  en: {
    activity: {
      heading: "Recent privacy actions",
      note: "Kept on this device for up to 90 days after the latest action. Erasing local data removes this list too.",
      empty: "No actions are listed.",
    },
    stored: {
      heading: "Stored on this device right now",
      note: "Only names and sizes are shown, never the contents.",
      columns: { name: "Name", size: "Size", expires: "Expires", described: "Described above" },
      unlisted: "Not in the list above",
      noExpiry: "No expiry date recorded",
      empty: "No items from the App are stored in this browser.",
      unmatchable: "Some items in the list above do not say which stored name they use, so they cannot be matched here.",
    },
    changes: {
      heading: "Changes to the data list",
      firstView: "This is the first time the list is shown on this device. Changes will be listed from now on.",
      none: (d) => `No changes since you marked the list as seen on ${d}.`,
      since: (d) => `Since you marked the list as seen on ${d}:`,
      added: "Added",
      changed: "Changed",
      removed: "Removed",
      markSeen: "Mark the list as seen",
    },
    list: {
      csvButton: "Download the data list (CSV)",
      textButton: "Download the data list (text)",
      title: "The App: where your data is kept",
      storedNames: "Stored names",
      keptCsvButton: "Download everything kept on this device (CSV)",
      keptTextButton: "Download everything kept on this device (text)",
    },
    csvHeader: ["Item", "Where it is kept", "Why", "How long", "Source", "Date recorded", "Licence", "Stored names"],
  },
  fr: {
    activity: {
      heading: "Actions récentes de confidentialité",
      note: "Conservées sur cet appareil jusqu’à 90 jours après la dernière action. L’effacement des données locales supprime aussi cette liste.",
      empty: "Aucune action n’est listée.",
    },
    stored: {
      heading: "Conservé sur cet appareil en ce moment",
      note: "Seuls les noms et les tailles sont affichés, jamais le contenu.",
      columns: { name: "Nom", size: "Taille", expires: "Expire", described: "Décrit plus haut" },
      unlisted: "Absent de la liste plus haut",
      noExpiry: "Aucune date d’expiration enregistrée",
      empty: "Aucun élément de l’App n’est conservé dans ce navigateur.",
      unmatchable:
        "Certains éléments de la liste plus haut n’indiquent pas quel nom conservé ils utilisent, donc ils ne peuvent pas être associés ici.",
    },
    changes: {
      heading: "Changements de la liste des données",
      firstView: "C’est la première fois que la liste s’affiche sur cet appareil. Les changements seront listés à partir de maintenant.",
      none: (d) => `Aucun changement depuis que vous avez marqué la liste comme vue le ${d}.`,
      since: (d) => `Depuis que vous avez marqué la liste comme vue le ${d}${NBSP}:`,
      added: "Ajouté",
      changed: "Modifié",
      removed: "Retiré",
      markSeen: "Marquer la liste comme vue",
    },
    list: {
      csvButton: "Télécharger la liste des données (CSV)",
      textButton: "Télécharger la liste des données (texte)",
      title: `L’App${NBSP}: où vos données sont conservées`,
      storedNames: "Noms conservés",
      keptCsvButton: "Télécharger tout ce qui est conservé sur cet appareil (CSV)",
      keptTextButton: "Télécharger tout ce qui est conservé sur cet appareil (texte)",
    },
    csvHeader: ["Élément", "Où c’est conservé", "Pourquoi", "Durée", "Source", "Date d’enregistrement", "Licence", "Noms conservés"],
  },
};

function n(locale: Locale, count: number, one: string, other: string): string {
  return `${count} ${isSingular(locale, count) ? one : other}`;
}

/** Decimal units: 1 kB = 1000 bytes. French uses o, ko, Mo and a decimal comma. */
export function formatBytes(locale: Locale, bytes: number): string {
  const unit = (v: number, u: string): string => {
    const t = (Math.round(v * 10) / 10).toFixed(1);
    return `${locale === "fr" ? t.replace(".", ",") : t}${locale === "fr" ? NBSP : " "}${u}`;
  };
  if (bytes < 1000) return `${bytes}${locale === "fr" ? NBSP : " "}${locale === "fr" ? "o" : "B"}`;
  if (bytes < 1_000_000) return unit(bytes / 1000, locale === "fr" ? "ko" : "kB");
  return unit(bytes / 1_000_000, locale === "fr" ? "Mo" : "MB");
}

export function storedSummary(
  locale: Locale,
  s: { count: number; bytes: number; undocumented: number },
): string {
  if (locale === "fr") {
    const base = `${n("fr", s.count, "élément", "éléments")}, ${formatBytes("fr", s.bytes)} au total.`;
    return s.undocumented > 0 ? `${base} Non décrits dans la liste plus haut${NBSP}: ${s.undocumented}.` : base;
  }
  const base = `${n("en", s.count, "item", "items")}, ${formatBytes("en", s.bytes)} in total.`;
  return s.undocumented > 0 ? `${base} Not described in the list above: ${s.undocumented}.` : base;
}

/** One line for the activity list. `labelOf` turns a purpose id into its label in the page language. */
export function activityText(
  locale: Locale,
  e: ActivityEntry,
  labelOf: (purposeId: string) => string | undefined,
): string {
  const label = (): string => (e.purposeId === undefined ? "" : (labelOf(e.purposeId) ?? e.purposeId));
  const count = e.count ?? 0;
  if (locale === "fr") {
    switch (e.kind) {
      case "export":
        return `Téléchargement de mes données${NBSP}: ${n("fr", count, "élément", "éléments")}`;
      case "list-export":
        return `Liste des données téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "kept-export":
        return `Liste de tout ce qui est conservé téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "statements-export":
        return `Liste de ce que l’App dit des données téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "handoff-export":
        return `Liste des liens vers d’autres applications téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "picks-export":
        return `Liste des fichiers que l’App lit quand vous les choisissez téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "browser-export":
        return `Liste de ce que l’App demande au navigateur téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "save-export":
        return `Liste des endroits où l’App fabrique des fichiers à enregistrer téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "query-export":
        return `Liste de ce qu’une adresse web peut contenir téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "auto-export":
        return `Liste de ce que l’App fait d’elle-même téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "retention-export":
        return `Liste de la durée de conservation téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "receipt-export":
        return `Registre de vos choix téléchargé (${e.format === "csv" ? "CSV" : "texte"})`;
      case "glance-export":
        return `Chiffres sur la vie privée téléchargés (${e.format === "csv" ? "CSV" : "texte"})`;
      case "addresses-export":
        return `Liste des adresses et requêtes réseau téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "features-export":
        return `Liste des fonctions du navigateur téléchargée (${e.format === "csv" ? "CSV" : "texte"})`;
      case "consent-granted":
        return `Autorisé${NBSP}: «${NNBSP}${label()}${NNBSP}»`;
      case "consent-declined":
        return `Non autorisé${NBSP}: «${NNBSP}${label()}${NNBSP}»`;
      case "language":
        return `Langue changée${NBSP}: ${e.lang === "fr" ? "français" : "anglais"}`;
      case "expired-removed":
        return `Éléments expirés retirés${NBSP}: ${count}`;
      case "import":
        return `Restauration à partir d’un fichier${NBSP}: ${n("fr", count, "élément", "éléments")}`;
      case "support-export":
        return "Résumé pour l’aide téléchargé";
      case "printable-export":
        return "Page à imprimer téléchargée";
      case "protected-export":
        return `Copie protégée téléchargée${NBSP}: ${n("fr", count, "élément", "éléments")}`;
      case "protected-import":
        return "Copie protégée ouverte";
      case "device-clear":
        return `Stockage hors ligne retiré${NBSP}: ${count}`;
    }
  }
  switch (e.kind) {
    case "export":
      return `Downloaded my data: ${n("en", count, "item", "items")}`;
    case "list-export":
      return `Downloaded the data list (${e.format === "csv" ? "CSV" : "text"})`;
    case "kept-export":
      return `Downloaded the list of everything kept (${e.format === "csv" ? "CSV" : "text"})`;
    case "statements-export":
      return `Downloaded the list of what the App says about data (${e.format === "csv" ? "CSV" : "text"})`;
    case "handoff-export":
      return `Downloaded the list of links to other apps (${e.format === "csv" ? "CSV" : "text"})`;
    case "picks-export":
      return `Downloaded the list of files the App reads when you choose them (${e.format === "csv" ? "CSV" : "text"})`;
    case "browser-export":
      return `Downloaded the list of what the App asks your browser (${e.format === "csv" ? "CSV" : "text"})`;
    case "save-export":
      return `Downloaded the list of where the App makes files for you to save (${e.format === "csv" ? "CSV" : "text"})`;
    case "query-export":
      return `Downloaded the list of what a web address can carry (${e.format === "csv" ? "CSV" : "text"})`;
    case "auto-export":
      return `Downloaded the list of what the App does on its own (${e.format === "csv" ? "CSV" : "text"})`;
    case "retention-export":
      return `Downloaded the list of how long the App keeps things (${e.format === "csv" ? "CSV" : "text"})`;
    case "receipt-export":
      return `Downloaded the record of your choices (${e.format === "csv" ? "CSV" : "text"})`;
    case "glance-export":
      return `Downloaded the privacy counts (${e.format === "csv" ? "CSV" : "text"})`;
    case "addresses-export":
      return `Downloaded the list of addresses and network requests (${e.format === "csv" ? "CSV" : "text"})`;
    case "features-export":
      return `Downloaded the list of browser features (${e.format === "csv" ? "CSV" : "text"})`;
    case "consent-granted":
      return `Allowed: “${label()}”`;
    case "consent-declined":
      return `Did not allow: “${label()}”`;
    case "language":
      return `Changed language to ${e.lang === "fr" ? "French" : "English"}`;
    case "expired-removed":
      return `Removed expired items: ${count}`;
    case "import":
      return `Restored from a file: ${n("en", count, "item", "items")}`;
    case "support-export":
      return "Downloaded a support summary";
    case "printable-export":
      return "Downloaded a printable page";
    case "protected-export":
      return `Downloaded a protected copy: ${n("en", count, "item", "items")}`;
    case "protected-import":
      return "Opened a protected copy";
    case "device-clear":
      return `Removed offline storage: ${count}`;
  }
}
