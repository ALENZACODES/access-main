import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import { isSafePackId } from "./packInventory";
import type { DiagnosticFinding, DiagnosticSummary } from "./recoveryDiagnostics";

/** No operation in this file deletes data or initiates a transfer. */
export type ActionKind = "inspect" | "download" | "review-source" | "review-storage";
export type ActionPriority = "required" | "suggested" | "optional";
export type ActionStatus = "pending" | "in-progress" | "complete" | "skipped" | "unknown";

export interface RecoveryActionItem {
  readonly id: string;
  readonly packId: string | null;
  readonly kind: ActionKind;
  readonly priority: ActionPriority;
  readonly status: ActionStatus;
  readonly reason: string;
}

export interface ActionPlan {
  readonly items: readonly RecoveryActionItem[];
  readonly blocked: number;
  readonly pending: number;
  readonly unknown: number;
}

export interface ActionTransition {
  readonly actionId: string;
  readonly next: ActionStatus;
  readonly userInitiated: boolean;
}

const MAX_ACTIONS = 300;
const REASONS: Readonly<Record<string, ActionKind>> = {
  "pack-damaged": "download",
  "pack-missing": "download",
  "pack-unknown": "inspect",
  "source-missing": "review-source",
  "licence-unknown": "review-source",
  "date-invalid": "review-source",
  "date-future": "review-source",
  "date-old": "review-source",
  "size-unavailable": "inspect",
  "size-too-large": "review-storage",
  "duplicate-id": "inspect",
  "id-unsafe": "inspect",
  "capacity-exceeded": "review-storage",
};

function priorityOf(finding: DiagnosticFinding): ActionPriority {
  if (finding.severity === "blocked") return "required";
  if (finding.severity === "attention") return "suggested";
  return "optional";
}

function actionKey(packId: string | null, kind: ActionKind): string {
  return `${packId ?? "inventory"}::${kind}`;
}

function mergePriority(a: ActionPriority, b: ActionPriority): ActionPriority {
  const order: Record<ActionPriority, number> = { required: 0, suggested: 1, optional: 2 };
  return order[a] <= order[b] ? a : b;
}

function sortActions(a: RecoveryActionItem, b: RecoveryActionItem): number {
  const order: Record<ActionPriority, number> = { required: 0, suggested: 1, optional: 2 };
  return order[a.priority] - order[b.priority] ||
    (a.packId ?? "").localeCompare(b.packId ?? "", "en") ||
    a.kind.localeCompare(b.kind, "en");
}

/**
 * Convert findings into a small, deterministic local checklist. Group multiple
 * provenance issues for one pack into a single review action. Actions only
 * describe possible next steps; they must not imply a download URL exists.
 */
export function proposeRecoveryActions(summary: DiagnosticSummary): ActionPlan {
  const actions = new Map<string, RecoveryActionItem>();
  for (const finding of summary.findings.slice(0, MAX_ACTIONS)) {
    const kind = REASONS[finding.code];
    if (kind === undefined) continue;
    const packId = finding.packId !== null && isSafePackId(finding.packId) ? finding.packId : null;
    const id = actionKey(packId, kind);
    const prior = actions.get(id);
    const priority = priorityOf(finding);
    actions.set(id, prior === undefined
      ? { id, packId, kind, priority, status: "pending", reason: finding.code }
      : { ...prior, priority: mergePriority(prior.priority, priority) });
  }
  const items = [...actions.values()].sort(sortActions);
  return summarizeActionPlan(items);
}

function summarizeActionPlan(items: readonly RecoveryActionItem[]): ActionPlan {
  return {
    items,
    blocked: items.filter((item) => item.priority === "required" && item.status !== "complete").length,
    pending: items.filter((item) => item.status === "pending").length,
    unknown: items.filter((item) => item.status === "unknown").length,
  };
}

/**
 * Transitions are made only by explicit user actions or a result of an
 * operation the user started. A completed checklist item does not establish
 * pack readiness; callers must inspect bytes again.
 */
export function transitionRecoveryAction(
  plan: ActionPlan,
  transition: ActionTransition,
): ActionPlan {
  if (!transition.userInitiated) return plan;
  const target = plan.items.find((item) => item.id === transition.actionId);
  if (target === undefined) return plan;
  if (target.status === "complete" && transition.next === "in-progress") return plan;
  if (transition.next === "complete" && target.status !== "in-progress") return plan;
  if (transition.next === "in-progress" && target.status !== "pending" && target.status !== "unknown") return plan;
  if (transition.next === "skipped" && target.status === "in-progress") return plan;
  const items = plan.items.map((item) => item.id === target.id
    ? { ...item, status: transition.next } : item);
  return summarizeActionPlan(items);
}

