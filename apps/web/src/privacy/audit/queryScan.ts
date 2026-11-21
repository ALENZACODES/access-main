// Finds the places in the App's own source that read a value from, or put a value into, the part of a web address
// after the question mark, and compares them with the list in panel/queryRegister.ts. A place is found by its call
// on a receiver that holds the query: `params`, `query`, `search`, `searchParams`, `qs`, `sp`, `p` or `q`, or
// anything ending in `.searchParams`, and on the object made by `new URLSearchParams(...)` at once. The calls are
// get, getAll and has (the App reads the name) and set and append (the App builds the name). A name written out in
// quotes is found by its text. A name built at run time (a variable, a template with a hole) cannot be read, so the
// place is found as "run-time" and must be listed as one. A name read some other way (a regular expression over
// `location.search`, a split on `&`) is not found, and the list says nothing about it. Node only (tests and CI),
// never shipped to the browser.

import { NOT_QUERY, RUN_TIME_NAME, type NotQuery, type QueryRow } from "../panel/queryRegister";
import { constantValue } from "./retentionScan";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export type QueryAccess = "read" | "build";

const READ_CALLS: ReadonlySet<string> = new Set(["get", "getAll", "has"]);
const RECEIVER = String.raw`(?<![\w$.])(?:params|query|search|searchParams|qs|sp|p|q|(?:[A-Za-z_$][\w$]*\.)+searchParams|new\s+URLSearchParams\([^()]*(?:\([^()]*\)[^()]*)*\))`;
const CALL = new RegExp(`${RECEIVER}\\.(get|getAll|has|set|append)\\(\\s*(?:(["'])([^"'\`\\\\\\n]{1,64})\\2|([^"'\\s)][^,)\\n]*|["'\`][^,)\\n]*))`, "g");

/** One place, in one file, that reads or builds one name. */
export interface FoundQuery {
  /** The name, or null for a name built at run time */
  name: string | null;
  access: QueryAccess;
  path: string;
  /** 1-based line of each place, in order */
  lines: number[];
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function inComment(text: string, index: number): boolean {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\/\/|\*|\/\*)/.test(text.slice(start, index + 1));
}

/** A name that could be a query name: letters, digits, underscore, dot and hyphen. */
export function isQueryName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(name);
}

/** Every place that reads or builds a query name, ordered by path, then name, then access. */
export function scanQueries(files: readonly SourceFile[]): FoundQuery[] {
  const out: FoundQuery[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    const by = new Map<string, FoundQuery>();
    for (const m of file.text.matchAll(CALL)) {
      if (m.index === undefined || inComment(file.text, m.index)) continue;
      const call = m[1] ?? "";
      let literal = m[3];
      const rest = m[4];
      if (literal === undefined && rest !== undefined) {
        // A string that is not a usable name (empty, too long, odd characters) is a name that cannot be a query name, not a run-time name.
        if (rest.startsWith('"') || rest.startsWith("'")) continue;
        // A template with nothing in it to fill is written out like a string.
        if (rest.startsWith("`") && !rest.includes("${")) literal = rest.slice(1, rest.indexOf("`", 1) === -1 ? undefined : rest.indexOf("`", 1));
      }
      const name = literal !== undefined && isQueryName(literal) ? literal : null;
      if (literal !== undefined && name === null) continue;
      const access: QueryAccess = READ_CALLS.has(call) ? "read" : "build";
      const id = `${name ?? "\u0000"} ${access}`;
      const line = lineOf(file.text, m.index);
      const known = by.get(id);
      if (known === undefined) by.set(id, { name, access, path: file.path, lines: [line] });
      else known.lines.push(line);
    }
    out.push(...by.values());
  }
  return out.sort((a, b) => `${a.path} ${a.name ?? "~"} ${a.access}`.localeCompare(`${b.path} ${b.name ?? "~"} ${b.access}`));
}

export interface QueryComparison {
  /** Found in the source, in no row */
  unlisted: FoundQuery[];
  /** In a row, not found in that file */
  gone: Array<{ name: string; path: string; access: QueryAccess }>;
  /** In a row and found, with a different number of places */
  wrongCount: Array<{ name: string; path: string; access: QueryAccess; listed: number; found: number }>;
}

function placesOf(row: QueryRow): Array<{ path: string; access: QueryAccess; count: number }> {
  const out: Array<{ path: string; access: QueryAccess; count: number }> = [];
  for (const p of row.places) {
    if (p.reads > 0) out.push({ path: p.path, access: "read", count: p.reads });
    if (p.builds > 0) out.push({ path: p.path, access: "build", count: p.builds });
  }
  return out;
}

