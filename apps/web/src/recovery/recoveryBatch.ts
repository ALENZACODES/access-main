import type { RecoveryLocale } from "./index";
import { isSafePackId } from "./packInventory";
import type { RepairRecommendation } from "./recoveryPolicy";

/** User-managed queue: an item is NEVER downloaded by this module. */
export type BatchStage = "pending" | "selected" | "waiting" | "recheck" | "done" | "unknown";
export type BatchDecision = "select" | "unselect" | "mark-waiting" | "mark-recheck" | "mark-done" | "reset";
export interface BatchItem {
  readonly id: string;
  readonly stage: BatchStage;
  readonly reasons: readonly string[];
  readonly estimatedBytes: number | null;
  readonly contentReady: boolean;
}
export interface RecoveryBatch {
  readonly version: 1;
  readonly items: readonly BatchItem[];
  readonly revision: number;
}
export interface BatchTransition {
  readonly id: string;
  readonly decision: BatchDecision;
  readonly userInitiated: boolean;
}
export type BatchUpdate =
  | { readonly ok: true; readonly batch: RecoveryBatch }
  | { readonly ok: false; readonly reason: "missing" | "unsafe" | "invalid-transition" | "limit" };
export interface StorageBudget {
  readonly remainingBytes: number | null;
  readonly selectedBytes: number;
  readonly unknownSizeCount: number;
  readonly enough: "yes" | "no" | "unknown";
}
const MAX_ITEMS = 500;
const MAX_REVISION = 100000;
const transitions: Readonly<Record<BatchDecision, readonly BatchStage[]>> = {
  select: ["pending", "unknown"],
  unselect: ["selected"],
  "mark-waiting": ["selected"],
  "mark-recheck": ["waiting"],
  "mark-done": ["recheck"],
  reset: ["selected", "waiting", "recheck", "done", "unknown"],
};

function stageFor(item: RepairRecommendation): BatchStage {
  if (item.state === "ready" && item.contentReady && item.priority === "none") return "done";
  if (item.state === "unknown") return "unknown";
  return "pending";
}

/** Bounded projection from a fresh inspection; duplicates are ignored. */
export function createRecoveryBatch(records: readonly RepairRecommendation[]): RecoveryBatch {
  const seen = new Set<string>();
  const items: BatchItem[] = [];
  for (const record of records) {
    if (items.length >= MAX_ITEMS) break;
    if (!isSafePackId(record.id) || seen.has(record.id)) continue;
    seen.add(record.id);
    items.push({
      id: record.id,
      stage: stageFor(record),
      reasons: record.flags.slice(0, 16),
      estimatedBytes: record.bytes !== null && Number.isSafeInteger(record.bytes) &&
        record.bytes >= 0 ? record.bytes : null,
      contentReady: record.contentReady,
    });
  }
  return { version: 1, items, revision: 0 };
}

export function updateRecoveryBatch(batch: RecoveryBatch, action: BatchTransition): BatchUpdate {
  if (!action.userInitiated || !isSafePackId(action.id) ||
    !Number.isSafeInteger(batch.revision) || batch.revision < 0 ||
    batch.revision >= MAX_REVISION || batch.items.length > MAX_ITEMS) {
    return { ok: false, reason: "unsafe" };
  }
  const index = batch.items.findIndex((item) => item.id === action.id);
  if (index === -1) return { ok: false, reason: "missing" };
  const original = batch.items[index]!;
  if (!transitions[action.decision].includes(original.stage)) {
    return { ok: false, reason: "invalid-transition" };
  }
  if (action.decision === "mark-done" && !original.contentReady) {
    return { ok: false, reason: "invalid-transition" };
  }
  let stage: BatchStage;
  switch (action.decision) {
    case "select": stage = "selected"; break;
    case "unselect": stage = "pending"; break;
    case "mark-waiting": stage = "waiting"; break;
    case "mark-recheck": stage = "recheck"; break;
    case "mark-done": stage = "done"; break;
    case "reset": stage = original.contentReady ? "done" : "pending"; break;
  }
  const items = batch.items.map((item, i) => i === index ? { ...item, stage } : item);
  return { ok: true, batch: { version: 1, items, revision: batch.revision + 1 } };
}

/** A fresh inspection never inherits manual claims of completion. */
export function reconcileRecoveryBatch(
  previous: RecoveryBatch, records: readonly RepairRecommendation[],
): RecoveryBatch {
  const fresh = createRecoveryBatch(records);
  const old = new Map(previous.items.map((item) => [item.id, item]));
  return {
    version: 1, revision: previous.revision + 1,
    items: fresh.items.map((item) => {
      const earlier = old.get(item.id);
      if (earlier === undefined) return item;
      if (item.contentReady) {
        return { ...item, stage: "done" };
      }
      if (earlier.stage === "done") return { ...item, stage: "unknown" };
      if (earlier.stage === "selected") return { ...item, stage: "selected" };
      if (earlier.stage === "waiting") return { ...item, stage: "recheck" };
      if (earlier.stage === "recheck") return { ...item, stage: "recheck" };
      return item;
    }),
  };
}

