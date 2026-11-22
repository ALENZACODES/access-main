// The places in the App where the App reads a file the person picked from their device: a file chosen through a file
// input, and a file reader. The list says which file reads each one, how many places in that file do, what the person
// can give, which kinds of file the input offers and when the size of the file is limited: before the file is read, or
// only once its text is in memory. audit/pickScan.ts reads the source and fails CI when the list and the source
// disagree, so a new way to bring a file in cannot appear unseen.
//
// A row says what was read in the code. It does not say what the App does with the content once it is read beyond what
// the audits check, and it does not say what is in a file the person picks. A file input's `accept` list only filters
// what the browser offers; it does not stop a person choosing another file, and no row says it does. "none-found"
// means no size check was found in that file, not that the App has none.

import { isIsoDate, type Bilingual } from "./inventory";

export type PickKind = "pick" | "reader";

export const PICK_KINDS: readonly PickKind[] = ["pick", "reader"];

/** The kinds of file an input offers, from its accept list. "UNKNOWN" where the list is not in the file. */
export type PickAccept = "json" | "csv" | "geojson" | "image" | "UNKNOWN";

export const PICK_ACCEPTS: readonly PickAccept[] = ["json", "csv", "geojson", "image", "UNKNOWN"];

/**
 * When the size of the picked file is limited, as far as the file's own code shows:
 * - before-read: the size is compared with a limit before the text is read
 * - after-read: the text is read first and the limit is applied to it afterwards, in the file named in `checkedIn`
 * - mixed: a file with more than one pick, some limited before reading and some not
 * - none-found: no size check was found in the file
 * - not-applicable: a reader, which only reads what a pick hands it
 */
export type PickLimit = "before-read" | "after-read" | "mixed" | "none-found" | "not-applicable";

export const PICK_LIMITS: readonly PickLimit[] = ["before-read", "after-read", "mixed", "none-found", "not-applicable"];

