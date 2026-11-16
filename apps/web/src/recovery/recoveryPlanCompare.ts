import type { RecoveryLocale, RecoverySource } from "./index";
import type { LocalPlanDocument, LocalPlanEntry } from "./recoveryPlanExport";
import type { RepairPolicyResult, RepairRecommendation } from "./recoveryPolicy";
import { isSafePackId } from "./packInventory";

/** Compare historical notes with a CURRENT inspection without importing status. */
export type PlanChange =
  | "missing-now" | "new-now" | "state-changed" | "same-state"
  | "source-changed" | "source-missing" | "date-changed"
  | "historical-only" | "unknown-now" | "requires-recheck";
export interface PlanDelta {
  readonly id: string;
  readonly previous: LocalPlanEntry["localState"] | null;
  readonly current: RepairRecommendation["state"] | null;
  readonly queueNote: LocalPlanEntry["queueStage"] | null;
  readonly changes: readonly PlanChange[];
  readonly source: RecoverySource | null;
  readonly currentSource: RecoverySource | null;
  readonly result: "blocked" | "review" | "unchanged" | "unknown";
}
export interface PlanComparison {
  readonly entries: readonly PlanDelta[];
  readonly counts: Readonly<Record<PlanDelta["result"], number>>;
  readonly inspectedDate: string | null;
  readonly planDate: string;
  readonly partial: boolean;
  readonly usable: boolean;
}
export interface CompareOptions {
  readonly currentInspected: boolean;
  readonly maximum?: number;
}
const MAX_ENTRIES = 500;
function sameSource(a: RecoverySource | null, b: RecoverySource | null): boolean {
  return a?.name === b?.name && a?.licence === b?.licence && a?.date === b?.date;
}
function status(changes: readonly PlanChange[], current: RepairRecommendation | undefined): PlanDelta["result"] {
  if (current === undefined || current.state === "unknown" || !current.contentReady && current.priority !== "blocked") return "unknown";
  if (current.priority === "blocked") return "blocked";
  if (changes.some((c) => c === "source-changed" || c === "source-missing" || c === "date-changed")) return "review";
  if (current.priority === "review" || changes.includes("state-changed")) return "review";
  return "unchanged";
}

/** Never coerce previous `ready` into a current `ready` or infer place accessibility. */
export function compareRecoveryPlan(
  imported: LocalPlanDocument, current: RepairPolicyResult, options: CompareOptions,
): PlanComparison {
  const limit = options.maximum !== undefined && Number.isSafeInteger(options.maximum) &&
    options.maximum > 0 && options.maximum <= MAX_ENTRIES ? options.maximum : MAX_ENTRIES;
  const previous = new Map(imported.entries.filter((item) => isSafePackId(item.packId)).map((item) => [item.packId, item]));
  const fresh = new Map(current.recommendations.filter((item) => isSafePackId(item.id)).map((item) => [item.id, item]));
  const ids = [...new Set([...previous.keys(), ...fresh.keys()])].sort((a, b) => a.localeCompare(b, "en"));
  const entries: PlanDelta[] = [];
  const counts = { blocked: 0, review: 0, unchanged: 0, unknown: 0 };
  for (const id of ids.slice(0, limit)) {
    const old = previous.get(id);
    const now = options.currentInspected ? fresh.get(id) : undefined;
    const changes: PlanChange[] = [];
    if (!options.currentInspected) changes.push("requires-recheck");
    else if (old === undefined) changes.push("new-now");
    else if (now === undefined) changes.push("missing-now");
    if (old !== undefined && now !== undefined) {
      changes.push(old.localState === now.state ? "same-state" : "state-changed");
      if (now.state === "unknown") changes.push("unknown-now");
      if (old.source !== null && now.source === undefined) changes.push("source-missing");
      else if (!sameSource(old.source, now.source ?? null)) {
        changes.push("source-changed");
        if (old.source?.date !== now.source?.date) changes.push("date-changed");
      }
    }
    if (old !== undefined && now === undefined) changes.push("historical-only");
    const result: PlanDelta["result"] = options.currentInspected ? status(changes, now) : "unknown";
    counts[result]++;
    entries.push({ id, previous: old?.localState ?? null, current: now?.state ?? null,
      queueNote: old?.queueStage ?? null, changes, source: old?.source ?? null,
      currentSource: now?.source ?? null, result });
  }
  return { entries, counts, inspectedDate: options.currentInspected ? current.date : null,
    planDate: imported.inspectionDate,
    partial: ids.length > limit || current.overflow > 0,
    usable: options.currentInspected && current.date !== null && current.overflow === 0 };
}

