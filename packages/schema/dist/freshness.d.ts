/**
 * Freshness rules from Part 1 section 5.5 and Part 3 Tables T3-12 and T3-15.
 * A stale value stays in the headline until it is older than 730 days.
 * Status observations leave the headline after the 30-day snapshot window.
 * Thresholds the plan marks ESTIMATE are flagged estimate: true.
 */
export declare const HEADLINE_MAX_AGE_DAYS = 730;
export declare const STATUS_SNAPSHOT_DAYS = 30;
export declare const WINTER_MONTHS: readonly [11, 12, 1, 2, 3, 4];
export interface FreshnessJudgement {
    stale: boolean;
    excludeFromHeadline: boolean;
    winterUnverified: boolean;
    ageDays: number | null;
    reason: string;
    estimate: boolean;
}
export declare function parseDay(value: string | undefined): Date | null;
export declare function ageInDays(from: string | undefined, asOf: string): number | null;
export declare function judgeFreshness(input: {
    recordType: string;
    counting: "canonical" | "status_snapshot" | "derived_product" | "local" | "register";
    tier: number | string;
    observedAt?: string;
    asOf: string;
}): FreshnessJudgement;
