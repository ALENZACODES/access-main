import type { RecoveryLocale, RecoverySource } from "./index";
import type { LocalPackRecord } from "./packInventory";

/** A manual, session-only account of an attempted recovery. Not a pack store. */
export type CasePhase = "open" | "paused" | "closed";
export type CaseOutcome = "unknown" | "failed" | "incomplete" | "complete";
export type CaseKind = "inspection" | "download" | "export" | "review";
export type CaseIssue =
  | "invalid-document" | "invalid-case" | "invalid-event" | "invalid-source"
  | "invalid-date" | "invalid-transition" | "duplicate-id" | "too-large"
  | "too-many-events" | "unsupported-version" | "unsafe-content";

export interface CaseEvidence {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: string;
}

export interface CaseEvent {
  readonly id: string;
  readonly caseId: string;
  readonly kind: CaseKind;
  readonly outcome: CaseOutcome;
  readonly at: string;
  readonly note: string;
  readonly evidence: CaseEvidence | null;
}

export interface RecoveryCase {
  readonly id: string;
  readonly packId: string;
  readonly openedAt: string;
  readonly phase: CasePhase;
  readonly events: readonly CaseEvent[];
}

export interface CaseDocument {
  readonly format: "local-recovery-cases";
  readonly version: 1;
  readonly createdAt: string;
  readonly cases: readonly RecoveryCase[];
}

export type CaseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: CaseIssue };

export interface CaseLimits {
  readonly maxCases: number;
  readonly maxEventsPerCase: number;
  readonly maxJsonBytes: number;
  readonly maxNoteLength: number;
}

export const CASE_LIMITS: CaseLimits = Object.freeze({
  maxCases: 40,
  maxEventsPerCase: 100,
  maxJsonBytes: 384 * 1024,
  maxNoteLength: 1200,
});

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CONTROL = /\p{Cc}/u;
const OPEN_LICENCES = new Set([
  "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0",
  "OGL-Canada-2.0", "OGL-ON-1.0",
]);
const KINDS: readonly CaseKind[] = ["inspection", "download", "export", "review"];
const OUTCOMES: readonly CaseOutcome[] = ["unknown", "failed", "incomplete", "complete"];
const PHASES: readonly CasePhase[] = ["open", "paused", "closed"];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keysOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function text(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max &&
    (allowEmpty || value.trim().length > 0) && !CONTROL.test(value) &&
    !value.includes("<") && !value.includes(">");
}

export function validCaseId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value) && value !== "." && value !== "..";
}

export function validCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function validInstant(value: unknown): value is string {
  if (typeof value !== "string" || !INSTANT_PATTERN.test(value)) return false;
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return false;
  const canonical = new Date(stamp).toISOString();
  const expected = value.endsWith("Z") && !value.includes(".")
    ? value.slice(0, -1) + ".000Z"
    : value.replace(/\.(\d{1,2})Z$/, (_match, fraction: string) =>
      `.${fraction.padEnd(3, "0")}Z`);
  return canonical === expected;
}

export function validCaseEvidence(value: unknown): value is CaseEvidence {
  if (!object(value) || !keysOnly(value, ["source", "licence", "date", "tier"])) return false;
  return text(value.source, 160) && text(value.licence, 50) &&
    OPEN_LICENCES.has(value.licence) && validCalendarDay(value.date) &&
    text(value.tier, 64);
}

export function evidenceFromSource(source: RecoverySource, tier: string): CaseEvidence | null {
  const value = { source: source.name, licence: source.licence, date: source.date, tier };
  return validCaseEvidence(value) ? value : null;
}

export function validCaseEvent(value: unknown): value is CaseEvent {
  if (!object(value) || !keysOnly(value, ["id", "caseId", "kind", "outcome", "at", "note", "evidence"])) return false;
  if (!validCaseId(value.id) || !validCaseId(value.caseId) ||
      !KINDS.includes(value.kind as CaseKind) || !OUTCOMES.includes(value.outcome as CaseOutcome) ||
      !validInstant(value.at) || !text(value.note, CASE_LIMITS.maxNoteLength, true)) return false;
  if (value.outcome === "complete" && value.evidence === null) return false;
  if (value.evidence === null) return true;
  if (!validCaseEvidence(value.evidence)) return false;
  return Date.parse(`${value.evidence.date}T00:00:00Z`) <= Date.parse(value.at);
}

