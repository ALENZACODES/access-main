// Compares the findings with the accepted list, in both directions.

import type { DgAcceptRow } from "./dgRegister";
import { DG_ACCEPTABLE } from "./dgRegister";
import { countFindings, type DgFinding } from "./dgRules";

export type DgProblemCode = "finding-not-accepted" | "accepted-gone" | "count-changed" | "unacceptable-code";

export interface DgProblem {
  code: DgProblemCode;
  key: string;
  detail: string;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function compareDg(findings: readonly DgFinding[], accepted: readonly DgAcceptRow[]): DgProblem[] {
  const out: DgProblem[] = [];
  const found = new Map(countFindings(findings).map((r) => [`${r.path} ${r.code}`, r.count]));
  const acc = new Map(accepted.map((a) => [`${a.path} ${a.code}`, a]));
  for (const a of accepted) if (!DG_ACCEPTABLE.includes(a.code)) out.push({ code: "unacceptable-code", key: `${a.path} ${a.code}`, detail: "this code may not be accepted" });
  for (const [key, n] of [...found.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    const a = acc.get(key);
    if (!a) out.push({ code: "finding-not-accepted", key, detail: `${n} finding${n === 1 ? "" : "s"} not on the accepted list` });
    else if (a.count !== n) out.push({ code: "count-changed", key, detail: `accepted ×${a.count}, found ×${n}` });
  }
  for (const [key, a] of [...acc.entries()].sort((x, y) => cmp(x[0], y[0]))) if (!found.has(key)) out.push({ code: "accepted-gone", key, detail: `accepted ×${a.count}; none found` });
  return out;
}

export const formatDgProblem = (p: DgProblem): string => `${p.code} ${p.key}: ${p.detail}`;
export const formatDgProblems = (list: readonly DgProblem[]): string => list.map(formatDgProblem).join("\n");
