/**
 * A report on the places saved on this device: what they cover, how old they are, which records
 * have problems or gaps, which may be listed twice, and where they come from.
 *
 * It pulls together tools that already exist (audit, coverage, freshness, credits, export) and adds
 * no rule of its own about the data. The wording says what is in the pack and what is missing. It
 * never says the data is correct, current or complete, and an empty field stays UNKNOWN.
 */
import { type PackAuditResult, type PackCoverage, auditPackPlaces, computePackCoverage, packCoverageLines } from "./packAudit";
import { buildCredits, creditRecordsFromPack, creditsToText } from "./dataCredits";
import { csvCell } from "./exportData";
import { type GapResult, computeGaps, gapLines } from "./packGaps";
import { type OutlierResult, findPositionOutliers, MAX_OUTLIERS_LISTED, OUTLIER_KM } from "./packOutliers";
import { type DuplicateResult, findPossibleDuplicates, MAX_PAIRS_LISTED } from "./packDuplicates";
import { type ExportRecord, packExportSummary, readExportRecords } from "./packExport";
import { type Freshness, computeFreshness, freshnessLines } from "./packFreshness";
import { type IssueGroup, auditSummary, groupIssues, groupLine, severityLabel } from "./packIssueText";
import { parsePackPlaces } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

/** empty: nothing to report. clean: no problem and no gap found. gaps: only gaps or possible pairs. problems: at least one error. */
export type ReportLevel = "empty" | "clean" | "gaps" | "problems";

export interface PackReport {
  readonly today: string;
  readonly level: ReportLevel;
  readonly audit: PackAuditResult;
  readonly coverage: PackCoverage;
  readonly freshness: Freshness;
  readonly groups: readonly IssueGroup[];
  readonly duplicates: DuplicateResult;
  readonly outliers: OutlierResult;
  readonly gaps: GapResult;
  /** Records that could be read, for the file downloads. */
  readonly records: readonly ExportRecord[];
  /** Records left out of `records` because they could not be read safely. */
  readonly dropped: number;
  /** The raw `places` array, kept so credits can be built from the same input. */
  readonly rawPlaces: unknown;
}

export const REPORT_FILENAMES: Readonly<Record<Locale, { text: string; issues: string }>> = {
  en: { text: "pack-report.txt", issues: "pack-issues.csv" },
  fr: { text: "rapport-du-pack.txt", issues: "problemes-du-pack.csv" },
};

export const ISSUES_CSV_HEADER = ["code", "severity", "position", "id"] as const;

const EMPTY_AUDIT: PackAuditResult = { checked: 0, issues: [], errors: 0, warnings: 0, clean: true };

/** Build the report from the raw `places` of a stored pack. Anything that is not an array yields an empty report. */
export function buildPackReport(rawPlaces: unknown, today: string): PackReport {
  const raw: readonly unknown[] = Array.isArray(rawPlaces) ? (rawPlaces as unknown[]) : [];
  const audit = raw.length === 0 ? EMPTY_AUDIT : auditPackPlaces(raw, today);
  const places = parsePackPlaces(raw).places;
  const duplicates = findPossibleDuplicates(places);
  const outliers = findPositionOutliers(places);
  const { records, dropped } = readExportRecords(raw);
  let level: ReportLevel = "clean";
  if (raw.length === 0) level = "empty";
  else if (audit.errors > 0) level = "problems";
  else if (audit.warnings > 0 || duplicates.total > 0 || outliers.total > 0) level = "gaps";
  return {
    today,
    level,
    audit,
    coverage: computePackCoverage(places, today),
    freshness: computeFreshness(places, today),
    groups: groupIssues(audit.issues),
    duplicates,
    outliers,
    gaps: computeGaps(places),
    records,
    dropped,
    rawPlaces: raw,
  };
}

/** The line that names the overall result, with no claim about whether the contents are right. */
export function reportHeadline(report: PackReport, locale: Locale): string {
  switch (report.level) {
    case "empty":
      return t(locale, "There are no saved places to report on.", "Il n’y a aucun lieu enregistré à signaler.");
    case "clean":
      return auditSummary(report.audit, locale);
    default:
      return [auditSummary(report.audit, locale), duplicatesHeadline(report.duplicates, locale), outliersHeadline(report.outliers, locale)].filter((x) => x !== "").join(" ");
  }
}

export function duplicatesHeadline(d: DuplicateResult, locale: Locale): string {
  if (d.total === 0) return "";
  return t(
    locale,
    `${d.total} possible ${d.total === 1 ? "pair" : "pairs"} of places with the same name close together.`,
    `${d.total} ${d.total === 1 ? "paire possible" : "paires possibles"} de lieux de même nom, proches l’un de l’autre.`,
  );
}

