// The places in the App where work starts on its own, without the person pressing anything: a timer that ends a wait,
// an observer that watches part of the page, a listener for the network coming or going or for another tab saving, a
// frame callback that puts focus back, and the offline worker. The list says which file starts each kind of work, how
// many places in that file do, when it runs and what it does. audit/autoScan.ts reads the source and fails CI when the
// list and the source disagree, so a new kind of work cannot start on its own unseen.
//
// A row says what was read in the code. A row marked "reads" only asks the browser a question and starts nothing; the
// behaviour audit checks that such a file never registers or removes a worker. Work started by a library, or by a
// call the scan cannot follow, is not in the list, and the list says nothing about it.

import { isIsoDate, type Bilingual } from "./inventory";

export type AutoKind = "timer" | "frame" | "observer" | "network" | "storage-event" | "page-event" | "channel" | "worker" | "service-worker";

export const AUTO_KINDS: readonly AutoKind[] = ["timer", "frame", "observer", "network", "storage-event", "page-event", "channel", "worker", "service-worker"];

/** What the code does with the start: it sets work going, it answers something that happens, or it only asks a question. */
export type AutoEffect = "runs" | "reacts" | "reads";

export const AUTO_EFFECTS: readonly AutoEffect[] = ["runs", "reacts", "reads"];

