import {
  CASE_LIMITS,
  validateCaseDocument,
  type CaseDocument,
  type RecoveryCase,
} from "./recoveryCaseJournal";
import type { RecoveryLocale } from "./index";

/** Review only. No import is applied without a separate user action. */
export type JournalDifference = "new" | "identical" | "conflict" | "local-only";
export type MergeFailure = "conflict" | "invalid-document" | "too-many-cases" | "too-large";

export interface CaseDifference {
  readonly id: string;
  readonly packId: string;
  readonly state: JournalDifference;
  readonly localEvents: number;
  readonly importedEvents: number;
}

export interface JournalComparison {
  readonly differences: readonly CaseDifference[];
  readonly newCount: number;
  readonly identicalCount: number;
  readonly conflictCount: number;
  readonly localOnlyCount: number;
  readonly canMerge: boolean;
  readonly totalAfterMerge: number;
}

export type JournalMergeResult =
  | { readonly ok: true; readonly document: CaseDocument; readonly comparison: JournalComparison }
  | { readonly ok: false; readonly reason: MergeFailure; readonly comparison: JournalComparison | null };

/** Explicitly compare each known field; object key order does not matter. */
function sameEvidence(
  a: RecoveryCase["events"][number]["evidence"],
  b: RecoveryCase["events"][number]["evidence"],
): boolean {
  if (a === null || b === null) return a === b;
  return a.source === b.source && a.licence === b.licence &&
    a.date === b.date && a.tier === b.tier;
}

function sameCase(a: RecoveryCase, b: RecoveryCase): boolean {
  if (a.id !== b.id || a.packId !== b.packId || a.openedAt !== b.openedAt ||
      a.phase !== b.phase || a.events.length !== b.events.length) return false;
  return a.events.every((event, index) => {
    const other = b.events[index];
    return other !== undefined && event.id === other.id &&
      event.caseId === other.caseId && event.kind === other.kind &&
      event.outcome === other.outcome && event.at === other.at &&
      event.note === other.note && sameEvidence(event.evidence, other.evidence);
  });
}

/** Compare all IDs in deterministic order and flag altered history. */
export function compareCaseDocuments(
  current: CaseDocument,
  imported: CaseDocument,
): JournalComparison {
  const local = new Map(current.cases.map((entry) => [entry.id, entry]));
  const remote = new Map(imported.cases.map((entry) => [entry.id, entry]));
  const differences: CaseDifference[] = [];
  const ids = [...new Set([...local.keys(), ...remote.keys()])].sort((a, b) => a.localeCompare(b, "en"));
  for (const id of ids) {
    const left = local.get(id);
    const right = remote.get(id);
    const state: JournalDifference = left === undefined ? "new"
      : right === undefined ? "local-only"
        : sameCase(left, right) ? "identical" : "conflict";
    differences.push({
      id,
      packId: left?.packId ?? right?.packId ?? id,
      state,
      localEvents: left?.events.length ?? 0,
      importedEvents: right?.events.length ?? 0,
    });
  }
  const count = (state: JournalDifference) => differences.filter((item) => item.state === state).length;
  const newCount = count("new");
  const conflictCount = count("conflict");
  const totalAfterMerge = current.cases.length + newCount;
  return {
    differences,
    newCount,
    conflictCount,
    identicalCount: count("identical"),
    localOnlyCount: count("local-only"),
    canMerge: conflictCount === 0 && totalAfterMerge <= CASE_LIMITS.maxCases,
    totalAfterMerge,
  };
}

/**
 * Merge only new cases. Existing cases are never overwritten or extended by
 * imported records; a divergent shared identifier fails the entire merge.
 */
