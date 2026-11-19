// Finds the Cache Storage and IndexedDB names the App's own source code uses, and compares them with
// the register in panel/deviceRegister.ts. A name can be written in four ways: a constant whose name ends
// in CACHE or CACHE_NAME, a prefix handed over as `cachePrefix: "..."` or kept in a constant named
// DEFAULT_PREFIX next to a `cacheName` function, a literal given straight to `caches.open`, or a database
// named by `databaseName = "..."`, a DB or DATABASE constant, or a literal given to `indexedDB.open`.
// Names built any other way cannot be found, so the register lists those by hand. Node only, never shipped.

import type { DeviceKind, DeviceRow } from "../panel/deviceRegister";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export interface FoundDevice {
  kind: DeviceKind;
  name: string;
  match: "exact" | "prefix";
  /** Repo-relative path of the first file that names it */
  path: string;
  /** 1-based line of the first mention in that file */
  line: number;
  /** Every file that names it, sorted */
  paths: string[];
}

const NAME = "[A-Za-z0-9._-]{3,64}";
const CACHE_CONST = new RegExp(`\\bconst\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?::\\s*string\\s*)?=\\s*(["'])(${NAME})\\2`, "g");
const CACHE_PREFIX_PROP = new RegExp(`\\bcachePrefix\\s*:\\s*(["'])(${NAME})\\1`, "g");
const OPEN_CACHE = new RegExp(`\\bcaches\\.open\\(\\s*(["'])(${NAME})\\1`, "g");
const DB_DEFAULT = new RegExp(`\\bdatabaseName\\s*=\\s*(["'])(${NAME})\\1`, "g");
const IDB_OPEN = new RegExp(`\\bindexedDB\\.open\\(\\s*(["'])(${NAME})\\1`, "g");

const isCacheConst = (n: string): boolean => /(^|_)CACHE(_NAME)?$/i.test(n) || /Cache(Name)?$/.test(n);
const isPrefixConst = (n: string): boolean => /(^|_)PREFIX$/i.test(n);
const isDbConst = (n: string): boolean => /(^|_)(DB|DATABASE)(_NAME)?$/i.test(n) || /(Db|Database)(Name)?$/.test(n);

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function inComment(text: string, index: number): boolean {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\/\/|\*|\/\*)/.test(text.slice(start, index + 1));
}

export function scanDeviceNames(files: readonly SourceFile[]): FoundDevice[] {
  const byId = new Map<string, FoundDevice>();
  const add = (kind: DeviceKind, name: string, match: "exact" | "prefix", file: SourceFile, index: number): void => {
    // A prefix is stored with its closing hyphen, the way the register spells it.
    const stored = match === "prefix" && !name.endsWith("-") ? `${name}-` : name;
    const id = `${kind}:${match}:${stored}`;
    const existing = byId.get(id);
    if (existing === undefined) {
      byId.set(id, { kind, name: stored, match, path: file.path, line: lineOf(file.text, index), paths: [file.path] });
    } else if (!existing.paths.includes(file.path)) {
      existing.paths = [...existing.paths, file.path].sort();
    }
  };
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    const text = file.text;
    const live = (m: RegExpMatchArray): boolean => m.index !== undefined && !inComment(text, m.index);
    // A file that builds `${prefix}-${version}` names (a function called cacheName) keeps the prefix in a PREFIX constant.
    const buildsCacheNames = /\bcacheName\s*\(/.test(text) && /\$\{[^}]*\}-\$\{[^}]*\}/.test(text);
    for (const m of text.matchAll(CACHE_CONST)) {
      if (!live(m)) continue;
      const [, constName = "", , value = ""] = m;
      if (isCacheConst(constName)) add("cache", value, "exact", file, m.index ?? 0);
      else if (isPrefixConst(constName) && buildsCacheNames) add("cache", value, "prefix", file, m.index ?? 0);
      else if (isDbConst(constName)) add("database", value, "exact", file, m.index ?? 0);
    }
    for (const m of text.matchAll(CACHE_PREFIX_PROP)) if (live(m)) add("cache", m[2] ?? "", "prefix", file, m.index ?? 0);
    for (const m of text.matchAll(OPEN_CACHE)) if (live(m)) add("cache", m[2] ?? "", "exact", file, m.index ?? 0);
    for (const m of text.matchAll(DB_DEFAULT)) if (live(m)) add("database", m[2] ?? "", "exact", file, m.index ?? 0);
    for (const m of text.matchAll(IDB_OPEN)) if (live(m)) add("database", m[2] ?? "", "exact", file, m.index ?? 0);
  }
  return [...byId.values()].sort((a, b) => (a.kind + a.name < b.kind + b.name ? -1 : a.kind + a.name > b.kind + b.name ? 1 : 0));
}

export interface DeviceComparison {
  /** Found in the source but not in the register */
  unregistered: FoundDevice[];
  /** In the register but no longer found in the source */
  stale: DeviceRow[];
  /** Registered, but the row's file is not one of the files that name it */
  moved: { name: string; registered: string; found: string[] }[];
}

export function compareDevice(found: readonly FoundDevice[], register: readonly DeviceRow[]): DeviceComparison {
  const id = (kind: string, match: string, name: string): string => `${kind}:${match}:${name}`;
  const known = new Map(register.map((r) => [id(r.kind, r.match, r.name), r]));
  const seen = new Set(found.map((f) => id(f.kind, f.match, f.name)));
  return {
    unregistered: found.filter((f) => !known.has(id(f.kind, f.match, f.name))),
    stale: register.filter((r) => !seen.has(id(r.kind, r.match, r.name))),
    moved: found.flatMap((f) => {
      const row = known.get(id(f.kind, f.match, f.name));
      return row !== undefined && !f.paths.includes(row.path) ? [{ name: f.name, registered: row.path, found: f.paths }] : [];
    }),
  };
}

export function formatDeviceComparison(c: DeviceComparison): string {
  const lines: string[] = [];
  for (const f of c.unregistered) lines.push(`${f.kind} ${f.name}: used in ${f.path}:${f.line} but has no row in deviceRegister.ts`);
  for (const r of c.stale) lines.push(`${r.kind} ${r.name}: in deviceRegister.ts but not found in the source`);
  for (const m of c.moved) lines.push(`${m.name}: registered for ${m.registered}, found in ${m.found.join(", ")}`);
  return lines.join("\n");
}
