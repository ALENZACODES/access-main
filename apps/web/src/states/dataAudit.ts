/**
 * Data audit for place records. Operates on untrusted input and reports every record
 * that would otherwise be shown as known without a recorded source, open licence and
 * retrieval date. Run it from a data package's own tests to fail CI on bad data.
 */
import { FEATURE_IDS } from "./dataStatus";
import { daysBetween, isIsoDate, STALE_AFTER_DAYS, validateProvenance } from "./provenance";

export type DataViolationCode =
  | "not-an-object"
  | "missing-name"
  | "features-not-array"
  | "unknown-feature-id"
  | "duplicate-feature"
  | "bad-value"
  | "missing-provenance"
  | "licence-not-open"
  | "bad-date"
  | "bad-url"
  | "future-date"
  | "stale-detail";

export interface DataViolation {
  readonly severity: "error" | "warning";
  readonly code: DataViolationCode;
  readonly index: number;
  readonly place: string | null;
  readonly feature: string | null;
}

export interface DataAuditResult {
  readonly violations: readonly DataViolation[];
  readonly errors: number;
  readonly warnings: number;
  readonly ok: boolean;
}

const VALUES = new Set(["yes", "no", "partial", "unknown"]);

export function auditPlaces(places: readonly unknown[], today: string): DataAuditResult {
  const violations: DataViolation[] = [];
  places.forEach((raw, index) => {
    const push = (severity: "error" | "warning", code: DataViolationCode, place: string | null, feature: string | null): void =>
      void violations.push({ severity, code, index, place, feature });

    if (typeof raw !== "object" || raw === null) return push("error", "not-an-object", null, null);
    const rec = raw as Record<string, unknown>;
    const name = typeof rec.name === "string" && rec.name.trim() !== "" ? rec.name : null;
    if (name === null) push("error", "missing-name", null, null);
    if (!Array.isArray(rec.features)) return push("error", "features-not-array", name, null);

    const seen = new Set<string>();
    for (const f of rec.features as unknown[]) {
      const fr = (typeof f === "object" && f !== null ? f : {}) as Record<string, unknown>;
      const id = typeof fr.feature === "string" ? fr.feature : null;
      if (id === null || !(FEATURE_IDS as readonly string[]).includes(id)) {
        push("error", "unknown-feature-id", name, id);
        continue;
      }
      if (seen.has(id)) push("error", "duplicate-feature", name, id);
      seen.add(id);

      const value = fr.value;
      if (value === undefined || value === null || value === "unknown") continue;
      if (typeof value !== "string" || !VALUES.has(value)) {
        push("error", "bad-value", name, id);
        continue;
      }
      const p = validateProvenance(fr.provenance);
      if (!p.ok) {
        const code: DataViolationCode =
          p.reason === "licence-not-open" ? "licence-not-open"
          : p.reason === "bad-date" ? "bad-date"
          : p.reason === "bad-url" ? "bad-url"
          : "missing-provenance";
        push("error", code, name, id);
        continue;
      }
      if (isIsoDate(today)) {
        const age = daysBetween(p.value.retrievedOn, today);
        if (age < 0) push("error", "future-date", name, id);
        else if (age > STALE_AFTER_DAYS) push("warning", "stale-detail", name, id);
      }
    }
  });
  const errors = violations.filter((v) => v.severity === "error").length;
  return { violations, errors, warnings: violations.length - errors, ok: errors === 0 };
}

export class DataAuditError extends Error {
  constructor(readonly result: DataAuditResult) {
    super(
      `Place data audit failed with ${result.errors} error(s): ` +
        result.violations.filter((v) => v.severity === "error").map((v) => `#${v.index} ${v.place ?? "?"}/${v.feature ?? "-"} ${v.code}`).join(", "),
    );
    this.name = "DataAuditError";
  }
}

/** Throws DataAuditError if any record has an error. Warnings (stale) do not throw. */
export function assertPlacesClean(places: readonly unknown[], today: string): DataAuditResult {
  const r = auditPlaces(places, today);
  if (!r.ok) throw new DataAuditError(r);
  return r;
}
