// The places in the App's own text that say data stays on the device or is not sent, written down so a new
// statement cannot appear unreviewed and so each one can be set beside what the code does. One row per file that
// holds such statements, with how many lines say it in each language. audit/claimScan.ts reads the source and
// fails CI when a count drifts. The check against the code is narrow on purpose: it asks only whether the file
// that holds the statement makes a network request itself. Code in other files is not covered, so a pass is not
// proof that the statement is true, and a file that does make requests is left as unknown.

import type { CallRow } from "./addressRegister";
import type { Bilingual } from "./inventory";

export interface StatementRow {
  /** Repo-relative path of the file that holds the statements */
  path: string;
  /** The part of the App the statements are shown in, in plain words */
  where: Bilingual;
  /** Lines with an English statement */
  en: number;
  /** Lines with a French statement */
  fr: number;
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-21";
const SOURCE = "Read from the source file named in the row";

const row = (path: string, en: number, fr: number, whereEn: string, whereFr: string): StatementRow => ({ path, where: { en: whereEn, fr: whereFr }, en, fr, source: SOURCE, recordedOn: REVIEWED });

export const STATEMENT_REGISTER: readonly StatementRow[] = [
  row("apps/web/src/contribute/catalog.ts", 0, 1, "Contributing a place", "Contribuer un lieu"),
  row("apps/web/src/data-status/fileGuide.ts", 1, 1, "The data status file guide", "Le guide des fichiers sur l’état des données"),
  row("apps/web/src/hub/i18n.ts", 3, 4, "Hub notes on games, route reports and event plans", "Les notes du hub sur les jeux, les signalements de parcours et les plans d’événement"),
  row("apps/web/src/i18n/en.ts", 13, 0, "The main text of the App in English", "Le texte principal de l’App en anglais"),
  row("apps/web/src/i18n/fr.ts", 0, 10, "The main text of the App in French", "Le texte principal de l’App en français"),
  row("apps/web/src/input/rehearsal/copy.ts", 1, 1, "Journey rehearsal", "La répétition de parcours"),
  row("apps/web/src/offline/evidence-workbench/EvidenceWorkbench.tsx", 1, 0, "Local evidence workbench notes", "Notes de l’atelier de preuves local"),
  row("apps/web/src/offline/robust/cleanupCopy.ts", 1, 0, "Offline storage cleanup", "Le nettoyage du stockage hors ligne"),
  row("apps/web/src/offline/robust/offlineCasebookCopy.ts", 0, 1, "Notes on offline copies", "Les notes sur les copies hors ligne"),
  row("apps/web/src/offline/robust/offlineCopy.ts", 0, 1, "Offline downloads", "Les téléchargements hors ligne"),
  row("apps/web/src/offline/robust/recoveryBatchesCopy.ts", 1, 1, "The recovery batches plan", "Le plan des lots de reprise"),
  row("apps/web/src/offline/robust/updateCopy.ts", 1, 1, "The offline update review", "L’examen de la mise à jour hors ligne"),
  row("apps/web/src/pages/AboutPage.tsx", 1, 0, "The About page", "La page À propos"),
  row("apps/web/src/recovery/RecoveryPlanReview.tsx", 1, 1, "Recovery plan file review", "Examen d’un fichier de plan de récupération"),
  row("apps/web/src/recovery/recoveryLedger.ts", 1, 0, "The recovery ledger", "Le registre de reprise"),
  row("apps/web/src/recovery/recoveryReconciliationCopy.ts", 1, 1, "Recovery reconciliation register", "Registre de rapprochement des récupérations"),
  row("apps/web/src/states/PackCompare.tsx", 1, 1, "Comparing a places file", "La comparaison d’un fichier de lieux"),
];

export type StatementCheck = "no-requests-in-file" | "requests-in-file" | "not-checked";

export interface StatementResult {
  row: StatementRow;
  /** "requests-in-file" when the file that holds the statements also makes a network request. The check cannot confirm those. */
  check: StatementCheck;
}

/**
 * Sets each row beside the places that make network requests. Same order as the rows. Without the list of those
 * places (null) nothing can be said, so every row is "not-checked" and is never counted as a pass.
 */
export function checkStatements(rows: readonly StatementRow[], calls: readonly CallRow[] | null): StatementResult[] {
  if (calls === null) return rows.map((r) => ({ row: r, check: "not-checked" }));
  const requesting = new Set(calls.map((c) => c.path));
  return rows.map((r) => ({ row: r, check: requesting.has(r.path) ? "requests-in-file" : "no-requests-in-file" }));
}

export function statementTotal(rows: readonly StatementRow[]): number {
  return rows.reduce((n, r) => n + r.en + r.fr, 0);
}

/** Problems that do not depend on the source: repeats, empty or bad fields, no statements in a row. */
export function checkStatementRegister(rows: readonly StatementRow[]): string[] {
  const problems: string[] = [];
  const paths = new Set<string>();
  for (const r of rows) {
    if (paths.has(r.path)) problems.push(`${r.path}: listed twice`);
    paths.add(r.path);
    if (r.path.trim() === "") problems.push("a row has an empty path");
    if (!Number.isInteger(r.en) || !Number.isInteger(r.fr) || r.en < 0 || r.fr < 0) problems.push(`${r.path}: counts must be whole numbers of at least 0`);
    else if (r.en + r.fr === 0) problems.push(`${r.path}: has no statements`);
    if (r.where.en.trim() === "" || r.where.fr.trim() === "") problems.push(`${r.path}: where is empty in one language`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.recordedOn)) problems.push(`${r.path}: recordedOn is not YYYY-MM-DD`);
    if (r.source.trim() === "") problems.push(`${r.path}: source is empty`);
  }
  return problems;
}
