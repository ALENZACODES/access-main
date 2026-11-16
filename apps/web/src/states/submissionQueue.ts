/**
 * Offline queue for correction suggestions. State lives in an injected key-value store
 * (localStorage in a browser) and is validated on every read, so a corrupted or edited
 * store can never crash the App or inject unvalidated data.
 */
import { FEATURE_IDS } from "./dataStatus";
import { SUGGESTED_VALUES, type Submission, MAX_NOTE_LENGTH, isSubmissionId } from "./correction";
import { isPlaceId } from "./placeRecord";
import { isIsoDate } from "./provenance";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const MAX_QUEUE = 50;
export const QUEUE_KEY = "app.corrections.v1";
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 3_600_000;

/** 0 for no attempts, then 30 s, 60 s, 120 s ... capped at one hour. */
export function backoffMs(attempts: number): number {
  if (!Number.isFinite(attempts) || attempts <= 0) return 0;
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(attempts - 1, 20));
}

function parseItem(x: unknown): Submission | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const p = o.payload as Record<string, unknown> | null | undefined;
  if (typeof p !== "object" || p === null) return null;
  if (!isSubmissionId(o.id) || !isIsoDate(o.createdOn)) return null;
  if (o.status !== "pending" && o.status !== "rejected") return null;
  if (typeof o.attempts !== "number" || !Number.isInteger(o.attempts) || o.attempts < 0) return null;
  if (typeof o.nextAttemptAt !== "number" || !Number.isFinite(o.nextAttemptAt) || o.nextAttemptAt < 0) return null;
  if (!isPlaceId(p.placeId)) return null;
  if (!(FEATURE_IDS as readonly string[]).includes(p.feature as string)) return null;
  if (!(SUGGESTED_VALUES as readonly string[]).includes(p.suggested as string)) return null;
  if (typeof p.note !== "string" || p.note.length > MAX_NOTE_LENGTH) return null;
  if (p.contact !== null && typeof p.contact !== "string") return null;
  return {
    id: o.id,
    createdOn: o.createdOn,
    status: o.status,
    attempts: o.attempts,
    nextAttemptAt: o.nextAttemptAt,
    payload: {
      placeId: p.placeId,
      feature: p.feature as Submission["payload"]["feature"],
      suggested: p.suggested as Submission["payload"]["suggested"],
      note: p.note,
      contact: p.contact as string | null,
    },
  };
}

/** Parse stored JSON; anything invalid is dropped. */
export function parseQueue(raw: string | null): Submission[] {
  if (raw === null) return [];
  try {
    const data = JSON.parse(raw) as { v?: unknown; items?: unknown };
    if (data.v !== 1 || !Array.isArray(data.items)) return [];
    return data.items.map(parseItem).filter((s): s is Submission => s !== null).slice(0, MAX_QUEUE);
  } catch {
    return [];
  }
}

export type EnqueueResult = "ok" | "queue-full" | "duplicate";

export interface SubmissionQueue {
  list(): Submission[];
  pending(): Submission[];
  enqueue(s: Submission): EnqueueResult;
  markSent(id: string): void;
  markFailed(id: string, nowMs: number): void;
  markRejected(id: string): void;
}

export function createQueue(store: KeyValueStore, key: string = QUEUE_KEY): SubmissionQueue {
  const read = (): Submission[] => {
    try {
      return parseQueue(store.getItem(key));
    } catch {
      return [];
    }
  };
  const write = (items: readonly Submission[]): void => {
    try {
      if (items.length === 0) store.removeItem(key);
      else store.setItem(key, JSON.stringify({ v: 1, items }));
    } catch {
      /* storage full or blocked: the in-memory result of this call is still returned */
    }
  };
  const update = (id: string, fn: (s: Submission) => Submission | null): void => {
    write(read().flatMap((s) => (s.id === id ? (fn(s) ? [fn(s) as Submission] : []) : [s])));
  };
  return {
    list: read,
    pending: () => read().filter((s) => s.status === "pending"),
    enqueue(s) {
      const items = read();
      if (items.some((i) => i.id === s.id)) return "duplicate";
      if (items.length >= MAX_QUEUE) return "queue-full";
      write([...items, s]);
      return "ok";
    },
    markSent: (id) => update(id, () => null),
    markFailed: (id, nowMs) =>
      update(id, (s) => ({ ...s, attempts: s.attempts + 1, nextAttemptAt: nowMs + backoffMs(s.attempts + 1) })),
    markRejected: (id) => update(id, (s) => ({ ...s, status: "rejected" })),
  };
}

export type SendResult = "ok" | "retry" | "reject";

export interface FlushSummary {
  readonly sent: number;
  readonly rejected: number;
  readonly retried: number;
  readonly skipped: number;
  readonly offline: boolean;
}

/**
 * Send pending suggestions in order. Stops at the first "retry" so order is kept.
 * Items still inside their backoff window are skipped. A thrown error counts as "retry".
 */
export async function flushQueue(
  queue: SubmissionQueue,
  send: (s: Submission) => Promise<SendResult>,
  opts: { readonly online: boolean; readonly nowMs: number },
): Promise<FlushSummary> {
  const items = queue.pending();
  if (!opts.online) return { sent: 0, rejected: 0, retried: 0, skipped: items.length, offline: true };
  let sent = 0, rejected = 0, retried = 0, skipped = 0;
  for (let i = 0; i < items.length; i++) {
    const s = items[i]!;
    if (s.nextAttemptAt > opts.nowMs) {
      skipped++;
      continue;
    }
    let result: SendResult;
    try {
      result = await send(s);
    } catch {
      result = "retry";
    }
    if (result === "ok") {
      queue.markSent(s.id);
      sent++;
    } else if (result === "reject") {
      queue.markRejected(s.id);
      rejected++;
    } else {
      queue.markFailed(s.id, opts.nowMs);
      retried++;
      skipped += items.length - i - 1;
      break;
    }
  }
  return { sent, rejected, retried, skipped, offline: false };
}
