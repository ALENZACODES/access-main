import { isLiveTier, isVerificationTier, type VerificationTier } from "./tiers.ts";

export interface Provenance {
  source_name: string;
  source_url: string | null;
  licence: string;
  licence_url: string | null;
  /** ISO date (YYYY-MM-DD) or date-time. The day the source says the fact is from. */
  source_date: string;
  /** ISO date-time when this copy was stored. */
  retrieved_at: string;
  verification_tier: VerificationTier;
  freshness: "unknown" | "current" | "stale";
}

export interface FieldIssue {
  field: string;
  code: string;
}

const FORBIDDEN_KEY = /^(diagnosis|injurylevel|ais|aisgrade|completeness|bladder|bowel|prescription|medication|medications|healthcard|ohip|locationhistory|password|token|apikey|secret)$/;

export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

export function findForbiddenKeys(value: unknown, path = ""): FieldIssue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`));
  }
  if (value === null || typeof value !== "object") return [];
  const issues: FieldIssue[] = [];
  for (const [key, child] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEY.test(normaliseKey(key))) {
      issues.push({ field: here, code: "forbidden_field" });
    }
    issues.push(...findForbiddenKeys(child, here));
  }
  return issues;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return false;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === day;
}

export function validateProvenance(provenance: Provenance | undefined, fieldPrefix = "provenance"): FieldIssue[] {
  if (!provenance) return [{ field: fieldPrefix, code: "missing_provenance" }];
  const issues: FieldIssue[] = [];
  if (!provenance.source_name?.trim()) issues.push({ field: `${fieldPrefix}.source_name`, code: "missing_source" });
  if (!provenance.licence?.trim()) issues.push({ field: `${fieldPrefix}.licence`, code: "missing_licence" });
  if (!provenance.source_date || !isIsoDate(provenance.source_date)) {
    issues.push({ field: `${fieldPrefix}.source_date`, code: "invalid_date" });
  }
  if (!provenance.retrieved_at || !isIsoDate(provenance.retrieved_at)) {
    issues.push({ field: `${fieldPrefix}.retrieved_at`, code: "invalid_date" });
  }
  if (!isVerificationTier(provenance.verification_tier)) {
    issues.push({ field: `${fieldPrefix}.verification_tier`, code: "invalid_tier" });
  } else if (isLiveTier(provenance.verification_tier)) {
    issues.push({ field: `${fieldPrefix}.verification_tier`, code: "live_status_not_cached" });
  }
  if (provenance.freshness !== "unknown" && provenance.freshness !== "current" && provenance.freshness !== "stale") {
    issues.push({ field: `${fieldPrefix}.freshness`, code: "invalid_enum" });
  }
  issues.push(...findForbiddenKeys(provenance, fieldPrefix));
  return issues;
}
