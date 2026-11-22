// A plain-text report of the diagnostics audit for a failure message and the CI log. It reads nothing itself.

import { formatDgProblem, type DgProblem } from "./dgCompare";
import type { DgAcceptRow } from "./dgRegister";
import { countFindings, formatFinding, type DgFinding } from "./dgRules";
import type { DgSite } from "./dgScan";

export interface DgReportInput {
  files: number;
  throws: number;
  sites: readonly DgSite[];
  findings: readonly DgFinding[];
  accepted: readonly DgAcceptRow[];
  problems: readonly DgProblem[];
}

/** The report, one line each, with no trailing line break. */
export function renderDgReport(i: DgReportInput): string {
  const templates = i.sites.filter((s) => s.kind === "throw-template").length;
  const out: string[] = [
    `Read ${i.files} files of the App's own code.`,
    `Throw statements: ${i.throws}; thrown messages that write a value in \${ }: ${templates}.`,
    `Findings: ${i.findings.length} in ${countFindings(i.findings).length} places.`,
  ];
  for (const f of i.findings) out.push(`  ${formatFinding(f)}`);
  out.push(`Findings accepted as they stand: ${i.accepted.length} rows.`);
  out.push(i.problems.length === 0 ? "Differences from the accepted list: none." : `Differences from the accepted list: ${i.problems.length}.`);
  for (const p of i.problems) out.push(`  ${formatDgProblem(p)}`);
  return out.join("\n");
}
