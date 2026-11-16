import { type CellStore, type StoredCell, type Provenance } from "./regionDownload.ts";

/**
 * Persistent first-party byte storage. No network or background activity.
 * A successful put commits payload and provenance in one transaction.
 */
export interface IndexedCellStoreOptions {
  readonly databaseName?: string;
  readonly indexedDBFactory?: IDBFactory;
}

interface CellRecord {
  readonly key: string;
  readonly region: string;
  readonly cell: string;
  readonly bytes: number;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
}

const DATABASE_VERSION = 1;
const STORE_NAME = "offline-region-cells";

function compositeKey(region: string, cell: string): string {
  if (!region || !cell || region.includes("\u0000") || cell.includes("\u0000")) {
    throw new TypeError("Invalid offline cell key");
  }
  return `${region}\u0000${cell}`;
}

function isRecord(value: unknown): value is CellRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<CellRecord>;
  return typeof record.key === "string" &&
    typeof record.region === "string" &&
    typeof record.cell === "string" &&
    typeof record.bytes === "number" && Number.isSafeInteger(record.bytes) && record.bytes >= 0 &&
    typeof record.source === "string" &&
    typeof record.licence === "string" &&
    typeof record.date === "string" &&
    record.key === compositeKey(record.region, record.cell);
}

function toRecord(region: string, cell: string, stored: StoredCell): CellRecord {
  return {
    key: compositeKey(region, cell),
    region,
    cell,
    bytes: stored.bytes,
    source: stored.provenance.source,
    licence: stored.provenance.licence,
    date: stored.provenance.date,
  };
}

function fromRecord(record: CellRecord): StoredCell {
  const provenance: Provenance = {
    source: record.source,
    licence: record.licence,
    date: record.date,
  };
  return { bytes: record.bytes, provenance };
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error ?? new Error("Storage request failed")); };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => { resolve(); };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Storage transaction failed"));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("Storage transaction aborted"));
    };
  });
}

/** Open the database without deleting or migrating user cell bytes. */
export function openCellDatabase(
  factory: IDBFactory,
  databaseName = "app-offline-regions",
): Promise<IDBDatabase> {
  if (!databaseName || databaseName.length > 100) {
    return Promise.reject(new TypeError("Invalid offline database name"));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { request = factory.open(databaseName, DATABASE_VERSION); } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onerror = () => { reject(request.error ?? new Error("Cannot open offline storage")); };
    request.onblocked = () => { reject(new Error("Offline storage upgrade is blocked")); };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); };
      resolve(database);
    };
  });
}

export interface PersistentCellStore extends CellStore {
  /** Deletes one named cell only on an explicit caller action. */
  readonly remove: (regionId: string, cellId: string) => Promise<void>;
  readonly close: () => void;
}

/**
 * These methods never silently wipe a region on quota error. A transaction
 * failure rejects the operation; callers report UNKNOWN, not success.
 */
export function createIndexedCellStore(database: IDBDatabase): PersistentCellStore {
  let closed = false;
  const ensureOpen = (): void => {
    if (closed) throw new Error("Offline store is closed");
  };
  return {
    async get(regionId, cellId) {
      ensureOpen();
      const key = compositeKey(regionId, cellId);
      const transaction = database.transaction(STORE_NAME, "readonly");
      const done = transactionDone(transaction);
      const request = transaction.objectStore(STORE_NAME).get(key);
      const [result] = await Promise.all([requestValue<unknown>(request), done]);
      if (result === undefined) return undefined;
      if (!isRecord(result) || result.key !== key) {
        throw new Error("Stored cell record cannot be read");
      }
      return fromRecord(result);
    },
    async put(regionId, cellId, stored) {
      ensureOpen();
      const record = toRecord(regionId, cellId, stored);
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(STORE_NAME).put(record);
      await done;
    },
    async remove(regionId, cellId) {
      ensureOpen();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(STORE_NAME).delete(compositeKey(regionId, cellId));
      await done;
    },
    close() {
      if (closed) return;
      closed = true;
      database.close();
    },
  };
}

export async function openIndexedCellStore(
  options: IndexedCellStoreOptions = {},
): Promise<PersistentCellStore> {
  const factory = options.indexedDBFactory ?? globalThis.indexedDB;
  if (!factory) throw new Error("Persistent storage is unavailable");
  const database = await openCellDatabase(factory, options.databaseName);
  return createIndexedCellStore(database);
}

/** Use only for explicit user-requested cleanup of a listed cell. */
export async function removeListedCell(
  store: PersistentCellStore,
  regionId: string,
  requestedId: string,
  allowedIds: readonly string[],
): Promise<boolean> {
  if (!allowedIds.includes(requestedId)) return false;
  await store.remove(regionId, requestedId);
  return true;
}
