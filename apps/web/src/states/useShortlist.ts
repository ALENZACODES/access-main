import { useCallback, useEffect, useRef, useState } from "react";
import { type AddResult, type ShortlistEntry, SHORTLIST_KEY, addToShortlist, loadShortlist, removeFromShortlist, saveShortlist } from "./shortlist.ts";
import type { KeyValueStore } from "./submissionQueue.ts";

/** The browser's local storage, or null when it refuses access (private mode, a policy, no window). */
export function browserStore(): KeyValueStore | null {
  try {
    const s = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    if (!s) return null;
    // Some browsers hand back the object and then throw on first use.
    s.getItem(SHORTLIST_KEY);
    return s;
  } catch {
    return null;
  }
}

export interface ShortlistState {
  readonly list: readonly ShortlistEntry[];
  /** False when the list could not be read from or written to this device: it then lasts only until the page is closed. */
  readonly kept: boolean;
  add: (id: string) => AddResult;
  remove: (id: string) => void;
  clear: () => void;
}

/**
 * The shortlist for this device, kept in the store given (the browser's by default). Changes made
 * in another tab of the same browser are picked up. If the store cannot be used the list still
 * works in memory and `kept` is false.
 */
export function useShortlist(today: string, store: KeyValueStore | null = browserStore()): ShortlistState {
  const initial = useRef(loadShortlist(store));
  const [list, setList] = useState<readonly ShortlistEntry[]>(initial.current.list);
  const [kept, setKept] = useState(initial.current.ok);
  const latest = useRef(list);
  latest.current = list;

  const commit = useCallback(
    (next: readonly ShortlistEntry[]) => {
      latest.current = next;
      setList(next);
      setKept(saveShortlist(store, next));
    },
    [store],
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SHORTLIST_KEY) return;
      const reread = loadShortlist(store);
      latest.current = reread.list;
      setList(reread.list);
      setKept(reread.ok);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store]);

  const add = useCallback(
    (id: string): AddResult => {
      const out = addToShortlist(latest.current, id, today);
      if (out.result === "added") commit(out.list);
      return out.result;
    },
    [commit, today],
  );
  const remove = useCallback((id: string) => commit(removeFromShortlist(latest.current, id)), [commit]);
  const clear = useCallback(() => commit([]), [commit]);
  return { list, kept, add, remove, clear };
}
