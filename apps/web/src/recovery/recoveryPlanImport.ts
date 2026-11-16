import type { RecoveryLocale, RecoverySource } from "./index";
import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";
import type { LocalPlanDocument, LocalPlanEntry } from "./recoveryPlanExport";

/** Strict, bounded inspection of a user-supplied recovery plan. No file access. */
export type ImportIssue =
  | "empty" | "too-large" | "invalid-json" | "invalid-shape" | "unknown-format"
  | "invalid-date" | "future-date" | "invalid-outcome" | "too-many-packs"
  | "invalid-id" | "duplicate-id" | "invalid-state" | "invalid-stage"
  | "invalid-source" | "source-date" | "source-future" | "closed-licence"
  | "invalid-session" | "unexpected-field" | "unsafe-text";

export interface ImportFinding {
  readonly code: ImportIssue;
  readonly path: string;
}
export type ImportResult =
  | { readonly ok: true; readonly document: LocalPlanDocument; readonly findings: readonly [] }
  | { readonly ok: false; readonly document: null; readonly findings: readonly ImportFinding[] };

export interface ImportLimits {
  readonly maxBytes?: number;
  readonly maxEntries?: number;
  /** Required: supplied local inspection date; never infer from device clock. */
  readonly referenceDate: string;
}

const MAX_BYTES = 512 * 1024;
const MAX_ENTRIES = 500;
const MAX_FINDINGS = 100;
const allowedRoot = ["format", "inspectionDate", "outcome", "entries", "session"] as const;
const allowedEntry = ["packId", "localState", "queueStage", "source"] as const;
const allowedSource = ["name", "licence", "date"] as const;
const allowedSession = ["actions", "omitted"] as const;
const validStates = ["absent", "corrupt", "ready", "unknown"] as const;
const validStages = ["pending", "selected", "waiting", "recheck", "done", "unknown"] as const;
const validOutcomes = ["needs-action", "review", "unknown", "no-local-issue"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function inSet<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.some((entry) => entry === value);
}
function ownKeys(value: Record<string, unknown>, permitted: readonly string[]): boolean {
  return Object.keys(value).every((key) => permitted.includes(key));
}
function safeText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit &&
    !/[\u0000-\u001f\u007f-\u009f<>]/u.test(value) &&
    value === value.normalize("NFC");
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
}
function add(findings: ImportFinding[], code: ImportIssue, path: string): void {
  if (findings.length < MAX_FINDINGS) findings.push({ code, path });
}

function inspectSource(
  value: unknown, path: string, date: number, findings: ImportFinding[],
): RecoverySource | null {
  if (value === null) return null;
  if (!record(value) || !ownKeys(value, allowedSource)) {
    add(findings, "invalid-source", path); return null;
  }
  if (!safeText(value.name, 160) || !safeText(value.licence, 80) ||
    !safeText(value.date, 10)) {
    add(findings, "invalid-source", path); return null;
  }
  if (!isOpenLicence(value.licence)) add(findings, "closed-licence", `${path}.licence`);
  const parsed = parseCalendarDate(value.date);
  if (parsed === null) add(findings, "source-date", `${path}.date`);
  else if (parsed > date) add(findings, "source-future", `${path}.date`);
  return { name: value.name, licence: value.licence, date: value.date };
}

/** Parse a portable plan as hostile input. Do not apply imported queue stages. */
export function inspectRecoveryPlan(text: string, limits: ImportLimits): ImportResult {
  const findings: ImportFinding[] = [];
  const reference = parseCalendarDate(limits.referenceDate);
  if (reference === null) add(findings, "invalid-date", "referenceDate");
  const byteLimit = limits.maxBytes !== undefined && Number.isSafeInteger(limits.maxBytes) &&
    limits.maxBytes > 0 && limits.maxBytes <= MAX_BYTES ? limits.maxBytes : MAX_BYTES;
  const entryLimit = limits.maxEntries !== undefined && Number.isSafeInteger(limits.maxEntries) &&
    limits.maxEntries > 0 && limits.maxEntries <= MAX_ENTRIES ? limits.maxEntries : MAX_ENTRIES;
  if (text.trim() === "") add(findings, "empty", "$" );
  if (new TextEncoder().encode(text).byteLength > byteLimit) add(findings, "too-large", "$" );
  if (findings.length > 0) return { ok: false, document: null, findings };
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { return { ok: false, document: null, findings: [{ code: "invalid-json", path: "$" }] }; }
  if (!record(value)) return { ok: false, document: null, findings: [{ code: "invalid-shape", path: "$" }] };
  if (!ownKeys(value, allowedRoot)) add(findings, "unexpected-field", "$" );
  if (value.format !== "local-recovery-plan-v1") add(findings, "unknown-format", "format");
  const inspection = typeof value.inspectionDate === "string" ? parseCalendarDate(value.inspectionDate) : null;
  if (inspection === null) add(findings, "invalid-date", "inspectionDate");
  else if (reference !== null && inspection > reference) add(findings, "future-date", "inspectionDate");
  if (!inSet(value.outcome, validOutcomes)) add(findings, "invalid-outcome", "outcome");
  if (!Array.isArray(value.entries)) add(findings, "invalid-shape", "entries");
  else if (value.entries.length > entryLimit) add(findings, "too-many-packs", "entries");
  if (!record(value.session) || !ownKeys(value.session, allowedSession) ||
    !nonnegative(value.session.actions) || !nonnegative(value.session.omitted)) {
    add(findings, "invalid-session", "session");
  }
  if (findings.length > 0) return { ok: false, document: null, findings };
  // The checks above narrow runtime types; retain local guards for TS strict mode.
  if (!Array.isArray(value.entries) || inspection === null || !record(value.session) ||
    !inSet(value.outcome, validOutcomes) || typeof value.inspectionDate !== "string" ||
    !nonnegative(value.session.actions) || !nonnegative(value.session.omitted)) {
    return { ok: false, document: null, findings: [{ code: "invalid-shape", path: "$" }] };
  }
  const entries: LocalPlanEntry[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < value.entries.length; index++) {
    const entry: unknown = value.entries[index];
    const path = `entries[${index}]`;
    if (!record(entry) || !ownKeys(entry, allowedEntry)) {
      add(findings, "invalid-shape", path); continue;
    }
    if (typeof entry.packId !== "string" || !isSafePackId(entry.packId)) {
      add(findings, "invalid-id", `${path}.packId`); continue;
    }
    if (ids.has(entry.packId)) add(findings, "duplicate-id", `${path}.packId`);
    ids.add(entry.packId);
    if (!inSet(entry.localState, validStates)) add(findings, "invalid-state", `${path}.localState`);
    if (!inSet(entry.queueStage, validStages)) add(findings, "invalid-stage", `${path}.queueStage`);
    const source = inspectSource(entry.source, `${path}.source`, inspection, findings);
    if (inSet(entry.localState, validStates) && inSet(entry.queueStage, validStages)) {
      entries.push({ packId: entry.packId, localState: entry.localState,
        queueStage: entry.queueStage, source });
    }
  }
  if (findings.length > 0) return { ok: false, document: null, findings };
  entries.sort((a, b) => a.packId.localeCompare(b.packId, "en"));
  return {
    ok: true, findings: [], document: {
      format: "local-recovery-plan-v1", inspectionDate: value.inspectionDate,
      outcome: value.outcome, entries,
      session: { actions: value.session.actions, omitted: value.session.omitted },
    },
  };
}

