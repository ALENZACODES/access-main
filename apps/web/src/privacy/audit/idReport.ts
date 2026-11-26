// A short text report of the identifier scan: counts by kind, the files that make identifiers, and the problems.

import type { IdProblem } from "./idCompare";
import { formatIdProblem } from "./idCompare";
import type { IdAcceptRow } from "./idRegister";
import type { IdFinding } from "./idRules";
import { ID_CODES, countFindings } from "./idRules";

export interface IdReportInput {
  files: number;
  findings: readonly IdFinding[];
  accepted: readonly IdAcceptRow[];
  problems: readonly IdProblem[];
}

export function renderIdReport(input: IdReportInput): string {
  const { files, findings, accepted, problems } = input;
  const counts = countFindings(findings);
  const out: string[] = ["# Identifiers and device reads", "", `Files read: ${files}`, `Findings: ${findings.length}`, `Accepted rows: ${accepted.length}`, ""];
  out.push("## By code", "", ...ID_CODES.map((c) => `- ${c}: ${counts[c]}`), "");
  const perFile = new Map<string, number>();
  for (const f of findings) perFile.set(f.path, (perFile.get(f.path) ?? 0) + 1);
  const files2 = [...perFile].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  out.push("## By file", "", ...(files2.length === 0 ? ["none"] : files2.map(([p, n]) => `- ${p}: ${n}`)), "");
  out.push("## Problems", "", ...(problems.length === 0 ? ["none"] : problems.map((p) => `- ${formatIdProblem(p)}`)), "");
  return out.join("\n");
}
