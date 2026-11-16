import type { RecoveryLocale } from "./index";
import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";
import type { RepairPolicyResult } from "./recoveryPolicy";
import type { RecoveryBatch } from "./recoveryBatch";
import type { RecoveryLedger } from "./recoveryLedger";
import { validLedger } from "./recoveryLedger";

/** Only a compact, non-sensitive summary may leave the in-memory workbench. */
export interface LocalPlanEntry {
  readonly packId: string;
  readonly localState: "absent" | "corrupt" | "ready" | "unknown";
  readonly queueStage: "pending" | "selected" | "waiting" | "recheck" | "done" | "unknown";
  readonly source: {
    readonly name: string;
    readonly licence: string;
    readonly date: string;
  } | null;
}
export interface LocalPlanDocument {
  readonly format: "local-recovery-plan-v1";
  readonly inspectionDate: string;
  readonly outcome: "needs-action" | "review" | "unknown" | "no-local-issue";
  readonly entries: readonly LocalPlanEntry[];
  readonly session: {
    readonly actions: number;
    readonly omitted: number;
  };
}
export type PlanExportResult =
  | { readonly ok: true; readonly filename: string; readonly content: string }
  | { readonly ok: false; readonly reason: "unsafe" | "too-large" | "save-failed" };
export type SaveRecoveryPlan = (name: string, content: string) => Promise<void>;
const MAX_ENTRIES = 500;
const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_SOURCE_NAME = 160;
const STAGES = new Set<LocalPlanEntry["queueStage"]>([
  "pending", "selected", "waiting", "recheck", "done", "unknown",
]);
const STATES = new Set<LocalPlanEntry["localState"]>([
  "absent", "corrupt", "ready", "unknown",
]);

function safeText(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SOURCE_NAME &&
    value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Metadata projection: no raw bytes, URLs, coordinates or external calls. */
export function createLocalPlanExport(
  policy: RepairPolicyResult, batch: RecoveryBatch, ledger: RecoveryLedger,
): PlanExportResult {
  if (policy.date === null || parseCalendarDate(policy.date) === null ||
    policy.recommendations.length > MAX_ENTRIES || batch.items.length > MAX_ENTRIES ||
    !validLedger(ledger) || batch.version !== 1 || !Number.isSafeInteger(batch.revision)) {
    return { ok: false, reason: "unsafe" };
  }
  const stages = new Map<string, LocalPlanEntry["queueStage"]>();
  for (const item of batch.items) {
    if (!isSafePackId(item.id) || stages.has(item.id) || !STAGES.has(item.stage)) {
      return { ok: false, reason: "unsafe" };
    }
    stages.set(item.id, item.stage);
  }
  const seen = new Set<string>();
  const entries: LocalPlanEntry[] = [];
  for (const item of policy.recommendations) {
    if (!isSafePackId(item.id) || seen.has(item.id) || !STATES.has(item.state)) {
      return { ok: false, reason: "unsafe" };
    }
    seen.add(item.id);
    const stage = stages.get(item.id);
    if (stage === undefined) return { ok: false, reason: "unsafe" };
    const source = item.source;
    let safeSource: LocalPlanEntry["source"] = null;
    if (source !== undefined && safeText(source.name) &&
      isOpenLicence(source.licence) && parseCalendarDate(source.date) !== null &&
      parseCalendarDate(source.date)! <= parseCalendarDate(policy.date)!) {
      safeSource = { name: source.name, licence: source.licence, date: source.date };
    }
    // Even an earlier ready observation is not promoted to content-ready in
    // this report unless the policy's local check says so at inspection time.
    const localState = item.state === "ready" && !item.contentReady ? "unknown" : item.state;
    entries.push({ packId: item.id, localState, queueStage: stage, source: safeSource });
  }
  if (entries.length !== stages.size) return { ok: false, reason: "unsafe" };
  entries.sort((a, b) => a.packId.localeCompare(b.packId, "en"));
  const outcome = policy.date === null ? "unknown" :
    policy.totals.blocked > 0 ? "needs-action" :
      policy.totals.review > 0 ? "review" :
        policy.overflow > 0 ? "unknown" : "no-local-issue";
  const document: LocalPlanDocument = {
    format: "local-recovery-plan-v1", inspectionDate: policy.date,
    outcome, entries, session: { actions: ledger.events.length, omitted: ledger.discarded },
  };
  const content = `${JSON.stringify(document, null, 2)}\n`;
  if (new TextEncoder().encode(content).byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  return { ok: true, filename: `pack-recovery-plan-${policy.date}.json`, content };
}

/** The save callback must be supplied by the host application. */
export async function saveLocalPlanExport(
  policy: RepairPolicyResult, batch: RecoveryBatch, ledger: RecoveryLedger,
  save: SaveRecoveryPlan,
): Promise<PlanExportResult> {
  const result = createLocalPlanExport(policy, batch, ledger);
  if (!result.ok) return result;
  try {
    await save(result.filename, result.content);
    return result;
  } catch {
    return { ok: false, reason: "save-failed" };
  }
}

export interface PlanExportCopy {
  readonly heading: string;
  readonly description: string;
  readonly action: string;
  readonly success: string;
  readonly unsafe: string;
  readonly tooLarge: string;
  readonly failed: string;
  readonly unavailable: string;
}
const EN: PlanExportCopy = {
  heading: "Save a local recovery plan",
  description: "Includes pack identifiers, observed file states, queue choices and supplied open-licence source details. No file bytes or locations are included.",
  action: "Save recovery plan", success: "Recovery plan saved", unsafe: "Plan details are incomplete or unsupported.",
  tooLarge: "Recovery plan is too large to save.", failed: "Recovery plan could not be saved.",
  unavailable: "Inspect local packs before saving a plan.",
};
const FR: PlanExportCopy = {
  heading: "Enregistrer un plan de récupération local",
  description: "Le plan comprend les identifiants d’ensembles, les états des fichiers, les choix de la file et les sources avec licences ouvertes fournies. Aucun contenu de fichier ni lieu n’est inclus.",
  action: "Enregistrer le plan", success: "Plan de récupération enregistré",
  unsafe: "Les renseignements du plan sont incomplets ou non pris en charge.",
  tooLarge: "Le plan de récupération est trop volumineux.",
  failed: "Le plan de récupération n’a pas pu être enregistré.",
  unavailable: "Contrôlez les ensembles locaux avant d’enregistrer un plan.",
};
export function planExportCopy(locale: RecoveryLocale): PlanExportCopy {
  return locale === "fr" ? FR : EN;
}
