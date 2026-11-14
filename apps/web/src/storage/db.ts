import Dexie, { type EntityTable } from "dexie";
import type { CacheEntry, OutboxItem, StoredPack, UserProfile } from "@access/shared";

export interface ShellMeta {
  key: string;
  value: string;
}

export class AppDatabase extends Dexie {
  profiles!: EntityTable<UserProfile, "user_id">;
  cacheEntries!: EntityTable<CacheEntry, "id">;
  outbox!: EntityTable<OutboxItem, "id">;
  meta!: EntityTable<ShellMeta, "key">;
  packs!: EntityTable<StoredPack, "pack_id">;

  constructor() {
    super("access-app");
    this.version(1).stores({
      profiles: "user_id",
      cacheEntries: "id, kind, stored_at",
      outbox: "id, created_at",
      meta: "key",
    });
    this.version(2).stores({
      profiles: "user_id",
      cacheEntries: "id, kind, stored_at",
      outbox: "id, created_at",
      meta: "key",
      packs: "pack_id",
    });
  }
}

export const db = new AppDatabase();
