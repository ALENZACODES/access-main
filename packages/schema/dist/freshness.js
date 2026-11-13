/**
 * Freshness rules from Part 1 section 5.5 and Part 3 Tables T3-12 and T3-15.
 * A stale value stays in the headline until it is older than 730 days.
 * Status observations leave the headline after the 30-day snapshot window.
 * Thresholds the plan marks ESTIMATE are flagged estimate: true.
 */
export const HEADLINE_MAX_AGE_DAYS = 730;
export const STATUS_SNAPSHOT_DAYS = 30;
export const WINTER_MONTHS = [11, 12, 1, 2, 3, 4];
export function parseDay(value) {
    if (!value)
        return null;
    const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!day)
        return null;
    const date = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    return Number.isNaN(date.getTime()) ? null : date;
}
export function ageInDays(from, asOf) {
    const start = parseDay(from);
    const end = parseDay(asOf);
    if (!start || !end)
        return null;
    return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}
function layerThreshold(recordType, tier) {
    if (typeof tier === "number" && tier === 1)
        return { days: 180, estimate: true };
    if (typeof tier === "number" && tier === 2 && recordType !== "washroom")
        return { days: 180, estimate: true };
    switch (recordType) {
        case "washroom":
        case "charging":
        case "benefits_directory":
            return { days: 90, estimate: true };
        case "outage":
            return { days: STATUS_SNAPSHOT_DAYS, estimate: false };
        default:
            return { days: 365, estimate: false };
    }
}
export function judgeFreshness(input) {
    const ageDays = ageInDays(input.observedAt, input.asOf);
    const observed = parseDay(input.observedAt);
    const asOf = parseDay(input.asOf);
    const winterUnverified = input.recordType === "segment" &&
        observed !== null &&
        asOf !== null &&
        WINTER_MONTHS.includes(asOf.getUTCMonth() + 1) &&
        !WINTER_MONTHS.includes(observed.getUTCMonth() + 1);
    if (ageDays === null) {
        return {
            stale: true,
            excludeFromHeadline: true,
            winterUnverified,
            ageDays: null,
            reason: "undated",
            estimate: false,
        };
    }
    if (input.counting === "status_snapshot" && ageDays > STATUS_SNAPSHOT_DAYS) {
        return {
            stale: true,
            excludeFromHeadline: true,
            winterUnverified,
            ageDays,
            reason: "outside_status_snapshot",
            estimate: false,
        };
    }
    if (ageDays > HEADLINE_MAX_AGE_DAYS) {
        return {
            stale: true,
            excludeFromHeadline: true,
            winterUnverified,
            ageDays,
            reason: "older_than_730_days",
            estimate: false,
        };
    }
    const threshold = layerThreshold(input.recordType, input.tier);
    const stale = ageDays > threshold.days;
    return {
        stale,
        excludeFromHeadline: false,
        winterUnverified,
        ageDays,
        reason: stale ? "past_layer_threshold_kept_in_headline" : "current",
        estimate: threshold.estimate,
    };
}
//# sourceMappingURL=freshness.js.map