export function mergeCaseDocuments(
  current: CaseDocument,
  imported: CaseDocument,
): JournalMergeResult {
  const localChecked = validateCaseDocument(current);
  const remoteChecked = validateCaseDocument(imported);
  if (!localChecked.ok || !remoteChecked.ok) {
    return { ok: false, reason: "invalid-document", comparison: null };
  }
  const comparison = compareCaseDocuments(localChecked.value, remoteChecked.value);
  if (comparison.conflictCount > 0) return { ok: false, reason: "conflict", comparison };
  if (comparison.totalAfterMerge > CASE_LIMITS.maxCases) {
    return { ok: false, reason: "too-many-cases", comparison };
  }
  const localIds = new Set(current.cases.map((entry) => entry.id));
  const additions = imported.cases.filter((entry) => !localIds.has(entry.id));
  const sorted = [...current.cases, ...additions].sort((a, b) =>
    a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id, "en"));
  const createdAt = Date.parse(imported.createdAt) > Date.parse(current.createdAt)
    ? imported.createdAt : current.createdAt;
  const merged: CaseDocument = {
    format: "local-recovery-cases",
    version: 1,
    createdAt,
    cases: sorted,
  };
  const checked = validateCaseDocument(merged);
  if (!checked.ok) return { ok: false, reason: "invalid-document", comparison };
  const bytes = new TextEncoder().encode(JSON.stringify(checked.value)).byteLength;
  if (bytes > CASE_LIMITS.maxJsonBytes) return { ok: false, reason: "too-large", comparison };
  return { ok: true, document: checked.value, comparison };
}

export interface JournalCompareCopy {
  readonly heading: string;
  readonly description: string;
  readonly new: string;
  readonly identical: string;
  readonly conflict: string;
  readonly retained: string;
  readonly apply: string;
  readonly discard: string;
  readonly blocked: string;
  readonly noChanges: string;
  readonly applied: string;
  readonly events: string;
  readonly states: Readonly<Record<JournalDifference, string>>;
  readonly errors: Readonly<Record<MergeFailure, string>>;
}

const EN: JournalCompareCopy = {
  heading: "Review imported journal",
  description: "Inspect differences before adding cases. Existing cases are retained, and conflicting histories cannot be combined.",
  new: "New cases", identical: "Unchanged cases", conflict: "Conflicting cases", retained: "Local cases kept",
  apply: "Add new cases", discard: "Discard imported journal", blocked: "Resolve conflicts outside this journal before importing.",
  noChanges: "There are no new cases to add.", applied: "New cases added locally.", events: "Events",
  states: { new: "New", identical: "Unchanged", conflict: "Conflict", "local-only": "Kept locally" },
  errors: {
    conflict: "At least one case has the same identifier but different information.",
    "invalid-document": "The journal content is not supported.",
    "too-many-cases": "The combined journal would contain too many cases.",
    "too-large": "The combined journal would exceed the size limit.",
  },
};
const FR: JournalCompareCopy = {
  heading: "Examiner le journal importé",
  description: "Examinez les différences avant d’ajouter des dossiers. Les dossiers existants sont conservés et les historiques incompatibles ne peuvent pas être réunis.",
  new: "Nouveaux dossiers", identical: "Dossiers inchangés", conflict: "Dossiers incompatibles", retained: "Dossiers locaux conservés",
  apply: "Ajouter les nouveaux dossiers", discard: "Écarter le journal importé", blocked: "Résolvez les incompatibilités hors de ce journal avant l’importation.",
  noChanges: "Aucun nouveau dossier à ajouter.", applied: "Nouveaux dossiers ajoutés localement.", events: "Entrées",
  states: { new: "Nouveau", identical: "Inchangé", conflict: "Incompatible", "local-only": "Conservé localement" },
  errors: {
    conflict: "Au moins un dossier a le même identifiant, mais des renseignements différents.",
    "invalid-document": "Le contenu du journal n’est pas pris en charge.",
    "too-many-cases": "Le journal combiné contiendrait trop de dossiers.",
    "too-large": "Le journal combiné dépasserait la taille autorisée.",
  },
};

export function journalCompareCopy(locale: RecoveryLocale): JournalCompareCopy {
  return locale === "fr" ? FR : EN;
}
