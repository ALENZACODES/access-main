/**
 * Boundary hygiene for data loading: a timeout, defensive normalisation of whatever the
 * loader returns, and removal of records that cannot be shown safely. Loader failures
 * become error views instead of unhandled exceptions.
 */
import { isPlaceId, type PlaceRecord } from "./placeRecord";

export type PlacesLoad =
  | { readonly status: "ok"; readonly places: readonly PlaceRecord[]; readonly fromSavedCopy: boolean; readonly dropped?: number }
  | { readonly status: "error"; readonly httpStatus?: number };

export class TimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

export interface Timers {
  readonly set: (fn: () => void, ms: number) => unknown;
  readonly clear: (handle: unknown) => void;
}

const REAL_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function withTimeout<T>(p: Promise<T>, ms: number, timers: Timers = REAL_TIMERS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = timers.set(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => { timers.clear(handle); resolve(v); },
      (e: unknown) => { timers.clear(handle); reject(e); },
    );
  });
}

/** Keep records that have a safe id, a name and a features array; first record wins per id. */
export function sanitizePlaces(input: readonly unknown[]): { readonly places: PlaceRecord[]; readonly dropped: number } {
  const seen = new Set<string>();
  const places: PlaceRecord[] = [];
  for (const raw of input) {
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    if (
      !isPlaceId(r.id) || seen.has(r.id) ||
      typeof r.name !== "string" || r.name.trim() === "" ||
      !Array.isArray(r.features)
    ) continue;
    seen.add(r.id);
    places.push(raw as PlaceRecord);
  }
  return { places, dropped: input.length - places.length };
}

function normalizeLoad(x: unknown): PlacesLoad {
  const o = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
  if (o.status === "ok" && Array.isArray(o.places)) {
    const { places, dropped } = sanitizePlaces(o.places);
    return { status: "ok", places, fromSavedCopy: o.fromSavedCopy === true, ...(dropped > 0 ? { dropped } : {}) };
  }
  if (o.status === "error") {
    const h = o.httpStatus;
    return typeof h === "number" && Number.isInteger(h) && h >= 100 && h <= 599 ? { status: "error", httpStatus: h } : { status: "error" };
  }
  return { status: "error", httpStatus: 502 };
}

/** Run the loader with a timeout. Never throws: failures become `{ status: "error" }`. */
export async function safeLoad(load: () => Promise<unknown>, ms: number, timers?: Timers): Promise<PlacesLoad> {
  try {
    return normalizeLoad(await withTimeout(load(), ms, timers));
  } catch (e) {
    return { status: "error", httpStatus: e instanceof TimeoutError ? 504 : 500 };
  }
}
