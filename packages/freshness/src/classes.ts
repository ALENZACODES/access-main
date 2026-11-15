/**
 * Field-level freshness policy.
 *
 * Durations are elapsed milliseconds, not calendar-month calculations.
 * The defaults are suggestions, not assertions that a field remains accurate
 * throughout its freshness window.
 *
 * Directory and benefits record audits belong to G5, not this package.
 */

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export const DEFAULT_EXPIRY_MS = {
  elevator: 4 * HOUR,
  condition: 24 * HOUR,
  washroom: 180 * DAY,
  geometry: 365 * DAY,
  operatorHours: 90 * DAY,
} as const;

export type ClassId = keyof typeof DEFAULT_EXPIRY_MS;

/**
 * Explicit field identifiers avoid mistaking an unclassified field for a
 * current field. Additional identifiers may be registered by the caller.
 */
export const DEFAULT_FIELD_CLASSES = {
  elevator_status: "elevator",
  lift_status: "elevator",
  elevator_availability: "elevator",
  lift_availability: "elevator",
  curb_snowbank: "condition",
  snowbank_condition: "condition",
  path_condition: "condition",
  sidewalk_condition: "condition",
  surface_condition: "condition",
  transit_condition: "condition",
  live_condition: "condition",
  washroom_usability: "washroom",
  washroom_accessibility: "washroom",
  washroom_condition: "washroom",
  door_width: "geometry",
  doorway_width: "geometry",
  corridor_width: "geometry",
  passage_width: "geometry",
  clear_width: "geometry",
  ramp_width: "geometry",
  ramp_slope: "geometry",
  threshold_height: "geometry",
  turning_radius: "geometry",
  measured_geometry: "geometry",
  operator_hours: "operatorHours",
  opening_hours: "operatorHours",
  operating_hours: "operatorHours",
  operator_claimed_hours: "operatorHours",
} as const satisfies Record<string, ClassId>;

export type FreshnessState = "current" | "needs-check" | "unknown";

export type EvidenceTier = 0 | 1 | 2 | 3;

/**
 * The existing accessibility field shape. This package does not create,
 * alter, validate, or promote evidence tiers.
 */
export interface AccessibilityFact {
  value: unknown;
  source_id: string;
  licence: string;
  retrieved_at: string | null;
  tier: EvidenceTier;
  source_key?: string;
  raw?: unknown;
  derived?: unknown;
}

export interface FreshnessResult {
  state: FreshnessState;
  lastChecked: string | null;
  expiresAt: string | null;
}

export interface FreshnessPolicy {
  durations?: Partial<Record<ClassId, number>>;
  fieldClasses?: Readonly<Record<string, ClassId>>;
}

const UNKNOWN: FreshnessResult = {
  state: "unknown",
  lastChecked: null,
  expiresAt: null,
};

function validTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;

  // A date without a timezone is not an unambiguous instant.
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return null;
  }

  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp : null;
}

export function classForField(
  field: string,
  policy: FreshnessPolicy = {},
): ClassId | null {
  const classes: Readonly<Record<string, ClassId>> = {
    ...DEFAULT_FIELD_CLASSES,
    ...policy.fieldClasses,
  };

  return Object.prototype.hasOwnProperty.call(classes, field)
    ? classes[field] ?? null
    : null;
}

export function durationFor(
  classId: ClassId,
  policy: FreshnessPolicy = {},
): number | null {
  const duration = policy.durations?.[classId] ?? DEFAULT_EXPIRY_MS[classId];

  // A zero, negative, fractional, or infinite duration is not a valid policy.
  if (!Number.isSafeInteger(duration) || duration <= 0) return null;

  return duration;
}

/**
 * Evaluate a field at an injected instant.
 *
 * Expiry is inclusive: at expiresAt the field already needs checking.
 * A future retrieval date is unknown rather than evidence of freshness.
 * A tier-0 draft must never become a displayed fact.
 *
 * No network calls, background clocks, or data mutations occur here.
 */
export function evaluate(
  fact: AccessibilityFact | null | undefined,
  now: Date,
  classId: ClassId,
  policy: FreshnessPolicy = {},
): FreshnessResult {
  if (!fact) return UNKNOWN;
  if (fact.value === "UNKNOWN" || fact.value === null || fact.value === undefined) {
    return UNKNOWN;
  }
  if (fact.tier === 0) return UNKNOWN;
  if (!fact.source_id || !fact.licence) return UNKNOWN;

  const checked = validTimestamp(fact.retrieved_at);
  if (!checked) return UNKNOWN;
  if (checked.getTime() > now.getTime()) return UNKNOWN;

  const duration = durationFor(classId, policy);
  if (duration === null) return UNKNOWN;

  const expiresAt = new Date(checked.getTime() + duration).toISOString();
  const lastChecked = typeof fact.retrieved_at === "string" ? fact.retrieved_at : checked.toISOString();
  if (now.getTime() >= checked.getTime() + duration) {
    return { state: "needs-check", lastChecked, expiresAt };
  }
  return { state: "current", lastChecked, expiresAt };
}
