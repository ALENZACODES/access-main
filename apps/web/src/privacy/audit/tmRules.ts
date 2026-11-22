// The rules for how the App's code reads and writes time. The sites come from tmScan.ts. A site becomes a finding
// only where the rule polices it: a time zone read is a finding wherever it is; a timer finer than a millisecond, a
// getter that answers in the device's time zone, a date written in the device's own format, and a clock call inside a
// template string (a time written into an identifier) are findings that need a reason on the accepted list; a clock
// read or a written time in the files of the privacy folder is a finding that needs a reason; and a clock read or
// written time in a folder that is not on the list of known folders is a finding too, so a new place that writes
// times is looked at once.

import type { TmSite } from "./tmScan";

export type TmCode =
  | "tm-tz-read"
  | "tm-hires-timer"
  | "tm-local-getter"
  | "tm-local-format"
  | "tm-clock-in-text"
  | "tm-privacy-clock"
  | "tm-unlisted-folder";

export const TM_CODES: readonly TmCode[] = ["tm-tz-read", "tm-hires-timer", "tm-local-getter", "tm-local-format", "tm-clock-in-text", "tm-privacy-clock", "tm-unlisted-folder"];

/** The codes a row on the accepted list may carry. A time zone read never may, and an unlisted folder is fixed by listing the folder. */
export const TM_ACCEPTABLE: readonly TmCode[] = ["tm-hires-timer", "tm-local-getter", "tm-local-format", "tm-clock-in-text", "tm-privacy-clock"];

export interface TmFinding {
  code: TmCode;
  path: string;
  line: number;
  detail: string;
}

const SRC = "apps/web/src/";

/** The first folder under apps/web/src, or "(src)" for a file directly in it. */
export function folderOf(path: string): string {
  if (!path.startsWith(SRC)) return "(outside)";
  const rest = path.slice(SRC.length);
  const slash = rest.indexOf("/");
  return slash < 0 ? "(src)" : rest.slice(0, slash);
}

export const isPrivacyPath = (path: string): boolean => path.startsWith(`${SRC}privacy/`);

const CLOCK_KINDS: ReadonlySet<TmSite["kind"]> = new Set(["clock-ms", "stamp-full", "stamp-cut"]);

/** Findings for sites, given the folders that are already known to read or write times. */
export function auditTime(sites: readonly TmSite[], knownFolders: ReadonlySet<string>): TmFinding[] {
  const out: TmFinding[] = [];
  const add = (s: TmSite, code: TmCode, detail = s.detail): void => void out.push({ code, path: s.path, line: s.line, detail });
  for (const s of sites) {
    if (s.kind === "tz-read") add(s, "tm-tz-read");
    else if (s.kind === "timer-hires") add(s, "tm-hires-timer");
    else if (s.kind === "local-getter") add(s, "tm-local-getter");
    else if (s.kind === "local-format") add(s, "tm-local-format");
    if (s.kind === "clock-ms" && s.inText) add(s, "tm-clock-in-text");
    if (CLOCK_KINDS.has(s.kind)) {
      if (isPrivacyPath(s.path)) add(s, "tm-privacy-clock");
      else if (!knownFolders.has(folderOf(s.path))) add(s, "tm-unlisted-folder", `${s.detail} in ${folderOf(s.path)}`);
    }
  }
  return out.sort((a, b) => (a.path === b.path ? a.line - b.line || (a.code < b.code ? -1 : 1) : a.path < b.path ? -1 : 1));
}

export interface TmCountRow {
  code: TmCode;
  path: string;
  count: number;
}

/** How many findings per code and file, in path then code order. */
export function countFindings(findings: readonly TmFinding[]): TmCountRow[] {
  const m = new Map<string, TmCountRow>();
  for (const f of findings) {
    const key = `${f.path}\u0000${f.code}`;
    const row = m.get(key);
    if (row) row.count++;
    else m.set(key, { code: f.code, path: f.path, count: 1 });
  }
  return [...m.values()].sort((a, b) => (a.path === b.path ? (a.code < b.code ? -1 : 1) : a.path < b.path ? -1 : 1));
}

export function formatTmFinding(f: TmFinding): string {
  return `${f.path}:${f.line} ${f.code}: ${f.detail}`;
}
