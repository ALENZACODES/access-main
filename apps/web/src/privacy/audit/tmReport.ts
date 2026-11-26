// A plain-text report of the audit of time, for the log of a failed test and for people reading it. It names what
// was read, what was found and what differs from the accepted list. It says nothing about what it could not check.

import type { TmProblem } from "./tmCompare";
import { formatTmProblems } from "./tmCompare";
import { TM_CODES, countFindings, type TmCode, type TmFinding } from "./tmRules";
import { TM_KINDS, countKinds, type TmKind, type TmSite } from "./tmScan";

export interface TmReportInput {
  files: number;
  sites: readonly TmSite[];
  findings: readonly TmFinding[];
  problems: readonly TmProblem[];
}

const KIND_WORDS: Record<TmKind, string> = {
  "clock-ms": "clock reads",
  "timer-hires": "fine timers",
  "stamp-full": "full times written",
  "stamp-cut": "shortened times written",
  "tz-read": "time zone reads",
  "local-getter": "getters in the time zone of the device",
  "local-format": "dates written in the format of the device",
  "utc-format": "dates written in UTC",
};

export function renderTmReport(input: TmReportInput): string {
  const lines: string[] = [];
  lines.push(`Read ${input.files} files of the App's own code.`);
  const kinds = countKinds(input.sites);
  lines.push(`Sites: ${input.sites.length} (${TM_KINDS.filter((k) => kinds[k] > 0).map((k) => `${kinds[k]} ${KIND_WORDS[k]}`).join(", ") || "none"}).`);
  const byCode = new Map<TmCode, number>();
  for (const f of input.findings) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
  const places = countFindings(input.findings).length;
  lines.push(`Findings: ${input.findings.length} in ${places} ${places === 1 ? "place" : "places"}.`);
  for (const code of TM_CODES) if ((byCode.get(code) ?? 0) > 0) lines.push(`  ${code}: ${byCode.get(code)}`);
  if (input.problems.length === 0) lines.push("Differences from the accepted list: none.");
  else {
    lines.push(`Differences from the accepted list: ${input.problems.length}.`);
    for (const l of formatTmProblems(input.problems).split("\n")) lines.push(`  ${l}`);
  }
  return `${lines.join("\n")}\n`;
}

/** The sites in a folder, as lines, for a person who wants to see what the audit read there. */
export function renderFolder(sites: readonly TmSite[], folder: string): string {
  const prefix = `apps/web/src/${folder}/`;
  const mine = sites.filter((s) => s.path.startsWith(prefix));
  if (mine.length === 0) return `${folder}: no sites.\n`;
  return `${folder}: ${mine.length} ${mine.length === 1 ? "site" : "sites"}\n${mine.map((s) => `  ${s.path.slice(prefix.length)}:${s.line} ${s.kind}: ${s.detail}${s.inText ? " (written into text)" : ""}`).join("\n")}\n`;
}