/**
 * An item remains UNKNOWN when a previously selected pack is still absent,
 * damaged or uninspected. This is not an automatic retry.
 */
export function reconcileRecoveryActions(
  plan: ActionPlan,
  records: readonly LocalPackRecord[],
): ActionPlan {
  const latest = new Map<string, LocalPackRecord>();
  for (const record of records) {
    if (isSafePackId(record.id)) latest.set(record.id, record);
  }
  const items = plan.items.map((item): RecoveryActionItem => {
    if (item.kind !== "download" || item.packId === null) return item;
    if (item.status !== "complete") return item;
    const current = latest.get(item.packId);
    if (current?.state !== "ready") return { ...item, status: "unknown" };
    return item;
  });
  return summarizeActionPlan(items);
}

export function actionEligibleForDownload(
  item: RecoveryActionItem,
  availablePackId: string | undefined,
): boolean {
  return item.kind === "download" && item.packId !== null &&
    availablePackId !== undefined && item.packId === availablePackId &&
    item.status !== "complete" && item.status !== "skipped";
}

export interface ActionsCopy {
  readonly heading: string;
  readonly explanation: string;
  readonly empty: string;
  readonly action: Readonly<Record<ActionKind, string>>;
  readonly priority: Readonly<Record<ActionPriority, string>>;
  readonly status: Readonly<Record<ActionStatus, string>>;
  readonly details: Readonly<Record<ActionKind, string>>;
  readonly begin: string;
  readonly skip: string;
  readonly retry: string;
  readonly acknowledge: string;
  readonly unavailable: string;
  readonly packPrefix: string;
  readonly caution: string;
}

const EN: ActionsCopy = {
  heading: "Recovery checklist",
  explanation: "These are optional manual steps. The App does not repair files, delete them or start transfers without your action.",
  empty: "No recovery steps have been proposed for these files.",
  action: {
    inspect: "Inspect pack again", download: "Get another copy", "review-source": "Review source details",
    "review-storage": "Review storage limits",
  },
  priority: { required: "Before use", suggested: "Suggested", optional: "Optional" },
  status: {
    pending: "Not started", "in-progress": "Started", complete: "Marked done",
    skipped: "Skipped", unknown: "UNKNOWN",
  },
  details: {
    inspect: "Inspect the saved file again after any change. Its status may remain UNKNOWN.",
    download: "Use a source you trust. The saved copy is not replaced until content checks finish.",
    "review-source": "Check the source, open licence and publication date. Missing details remain UNKNOWN.",
    "review-storage": "Check available device storage. No files are deleted automatically.",
  },
  begin: "Mark started", skip: "Skip this step", retry: "Reconsider step",
  acknowledge: "Mark reviewed", unavailable: "No matching download has been supplied for this pack.",
  packPrefix: "Pack", caution: "Marking a step done does not change the status of saved bytes.",
};

const FR: ActionsCopy = {
  heading: "Liste de reprise",
  explanation: "Ces étapes manuelles sont facultatives. L’App ne répare ni ne supprime les fichiers et ne lance aucun transfert sans votre action.",
  empty: "Aucune étape de reprise n’est proposée pour ces fichiers.",
  action: {
    inspect: "Contrôler l’ensemble de nouveau", download: "Obtenir une autre copie",
    "review-source": "Examiner les sources", "review-storage": "Examiner les limites de stockage",
  },
  priority: { required: "Avant utilisation", suggested: "Suggéré", optional: "Facultatif" },
  status: {
    pending: "Non commencé", "in-progress": "Commencé", complete: "Marqué terminé",
    skipped: "Ignoré", unknown: "INCONNU",
  },
  details: {
    inspect: "Contrôlez de nouveau le fichier après tout changement. Son état peut rester INCONNU.",
    download: "Utilisez une source de confiance. La copie n’est remplacée qu’après les contrôles du contenu.",
    "review-source": "Examinez la source, la licence ouverte et la date de publication. Les renseignements manquants restent INCONNUS.",
    "review-storage": "Vérifiez l’espace disponible. Aucun fichier n’est supprimé automatiquement.",
  },
  begin: "Marquer commencé", skip: "Ignorer l’étape", retry: "Reprendre l’étape",
  acknowledge: "Marquer examiné", unavailable: "Aucun téléchargement correspondant n’a été fourni pour cet ensemble.",
  packPrefix: "Ensemble", caution: "Terminer une étape ne change pas l’état des octets enregistrés.",
};

export function actionsCopy(locale: RecoveryLocale): ActionsCopy {
  return locale === "fr" ? FR : EN;
}
