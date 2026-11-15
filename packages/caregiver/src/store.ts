import type { GrantState } from "./types.ts";

export interface GrantStore {
  load(): Promise<GrantState>;
  save(state: GrantState): Promise<void>;
}

export function emptyState(): GrantState {
  return { grants: [], audit: [] };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** For tests and for a device with no IndexedDB. Lost when the page closes. */
export class MemoryStore implements GrantStore {
  private state: GrantState = emptyState();

  load(): Promise<GrantState> {
    return Promise.resolve(clone(this.state));
  }

  save(state: GrantState): Promise<void> {
    this.state = clone(state);
    return Promise.resolve();
  }
}

const STORE_NAME = "state";
const KEY = "current";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Device-only persistence. One record holds the grants and the log, so they are saved together. */
export class IndexedDbStore implements GrantStore {
  private readonly name: string;
  private readonly factory: IDBFactory;
  private opened: Promise<IDBDatabase> | null = null;

  constructor(options: { name?: string; factory?: IDBFactory } = {}) {
    this.name = options.name ?? "access-caregiver";
    this.factory = options.factory ?? indexedDB;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.opened) {
      this.opened = new Promise((resolve, reject) => {
        const request = this.factory.open(this.name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.opened;
  }

  async load(): Promise<GrantState> {
    const db = await this.open();
    const value = await requestResult<unknown>(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(KEY));
    return value === undefined ? emptyState() : clone(value as GrantState);
  }

  async save(state: GrantState): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(clone(state), KEY);
    await transactionDone(tx);
  }

  async close(): Promise<void> {
    if (this.opened) (await this.opened).close();
    this.opened = null;
  }
}
