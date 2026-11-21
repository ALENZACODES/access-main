// "What changed in the data list since you last looked." The last list the
// person marked as seen is kept on this device as short fingerprints plus the
// labels, so removed entries can still be named. The first time, nothing is
// compared: there is nothing earlier to compare with.

import { getExpiring, putExpiring } from "./expiry";
import type { Bilingual, InventoryEntry } from "./inventory";
import type { StorageLike } from "./storage";

export const SEEN_KEY_SUFFIX = "seen.v1";
export const SEEN_TTL_DAYS = 365;

export interface SeenEntry {
  h: string;
  label: Bilingual;
}

export interface SeenList {
  /** YYYY-MM-DD */
  seenOn: string;
  entries: Readonly<Record<string, SeenEntry>>;
}

export type ChangesView =
  | { kind: "first-view" }
  | { kind: "none"; seenOn: string }
  | { kind: "diff"; seenOn: string; added: Bilingual[]; changed: Bilingual[]; removed: Bilingual[] };

export function seenKey(prefix: string): string {
  return `${prefix}${SEEN_KEY_SUFFIX}`;
}

/** 32-bit FNV-1a, as 8 hex digits. A change detector, not a security measure. */
export function fingerprintText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Fingerprint of everything a person reads about one entry. Source and date are excluded on purpose. */
export function fingerprintEntry(e: InventoryEntry): string {
  return fingerprintText(
    JSON.stringify([
      e.label,
      e.where ?? null,
      e.purpose ?? null,
      e.keptFor ?? null,
      [...(e.storageKeys ?? [])].sort(),
    ]),
  );
}

export function snapshot(entries: readonly InventoryEntry[], seenOn: string): SeenList {
  const out: Record<string, SeenEntry> = {};
  for (const e of entries) out[e.id] = { h: fingerprintEntry(e), label: e.label };
  return { seenOn, entries: out };
}

export function diffInventory(seen: SeenList | null, entries: readonly InventoryEntry[]): ChangesView {
  if (seen === null) return { kind: "first-view" };
  const added: Bilingual[] = [];
  const changed: Bilingual[] = [];
  const removed: Bilingual[] = [];
  const now = new Set<string>();
  for (const e of entries) {
    now.add(e.id);
    const before = seen.entries[e.id];
    if (before === undefined) added.push(e.label);
    else if (before.h !== fingerprintEntry(e)) changed.push(e.label);
  }
  for (const [id, s] of Object.entries(seen.entries)) if (!now.has(id)) removed.push(s.label);
  if (added.length + changed.length + removed.length === 0) return { kind: "none", seenOn: seen.seenOn };
  return { kind: "diff", seenOn: seen.seenOn, added, changed, removed };
}

function isBilingual(v: unknown): v is Bilingual {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.en === "string" && typeof o.fr === "string";
}

export function loadSeen(storage: StorageLike | null, prefix: string, now: Date): SeenList | null {
  if (storage === null) return null;
  const r = getExpiring(storage, seenKey(prefix), now);
  if (r.state !== "fresh") return null;
  try {
    const v: unknown = JSON.parse(r.value);
    if (v === null || typeof v !== "object") return null;
    const o = v as { seenOn?: unknown; entries?: unknown };
    if (typeof o.seenOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.seenOn)) return null;
    if (o.entries === null || typeof o.entries !== "object") return null;
    const entries: Record<string, SeenEntry> = {};
    for (const [id, s] of Object.entries(o.entries as Record<string, unknown>)) {
      if (s === null || typeof s !== "object") return null;
      const e = s as { h?: unknown; label?: unknown };
      if (typeof e.h !== "string" || !isBilingual(e.label)) return null;
      // defineProperty, so an entry named __proto__ is stored as a name and cannot become what every entry inherits
      Object.defineProperty(entries, id, { value: { h: e.h, label: e.label }, enumerable: true, writable: true, configurable: true });
    }
    return { seenOn: o.seenOn, entries };
  } catch {
    return null;
  }
}

/** Returns false when the list could not be stored. */
export function saveSeen(storage: StorageLike | null, prefix: string, list: SeenList, now: Date): boolean {
  if (storage === null) return false;
  return putExpiring(storage, seenKey(prefix), JSON.stringify(list), now, SEEN_TTL_DAYS);
}
