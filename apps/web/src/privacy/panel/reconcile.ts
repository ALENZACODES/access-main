// Compares what is really stored under the App's key prefix with what the data
// list says. Contents are never read into the result: only names, sizes and
// expiry dates.

import { parseEnvelope } from "./expiry";
import type { InventoryEntry } from "./inventory";
import { listKeys } from "./localData";
import type { StorageLike } from "./storage";

export interface StoredItem {
  /** Name without the App's key prefix */
  key: string;
  /** Size of the stored text in UTF-8 bytes */
  bytes: number;
  /** Set only when the value is an expiring envelope */
  expiresAt?: string;
  /** The list entry that describes it, if any */
  entryId?: string;
}

export interface Reconciled {
  items: StoredItem[];
  /** Items the list describes */
  documented: StoredItem[];
  /** Items the list does not describe */
  undocumented: StoredItem[];
  /** On-device entries that name no storage key, so they cannot be matched */
  unmatchable: string[];
  totalBytes: number;
}

export function matchKey(key: string, pattern: string): boolean {
  return pattern.endsWith("*") ? key.startsWith(pattern.slice(0, -1)) : key === pattern;
}

const encoder = new TextEncoder();

export function reconcile(
  storage: StorageLike | null,
  prefix: string,
  entries: readonly InventoryEntry[],
): Reconciled {
  const items: StoredItem[] = [];
  if (storage !== null) {
    for (const full of listKeys(storage, prefix)) {
      let raw: string | null = null;
      try {
        raw = storage.getItem(full);
      } catch {
        raw = null;
      }
      if (raw === null) continue;
      const key = full.slice(prefix.length);
      const owner = entries.find((e) => (e.storageKeys ?? []).some((p) => matchKey(key, p)));
      const env = parseEnvelope(raw);
      items.push({
        key,
        bytes: encoder.encode(raw).length,
        ...(env !== null ? { expiresAt: env.expiresAt } : {}),
        ...(owner !== undefined ? { entryId: owner.id } : {}),
      });
    }
  }
  return {
    items,
    documented: items.filter((i) => i.entryId !== undefined),
    undocumented: items.filter((i) => i.entryId === undefined),
    unmatchable: entries.filter((e) => e.where === "on-device" && (e.storageKeys ?? []).length === 0).map((e) => e.id),
    totalBytes: items.reduce((n, i) => n + i.bytes, 0),
  };
}
