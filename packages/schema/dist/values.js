/** Tokens that mean "no collected value" under Table T3-12. */
const GAP_TOKENS = new Set([
    "unknown",
    "n/a",
    "na",
    "null",
    "not_applicable",
    "not applicable",
    "not assessed",
    "unknown_recorded",
]);
export function isGapToken(value) {
    if (value === null || value === undefined)
        return true;
    if (typeof value !== "string")
        return false;
    return GAP_TOKENS.has(value.trim().toLowerCase());
}
export function isFactLike(value) {
    return typeof value === "object" && value !== null && "value" in value && "tier" in value && "source_id" in value;
}
export function observationComplete(fact) {
    return Boolean(fact.tri_state_observation && fact.method && fact.observed_at && fact.source_id);
}
//# sourceMappingURL=values.js.map