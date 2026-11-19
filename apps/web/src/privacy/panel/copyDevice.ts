// EN + FR copy for browser signals, offline storage and protected copies.
// Short sentences on purpose: see the plain-language audit.
// FR typography: ’ apostrophe, U+00A0 before ":", U+202F before ; ! ? and inside « ».

import { formatBytes } from "./copyExtra";
import type { Locale } from "./copyLint";
import { isSingular } from "./html";
import type { OpenProblem, PassphraseProblem } from "./protectedBackup";
import type { Tri } from "./signals";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

export type ProtectedProblem = PassphraseProblem | OpenProblem | "mismatch";

export type DeviceStatus =
  | { kind: "scan-done" }
  | { kind: "device-cleared"; caches: number; databases: number }
  | { kind: "device-clear-partial"; failed: number }
  | { kind: "device-nothing" }
  | { kind: "protected-prepared"; count: number }
  | { kind: "protected-problem"; code: ProtectedProblem };

const KINDS: ReadonlySet<string> = new Set(["scan-done", "device-cleared", "device-clear-partial", "device-nothing", "protected-prepared", "protected-problem"]);
export const isDeviceStatus = (s: { kind: string }): s is DeviceStatus => KINDS.has(s.kind);

export interface DeviceStrings {
  signals: {
    heading: string;
    note: string;
    columns: { signal: string; value: string };
    rows: { gpc: string; dnt: string; cookies: string; secure: string; persistent: string };
    value: Record<Tri, string>;
    usage: (usedBytes: number | null, quotaBytes: number | null) => string;
  };
  device: {
    heading: string;
    note: string;
    scanButton: string;
    notChecked: string;
    checkedAt: (iso: string) => string;
    cachesHeading: string;
    databasesHeading: string;
    cookiesHeading: string;
    none: string;
    unknown: string;
    clearButton: string;
    confirmTitle: string;
    confirmBody: (caches: number, databases: number) => string;
    confirmYes: string;
    confirmNo: string;
    nothingToClear: string;
  };
  copy: {
    heading: string;
    note: string;
    hint: string;
    passLabel: string;
    confirmLabel: string;
    exportButton: string;
    fileLabel: string;
  };
  status: (s: DeviceStatus) => string;
}

const n = (l: Locale, c: number, one: string, other: string): string => `${c} ${isSingular(l, c) ? one : other}`;

const PROBLEMS_EN: Record<ProtectedProblem, string> = {
  empty: "Type a passphrase first.",
  "too-short": "The passphrase needs at least 10 characters.",
  repeated: "The passphrase repeats one character. Choose a different one.",
  common: "That passphrase is too common. Choose a different one.",
  mismatch: "The two passphrases do not match.",
  "not-json": "That file is not a protected copy from the App.",
  "wrong-format": "That file is not a protected copy from the App.",
  "wrong-version": "That file was made by a different version, so it cannot be opened.",
  "bad-fields": "That file is damaged.",
  "wrong-prefix": "That file was made for a different App.",
  "too-large": "That file is too large. The limit is 1 MB.",
  "cannot-open": "The file could not be opened. The passphrase may be wrong, or the file may be damaged.",
  unsupported: "This browser cannot make or open protected copies.",
};

const PROBLEMS_FR: Record<ProtectedProblem, string> = {
  empty: "Écrivez d’abord une phrase secrète.",
  "too-short": "La phrase secrète doit avoir au moins 10 caractères.",
  repeated: "La phrase secrète répète un seul caractère. Choisissez-en une autre.",
  common: "Cette phrase secrète est trop courante. Choisissez-en une autre.",
  mismatch: "Les deux phrases secrètes ne sont pas identiques.",
  "not-json": "Ce fichier n’est pas une copie protégée de l’App.",
  "wrong-format": "Ce fichier n’est pas une copie protégée de l’App.",
  "wrong-version": "Ce fichier vient d’une autre version, donc il ne peut pas être ouvert.",
  "bad-fields": "Ce fichier est abîmé.",
  "wrong-prefix": "Ce fichier a été fait pour une autre App.",
  "too-large": "Ce fichier est trop gros. La limite est de 1 Mo.",
  "cannot-open": "Le fichier n’a pas pu être ouvert. La phrase secrète est peut-être incorrecte, ou le fichier est abîmé.",
  unsupported: "Ce navigateur ne peut pas faire ni ouvrir de copies protégées.",
};

