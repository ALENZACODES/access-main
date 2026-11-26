// A plain-text report of the audit of coordinates, for the log of a failed test and for people reading it.

import { LC_CODES, countLcFindings, formatLcProblems, type LcCode, type LcFinding, type LcProblem } from "./lcRules";
import { LC_KINDS, countLcKinds, digitsInUse, type LcSite } from "./lcScan";
import { resolutionMetres } from "./lcText";

export interface LcReportInput {
  files: number;
  sites: readonly LcSite[];
  findings: readonly LcFinding[];
  problems: readonly LcProblem[];
}

export function renderLcReport(input: LcReportInput): string {
  const lines: string[] = [`Read ${input.files} files of the App's own code.`];
  const kinds = countLcKinds(input.sites);
  lines.push(`Sites: ${input.sites.length} (${LC_KINDS.filter((k) => kinds[k] > 0).map((k) => `${kinds[k]} ${k}`).join(", ") || "none"}).`);
  const digits = [...digitsInUse(input.sites)];
  if (digits.length > 0) lines.push(`Decimals written: ${digits.map(([d, n]) => `${d} (about ${resolutionMetres(d).toFixed(1)} m) in ${n}`).join("; ")}.`);
  const places = countLcFindings(input.findings).length;
  lines.push(`Findings: ${input.findings.length} in ${places} ${places === 1 ? "place" : "places"}.`);
  const byCode = new Map<LcCode, number>();
  for (const f of input.findings) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
  for (const c of LC_CODES) if ((byCode.get(c) ?? 0) > 0) lines.push(`  ${c}: ${byCode.get(c)}`);
  if (input.problems.length === 0) lines.push("Differences from the accepted list: none.");
  else {
    lines.push(`Differences from the accepted list: ${input.problems.length}.`);
    for (const l of formatLcProblems(input.problems).split("\n")) lines.push(`  ${l}`);
  }
  return `${lines.join("\n")}\n`;
}
