// The places in the App where the code makes a random value or reads something about the browser, in plain words
// for the privacy panel. One row per file with how many such places it holds. audit/id.panel.audit.test.ts keeps
// the rows in step with the accepted list that audit/idRegister.ts holds for the scan of the source, in both
// directions. The words say what the code does at those places and whether the value is kept. They do not say the
// value is never sent: the scan follows a value inside one file only.

import type { Bilingual } from "./inventory";

export type IdentifierKept = "on-device" | "not-kept" | "in-copy" | "shown-only";

export interface IdentifierRow {
  /** Repo-relative path of the file that makes the value or reads the browser */
  path: string;
  /** The part of the App, in plain words */
  where: Bilingual;
  /** What the code makes or reads there, in plain words */
  what: Bilingual;
  /** How many places in the file */
  count: number;
  kept: IdentifierKept;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-21";

const row = (path: string, count: number, kept: IdentifierKept, where: Bilingual, what: Bilingual): IdentifierRow => ({ path, where, what, count, kept, recordedOn: REVIEWED });

export const IDENTIFIER_REGISTER: readonly IdentifierRow[] = [
  row(
    "apps/web/src/contribute/ContributePage.tsx", 1, "on-device",
    { en: "Contributing a place", fr: "Contribuer un lieu" },
    { en: "A random number for each photo in a draft", fr: "Un nombre aléatoire pour chaque photo d’un brouillon" },
  ),
  row(
    "apps/web/src/data-status/standalone/main.ts", 1, "shown-only",
    { en: "The data status page", fr: "La page sur l’état des données" },
    { en: "The language of your browser, to choose French or English", fr: "La langue de votre navigateur, pour choisir le français ou l’anglais" },
  ),
  row(
    "apps/web/src/hub/RouteReportsPage.tsx", 3, "on-device",
    { en: "Route reports", fr: "Signalements de parcours" },
    { en: "A random number for each report, with a number from the clock added when the browser cannot make a random one", fr: "Un nombre aléatoire pour chaque signalement, avec un nombre tiré de l’horloge si le navigateur ne peut pas en produire un" },
  ),
  row(
    "apps/web/src/i18n/index.ts", 1, "not-kept",
    { en: "The main text of the App", fr: "Le texte principal de l’App" },
    { en: "The language of your browser, to choose French or English, only when you have not chosen one", fr: "La langue de votre navigateur, pour choisir le français ou l’anglais, seulement si vous n’en avez pas choisi une" },
  ),
  row(
    "apps/web/src/map/camera.ts", 1, "not-kept",
    { en: "The map", fr: "La carte" },
    { en: "Whether your browser asks for less motion", fr: "Si votre navigateur demande moins de mouvement" },
  ),
  row(
    "apps/web/src/offline/robust/contingencyPanel.ts", 1, "not-kept",
    { en: "The offline contingency plan", fr: "Le plan de secours hors ligne" },
    { en: "A name for a part of the page, made from a counter and the clock", fr: "Un nom pour une partie de la page, fait d’un compteur et de l’horloge" },
  ),
  row(
    "apps/web/src/offline/robust/offlineDiagnosticsPanel.ts", 1, "not-kept",
    { en: "The offline diagnostics", fr: "Les diagnostics hors ligne" },
    { en: "A random name for a part of the page", fr: "Un nom aléatoire pour une partie de la page" },
  ),
  row(
    "apps/web/src/offline/robust/recoveryBatchesPanel.ts", 1, "not-kept",
    { en: "The recovery batches plan", fr: "Le plan des lots de reprise" },
    { en: "A random name for a part of the page", fr: "Un nom aléatoire pour une partie de la page" },
  ),
  row(
    "apps/web/src/privacy/panel/browserLive.ts", 2, "shown-only",
    { en: "The browser signals in this panel", fr: "Les signaux du navigateur dans ce panneau" },
    { en: "Your browser’s language, and whether it asks for more contrast or less motion", fr: "La langue de votre navigateur, et s’il demande plus de contraste ou moins de mouvement" },
  ),
  row(
    "apps/web/src/privacy/panel/protectedBackup.ts", 2, "in-copy",
    { en: "Protected copies of your data", fr: "Les copies protégées de vos données" },
    { en: "Two random values, a salt and a nonce, made when a copy is protected", fr: "Deux valeurs aléatoires, un sel et un nonce, produites quand une copie est protégée" },
  ),
  row(
    "apps/web/src/privacy/panel/signals.ts", 3, "shown-only",
    { en: "The privacy signals in this panel", fr: "Les signaux de confidentialité dans ce panneau" },
    { en: "Whether your browser sends a global privacy control or a do not track signal, and whether cookies are on", fr: "Si votre navigateur envoie un contrôle global de la confidentialité ou un signal de non-suivi, et si les témoins sont activés" },
  ),
  row(
    "apps/web/src/shell/useApplyPreferences.ts", 2, "not-kept",
    { en: "The look of the App", fr: "L’apparence de l’App" },
    { en: "Whether your browser asks for more contrast", fr: "Si votre navigateur demande plus de contraste" },
  ),
  row(
    "apps/web/src/storage/repository.ts", 1, "on-device",
    { en: "Reports waiting on this device", fr: "Signalements en attente sur cet appareil" },
    { en: "A random number for each report in the queue", fr: "Un nombre aléatoire pour chaque signalement en attente" },
  ),
];

/** Problems that do not depend on the source: repeats, empty or bad fields, an unsorted list. */
export function checkIdentifierRegister(rows: readonly IdentifierRow[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let last = "";
  for (const r of rows) {
    if (seen.has(r.path)) out.push(`${r.path}: listed twice`);
    seen.add(r.path);
    if (!r.path.startsWith("apps/web/src/")) out.push(`${r.path}: not a file of the App`);
    if (!Number.isInteger(r.count) || r.count < 1) out.push(`${r.path}: the count is not a positive whole number`);
    for (const l of ["en", "fr"] as const) {
      if (r.where[l].trim() === "") out.push(`${r.path}: no ${l} name for the part`);
      if (r.what[l].trim() === "") out.push(`${r.path}: no ${l} words for what it makes or reads`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.recordedOn)) out.push(`${r.path}: the date is not YYYY-MM-DD`);
    if (r.path < last) out.push(`${r.path}: not in order`);
    last = r.path;
  }
  return out;
}

export function identifierTotal(rows: readonly IdentifierRow[]): number {
  return rows.reduce((n, r) => n + r.count, 0);
}

/** How many places keep a value on the device, write it into a copy, show it only, or do not keep it. */
export function identifierKeptCounts(rows: readonly IdentifierRow[]): Record<IdentifierKept, number> {
  const out: Record<IdentifierKept, number> = { "on-device": 0, "not-kept": 0, "in-copy": 0, "shown-only": 0 };
  for (const r of rows) out[r.kept] += r.count;
  return out;
}
