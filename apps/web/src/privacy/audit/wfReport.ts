// A plain-text report of the workflow audit, for a failure message and for anyone reading the CI log: each file with
// when it runs and what its token may do, the findings and which are accepted, and any difference from the register. It
// reads nothing itself. Node only (tests and CI), never shipped.

import { formatWfProblem, type WfCompareProblem } from "./wfCompare";
import { wfCounts, type WfAcceptRow, type WfRow } from "./wfRegister";
import { formatWfFinding, type WfFinding } from "./wfRules";

export interface WfReportInput {
  rows: readonly WfRow[];
  accepted: readonly WfAcceptRow[];
  findings: readonly WfFinding[];
  problems: readonly WfCompareProblem[];
}

const jobText = (r: WfRow): string => r.jobs.map((j) => `${j.id} ${j.timeout === null ? "no timeout" : `${j.timeout} min`}`).join(", ");

/** The report, one line each, with no trailing line break. */
export function renderWfReport(input: WfReportInput): string {
  const c = wfCounts(input.rows, input.accepted);
  const out: string[] = [`Workflow files: ${c.files} (${c.active} run by GitHub, ${c.staged} kept ready and not run), ${c.jobs} jobs, ${c.noTimeout} with no timeout.`];
  for (const r of input.rows) {
    out.push(`${r.path} [${r.state}]: runs on ${r.triggers.join(", ")}; token ${r.permissions}; jobs ${jobText(r)}.`);
    for (const f of input.findings.filter((x) => x.path === r.path)) out.push(`  ${formatWfFinding(f)}`);
  }
  out.push(`Findings accepted as they stand: ${c.accepted}.`);
  for (const a of input.accepted) out.push(`  ${a.path} — ${a.code} ×${a.count}: ${a.reason}`);
  out.push(input.problems.length === 0 ? "Differences from the register: none." : `Differences from the register: ${input.problems.length}.`);
  for (const p of input.problems) out.push(`  ${formatWfProblem(p)}`);
  return out.join("\n");
}

/** The register as CSV: path, state, triggers (joined by " | "), permissions, jobs (id:timeout joined by " | "), note. */
export function wfCsv(rows: readonly WfRow[]): string {
  const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["path,state,triggers,permissions,jobs,note"];
  for (const r of rows) lines.push([r.path, r.state, r.triggers.join(" | "), r.permissions, r.jobs.map((j) => `${j.id}:${j.timeout ?? "none"}`).join(" | "), r.note].map(cell).join(","));
  return lines.join("\n");
}
