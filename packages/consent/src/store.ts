import { STORE_SCHEMA_VERSION, type AuditEntry, type ConsentEvent } from "./types.ts";

export interface StoredState {
  schema_version: typeof STORE_SCHEMA_VERSION;
  events: ConsentEvent[];
  audit: AuditEntry[];
}

/** Synchronous, device-local storage. Implementations must not touch the network. */
export interface ConsentStore {
  /** False when state is lost when the page closes. The UI says so. */
  readonly persistent: boolean;
  /** Returns whatever was saved, or null when nothing was. Never throws. */
  load(): unknown;
  /** Throws when the state could not be saved. */
  save(state: StoredState): void;
}

export function createMemoryStore(initial: unknown = null): ConsentStore {
  let saved: unknown = structuredClone(initial);
  return {
    persistent: false,
    load: () => structuredClone(saved),
    save: (state) => {
      saved = structuredClone(state);
    },
  };
}

export const DEFAULT_STORAGE_KEY = "app.consent.v1";

export function createLocalStorageStore(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string = DEFAULT_STORAGE_KEY,
): ConsentStore {
  return {
    persistent: true,
    load: () => {
      try {
        const raw = storage.getItem(key);
        return raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        return "unreadable";
      }
    },
    save: (state) => {
      storage.setItem(key, JSON.stringify(state));
    },
  };
}
