// Export and erase what the App stored in this browser, under one key prefix.
// This never touches anything held on a server.

import type { Locale } from "./copyLint";
import { scopeKeysPresent, toScope, type DataScope } from "./dataScope";
import type { StorageLike } from "./storage";

export interface ExportFile {
  filename: string;
  mime: "application/json" | "text/csv" | "text/plain" | "text/html";
  text: string;
  count: number;
}

export interface EraseResult {
  removed: number;
  failed: string[];
}

export function listKeys(storage: StorageLike, prefix: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k !== null && k.startsWith(prefix)) out.push(k);
  }
  return out.sort();
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const FILE_STEM: Record<Locale, string> = { en: "the-app-data", fr: "l-app-donnees" };

export function exportLocalData(
  storage: StorageLike,
  prefixOrScope: string | DataScope,
  now: Date,
  locale: Locale,
): ExportFile {
  const scope = toScope(prefixOrScope);
  const prefix = scope.prefix;
  const items: Record<string, string> = {};
  for (const k of scopeKeysPresent(storage, scope)) {
    let v: string | null = null;
    try {
      v = storage.getItem(k);
    } catch {
      // The browser would not let this value be read, so it cannot be in the file.
    }
    if (v !== null) items[k] = v;
  }
  const body = {
    format: "app-local-data",
    version: 1,
    exportedAt: now.toISOString(),
    prefix,
    items,
  };
  return {
    filename: `${FILE_STEM[locale]}-${localDate(now)}.json`,
    mime: "application/json",
    text: `${JSON.stringify(body, null, 2)}\n`,
    count: Object.keys(items).length,
  };
}

export function eraseLocalData(storage: StorageLike, prefixOrScope: string | DataScope): EraseResult {
  const keys = scopeKeysPresent(storage, toScope(prefixOrScope));
  const failed: string[] = [];
  for (const k of keys) {
    try {
      storage.removeItem(k);
    } catch {
      failed.push(k);
      continue;
    }
    // A name counts as removed only when it can be seen to be gone.
    let still = true;
    try {
      still = storage.getItem(k) !== null;
    } catch {
      still = true;
    }
    if (still) failed.push(k);
  }
  return { removed: keys.length - failed.length, failed };
}
