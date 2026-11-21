import type { RecoveryLocale } from "./index";
import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** Manual records only: no operation is started and no pack readiness changes. */
export type AttemptKind = "download" | "inspection" | "export" | "storage";
export type AttemptOutcome = "unknown" | "failed" | "incomplete" | "reported-complete";
export type AttemptIssue =
  | "invalid-format" | "invalid-date" | "unsafe-text" | "invalid-id"
  | "duplicate-id" | "invalid-provenance" | "invalid-attempt"
  | "invalid-transition" | "too-many" | "too-large" | "conflict";

export interface AttemptProvenance {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: string;
}

export interface RecoveryAttempt {
  readonly id: string;
  readonly packId: string;
  readonly kind: AttemptKind;
  readonly outcome: AttemptOutcome;
  readonly at: string;
  readonly note: string;
  readonly provenance: AttemptProvenance;
}

export interface AttemptDocument {
  readonly format: "local-recovery-attempts";
  readonly version: 1;
  readonly entries: readonly RecoveryAttempt[];
}

export type AttemptResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: AttemptIssue };

export interface AttemptMergePreview {
  readonly append: readonly RecoveryAttempt[];
  readonly unchanged: readonly string[];
  readonly conflicts: readonly string[];
}

export interface AttemptSummary {
  readonly total: number;
  readonly unknown: number;
  readonly failed: number;
  readonly incomplete: number;
  readonly reportedComplete: number;
  readonly packCount: number;
}

export const MAX_ATTEMPTS = 200;
export const MAX_ATTEMPT_BYTES = 256 * 1024;
const CONTROL = /\p{Cc}/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const KINDS: readonly AttemptKind[] = ["download", "inspection", "export", "storage"];
const OUTCOMES: readonly AttemptOutcome[] = ["unknown", "failed", "incomplete", "reported-complete"];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function clean(value: unknown, max: number, empty = false): value is string {
  return typeof value === "string" && value.length <= max &&
    (empty || value.trim().length > 0) && !CONTROL.test(value) &&
    !value.includes("<") && !value.includes(">");
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value) && value !== "." && value !== "..";
}

