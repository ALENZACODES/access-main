/**
 * A short list of places the person picked from the saved pack, kept on this device only.
 *
 * The list holds ids and the day each was added, nothing else: the facts about a place always come
 * from the pack as it is now, so the list never keeps a copy that could go stale. A listed id that
 * the pack no longer holds is reported as missing and its details stay UNKNOWN. Whatever is read
 * back from storage is checked, because storage can hold anything.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { isIsoDate } from "./provenance";
import type { KeyValueStore } from "./submissionQueue";

export const SHORTLIST_KEY = "app.pack-shortlist.v1";
/** At most this many places. The comparison table stays readable and the stored list stays small. */
export const MAX_SHORTLIST = 12;
const MAX_ID_LENGTH = 200;
// eslint-disable-next-line no-control-regex -- ids may not hold control characters or spaces
const BAD_ID = /[\u0000-\u001F\u007F\s]/;

export interface ShortlistEntry {
  readonly id: string;
  /** ISO date the place was added, or null when the stored date was not a valid date. */
  readonly addedOn: string | null;
}

export type AddResult = "added" | "already" | "full" | "invalid";

/** The same id rule the pack audit applies: a non-empty string with no spaces or control characters. */
export function isShortlistId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH && !BAD_ID.test(value);
}

/** Read a stored list. Accepts the JSON text or an already-parsed value; invalid entries are dropped, repeats are kept once, and the list is cut at MAX_SHORTLIST. */
export function parseShortlist(raw: unknown): ShortlistEntry[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ShortlistEntry[] = [];
  for (const item of value as unknown[]) {
    if (out.length >= MAX_SHORTLIST) break;
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const { id, addedOn } = item as Record<string, unknown>;
    if (!isShortlistId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, addedOn: isIsoDate(addedOn) ? addedOn : null });
  }
  return out;
}

export function serializeShortlist(list: readonly ShortlistEntry[]): string {
  return JSON.stringify(list.map((e) => ({ id: e.id, addedOn: e.addedOn })));
}

export function isShortlisted(list: readonly ShortlistEntry[], id: string): boolean {
  return list.some((e) => e.id === id);
}

/** A new list with the place added at the end. The list is returned as it was when the id is not valid, already there, or the list is full. */
export function addToShortlist(list: readonly ShortlistEntry[], id: string, today: string): { readonly list: readonly ShortlistEntry[]; readonly result: AddResult } {
  if (!isShortlistId(id)) return { list, result: "invalid" };
  if (isShortlisted(list, id)) return { list, result: "already" };
  if (list.length >= MAX_SHORTLIST) return { list, result: "full" };
  return { list: [...list, { id, addedOn: isIsoDate(today) ? today : null }], result: "added" };
}

export function removeFromShortlist(list: readonly ShortlistEntry[], id: string): readonly ShortlistEntry[] {
  return list.some((e) => e.id === id) ? list.filter((e) => e.id !== id) : list;
}

export interface ResolvedShortlist {
  /** Listed places the pack still holds, in the order they were added. */
  readonly found: readonly { readonly entry: ShortlistEntry; readonly place: PackPlaceRecord }[];
  /** Listed ids the pack no longer holds. Nothing is known about them. */
  readonly missing: readonly ShortlistEntry[];
}

export function resolveShortlist(list: readonly ShortlistEntry[], places: readonly PackPlaceRecord[]): ResolvedShortlist {
  const byId = new Map(places.map((p) => [p.id, p] as const));
  const found: { entry: ShortlistEntry; place: PackPlaceRecord }[] = [];
  const missing: ShortlistEntry[] = [];
  for (const entry of list) {
    const place = byId.get(entry.id);
    if (place) found.push({ entry, place });
    else missing.push(entry);
  }
  return { found, missing };
}

/** Load from a store. Anything wrong reads as an empty list, and `ok` says whether the store could be read at all. */
export function loadShortlist(store: KeyValueStore | null): { readonly list: readonly ShortlistEntry[]; readonly ok: boolean } {
  if (store === null) return { list: [], ok: false };
  try {
    return { list: parseShortlist(store.getItem(SHORTLIST_KEY)), ok: true };
  } catch {
    return { list: [], ok: false };
  }
}

/** Save to a store. Returns false when the store refuses, so the page can say the list will not be kept. */
export function saveShortlist(store: KeyValueStore | null, list: readonly ShortlistEntry[]): boolean {
  if (store === null) return false;
  try {
    if (list.length === 0) store.removeItem(SHORTLIST_KEY);
    else store.setItem(SHORTLIST_KEY, serializeShortlist(list));
    return true;
  } catch {
    return false;
  }
}
