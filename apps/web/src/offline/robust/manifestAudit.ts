import { type RegionManifest, type Provenance } from "./regionDownload.ts";

/** Explicitly supported, redistributable data licences; no arbitrary URL trust. */
export const OPEN_LICENCES = [
  "CC0 1.0",
  "CC BY 4.0",
  "CC BY-SA 4.0",
  "ODC-BY 1.0",
  "PDDL 1.0",
  "Open Government Licence – Ontario",
  "Open Government Licence - Ontario",
  "Open Government Licence – Canada",
  "Open Government Licence - Canada",
] as const;

export type AuditCode =
  | "region-id"
  | "cell-id"
  | "duplicate-id"
  | "size"
  | "size-limit"
  | "total-limit"
  | "source"
  | "licence"
  | "date"
  | "future-date"
  | "unsafe-text"
  | "too-many-cells";

export type AuditSeverity = "error" | "notice";
export interface AuditFinding {
  readonly code: AuditCode;
  readonly severity: AuditSeverity;
  readonly cellId: string | null;
}
export interface ManifestAudit {
  readonly regionId: string;
  readonly ready: boolean;
  readonly findings: readonly AuditFinding[];
  readonly totalBytes: number | null;
  readonly count: number;
  readonly sources: readonly Provenance[];
}
export interface AuditLimits {
  readonly maxCellBytes: number;
  readonly maxRegionBytes: number;
  readonly maxCells: number;
}

export const DEFAULT_AUDIT_LIMITS: AuditLimits = {
  maxCellBytes: 256 * 1024 * 1024,
  maxRegionBytes: 2 * 1024 * 1024 * 1024,
  maxCells: 50_000,
};

function safeLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function canonicalDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString().slice(0, 10) === value ? date.valueOf() : null;
}

function forbiddenCharacters(value: string): boolean {
  // Controls and bidirectional overrides could misrepresent provenance.
  // Newlines also make local audit exports ambiguous.
  return /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function identifierSafe(value: string): boolean {
  return value.length > 0 && value.length <= 160 &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) &&
    value !== "." && value !== ".." && !value.includes("..");
}

function add(
  findings: AuditFinding[],
  code: AuditCode,
  cellId: string | null,
  severity: AuditSeverity = "error",
): void {
  findings.push({ code, cellId, severity });
}

function sourceKey(provenance: Provenance): string {
  return JSON.stringify([
    provenance.source,
    provenance.licence,
    provenance.date,
  ]);
}

/**
 * Pure preflight for manually selected downloads. This guards data inclusion;
 * it says nothing about a place's physical accessibility. Callers must not
 * infer accessibility from a valid metadata record.
 *
 * `today` is supplied by the host to keep tests deterministic. Future dates
 * are rejected because they cannot describe a published source yet.
 */
export function auditManifest(
  manifest: RegionManifest,
  today: string,
  limits: AuditLimits = DEFAULT_AUDIT_LIMITS,
): ManifestAudit {
  if (!safeLimit(limits.maxCellBytes) || !safeLimit(limits.maxRegionBytes) ||
    !safeLimit(limits.maxCells)) {
    throw new RangeError("Invalid audit limits");
  }
  const todayTime = canonicalDate(today);
  if (todayTime === null) throw new RangeError("Invalid audit date");
  const findings: AuditFinding[] = [];
  const sources = new Map<string, Provenance>();
  const seen = new Set<string>();
  let totalBytes = 0;

  if (!identifierSafe(manifest.regionId)) add(findings, "region-id", null);
  if (manifest.cells.length > limits.maxCells) {
    add(findings, "too-many-cells", null);
  }
  for (const cell of manifest.cells) {
    const id = cell.id;
    if (!identifierSafe(id)) add(findings, "cell-id", id);
    if (seen.has(id)) add(findings, "duplicate-id", id);
    seen.add(id);
    if (!Number.isSafeInteger(cell.bytes) || cell.bytes < 0) {
      add(findings, "size", id);
    } else {
      if (cell.bytes > limits.maxCellBytes) add(findings, "size-limit", id);
      totalBytes += cell.bytes;
      if (!Number.isSafeInteger(totalBytes)) add(findings, "total-limit", null);
    }
    const provenance = cell.provenance;
    if (!provenance.source.trim() || provenance.source.length > 500) {
      add(findings, "source", id);
    }
    if (!OPEN_LICENCES.some((licence) => licence === provenance.licence)) {
      add(findings, "licence", id);
    }
    const when = canonicalDate(provenance.date);
    if (when === null) add(findings, "date", id);
    else if (when > todayTime) add(findings, "future-date", id);
    if ([id, provenance.source, provenance.licence, provenance.date]
      .some(forbiddenCharacters)) {
      add(findings, "unsafe-text", id);
    }
    if (provenance.source.trim() && provenance.licence.trim() && when !== null) {
      sources.set(sourceKey(provenance), { ...provenance });
    }
  }
  if (totalBytes > limits.maxRegionBytes) add(findings, "total-limit", null);
  return {
    regionId: manifest.regionId,
    ready: findings.every((finding) => finding.severity !== "error"),
    findings,
    totalBytes: Number.isSafeInteger(totalBytes) ? totalBytes : null,
    count: manifest.cells.length,
    sources: [...sources.values()].sort((a, b) =>
      sourceKey(a).localeCompare(sourceKey(b))),
  };
}

export function auditCounts(audit: ManifestAudit): {
  readonly errors: number;
  readonly notices: number;
  readonly sources: number;
} {
  return {
    errors: audit.findings.filter((finding) => finding.severity === "error").length,
    notices: audit.findings.filter((finding) => finding.severity === "notice").length,
    sources: audit.sources.length,
  };
}

/** Conservative guard for callers who require a valid open-licence manifest. */
export function requireAuditedManifest(
  manifest: RegionManifest,
  today: string,
): RegionManifest {
  const audit = auditManifest(manifest, today);
  if (!audit.ready) throw new Error("Manifest did not pass offline data checks");
  return manifest;
}

/** Locally useful diagnostic codes, deliberately independent of language. */
export function findingCounts(audit: ManifestAudit): ReadonlyMap<AuditCode, number> {
  const counts = new Map<AuditCode, number>();
  for (const finding of audit.findings) {
    counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
  }
  return counts;
}

export function groupedSources(
  audit: ManifestAudit,
): ReadonlyMap<string, readonly Provenance[]> {
  const groups = new Map<string, Provenance[]>();
  for (const source of audit.sources) {
    const list = groups.get(source.licence) ?? [];
    list.push(source);
    groups.set(source.licence, list);
  }
  return groups;
}
