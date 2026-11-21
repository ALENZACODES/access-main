// Reads the source to check the retention register in retentionRegister.ts. Three things are checked: that each limit
// in a row is the number the named constant has in the source; that no constant that looks like a limit sits in a file
// that holds one of these stores without being in the register or in the list of constants that are not retention;
// and that every file that names a stored key, and every file that sets an expiry, is one a row lists. A limit written
// some way other than a named numeric constant is not found, so a row that says "none found" is about what this scan
// can read. Node only, never shipped.

import type { Limit, NotRetention, RetentionRow } from "../panel/retentionRegister";
import type { SourceFile } from "./repoAudit";
import type { FoundKey } from "./storageKeys";
import { isScannedSource } from "./storageKeys";

/** Names that read as a limit on time, count or size. */
const LIMIT_NAME = /(^|_)(MAX|LIMIT|CAP|TTL|DAYS|QUOTA|BUDGET)(_|$)/;
const DECLARATION = /\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*number\s*)?=\s*([^;\n]+)/g;
const NUMBER_PRODUCT = /^\d[\d_]*(?:\s*\*\s*\d[\d_]*)*$/;

function isCommentLine(text: string, index: number): boolean {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\/\/|\*|\/\*)/.test(text.slice(start, index + 1));
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** The value of a plain whole-number expression: digits, underscores and products such as 50 * 1024 * 1024. Otherwise null. */
export function evaluateNumber(expression: string): number | null {
  const t = expression.trim().replace(/\s+as\s+const$/, "");
  if (!NUMBER_PRODUCT.test(t)) return null;
  let value = 1;
  for (const part of t.split("*")) {
    const n = Number(part.trim().replace(/_/g, ""));
    if (!Number.isSafeInteger(n)) return null;
    value *= n;
    if (!Number.isSafeInteger(value)) return null;
  }
  return value;
}

export interface FoundConstant {
  path: string;
  name: string;
  /** The number, or null when the value is not a plain whole-number expression */
  value: number | null;
  line: number;
}

/** Every named constant in a file that has the shape of a limit, with its value when it can be read. */
export function limitConstants(file: SourceFile): FoundConstant[] {
  const out: FoundConstant[] = [];
  for (const m of file.text.matchAll(DECLARATION)) {
    if (m.index === undefined || isCommentLine(file.text, m.index)) continue;
    const name = m[1] ?? "";
    if (!LIMIT_NAME.test(name)) continue;
    out.push({ path: file.path, name, value: evaluateNumber(m[2] ?? ""), line: lineOf(file.text, m.index) });
  }
  return out;
}

/** The number a named constant has in the files given, or null when it is not declared there or is not a plain number. */
export function constantValue(files: readonly SourceFile[], path: string, name: string): number | null {
  const f = files.find((x) => x.path === path);
  if (f === undefined) return null;
  return limitConstants(f).find((c) => c.name === name)?.value ?? null;
}

/** Files that call putExpiring, which is how a value is given an end date. The file that defines it is left out. */
export function expiryCallers(files: readonly SourceFile[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (!isScannedSource(f.path) || /(^|\/)expiry\.ts$/.test(f.path)) continue;
    for (const m of f.text.matchAll(/\bputExpiring\s*\(/g)) {
      if (m.index !== undefined && !isCommentLine(f.text, m.index)) {
        out.push(f.path);
        break;
      }
    }
  }
  return out.sort();
}

export interface WrongNumber {
  key: string;
  constant: string;
  path: string;
  expected: number;
  /** null when the constant is missing from that file or is not a plain number */
  actual: number | null;
}

export interface RetentionComparison {
  /** A limit whose number is not the constant's number */
  wrong: WrongNumber[];
  /** A limit-like constant in a file that holds a store, with no limit in a row and no reason in the exceptions list */
  unclaimed: FoundConstant[];
  /** A file that names a stored key and is not one of the row's files */
  newFiles: { key: string; path: string }[];
  /** A file a row lists that is not in the source any more */
  missingFiles: { key: string; path: string }[];
  /** A file that sets an expiry and is not listed by any row */
  unlistedExpiry: string[];
  /** An exception that names a constant that is not there, or that a row now claims */
  staleExceptions: NotRetention[];
}

export function limitValue(l: Limit): number {
  return l.kind === "days" ? l.days : l.max;
}

export function compareRetention(
  files: readonly SourceFile[],
  rows: readonly RetentionRow[],
  exceptions: readonly NotRetention[],
  found: readonly FoundKey[],
): RetentionComparison {
  const paths = new Set(files.map((f) => f.path));
  const wrong: WrongNumber[] = [];
  const claimed = new Set<string>();
  const missingFiles: { key: string; path: string }[] = [];
  const newFiles: { key: string; path: string }[] = [];
  const rowFiles = new Set<string>();
  for (const r of rows) {
    for (const p of r.files) {
      rowFiles.add(p);
      if (!paths.has(p)) missingFiles.push({ key: r.key, path: p });
    }
    if (r.limits !== "UNKNOWN") {
      for (const l of r.limits) {
        claimed.add(`${l.from.path}#${l.from.name}`);
        const actual = constantValue(files, l.from.path, l.from.name);
        if (actual !== limitValue(l)) wrong.push({ key: r.key, constant: l.from.name, path: l.from.path, expected: limitValue(l), actual });
      }
    }
    const hit = found.find((f) => f.key === r.key);
    if (hit !== undefined) for (const p of hit.paths) if (!r.files.includes(p)) newFiles.push({ key: r.key, path: p });
  }
  const excepted = new Set(exceptions.map((e) => `${e.path}#${e.name}`));
  const unclaimed: FoundConstant[] = [];
  for (const f of files) {
    if (!rowFiles.has(f.path)) continue;
    for (const c of limitConstants(f)) {
      if (c.value === null) continue;
      if (!claimed.has(`${c.path}#${c.name}`) && !excepted.has(`${c.path}#${c.name}`)) unclaimed.push(c);
    }
  }
  const staleExceptions = exceptions.filter((e) => constantValue(files, e.path, e.name) === null || claimed.has(`${e.path}#${e.name}`));
  const unlistedExpiry = expiryCallers(files).filter((p) => !rowFiles.has(p));
  return { wrong, unclaimed, newFiles, missingFiles, unlistedExpiry, staleExceptions };
}

export function isClean(c: RetentionComparison): boolean {
  return c.wrong.length + c.unclaimed.length + c.newFiles.length + c.missingFiles.length + c.unlistedExpiry.length + c.staleExceptions.length === 0;
}

/** A readable list of what differs, for a failing test. */
export function formatRetentionComparison(c: RetentionComparison): string {
  const out: string[] = [];
  for (const w of c.wrong) out.push(`${w.key}: the row says ${w.expected} for ${w.constant} but ${w.path} has ${w.actual === null ? "no plain number" : w.actual}`);
  for (const u of c.unclaimed) out.push(`${u.path}:${u.line}: ${u.name} (${u.value}) looks like a limit and is in no row and not in the exceptions`);
  for (const n of c.newFiles) out.push(`${n.key}: ${n.path} names this key and is not in the row's files`);
  for (const m of c.missingFiles) out.push(`${m.key}: ${m.path} is in the row's files and is not in the source`);
  for (const p of c.unlistedExpiry) out.push(`${p}: sets an expiry and is in no row`);
  for (const e of c.staleExceptions) out.push(`${e.path}: ${e.name} is excepted but is not there, or a row now claims it`);
  return out.join("\n");
}