export interface PlanImportCopy {
  readonly title: string; readonly intro: string; readonly select: string;
  readonly review: string; readonly clear: string; readonly accepted: string;
  readonly rejected: string; readonly noFile: string; readonly fileLimit: string;
  readonly issue: Readonly<Record<ImportIssue, string>>;
}
const EN: PlanImportCopy = {
  title: "Review a saved recovery plan",
  intro: "A plan is a past note, not a fresh pack check. No imported choice changes files or starts a download.",
  select: "Choose plan file", review: "Review selected plan", clear: "Clear plan",
  accepted: "Plan format accepted. Compare it with a new local inspection before taking action.",
  rejected: "The plan could not be accepted. No file or queue was changed.",
  noFile: "Choose a JSON plan first.", fileLimit: "Plan file exceeds the local size limit.",
  issue: {
    empty: "The plan is empty.", "too-large": "The plan exceeds the size limit.",
    "invalid-json": "The file is not readable JSON.", "invalid-shape": "The plan structure is unsupported.",
    "unknown-format": "This plan format is unsupported.", "invalid-date": "The date is invalid.",
    "future-date": "The plan date is later than the reference date.",
    "invalid-outcome": "The plan outcome is unsupported.", "too-many-packs": "The plan has too many entries.",
    "invalid-id": "A pack identifier is unsafe.", "duplicate-id": "A pack identifier is repeated.",
    "invalid-state": "A file state is unsupported.", "invalid-stage": "A queue state is unsupported.",
    "invalid-source": "Source details are incomplete or unsafe.", "source-date": "A source date is invalid.",
    "source-future": "A source date is later than the inspection.",
    "closed-licence": "An open licence is not supplied.", "invalid-session": "Session totals are unsupported.",
    "unexpected-field": "Unexpected information is present.", "unsafe-text": "Unsafe text is present.",
  },
};
const FR: PlanImportCopy = {
  title: "Examiner un plan de récupération enregistré",
  intro: "Un plan est une note antérieure, pas un nouveau contrôle des ensembles. Aucun choix importé ne modifie les fichiers ni ne lance un téléchargement.",
  select: "Choisir un fichier de plan", review: "Examiner le plan choisi", clear: "Effacer le plan",
  accepted: "Format du plan accepté. Comparez-le à un nouveau contrôle local avant toute intervention.",
  rejected: "Le plan n’a pas été accepté. Aucun fichier ni aucune file n’a été modifié.",
  noFile: "Choisissez d’abord un plan JSON.", fileLimit: "Le fichier dépasse la limite de taille locale.",
  issue: {
    empty: "Le plan est vide.", "too-large": "Le plan dépasse la limite de taille.",
    "invalid-json": "Le fichier JSON ne peut pas être lu.", "invalid-shape": "La structure du plan n’est pas prise en charge.",
    "unknown-format": "Ce format de plan n’est pas pris en charge.", "invalid-date": "La date est invalide.",
    "future-date": "La date du plan est postérieure à la date de référence.",
    "invalid-outcome": "Le résultat du plan n’est pas pris en charge.",
    "too-many-packs": "Le plan contient trop d’entrées.", "invalid-id": "Un identifiant d’ensemble est non sûr.",
    "duplicate-id": "Un identifiant d’ensemble est répété.",
    "invalid-state": "Un état de fichier n’est pas pris en charge.",
    "invalid-stage": "Un état de file n’est pas pris en charge.",
    "invalid-source": "Les renseignements sur la source sont incomplets ou non sûrs.",
    "source-date": "Une date de source est invalide.",
    "source-future": "Une date de source est postérieure au contrôle.",
    "closed-licence": "Aucune licence ouverte n’est fournie.",
    "invalid-session": "Les totaux de session ne sont pas pris en charge.",
    "unexpected-field": "Le fichier contient des renseignements inattendus.",
    "unsafe-text": "Le fichier contient du texte non sûr.",
  },
};
export function planImportCopy(locale: RecoveryLocale): PlanImportCopy {
  return locale === "fr" ? FR : EN;
}
