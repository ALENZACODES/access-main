import type { RecoveryLocale } from "./index";
import { isSafePackId, type LocalPackState } from "./packInventory";
import { parseCalendarDate } from "./recoveryDiagnostics";
import type { RepairRecommendation } from "./recoveryPolicy";

/** A volatile log of explicit recovery decisions, not a record of place access. */
export type LedgerAction = "review" | "request-download" | "cancel" | "inspect" | "dismiss";
export type LedgerOutcome = "pending" | "complete" | "failed" | "unknown";
export interface LedgerEvent {
  readonly number: number;
  readonly packId: string;
  readonly action: LedgerAction;
  readonly outcome: LedgerOutcome;
  readonly day: string;
  readonly prior: LocalPackState;
  readonly after: LocalPackState;
}
export interface RecoveryLedger {
  readonly version: 1;
  readonly nextNumber: number;
  readonly events: readonly LedgerEvent[];
  readonly discarded: number;
}
export interface LedgerRequest {
  readonly packId: string;
  readonly action: LedgerAction;
  readonly outcome: LedgerOutcome;
  readonly day: string;
  readonly prior: LocalPackState;
  readonly after: LocalPackState;
}
export type LedgerResult =
  | { readonly ok: true; readonly ledger: RecoveryLedger }
  | { readonly ok: false; readonly reason: "invalid" | "duplicate" | "limit" };

const MAX_EVENTS = 160;
const MAX_NUMBER = 1_000_000;
const states: readonly LocalPackState[] = ["absent", "corrupt", "ready", "unknown"];
const actions: readonly LedgerAction[] = ["review", "request-download", "cancel", "inspect", "dismiss"];
const outcomes: readonly LedgerOutcome[] = ["pending", "complete", "failed", "unknown"];

export function emptyRecoveryLedger(): RecoveryLedger {
  return { version: 1, nextNumber: 1, events: [], discarded: 0 };
}

export function appendLedgerEvent(ledger: RecoveryLedger, request: LedgerRequest): LedgerResult {
  if (!validLedger(ledger) || !isSafePackId(request.packId) ||
    !actions.includes(request.action) || !outcomes.includes(request.outcome) ||
    !states.includes(request.prior) || !states.includes(request.after) ||
    parseCalendarDate(request.day) === null) {
    return { ok: false, reason: "invalid" };
  }
  if (ledger.nextNumber > MAX_NUMBER) return { ok: false, reason: "limit" };
  // A journal may describe the prior observation, but never claim ready as a
  // result of requesting, cancelling, dismissing or merely reviewing a file.
  if (request.after === "ready" && request.prior !== "ready") {
    if (request.action !== "inspect" || request.outcome !== "complete") {
      return { ok: false, reason: "invalid" };
    }
  }
  if (request.action === "request-download" && request.outcome === "complete") {
    return { ok: false, reason: "invalid" };
  }
  const last = ledger.events[ledger.events.length - 1];
  if (last !== undefined && last.packId === request.packId &&
    last.action === request.action && last.day === request.day &&
    last.outcome === request.outcome && last.after === request.after) {
    return { ok: false, reason: "duplicate" };
  }
  const event: LedgerEvent = { ...request, number: ledger.nextNumber };
  const appended = [...ledger.events, event];
  const discarded = Math.max(0, appended.length - MAX_EVENTS);
  return {
    ok: true,
    ledger: {
      version: 1, nextNumber: ledger.nextNumber + 1,
      events: appended.slice(discarded), discarded: ledger.discarded + discarded,
    },
  };
}

/** Accept only a structurally sound ledger; never trust imported history. */
export function validLedger(value: unknown): value is RecoveryLedger {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Partial<RecoveryLedger>;
  if (input.version !== 1 || !Number.isSafeInteger(input.nextNumber) ||
    (input.nextNumber ?? 0) < 1 || (input.nextNumber ?? 0) > MAX_NUMBER + 1 ||
    !Number.isSafeInteger(input.discarded) || (input.discarded ?? -1) < 0 ||
    !Array.isArray(input.events) || input.events.length > MAX_EVENTS) return false;
  let previous = 0;
  for (const event of input.events as readonly LedgerEvent[]) {
    if (typeof event !== "object" || event === null ||
      !Number.isSafeInteger(event.number) || event.number <= previous ||
      event.number >= input.nextNumber! || !isSafePackId(event.packId) ||
      !actions.includes(event.action) || !outcomes.includes(event.outcome) ||
      !states.includes(event.prior) || !states.includes(event.after) ||
      parseCalendarDate(event.day) === null) return false;
    previous = event.number;
  }
  return true;
}

