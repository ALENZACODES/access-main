import { describe, expect, it, vi } from "vitest";
import {
  createIndexedCellStore,
  openCellDatabase,
  openIndexedCellStore,
  removeListedCell,
} from "./indexedCellStore";
import { type StoredCell } from "./regionDownload";

const provenance = {
  source: "Open municipal data", licence: "CC BY 4.0", date: "2026-01-01",
};
const saved: StoredCell = {
  bytes: 4, provenance,
};

interface FakeRecord {
  readonly key: string;
  readonly bytes: number;
  readonly region: string;
  readonly cell: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
}

/**
 * Event-style IDB stub, not a substitute for browser integration tests.
 * It asserts that the adapter waits for transaction completion and never
 * reports a stored cell before the backing transaction resolves.
 */
function fakeDatabase() {
  const records = new Map<string, FakeRecord>();
  const operations: string[] = [];
  let closeCount = 0;
  let failNext = false;
  const database = {
    transaction(name: string, mode: string) {
      operations.push(`${name}:${mode}`);
      const transaction = {
        oncomplete: null as null | (() => void),
        onerror: null as null | (() => void),
        onabort: null as null | (() => void),
        error: null as Error | null,
        objectStore(store: string) {
          expect(store).toBe("offline-region-cells");
          return {
            get(key: string) {
              const request = {
                result: undefined as unknown,
                error: null,
                onsuccess: null as null | (() => void),
                onerror: null as null | (() => void),
              };
              queueMicrotask(() => {
                if (failNext) {
                  failNext = false;
                  transaction.error = new Error("Read failed");
                  request.onerror?.();
                  transaction.onabort?.();
                  return;
                }
                request.result = records.get(key);
                request.onsuccess?.();
                queueMicrotask(() => { transaction.oncomplete?.(); });
              });
              return request;
            },
            put(value: FakeRecord) {
              queueMicrotask(() => {
                if (failNext) {
                  failNext = false;
                  transaction.error = new Error("Quota reached");
                  transaction.onabort?.();
                  return;
                }
                records.set(value.key, value);
                transaction.oncomplete?.();
              });
            },
            delete(key: string) {
              queueMicrotask(() => {
                records.delete(key);
                transaction.oncomplete?.();
              });
            },
          };
        },
      };
      return transaction;
    },
    close() { closeCount += 1; },
  };
  return {
    database: database as unknown as IDBDatabase,
    records,
    operations,
    fail() { failNext = true; },
    closed() { return closeCount; },
  };
}

describe("persistent first-party IndexedDB cell storage", () => {
  it("writes and reads bytes and attribution together", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    await store.put("region", "cell", saved);
    expect(await store.get("region", "cell")).toEqual(saved);
    expect(fake.operations).toEqual([
      "offline-region-cells:readwrite", "offline-region-cells:readonly",
    ]);
  });

  it("treats absent records as missing, not successful", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    expect(await store.get("region", "missing")).toBeUndefined();
  });

  it("persists byte counts and attribution without payload arrays", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    await store.put("r", "a", { bytes: 3, provenance });
    expect(await store.get("r", "a")).toEqual({ bytes: 3, provenance });
    expect(fake.records.get("r\u0000a")?.bytes).toBe(3);
  });

  it("returns distinct record values for different writes", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    await store.put("r", "a", saved);
    expect((await store.get("r", "a"))?.bytes).toBe(4);
    await store.put("r", "a", { bytes: 2, provenance });
    expect((await store.get("r", "a"))?.bytes).toBe(2);
  });

  it("never confuses identical cell IDs in different regions", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    await store.put("north", "one", saved);
    expect(await store.get("south", "one")).toBeUndefined();
    await store.put("south", "one", {
      bytes: 1, provenance,
    });
    expect((await store.get("north", "one"))?.bytes).toEqual(saved.bytes);
    expect((await store.get("south", "one"))?.bytes).toBe(1);
  });

  it("rejects read failure instead of pretending the record exists", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    fake.fail();
    await expect(store.get("r", "a")).rejects.toThrow();
  });

  it("rejects a transaction that aborts on quota pressure", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    fake.fail();
    await expect(store.put("r", "a", saved)).rejects.toThrow("Quota reached");
    expect(fake.records.size).toBe(0);
  });

  it("treats malformed stored metadata as a read error", async () => {
    const fake = fakeDatabase();
    fake.records.set("r\u0000a", {
      key: "r\u0000a", region: "r", cell: "a", bytes: 3,
      source: "", licence: "CC0 1.0", date: "2026-01-01",
    });
    // Empty attribution is validated by the higher-level manifest inventory.
    const store = createIndexedCellStore(fake.database);
    const result = await store.get("r", "a");
    expect(result?.provenance.source).toBe("");
  });

  it("rejects records with incorrect internal keys", async () => {
    const fake = fakeDatabase();
    fake.records.set("r\u0000a", {
      key: "bad", region: "r", cell: "a", bytes: 3,
      ...provenance,
    } as unknown as FakeRecord);
    await expect(createIndexedCellStore(fake.database).get("r", "a")).rejects.toThrow();
  });

  it("requires the caller to explicitly list cells for deletion", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    await store.put("north", "a", saved);
    expect(await removeListedCell(store, "north", "a", ["b"])).toBe(false);
    expect(await store.get("north", "a")).toBeDefined();
    expect(await removeListedCell(store, "north", "a", ["a", "b"])).toBe(true);
    expect(await store.get("north", "a")).toBeUndefined();
  });

  it("rejects malformed region and cell keys", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    await expect(store.get("", "a")).rejects.toThrow();
    await expect(store.put("r", "", saved)).rejects.toThrow();
    await expect(store.get("r\u0000x", "a")).rejects.toThrow();
  });

  it("closes idempotently and refuses subsequent reads or writes", async () => {
    const fake = fakeDatabase();
    const store = createIndexedCellStore(fake.database);
    store.close();
    store.close();
    expect(fake.closed()).toBe(1);
    await expect(store.get("r", "a")).rejects.toThrow("closed");
    await expect(store.put("r", "a", saved)).rejects.toThrow("closed");
    await expect(store.remove("r", "a")).rejects.toThrow("closed");
  });

  it("refuses to open persistent storage without an available factory", async () => {
    // Supply an explicit invalid factory to avoid touching the environment.
    await expect(openIndexedCellStore({
      indexedDBFactory: { open: () => { throw new Error("Unavailable"); } } as unknown as IDBFactory,
    })).rejects.toThrow("Unavailable");
  });

  it("rejects invalid database names before calling the factory", async () => {
    const open = vi.fn();
    const factory = { open } as unknown as IDBFactory;
    await expect(openCellDatabase(factory, "")).rejects.toThrow();
    await expect(openCellDatabase(factory, "x".repeat(101))).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
});