/** No historical event can upgrade a pack's current local state. */
export function currentPackOutcome(record: LocalPackRecord | undefined): CaseOutcome {
  if (record === undefined || record.state === "unknown") return "unknown";
  if (record.state === "corrupt") return "failed";
  if (record.state === "absent") return "incomplete";
  // A local readiness result is not a statement about the environment.
  return "complete";
}

/** A local report is descriptive; a previous success must not override a fresh failure. */
export function effectiveCaseOutcome(entry: RecoveryCase, record: LocalPackRecord | undefined): CaseOutcome {
  const current = currentPackOutcome(record);
  if (current !== "complete") return current;
  if (entry.events.length === 0) return "unknown";
  const recent = entry.events[entry.events.length - 1];
  return recent?.outcome === "failed" || recent?.outcome === "incomplete"
    ? recent.outcome : recent?.outcome === "complete" ? "complete" : "unknown";
}

export function validateRecoveryCase(value: unknown): CaseResult<RecoveryCase> {
  if (!object(value) || !keysOnly(value, ["id", "packId", "openedAt", "phase", "events"])) {
    return { ok: false, issue: "invalid-case" };
  }
  if (!validCaseId(value.id) || !validCaseId(value.packId) || !validInstant(value.openedAt) ||
      !PHASES.includes(value.phase as CasePhase) || !Array.isArray(value.events)) {
    return { ok: false, issue: "invalid-case" };
  }
  if (value.events.length > CASE_LIMITS.maxEventsPerCase) return { ok: false, issue: "too-many-events" };
  const ids = new Set<string>();
  let previousTime = value.openedAt;
  for (const event of value.events) {
    if (!validCaseEvent(event) || event.caseId !== value.id) return { ok: false, issue: "invalid-event" };
    if (ids.has(event.id)) return { ok: false, issue: "duplicate-id" };
    if (Date.parse(event.at) < Date.parse(previousTime)) return { ok: false, issue: "invalid-date" };
    ids.add(event.id);
    previousTime = event.at;
  }
  return { ok: true, value: value as unknown as RecoveryCase };
}

/** Validate the entire imported shape, without sanitising or inventing metadata. */
export function validateCaseDocument(value: unknown): CaseResult<CaseDocument> {
  if (!object(value) || !keysOnly(value, ["format", "version", "createdAt", "cases"])) {
    return { ok: false, issue: "invalid-document" };
  }
  if (value.format !== "local-recovery-cases" || value.version !== 1) {
    return { ok: false, issue: "unsupported-version" };
  }
  if (!validInstant(value.createdAt) || !Array.isArray(value.cases)) {
    return { ok: false, issue: "invalid-document" };
  }
  if (value.cases.length > CASE_LIMITS.maxCases) return { ok: false, issue: "too-large" };
  const ids = new Set<string>();
  const documentTime = Date.parse(value.createdAt);
  for (const entry of value.cases) {
    const checked = validateRecoveryCase(entry);
    if (!checked.ok) return checked;
    if (ids.has(checked.value.id)) return { ok: false, issue: "duplicate-id" };
    if (Date.parse(checked.value.openedAt) > documentTime ||
        checked.value.events.some((event) => Date.parse(event.at) > documentTime)) {
      return { ok: false, issue: "invalid-date" };
    }
    ids.add(checked.value.id);
  }
  return { ok: true, value: value as unknown as CaseDocument };
}

export function parseCaseDocument(raw: string): CaseResult<CaseDocument> {
  if (new TextEncoder().encode(raw).byteLength > CASE_LIMITS.maxJsonBytes) {
    return { ok: false, issue: "too-large" };
  }
  try {
    const value: unknown = JSON.parse(raw);
    return validateCaseDocument(value);
  } catch {
    return { ok: false, issue: "invalid-document" };
  }
}

export function serializeCaseDocument(document: CaseDocument): CaseResult<string> {
  const result = validateCaseDocument(document);
  if (!result.ok) return result;
  const json = JSON.stringify(result.value, null, 2) + "\n";
  return new TextEncoder().encode(json).byteLength <= CASE_LIMITS.maxJsonBytes
    ? { ok: true, value: json } : { ok: false, issue: "too-large" };
}

