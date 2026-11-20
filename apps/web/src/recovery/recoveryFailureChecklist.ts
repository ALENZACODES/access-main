import type { RecoveryLocale } from "./index";
import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** Local notes only. None of these states can change an installed pack. */
export type FailureKind = "pack" | "download" | "export";
export type FailureCause = "unknown" | "offline" | "storage" | "permission" | "damaged" | "interrupted";
export type ChecklistState = "unknown" | "noted" | "skipped";
export type ChecklistStep = "review-source" | "check-space" | "check-connection" | "check-input" | "ask-before-retry";
export type EvidenceTier = "UNKNOWN" | "user-observation" | "file-metadata";
export interface ChecklistProvenance {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: EvidenceTier;
}
export interface ChecklistItem {
  readonly step: ChecklistStep;
  readonly state: ChecklistState;
  readonly note: string;
}
export interface FailureChecklist {
  readonly format: "local-failure-checklist";
  readonly version: 1;
  readonly packId: string;
  readonly kind: FailureKind;
  readonly cause: FailureCause;
  readonly createdOn: string;
  readonly provenance: ChecklistProvenance;
  readonly steps: readonly ChecklistItem[];
}
export type ChecklistIssue =
  | "invalid-shape" | "unsafe-id" | "invalid-date" | "invalid-source"
  | "invalid-step" | "duplicate-step" | "unsafe-text" | "too-large" | "conflict";
