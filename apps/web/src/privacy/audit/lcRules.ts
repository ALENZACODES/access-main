// The rules for how the App writes coordinates, and the comparison with the accepted list. The sites come from
// lcScan.ts. A number cut to more than five decimals (finer than about 1 m) is a finding, and so is a number cut to a
// count that is not written in the call, and so is a coordinate written as it is, with as many decimals as it has.
// A finding is accepted by a row with a reason, which says what was read in the lines named and nothing more.

import type { LcSite } from "./lcScan";

export type LcCode = "lc-too-fine" | "lc-variable-digits" | "lc-raw";

export const LC_CODES: readonly LcCode[] = ["lc-too-fine", "lc-variable-digits", "lc-raw"];

/** The most decimals the App may write for a coordinate without a row: five, about 1 m on the ground. */
export const MAX_DECIMALS = 5;

export interface LcFinding {
  code: LcCode;
  path: string;
  line: number;
  detail: string;
}

export interface LcAcceptRow {
  path: string;
  code: LcCode;
  count: number;
  reason: string;
}

export function auditCoordinates(sites: readonly LcSite[]): LcFinding[] {
  const out: LcFinding[] = [];
  for (const s of sites) {
    const base = { path: s.path, line: s.line, detail: s.detail };
    if ((s.kind === "fixed" || s.kind === "rounded") && s.digits > MAX_DECIMALS) out.push({ ...base, code: "lc-too-fine" });
    else if (s.kind === "fixed-variable") out.push({ ...base, code: "lc-variable-digits" });
    else if (s.kind === "raw") out.push({ ...base, code: "lc-raw" });
  }
  return out.sort((a, b) => (a.path === b.path ? a.line - b.line || (a.code < b.code ? -1 : 1) : a.path < b.path ? -1 : 1));
}

export type LcProblemCode = "finding-not-accepted" | "accepted-not-found" | "count-differs";

export interface LcProblem {
  code: LcProblemCode;
  path: string;
  lcCode: LcCode;
  detail: string;
}

const key = (path: string, code: string): string => `${path}\u0000${code}`;

/** Findings against the accepted rows, in both directions. Rows of one file and code are added up. */
export function compareCoordinates(findings: readonly LcFinding[], rows: readonly LcAcceptRow[]): LcProblem[] {
  const found = new Map<string, { path: string; code: LcCode; count: number }>();
  for (const f of findings) {
    const k = key(f.path, f.code);
    const cur = found.get(k);
    if (cur) cur.count++;
    else found.set(k, { path: f.path, code: f.code, count: 1 });
  }
  const want = new Map<string, { path: string; code: LcCode; count: number }>();
  for (const r of rows) {
    const k = key(r.path, r.code);
    const cur = want.get(k);
    if (cur) cur.count += r.count;
    else want.set(k, { path: r.path, code: r.code, count: r.count });
  }
  const out: LcProblem[] = [];
  for (const [k, f] of found) {
    const w = want.get(k);
    if (!w) out.push({ code: "finding-not-accepted", path: f.path, lcCode: f.code, detail: `${f.count} not on the accepted list` });
    else if (w.count !== f.count) out.push({ code: "count-differs", path: f.path, lcCode: f.code, detail: `found ${f.count}, accepted ${w.count}` });
  }
  for (const [k, w] of want) if (!found.has(k)) out.push({ code: "accepted-not-found", path: w.path, lcCode: w.code, detail: `accepted ${w.count}, found none` });
  return out.sort((a, b) => (a.code === b.code ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) : a.code < b.code ? -1 : 1));
}

export function formatLcProblems(problems: readonly LcProblem[]): string {
  return problems.map((p) => `${p.code} ${p.path} ${p.lcCode}: ${p.detail}`).join("\n");
}

export function countLcFindings(findings: readonly LcFinding[]): Array<{ path: string; code: LcCode; count: number }> {
  const m = new Map<string, { path: string; code: LcCode; count: number }>();
  for (const f of findings) {
    const k = key(f.path, f.code);
    const cur = m.get(k);
    if (cur) cur.count++;
    else m.set(k, { path: f.path, code: f.code, count: 1 });
  }
  return [...m.values()].sort((a, b) => (a.path === b.path ? (a.code < b.code ? -1 : 1) : a.path < b.path ? -1 : 1));
}

export function validateLcRows(rows: readonly LcAcceptRow[]): string[] {
  const out: string[] = [];
  let prev = "";
  const seen = new Set<string>();
  for (const r of rows) {
    const where = `${r.path} ${r.code}`;
    if (!LC_CODES.includes(r.code)) out.push(`${where}: not a code of this audit`);
    if (!Number.isInteger(r.count) || r.count < 1) out.push(`${where}: count must be a whole number from 1`);
    if (r.reason.trim().length < 40) out.push(`${where}: the reason is too short to say what was read`);
    if (/\b(verified|safe|secure|private)\b/i.test(r.reason)) out.push(`${where}: the reason claims more than a reading of the lines`);
    const k = `${r.path}\u0000${r.code}\u0000${r.reason}`;
    if (seen.has(k)) out.push(`${where}: the same row twice`);
    seen.add(k);
    const order = key(r.path, r.code);
    if (order < prev) out.push(`${where}: out of order`);
    prev = order;
  }
  return out;
}