export interface AutoRow {
  kind: AutoKind;
  /** Repo-relative path of the file */
  path: string;
  /** How many places in that file start work this way */
  uses: number;
  effect: AutoEffect;
  /** What sets it going, in plain words */
  when: Bilingual;
  /** What it does, in plain words */
  does: Bilingual;
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-21";
const SOURCE = "Read from the source file named in the row";

const row = (kind: AutoKind, path: string, uses: number, effect: AutoEffect, when: [string, string], does: [string, string]): AutoRow => ({
  kind,
  path,
  uses,
  effect,
  when: { en: when[0], fr: when[1] },
  does: { en: does[0], fr: does[1] },
  source: SOURCE,
  recordedOn: REVIEWED,
});

const FOCUS: [string, string] = ["Puts keyboard focus back on a button once a confirmation closes", "Remet le focus du clavier sur un bouton une fois la confirmation fermée"];
const AFTER_CLOSE: [string, string] = ["When a confirmation closes", "Quand une confirmation se ferme"];
const LANGUAGE: [string, string] = ["Marks English paragraphs in this part of the page so a screen reader says them in English", "Marque les paragraphes en anglais dans cette partie de la page pour qu’un lecteur d’écran les lise en anglais"];
const CHANGES: [string, string] = ["When text in this part of the page changes", "Quand le texte de cette partie de la page change"];
const ASK_WORKER: [string, string] = ["Asks the browser whether an offline worker controls this page, to show its state", "Demande au navigateur si un agent hors ligne contrôle cette page, pour afficher son état"];
const PAGE_OPENS: [string, string] = ["When the page opens", "Quand la page s’ouvre"];

export const AUTO_REGISTER: readonly AutoRow[] = [
  row("timer", "apps/web/src/data-status/offline.ts", 1, "runs", ["While a page is being fetched on a slow network", "Pendant qu’une page est demandée sur un réseau lent"], ["Ends the wait after a set time, so the saved copy can be shown instead", "Met fin à l’attente après un délai fixé, pour montrer la copie enregistrée à la place"]),
  row("timer", "apps/web/src/states/resilience.ts", 1, "runs", ["While data is being loaded", "Pendant le chargement de données"], ["Gives up on the load after a set time and reports that it timed out", "Abandonne le chargement après un délai fixé et signale qu’il a expiré"]),
  row("timer", "apps/web/src/states/serviceWorker.ts", 1, "runs", ["Inside the offline worker's own code, while it waits for the network", "Dans le code de l’agent hors ligne, pendant qu’il attend le réseau"], ["Ends the wait after a set time, so a saved copy can answer instead", "Met fin à l’attente après un délai fixé, pour qu’une copie enregistrée réponde à la place"]),
  row("frame", "apps/web/src/offline/RegionPackPage.tsx", 1, "runs", ["When deleting a saved region finishes, or fails", "Quand la suppression d’une région enregistrée se termine ou échoue"], ["Puts keyboard focus back on the delete button", "Remet le focus du clavier sur le bouton de suppression"]),
  row("frame", "apps/web/src/offline/evidence-workbench/EvidenceWorkbench.tsx", 3, "runs", ["When the form opens, or when the clear prompt is answered", "Quand le formulaire s’ouvre ou qu’il est répondu à la demande d’effacement"], ["Puts keyboard focus on the form heading or back on the clear button", "Place le focus du clavier sur le titre du formulaire ou sur le bouton d’effacement"]),
  row("frame", "apps/web/src/pages/DataStatusPage.tsx", 1, "runs", AFTER_CLOSE, FOCUS),
  row("frame", "apps/web/src/pages/OfflinePackPage.tsx", 1, "runs", AFTER_CLOSE, FOCUS),
  row("frame", "apps/web/src/pages/ProfilePage.tsx", 1, "runs", AFTER_CLOSE, FOCUS),
  row("observer", "apps/web/src/hub/AuditorsEnglishBoundary.tsx", 1, "reacts", CHANGES, LANGUAGE),
  row("observer", "apps/web/src/hub/AuditorsLanguageRegion.tsx", 1, "reacts", CHANGES, LANGUAGE),
  row("observer", "apps/web/src/hub/HousingLanguageBoundary.tsx", 1, "reacts", CHANGES, LANGUAGE),
  row("observer", "apps/web/src/hub/PackageView.tsx", 1, "reacts", ["When the tool on the employment or auditors page changes", "Quand l’outil de la page emploi ou de la page des auditeurs change"], ["Gives a name to any unnamed form in the tool, so a screen reader can say it", "Donne un nom à tout formulaire sans nom dans l’outil, pour qu’un lecteur d’écran puisse le dire"]),
  row("observer", "apps/web/src/shell/AppShell.tsx", 1, "reacts", ["After a new page opens, until its heading appears", "Après l’ouverture d’une nouvelle page, jusqu’à l’apparition de son titre"], ["Moves keyboard focus to the page heading, then stops watching", "Place le focus du clavier sur le titre de la page, puis cesse de surveiller"]),
  row("network", "apps/web/src/shell/useOnline.ts", 2, "reacts", ["When the browser says the device went online or offline", "Quand le navigateur indique que l’appareil est passé en ligne ou hors ligne"], ["Updates the online or offline notice in the shell", "Met à jour l’avis «\u202fen ligne\u202f» ou «\u202fhors ligne\u202f» de la structure de la page"]),
  row("network", "apps/web/src/states/offline.ts", 2, "reacts", ["When the browser says the device went online or offline", "Quand le navigateur indique que l’appareil est passé en ligne ou hors ligne"], ["Records the change in the places pages' own state", "Enregistre le changement dans l’état propre aux pages de lieux"]),
  row("storage-event", "apps/web/src/states/useShortlist.ts", 1, "reacts", ["When another tab of the App saves the shortlist", "Quand un autre onglet de l’App enregistre la liste de sélection"], ["Reads the shortlist again so this tab shows the same list", "Relit la liste de sélection pour que cet onglet affiche la même liste"]),
  row("storage-event", "apps/web/src/states/useVisitMarks.ts", 1, "reacts", ["When another tab of the App saves the visit marks", "Quand un autre onglet de l’App enregistre les marques de visite"], ["Reads the visit marks again so this tab shows the same marks", "Relit les marques de visite pour que cet onglet affiche les mêmes marques"]),
  row("service-worker", "apps/web/src/data-status/registerOffline.ts", 2, "runs", ["When a page asks to turn on offline support", "Quand une page demande d’activer la prise en charge hors ligne"], ["Registers the offline worker with the browser, on a secure connection only", "Enregistre l’agent hors ligne auprès du navigateur, sur une connexion sécurisée seulement"]),
  row("service-worker", "apps/web/src/pages/BuildCardPage.tsx", 2, "reads", PAGE_OPENS, ASK_WORKER),
  row("service-worker", "apps/web/src/pages/DataStatusPage.tsx", 2, "reads", PAGE_OPENS, ASK_WORKER),
  row("service-worker", "apps/web/src/states/serviceWorker.ts", 5, "runs", ["When the page has loaded (registration), and inside the worker when it installs, becomes active and a page asks for something", "Quand la page est chargée (enregistrement), et dans l’agent quand il s’installe, devient actif et qu’une page demande quelque chose"], ["Registers the worker, saves pages for offline use, removes older saved copies and answers page requests from saved copies", "Enregistre l’agent, garde des pages pour l’usage hors ligne, retire les anciennes copies et répond aux demandes de pages depuis les copies enregistrées"]),
];

export type AutoProblemCode =
  | "bad-path"
  | "bad-kind"
  | "bad-effect"
  | "bad-count"
  | "empty-text"
  | "empty-source"
  | "bad-date"
  | "duplicate-row"
  | "reads-not-service-worker";

export interface AutoProblem {
  code: AutoProblemCode;
  kind: string;
  path: string;
  detail?: string;
}

const PATH_RE = /^apps\/web\/src\/[A-Za-z0-9_./-]+\.(?:ts|tsx)$/;

/** Problems in a list of rows. Empty means every row is well formed. */
export function validateAuto(rows: readonly AutoRow[]): AutoProblem[] {
  const out: AutoProblem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const at = { kind: r.kind, path: r.path };
    if (!PATH_RE.test(r.path) || r.path.includes("..") || r.path.includes("//")) out.push({ code: "bad-path", ...at });
    if (!AUTO_KINDS.includes(r.kind)) out.push({ code: "bad-kind", ...at });
    if (!AUTO_EFFECTS.includes(r.effect)) out.push({ code: "bad-effect", ...at, detail: r.effect });
    if (!Number.isInteger(r.uses) || r.uses < 1) out.push({ code: "bad-count", ...at, detail: String(r.uses) });
    if (r.when.en.trim() === "" || r.when.fr.trim() === "" || r.does.en.trim() === "" || r.does.fr.trim() === "") out.push({ code: "empty-text", ...at });
    if (r.source.trim() === "") out.push({ code: "empty-source", ...at });
    if (!isIsoDate(r.recordedOn)) out.push({ code: "bad-date", ...at, detail: r.recordedOn });
    if (r.effect === "reads" && r.kind !== "service-worker") out.push({ code: "reads-not-service-worker", ...at });
    const id = `${r.kind} ${r.path}`;
    if (seen.has(id)) out.push({ code: "duplicate-row", ...at });
    seen.add(id);
  }
  return out.sort((a, b) => `${a.kind} ${a.path} ${a.code}`.localeCompare(`${b.kind} ${b.path} ${b.code}`));
}

