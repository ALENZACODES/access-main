// What "my data" means for Download, Erase and Restore. It is every name that starts with the
// panel's prefix, plus a short list of exact names the App keeps elsewhere. The list is exact on
// purpose: a name outside the prefix is touched only when it is written here, never by a pattern,
// so the panel cannot sweep up storage that belongs to the site or to another tool.

import type { StorageLike } from "./storage";

export interface DataScope {
  /** Every name that starts with this is in scope */
  prefix: string;
  /** Exact extra names that are also in scope. They must not start with the prefix. */
  keys: readonly string[];
}

export type ScopeProblemCode = "empty-prefix" | "bad-key" | "inside-prefix" | "duplicate-key" | "reserved-key";

export interface ScopeProblem {
  code: ScopeProblemCode;
  key: string;
}

const KEY_RE = /^[A-Za-z0-9._:-]+$/;
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

/** The scope that has no extra names: what the panel did before extra names existed. */
export function prefixScope(prefix: string): DataScope {
  return { prefix, keys: [] };
}

export function inScope(scope: DataScope, key: string): boolean {
  return key.startsWith(scope.prefix) || scope.keys.includes(key);
}

export function validateScope(scope: DataScope): ScopeProblem[] {
  const problems: ScopeProblem[] = [];
  if (scope.prefix === "") problems.push({ code: "empty-prefix", key: "" });
  const seen = new Set<string>();
  for (const key of scope.keys) {
    if (!KEY_RE.test(key)) problems.push({ code: "bad-key", key });
    else if (RESERVED.has(key)) problems.push({ code: "reserved-key", key });
    else if (scope.prefix !== "" && key.startsWith(scope.prefix)) problems.push({ code: "inside-prefix", key });
    if (seen.has(key)) problems.push({ code: "duplicate-key", key });
    seen.add(key);
  }
  return problems;
}

/** Throws at start-up when the scope could reach more than it should. */
export function assertScope(scope: DataScope): void {
  const problems = validateScope(scope);
  if (problems.length > 0) throw new Error(`Data scope is wrong: ${problems.map((p) => `${p.code} ${p.key}`.trim()).join("; ")}`);
}

/** The stored names that are in scope, sorted. Names that are listed but not stored are left out. */
export function scopeKeysPresent(storage: StorageLike, scope: DataScope): string[] {
  const wanted = new Set(scope.keys);
  const out: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k !== null && (k.startsWith(scope.prefix) || wanted.has(k))) out.push(k);
  }
  return out.sort();
}

/** Accepts the old call shape (a prefix) or a scope. */
export function toScope(prefixOrScope: string | DataScope): DataScope {
  return typeof prefixOrScope === "string" ? prefixScope(prefixOrScope) : prefixOrScope;
}
