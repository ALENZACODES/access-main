import { formatReport, type Finding, type FindingKind, type NarrowReport } from "./audit.ts";

export interface AllowlistItem {
  readonly route: string;
  readonly language: "en" | "fr" | "*";
  readonly kind: FindingKind;
  readonly idIncludes: string;
  readonly reason: string;
}

/**
 * Each leftover 320px reflow or 44px target finding must have a reason.
 * Prefer fixing the layout. An empty list means every finding fails CI.
 */
export const NARROW_ALLOWLIST: readonly AllowlistItem[] = [
  // No leftovers are currently excused.
];

export function isAllowlisted(route: string, language: "en" | "fr", finding: Finding): boolean {
  return NARROW_ALLOWLIST.some(
    (item) =>
      (item.route === route || item.route === "*") &&
      (item.language === language || item.language === "*") &&
      item.kind === finding.kind &&
      finding.id.includes(item.idIncludes),
  );
}

export function unexplainedFindings(report: NarrowReport, language: "en" | "fr"): Finding[] {
  return report.findings.filter((finding) => !isAllowlisted(report.route, language, finding));
}

export function formatUnexplained(reports: readonly NarrowReport[], language: "en" | "fr"): string[] {
  const lines: string[] = [];
  for (const report of reports) {
    const leftover = { ...report, findings: unexplainedFindings(report, language) };
    lines.push(...formatReport(leftover, language));
  }
  return lines;
}