/** Missing quota or missing sizes must not be treated as enough storage. */
export function calculateStorageBudget(
  batch: RecoveryBatch, availableBytes: number | null,
): StorageBudget {
  let selectedBytes = 0;
  let unknownSizeCount = 0;
  for (const item of batch.items) {
    if (item.stage !== "selected" && item.stage !== "waiting") continue;
    if (item.estimatedBytes === null) unknownSizeCount++;
    else selectedBytes += item.estimatedBytes;
  }
  const remainingBytes = availableBytes === null ||
    !Number.isSafeInteger(availableBytes) || availableBytes < 0 ? null : availableBytes;
  return {
    selectedBytes, unknownSizeCount, remainingBytes,
    enough: remainingBytes === null || unknownSizeCount > 0 ? "unknown" :
      selectedBytes > remainingBytes ? "no" : "yes",
  };
}

export interface BatchCounts {
  readonly total: number;
  readonly selected: number;
  readonly waiting: number;
  readonly recheck: number;
  readonly done: number;
  readonly unknown: number;
}
export function countBatchStages(batch: RecoveryBatch): BatchCounts {
  const result: BatchCounts = {
    total: batch.items.length, selected: 0, waiting: 0, recheck: 0, done: 0, unknown: 0,
  };
  const output = { ...result };
  for (const item of batch.items) {
    if (item.stage === "selected") output.selected++;
    if (item.stage === "waiting") output.waiting++;
    if (item.stage === "recheck") output.recheck++;
    if (item.stage === "done") output.done++;
    if (item.stage === "unknown") output.unknown++;
  }
  return output;
}

export interface BatchCopy {
  readonly heading: string;
  readonly explanation: string;
  readonly caution: string;
  readonly stages: Readonly<Record<BatchStage, string>>;
  readonly decisions: Readonly<Record<BatchDecision, string>>;
  readonly storage: Readonly<Record<StorageBudget["enough"], string>>;
  readonly amount: string;
  readonly unknownSize: string;
  readonly none: string;
  readonly selection: string;
  readonly quotaLabel: string;
  readonly quotaHelp: string;
  readonly numberError: string;
}
const EN: BatchCopy = {
  heading: "Manual recovery queue",
  explanation: "Select the packs you want to handle. This list does not start downloads or change saved files.",
  caution: "After any download, inspect the local bytes again before using the file.",
  stages: {
    pending: "Not selected", selected: "Selected", waiting: "Waiting for a separate download",
    recheck: "Needs another local check", done: "Content ready locally", unknown: "UNKNOWN",
  },
  decisions: {
    select: "Select", unselect: "Remove from queue", "mark-waiting": "Mark as awaiting download",
    "mark-recheck": "Mark for local check", "mark-done": "Mark complete", reset: "Reset",
  },
  storage: { yes: "Enough based on supplied numbers", no: "Selected size exceeds supplied space", unknown: "Storage estimate UNKNOWN" },
  amount: "Known queued bytes", unknownSize: "Files with UNKNOWN size", none: "No packs need queuing.",
  selection: "Queued packs", quotaLabel: "Available device space in bytes (optional)",
  quotaHelp: "Enter a non-negative whole number. Leave blank if unknown.",
  numberError: "Space must be a non-negative whole number within the supported limit.",
};
const FR: BatchCopy = {
  heading: "File de récupération manuelle",
  explanation: "Choisissez les ensembles à traiter. Cette liste ne lance aucun téléchargement et ne modifie aucun fichier enregistré.",
  caution: "Après tout téléchargement, contrôlez de nouveau les données locales avant utilisation.",
  stages: {
    pending: "Non sélectionné", selected: "Sélectionné", waiting: "En attente d’un téléchargement séparé",
    recheck: "Nouveau contrôle local nécessaire", done: "Contenu prêt localement", unknown: "INCONNU",
  },
  decisions: {
    select: "Sélectionner", unselect: "Retirer de la file", "mark-waiting": "Signaler l’attente d’un téléchargement",
    "mark-recheck": "Demander un contrôle local", "mark-done": "Marquer comme terminé", reset: "Réinitialiser",
  },
  storage: { yes: "Espace suffisant selon les nombres fournis", no: "La taille sélectionnée dépasse l’espace indiqué", unknown: "Estimation du stockage INCONNUE" },
  amount: "Octets connus dans la file", unknownSize: "Fichiers de taille INCONNUE", none: "Aucun ensemble à placer dans la file.",
  selection: "Ensembles dans la file", quotaLabel: "Espace disponible en octets (facultatif)",
  quotaHelp: "Saisissez un entier positif ou nul. Laissez vide si la valeur est inconnue.",
  numberError: "L’espace doit être un entier positif ou nul dans la limite prise en charge.",
};
export function recoveryBatchCopy(locale: RecoveryLocale): BatchCopy {
  return locale === "fr" ? FR : EN;
}

export function parseQuotaInput(input: string): number | null | "invalid" {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (!/^(0|[1-9][0-9]*)$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : "invalid";
}