function validInstant(value: unknown): value is string {
  if (typeof value !== "string" || !INSTANT.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  return new Date(time).toISOString() ===
    (value.includes(".") ? value.replace(/\.\d+Z$/, (part) => `.${part.slice(1, -1).padEnd(3, "0")}Z`) : value.replace("Z", ".000Z"));
}

export function isAttemptProvenance(value: unknown): value is AttemptProvenance {
  if (!object(value) || !onlyKeys(value, ["source", "licence", "date", "tier"])) return false;
  return clean(value.source, 180) && isOpenLicence(value.licence) &&
    typeof value.date === "string" && parseCalendarDate(value.date) !== null &&
    clean(value.tier, 48);
}

export function validateAttempt(value: unknown): AttemptIssue | null {
  if (!object(value) || !onlyKeys(value, ["id", "packId", "kind", "outcome", "at", "note", "provenance"])) {
    return "invalid-attempt";
  }
  if (!validId(value.id) || !isSafePackId(value.packId)) return "invalid-id";
  if (!KINDS.includes(value.kind as AttemptKind) || !OUTCOMES.includes(value.outcome as AttemptOutcome)) {
    return "invalid-attempt";
  }
  if (!validInstant(value.at)) return "invalid-date";
  if (!clean(value.note, 1200, true)) return "unsafe-text";
  if (!isAttemptProvenance(value.provenance)) return "invalid-provenance";
  return null;
}

export function emptyAttemptDocument(): AttemptDocument {
  return { format: "local-recovery-attempts", version: 1, entries: [] };
}

export function validateAttemptDocument(value: unknown): AttemptResult<AttemptDocument> {
  if (!object(value) || !onlyKeys(value, ["format", "version", "entries"]) ||
    value.format !== "local-recovery-attempts" || value.version !== 1 || !Array.isArray(value.entries)) {
    return { ok: false, issue: "invalid-format" };
  }
  if (value.entries.length > MAX_ATTEMPTS) return { ok: false, issue: "too-many" };
  const ids = new Set<string>();
  const entries: RecoveryAttempt[] = [];
  for (const entry of value.entries as unknown[]) {
    const issue = validateAttempt(entry);
    if (issue !== null) return { ok: false, issue };
    const attempt = entry as RecoveryAttempt;
    if (ids.has(attempt.id)) return { ok: false, issue: "duplicate-id" };
    ids.add(attempt.id);
    entries.push({ ...attempt, provenance: { ...attempt.provenance } });
  }
  return { ok: true, value: { format: "local-recovery-attempts", version: 1, entries } };
}

export function addRecoveryAttempt(
  document: AttemptDocument,
  attempt: RecoveryAttempt,
): AttemptResult<AttemptDocument> {
  const current = validateAttemptDocument(document);
  if (!current.ok) return current;
  const issue = validateAttempt(attempt);
  if (issue !== null) return { ok: false, issue };
  if (current.value.entries.some((entry) => entry.id === attempt.id)) return { ok: false, issue: "duplicate-id" };
  if (current.value.entries.length >= MAX_ATTEMPTS) return { ok: false, issue: "too-many" };
  return { ok: true, value: { ...current.value, entries: [...current.value.entries, {
    ...attempt, provenance: { ...attempt.provenance },
  }] } };
}

/** Editing existing attempts is intentionally unsupported. Add a later note instead. */
export const replaceRecoveryAttempt: (
  document: AttemptDocument,
  attempt: RecoveryAttempt,
) => AttemptResult<AttemptDocument> = () => ({
  ok: false,
  issue: "invalid-transition",
});

export function parseRecoveryAttempts(raw: string): AttemptResult<AttemptDocument> {
  if (new TextEncoder().encode(raw).byteLength > MAX_ATTEMPT_BYTES) {
    return { ok: false, issue: "too-large" };
  }
  let decoded: unknown;
  try { decoded = JSON.parse(raw) as unknown; }
  catch { return { ok: false, issue: "invalid-format" }; }
  return validateAttemptDocument(decoded);
}

export function exportRecoveryAttempts(document: AttemptDocument): AttemptResult<string> {
  const checked = validateAttemptDocument(document);
  if (!checked.ok) return checked;
  const raw = `${JSON.stringify(checked.value, null, 2)}\n`;
  if (new TextEncoder().encode(raw).byteLength > MAX_ATTEMPT_BYTES) {
    return { ok: false, issue: "too-large" };
  }
  return { ok: true, value: raw };
}

export function previewAttemptMerge(
  current: AttemptDocument,
  incoming: AttemptDocument,
): AttemptResult<AttemptMergePreview> {
  const a = validateAttemptDocument(current);
  if (!a.ok) return a;
  const b = validateAttemptDocument(incoming);
  if (!b.ok) return b;
  const indexed = new Map(a.value.entries.map((entry) => [entry.id, entry]));
  const append: RecoveryAttempt[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];
  for (const entry of b.value.entries) {
    const old = indexed.get(entry.id);
    if (!old) append.push(entry);
    else if (JSON.stringify(old) === JSON.stringify(entry)) unchanged.push(entry.id);
    else conflicts.push(entry.id);
  }
  if (a.value.entries.length + append.length > MAX_ATTEMPTS) return { ok: false, issue: "too-many" };
  return { ok: true, value: { append, unchanged, conflicts } };
}

export function mergeRecoveryAttempts(current: AttemptDocument, incoming: AttemptDocument): AttemptResult<AttemptDocument> {
  const preview = previewAttemptMerge(current, incoming);
  if (!preview.ok) return preview;
  if (preview.value.conflicts.length > 0) return { ok: false, issue: "conflict" };
  return { ok: true, value: { ...current, entries: [...current.entries, ...preview.value.append] } };
}

export function summarizeRecoveryAttempts(document: AttemptDocument): AttemptSummary {
  const entries = document.entries;
  return {
    total: entries.length,
    unknown: entries.filter((entry) => entry.outcome === "unknown").length,
    failed: entries.filter((entry) => entry.outcome === "failed").length,
    incomplete: entries.filter((entry) => entry.outcome === "incomplete").length,
    reportedComplete: entries.filter((entry) => entry.outcome === "reported-complete").length,
    packCount: new Set(entries.map((entry) => entry.packId)).size,
  };
}

export const ATTEMPT_COPY: Record<RecoveryLocale, {
  heading: string; introduction: string; pack: string; kind: string; outcome: string;
  note: string; source: string; licence: string; date: string; tier: string;
  add: string; importFile: string; exportFile: string; apply: string;
  empty: string; error: string; saved: string; staged: string; conflict: string; unknownLabel: string;
}> = {
  en: {
    heading: "Manual repair attempts", introduction: "Add local notes about an attempt. Notes cannot change pack status.",
    pack: "Pack", kind: "Operation", outcome: "Reported outcome (UNKNOWN until selected)", note: "Note", source: "Source",
    licence: "Licence", date: "Source date", tier: "Evidence tier", add: "Add attempt",
    importFile: "Choose a local attempts file", exportFile: "Save attempts file", apply: "Add non-conflicting attempts",
    empty: "No attempt notes yet", error: "The attempt could not be saved.", saved: "Attempts saved locally.",
    staged: "Selected file is ready for review.", conflict: "An attempt ID has conflicting history. Nothing was imported.",
    unknownLabel: "UNKNOWN",
  },
  fr: {
    heading: "Tentatives de récupération", introduction: "Ajoutez une note locale. Les notes ne changent pas l’état de l’ensemble.",
    pack: "Ensemble", kind: "Opération", outcome: "Résultat déclaré (UNKNOWN avant sélection)", note: "Note", source: "Source",
    licence: "Licence", date: "Date de la source", tier: "Niveau de preuve", add: "Ajouter une tentative",
    importFile: "Choisir un fichier local", exportFile: "Enregistrer le fichier", apply: "Ajouter les tentatives sans conflit",
    empty: "Aucune tentative consignée", error: "La tentative n’a pas pu être enregistrée.",
    saved: "Tentatives enregistrées localement.", staged: "Le fichier sélectionné peut être examiné.",
    conflict: "Un identifiant présente un historique contradictoire. Aucun ajout n’a été effectué.",
    unknownLabel: "UNKNOWN",
  },
};
