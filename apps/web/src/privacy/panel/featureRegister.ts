// What the App asks of the browser, feature by feature: the ones its code uses, and the powerful ones it
// does not. audit/featureScan.ts reads the source and fails CI when a feature here is used and the row says
// it is not, when a row says it is used and the source no longer shows it, and when the row's file is wrong.
// A new camera, location, notification or background-send call therefore cannot appear without a visible
// edit here. The panel shows these rows and, for features the browser can report on, the browser's answer.
// Nothing is read from a person's device to build this list, and what is not known is written UNKNOWN.

import type { Bilingual } from "./inventory";

export type FeatureId =
  | "service-worker"
  | "storage-estimate"
  | "storage-persist"
  | "permission-query"
  | "clipboard-write"
  | "file-download"
  | "file-pick"
  | "print"
  | "language"
  | "display-preferences"
  | "geolocation"
  | "camera-microphone"
  | "notifications"
  | "clipboard-read"
  | "send-beacon"
  | "share"
  | "cookie-write"
  | "device-apis"
  | "sensors"
  | "credentials";

export interface FeatureRow {
  id: FeatureId;
  /** True when the source uses it. False: the source does not, and the audit keeps it that way. */
  used: boolean;
  /** Repo-relative path of a file that uses it. Null for a feature the App does not use. */
  path: string | null;
  /** The feature in plain words, without the name of the programming interface */
  holds: Bilingual;
  /** Why the App uses it. Absent for a feature the App does not use. */
  why?: Bilingual;
  /** Whether the browser asks the person before the App can use it. UNKNOWN when the App has not confirmed it. */
  asks: "yes" | "no" | "UNKNOWN";
  /** The name the browser's permission query uses, when it has one */
  permission?: string;
  /** Repo-relative path of a file whose header settings turn the feature off, when one does */
  blockedBy?: string;
  /** Where the statement came from */
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-19";
const SOURCE = "Read from the source file named in the row";
const HEADERS = "apps/web/src/states/securityHeaders.ts";

const row = (r: Omit<FeatureRow, "source" | "recordedOn">): FeatureRow => ({ ...r, source: SOURCE, recordedOn: REVIEWED });

export const FEATURE_REGISTER: readonly FeatureRow[] = [
  row({ id: "service-worker", used: true, path: "apps/web/src/data-status/registerOffline.ts", asks: "no", holds: { en: "A background page that keeps copies of pages for offline use", fr: "Une page d’arrière-plan qui garde des copies des pages pour l’usage hors ligne" }, why: { en: "So saved pages open without a connection", fr: "Pour que les pages enregistrées s’ouvrent sans connexion" } }),
  row({ id: "storage-estimate", used: true, path: "apps/web/src/offline/robust/storageDurability.ts", asks: "no", holds: { en: "How much space this site uses and how much is left", fr: "L’espace utilisé par ce site et l’espace restant" }, why: { en: "To tell you whether offline data fits on this device", fr: "Pour vous dire si les données hors ligne tiennent sur cet appareil" } }),
  row({ id: "storage-persist", used: true, path: "apps/web/src/offline/robust/storageDurability.ts", asks: "UNKNOWN", permission: "persistent-storage", holds: { en: "A request that the browser keep this site’s offline data", fr: "Une demande pour que le navigateur conserve les données hors ligne de ce site" }, why: { en: "So offline data is less likely to be cleared when space runs low", fr: "Pour que les données hors ligne soient moins susceptibles d’être effacées quand l’espace manque" } }),
  row({ id: "permission-query", used: true, path: "apps/web/src/privacy/panel/permissions.ts", asks: "no", holds: { en: "A question to the browser about which features it has allowed", fr: "Une question au navigateur sur les fonctions qu’il a autorisées" }, why: { en: "To show the answers on this page. It only reads them.", fr: "Pour afficher les réponses sur cette page. Elle ne fait que les lire." } }),
  row({ id: "clipboard-write", used: true, path: "apps/web/src/contribute/ContributePage.tsx", asks: "UNKNOWN", permission: "clipboard-write", holds: { en: "Copying text you chose to copy", fr: "La copie d’un texte que vous avez choisi de copier" }, why: { en: "So you can paste your draft elsewhere", fr: "Pour que vous puissiez coller votre brouillon ailleurs" } }),
  row({ id: "file-download", used: true, path: "apps/web/src/states/downloadFile.ts", asks: "no", holds: { en: "Saving a file you asked for to your device", fr: "L’enregistrement sur votre appareil d’un fichier que vous avez demandé" }, why: { en: "So you can keep your own data and reports", fr: "Pour que vous puissiez conserver vos données et vos rapports" } }),
  row({ id: "file-pick", used: true, path: "apps/web/src/recovery/RecoveryCaseJournal.tsx", asks: "no", holds: { en: "Reading a file you pick from your device", fr: "La lecture d’un fichier que vous choisissez sur votre appareil" }, why: { en: "So you can restore a saved file or add photos", fr: "Pour que vous puissiez restaurer un fichier enregistré ou ajouter des photos" } }),
  row({ id: "print", used: true, path: "apps/web/src/pages/BuildCardPage.tsx", asks: "no", holds: { en: "Opening your browser’s print window", fr: "L’ouverture de la fenêtre d’impression de votre navigateur" }, why: { en: "So you can print a page", fr: "Pour que vous puissiez imprimer une page" } }),
  row({ id: "language", used: true, path: "apps/web/src/data-status/standalone/main.ts", asks: "no", holds: { en: "Reading your browser’s language setting", fr: "La lecture du réglage de langue de votre navigateur" }, why: { en: "To pick English or French when you have not chosen", fr: "Pour choisir le français ou l’anglais quand vous n’avez pas choisi" } }),
  row({ id: "display-preferences", used: true, path: "apps/web/src/shell/useApplyPreferences.ts", asks: "no", holds: { en: "Reading your display settings, such as high contrast", fr: "La lecture de vos réglages d’affichage, comme le contraste élevé" }, why: { en: "To follow them without asking you again", fr: "Pour les suivre sans vous le redemander" } }),
  row({ id: "geolocation", used: false, path: null, asks: "yes", permission: "geolocation", blockedBy: HEADERS, holds: { en: "Your location", fr: "Votre position" } }),
  row({ id: "camera-microphone", used: false, path: null, asks: "yes", permission: "camera", blockedBy: HEADERS, holds: { en: "Your camera or microphone", fr: "Votre caméra ou votre microphone" } }),
  row({ id: "notifications", used: false, path: null, asks: "yes", permission: "notifications", holds: { en: "Showing notifications", fr: "L’affichage de notifications" } }),
  row({ id: "clipboard-read", used: false, path: null, asks: "yes", permission: "clipboard-read", holds: { en: "Reading what you last copied", fr: "La lecture de ce que vous avez copié en dernier" } }),
  row({ id: "send-beacon", used: false, path: null, asks: "no", holds: { en: "Sending data in the background when you leave a page", fr: "L’envoi de données en arrière-plan quand vous quittez une page" } }),
  row({ id: "share", used: false, path: null, asks: "no", holds: { en: "Handing content to another app on your device", fr: "La transmission de contenu à une autre application de votre appareil" } }),
  row({ id: "cookie-write", used: false, path: null, asks: "no", holds: { en: "Setting cookies from the page", fr: "La création de témoins depuis la page" } }),
  row({ id: "device-apis", used: false, path: null, asks: "yes", holds: { en: "Connecting to Bluetooth, USB or serial devices", fr: "La connexion à des appareils Bluetooth, USB ou série" } }),
  row({ id: "sensors", used: false, path: null, asks: "UNKNOWN", holds: { en: "Reading motion or orientation sensors, vibration or keeping the screen awake", fr: "La lecture des capteurs de mouvement ou d’orientation, la vibration ou le maintien de l’écran allumé" } }),
  row({ id: "credentials", used: false, path: null, asks: "UNKNOWN", holds: { en: "Passkeys and stored sign-in details", fr: "Les clés d’accès et les identifiants de connexion enregistrés" } }),
];

export const usedFeatures = (register: readonly FeatureRow[]): FeatureRow[] => register.filter((r) => r.used);
export const unusedFeatures = (register: readonly FeatureRow[]): FeatureRow[] => register.filter((r) => !r.used);

/** Problems that do not depend on the source: repeated ids, a used row with no file or an unused one with a file, bad dates, blank text. */
export function checkFeatureRegister(register: readonly FeatureRow[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of register) {
    if (seen.has(r.id)) problems.push(`${r.id}: listed twice`);
    seen.add(r.id);
    if (r.used && r.path === null) problems.push(`${r.id}: used, but no file is named`);
    if (!r.used && r.path !== null) problems.push(`${r.id}: not used, but a file is named`);
    if (r.used && r.why === undefined) problems.push(`${r.id}: used, but no reason is given`);
    if (!r.used && r.why !== undefined) problems.push(`${r.id}: not used, so it cannot have a reason`);
    if (r.holds.en.trim() === "" || r.holds.fr.trim() === "") problems.push(`${r.id}: holds is empty in one language`);
    if (r.why !== undefined && (r.why.en.trim() === "" || r.why.fr.trim() === "")) problems.push(`${r.id}: why is empty in one language`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.recordedOn)) problems.push(`${r.id}: recordedOn is not YYYY-MM-DD`);
    if (r.source.trim() === "") problems.push(`${r.id}: source is empty`);
    if (r.permission !== undefined && !/^[a-z][a-z-]*$/.test(r.permission)) problems.push(`${r.id}: permission is not a plain name`);
    if (r.blockedBy !== undefined && r.used) problems.push(`${r.id}: used, so its header cannot block it`);
  }
  return problems;
}
