// Sets the findings of the audit of time beside the accepted list, in both directions.

import type { TmAcceptRow } from "./tmRegister";
import { countFindings, folderOf, isPrivacyPath, type TmCode, type TmFinding } from "./tmRules";
import type { TmSite } from "./tmScan";

export type TmProblemCode = "finding-not-accepted" | "accepted-not-found" | "count-differs" | "unlisted-folder" | "stale-folder";

export interface TmProblem {
  code: TmProblemCode;
  path: string;
  tmCode: TmCode | "";
  detail: string;
}

const rowKey = (path: string, code: string): string => `${path}\u0000${code}`;

/** Accepted rows are summed by path and code, since one file may have rows with different reasons. */
function accepted(rows: readonly TmAcceptRow[]): Map<string, { path: string; code: TmCode; count: number }> {
  const m = new Map<string, { path: string; code: TmCode; count: number }>();
  for (const r of rows) {
    const k = rowKey(r.path, r.code);
    const cur = m.get(k);
    if (cur) cur.count += r.count;
    else m.set(k, { path: r.path, code: r.code, count: r.count });
  }
  return m;
}

export function compareTm(findings: readonly TmFinding[], rows: readonly TmAcceptRow[], clockFolders: ReadonlySet<string>, listedFolders: readonly string[]): TmProblem[] {
  const out: TmProblem[] = [];
  const want = accepted(rows);
  const seen = new Set<string>();
  for (const c of countFindings(findings.filter((f) => f.code !== "tm-unlisted-folder"))) {
    const k = rowKey(c.path, c.code);
    seen.add(k);
    const row = want.get(k);
    if (!row) out.push({ code: "finding-not-accepted", path: c.path, tmCode: c.code, detail: `${c.count} not on the accepted list` });
    else if (row.count !== c.count) out.push({ code: "count-differs", path: c.path, tmCode: c.code, detail: `found ${c.count}, accepted ${row.count}` });
  }
  for (const [k, row] of want) if (!seen.has(k)) out.push({ code: "accepted-not-found", path: row.path, tmCode: row.code, detail: `accepted ${row.count}, found none` });
  for (const f of findings.filter((x) => x.code === "tm-unlisted-folder")) out.push({ code: "unlisted-folder", path: f.path, tmCode: f.code, detail: folderOf(f.path) });
  for (const name of listedFolders) if (!clockFolders.has(name)) out.push({ code: "stale-folder", path: name, tmCode: "", detail: "listed, but no clock call or written time was found in it" });
  return out.sort((a, b) => (a.code === b.code ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) : a.code < b.code ? -1 : 1));
}

export function formatTmProblems(problems: readonly TmProblem[]): string {
  return problems.map((p) => `${p.code} ${p.path}${p.tmCode ? ` ${p.tmCode}` : ""}: ${p.detail}`).join("\n");
}

/** The folders, other than the privacy folder, that hold a clock call or a written time. */
export function foldersWithClock(sites: readonly TmSite[]): Set<string> {
  const out = new Set<string>();
  for (const s of sites) if ((s.kind === "clock-ms" || s.kind === "stamp-full" || s.kind === "stamp-cut") && !isPrivacyPath(s.path)) out.add(folderOf(s.path));
  return out;
}
