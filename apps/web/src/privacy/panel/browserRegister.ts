// The places in the App where the code asks the browser about the person's device or settings, and the places where it
// makes a random identifier or writes a number in the browser's own language. The list says which file asks, how many
// places in that file do, what is asked and what the answer is used for. audit/browserScan.ts reads the source and fails
// CI when the list and the source disagree, so a new question to the browser cannot appear unseen.
//
// A row says what was read in the code. It does not say what the browser answers for a given person, where an
// identifier goes afterwards, or what another part of the App does with a result: those are outside the row. A row
// never claims that an answer is sent anywhere or kept anywhere; the other lists say what the App keeps and sends.

import { isIsoDate, type Bilingual } from "./inventory";

export type BrowserKind = "language" | "online" | "preference" | "storage-size" | "privacy-signal" | "identifier" | "own-language";

export const BROWSER_KINDS: readonly BrowserKind[] = ["language", "online", "preference", "storage-size", "privacy-signal", "identifier", "own-language"];

export interface BrowserRow {
  kind: BrowserKind;
  /** Repo-relative path of the file */
  path: string;
  /** How many places in that file ask this way */
  uses: number;
  /** What is asked, in plain words */
  asks: Bilingual;
  /** What the answer is used for, in plain words */
  usedFor: Bilingual;
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-21";
const SOURCE = "Read from the source file named in the row";

const row = (kind: BrowserKind, path: string, uses: number, asks: [string, string], usedFor: [string, string]): BrowserRow => ({
  kind,
  path,
  uses,
  asks: { en: asks[0], fr: asks[1] },
  usedFor: { en: usedFor[0], fr: usedFor[1] },
  source: SOURCE,
  recordedOn: REVIEWED,
});

const NEW_ID: [string, string] = ["Makes a random identifier", "Fabrique un identifiant aléatoire"];

export const BROWSER_REGISTER: readonly BrowserRow[] = [
  row("language", "apps/web/src/data-status/standalone/main.ts", 1, ["The language your browser is set to", "La langue de votre navigateur"], ["Picks English or French for the data status page when the address does not say", "Choisit l’anglais ou le français pour la page d’état des données quand l’adresse ne le dit pas"]),
  row("language", "apps/web/src/i18n/index.ts", 1, ["The language your browser is set to", "La langue de votre navigateur"], ["Picks English or French for the App when you have not chosen a language", "Choisit l’anglais ou le français pour l’App quand vous n’avez pas choisi de langue"]),
  row("language", "apps/web/src/privacy/panel/browserLive.ts", 1, ["The language your browser is set to", "La langue de votre navigateur"], ["Shows it to you in this panel when you press the button that asks the browser now", "Vous la montre dans ce panneau quand vous appuyez sur le bouton qui interroge le navigateur maintenant"]),
  row("language", "packages/consent/src/main.tsx", 1, ["The language your browser is set to", "La langue de votre navigateur"], ["Picks English or French for the consent page when the address does not say", "Choisit l’anglais ou le français pour la page de consentement quand l’adresse ne le dit pas"]),
  row("online", "apps/web/src/offline/RegionPackPage.tsx", 3, ["Whether your device says it is online", "Si votre appareil dit qu’il est en ligne"], ["Tells a failed download of a region pack from being offline, to show the right message", "Distingue un échec de téléchargement d’un paquet de région d’une absence de connexion, pour afficher le bon message"]),
  row("online", "apps/web/src/privacy/panel/browserLive.ts", 1, ["Whether your device says it is online", "Si votre appareil dit qu’il est en ligne"], ["Shows it to you in this panel when you press the button that asks the browser now", "Vous le montre dans ce panneau quand vous appuyez sur le bouton qui interroge le navigateur maintenant"]),
  row("online", "apps/web/src/shell/useOnline.ts", 1, ["Whether your device says it is online", "Si votre appareil dit qu’il est en ligne"], ["Tells the rest of the App whether the device says it is online", "Dit au reste de l’App si l’appareil se dit en ligne"]),
  row("preference", "apps/web/src/map/camera.ts", 1, ["Whether you asked your device for less motion", "Si vous avez demandé moins de mouvement à votre appareil"], ["Moves the map by a jump instead of a glide when you asked for less motion", "Déplace la carte d’un saut plutôt que d’un glissement quand vous avez demandé moins de mouvement"]),
  row("preference", "apps/web/src/privacy/panel/browserLive.ts", 1, ["Whether you asked your device for more contrast or for less motion", "Si vous avez demandé à votre appareil plus de contraste ou moins de mouvement"], ["Shows both answers to you in this panel when you press the button that asks the browser now", "Vous montre les deux réponses dans ce panneau quand vous appuyez sur le bouton qui interroge le navigateur maintenant"]),
  row("preference", "apps/web/src/shell/useApplyPreferences.ts", 2, ["Whether you asked your device for more contrast", "Si vous avez demandé plus de contraste à votre appareil"], ["Uses high contrast when you asked your device for more contrast and have not set it in the App, and follows the device setting if it changes", "Utilise le contraste élevé quand vous l’avez demandé à votre appareil sans le régler dans l’App, et suit le réglage de l’appareil s’il change"]),
  row("storage-size", "apps/web/src/offline/RegionPackPage.tsx", 1, ["How much space this site uses and may use", "L’espace que ce site utilise et peut utiliser"], ["Hands the question to the region pack code, which uses the answer when it plans a download", "Confie la question au code des paquets de région, qui se sert de la réponse pour planifier un téléchargement"]),
  row("storage-size", "apps/web/src/offline/robust/offlineDashboard.ts", 1, ["The storage object of your browser", "L’objet de stockage de votre navigateur"], ["Hands it to the storage panel so the panel can ask how much space is used", "Le remet au panneau de stockage pour que celui-ci demande quelle place est utilisée"]),
  row("storage-size", "apps/web/src/offline/robust/storageDurability.ts", 2, ["How much space this site uses and may use, and whether the browser promised to keep it", "L’espace que ce site utilise et peut utiliser, et si le navigateur a promis de le garder"], ["Shows, in the offline storage panel, how much space the site uses and whether the browser promised to keep it", "Montre, dans le panneau de stockage hors ligne, l’espace que le site utilise et si le navigateur a promis de le garder"]),
  row("storage-size", "apps/web/src/privacy/panel/browserLive.ts", 3, ["How much space this site uses and may use, and whether the browser promised to keep it", "L’espace que ce site utilise et peut utiliser, et si le navigateur a promis de le garder"], ["Shows both answers to you in this panel when you press the button that asks the browser now", "Vous montre les deux réponses dans ce panneau quand vous appuyez sur le bouton qui interroge le navigateur maintenant"]),
  row("storage-size", "apps/web/src/privacy/panel/signals.ts", 1, ["The storage object of your browser", "L’objet de stockage de votre navigateur"], ["Reads from it how much space is used and whether the browser promised to keep it, for the signals this panel shows", "En lit l’espace utilisé et si le navigateur a promis de le garder, pour les signaux que ce panneau montre"]),
  row("storage-size", "packages/data-client/src/index.ts", 1, ["How much space this site uses and may use", "L’espace que ce site utilise et peut utiliser"], ["Checks that a pack fits before it is downloaded, and stops with a quota error when it would not", "S’assure qu’un paquet tient avant son téléchargement, et s’arrête avec une erreur de quota s’il ne tiendrait pas"]),
  row("privacy-signal", "apps/web/src/privacy/panel/signals.ts", 4, ["The privacy settings of your browser, and whether the connection is secure", "Les réglages de confidentialité de votre navigateur, et si la connexion est sécurisée"], ["Shows the answers in the signals this panel offers to read, each as yes, no or unknown", "Montre les réponses dans les signaux que ce panneau propose de lire, chacune comme oui, non ou inconnu"]),
  row("privacy-signal", "apps/web/src/data-status/standalone/main.ts", 1, ["Whether the page is on a secure connection", "Si la page est sur une connexion sécurisée"], ["Hands the answer to the code that sets up offline support, which only starts on a secure connection", "Confie la réponse au code qui met en place le mode hors ligne, qui ne démarre que sur une connexion sécurisée"]),
  row("identifier", "apps/web/src/contribute/ContributePage.tsx", 1, NEW_ID, ["Gives each photo added to a contribution its own identifier", "Donne à chaque photo ajoutée à une contribution son propre identifiant"]),
  row("identifier", "apps/web/src/hub/RouteReportsPage.tsx", 2, NEW_ID, ["Gives each route report its own identifier, with a time-based one when the browser cannot make a random one", "Donne à chaque signalement de trajet son propre identifiant, fondé sur l’heure quand le navigateur ne peut pas en fabriquer un aléatoire"]),
  row("identifier", "apps/web/src/storage/repository.ts", 1, NEW_ID, ["Gives each correction report waiting to be sent its own identifier", "Donne à chaque signalement de correction en attente d’envoi son propre identifiant"]),
  row("identifier", "packages/caregiver/src/service.ts", 1, NEW_ID, ["Gives each caregiver access grant its own identifier, unless the caller supplies one, and makes one another way when the browser cannot make a random one", "Donne à chaque accès accordé à un aidant son propre identifiant, sauf si l’appelant en fournit un, et en fabrique un autrement quand le navigateur ne peut pas en fabriquer un aléatoire"]),
  row("identifier", "packages/contribute/src/schema.ts", 1, NEW_ID, ["Gives each new draft contribution its own identifier", "Donne à chaque nouveau brouillon de contribution son propre identifiant"]),
  row("identifier", "packages/proposals/src/store.ts", 1, NEW_ID, ["Gives each saved proposal its own identifier, unless the caller supplies one", "Donne à chaque proposition enregistrée son propre identifiant, sauf si l’appelant en fournit un"]),
  row("own-language", "apps/web/src/features/featureScreens.tsx", 2, ["Writes numbers in your browser’s own language, not the language chosen in the App", "Écrit les nombres dans la langue propre au navigateur, et non dans la langue choisie dans l’App"], ["Writes the counts on the features screen with the browser’s grouping of digits", "Écrit les totaux de l’écran des fonctions avec le groupement des chiffres du navigateur"]),
];

export type BrowserProblemCode =
  | "bad-path"
  | "bad-kind"
  | "bad-count"
  | "empty-text"
  | "empty-source"
  | "bad-date"
  | "duplicate-row"
  | "same-text";

export interface BrowserProblem {
  code: BrowserProblemCode;
  kind: BrowserKind;
  path: string;
  detail?: string;
}

const PATH_RE = /^(?:apps\/web\/src|packages\/[a-z0-9-]+\/src)\/[A-Za-z0-9_./-]+\.(?:ts|tsx)$/;

/** Problems in a list of rows. Empty means every row is well formed. */
export function validateBrowser(rows: readonly BrowserRow[]): BrowserProblem[] {
  const out: BrowserProblem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const at = { kind: r.kind, path: r.path };
    if (!PATH_RE.test(r.path) || r.path.includes("..") || r.path.includes("//")) out.push({ code: "bad-path", ...at });
    if (!BROWSER_KINDS.includes(r.kind)) out.push({ code: "bad-kind", ...at });
    if (!Number.isInteger(r.uses) || r.uses < 1) out.push({ code: "bad-count", ...at, detail: String(r.uses) });
    for (const field of [r.asks, r.usedFor]) {
      if (field.en.trim() === "" || field.fr.trim() === "") out.push({ code: "empty-text", ...at });
      else if (field.en === field.fr) out.push({ code: "same-text", ...at, detail: field.en });
    }
    if (r.source.trim() === "") out.push({ code: "empty-source", ...at });
    if (!isIsoDate(r.recordedOn)) out.push({ code: "bad-date", ...at, detail: r.recordedOn });
    const id = `${r.kind}\u0000${r.path}`;
    if (seen.has(id)) out.push({ code: "duplicate-row", ...at });
    seen.add(id);
  }
  const key = (x: BrowserProblem): string => `${x.kind}\u0000${x.path}\u0000${x.code}\u0000${x.detail ?? ""}`;
  return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Throws at start-up when the rows are wrong, like the other registers. */
export function assertBrowser(rows: readonly BrowserRow[]): void {
  const p = validateBrowser(rows);
  if (p.length > 0) throw new Error(`Browser questions register is wrong: ${p.map((x) => `${x.code} ${x.kind} ${x.path}${x.detail === undefined ? "" : ` (${x.detail})`}`).join("; ")}`);
}

export interface BrowserCounts {
  /** Rows */
  total: number;
  /** Places in the source, over all rows */
  uses: number;
  /** Different files */
  files: number;
  /** Rows that ask the browser about the device or a setting, not counting identifiers and number writing */
  questions: number;
  /** Rows that make an identifier */
  identifiers: number;
}

export function browserCounts(rows: readonly BrowserRow[]): BrowserCounts {
  return {
    total: rows.length,
    uses: rows.reduce((n, r) => n + r.uses, 0),
    files: new Set(rows.map((r) => r.path)).size,
    questions: rows.filter((r) => r.kind !== "identifier" && r.kind !== "own-language").length,
    identifiers: rows.filter((r) => r.kind === "identifier").length,
  };
}

/** The rows for one kind, in the order of the rows. */
export function browserOfKind(rows: readonly BrowserRow[], kind: BrowserKind): BrowserRow[] {
  return rows.filter((r) => r.kind === kind);
}

/** The rows sorted by kind (in the order of the list of kinds) and then by path. */
export function browserKindOrder(rows: readonly BrowserRow[]): BrowserRow[] {
  return [...rows].sort((a, b) => BROWSER_KINDS.indexOf(a.kind) - BROWSER_KINDS.indexOf(b.kind) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export const BROWSER_KIND_LABELS: Readonly<Record<BrowserKind, Bilingual>> = {
  language: { en: "Language", fr: "Langue" },
  online: { en: "Online or offline", fr: "En ligne ou hors ligne" },
  preference: { en: "A display setting", fr: "Un réglage d’affichage" },
  "storage-size": { en: "Storage space", fr: "Espace de stockage" },
  "privacy-signal": { en: "A privacy setting of the browser", fr: "Un réglage de confidentialité du navigateur" },
  identifier: { en: "A random identifier", fr: "Un identifiant aléatoire" },
  "own-language": { en: "Numbers in the browser’s language", fr: "Nombres dans la langue du navigateur" },
};
