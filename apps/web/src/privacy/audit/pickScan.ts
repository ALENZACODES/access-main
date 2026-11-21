// Finds the places in the App's own source where a file the person picked is brought in: a read of the files of a file
// input (`.files?.[0]`, `.files?.item(0)`, `Array.from(input.files ?? [])`) and a `FileReader`. Each place is found by
// its call, in code and in the strings the plain-TypeScript pages build. A line that is a comment is never a place.
// A file brought in through a library, through a drag and drop the scan does not know, or under `narrow/`, is not
// found, and the list says nothing about it. This module also finds the size checks next to a pick, so an audit can show
// that a row marked as limited before reading really compares the size first. Node only (tests and CI), never shipped
// to the browser.

import { PICK_KINDS, type PickKind, type PickRow } from "../panel/pickRegister";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export interface PickPattern {
  kind: PickKind;
  patterns: readonly RegExp[];
}

export const PICK_CATALOGUE: readonly PickPattern[] = [
  { kind: "pick", patterns: [/\.files\s*(?:\?\.|\.)?\s*(?:\[|item\s*\()/g, /\.files\s*\?\?\s*\[/g] },
  { kind: "reader", patterns: [/\bnew\s+FileReader\s*\(/g] },
];

/** A comparison of the size of a file with a limit, such as `file.size > MAX` or `selected.size > 256 * 1024`. */
export const SIZE_CHECK = /\b(?:file|chosen|selected|f)\.size\s*>\s*\S/g;

/** A call that reads the content of a picked file into memory. */
export const READ_CALL = /\.(?:text|arrayBuffer)\s*\(\s*\)|\.readAs(?:Text|ArrayBuffer|DataURL|BinaryString)\s*\(/g;

export interface FoundPick {
  kind: PickKind;
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

function hitsOf(text: string, patterns: readonly RegExp[]): number[] {
  const hits = new Set<number>();
  for (const re of patterns) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) {
      if (m.index === undefined || inComment(text, m.index)) continue;
      hits.add(m.index);
    }
  }
  return [...hits].sort((a, b) => a - b);
}

/** Every place a picked file is brought in, grouped by file and kind, in the order of the paths and then the catalogue. */
export function scanPicks(files: readonly SourceFile[], catalogue: readonly PickPattern[] = PICK_CATALOGUE): FoundPick[] {
  const out: FoundPick[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    for (const { kind, patterns } of catalogue) {
      const hits = hitsOf(file.text, patterns);
      if (hits.length > 0) out.push({ kind, path: file.path, lines: hits.map((i) => lineOf(file.text, i)) });
    }
  }
  return out;
}

/** The 1-based lines of the size checks in a file's text. */
export function sizeCheckLines(text: string): number[] {
  return hitsOf(text, [SIZE_CHECK]).map((i) => lineOf(text, i));
}

/** The 1-based lines where a picked file's content is read into memory. */
export function readLines(text: string): number[] {
  return hitsOf(text, [READ_CALL]).map((i) => lineOf(text, i));
}

export interface PickComparison {
  /** Found in a file, in no row */
  unlisted: FoundPick[];
  /** In a row, none found in that file */
  gone: Array<{ kind: PickKind; path: string }>;
  /** In a row and found, in a different number of places */
  wrongCount: Array<{ kind: PickKind; path: string; listed: number; found: number }>;
}

const idOf = (kind: string, path: string): string => `${kind}\u0000${path}`;

/** Differences between what the scan found and the rows, both ways. */
export function comparePicks(found: readonly FoundPick[], rows: readonly PickRow[]): PickComparison {
  const out: PickComparison = { unlisted: [], gone: [], wrongCount: [] };
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

export function isCleanPick(c: PickComparison): boolean {
  return c.unlisted.length === 0 && c.gone.length === 0 && c.wrongCount.length === 0;
}

const plural = (n: number): string => (n === 1 ? "place" : "places");

/** One line for each difference, for the failure message. Empty when the comparison is clean. */
export function formatPickComparison(c: PickComparison): string {
  const out: string[] = [];
  for (const u of c.unlisted) out.push(`${u.path}:${u.lines[0] ?? 0}: ${u.lines.length} ${u.kind} ${plural(u.lines.length)} found and no row lists them`);
  for (const g of c.gone) out.push(`${g.path}: the ${g.kind} row finds nothing in the file`);
  for (const w of c.wrongCount) out.push(`${w.path}: the ${w.kind} row says ${w.listed} ${plural(w.listed)} but ${w.found} found`);
  return out.join("\n");
}

/** How many places of each kind the scan found over all files, in the order of the list of kinds. */
export function pickTotalsByKind(found: readonly FoundPick[]): Array<{ kind: PickKind; places: number; files: number }> {
  return PICK_KINDS.map((kind) => {
    const mine = found.filter((f) => f.kind === kind);
    return { kind, places: mine.reduce((n, f) => n + f.lines.length, 0), files: mine.length };
  }).filter((t) => t.places > 0);
}