/** Throws at start-up when the rows are wrong, like the other registers. */
export function assertAuto(rows: readonly AutoRow[]): void {
  const p = validateAuto(rows);
  if (p.length > 0) throw new Error(`Background work register is wrong: ${p.map((x) => `${x.code} ${x.kind} ${x.path}${x.detail === undefined ? "" : ` (${x.detail})`}`).join("; ")}`);
}

export interface AutoCounts {
  /** Rows */
  total: number;
  /** Places in the source that start work, over all rows */
  uses: number;
  /** Different files */
  files: number;
  /** Rows that set work going by themselves */
  runs: number;
  /** Rows that answer something that happens */
  reacts: number;
  /** Rows that only ask the browser a question */
  reads: number;
}

export function autoCounts(rows: readonly AutoRow[]): AutoCounts {
  return {
    total: rows.length,
    uses: rows.reduce((n, r) => n + r.uses, 0),
    files: new Set(rows.map((r) => r.path)).size,
    runs: rows.filter((r) => r.effect === "runs").length,
    reacts: rows.filter((r) => r.effect === "reacts").length,
    reads: rows.filter((r) => r.effect === "reads").length,
  };
}

/** The rows for one kind of work, in the order of the rows. */
export function rowsFor(rows: readonly AutoRow[], kind: AutoKind): AutoRow[] {
  return rows.filter((r) => r.kind === kind);
}

/** The rows sorted by kind (in the order of the list of kinds) and then by path. */
export function inKindOrder(rows: readonly AutoRow[]): AutoRow[] {
  return [...rows].sort((a, b) => AUTO_KINDS.indexOf(a.kind) - AUTO_KINDS.indexOf(b.kind) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export const KIND_LABELS: Readonly<Record<AutoKind, Bilingual>> = {
  timer: { en: "Timer", fr: "Minuterie" },
  frame: { en: "Next screen refresh", fr: "Prochain rafraîchissement d’écran" },
  observer: { en: "Page watcher", fr: "Surveillance de la page" },
  network: { en: "Online or offline", fr: "En ligne ou hors ligne" },
  "storage-event": { en: "Another tab saving", fr: "Un autre onglet qui enregistre" },
  "page-event": { en: "Page hidden or closed", fr: "Page masquée ou fermée" },
  channel: { en: "Message between tabs", fr: "Message entre onglets" },
  worker: { en: "Background script", fr: "Script d’arrière-plan" },
  "service-worker": { en: "Offline worker", fr: "Agent hors ligne" },
};

export const EFFECT_LABELS: Readonly<Record<AutoEffect, Bilingual>> = {
  runs: { en: "Sets work going", fr: "Lance un travail" },
  reacts: { en: "Answers something that happens", fr: "Répond à un événement" },
  reads: { en: "Only asks the browser a question", fr: "Pose seulement une question au navigateur" },
};
