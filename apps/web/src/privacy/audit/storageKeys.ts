// Finds the browser storage keys the App's own source code uses, and compares them with the
// register in storageRegister.ts. A key can be named in two ways: a constant whose name ends in
// KEY, or a literal handed straight to getItem, setItem or removeItem. Keys built at run time or
// kept inside another package cannot be found this way; the register lists those by hand.
// Node only (tests and CI), never shipped to the browser.

import type { RegisterRow } from "../panel/storageRegister";
import type { SourceFile } from "./repoAudit";

export type FoundVia = "constant" | "call";

export interface FoundKey {
  key: string;
  /** Repo-relative path of the first file that names it */
  path: string;
  /** 1-based line of the first mention in that file */
  line: number;
  via: FoundVia;
  /** Every file that names it, sorted */
  paths: string[];
}

/** Files the scan skips: tests and test helpers, type shims, this audit folder and the narrow-screen sample files. */
const SKIPPED = [/\.test\.[cm]?[jt]sx?$/, /\.test-util\.[cm]?[jt]sx?$/, /\.d\.ts$/, /(^|\/)privacy\/audit\//, /(^|\/)narrow\//, /(^|\/)e2e\//];

export function isScannedSource(path: string): boolean {
  if (!/\.[cm]?[jt]sx?$/.test(path)) return false;
  return !SKIPPED.some((re) => re.test(path));
}

const KEY_CHARS = "[A-Za-z0-9_.:-]";
const CONSTANT_RE = new RegExp(`\\bconst\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?::\\s*string\\s*)?=\\s*(["'])(${KEY_CHARS}{2,})\\2`, "g");
const TEMPLATE_RE = new RegExp(`\\bconst\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?::\\s*string\\s*)?=\\s*\`\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}(${KEY_CHARS}+)\``, "g");
const PLAIN_RE = new RegExp(`\\bconst\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?::\\s*string\\s*)?=\\s*(["'])(${KEY_CHARS}+)\\2`, "g");
const CALL_RE = new RegExp(`\\.(?:setItem|getItem|removeItem)\\(\\s*(["'])(${KEY_CHARS}+)\\1`, "g");

function isKeyName(name: string): boolean {
  return /(^|_)KEY$/i.test(name) || /Key$/.test(name);
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** True when the match starts on a line that is a comment, so documentation never counts as use. */
function inComment(text: string, index: number): boolean {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\/\/|\*|\/\*)/.test(text.slice(start, index + 1));
}

export function scanStorageKeys(files: readonly SourceFile[]): FoundKey[] {
  const byKey = new Map<string, FoundKey>();
  const add = (key: string, file: SourceFile, index: number, via: FoundVia): void => {
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { key, path: file.path, line: lineOf(file.text, index), via, paths: [file.path] });
    } else if (!existing.paths.includes(file.path)) {
      existing.paths = [...existing.paths, file.path].sort();
    }
  };
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    for (const m of file.text.matchAll(CONSTANT_RE)) {
      if (m.index === undefined || inComment(file.text, m.index)) continue;
      const name = m[1] ?? "";
      const key = m[3] ?? "";
      if (isKeyName(name) && /[.:]/.test(key) || isKeyName(name) && key.startsWith("__")) add(key, file, m.index, "constant");
    }
    // A key written as `${PREFIX}name`, where PREFIX is a plain string constant in the same file.
    const plain = new Map<string, string>();
    for (const m of file.text.matchAll(PLAIN_RE)) plain.set(m[1] ?? "", m[3] ?? "");
    for (const m of file.text.matchAll(TEMPLATE_RE)) {
      if (m.index === undefined || inComment(file.text, m.index)) continue;
      const head = plain.get(m[2] ?? "");
      if (head !== undefined && isKeyName(m[1] ?? "")) add(head + (m[3] ?? ""), file, m.index, "constant");
    }
    for (const m of file.text.matchAll(CALL_RE)) {
      if (m.index === undefined || inComment(file.text, m.index)) continue;
      add(m[2] ?? "", file, m.index, "call");
    }
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export interface RegisterComparison {
  /** Found in the source but not in the register */
  unregistered: FoundKey[];
  /** In the register but no longer found in the source */
  stale: RegisterRow[];
  /** Registered, but the owning file is not one of the files that name the key */
  moved: { key: string; registered: string; found: string[] }[];
}

export function compareToRegister(found: readonly FoundKey[], register: readonly RegisterRow[]): RegisterComparison {
  const known = new Map(register.map((r) => [r.key, r]));
  const seen = new Set(found.map((f) => f.key));
  return {
    unregistered: found.filter((f) => !known.has(f.key)),
    stale: register.filter((r) => !seen.has(r.key)),
    moved: found.flatMap((f) => {
      const row = known.get(f.key);
      return row !== undefined && !f.paths.includes(row.path) ? [{ key: f.key, registered: row.path, found: f.paths }] : [];
    }),
  };
}

/** Register problems that do not depend on the source: duplicate keys, bad dates, empty text. */
export function checkRegister(register: readonly RegisterRow[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of register) {
    if (seen.has(r.key)) problems.push(`${r.key}: listed twice`);
    seen.add(r.key);
    if (!new RegExp(`^${KEY_CHARS}+$`).test(r.key)) problems.push(`${r.key}: not a plain key name`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.recordedOn)) problems.push(`${r.key}: recordedOn is not YYYY-MM-DD`);
    if (r.holds.en.trim() === "" || r.holds.fr.trim() === "") problems.push(`${r.key}: holds is empty in one language`);
    if (r.source.trim() === "") problems.push(`${r.key}: source is empty`);
    if (r.path.trim() === "") problems.push(`${r.key}: path is empty`);
  }
  return problems;
}

export interface Coverage {
  /** Rows Download, Erase and Restore cover */
  covered: RegisterRow[];
  /** Rows they do not cover; the panel says so in its "also kept" section */
  outside: RegisterRow[];
}

/** Splits the register by its "reach" mark. */
export function panelCoverage(register: readonly RegisterRow[]): Coverage {
  return {
    covered: register.filter((r) => r.reach === "panel"),
    outside: register.filter((r) => r.reach === "elsewhere"),
  };
}

/** A key under the panel prefix is always covered, so it cannot be marked "elsewhere". */
export function checkReach(register: readonly RegisterRow[], prefix: string): string[] {
  return register.filter((r) => r.key.startsWith(prefix) && r.reach !== "panel").map((r) => `${r.key}: starts with the panel prefix but is marked elsewhere`);
}

export function formatComparison(c: RegisterComparison): string {
  const lines: string[] = [];
  for (const f of c.unregistered) lines.push(`NEW  ${f.key}  ${f.path}:${f.line}  add a row to storageRegister.ts`);
  for (const r of c.stale) lines.push(`GONE ${r.key}  ${r.path}  no longer found; remove its row`);
  for (const m of c.moved) lines.push(`MOVE ${m.key}  registered in ${m.registered}, found in ${m.found.join(", ")}`);
  return lines.join("\n");
}
