// A plain-text report of the strictness audit for a failure message and the CI log: how much was read, the findings and
// which are accepted, and any difference from the register. It reads nothing itself. Node only, never shipped.

import { formatGuardProblem, type GuardProblem } from "./guardCompare";
import type { GuardLoaded } from "./guardFiles";
import type { GuardAcceptRow } from "./guardRegister";
import { formatGuardFinding, type GuardFinding } from "./guardRules";
import { countSuppressions } from "./suppressScan";

export interface GuardReportInput {
  loaded: GuardLoaded;
  findings: readonly GuardFinding[];
  accepted: readonly GuardAcceptRow[];
  problems: readonly GuardProblem[];
}

/** The report, one line each, with no trailing line break. */
export function renderGuardReport(i: GuardReportInput): string {
  const l = i.loaded;
  const out: string[] = [
    `Read ${l.tsconfigs.length} TypeScript configurations, ${l.packageFiles.length} package files, ${l.configs.length} test or lint configurations and ${l.codeFiles} code files.`,
    `Suppressions in code: ${l.suppressions.length} in ${countSuppressions(l.suppressions).length} kinds of place.`,
    `Findings: ${i.findings.length}.`,
  ];
  for (const f of i.findings) out.push(`  ${formatGuardFinding(f)}`);
  out.push(`Findings accepted as they stand: ${i.accepted.length}.`);
  for (const a of i.accepted) out.push(`  ${a.path} — ${a.code} ×${a.count}`);
  out.push(i.problems.length === 0 ? "Differences from the register: none." : `Differences from the register: ${i.problems.length}.`);
  for (const p of i.problems) out.push(`  ${formatGuardProblem(p)}`);
  return out.join("\n");
}

/** The suppressions as CSV: path, line, kind, rules (joined by " | "), reason. */
export function suppressionsCsv(l: GuardLoaded): string {
  const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ["path,line,kind,rules,reason", ...l.suppressions.map((s) => [s.path, String(s.line), s.kind, s.rules.join(" | "), s.reason ?? ""].map(cell).join(","))].join("\n");
}
