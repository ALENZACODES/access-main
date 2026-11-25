// The places in the App where the code makes a file for the person to save. The list says which file does it, how many
// places in that file do, what the file is about and which file formats the code of that file names. audit/saveScan.ts
// reads the source and fails CI when the list and the source disagree, so a new download cannot appear unseen.
//
// A row says what was read in the code: the file's own name and the names of its functions give "what it is about",
// and the formats are the ones the file's text names. A row does not say what is inside a given download, whether a
// person chose to make it, or where the file goes after the browser saves it: those are outside the row. A row never
// claims that a file is sent or kept anywhere; the other lists say what the App keeps and sends.

import { isIsoDate, type Bilingual } from "./inventory";

/** The formats the code of the file names: JSON, plain text, CSV, JSON and plain text, several, or none (the caller passes it in). */
export type SaveKind = "json" | "text" | "csv" | "json-and-text" | "mixed" | "none";

export const SAVE_KINDS: readonly SaveKind[] = ["json", "json-and-text", "text", "csv", "mixed", "none"];

export interface SaveRow {
  kind: SaveKind;
  /** Repo-relative path of the file */
  path: string;
  /** How many places in that file make a file to save */
  uses: number;
  /** What the file made is about, in plain words */
  makes: Bilingual;
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-21";
const SOURCE = "Read from the source file named in the row";

const row = (kind: SaveKind, path: string, uses: number, makes: [string, string]): SaveRow => ({
  kind,
  path,
  uses,
  makes: { en: makes[0], fr: makes[1] },
  source: SOURCE,
  recordedOn: REVIEWED,
});

export const SAVE_REGISTER: readonly SaveRow[] = [
  row("json", "apps/web/src/features/featureScreens.tsx", 1, ["An evidence pack", "Un dossier de preuves"]),
  row("none", "apps/web/src/hub/ReportsPage.tsx", 1, ["A report, in the format the report gives", "Un rapport, dans le format que le rapport indique"]),
  row("mixed", "apps/web/src/input/rehearsal/AccessRehearsalPage.tsx", 1, ["A file from the access rehearsal page", "Un fichier de la page de répétition de l’accès"]),
  row("mixed", "apps/web/src/input/switch-workbench/WorkbenchPage.tsx", 1, ["A keyboard and switch rehearsal report or handoff", "Un rapport ou une fiche de transmission sur la navigation au clavier et par contacteur"]),
  row("mixed", "apps/web/src/data-status/standalone/main.ts", 1, ["A data status file", "Un fichier sur l’état des données"]),
  row("csv", "apps/web/src/pages/DataStatusPage.tsx", 1, ["A data status file", "Un fichier sur l’état des données"]),
  row("text", "apps/web/src/states/downloadFile.ts", 1, ["Any file handed to the shared download helper", "Tout fichier confié à l’outil de téléchargement commun"]),
  row("none", "apps/web/src/privacy/panel/mount.ts", 1, ["The lists and files this panel prepares", "Les listes et fichiers que ce panneau prépare"]),
  row("json", "apps/web/src/offline/robust/sourceLedgerPanel.ts", 1, ["A source ledger", "Un registre des sources"]),
  row("json-and-text", "apps/web/src/offline/robust/contingencyExport.ts", 1, ["A contingency plan for a region", "Un plan de contingence pour une région"]),
  row("json-and-text", "apps/web/src/offline/robust/packChangeImpactPanel.ts", 1, ["A comparison of the effect of a pack change", "Une comparaison de l’effet d’un changement de paquet"]),
  row("json-and-text", "apps/web/src/offline/robust/continuityDrillExport.ts", 1, ["An offline continuity report", "Un rapport de continuité hors ligne"]),
  row("json-and-text", "apps/web/src/offline/robust/accessInquiryExport.ts", 1, ["An access inquiry", "Une demande de renseignements sur l’accès"]),
  row("json-and-text", "apps/web/src/offline/robust/offlineCasebookExport.ts", 1, ["An offline casebook for a region", "Un cahier de cas hors ligne pour une région"]),
  row("json", "apps/web/src/offline/robust/transferChecklistPanel.ts", 1, ["A transfer checklist", "Une liste de contrôle de transfert"]),
  row("json-and-text", "apps/web/src/offline/robust/sourceAgeExport.ts", 1, ["A report on the age of sources", "Un rapport sur l’âge des sources"]),
  row("json-and-text", "apps/web/src/offline/robust/snapshotComparisonExport.ts", 2, ["A comparison of region snapshots, and a snapshot of a region", "Une comparaison d’instantanés de région et un instantané de région"]),
  row("json-and-text", "apps/web/src/offline/robust/cleanupReceipt.ts", 1, ["A receipt for a clean-up", "Un reçu de nettoyage"]),
  row("json", "apps/web/src/offline/robust/offlineDiagnosticsPanel.ts", 1, ["Offline diagnostics for a region", "Des diagnostics hors ligne pour une région"]),
  row("json-and-text", "apps/web/src/offline/robust/updateReviewExport.ts", 1, ["A review of an update", "Un examen d’une mise à jour"]),
  row("json-and-text", "apps/web/src/offline/robust/localEvidenceTimelineExport.ts", 1, ["A timeline of local evidence", "Une chronologie de preuves locales"]),
  row("json-and-text", "apps/web/src/offline/robust/coordinationBriefExport.ts", 1, ["A coordination brief", "Une note de coordination"]),
  row("json-and-text", "apps/web/src/pages/ProfilePage.tsx", 1, ["A file from the profile page", "Un fichier de la page de profil"]),
  row("json-and-text", "apps/web/src/offline/evidence-workbench/EvidenceWorkbench.tsx", 1, ["A file from the evidence workbench", "Un fichier de l’atelier de preuves"]),
  row("json-and-text", "apps/web/src/offline/robust/localReport.ts", 1, ["A local report for a region", "Un rapport local pour une région"]),
  row("json-and-text", "apps/web/src/offline/robust/storageDurabilityPanel.ts", 1, ["A storage durability report for a region", "Un rapport sur la durabilité du stockage pour une région"]),
  row("json-and-text", "apps/web/src/offline/robust/accessPreparationExport.ts", 1, ["An access preparation file", "Un fichier de préparation de l’accès"]),
  row("json", "apps/web/src/offline/robust/readinessPanel.ts", 1, ["An offline readiness report", "Un rapport de préparation hors ligne"]),
  row("json-and-text", "apps/web/src/offline/robust/reconciliationWorkbookExport.ts", 1, ["A reconciliation workbook", "Un classeur de rapprochement"]),
  row("json-and-text", "apps/web/src/offline/robust/offlineQuestionSheetExport.ts", 1, ["An offline question sheet", "Une feuille de questions hors ligne"]),
  row("json-and-text", "apps/web/src/offline/robust/recoveryBatchesExport.ts", 1, ["A report on recovery batches", "Un rapport sur les lots de récupération"]),
  row("json-and-text", "apps/web/src/offline/robust/sessionComparisonExport.ts", 1, ["A comparison of sessions", "Une comparaison de séances"]),
  row("text", "apps/web/src/offline/robust/dependencyPlannerExport.ts", 1, ["A dependency plan", "Un plan de dépendances"]),
  row("text", "apps/web/src/offline/robust/triageExport.ts", 1, ["An offline recovery list", "Une liste de récupération hors ligne"]),
  row("json-and-text", "apps/web/src/offline/robust/handoffRehearsalPanel.ts", 2, ["A handoff manifest and a handoff review", "Un manifeste de transfert et un examen du transfert"]),
  row("json", "packages/trip-check/src/export.ts", 1, ["A trip check file", "Un fichier du contrôle de trajet"]),
  row("none", "packages/advocacy/src/ui/ReportsPanel.tsx", 1, ["A report, in the format the report gives", "Un rapport, dans le format que le rapport indique"]),
  row("json", "packages/advocacy/src/ui/App.tsx", 1, ["An advocacy file", "Un fichier de plaidoyer"]),
  row("json", "packages/proposals/src/ReviewQueue.tsx", 1, ["A file of contributions from the review queue", "Un fichier de contributions de la file d’examen"]),
  row("none", "packages/contribute/src/export.ts", 1, ["A file of contributions, made by the contribute package", "Un fichier de contributions, fabriqué par le module de contribution"]),
];

const PATH_RE = /^(?:apps\/web\/src|packages\/[a-z][a-z0-9-]*\/src)\/[A-Za-z0-9_./-]+\.(?:ts|tsx)$/;

export type SaveProblemCode = "bad-path" | "bad-kind" | "bad-count" | "empty-text" | "empty-source" | "bad-date" | "duplicate-row" | "same-text";

export interface SaveProblem {
  code: SaveProblemCode;
  path: string;
  kind: SaveKind;
  detail?: string;
}

export function validateSave(rows: readonly SaveRow[]): SaveProblem[] {
  const out: SaveProblem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const at = { kind: r.kind, path: r.path };
    if (!PATH_RE.test(r.path) || r.path.includes("..") || r.path.includes("//")) out.push({ code: "bad-path", ...at });
    if (!SAVE_KINDS.includes(r.kind)) out.push({ code: "bad-kind", ...at });
    if (!Number.isInteger(r.uses) || r.uses < 1) out.push({ code: "bad-count", ...at, detail: String(r.uses) });
    if (r.makes.en.trim() === "" || r.makes.fr.trim() === "") out.push({ code: "empty-text", ...at });
    else if (r.makes.en === r.makes.fr) out.push({ code: "same-text", ...at, detail: r.makes.en });
    if (r.source.trim() === "") out.push({ code: "empty-source", ...at });
    if (!isIsoDate(r.recordedOn)) out.push({ code: "bad-date", ...at, detail: r.recordedOn });
    if (seen.has(r.path)) out.push({ code: "duplicate-row", ...at });
    seen.add(r.path);
  }
  const key = (x: SaveProblem): string => `${x.path}\u0000${x.kind}\u0000${x.code}\u0000${x.detail ?? ""}`;
  return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Throws at start-up when the rows are wrong, like the other registers. */
export function assertSave(rows: readonly SaveRow[]): void {
  const p = validateSave(rows);
  if (p.length > 0) throw new Error(`Downloads register is wrong: ${p.map((x) => `${x.code} ${x.path}${x.detail === undefined ? "" : ` (${x.detail})`}`).join("; ")}`);
}

export interface SaveCounts {
  /** Rows */
  total: number;
  /** Places in the source, over all rows */
  uses: number;
  /** Different files */
  files: number;
  /** Rows whose file names at least one format itself */
  named: number;
  /** Rows whose file names no format, so the caller passes it in */
  caller: number;
}

export function saveCounts(rows: readonly SaveRow[]): SaveCounts {
  return {
    total: rows.length,
    uses: rows.reduce((n, r) => n + r.uses, 0),
    files: new Set(rows.map((r) => r.path)).size,
    named: rows.filter((r) => r.kind !== "none").length,
    caller: rows.filter((r) => r.kind === "none").length,
  };
}

/** The rows for one kind, in the order of the rows. */
export function saveOfKind(rows: readonly SaveRow[], kind: SaveKind): SaveRow[] {
  return rows.filter((r) => r.kind === kind);
}

/** The rows sorted by kind (in the order of the list of kinds) and then by path. */
export function saveKindOrder(rows: readonly SaveRow[]): SaveRow[] {
  return [...rows].sort((a, b) => SAVE_KINDS.indexOf(a.kind) - SAVE_KINDS.indexOf(b.kind) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export const SAVE_KIND_LABELS: Readonly<Record<SaveKind, Bilingual>> = {
  json: { en: "Names JSON", fr: "Nomme le JSON" },
  "json-and-text": { en: "Names JSON and plain text", fr: "Nomme le JSON et le texte brut" },
  text: { en: "Names plain text", fr: "Nomme le texte brut" },
  csv: { en: "Names CSV", fr: "Nomme le CSV" },
  mixed: { en: "Names several formats", fr: "Nomme plusieurs formats" },
  none: { en: "Names no format (the caller passes it in)", fr: "Ne nomme aucun format (l’appelant le transmet)" },
};