export function compareQueries(found: readonly FoundQuery[], rows: readonly QueryRow[], notQuery: readonly NotQuery[] = NOT_QUERY): QueryComparison {
  const key = (name: string | null, path: string, access: QueryAccess): string => `${name ?? RUN_TIME_NAME}\u0000${path}\u0000${access}`;
  const foundBy = new Map(found.map((f) => [key(f.name, f.path, f.access), f]));
  const listed = new Map<string, { name: string; path: string; access: QueryAccess; count: number }>();
  for (const r of rows) for (const p of placesOf(r)) listed.set(key(r.name === RUN_TIME_NAME ? null : r.name, p.path, p.access), { name: r.name, path: p.path, access: p.access, count: p.count });
  const out: QueryComparison = { unlisted: [], gone: [], wrongCount: [] };
  const excluded = new Set(notQuery.map((n) => `${n.path}\u0000${n.name}`));
  for (const f of found) if (!listed.has(key(f.name, f.path, f.access)) && !(f.name !== null && excluded.has(`${f.path}\u0000${f.name}`))) out.unlisted.push(f);
  for (const [k, l] of listed) {
    const f = foundBy.get(k);
    if (f === undefined) out.gone.push({ name: l.name, path: l.path, access: l.access });
    else if (f.lines.length !== l.count) out.wrongCount.push({ name: l.name, path: l.path, access: l.access, listed: l.count, found: f.lines.length });
  }
  out.gone.sort((a, b) => `${a.path} ${a.name}`.localeCompare(`${b.path} ${b.name}`));
  out.wrongCount.sort((a, b) => `${a.path} ${a.name}`.localeCompare(`${b.path} ${b.name}`));
  return out;
}

export function isClean(c: QueryComparison): boolean {
  return c.unlisted.length === 0 && c.gone.length === 0 && c.wrongCount.length === 0;
}

const verb = (a: QueryAccess): string => (a === "read" ? "reads" : "builds");

/** One line for each difference, for the failure message. Empty when the comparison is clean. */
export function formatQueryComparison(c: QueryComparison): string {
  const out: string[] = [];
  for (const f of c.unlisted) out.push(`${f.path}:${f.lines[0]}: the App ${verb(f.access)} ${f.name === null ? RUN_TIME_NAME : `"${f.name}"`} (${f.lines.length} place${f.lines.length === 1 ? "" : "s"}) and no row lists it`);
  for (const g of c.gone) out.push(`${g.path}: the row for "${g.name}" says it ${verb(g.access)} it, and the scan finds no such place`);
  for (const w of c.wrongCount) out.push(`${w.path}: the row for "${w.name}" says ${w.listed} place${w.listed === 1 ? "" : "s"} ${verb(w.access)} it but ${w.found} found`);
  return out.join("\n");
}

/** The strings in a plain array constant such as `export const NAMES: readonly X[] = ["a", 'b'] as const;`, or null when it is not one. */
export function arrayConstant(files: readonly SourceFile[], path: string, name: string): string[] | null {
  const file = files.find((f) => f.path === path);
  if (file === undefined) return null;
  const re = new RegExp(String.raw`\bconst\s+${name}\b[^=\n]*=\s*\[([^\]]*)\]`);
  const m = re.exec(file.text);
  if (m === null) return null;
  const items = (m[1] ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "");
  const out: string[] = [];
  for (const item of items) {
    const lit = /^(["'])([^"'\\]*)\1$/.exec(item);
    if (lit === null) return null;
    out.push(lit[2] ?? "");
  }
  return out;
}

export interface QueryWrongValue {
  name: string;
  what: string;
  listed: string;
  found: string;
}

/** Limits whose number differs from the constant, constants that cannot be read, and name lists that differ from the source. */
export function compareValues(files: readonly SourceFile[], rows: readonly QueryRow[]): QueryWrongValue[] {
  const out: QueryWrongValue[] = [];
  for (const r of rows) {
    for (const l of r.limits) {
      const v = constantValue(files, l.from.path, l.from.name);
      if (v === null) out.push({ name: r.name, what: `${l.from.path} ${l.from.name}`, listed: String(l.max), found: "not a number" });
      else if (v !== l.max) out.push({ name: r.name, what: `${l.from.path} ${l.from.name}`, listed: String(l.max), found: String(v) });
    }
    if (r.names?.from !== undefined) {
      const from = r.names.from;
      const v = arrayConstant(files, from.path, from.name);
      const what = `${from.path} ${from.name}`;
      if (v === null) out.push({ name: r.name, what, listed: r.names.names.join(","), found: "not a list" });
      else if (v.join(",") !== r.names.names.join(",")) out.push({ name: r.name, what, listed: r.names.names.join(","), found: v.join(",") });
    }
  }
  return out;
}

/** One line for each wrong value, for the failure message. */
export function formatWrongValues(w: readonly QueryWrongValue[]): string {
  return w.map((x) => `${x.what}: the row for "${x.name}" says ${x.listed} but the source has ${x.found}`).join("\n");
}

export { RUN_TIME_NAME };