export function newCaseDocument(at: string): CaseResult<CaseDocument> {
  if (!validInstant(at)) return { ok: false, issue: "invalid-date" };
  return { ok: true, value: { format: "local-recovery-cases", version: 1, createdAt: at, cases: [] } };
}

export function startCase(document: CaseDocument, id: string, packId: string, at: string): CaseResult<CaseDocument> {
  const checked = validateCaseDocument(document);
  if (!checked.ok) return checked;
  if (!validCaseId(id) || !validCaseId(packId)) return { ok: false, issue: "invalid-case" };
  if (!validInstant(at) || Date.parse(at) < Date.parse(document.createdAt)) return { ok: false, issue: "invalid-date" };
  if (document.cases.length >= CASE_LIMITS.maxCases) return { ok: false, issue: "too-large" };
  if (document.cases.some((item) => item.id === id)) return { ok: false, issue: "duplicate-id" };
  return { ok: true, value: { ...document, createdAt: at, cases: [...document.cases,
    { id, packId, openedAt: at, phase: "open", events: [] }] } };
}

export function appendCaseEvent(
  document: CaseDocument, caseId: string, event: CaseEvent,
): CaseResult<CaseDocument> {
  const checked = validateCaseDocument(document);
  if (!checked.ok) return checked;
  const entry = document.cases.find((item) => item.id === caseId);
  if (!entry || entry.phase !== "open") return { ok: false, issue: "invalid-transition" };
  if (!validCaseEvent(event) || event.caseId !== caseId) return { ok: false, issue: "invalid-event" };
  if (entry.events.length >= CASE_LIMITS.maxEventsPerCase) return { ok: false, issue: "too-many-events" };
  if (entry.events.some((item) => item.id === event.id)) return { ok: false, issue: "duplicate-id" };
  if (Date.parse(event.at) < Date.parse(entry.events.at(-1)?.at ?? entry.openedAt)) {
    return { ok: false, issue: "invalid-date" };
  }
  const cases = document.cases.map((item) => item.id === caseId
    ? { ...item, events: [...item.events, event] } : item);
  return { ok: true, value: { ...document, createdAt: Date.parse(event.at) > Date.parse(document.createdAt) ? event.at : document.createdAt, cases } };
}

export function changeCasePhase(
  document: CaseDocument, caseId: string, phase: CasePhase,
): CaseResult<CaseDocument> {
  const checked = validateCaseDocument(document);
  if (!checked.ok) return checked;
  const entry = document.cases.find((item) => item.id === caseId);
  if (!entry) return { ok: false, issue: "invalid-case" };
  if (entry.phase === "closed" ||
      (entry.phase === "open" && phase !== "paused" && phase !== "closed") ||
      (entry.phase === "paused" && phase !== "open" && phase !== "closed")) {
    return { ok: false, issue: "invalid-transition" };
  }
  return { ok: true, value: { ...document, cases: document.cases.map((item) => item.id === caseId
    ? { ...item, phase } : item) } };
}

export interface CaseCounts {
  readonly total: number;
  readonly open: number;
  readonly paused: number;
  readonly closed: number;
  readonly unknown: number;
  readonly failed: number;
  readonly incomplete: number;
  readonly complete: number;
}

export function caseCounts(document: CaseDocument, records: readonly LocalPackRecord[]): CaseCounts {
  const byId = new Map(records.map((record) => [record.id, record]));
  const counts = { total: document.cases.length, open: 0, paused: 0, closed: 0,
    unknown: 0, failed: 0, incomplete: 0, complete: 0 };
  for (const entry of document.cases) {
    counts[entry.phase] += 1;
    counts[effectiveCaseOutcome(entry, byId.get(entry.packId))] += 1;
  }
  return counts;
}

export interface CaseViewCopy {
  readonly heading: string;
  readonly description: string;
  readonly newCase: string;
  readonly choosePack: string;
  readonly addEvent: string;
  readonly kind: string;
  readonly outcome: string;
  readonly note: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: string;
  readonly optional: string;
  readonly sourceRequired: string;
  readonly import: string;
  readonly export: string;
  readonly paused: string;
  readonly resumed: string;
  readonly closed: string;
  readonly empty: string;
  readonly unknown: string;
  readonly error: string;
  readonly done: string;
  readonly phase: Readonly<Record<CasePhase, string>>;
  readonly outcomes: Readonly<Record<CaseOutcome, string>>;
  readonly kinds: Readonly<Record<CaseKind, string>>;
  readonly issues: Readonly<Record<CaseIssue, string>>;
}

