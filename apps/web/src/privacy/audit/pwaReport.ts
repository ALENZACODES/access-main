// A plain-text report of the install-settings audit for a failure message and the CI log: the settings as read, the
// findings and which are accepted, and any difference from the register. It reads nothing itself. Node only, never shipped.

import { flattenConfig, formatPwaProblem, type PwaCompareProblem } from "./pwaCompare";
import type { PwaConfig } from "./pwaModel";
import type { PwaAcceptRow } from "./pwaRegister";
import { formatPwaFinding, type PwaFinding } from "./pwaRules";

export interface PwaReportInput {
  config: PwaConfig;
  accepted: readonly PwaAcceptRow[];
  findings: readonly PwaFinding[];
  problems: readonly PwaCompareProblem[];
}

/** The report, one line each, with no trailing line break. */
export function renderPwaReport(i: PwaReportInput): string {
  const flat = flattenConfig(i.config);
  const out: string[] = [];
  if (!i.config.found) out.push(`${i.config.path}: no call of VitePWA found.`);
  else out.push(`${i.config.path}: VitePWA called at line ${i.config.line}; ${Object.keys(flat).length} settings read.`);
  for (const k of Object.keys(flat).sort()) out.push(`  ${k} = ${flat[k]}`);
  out.push(`Findings: ${i.findings.length}.`);
  for (const f of i.findings) out.push(`  ${formatPwaFinding(f)}`);
  out.push(`Findings accepted as they stand: ${i.accepted.length}.`);
  for (const a of i.accepted) out.push(`  ${a.path} — ${a.code} ×${a.count}: ${a.reason}`);
  out.push(i.problems.length === 0 ? "Differences from the register: none." : `Differences from the register: ${i.problems.length}.`);
  for (const p of i.problems) out.push(`  ${formatPwaProblem(p)}`);
  return out.join("\n");
}

/** The settings as CSV: key, value, one row per setting, in key order. */
export function pwaCsv(c: PwaConfig): string {
  const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const flat = flattenConfig(c);
  return ["setting,value", ...Object.keys(flat).sort().map((k) => `${cell(k)},${cell(flat[k] as string)}`)].join("\n");
}
