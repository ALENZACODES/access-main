// A plain-text report of what the photo audit found in one file, and of what cleaning changed. It is for people
// reading a failed test or a log, so it names what was found, where, and what was removed, and says nothing about
// what it could not check.

import type { PhFinding } from "./phRules";
import { PH_CODES, countCodes, formatPhFinding } from "./phRules";
import type { StripDiff } from "./phDiff";
import { formatDiffProblem } from "./phDiff";

export interface PhReportInput {
  name: string;
  size: number;
  findings: readonly PhFinding[];
  diff?: StripDiff;
}

export function summaryLine(input: PhReportInput): string {
  const leaks = input.findings.filter((f) => f.code !== "ph-malformed").length;
  const bad = input.findings.length - leaks;
  const parts = [`${input.name} (${input.size} bytes)`];
  if (input.findings.length === 0) parts.push("no findings");
  else {
    if (leaks > 0) parts.push(`${leaks} possible ${leaks === 1 ? "leak" : "leaks"}`);
    if (bad > 0) parts.push(`${bad} structure ${bad === 1 ? "problem" : "problems"}`);
  }
  return parts.join(": ").replace(": no findings", " — no findings");
}

export function reportFile(input: PhReportInput): string {
  const lines = [summaryLine(input)];
  const counts = countCodes(input.findings);
  for (const code of PH_CODES) if (counts[code] > 0) lines.push(`  ${code} × ${counts[code]}`);
  for (const f of input.findings) lines.push(`  - ${formatPhFinding(f)}`);
  if (input.diff) {
    const d = input.diff;
    const removed = Object.entries(d.removed).map(([k, v]) => `${k}${v > 1 ? ` × ${v}` : ""}`);
    lines.push(`  removed: ${removed.length > 0 ? removed.join(", ") : "nothing"}`);
    lines.push(`  kept: ${d.kept.length > 0 ? d.kept.join(", ") : "nothing"}`);
    for (const p of d.problems) lines.push(`  ! ${formatDiffProblem(p)}`);
  }
  return lines.join("\n");
}

export function reportAll(inputs: readonly PhReportInput[]): string {
  const dirty = inputs.filter((i) => i.findings.length > 0 || (i.diff?.problems.length ?? 0) > 0);
  const head = `${inputs.length} ${inputs.length === 1 ? "file" : "files"} checked, ${dirty.length} with findings`;
  return [head, ...inputs.map(reportFile)].join("\n");
}

/** The rows of a table of how many files had each finding, for a log line, most common first. */
export function tally(inputs: readonly PhReportInput[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const i of inputs) for (const f of i.findings) totals.set(f.code, (totals.get(f.code) ?? 0) + 1);
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}
