import {
  MATRIX_OPERATIONS, MATRIX_TIERS, matrixStatus, validateMatrix,
  type MatrixCandidate, type MatrixCondition, type MatrixDocument,
  type MatrixOperation, type MatrixStatus, type MatrixTier,
} from "./recoveryDecisionMatrix";

/** Information coverage is not a determination of pack or location accessibility. */
export type CoverageFinding = "UNKNOWN" | "single-source" | "multiple-sources" | "disputed";
export interface CoverageLine {
  readonly packId: string;
  readonly operation: MatrixOperation;
  readonly finding: CoverageFinding;
  readonly sourceCount: number;
  readonly candidateCount: number;
  readonly reviewed: number;
  readonly deferred: number;
  readonly unknown: number;
  readonly conditions: readonly MatrixCondition[];
  readonly latestSourceDate: string | null;
  readonly tiers: readonly MatrixTier[];
}
export interface CoverageSummary {
  readonly knownPacks: number;
  readonly rows: number;
  readonly unknown: number;
  readonly disputed: number;
  readonly singleSource: number;
  readonly multipleSources: number;
  readonly reviewed: number;
  readonly deferred: number;
  readonly byTier: Readonly<Record<MatrixTier, number>>;
}
export interface CoverageRequest {
  readonly packIds?: readonly string[];
  readonly operations?: readonly MatrixOperation[];
}
export interface CoverageResult {
  readonly ok: boolean;
  readonly lines: readonly CoverageLine[];
  readonly summary: CoverageSummary;
}
export interface CoverageDetail {
  readonly id: string;
  readonly packId: string;
  readonly operation: MatrixOperation;
  readonly condition: MatrixCondition;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: MatrixTier;
  readonly status: MatrixStatus;
}
function emptySummary(): CoverageSummary {
  return {
    knownPacks: 0, rows: 0, unknown: 0, disputed: 0, singleSource: 0,
    multipleSources: 0, reviewed: 0, deferred: 0,
    byTier: { UNKNOWN: 0, "user-observation": 0, "source-document": 0, "file-metadata": 0 },
  };
}
function sourceIdentity(item: MatrixCandidate): string {
  return `${item.source.name}\u0000${item.source.licence}\u0000${item.source.date}\u0000${item.source.reference}`;
}
function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
function rowFor(document: MatrixDocument, packId: string, operation: MatrixOperation, entries: readonly MatrixCandidate[]): CoverageLine {
  const conditions = unique(entries.map((item) => item.condition));
  const distinct = new Set(entries.filter((item) => item.condition !== "UNKNOWN").map(sourceIdentity));
  const known = conditions.filter((value) => value !== "UNKNOWN");
  const hasDispute = known.length > 1;
  const finding: CoverageFinding = hasDispute ? "disputed" :
    conditions.includes("UNKNOWN") || distinct.size === 0 ? "UNKNOWN" :
      distinct.size > 1 ? "multiple-sources" : "single-source";
  const dates = entries.map((item) => item.source.date).sort();
  return {
    packId, operation, finding, sourceCount: distinct.size,
    candidateCount: entries.length,
    reviewed: entries.filter((item) => matrixStatus(document, item.id) === "reviewed").length,
    deferred: entries.filter((item) => matrixStatus(document, item.id) === "deferred").length,
    unknown: entries.filter((item) => item.condition === "UNKNOWN").length,
    conditions, latestSourceDate: dates.at(-1) ?? null,
    tiers: MATRIX_TIERS.filter((tier) => entries.some((item) => item.source.tier === tier)),
  };
}
/** Each requested pack/operation pair is retained even with no records. */
export function decisionCoverage(document: MatrixDocument, request: CoverageRequest = {}): CoverageResult {
  if (!validateMatrix(document).ok) return { ok: false, lines: [], summary: emptySummary() };
  const packs = unique(request.packIds ?? document.candidates.map((item) => item.packId));
  const operations = unique(request.operations ?? MATRIX_OPERATIONS);
  if (packs.some((id) => typeof id !== "string" || id.length === 0) ||
    operations.some((op) => !MATRIX_OPERATIONS.includes(op))) {
    return { ok: false, lines: [], summary: emptySummary() };
  }
  const lines: CoverageLine[] = [];
  for (const packId of packs.sort((a, b) => a.localeCompare(b, "en"))) {
    for (const operation of MATRIX_OPERATIONS) {
      if (!operations.includes(operation)) continue;
      const entries = document.candidates.filter((item) => item.packId === packId && item.operation === operation);
      lines.push(rowFor(document, packId, operation, entries));
    }
  }
  const byTier = {} as Record<MatrixTier, number>;
  for (const tier of MATRIX_TIERS) byTier[tier] = document.candidates.filter((item) => item.source.tier === tier).length;
  return {
    ok: true, lines,
    summary: {
      knownPacks: packs.length, rows: lines.length,
      unknown: lines.filter((item) => item.finding === "UNKNOWN").length,
      disputed: lines.filter((item) => item.finding === "disputed").length,
      singleSource: lines.filter((item) => item.finding === "single-source").length,
      multipleSources: lines.filter((item) => item.finding === "multiple-sources").length,
      reviewed: lines.reduce((sum, item) => sum + item.reviewed, 0),
      deferred: lines.reduce((sum, item) => sum + item.deferred, 0),
      byTier,
    },
  };
}
export function coverageDetails(document: MatrixDocument, packId: string, operation?: MatrixOperation): CoverageDetail[] {
  if (!validateMatrix(document).ok) return [];
  return document.candidates.filter((item) => item.packId === packId &&
    (operation === undefined || item.operation === operation)).map((item) => ({
    id: item.id, packId: item.packId, operation: item.operation, condition: item.condition,
    source: item.source.name, licence: item.source.licence, date: item.source.date,
    tier: item.source.tier, status: matrixStatus(document, item.id),
  }));
}
/** A source's report is kept separate from a content readiness assertion. */
export function coverageWarnings(lines: readonly CoverageLine[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (line.finding === "disputed") result.push(`${line.packId}/${line.operation}:conflict`);
    if (line.finding === "UNKNOWN") result.push(`${line.packId}/${line.operation}:UNKNOWN`);
    if (line.deferred > 0) result.push(`${line.packId}/${line.operation}:deferred`);
  }
  return result;
}
