// Finds the web addresses and the network calls in the App's own source, and compares them with the lists in
// panel/addressRegister.ts. Hosts are read from absolute http and https addresses written in the source; names
// reserved for examples and tests (.example, .test, .localhost, localhost, loopback) are not real addresses and
// are skipped. Network calls are the plain spellings: fetch, XMLHttpRequest, WebSocket, EventSource, importScripts
// and sendBeacon, outside type declarations and comments. A call made through a name the code passes around is
// not found, so the register says so where it matters. Node only, never shipped.

import type { AddressRow, CallRow } from "../panel/addressRegister";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export interface FoundHost {
  host: string;
  path: string;
  line: number;
  /** Every file that names the host, sorted */
  paths: string[];
}

export interface FoundCalls {
  path: string;
  calls: number;
  /** 1-based lines of each call */
  lines: number[];
}

const URL_RE = /\bhttps?:\/\/([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::\d+)?/g;
const RESERVED = /(^|\.)(example|test|localhost|invalid|local)$|^example\.|(^|\.)example\.(com|net|org)$|^localhost$|^127\.0\.0\.1$|^0\.0\.0\.0$|^\[::1\]$/i;
/** Node test scripts hold addresses and call names in strings they check for; they are not the App's code. */
const isTestScript = (path: string): boolean => /\.node\.mjs$/.test(path);

/** Hosts written only so that markup and data formats are well formed: never contacted. */
const FORMAT_NAMES: ReadonlySet<string> = new Set(["www.w3.org"]);

const CALL_RES: readonly RegExp[] = [
  /(?<![\w$.])fetch\s*\(/g,
  /\.fetch\s*\(/g,
  /\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\b/g,
  /\bimportScripts\s*\(/g,
  /\.sendBeacon\s*\(/g,
];

/** Files where a match is not a use, with the reason */
const IGNORE: ReadonlyArray<{ path: RegExp; reason: string }> = [
  { path: /(^|\/)privacy\/panel\/egress\.ts$/, reason: "The network guard wraps these calls to stop them; it never makes one" },
];

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function lineText(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

const isComment = (line: string): boolean => /^\s*(\/\/|\*|\/\*)/.test(line);
/** A line that declares a type or a signature rather than making a call. */
const isDeclaration = (line: string): boolean => /^\s*(declare|interface|type)\b/.test(line) || /\bfetch\s*\(\s*\w+\s*:\s*[A-Za-z]/.test(line) ;

export function scanHosts(files: readonly SourceFile[]): FoundHost[] {
  const byHost = new Map<string, FoundHost>();
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path) || isTestScript(file.path) || IGNORE.some((i) => i.path.test(file.path)) || /(^|\/)privacy\//.test(file.path)) continue;
    for (const m of file.text.matchAll(URL_RE)) {
      const host = (m[1] ?? "").toLowerCase();
      if (m.index === undefined || host === "" || !host.includes(".") || RESERVED.test(host) || FORMAT_NAMES.has(host)) continue;
      if (isComment(lineText(file.text, m.index))) continue;
      const existing = byHost.get(host);
      if (existing === undefined) byHost.set(host, { host, path: file.path, line: lineOf(file.text, m.index), paths: [file.path] });
      else if (!existing.paths.includes(file.path)) existing.paths = [...existing.paths, file.path].sort();
    }
  }
  return [...byHost.values()].sort((a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
}

export function scanCalls(files: readonly SourceFile[]): FoundCalls[] {
  const out: FoundCalls[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path) || isTestScript(file.path) || IGNORE.some((i) => i.path.test(file.path))) continue;
    const lines: number[] = [];
    file.text.split("\n").forEach((content, i) => {
      if (isComment(content) || isDeclaration(content)) return;
      const n = callsInLine(content);
      for (let k = 0; k < n; k += 1) lines.push(i + 1);
    });
    if (lines.length > 0) out.push({ path: file.path, calls: lines.length, lines: [...new Set(lines)] });
  }
  return out;
}

/** The number of call expressions on one line. `x.fetch(` is one call, not a bare one plus a dotted one. */
function callsInLine(content: string): number {
  const starts = new Set<number>();
  for (const re of CALL_RES) {
    for (const m of content.matchAll(re)) {
      if (m.index === undefined) continue;
      // A dotted pattern starts at the dot; a bare one at the name. Key both by the name's position.
      starts.add(m[0].startsWith(".") ? m.index + 1 : m.index);
    }
  }
  return starts.size;
}

export interface AddressComparison {
  /** Named in the source, but not in the register */
  unlistedHosts: FoundHost[];
  /** In the register, but no longer named in the source */
  staleHosts: AddressRow[];
  /** The row's file is not one of the files that name the host */
  movedHosts: { host: string; registered: string; found: string[] }[];
  /** Files that make network calls and have no row, or a different count */
  callDifferences: string[];
}

export function compareAddresses(hosts: readonly FoundHost[], calls: readonly FoundCalls[], addresses: readonly AddressRow[], callRows: readonly CallRow[]): AddressComparison {
  const known = new Map(addresses.map((a) => [a.host, a]));
  const seen = new Map(hosts.map((h) => [h.host, h]));
  const rows = new Map(callRows.map((c) => [c.path, c]));
  const found = new Map(calls.map((c) => [c.path, c]));
  const callDifferences: string[] = [];
  for (const c of calls) {
    const row = rows.get(c.path);
    if (row === undefined) callDifferences.push(`${c.path}: makes ${c.calls} network call${c.calls === 1 ? "" : "s"} (line ${c.lines.join(", ")}) but has no row in addressRegister.ts`);
    else if (row.calls !== c.calls) callDifferences.push(`${c.path}: the register says ${row.calls} call${row.calls === 1 ? "" : "s"}, the source has ${c.calls} (line ${c.lines.join(", ")})`);
  }
  for (const r of callRows) if (!found.has(r.path)) callDifferences.push(`${r.path}: in addressRegister.ts but the source makes no network call there`);
  return {
    unlistedHosts: hosts.filter((h) => !known.has(h.host)),
    staleHosts: addresses.filter((a) => !seen.has(a.host)),
    movedHosts: addresses.flatMap((a) => {
      const f = seen.get(a.host);
      return f !== undefined && !f.paths.includes(a.path) ? [{ host: a.host, registered: a.path, found: f.paths }] : [];
    }),
    callDifferences,
  };
}

export function formatAddressComparison(c: AddressComparison): string {
  const lines: string[] = [];
  for (const h of c.unlistedHosts) lines.push(`${h.host}: named in ${h.path}:${h.line} but has no row in addressRegister.ts`);
  for (const a of c.staleHosts) lines.push(`${a.host}: in addressRegister.ts but not named in the source`);
  for (const m of c.movedHosts) lines.push(`${m.host}: registered for ${m.registered}, found in ${m.found.join(", ")}`);
  lines.push(...c.callDifferences);
  return lines.join("\n");
}
