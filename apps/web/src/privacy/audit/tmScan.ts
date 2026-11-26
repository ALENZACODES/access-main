// Finds where the App's code reads the clock, writes a time into text, or asks which time zone the device is in.
// It reads text. A site is one call or one option found in the code; the scanner does not follow a value to where it
// is kept or sent, so a site says what the code does at that line and nothing about what happens next.

import type { SourceFile } from "./repoAudit";
import { lineAt, maskCode } from "./tmMask";

export type TmKind =
  /** Date.now(), new Date() with no argument. The exact time, to the millisecond. */
  | "clock-ms"
  /** performance.now(), performance.timeOrigin, hrtime. A timer finer than a millisecond is possible. */
  | "timer-hires"
  /** toISOString() written out in full: date, time, milliseconds and Z. */
  | "stamp-full"
  /** toISOString() cut to a shorter text. The detail says how short. */
  | "stamp-cut"
  /** getTimezoneOffset, resolvedOptions, or a timeZone option that is not "UTC". */
  | "tz-read"
  /** getFullYear, getHours and the other getters that answer in the device's own time zone. */
  | "local-getter"
  /** toLocaleDateString, toLocaleTimeString, toDateString, or Intl.DateTimeFormat with no UTC time zone. */
  | "local-format"
  /** Intl.DateTimeFormat or toLocale*String with timeZone: "UTC". Written for the same text on every device. */
  | "utc-format";

export const TM_KINDS: readonly TmKind[] = ["clock-ms", "timer-hires", "stamp-full", "stamp-cut", "tz-read", "local-getter", "local-format", "utc-format"];

export interface TmSite {
  path: string;
  line: number;
  kind: TmKind;
  /** The text found, cut to one short line. */
  detail: string;
  /** For clock-ms: whether the call sits inside the ${ } of a template string, so the time is written into text. */
  inText: boolean;
}

const LOCAL_GETTERS = ["getFullYear", "getMonth", "getDate", "getDay", "getHours", "getMinutes", "getSeconds", "getMilliseconds"];

