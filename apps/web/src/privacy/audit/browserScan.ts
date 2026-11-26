// Finds the places in the App's own source where the code asks the browser about the person's device or settings: the
// language, whether the device is online, a display setting (contrast, motion, colour scheme), how much storage is
// used, and where it makes a random identifier or formats a number or date in the browser's own language. Each place is
// found by its call, in code and in the strings the plain-TypeScript pages build. A line that is a comment is never a
// place. A question asked through a name the scan does not know (a browser object held in a variable under another
// name), by a library, or in code under `narrow/` is not found, and the list says nothing about it. Node only (tests
// and CI), never shipped to the browser.

import { BROWSER_KINDS, type BrowserKind, type BrowserRow } from "../panel/browserRegister";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export interface BrowserPattern {
  kind: BrowserKind;
  patterns: readonly RegExp[];
}

export const BROWSER_CATALOGUE: readonly BrowserPattern[] = [
  { kind: "language", patterns: [/\b(?:navigator|nav)\??\.languages?\b/g] },
  { kind: "online", patterns: [/\b(?:navigator|nav)\??\.onLine\b/g] },
  { kind: "preference", patterns: [/\bmatchMedia\s*\(/g] },
  { kind: "storage-size", patterns: [/\b(?:navigator|nav)\??\.storage\b/g, /\.(?:estimate|persisted)\s*\(\s*\)/g] },
  { kind: "privacy-signal", patterns: [/\.(?:globalPrivacyControl|doNotTrack|cookieEnabled)\b/g, /\b(?:window|globalThis|self|host)\.isSecureContext\b/g] },
  { kind: "identifier", patterns: [/\bcrypto\.(?:randomUUID|getRandomValues)\b/g] },
  { kind: "own-language", patterns: [/\.toLocale(?:Date|Time)?String\s*\(\s*\)/g] },
];

export interface FoundBrowser {
  kind: BrowserKind;
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

/** Every place the browser is asked, grouped by file and kind, in the order of the paths and then the catalogue. */
export function scanBrowser(files: readonly SourceFile[], catalogue: readonly BrowserPattern[] = BROWSER_CATALOGUE): FoundBrowser[] {
  const out: FoundBrowser[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    for (const { kind, patterns } of catalogue) {
      const hits = new Set<number>();
      for (const re of patterns) {
        for (const m of file.text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) {
          if (m.index === undefined || inComment(file.text, m.index)) continue;
          hits.add(m.index);
        }
      }
      if (hits.size > 0) out.push({ kind, path: file.path, lines: [...hits].sort((a, b) => a - b).map((i) => lineOf(file.text, i)) });
    }
  }
  return out;
}

export interface BrowserComparison {
  /** Found in a file, in no row */
  unlisted: FoundBrowser[];
  /** In a row, none found in that file */
  gone: Array<{ kind: BrowserKind; path: string }>;
  /** In a row and found, in a different number of places */
  wrongCount: Array<{ kind: BrowserKind; path: string; listed: number; found: number }>;
}

const idOf = (kind: string, path: string): string => `${kind}\u0000${path}`;

/** Differences between what the scan found and the rows, both ways. */
export function compareBrowser(found: readonly FoundBrowser[], rows: readonly BrowserRow[]): BrowserComparison {
  const out: BrowserComparison = { unlisted: [], gone: [], wrongCount: [] };
  const foundBy = new Map(found.map((f) => [idOf(f.kind, f.path), f]));
  const listed = new Set(rows.map((r) => idOf(r.kind, r.path)));
  for (const f of found) if (!listed.has(idOf(f.kind, f.path))) out.unlisted.push(f);
  for (const r of rows) {
    const f = foundBy.get(idOf(r.kind, r.path));
    if (f === undefined) out.gone.push({ kind: r.kind, path: r.path });
    else if (f.lines.length !== r.uses) out.wrongCount.push({ kind: r.kind, path: r.path, listed: r.uses, found: f.lines.length });
  }
  return out;
}

export function isCleanBrowser(c: BrowserComparison): boolean {
  return c.unlisted.length === 0 && c.gone.length === 0 && c.wrongCount.length === 0;
}

const plural = (n: number): string => (n === 1 ? "place" : "places");

/** One line for each difference, for the failure message. Empty when the comparison is clean. */
export function formatBrowserComparison(c: BrowserComparison): string {
  const out: string[] = [];
  for (const u of c.unlisted) out.push(`${u.path}:${u.lines[0] ?? 0}: ${u.lines.length} ${u.kind} ${plural(u.lines.length)} found and no row lists them`);
  for (const g of c.gone) out.push(`${g.path}: the ${g.kind} row finds nothing in the file`);
  for (const w of c.wrongCount) out.push(`${w.path}: the ${w.kind} row says ${w.listed} ${plural(w.listed)} but ${w.found} found`);
  return out.join("\n");
}

/** How many places of each kind the scan found over all files, in the order of the list of kinds. */
export function browserTotalsByKind(found: readonly FoundBrowser[]): Array<{ kind: BrowserKind; places: number; files: number }> {
  return BROWSER_KINDS.map((kind) => {
    const mine = found.filter((f) => f.kind === kind);
    return { kind, places: mine.reduce((n, f) => n + f.lines.length, 0), files: mine.length };
  }).filter((t) => t.places > 0);
}
