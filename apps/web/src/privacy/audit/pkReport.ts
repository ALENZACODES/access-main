// A plain-text report of the pack audit for a failure message and the CI log. It reads nothing itself.

import { formatPkProblem, type PkProblem, type PkRead } from "./pkCompare";
import type { PkAcceptRow } from "./pkRegister";
import { countByCode, formatPkFinding } from "./pkRules";

export interface PkReportInput {
  packs: readonly PkRead[];
  accepted: readonly PkAcceptRow[];
  problems: readonly PkProblem[];
}

/** The report, one line each, with no trailing line break. */
export function renderPkReport(i: PkReportInput): string {
  const out: string[] = [`Packs read: ${i.packs.length}.`];
  for (const p of i.packs) {
    out.push(`${p.id}: ${p.hosts.length} hosts, ${p.sources.length} sources in the manifest, ${p.findings.length} findings.`);
    for (const [code, n] of countByCode(p.findings)) out.push(`  ${code} ×${n}`);
    for (const f of p.findings) out.push(`    ${formatPkFinding(f)}`);
  }
  out.push(`Findings accepted as they stand: ${i.accepted.length}.`);
  for (const a of i.accepted) out.push(`  ${a.pack} — ${a.code} ×${a.count}`);
  out.push(i.problems.length === 0 ? "Differences from the register: none." : `Differences from the register: ${i.problems.length}.`);
  for (const p of i.problems) out.push(`  ${formatPkProblem(p)}`);
  return out.join("\n");
}