export const DEVICE_STRINGS: Record<Locale, DeviceStrings> = {
  en: {
    signals: {
      heading: "Browser privacy signals",
      note: "This page only shows what your browser reports. If the browser does not say, the answer is Unknown.",
      columns: { signal: "Signal", value: "Answer" },
      rows: {
        gpc: "Global Privacy Control",
        dnt: "Do Not Track",
        cookies: "Cookies allowed in this browser",
        secure: "Secure connection (HTTPS)",
        persistent: "Browser keeps this storage when space is low",
      },
      value: { yes: "Yes", no: "No", unknown: "Unknown" },
      usage: (u, q) =>
        u === null
          ? "Space used by this site: Unknown."
          : q === null
            ? `Space used by this site: ${formatBytes("en", u)}.`
            : `Space used by this site: ${formatBytes("en", u)} of about ${formatBytes("en", q)}.`,
    },
    device: {
      heading: "Offline storage",
      note: "Only names are shown, never contents. Cookies are listed only when this page can read them.",
      scanButton: "Check offline storage",
      notChecked: "Not checked yet.",
      checkedAt: (iso) => `Checked on ${iso}.`,
      cachesHeading: "Offline caches",
      databasesHeading: "Databases",
      cookiesHeading: "Cookies",
      none: "None found.",
      unknown: "Unknown. This browser does not say.",
      clearButton: "Remove offline caches and databases",
      confirmTitle: "Remove offline storage?",
      confirmBody: (c, d) =>
        `This removes ${n("en", c, "cache", "caches")} and ${n("en", d, "database", "databases")} of the App from this browser. The App may need to download them again.`,
      confirmYes: "Yes, remove",
      confirmNo: "Keep them",
      nothingToClear: "There is nothing of the App to remove.",
    },
    copy: {
      heading: "Protected copy",
      note: "Make a copy of your data that needs a passphrase to open. The App does not keep the passphrase. If you forget it, the copy cannot be opened.",
      hint: "At least 10 characters.",
      passLabel: "Passphrase",
      confirmLabel: "Type the passphrase again",
      exportButton: "Download a protected copy",
      fileLabel: "Choose a protected file",
    },
    status: (s) => {
      switch (s.kind) {
        case "scan-done":
          return "Offline storage checked.";
        case "device-cleared":
          return `Removed: ${n("en", s.caches, "cache", "caches")} and ${n("en", s.databases, "database", "databases")}.`;
        case "device-clear-partial":
          return `Some items could not be removed: ${s.failed}.`;
        case "device-nothing":
          return "There is nothing of the App to remove.";
        case "protected-prepared":
          return `Protected copy prepared: ${n("en", s.count, "item", "items")}.`;
        case "protected-problem":
          return PROBLEMS_EN[s.code];
      }
    },
  },
  fr: {
    signals: {
      heading: "Signaux de confidentialité du navigateur",
      note: "Cette page montre seulement ce que votre navigateur indique. S’il ne le dit pas, la réponse est Inconnu.",
      columns: { signal: "Signal", value: "Réponse" },
      rows: {
        gpc: "Global Privacy Control",
        dnt: "Ne pas me suivre (Do Not Track)",
        cookies: "Témoins permis dans ce navigateur",
        secure: "Connexion sécurisée (HTTPS)",
        persistent: "Le navigateur garde ce stockage quand l’espace manque",
      },
      value: { yes: "Oui", no: "Non", unknown: "Inconnu" },
      usage: (u, q) =>
        u === null
          ? `Espace utilisé par ce site${NBSP}: inconnu.`
          : q === null
            ? `Espace utilisé par ce site${NBSP}: ${formatBytes("fr", u)}.`
            : `Espace utilisé par ce site${NBSP}: ${formatBytes("fr", u)} sur environ ${formatBytes("fr", q)}.`,
    },
    device: {
      heading: "Stockage hors ligne",
      note: "Seuls les noms sont affichés, jamais le contenu. Les témoins sont listés seulement quand cette page peut les lire.",
      scanButton: "Examiner le stockage hors ligne",
      notChecked: "Pas encore examiné.",
      checkedAt: (iso) => `Examiné le ${iso}.`,
      cachesHeading: "Caches hors ligne",
      databasesHeading: "Bases de données",
      cookiesHeading: "Témoins",
      none: "Aucun trouvé.",
      unknown: "Inconnu. Ce navigateur ne le dit pas.",
      clearButton: "Retirer les caches et bases de données hors ligne",
      confirmTitle: `Retirer le stockage hors ligne${NNBSP}?`,
      confirmBody: (c, d) =>
        `Cela retire ${n("fr", c, "cache", "caches")} et ${n("fr", d, "base de données", "bases de données")} de l’App dans ce navigateur. L’App devra peut-être les télécharger de nouveau.`,
      confirmYes: "Oui, retirer",
      confirmNo: "Les garder",
      nothingToClear: "Il n’y a rien de l’App à retirer.",
    },
    copy: {
      heading: "Copie protégée",
      note: "Faites une copie de vos données qui demande une phrase secrète pour s’ouvrir. L’App ne garde pas la phrase secrète. Si vous l’oubliez, la copie ne peut pas être ouverte.",
      hint: "Au moins 10 caractères.",
      passLabel: "Phrase secrète",
      confirmLabel: "Écrivez de nouveau la phrase secrète",
      exportButton: "Télécharger une copie protégée",
      fileLabel: "Choisir un fichier protégé",
    },
    status: (s) => {
      switch (s.kind) {
        case "scan-done":
          return "Stockage hors ligne examiné.";
        case "device-cleared":
          return `Retiré${NBSP}: ${n("fr", s.caches, "cache", "caches")} et ${n("fr", s.databases, "base de données", "bases de données")}.`;
        case "device-clear-partial":
          return `Certains éléments n’ont pas pu être retirés${NBSP}: ${s.failed}.`;
        case "device-nothing":
          return "Il n’y a rien de l’App à retirer.";
        case "protected-prepared":
          return `Copie protégée préparée${NBSP}: ${n("fr", s.count, "élément", "éléments")}.`;
        case "protected-problem":
          return PROBLEMS_FR[s.code];
      }
    },
  },
};
