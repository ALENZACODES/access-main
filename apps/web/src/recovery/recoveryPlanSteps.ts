import type { RecoveryLocale } from "./index";
import type { PlanComparison, PlanDelta } from "./recoveryPlanCompare";

/** Suggestions for the user to consider. These steps NEVER perform an operation. */
export type RecoveryStepKind =
  | "inspect-local" | "review-source" | "check-storage" | "request-copy"
  | "compare-again" | "review-history" | "do-not-use";
export interface RecoveryStep {
  readonly id: string;
  readonly kind: RecoveryStepKind;
  readonly packId: string | null;
  readonly priority: "first" | "next" | "optional";
  readonly requiresConnection: boolean | null;
  readonly affectsFiles: false;
}
export interface RecoveryStepPlan {
  readonly steps: readonly RecoveryStep[];
  readonly blocked: number;
  readonly unknown: number;
  readonly total: number;
  readonly incomplete: boolean;
  readonly noAutomaticActions: true;
}
export interface StepOptions {
  readonly maxSteps?: number;
  readonly includeOptional?: boolean;
}
const MAX_STEPS = 200;
function add(steps: RecoveryStep[], item: RecoveryStep, seen: Set<string>, limit: number): void {
  if (steps.length >= limit || seen.has(item.id)) return;
  steps.push(item);
  seen.add(item.id);
}
function stepId(kind: RecoveryStepKind, packId: string | null): string {
  return `${kind}:${packId ?? "all"}`;
}
function suggestion(kind: RecoveryStepKind, packId: string | null,
  priority: RecoveryStep["priority"]): RecoveryStep {
  return {
    id: stepId(kind, packId), kind, packId, priority,
    requiresConnection: kind === "request-copy" ? true : kind === "inspect-local" ? false : null,
    affectsFiles: false,
  };
}
function perPack(entry: PlanDelta): RecoveryStep[] {
  if (entry.current === null || entry.result === "unknown") {
    return [suggestion("do-not-use", entry.id, "first"),
      suggestion("inspect-local", entry.id, "first"),
      suggestion("review-history", entry.id, "optional")];
  }
  if (entry.current === "corrupt" || entry.current === "absent") {
    return [suggestion("do-not-use", entry.id, "first"),
      suggestion("review-source", entry.id, "next"),
      suggestion("request-copy", entry.id, "next"),
      suggestion("compare-again", entry.id, "next")];
  }
  const steps: RecoveryStep[] = [];
  if (entry.changes.includes("source-missing") || entry.changes.includes("source-changed") ||
    entry.changes.includes("date-changed")) {
    steps.push(suggestion("review-source", entry.id, "first"));
  }
  if (entry.changes.includes("state-changed")) {
    steps.push(suggestion("compare-again", entry.id, "next"));
  }
  if (entry.result === "review") steps.push(suggestion("review-history", entry.id, "optional"));
  return steps;
}

/** Limit worklists and keep all advice informational, not an instruction to delete files. */
export function buildRecoverySteps(comparison: PlanComparison, options: StepOptions = {}): RecoveryStepPlan {
  const limit = options.maxSteps !== undefined && Number.isSafeInteger(options.maxSteps) &&
    options.maxSteps > 0 && options.maxSteps <= MAX_STEPS ? options.maxSteps : MAX_STEPS;
  const steps: RecoveryStep[] = [];
  const seen = new Set<string>();
  if (!comparison.usable || comparison.partial) {
    add(steps, suggestion("inspect-local", null, "first"), seen, limit);
  }
  const sorted = [...comparison.entries].sort((a, b) => {
    const rank: Record<PlanDelta["result"], number> = { blocked: 0, unknown: 1, review: 2, unchanged: 3 };
    return rank[a.result] - rank[b.result] || a.id.localeCompare(b.id, "en");
  });
  for (const item of sorted) {
    const suggestions = perPack(item);
    for (const candidate of suggestions) {
      if (!options.includeOptional && candidate.priority === "optional") continue;
      add(steps, candidate, seen, limit);
    }
  }
  return {
    steps, blocked: comparison.counts.blocked, unknown: comparison.counts.unknown,
    total: comparison.entries.length,
    incomplete: comparison.partial || !comparison.usable || steps.length >= limit,
    noAutomaticActions: true,
  };
}

export function filterRecoverySteps(
  plan: RecoveryStepPlan, selection: "all" | "first" | "next" | "optional",
): readonly RecoveryStep[] {
  return selection === "all" ? plan.steps : plan.steps.filter((step) => step.priority === selection);
}
export interface StepCopy {
  readonly title: string; readonly description: string; readonly incomplete: string;
  readonly empty: string; readonly priority: Readonly<Record<RecoveryStep["priority"], string>>;
  readonly kinds: Readonly<Record<RecoveryStepKind, string>>;
  readonly connection: string; readonly none: string; readonly actions: string;
  readonly selection: string; readonly all: string; readonly optional: string;
}
const EN: StepCopy = {
  title: "Manual next steps", description: "These are suggestions based on file differences. Nothing starts automatically. A previous plan cannot establish current file readiness.",
  incomplete: "This is a partial worklist. Some states remain UNKNOWN.",
  empty: "No additional steps are suggested from this comparison.",
  priority: { first: "Start here", next: "Next step", optional: "Optional review" },
  kinds: {
    "inspect-local": "Check the saved file on this device again",
    "review-source": "Review the source, open licence and date",
    "check-storage": "Review available local storage",
    "request-copy": "When connected, request a fresh pack through the App",
    "compare-again": "Compare this pack after a new local check",
    "review-history": "Review the earlier recovery note",
    "do-not-use": "Do not use an absent, damaged or UNKNOWN local file",
  },
  connection: "Connection needed", none: "Connection need UNKNOWN", actions: "Nothing has been changed.",
  selection: "Filter steps", all: "All steps", optional: "Show optional steps",
};
const FR: StepCopy = {
  title: "Prochaines étapes manuelles",
  description: "Ces suggestions reposent sur les différences entre fichiers. Rien ne démarre automatiquement. Un ancien plan ne confirme pas l’état actuel d’un fichier.",
  incomplete: "Cette liste est partielle. Certains états restent INCONNUS.",
  empty: "Aucune autre étape n’est proposée à partir de cette comparaison.",
  priority: { first: "Commencer ici", next: "Étape suivante", optional: "Examen facultatif" },
  kinds: {
    "inspect-local": "Contrôler de nouveau le fichier enregistré sur cet appareil",
    "review-source": "Examiner la source, la licence ouverte et la date",
    "check-storage": "Examiner l’espace de stockage local disponible",
    "request-copy": "Une fois connecté, demander un nouvel ensemble dans l’App",
    "compare-again": "Comparer cet ensemble après un nouveau contrôle local",
    "review-history": "Examiner la note de récupération antérieure",
    "do-not-use": "Ne pas utiliser un fichier local absent, endommagé ou INCONNU",
  },
  connection: "Connexion nécessaire", none: "Besoin de connexion INCONNU",
  actions: "Aucun changement n’a été effectué.", selection: "Filtrer les étapes",
  all: "Toutes les étapes", optional: "Afficher les étapes facultatives",
};
export function recoveryStepCopy(locale: RecoveryLocale): StepCopy {
  return locale === "fr" ? FR : EN;
}
