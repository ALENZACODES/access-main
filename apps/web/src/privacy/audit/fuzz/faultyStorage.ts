// A storage that fails the way real browser storage fails, on demand, and writes down everything done to it.
// Real storage throws when it is full or blocked, can ignore a write without saying so, and can fail to remove.
// Code that says it handles these cases is checked against this, not against a storage that always works.

import { createMemoryStorage, type StorageLike } from "../../panel/storage";

export type OpKind = "get" | "set" | "remove" | "key";

export interface Op {
  kind: OpKind;
  key: string;
  /** false when the call threw */
  ok: boolean;
}

export interface Faults {
  /** The nth write from now (1 is the next one) throws. */
  failWriteNumber?: number;
  /** Every write for which this returns true throws. */
  failWriteWhen?: (key: string, value: string) => boolean;
  /** Every write for which this returns true is ignored without an error. */
  dropWriteWhen?: (key: string, value: string) => boolean;
  /** Every remove for which this returns true throws. */
  failRemoveWhen?: (key: string) => boolean;
  /** Every remove for which this returns true does nothing and says nothing. */
  dropRemoveWhen?: (key: string) => boolean;
  /** Every read for which this returns true throws. */
  failReadWhen?: (key: string) => boolean;
  /** Writes that would take the total size of keys and values past this many characters throw. */
  quotaChars?: number;
}

export interface FaultyStorage extends StorageLike {
  /** Change what fails from now on. Passing nothing clears every fault. */
  setFaults(f?: Faults): void;
  /** Every call so far, in order. */
  readonly ops: readonly Op[];
  /** The stored names and values right now. */
  snapshot(): Record<string, string>;
  /** Names that were written or removed (successfully or not), sorted and without repeats. */
  touched(): string[];
  /** Names a write call asked for, whether or not it worked. */
  writesAttempted(): string[];
  clearOps(): void;
}

export class FakeQuotaError extends Error {
  constructor() {
    super("The quota has been exceeded.");
    this.name = "QuotaExceededError";
  }
}

export class FakeBlockedError extends Error {
  constructor(what: string) {
    super(`Storage ${what} is blocked.`);
    this.name = "SecurityError";
  }
}

export function createFaultyStorage(initial: Record<string, string> = {}, faults: Faults = {}): FaultyStorage {
  const inner = createMemoryStorage(initial);
  let f: Faults = { ...faults };
  let writesLeft = f.failWriteNumber ?? 0;
  const ops: Op[] = [];
  const log = (kind: OpKind, key: string, ok: boolean): void => {
    ops.push({ kind, key, ok });
  };
  const total = (): number => {
    let n = 0;
    for (let i = 0; i < inner.length; i += 1) {
      const k = inner.key(i);
      if (k !== null) n += k.length + (inner.getItem(k) ?? "").length;
    }
    return n;
  };
  return {
    get length() {
      return inner.length;
    },
    key: (i) => {
      const k = inner.key(i);
      log("key", k ?? "", true);
      return k;
    },
    getItem: (key) => {
      if (f.failReadWhen?.(key) === true) {
        log("get", key, false);
        throw new FakeBlockedError("read");
      }
      log("get", key, true);
      return inner.getItem(key);
    },
    setItem: (key, value) => {
      if (f.failWriteNumber !== undefined) {
        writesLeft -= 1;
        if (writesLeft === 0) {
          log("set", key, false);
          throw new FakeQuotaError();
        }
      }
      if (f.failWriteWhen?.(key, value) === true) {
        log("set", key, false);
        throw new FakeQuotaError();
      }
      if (f.quotaChars !== undefined) {
        const old = inner.getItem(key);
        const after = total() - (old === null ? 0 : key.length + old.length) + key.length + value.length;
        if (after > f.quotaChars) {
          log("set", key, false);
          throw new FakeQuotaError();
        }
      }
      if (f.dropWriteWhen?.(key, value) === true) {
        log("set", key, true);
        return;
      }
      log("set", key, true);
      inner.setItem(key, value);
    },
    removeItem: (key) => {
      if (f.failRemoveWhen?.(key) === true) {
        log("remove", key, false);
        throw new FakeBlockedError("remove");
      }
      if (f.dropRemoveWhen?.(key) === true) {
        log("remove", key, true);
        return;
      }
      log("remove", key, true);
      inner.removeItem(key);
    },
    setFaults: (next = {}) => {
      f = { ...next };
      writesLeft = next.failWriteNumber ?? 0;
    },
    ops,
    snapshot: () => {
      const out: Record<string, string> = {};
      for (let i = 0; i < inner.length; i += 1) {
        const k = inner.key(i);
        if (k !== null) out[k] = inner.getItem(k) ?? "";
      }
      return out;
    },
    touched: () => [...new Set(ops.filter((o) => o.kind === "set" || o.kind === "remove").map((o) => o.key))].sort(),
    writesAttempted: () => [...new Set(ops.filter((o) => o.kind === "set").map((o) => o.key))].sort(),
    clearOps: () => {
      ops.length = 0;
    },
  };
}

/** Names touched by a write or remove that the rule does not allow. Empty means the code stayed inside its lane. */
export function outsideTouches(s: FaultyStorage, allowed: (key: string) => boolean): string[] {
  return s.touched().filter((k) => !allowed(k));
}
