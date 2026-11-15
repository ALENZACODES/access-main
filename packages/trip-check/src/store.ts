import type { Storage, TripDraft } from "./types";

/** In-memory store. Used in tests and as the fallback when no store is injected. */
export class MemoryStorage implements Storage {
  private rows = new Map<string, TripDraft>();
  async list(): Promise<TripDraft[]> {
    return [...this.rows.values()].map((d) => ({ ...d }));
  }
  async put(draft: TripDraft): Promise<void> {
    this.rows.set(draft.id, { ...draft });
  }
  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

/** The small part of a Dexie `Table` that the adapter needs. */
export interface TableLike {
  toArray(): Promise<TripDraft[]>;
  put(value: TripDraft): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

/**
 * Adapter for a Dexie table (no Dexie import, so no new dependency).
 * Suggested schema: `tripCheckDrafts: "id, field_id, retrieved_at"`.
 */
export function tableStorage(table: TableLike): Storage {
  return {
    list: () => table.toArray(),
    put: async (d) => {
      await table.put(d);
    },
    remove: async (id) => {
      await table.delete(id);
    },
  };
}
