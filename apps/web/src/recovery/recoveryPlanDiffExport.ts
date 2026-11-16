import type { RecoveryLocale } from "./index";
import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";
import type { PlanComparison, PlanDelta, PlanChange } from "./recoveryPlanCompare";
import type { SaveRecoveryPlan } from "./recoveryPlanExport";

/** A comparison report only; it never transports or edits pack contents. */
export interface DiffRecord {
  readonly packId: string;
  readonly earlierState: "absent" | "corrupt" | "ready" | "unknown" | null;
  readonly currentState: "absent" | "corrupt" | "ready" | "unknown" | null;
  readonly review: "blocked" | "review" | "unchanged" | "unknown";
  readonly changes: readonly PlanChange[];
  readonly currentSource: {
    readonly name: string;
    readonly licence: string;
    readonly date: string;
  } | null;
}
export interface DiffDocument {
  readonly format: "local-recovery-diff-v1";
  readonly earlierInspection: string;
  readonly currentInspection: string;
  readonly completeness: "complete" | "partial" | "unknown";
  readonly totals: Readonly<Record<DiffRecord["review"], number>>;
  readonly entries: readonly DiffRecord[];
}
export type DiffExportResult =
  | { readonly ok: true; readonly filename: string; readonly content: string }
  | { readonly ok: false; readonly reason: "not-inspected" | "unsafe" | "too-large" | "save-failed" };

const MAX_ENTRIES = 500;
const MAX_BYTES = 256 * 1024;
const MAX_NAME = 160;
const allowedChanges: readonly PlanChange[] = [
  "missing-now", "new-now", "state-changed", "same-state", "source-changed",
  "source-missing", "date-changed", "historical-only", "unknown-now", "requires-recheck",
];
const allowedStates = ["absent", "corrupt", "ready", "unknown"] as const;
const allowedResults = ["blocked", "review", "unchanged", "unknown"] as const;
function inSet<T extends string>(value: unknown, set: readonly T[]): value is T {
  return typeof value === "string" && set.some((item) => item === value);
}
function cleanName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME &&
    value.trim().length > 0 && !/[\u0000-\u001f\u007f-\u009f<>]/u.test(value);
}
function sourceFor(item: PlanDelta, day: number): DiffRecord["currentSource"] | "unsafe" {
  const source = item.currentSource;
  if (source === null) return null;
  if (!cleanName(source.name) || !isOpenLicence(source.licence)) return "unsafe";
  const sourceDay = parseCalendarDate(source.date);
  if (sourceDay === null || sourceDay > day) return "unsafe";
  return { name: source.name, licence: source.licence, date: source.date };
}
function checkStates(item: PlanDelta): boolean {
  return (item.previous === null || inSet(item.previous, allowedStates)) &&
    (item.current === null || inSet(item.current, allowedStates)) &&
    inSet(item.result, allowedResults) &&
    item.changes.every((change) => inSet(change, allowedChanges));
}

/** Build a bounded and deterministic export from an explicit inspected result. */
export function makePlanDiffExport(comparison: PlanComparison): DiffExportResult {
  if (comparison.inspectedDate === null || !comparison.usable) {
    return { ok: false, reason: "not-inspected" };
  }
  const earlierDay = parseCalendarDate(comparison.planDate);
  const currentDay = parseCalendarDate(comparison.inspectedDate);
  if (earlierDay === null || currentDay === null || earlierDay > currentDay ||
    comparison.entries.length > MAX_ENTRIES) return { ok: false, reason: "unsafe" };
  const seen = new Set<string>();
  const entries: DiffRecord[] = [];
  for (const item of comparison.entries) {
    if (!isSafePackId(item.id) || seen.has(item.id) || !checkStates(item)) {
      return { ok: false, reason: "unsafe" };
    }
    seen.add(item.id);
    const currentSource = sourceFor(item, currentDay);
    if (currentSource === "unsafe") return { ok: false, reason: "unsafe" };
    // A missing current observation must never be presented as complete.
    const currentState = item.current;
    const review = currentState === null || currentState === "unknown" ? "unknown" : item.result;
    entries.push({ packId: item.id, earlierState: item.previous,
      currentState, review, changes: [...item.changes], currentSource });
  }
  entries.sort((a, b) => a.packId.localeCompare(b.packId, "en"));
  const totals = { blocked: 0, review: 0, unchanged: 0, unknown: 0 };
  for (const entry of entries) totals[entry.review]++;
  const completeness: DiffDocument["completeness"] = comparison.partial ? "partial" :
    totals.unknown > 0 ? "unknown" : "complete";
  const document: DiffDocument = {
    format: "local-recovery-diff-v1",
    earlierInspection: comparison.planDate,
    currentInspection: comparison.inspectedDate,
    completeness, totals, entries,
  };
  const content = `${JSON.stringify(document, null, 2)}\n`;
  if (new TextEncoder().encode(content).byteLength > MAX_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  return { ok: true, filename: `pack-recovery-differences-${comparison.inspectedDate}.json`, content };
}

/** Only a host-supplied user-triggered save action may write a report. */
export async function savePlanDiff(
  comparison: PlanComparison, save: SaveRecoveryPlan,
): Promise<DiffExportResult> {
  const created = makePlanDiffExport(comparison);
  if (!created.ok) return created;
  try {
    await save(created.filename, created.content);
    return created;
  } catch {
    return { ok: false, reason: "save-failed" };
  }
}

export interface DiffCopy {
  readonly title: string; readonly description: string; readonly save: string;
  readonly saved: string; readonly blocked: string; readonly unsafe: string;
  readonly tooLarge: string; readonly failed: string; readonly unavailable: string;
}
const EN: DiffCopy = {
  title: "Save pack differences", description: "Save the historical and current file states, differences, and supplied open-licence source metadata. No pack contents are included.",
  save: "Save differences", saved: "Differences saved", blocked: "Run a new local check before saving differences.",
  unsafe: "Comparison details cannot be saved in this format.",
  tooLarge: "The comparison is too large to save.", failed: "The comparison could not be saved.",
  unavailable: "The App needs a local save option to create this report.",
};
const FR: DiffCopy = {
  title: "Enregistrer les différences entre ensembles",
  description: "Enregistrer les états anciens et actuels des fichiers, les différences et les sources avec licences ouvertes fournies. Aucun contenu d’ensemble n’est inclus.",
  save: "Enregistrer les différences", saved: "Différences enregistrées",
  blocked: "Effectuez un nouveau contrôle local avant d’enregistrer les différences.",
  unsafe: "Les détails de comparaison ne peuvent pas être enregistrés dans ce format.",
  tooLarge: "La comparaison est trop volumineuse pour être enregistrée.",
  failed: "La comparaison n’a pas pu être enregistrée.",
  unavailable: "L’App a besoin d’une option d’enregistrement local pour créer ce rapport.",
};
export function planDiffCopy(locale: RecoveryLocale): DiffCopy { return locale === "fr" ? FR : EN; }