export interface LedgerSnapshot {
  readonly eventCount: number;
  readonly unknownCount: number;
  readonly failedCount: number;
  readonly requestedCount: number;
  readonly lastByPack: ReadonlyMap<string, LedgerEvent>;
}

export function summarizeLedger(ledger: RecoveryLedger): LedgerSnapshot {
  const lastByPack = new Map<string, LedgerEvent>();
  let unknownCount = 0;
  let failedCount = 0;
  let requestedCount = 0;
  for (const item of ledger.events) {
    lastByPack.set(item.packId, item);
    if (item.outcome === "unknown") unknownCount++;
    if (item.outcome === "failed") failedCount++;
    if (item.action === "request-download") requestedCount++;
  }
  return { eventCount: ledger.events.length, unknownCount, failedCount, requestedCount, lastByPack };
}

/** New inspections supersede earlier assumptions; no historical ready carryover. */
export function reconcileLedger(
  ledger: RecoveryLedger, records: readonly RepairRecommendation[], day: string,
): RecoveryLedger {
  if (!validLedger(ledger) || parseCalendarDate(day) === null) return emptyRecoveryLedger();
  const lastByPack = summarizeLedger(ledger).lastByPack;
  let current = ledger;
  for (const record of records) {
    if (!isSafePackId(record.id)) continue;
    const last = lastByPack.get(record.id);
    if (last === undefined || last.after === record.state) continue;
    const added = appendLedgerEvent(current, {
      packId: record.id, action: "inspect", day,
      prior: last.after, after: record.state,
      outcome: record.state === "ready" && record.contentReady ? "complete" : "unknown",
    });
    if (added.ok) current = added.ledger;
  }
  return current;
}

export interface LedgerCopy {
  readonly heading: string;
  readonly explanation: string;
  readonly empty: string;
  readonly clear: string;
  readonly clearDescription: string;
  readonly actions: Readonly<Record<LedgerAction, string>>;
  readonly outcomes: Readonly<Record<LedgerOutcome, string>>;
  readonly discarded: string;
  readonly totals: string;
  readonly unknown: string;
  readonly requested: string;
  readonly failed: string;
}
const EN: LedgerCopy = {
  heading: "This session’s recovery history",
  explanation: "Only actions in this session appear here. No account, location or device identifier is stored.",
  empty: "No recovery actions recorded in this session.",
  clear: "Clear session history", clearDescription: "Clearing this list does not remove saved packs.",
  actions: {
    review: "Reviewed", "request-download": "Download requested", cancel: "Cancelled",
    inspect: "Inspected", dismiss: "Dismissed",
  },
  outcomes: { pending: "Pending", complete: "Completed local check", failed: "Failed", unknown: "UNKNOWN" },
  discarded: "Older session events omitted", totals: "Events", unknown: "Unknown outcomes",
  requested: "Download requests", failed: "Failed actions",
};
const FR: LedgerCopy = {
  heading: "Historique de récupération de cette session",
  explanation: "Seules les actions de cette session figurent ici. Aucun compte ni identifiant d’appareil ou de lieu n’est conservé.",
  empty: "Aucune action de récupération enregistrée pendant cette session.",
  clear: "Effacer l’historique de la session",
  clearDescription: "Effacer cette liste ne supprime aucun ensemble enregistré.",
  actions: {
    review: "Examiné", "request-download": "Téléchargement demandé", cancel: "Annulé",
    inspect: "Contrôlé", dismiss: "Ignoré",
  },
  outcomes: { pending: "En attente", complete: "Contrôle local terminé", failed: "Échec", unknown: "INCONNU" },
  discarded: "Anciens événements de la session omis", totals: "Événements", unknown: "Résultats inconnus",
  requested: "Demandes de téléchargement", failed: "Actions en échec",
};
export function recoveryLedgerCopy(locale: RecoveryLocale): LedgerCopy {
  return locale === "fr" ? FR : EN;
}
