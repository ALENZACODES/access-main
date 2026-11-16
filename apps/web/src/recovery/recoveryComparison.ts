import type { LocalPackRecord, LocalPackState } from "./packInventory";
import { isSafePackId } from "./packInventory";
import type { RecoveryLocale, RecoverySource } from "./index";

/**
 * Two explicit inspection snapshots; no persistent storage, timers or polling.
 * Changes indicate file observations, not changes to real-world locations.
 */
export type ChangeKind =
  | "added"
  | "removed"
  | "became-ready"
  | "no-longer-ready"
  | "state-changed"
  | "source-changed"
  | "size-changed";
export interface PackChange {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly before: LocalPackState | null;
  readonly after: LocalPackState | null;
}
export interface PackComparison {
  readonly changes: readonly PackChange[];
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly previousCount: number;
  readonly currentCount: number;
  readonly hasUncertainChanges: boolean;
}

function sourceKey(source: RecoverySource | undefined): string | null {
  if (!source) return null;
  if (typeof source.name !== "string" || typeof source.licence !== "string" || typeof source.date !== "string") {
    return null;
  }
  return JSON.stringify([source.name, source.licence, source.date]);
}

function indexUnique(records: readonly LocalPackRecord[]): {
  readonly entries: Map<string, LocalPackRecord>;
  readonly rejected: number;
} {
  const entries = new Map<string, LocalPackRecord>();
  let rejected = 0;
  for (const record of records) {
    if (!isSafePackId(record.id) || entries.has(record.id)) {
      rejected++;
      continue;
    }
    entries.set(record.id, record);
  }
  return { entries, rejected };
}

function compareRecord(before: LocalPackRecord, after: LocalPackRecord): ChangeKind | null {
  if (before.state !== after.state) {
    if (before.state !== "ready" && after.state === "ready") return "became-ready";
    if (before.state === "ready" && after.state !== "ready") return "no-longer-ready";
    return "state-changed";
  }
  if (sourceKey(before.source) !== sourceKey(after.source)) return "source-changed";
  if (before.byteLength !== after.byteLength) return "size-changed";
  return null;
}

export function compareInspections(
  previous: readonly LocalPackRecord[],
  current: readonly LocalPackRecord[],
): PackComparison {
  const old = indexUnique(previous);
  const next = indexUnique(current);
  const ids = [...new Set([...old.entries.keys(), ...next.entries.keys()])].sort((a, b) => a.localeCompare(b, "en"));
  const changes: PackChange[] = [];
  let unchangedCount = 0;
  for (const id of ids) {
    const before = old.entries.get(id);
    const after = next.entries.get(id);
    if (!before && after) {
      changes.push({ id, kind: "added", before: null, after: after.state });
    } else if (before && !after) {
      changes.push({ id, kind: "removed", before: before.state, after: null });
    } else if (before && after) {
      const kind = compareRecord(before, after);
      if (kind) changes.push({ id, kind, before: before.state, after: after.state });
      else unchangedCount++;
    }
  }
  return {
    changes,
    unchangedCount,
    rejectedCount: old.rejected + next.rejected,
    previousCount: previous.length,
    currentCount: current.length,
    hasUncertainChanges: changes.some((item) => item.after !== "ready") || old.rejected + next.rejected > 0,
  };
}

export interface ReviewEvent {
  readonly sequence: number;
  readonly action: "inspect" | "download" | "export" | "review";
  readonly outcome: "complete" | "failed" | "cancelled" | "unknown";
  readonly packId: string | null;
  readonly date: string;
}

export interface LocalReviewLog {
  readonly entries: readonly ReviewEvent[];
  readonly nextSequence: number;
}

const MAX_LOG_ENTRIES = 50;

/** Volatile session-only log. No user names, coordinates, URLs or raw errors. */
export function emptyReviewLog(): LocalReviewLog {
  return { entries: [], nextSequence: 1 };
}

export function appendReviewEvent(
  log: LocalReviewLog,
  event: Omit<ReviewEvent, "sequence">,
): LocalReviewLog {
  if (!Number.isSafeInteger(log.nextSequence) || log.nextSequence < 1) return emptyReviewLog();
  if (event.packId !== null && !isSafePackId(event.packId)) return log;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return log;
  const next: ReviewEvent = {
    sequence: log.nextSequence,
    action: event.action,
    outcome: event.outcome,
    packId: event.packId,
    date: event.date,
  };
  return {
    entries: [...log.entries, next].slice(-MAX_LOG_ENTRIES),
    nextSequence: log.nextSequence + 1,
  };
}

export function clearReviewLog(): LocalReviewLog {
  return emptyReviewLog();
}

export interface ComparisonCopy {
  readonly heading: string;
  readonly explanation: string;
  readonly empty: string;
  readonly first: string;
  readonly changes: Readonly<Record<ChangeKind, string>>;
  readonly logHeading: string;
  readonly clearLog: string;
  readonly logEmpty: string;
  readonly sessionOnly: string;
  readonly outcomes: Readonly<Record<ReviewEvent["outcome"], string>>;
  readonly events: Readonly<Record<ReviewEvent["action"], string>>;
}

const EN: ComparisonCopy = {
  heading: "Changes since the previous check",
  explanation: "Only local file observations are compared. A changed status is not evidence about a place.",
  empty: "No changes were found between the two inspections.",
  first: "Run another inspection to compare saved files.",
  changes: {
    added: "Added to the local list", removed: "Removed from the local list",
    "became-ready": "Local file passed its content check",
    "no-longer-ready": "Local file no longer passes its content check",
    "state-changed": "Local file status changed", "source-changed": "Source details changed",
    "size-changed": "File size changed",
  },
  logHeading: "This session",
  clearLog: "Clear session history",
  logEmpty: "No operations recorded this session.",
  sessionOnly: "This history stays in memory until the page is closed or cleared.",
  outcomes: { complete: "Finished", failed: "Failed", cancelled: "Cancelled", unknown: "UNKNOWN" },
  events: { inspect: "Pack check", download: "Pack download", export: "Local export", review: "Checklist review" },
};

const FR: ComparisonCopy = {
  heading: "Changements depuis le contrôle précédent",
  explanation: "Seuls les fichiers locaux sont comparés. Un changement d’état ne renseigne pas sur un lieu.",
  empty: "Aucun changement entre les deux contrôles.",
  first: "Effectuez un autre contrôle pour comparer les fichiers enregistrés.",
  changes: {
    added: "Ajout à la liste locale", removed: "Retrait de la liste locale",
    "became-ready": "Le fichier local a réussi le contrôle du contenu",
    "no-longer-ready": "Le fichier local ne réussit plus le contrôle du contenu",
    "state-changed": "Changement d’état du fichier local", "source-changed": "Changement des sources",
    "size-changed": "Changement de taille du fichier",
  },
  logHeading: "Cette session",
  clearLog: "Effacer l’historique de la session",
  logEmpty: "Aucune opération enregistrée pendant cette session.",
  sessionOnly: "Cet historique reste en mémoire jusqu’à la fermeture de la page ou son effacement.",
  outcomes: { complete: "Terminée", failed: "Échec", cancelled: "Annulée", unknown: "INCONNU" },
  events: { inspect: "Contrôle d’ensemble", download: "Téléchargement", export: "Exportation locale", review: "Examen de la liste" },
};

export function comparisonCopy(locale: RecoveryLocale): ComparisonCopy {
  return locale === "fr" ? FR : EN;
}