export interface PickRow {
  kind: PickKind;
  /** Repo-relative path of the file */
  path: string;
  /** How many places in that file pick or read a file */
  uses: number;
  /** What the person can give, in plain words */
  reads: Bilingual;
  /** The kinds of file the input offers. Empty for a reader. */
  accepts: readonly PickAccept[];
  limit: PickLimit;
  /** For after-read: the repo-relative path of the file that applies the limit to the text */
  checkedIn?: string;
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-21";
const SOURCE = "Read from the source file named in the row";
const WEB = "apps/web/src/";
const ROBUST = `${WEB}offline/robust/`;
const RECOVERY = `${WEB}recovery/`;

const row = (kind: PickKind, path: string, uses: number, reads: [string, string], accepts: readonly PickAccept[], limit: PickLimit, checkedIn?: string): PickRow => ({
  kind,
  path,
  uses,
  reads: { en: reads[0], fr: reads[1] },
  accepts,
  limit,
  ...(checkedIn === undefined ? {} : { checkedIn }),
  source: SOURCE,
  recordedOn: REVIEWED,
});

const J: readonly PickAccept[] = ["json"];

export const PICK_REGISTER: readonly PickRow[] = [
  row("pick", `${WEB}contribute/ContributePage.tsx`, 2, ["Photos for a contribution, or a contribution file", "Des photos pour une contribution, ou un fichier de contribution"], ["image", "json", "geojson"], "mixed"),
  row("pick", `${WEB}offline/evidence-workbench/EvidenceWorkbench.tsx`, 1, ["Notes for the evidence workbench", "Des notes pour l’atelier de preuves"], J, "before-read"),
  row("pick", `${WEB}offline/packing/PackingTransfer.tsx`, 1, ["A packing list backup", "Une copie de sauvegarde d’une liste de bagages"], J, "none-found"),
  row("pick", `${WEB}offline/communicationCards/CardBackup.tsx`, 1, ["A communication card backup", "Une sauvegarde des cartes de communication"], J, "before-read"),
  row("pick", `${ROBUST}accessInquiryPanel.ts`, 1, ["An access inquiry", "Une demande de renseignements sur l’accès"], J, "before-read"),
  row("pick", `${ROBUST}accessPreparationPanel.ts`, 1, ["An access preparation notebook", "Un cahier de préparation de l’accès"], J, "before-read"),
  row("pick", `${ROBUST}contingencyPanel.ts`, 1, ["A contingency plan", "Un plan de secours"], J, "before-read"),
  row("pick", `${ROBUST}coordinationBriefPanel.ts`, 1, ["A coordination brief", "Une note de coordination"], J, "before-read"),
  row("pick", `${ROBUST}dependencyPlannerPanel.ts`, 1, ["A dependency plan", "Un plan des dépendances"], J, "after-read", `${ROBUST}dependencyPlanner.ts`),
  row("pick", `${ROBUST}handoffRehearsalPanel.ts`, 1, ["A handoff record", "Un dossier de transfert"], J, "before-read"),
  row("pick", `${ROBUST}localEvidenceTimelinePanel.ts`, 1, ["A timeline of local evidence", "Une chronologie des preuves locales"], J, "before-read"),
  row("pick", `${ROBUST}offlineCasebookPanel.ts`, 1, ["An offline casebook", "Un recueil de cas hors ligne"], J, "before-read"),
  row("pick", `${ROBUST}reconciliationWorkbookPanel.ts`, 1, ["A reconciliation workbook", "Un classeur de rapprochement"], J, "before-read"),
  row("pick", `${ROBUST}transferChecklistPanel.ts`, 1, ["A checklist for moving a region to another device", "Une liste de contrôle pour déplacer une région vers un autre appareil"], J, "before-read"),
  row("pick", `${WEB}privacy/panel/mount.ts`, 2, ["A backup of what this device keeps, plain or protected with a passphrase", "Une copie de sauvegarde de ce que garde cet appareil, simple ou protégée par une phrase secrète"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryCaseJournal.tsx`, 1, ["A recovery case journal", "Un journal de cas de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryCheckpointPanel.tsx`, 1, ["A recovery checkpoint", "Un point de contrôle de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryDecisionMatrix.tsx`, 1, ["A recovery decision matrix", "Une matrice de décision de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryDrillPanel.tsx`, 1, ["A recovery drill", "Un exercice de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryEvidenceNotebook.tsx`, 1, ["A recovery evidence notebook", "Un carnet de preuves de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryEvidencePacketPanel.tsx`, 1, ["A recovery evidence packet", "Un dossier de preuves de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryFailureChecklist.tsx`, 1, ["A failure checklist", "Une liste de contrôle des pannes"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryHandoffChainPanel.tsx`, 1, ["A chain of recovery handoffs", "Une chaîne de transferts de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryHandoffPanel.tsx`, 1, ["A recovery handoff", "Un transfert de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryPlanReview.tsx`, 1, ["A recovery plan to review", "Un plan de récupération à examiner"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryProvenanceLedger.tsx`, 1, ["A provenance ledger", "Un registre de provenance"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryReceiptLedgerPanel.tsx`, 1, ["A receipt ledger", "Un registre de reçus"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryReconciliationPanel.tsx`, 1, ["A reconciliation record", "Un dossier de rapprochement"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryRepairAttempts.tsx`, 1, ["A record of repair attempts", "Un registre de tentatives de réparation"], J, "before-read"),
  row("pick", `${RECOVERY}RecoverySessionTracePanel.tsx`, 1, ["A session trace", "Une trace de séance"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryTaskBoard.tsx`, 1, ["A recovery task board", "Un tableau de tâches de récupération"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryTransferPreflight.tsx`, 1, ["A transfer preflight record", "Un dossier de contrôle avant transfert"], J, "before-read"),
  row("pick", `${RECOVERY}RecoveryTransferWitnessPanel.tsx`, 1, ["A transfer witness record", "Un dossier de témoin de transfert"], J, "before-read"),
  row("pick", `${WEB}states/PackCompare.tsx`, 1, ["An earlier saved list of places, as a spreadsheet file", "Une ancienne liste de lieux enregistrée, en fichier tableur"], ["csv"], "after-read", `${WEB}states/packEarlier.ts`),
  row("reader", `${WEB}states/PackCompare.tsx`, 1, ["The same earlier saved list, read in the browser", "La même ancienne liste, lue dans le navigateur"], [], "not-applicable"),
];

export type PickProblemCode =
  | "bad-path"
  | "bad-kind"
  | "bad-count"
  | "bad-accept"
  | "bad-limit"
  | "empty-text"
  | "empty-source"
  | "bad-date"
  | "accepts-on-reader"
  | "pick-without-accepts"
  | "unknown-with-others"
  | "duplicate-accepts"
  | "reader-limit"
  | "pick-not-applicable"
  | "checked-in-missing"
  | "checked-in-unexpected"
  | "mixed-needs-two"
  | "duplicate-row";

export interface PickProblem {
  code: PickProblemCode;
  kind: PickKind;
  path: string;
  detail?: string;
}

const PATH_RE = /^apps\/web\/src\/[A-Za-z0-9_./-]+\.(?:ts|tsx)$/;

/** Problems in a list of rows. Empty means every row is well formed. */
export function validatePick(rows: readonly PickRow[]): PickProblem[] {
  const out: PickProblem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const at = { kind: r.kind, path: r.path };
    if (!PATH_RE.test(r.path) || r.path.includes("..") || r.path.includes("//")) out.push({ code: "bad-path", ...at });
    if (!PICK_KINDS.includes(r.kind)) out.push({ code: "bad-kind", ...at });
    if (!Number.isInteger(r.uses) || r.uses < 1) out.push({ code: "bad-count", ...at, detail: String(r.uses) });
    if (r.reads.en.trim() === "" || r.reads.fr.trim() === "") out.push({ code: "empty-text", ...at });
    if (r.source.trim() === "") out.push({ code: "empty-source", ...at });
    if (!isIsoDate(r.recordedOn)) out.push({ code: "bad-date", ...at, detail: r.recordedOn });
    for (const a of r.accepts) if (!PICK_ACCEPTS.includes(a)) out.push({ code: "bad-accept", ...at, detail: String(a) });
    if (!PICK_LIMITS.includes(r.limit)) out.push({ code: "bad-limit", ...at, detail: String(r.limit) });
    if (r.kind === "reader" && r.accepts.length > 0) out.push({ code: "accepts-on-reader", ...at });
    if (r.kind === "pick" && r.accepts.length === 0) out.push({ code: "pick-without-accepts", ...at });
    if (r.accepts.includes("UNKNOWN") && r.accepts.length > 1) out.push({ code: "unknown-with-others", ...at });
    if (new Set(r.accepts).size !== r.accepts.length) out.push({ code: "duplicate-accepts", ...at });
    if (r.kind === "reader" && r.limit !== "not-applicable") out.push({ code: "reader-limit", ...at });
    if (r.kind === "pick" && r.limit === "not-applicable") out.push({ code: "pick-not-applicable", ...at });
    if (r.limit === "after-read" && (r.checkedIn === undefined || !PATH_RE.test(r.checkedIn))) out.push({ code: "checked-in-missing", ...at });
    if (r.limit !== "after-read" && r.checkedIn !== undefined) out.push({ code: "checked-in-unexpected", ...at });
    if (r.limit === "mixed" && r.uses < 2) out.push({ code: "mixed-needs-two", ...at });
    const id = `${r.kind} ${r.path}`;
    if (seen.has(id)) out.push({ code: "duplicate-row", ...at });
    seen.add(id);
  }
  const key = (x: PickProblem): string => `${x.kind}\u0000${x.path}\u0000${x.code}\u0000${x.detail ?? ""}`;
  return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Throws at start-up when the rows are wrong, like the other registers. */
export function assertPick(rows: readonly PickRow[]): void {
  const p = validatePick(rows);
  if (p.length > 0) throw new Error(`Picked files register is wrong: ${p.map((x) => `${x.code} ${x.kind} ${x.path}${x.detail === undefined ? "" : ` (${x.detail})`}`).join("; ")}`);
}

export interface PickCounts {
  /** Rows */
  total: number;
  /** Places in the source, over all rows */
  uses: number;
  /** Different files */
  files: number;
  /** Rows limited before the file is read */
  before: number;
  /** Rows limited only after the text is read */
  after: number;
  /** Rows where some picks are limited before reading and some are not, or where no size check was found */
  unlimited: number;
}

export function pickCounts(rows: readonly PickRow[]): PickCounts {
  return {
    total: rows.length,
    uses: rows.reduce((n, r) => n + r.uses, 0),
    files: new Set(rows.map((r) => r.path)).size,
    before: rows.filter((r) => r.limit === "before-read").length,
    after: rows.filter((r) => r.limit === "after-read").length,
    unlimited: rows.filter((r) => r.limit === "mixed" || r.limit === "none-found").length,
  };
}

/** The rows for one kind, in the order of the rows. */
export function picksOfKind(rows: readonly PickRow[], kind: PickKind): PickRow[] {
  return rows.filter((r) => r.kind === kind);
}

/** The rows sorted by kind (in the order of the list of kinds) and then by path. */
export function pickKindOrder(rows: readonly PickRow[]): PickRow[] {
  return [...rows].sort((a, b) => PICK_KINDS.indexOf(a.kind) - PICK_KINDS.indexOf(b.kind) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export const PICK_KIND_LABELS: Readonly<Record<PickKind, Bilingual>> = {
  pick: { en: "A file you choose", fr: "Un fichier que vous choisissez" },
  reader: { en: "A file reader", fr: "Un lecteur de fichier" },
};

export const PICK_ACCEPT_LABELS: Readonly<Record<PickAccept, Bilingual>> = {
  json: { en: "JSON", fr: "JSON" },
  csv: { en: "CSV", fr: "CSV" },
  geojson: { en: "GeoJSON", fr: "GeoJSON" },
  image: { en: "pictures", fr: "images" },
  UNKNOWN: { en: "Unknown", fr: "Inconnu" },
};

export const PICK_LIMIT_LABELS: Readonly<Record<PickLimit, Bilingual>> = {
  "before-read": { en: "Size checked before the file is read", fr: "Taille contrôlée avant la lecture du fichier" },
  "after-read": { en: "Size checked after the file is read", fr: "Taille contrôlée après la lecture du fichier" },
  mixed: { en: "Size checked before reading for some files, not for others", fr: "Taille contrôlée avant la lecture pour certains fichiers, pas pour d’autres" },
  "none-found": { en: "No size check found in this file", fr: "Aucun contrôle de taille trouvée dans ce fichier" },
  "not-applicable": { en: "Reads what a choice hands it", fr: "Lit ce que lui remet un choix" },
};

/** The kinds of file in plain words, for example "JSON, CSV". "" for a reader. */
export function acceptsText(locale: "en" | "fr", accepts: readonly PickAccept[]): string {
  return accepts.map((a) => PICK_ACCEPT_LABELS[a][locale]).join(", ");
}