const EN: CaseViewCopy = {
  heading: "Local recovery journal",
  description: "Record manual recovery steps for this session. A saved journal does not change downloaded packs or establish access at a location.",
  newCase: "Start a case", choosePack: "Choose a pack", addEvent: "Add an event",
  kind: "Operation", outcome: "Result", note: "Notes", source: "Source",
  licence: "Licence", date: "Source date", tier: "Evidence tier", optional: "Optional evidence",
  sourceRequired: "A completed step needs a source, open licence, source date and evidence tier.",
  import: "Import local journal", export: "Save journal", paused: "Pause case",
  resumed: "Resume case", closed: "Close case", empty: "No cases in this session.",
  unknown: "UNKNOWN", error: "The journal could not be updated.", done: "Journal saved locally.",
  phase: { open: "Open", paused: "Paused", closed: "Closed" },
  outcomes: { unknown: "UNKNOWN", failed: "Failed", incomplete: "Incomplete", complete: "Completed step" },
  kinds: { inspection: "Local inspection", download: "Download attempt", export: "Export attempt", review: "Manual review" },
  issues: {
    "invalid-document": "The file is not a supported journal.", "invalid-case": "Case details are incomplete.",
    "invalid-event": "Event details are incomplete.", "invalid-source": "Evidence details are incomplete.",
    "invalid-date": "A date is invalid or out of order.", "invalid-transition": "That case cannot change to the selected state.",
    "duplicate-id": "A duplicate identifier was found.", "too-large": "The journal exceeds the local size limit.",
    "too-many-events": "Too many events are recorded for one case.",
    "unsupported-version": "This journal format is not supported.", "unsafe-content": "Some text is not allowed.",
  },
};

const FR: CaseViewCopy = {
  heading: "Journal local de récupération",
  description: "Consignez les étapes manuelles de cette session. Un journal enregistré ne modifie pas les ensembles téléchargés et ne détermine pas l’accès à un lieu.",
  newCase: "Ouvrir un dossier", choosePack: "Choisir un ensemble", addEvent: "Ajouter une entrée",
  kind: "Opération", outcome: "Résultat", note: "Notes", source: "Source",
  licence: "Licence", date: "Date de la source", tier: "Niveau de preuve", optional: "Preuve facultative",
  sourceRequired: "Une étape terminée nécessite une source, une licence ouverte, une date de source et un niveau de preuve.",
  import: "Importer un journal local", export: "Enregistrer le journal", paused: "Suspendre le dossier",
  resumed: "Reprendre le dossier", closed: "Fermer le dossier", empty: "Aucun dossier dans cette session.",
  unknown: "UNKNOWN", error: "Le journal n’a pas pu être mis à jour.", done: "Journal enregistré localement.",
  phase: { open: "Ouvert", paused: "Suspendu", closed: "Fermé" },
  outcomes: { unknown: "UNKNOWN", failed: "Échec", incomplete: "Incomplet", complete: "Étape terminée" },
  kinds: { inspection: "Inspection locale", download: "Tentative de téléchargement", export: "Tentative d’exportation", review: "Examen manuel" },
  issues: {
    "invalid-document": "Le fichier ne contient pas un journal pris en charge.",
    "invalid-case": "Les renseignements du dossier sont incomplets.",
    "invalid-event": "Les renseignements de l’entrée sont incomplets.",
    "invalid-source": "Les renseignements sur la preuve sont incomplets.",
    "invalid-date": "Une date est invalide ou hors séquence.",
    "invalid-transition": "Ce dossier ne peut pas passer à cet état.",
    "duplicate-id": "Un identifiant est présent plusieurs fois.",
    "too-large": "Le journal dépasse la taille locale autorisée.",
    "too-many-events": "Ce dossier comporte trop d’entrées.",
    "unsupported-version": "Le format de ce journal n’est pas pris en charge.",
    "unsafe-content": "Certains caractères ne sont pas autorisés.",
  },
};

export function caseViewCopy(locale: RecoveryLocale): CaseViewCopy {
  return locale === "fr" ? FR : EN;
}
