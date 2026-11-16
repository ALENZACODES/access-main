export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory storage for tests and for browsers that block real storage. */
export function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** localStorage, or null when the browser refuses access (private mode, policy). */
export function safeLocalStorage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (s === undefined) return null;
    const probe = "__app_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
