/**
 * Field catalog types. The catalog is the source for JSON Schema emission,
 * generated TypeScript, and the piece counter. Counting roles follow
 * master-plan Table T3-12, not the schema's maximum width.
 */
export function systemEnvelope(name, property, description, value) {
    return {
        name,
        property,
        requirement: "system",
        count: "system",
        factClass: "identity",
        placement: "envelope",
        description,
        value,
    };
}
export function systemProvenance(name, property, description) {
    return {
        name,
        property,
        requirement: "system",
        count: "system",
        factClass: "identity",
        placement: "provenance",
        description,
        value: { type: "string" },
    };
}
export function fact(name, requirement, factClass, value, description, extra) {
    return {
        name,
        property: extra?.property ?? name,
        requirement,
        count: extra?.count ?? "piece",
        factClass,
        placement: "facts",
        description,
        value,
        triState: extra?.triState,
        translationOf: extra?.translationOf,
    };
}
export const UNKNOWN_TOKENS = ["unknown", "UNKNOWN"];
export const MEASUREMENT_UNITS = ["mm", "m", "kg", "percent"];
export const PROTOTYPE_LABELS = [
    "PROTOTYPE-UNVERIFIED",
    "SEEDED-OPEN-DATA",
    "COMMUNITY-REPORTED",
    "VERIFIED",
];
export const TIERS = [0, 1, 2, 3, 4, "E"];
//# sourceMappingURL=types.js.map