export type ComparisonFilter = "all" | "blocked" | "review" | "unknown" | "unchanged";
export function filterPlanDeltas(comparison: PlanComparison, filter: ComparisonFilter): readonly PlanDelta[] {
  return filter === "all" ? comparison.entries : comparison.entries.filter((entry) => entry.result === filter);
}
export function summarizePlanChanges(comparison: PlanComparison): {
  readonly changed: number; readonly newPacks: number; readonly missingPacks: number;
  readonly unknown: number; readonly sourceDifferences: number;
} {
  let changed = 0, newPacks = 0, missingPacks = 0, unknown = 0, sourceDifferences = 0;
  for (const item of comparison.entries) {
    if (item.changes.includes("state-changed")) changed++;
    if (item.changes.includes("new-now")) newPacks++;
    if (item.changes.includes("missing-now")) missingPacks++;
    if (item.result === "unknown") unknown++;
    if (item.changes.some((x) => x === "source-changed" || x === "source-missing")) sourceDifferences++;
  }
  return { changed, newPacks, missingPacks, unknown, sourceDifferences };
}

export interface PlanComparisonCopy {
  readonly title: string; readonly intro: string; readonly noInspection: string;
  readonly partial: string; readonly noChanges: string; readonly previous: string;
  readonly current: string; readonly source: string; readonly licence: string;
  readonly date: string; readonly queue: string; readonly unknown: string;
  readonly filter: string; readonly categories: Readonly<Record<ComparisonFilter, string>>;
  readonly status: Readonly<Record<PlanDelta["result"], string>>;
  readonly changes: Readonly<Record<PlanChange, string>>;
}
const EN: PlanComparisonCopy = {
  title: "Compare the plan with this device", intro: "Historical choices are notes only. Current status comes exclusively from a fresh local inspection.",
  noInspection: "Run a local check to compare files.", partial: "The comparison is incomplete. Some pack states remain UNKNOWN.",
  noChanges: "No entries match this filter.", previous: "Earlier file state", current: "Current file state",
  source: "Source", licence: "Licence", date: "Date", queue: "Earlier queue choice", unknown: "UNKNOWN",
  filter: "Filter differences", categories: {
    all: "All", blocked: "Needs action", review: "Review", unknown: "UNKNOWN", unchanged: "No new issue shown",
  },
  status: { blocked: "Needs action", review: "Review details", unchanged: "No new local issue shown", unknown: "UNKNOWN" },
  changes: {
    "missing-now": "Not listed in this inspection", "new-now": "New in this inspection",
    "state-changed": "Local file state changed", "same-state": "Same recorded file state",
    "source-changed": "Supplied source details differ", "source-missing": "Source details no longer supplied",
    "date-changed": "Source date differs", "historical-only": "Historical entry only",
    "unknown-now": "Current file state UNKNOWN", "requires-recheck": "Current check needed",
  },
};
const FR: PlanComparisonCopy = {
  title: "Comparer le plan avec cet appareil",
  intro: "Les choix antérieurs sont des notes seulement. L’état actuel provient exclusivement d’un nouveau contrôle local.",
  noInspection: "Effectuez un contrôle local pour comparer les fichiers.",
  partial: "La comparaison est incomplète. Certains états d’ensemble restent INCONNUS.",
  noChanges: "Aucune entrée ne correspond à ce filtre.", previous: "État antérieur du fichier",
  current: "État actuel du fichier", source: "Source", licence: "Licence", date: "Date",
  queue: "Choix antérieur de la file", unknown: "INCONNU", filter: "Filtrer les différences",
  categories: { all: "Tous", blocked: "Intervention nécessaire", review: "À examiner", unknown: "INCONNU", unchanged: "Aucun nouveau problème signalé" },
  status: { blocked: "Intervention nécessaire", review: "Examiner les détails", unchanged: "Aucun nouveau problème local signalé", unknown: "INCONNU" },
  changes: {
    "missing-now": "Absent de ce contrôle", "new-now": "Nouveau dans ce contrôle",
    "state-changed": "L’état du fichier local a changé", "same-state": "Même état de fichier consigné",
    "source-changed": "Les renseignements de source diffèrent", "source-missing": "Les renseignements de source ne sont plus fournis",
    "date-changed": "La date de la source diffère", "historical-only": "Entrée historique seulement",
    "unknown-now": "État actuel du fichier INCONNU", "requires-recheck": "Nouveau contrôle nécessaire",
  },
};
export function planComparisonCopy(locale: RecoveryLocale): PlanComparisonCopy { return locale === "fr" ? FR : EN; }