/** The index of the ")" that closes the "(" at `open`, in masked text, or -1. */
export function closingParen(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    const c = masked[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim().slice(0, 60);

/** Whether the index is inside the ${ } of a template string, judged on its own line. */
export function insideTemplateExpression(original: string, masked: string, index: number): boolean {
  const lineStart = original.lastIndexOf("\n", index - 1) + 1;
  let backticks = 0;
  for (let i = lineStart; i < index; i++) if (original[i] === "`" && original[i - 1] !== "\\") backticks++;
  if (backticks % 2 === 1) return true;
  // A template that started on an earlier line: the masked text blanks its text, and code inside ${ } stays.
  const before = original.slice(Math.max(0, index - 400), index);
  const open = before.lastIndexOf("${");
  return open >= 0 && before.indexOf("}", open) < 0 && masked.slice(index - (before.length - open), index).trim() !== "" && before.lastIndexOf("`") < open;
}

function cutKind(args: string): string {
  const a = args.replace(/\s+/g, "");
  if (/^0,10$/.test(a)) return "date (10 characters)";
  if (/^0,7$/.test(a)) return "month (7 characters)";
  if (/^0,16$/.test(a)) return "minute (16 characters)";
  if (/^0,19$/.test(a)) return "second (19 characters)";
  return `slice(${a})`;
}

/** Sites in one file. A file that is not code gives none. */
export function scanTimeFile(file: SourceFile): TmSite[] {
  const original = file.text;
  const masked = maskCode(original);
  const out: TmSite[] = [];
  const add = (index: number, kind: TmKind, detail: string, inText = false): void => {
    out.push({ path: file.path, line: lineAt(original, index), kind, detail: oneLine(detail), inText });
  };

  for (const m of masked.matchAll(/\bDate\s*\.\s*now\s*\(\s*\)/g)) {
    const at = m.index ?? 0;
    add(at, "clock-ms", "Date.now()", insideTemplateExpression(original, masked, at));
  }
  for (const m of masked.matchAll(/\bnew\s+Date\s*\(\s*\)/g)) {
    const at = m.index ?? 0;
    add(at, "clock-ms", "new Date()", insideTemplateExpression(original, masked, at));
  }
  for (const m of masked.matchAll(/\bperformance\s*\??\.\s*(now|timeOrigin)\b|\bprocess\s*\.\s*hrtime\b|\bhrtime\s*\.\s*bigint\b/g)) {
    add(m.index ?? 0, "timer-hires", m[0]);
  }
  for (const m of masked.matchAll(/\.\s*toISOString\s*\(\s*\)/g)) {
    const at = m.index ?? 0;
    const end = at + m[0].length;
    const next = /^\s*\.\s*(slice|substring|substr|split)\s*\(/.exec(masked.slice(end));
    if (next === null) {
      add(at, "stamp-full", "toISOString()");
      continue;
    }
    const open = end + next[0].length - 1;
    const close = closingParen(masked, open);
    const args = close < 0 ? "" : original.slice(open + 1, close);
    add(at, "stamp-cut", `toISOString().${next[1]}: ${next[1] === "split" ? "split on a character" : cutKind(args)}`);
  }
  for (const m of masked.matchAll(/\.\s*getTimezoneOffset\s*\(/g)) add(m.index ?? 0, "tz-read", "getTimezoneOffset");
  for (const m of masked.matchAll(/\.\s*resolvedOptions\s*\(/g)) add(m.index ?? 0, "tz-read", "resolvedOptions");
  for (const m of masked.matchAll(/\btimeZone\s*:\s*/g)) {
    const at = m.index ?? 0;
    const value = /^["'`]([^"'`]*)["'`]/.exec(original.slice(at + m[0].length));
    if (value?.[1] === "UTC") continue;
    add(at, "tz-read", `timeZone option: ${value?.[1] ?? "a value that is not written out"}`);
  }
  for (const name of LOCAL_GETTERS) {
    for (const m of masked.matchAll(new RegExp(`\\.\\s*${name}\\s*\\(`, "g"))) add(m.index ?? 0, "local-getter", name);
  }
  for (const m of masked.matchAll(/\.\s*(toLocaleDateString|toLocaleTimeString|toDateString|toTimeString)\s*\(/g)) {
    const at = m.index ?? 0;
    const open = at + m[0].length - 1;
    const close = closingParen(masked, open);
    const args = close < 0 ? "" : original.slice(open + 1, close);
    add(at, /["'`]UTC["'`]/.test(args) ? "utc-format" : "local-format", m[1] ?? "");
  }
  for (const m of masked.matchAll(/\bIntl\s*\.\s*DateTimeFormat\s*\(/g)) {
    const at = m.index ?? 0;
    const open = at + m[0].length - 1;
    const close = closingParen(masked, open);
    const args = close < 0 ? "" : original.slice(open + 1, close);
    add(at, /timeZone\s*:\s*["'`]UTC["'`]/.test(args) ? "utc-format" : "local-format", "Intl.DateTimeFormat");
  }
  return out.sort((a, b) => a.line - b.line || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

/** Whether a repo-relative path is read: code of the App that ships, not tests and not the audit tooling. */
export function isTimeScanned(path: string): boolean {
  if (!/^apps\/web\/src\//.test(path)) return false;
  if (!/\.(ts|tsx|mjs|js)$/.test(path)) return false;
  if (/\.(test|spec)\.(ts|tsx|mjs|js)$/.test(path)) return false;
  if (path.startsWith("apps/web/src/privacy/audit/")) return false;
  return true;
}

export function scanTime(files: readonly SourceFile[]): TmSite[] {
  const out: TmSite[] = [];
  for (const f of files) if (isTimeScanned(f.path)) out.push(...scanTimeFile(f));
  return out.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1));
}

/** How many sites of each kind. */
export function countKinds(sites: readonly TmSite[]): Record<TmKind, number> {
  const out = Object.fromEntries(TM_KINDS.map((k) => [k, 0])) as Record<TmKind, number>;
  for (const s of sites) out[s.kind]++;
  return out;
}