export function outliersHeadline(o: OutlierResult, locale: Locale): string {
  if (o.total === 0) return "";
  return t(
    locale,
    `${o.total} ${o.total === 1 ? "position is" : "positions are"} more than ${OUTLIER_KM} km from the middle of the pack.`,
    `${o.total} ${o.total === 1 ? "position est" : "positions sont"} à plus de ${OUTLIER_KM} km du centre du pack.`,
  );
}

/** One line per position far from the rest, farthest first. */
export function outlierLines(o: OutlierResult, locale: Locale): string[] {
  const lines = o.outliers.map((x) => t(locale, `${x.id}, ${x.km} km away`, `${x.id}, à ${x.km} km`));
  if (o.total > o.outliers.length) lines.push(t(locale, `${o.total - o.outliers.length} more not listed (the list stops at ${MAX_OUTLIERS_LISTED}).`, `${o.total - o.outliers.length} autres non listées (la liste s’arrête à ${MAX_OUTLIERS_LISTED}).`));
  return lines;
}

/** One line per possible pair, with the two ids and the distance. */
export function duplicateLines(d: DuplicateResult, locale: Locale): string[] {
  const lines = d.pairs.map((p) => t(locale, `${p.a} and ${p.b}, ${p.metres} m apart`, `${p.a} et ${p.b}, à ${p.metres} m l’un de l’autre`));
  if (d.total > d.pairs.length) lines.push(t(locale, `${d.total - d.pairs.length} more not listed (the list stops at ${MAX_PAIRS_LISTED}).`, `${d.total - d.pairs.length} autres non listées (la liste s’arrête à ${MAX_PAIRS_LISTED}).`));
  return lines;
}

/** The ids and positions that go with a group, as one short line. */
export function sampleLine(g: IssueGroup, locale: Locale): string {
  const ids = g.sampleIds.length > 0 ? g.sampleIds.join(", ") : "";
  const positions = g.sampleIndexes.map((i) => i + 1).join(", ");
  const shown = g.sampleIndexes.length;
  const more = g.count > shown ? t(locale, `, and ${g.count - shown} more`, `, et ${g.count - shown} autres`) : "";
  if (ids !== "") return t(locale, `Records: ${ids}${more}`, `Fiches : ${ids}${more}`);
  return t(locale, `Entry numbers: ${positions}${more}`, `Numéros d’entrée : ${positions}${more}`);
}

function section(title: string, lines: readonly string[]): string[] {
  return ["", title, "-".repeat(Math.min(title.length, 60)), ...lines];
}

/** The whole report as plain text, for a file. Starts with the date it was made and what it covers. */
export function packReportToText(report: PackReport, locale: Locale): string {
  const title = t(locale, "Report on the places saved on this device", "Rapport sur les lieux enregistrés sur cet appareil");
  const out: string[] = [title, "=".repeat(Math.min(title.length, 60)), packExportSummary(report.records.length, report.dropped, locale, report.today), reportHeadline(report, locale)];
  if (report.level === "empty") return out.join("\n") + "\n";
  out.push(...section(t(locale, "What the records cover", "Ce que couvrent les fiches"), packCoverageLines(report.coverage, locale)));
  out.push(...section(t(locale, "How old the records are", "Ancienneté des fiches"), freshnessLines(report.freshness, locale)));
  if (report.groups.length > 0) {
    const lines: string[] = [];
    for (const g of report.groups) lines.push(`[${severityLabel(g.severity, locale)}] ${groupLine(g, locale)}`, `  ${sampleLine(g, locale)}`);
    out.push(...section(t(locale, "Problems and gaps found", "Problèmes et lacunes repérés"), lines));
  }
  if (report.duplicates.total > 0) out.push(...section(t(locale, "Possible duplicates", "Doublons possibles"), duplicateLines(report.duplicates, locale)));
  if (report.outliers.total > 0) out.push(...section(t(locale, "Positions far from the rest", "Positions éloignées des autres"), outlierLines(report.outliers, locale)));
  if (report.gaps.rows.length > 0) out.push(...section(t(locale, "What each kind of place leaves out", "Ce que chaque type de lieu laisse de côté"), gapLines(report.gaps, locale)));
  const credits = buildCredits(creditRecordsFromPack(report.rawPlaces), report.today);
  out.push("", creditsToText(credits, locale, report.today));
  return out.join("\n") + "\n";
}

/** One row per problem or gap: code, severity, entry number from 1, and the id when there is one. */
export function issuesToCsv(report: PackReport, opts: { readonly bom?: boolean } = {}): string {
  const rows: string[][] = [[...ISSUES_CSV_HEADER]];
  for (const i of report.audit.issues) rows.push([i.code, i.severity, String(i.index + 1), i.id ?? ""]);
  return (opts.bom ? "﻿" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
