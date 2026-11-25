// Compares the workflow files with the register: which files exist, when each runs, what its token may do, its jobs and
// their time limits, and which findings each has. It returns problems and decides nothing about them. Node only (tests
// and CI), never shipped.

import type { Workflow } from "./wfModel";
import { ACCEPTABLE_CODES, permString, type WfAcceptRow, type WfRow } from "./wfRegister";
import type { WfCode, WfFinding } from "./wfRules";

export type WfCompareCode =
  | "unregistered"
  | "missing"
  | "state-changed"
  | "triggers-changed"
  | "permissions-changed"
  | "jobs-changed"
  | "timeout-changed"
  | "unexpected-finding"
  | "count-changed"
  | "stale-accept"
  | "unacceptable-finding";

export interface WfCompareProblem {
  code: WfCompareCode;
  path: string;
  detail: string;
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();
const list = (xs: readonly string[]): string => `[${xs.join(", ")}]`;

/** Whether a path is where GitHub looks for workflows. */
export const isActivePath = (path: string): boolean => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path);

const byKey = (a: WfCompareProblem, b: WfCompareProblem): number => {
  const k = (x: WfCompareProblem): string => `${x.path}\u0000${x.code}\u0000${x.detail}`;
  return k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0;
};

/** The files against the rows: a file with no row, a row with no file, and each thing about a file that differs from its row. */
export function compareShapes(workflows: readonly Workflow[], rows: readonly WfRow[]): WfCompareProblem[] {
  const out: WfCompareProblem[] = [];
  for (const w of workflows) {
    const row = rows.find((r) => r.path === w.path);
    if (row === undefined) {
      out.push({ code: "unregistered", path: w.path, detail: `triggers ${list(w.triggers)}` });
      continue;
    }
    if ((row.state === "active") !== isActivePath(w.path)) out.push({ code: "state-changed", path: w.path, detail: `row says ${row.state}` });
    if (list(sorted(w.triggers)) !== list(sorted(row.triggers))) out.push({ code: "triggers-changed", path: w.path, detail: `was ${list(sorted(row.triggers))}, now ${list(sorted(w.triggers))}` });
    const perms = permString(w.permissions);
    if (perms !== row.permissions) out.push({ code: "permissions-changed", path: w.path, detail: `was ${row.permissions}, now ${perms}` });
    const have = w.jobs.map((j) => j.id);
    const want = row.jobs.map((j) => j.id);
    if (list(sorted(have)) !== list(sorted(want))) out.push({ code: "jobs-changed", path: w.path, detail: `was ${list(sorted(want))}, now ${list(sorted(have))}` });
    for (const j of w.jobs) {
      const r = row.jobs.find((x) => x.id === j.id);
      if (r !== undefined && r.timeout !== j.timeoutMinutes) out.push({ code: "timeout-changed", path: w.path, detail: `${j.id}: was ${r.timeout ?? "none"}, now ${j.timeoutMinutes ?? "none"}` });
    }
  }
  for (const r of rows) if (!workflows.some((w) => w.path === r.path)) out.push({ code: "missing", path: r.path, detail: "the file is not there" });
  return out.sort(byKey);
}

/** How many findings each file has of each code. */
export function countFindings(findings: readonly WfFinding[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of findings) m.set(`${f.path}\u0000${f.code}`, (m.get(`${f.path}\u0000${f.code}`) ?? 0) + 1);
  return m;
}

/**
 * The findings against the accepted list: a finding that no row accepts, a row whose count is not the file's, a row
 * with no finding left, and a finding of a code that can never be accepted.
 */
export function compareAccepted(findings: readonly WfFinding[], accepted: readonly WfAcceptRow[]): WfCompareProblem[] {
  const out: WfCompareProblem[] = [];
  const counts = countFindings(findings);
  for (const [key, n] of counts) {
    const [path, code] = key.split("\u0000") as [string, WfCode];
    if (!ACCEPTABLE_CODES.includes(code)) {
      const lines = findings.filter((f) => f.path === path && f.code === code).map((f) => f.line);
      out.push({ code: "unacceptable-finding", path, detail: `${code} at line ${lines.join(", ")}` });
      continue;
    }
    const row = accepted.find((a) => a.path === path && a.code === code);
    if (row === undefined) {
      const lines = findings.filter((f) => f.path === path && f.code === code).map((f) => f.line);
      out.push({ code: "unexpected-finding", path, detail: `${code} ×${n} at line ${lines.join(", ")}` });
    } else if (row.count !== n) out.push({ code: "count-changed", path, detail: `${code}: list says ${row.count}, found ${n}` });
  }
  for (const a of accepted) if (!counts.has(`${a.path}\u0000${a.code}`)) out.push({ code: "stale-accept", path: a.path, detail: `${a.code}: no such finding any more` });
  return out.sort(byKey);
}

export function formatWfProblem(p: WfCompareProblem): string {
  return `${p.code} ${p.path} (${p.detail})`;
}

export function formatWfProblems(list: readonly WfCompareProblem[]): string {
  return list.map(formatWfProblem).join("\n");
}