export type ChecklistResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: ChecklistIssue };
export const MAX_CHECKLIST_BYTES = 64 * 1024;
export const MAX_NOTE_LENGTH = 500;
export const CHECKLIST_STEPS: readonly ChecklistStep[] = [
  "review-source", "check-space", "check-connection", "check-input", "ask-before-retry",
];
const KINDS: readonly FailureKind[] = ["pack", "download", "export"];
const CAUSES: readonly FailureCause[] = ["unknown", "offline", "storage", "permission", "damaged", "interrupted"];
const STATES: readonly ChecklistState[] = ["unknown", "noted", "skipped"];
const TIERS: readonly EvidenceTier[] = ["UNKNOWN", "user-observation", "file-metadata"];
const CONTROL = /\p{Cc}/u;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function cleanText(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximum &&
    (allowEmpty || value.trim().length > 0) && !CONTROL.test(value) &&
    !value.includes("<") && !value.includes(">");
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && parseCalendarDate(value) !== null;
}
export function validChecklistProvenance(value: unknown): value is ChecklistProvenance {
  if (!object(value) || !exactKeys(value, ["source", "licence", "date", "tier"])) return false;
  return cleanText(value.source, 160) && isOpenLicence(value.licence) &&
    validDate(value.date) && TIERS.includes(value.tier as EvidenceTier);
}
export function defaultChecklist(
  packId: string, kind: FailureKind, cause: FailureCause,
  createdOn: string, provenance: ChecklistProvenance,
): FailureChecklist {
  return {
    format: "local-failure-checklist", version: 1, packId, kind, cause,
    createdOn, provenance: { ...provenance },
    steps: CHECKLIST_STEPS.map((step) => ({ step, state: "unknown", note: "" })),
  };
}
export function validateChecklist(value: unknown): ChecklistResult<FailureChecklist> {
  if (!object(value) || !exactKeys(value, ["format", "version", "packId", "kind", "cause", "createdOn", "provenance", "steps"])) {
    return { ok: false, reason: "invalid-shape" };
  }
  if (value.format !== "local-failure-checklist" || value.version !== 1 ||
    !KINDS.includes(value.kind as FailureKind) || !CAUSES.includes(value.cause as FailureCause) ||
    !Array.isArray(value.steps)) return { ok: false, reason: "invalid-shape" };
  if (!isSafePackId(value.packId)) return { ok: false, reason: "unsafe-id" };
  if (!validDate(value.createdOn)) return { ok: false, reason: "invalid-date" };
  if (!validChecklistProvenance(value.provenance)) return { ok: false, reason: "invalid-source" };
  if (value.steps.length !== CHECKLIST_STEPS.length) return { ok: false, reason: "invalid-step" };
  const items: ChecklistItem[] = [];
  const used = new Set<ChecklistStep>();
  for (const entry of value.steps as unknown[]) {
    if (!object(entry) || !exactKeys(entry, ["step", "state", "note"]) ||
      !CHECKLIST_STEPS.includes(entry.step as ChecklistStep) ||
      !STATES.includes(entry.state as ChecklistState)) return { ok: false, reason: "invalid-step" };
    if (!cleanText(entry.note, MAX_NOTE_LENGTH, true)) return { ok: false, reason: "unsafe-text" };
    const step = entry.step as ChecklistStep;
    if (used.has(step)) return { ok: false, reason: "duplicate-step" };
    used.add(step);
    items.push({ step, state: entry.state as ChecklistState, note: entry.note });
  }
  if (!CHECKLIST_STEPS.every((step) => used.has(step))) return { ok: false, reason: "invalid-step" };
  return {
    ok: true,
    value: {
      format: "local-failure-checklist", version: 1,
      packId: value.packId, kind: value.kind as FailureKind, cause: value.cause as FailureCause,
      createdOn: value.createdOn, provenance: { ...value.provenance }, steps: items,
    },
  };
}
export function changeChecklistStep(
  checklist: FailureChecklist, step: ChecklistStep, state: ChecklistState, note: string,
): ChecklistResult<FailureChecklist> {
  const check = validateChecklist(checklist);
  if (!check.ok) return check;
  if (!CHECKLIST_STEPS.includes(step) || !STATES.includes(state)) return { ok: false, reason: "invalid-step" };
  if (!cleanText(note, MAX_NOTE_LENGTH, true)) return { ok: false, reason: "unsafe-text" };
  return {
    ok: true,
    value: {
      ...check.value,
      steps: check.value.steps.map((item) => item.step === step ? { step, state, note } : item),
    },
  };
}
export function checklistCounts(checklist: FailureChecklist): Readonly<Record<ChecklistState, number>> {
  return {
    unknown: checklist.steps.filter((step) => step.state === "unknown").length,
    noted: checklist.steps.filter((step) => step.state === "noted").length,
    skipped: checklist.steps.filter((step) => step.state === "skipped").length,
  };
}
export function exportChecklist(checklist: FailureChecklist): ChecklistResult<string> {
  const validated = validateChecklist(checklist);
  if (!validated.ok) return validated;
  const content = `${JSON.stringify(validated.value, null, 2)}\n`;
  if (new TextEncoder().encode(content).byteLength > MAX_CHECKLIST_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  return { ok: true, value: content };
}
export function importChecklist(content: string): ChecklistResult<FailureChecklist> {
  if (new TextEncoder().encode(content).byteLength > MAX_CHECKLIST_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(content) as unknown; }
  catch { return { ok: false, reason: "invalid-shape" }; }
  return validateChecklist(parsed);
}
/** Compare only locally recorded information; never infer content readiness. */
export function previewChecklistReplacement(
  current: FailureChecklist | null, incoming: FailureChecklist,
): ChecklistResult<{ readonly accepted: boolean; readonly unknownSteps: number }> {
  const parsed = validateChecklist(incoming);
  if (!parsed.ok) return parsed;
  if (current !== null) {
    const old = validateChecklist(current);
    if (!old.ok) return old;
    if (old.value.packId !== parsed.value.packId || old.value.kind !== parsed.value.kind) {
      return { ok: false, reason: "conflict" };
    }
  }
  return {
    ok: true,
    value: { accepted: true, unknownSteps: checklistCounts(parsed.value).unknown },
  };
}

export const FAILURE_CHECKLIST_COPY: Readonly<Record<RecoveryLocale, {
  readonly heading: string; readonly description: string; readonly pack: string;
  readonly kind: string; readonly cause: string; readonly date: string;
  readonly source: string; readonly licence: string; readonly tier: string;
  readonly create: string; readonly state: string; readonly note: string;
  readonly save: string; readonly choose: string; readonly apply: string;
  readonly error: string; readonly saved: string; readonly imported: string;
  readonly status: Readonly<Record<ChecklistState, string>>;
  readonly steps: Readonly<Record<ChecklistStep, string>>;
  readonly kinds: Readonly<Record<FailureKind, string>>;
  readonly causes: Readonly<Record<FailureCause, string>>;
}> > = {
  en: {
    heading: "Manual failure checklist",
    description: "Record what you checked. This does not change a pack or start a download.",
    pack: "Pack ID", kind: "Operation", cause: "Reported cause", date: "Source date",
    source: "Source", licence: "Licence", tier: "Evidence tier", create: "Start checklist",
    state: "Review state", note: "Note", save: "Save local checklist",
    choose: "Choose local checklist", apply: "Use selected checklist",
    error: "The checklist could not be processed.", saved: "Checklist saved locally.",
    imported: "Selected checklist loaded locally.",
    status: { unknown: "UNKNOWN", noted: "Noted", skipped: "Skipped" },
    kinds: { pack: "Pack", download: "Download", export: "Export" },
    causes: { unknown: "UNKNOWN", offline: "Offline", storage: "Storage", permission: "Permission", damaged: "Damaged", interrupted: "Interrupted" },
    steps: {
      "review-source": "Review source information", "check-space": "Review available storage",
      "check-connection": "Review connection", "check-input": "Review input file",
      "ask-before-retry": "Review next steps before another attempt",
    },
  },
  fr: {
    heading: "Liste de contrôle manuelle",
    description: "Consignez vos contrôles. Aucun ensemble n’est modifié et aucun téléchargement ne démarre.",
    pack: "Identifiant de l’ensemble", kind: "Opération", cause: "Cause déclarée", date: "Date de la source",
    source: "Source", licence: "Licence", tier: "Niveau de preuve", create: "Créer la liste",
    state: "État de la revue", note: "Note", save: "Enregistrer la liste locale",
    choose: "Choisir une liste locale", apply: "Utiliser la liste sélectionnée",
    error: "La liste n’a pas pu être traitée.", saved: "Liste enregistrée localement.",
    imported: "Liste sélectionnée chargée localement.",
    status: { unknown: "UNKNOWN", noted: "Noté", skipped: "Ignoré" },
    kinds: { pack: "Ensemble", download: "Téléchargement", export: "Exportation" },
    causes: { unknown: "UNKNOWN", offline: "Hors ligne", storage: "Stockage", permission: "Autorisation", damaged: "Endommagé", interrupted: "Interrompu" },
    steps: {
      "review-source": "Examiner les renseignements sur la source", "check-space": "Examiner l’espace disponible",
      "check-connection": "Examiner la connexion", "check-input": "Examiner le fichier",
      "ask-before-retry": "Examiner les étapes avant une nouvelle tentative",
    },
  },
};
