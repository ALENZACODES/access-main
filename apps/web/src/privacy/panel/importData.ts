// Restore a file made by "Download my data". The file is checked completely
// before anything is written: format, version, prefix, size, every key and
// every value. Only names in the data scope can be restored: the App's prefix and
// the exact extra names listed for it. If a write fails part
// way, what was written is put back.

import { inScope, toScope, type DataScope } from "./dataScope";
import type { StorageLike } from "./storage";

export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ITEMS = 200;
export const MAX_IMPORT_VALUE_BYTES = 200_000;

export type ImportProblemCode =
  | "too-large"
  | "not-json"
  | "wrong-format"
  | "wrong-version"
  | "wrong-prefix"
  | "bad-items"
  | "too-many-items"
  | "bad-key"
  | "value-too-large"
  | "nothing-to-restore";

export const IMPORT_PROBLEM_CODES: readonly ImportProblemCode[] = [
  "too-large",
  "not-json",
  "wrong-format",
  "wrong-version",
  "wrong-prefix",
  "bad-items",
  "too-many-items",
  "bad-key",
  "value-too-large",
  "nothing-to-restore",
];

export interface ImportPlan {
  /** Every key to write, with its full name and value */
  items: Readonly<Record<string, string>>;
  additions: string[];
  overwrites: string[];
  unchanged: string[];
  bytes: number;
}

export type ImportOutcome = { ok: true; plan: ImportPlan } | { ok: false; code: ImportProblemCode; detail?: string };

const KEY_RE = /^[A-Za-z0-9._:-]+$/;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const encoder = new TextEncoder();

function fail(code: ImportProblemCode, detail?: string): ImportOutcome {
  return detail === undefined ? { ok: false, code } : { ok: false, code, detail };
}

export function prepareImport(text: string, storage: StorageLike | null, prefixOrScope: string | DataScope): ImportOutcome {
  const scope = toScope(prefixOrScope);
  const prefix = scope.prefix;
  if (encoder.encode(text).length > MAX_IMPORT_BYTES) return fail("too-large");
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return fail("not-json");
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return fail("wrong-format");
  const o = v as Record<string, unknown>;
  if (o.format !== "app-local-data") return fail("wrong-format");
  if (o.version !== 1) return fail("wrong-version");
  if (o.prefix !== prefix) return fail("wrong-prefix");
  if (o.items === null || typeof o.items !== "object" || Array.isArray(o.items)) return fail("bad-items");
  const entries = Object.entries(o.items as Record<string, unknown>);
  if (entries.length > MAX_IMPORT_ITEMS) return fail("too-many-items");
  const items: Record<string, string> = {};
  const additions: string[] = [];
  const overwrites: string[] = [];
  const unchanged: string[] = [];
  let bytes = 0;
  for (const [key, value] of entries) {
    const rel = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    if (!inScope(scope, key) || rel === "" || !KEY_RE.test(key) || FORBIDDEN.has(rel)) return fail("bad-key", key);
    if (typeof value !== "string") return fail("bad-items", key);
    const size = encoder.encode(value).length;
    if (size > MAX_IMPORT_VALUE_BYTES) return fail("value-too-large", key);
    bytes += size;
    Object.defineProperty(items, key, { value, enumerable: true, writable: true, configurable: true });
    let current: string | null = null;
    try {
      current = storage === null ? null : storage.getItem(key);
    } catch {
      current = null;
    }
    if (current === null) additions.push(key);
    else if (current === value) unchanged.push(key);
    else overwrites.push(key);
  }
  if (entries.length === 0) return fail("nothing-to-restore");
  return { ok: true, plan: { items, additions: additions.sort(), overwrites: overwrites.sort(), unchanged: unchanged.sort(), bytes } };
}

export interface ApplyResult {
  written: number;
  failed: string[];
  /** true when a write failed and every earlier write was put back */
  rolledBack: boolean;
  /** keys that could not be put back (should be empty) */
  restoreFailed: string[];
}

export function applyImport(storage: StorageLike, plan: ImportPlan): ApplyResult {
  const todo = [...plan.additions, ...plan.overwrites];
  const before = new Map<string, string | null>();
  const done: string[] = [];
  for (const key of todo) {
    try {
      before.set(key, storage.getItem(key));
      storage.setItem(key, plan.items[key] ?? "");
      done.push(key);
    } catch {
      const restoreFailed: string[] = [];
      for (const k of done.reverse()) {
        try {
          const prev = before.get(k) ?? null;
          if (prev === null) storage.removeItem(k);
          else storage.setItem(k, prev);
        } catch {
          restoreFailed.push(k);
        }
      }
      return { written: 0, failed: [key], rolledBack: restoreFailed.length === 0, restoreFailed };
    }
  }
  return { written: done.length, failed: [], rolledBack: false, restoreFailed: [] };
}
