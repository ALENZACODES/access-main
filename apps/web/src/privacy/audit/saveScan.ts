// Finds the places in the App's own source where the code makes a file for the person to save: a call that turns data
// into a web address the browser can download (`createObjectURL`). Each place is found by that call, in code and in the
// strings the plain-TypeScript pages build; a line that is a comment is never a place. The scan also reads which file
// formats the file names in its own text (`application/json`, `text/plain`, `text/csv`), so a row can say "JSON" only
// while the file really names it, and says "set by the caller" when the format is passed in from somewhere else. A
// download made some other way (a name held in a variable, a library, code under `narrow/`) is not found, and the list
// says nothing about it. Node only (tests and CI), never shipped to the browser.

import { type SaveKind, type SaveRow } from "../panel/saveRegister";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

/** The call that makes a downloadable address, with or without a window or view in front. */
export const SAVE_CALL = /\bURL\.createObjectURL\s*\(/g;

export interface FoundSave {
  path: string;
  /** 1-based line of each place, in order */
  lines: number[];
  /** What the file's own text says about the format of what it makes */
  kind: SaveKind;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

function inComment(text: string, index: number): boolean {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  return COMMENT_LINE.test(text.slice(start, index + 1));
}

/** The text of the file without its comment lines, so a format named only in a comment does not count. */
export function withoutComments(text: string): string {
  return text
    .split("\n")
    .filter((l) => !COMMENT_LINE.test(l))
    .join("\n");
}

/** Which formats a file names: JSON, plain text (including the `txt` extension) and CSV. */
export function namedFormats(text: string): { json: boolean; text: boolean; csv: boolean } {
  const code = withoutComments(text);
  return { json: /application\/json/.test(code), text: /text\/plain|["'`.]txt["'`]|\btxt\b/.test(code), csv: /text\/csv/.test(code) };
}

/** The one kind that fits what a file names. A file that names nothing takes its format from the caller. */
export function kindOfFormats(f: { json: boolean; text: boolean; csv: boolean }): SaveKind {
  if (f.csv && !f.json && !f.text) return "csv";
  if (f.json && f.text && !f.csv) return "json-and-text";
  if (f.json && !f.text && !f.csv) return "json";
  if (f.text && !f.json && !f.csv) return "text";
  if (!f.json && !f.text && !f.csv) return "none";
  return "mixed";
}

/** Every file that makes a download, with its places and the format it names, in the order of the paths. */
export function scanSave(files: readonly SourceFile[]): FoundSave[] {
  const out: FoundSave[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    const hits: number[] = [];
    for (const m of file.text.matchAll(new RegExp(SAVE_CALL.source, "g"))) {
      if (m.index === undefined || inComment(file.text, m.index)) continue;
      hits.push(lineOf(file.text, m.index));
    }
    if (hits.length > 0) out.push({ path: file.path, lines: hits, kind: kindOfFormats(namedFormats(file.text)) });
  }
  return out;
}

export interface SaveComparison {
  /** Found in a file, in no row */
  unlisted: FoundSave[];
  /** In a row, none found in that file */
  gone: Array<{ path: string }>;
  /** In a row and found, in a different number of places */
  wrongCount: Array<{ path: string; listed: number; found: number }>;
  /** In a row and found, but the file names a different format from the row's */
  wrongKind: Array<{ path: string; listed: SaveKind; found: SaveKind }>;
}

/** Differences between what the scan found and the rows, both ways. */
export function compareSave(found: readonly FoundSave[], rows: readonly SaveRow[]): SaveComparison {
  const out: SaveComparison = { unlisted: [], gone: [], wrongCount: [], wrongKind: [] };
  const foundBy = new Map(found.map((f) => [f.path, f]));
  const listed = new Set(rows.map((r) => r.path));
  for (const f of found) if (!listed.has(f.path)) out.unlisted.push(f);
  for (const r of rows) {
    const f = foundBy.get(r.path);
    if (f === undefined) {
      out.gone.push({ path: r.path });
      continue;
    }
    if (f.lines.length !== r.uses) out.wrongCount.push({ path: r.path, listed: r.uses, found: f.lines.length });
    if (f.kind !== r.kind) out.wrongKind.push({ path: r.path, listed: r.kind, found: f.kind });
  }
  return out;
}

export function isCleanSave(c: SaveComparison): boolean {
  return c.unlisted.length === 0 && c.gone.length === 0 && c.wrongCount.length === 0 && c.wrongKind.length === 0;
}

const plural = (n: number): string => (n === 1 ? "place" : "places");

/** One line for each difference, for the failure message. Empty when the comparison is clean. */
export function formatSaveComparison(c: SaveComparison): string {
  const out: string[] = [];
  for (const u of c.unlisted) out.push(`${u.path}:${u.lines[0] ?? 0}: ${u.lines.length} ${plural(u.lines.length)} found that ${u.lines.length === 1 ? "makes" : "make"} a file, and no row lists ${u.lines.length === 1 ? "it" : "them"}`);
  for (const g of c.gone) out.push(`${g.path}: the row finds nothing in the file`);
  for (const w of c.wrongCount) out.push(`${w.path}: the row says ${w.listed} ${plural(w.listed)} but ${w.found} found`);
  for (const k of c.wrongKind) out.push(`${k.path}: the row says ${k.listed} but the file names ${k.found}`);
  return out.join("\n");
}

/** How many places and files the scan found for each kind, in the order of the kinds in the register. */
export function saveTotalsByKind(found: readonly FoundSave[], order: readonly SaveKind[]): Array<{ kind: SaveKind; places: number; files: number }> {
  return order
    .map((kind) => {
      const mine = found.filter((f) => f.kind === kind);
      return { kind, places: mine.reduce((n, f) => n + f.lines.length, 0), files: mine.length };
    })
    .filter((t) => t.files > 0);
}

/** True when a path is in the part of the tree the scan reads. */
export const isSaveSource = (path: string): boolean => isScannedSource(path);
