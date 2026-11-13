/**
 * Field catalog types. The catalog is the source for JSON Schema emission,
 * generated TypeScript, and the piece counter. Counting roles follow
 * master-plan Table T3-12, not the schema's maximum width.
 */
export type Requirement = "required" | "conditional" | "optional" | "system";
/** How a populated value participates in the headline piece total. */
export type CountRole = "piece" | "system" | "translation" | "free_text" | "derived";
/**
 * accessibility — a fact about access, a barrier, a measurement, or live status.
 * identity — name, category, address, coordinates.
 * directory — contact, hours, links, and other non-measurement directory data.
 * editorial — game and help content, counted separately from access facts.
 * status — live or snapshot status. Classed with accessibility pieces.
 */
export type FactClass = "accessibility" | "identity" | "directory" | "editorial" | "status";
export type Placement = "envelope" | "provenance" | "facts";
export type ValueKind = {
    type: "string";
} | {
    type: "number";
} | {
    type: "measurement";
    unit: "mm" | "m" | "kg" | "percent";
} | {
    type: "boolean";
} | {
    type: "enum";
    values: string[];
} | {
    type: "string_array";
} | {
    type: "url";
} | {
    type: "date";
} | {
    type: "timestamp";
} | {
    type: "id_array";
};
export interface FieldDef {
    /** Plan field name, used in the census. */
    name: string;
    /** JSON property, relative to the placement. Provenance paths start at the provenance object. */
    property: string;
    requirement: Requirement;
    count: CountRole;
    factClass: FactClass;
    placement: Placement;
    description: string;
    value?: ValueKind;
    /** Unknown with method, date, and source is itself an observation and counts. */
    triState?: boolean;
    /** When the named fact is also a piece, this translation does not add another piece. */
    translationOf?: string;
}
export interface RecordDef {
    recordType: string;
    schemaVersion: string;
    title: string;
    description: string;
    planRef: string;
    /** Fact-shaped record (facts + imported_facts) or a flat record. */
    shape: "facts" | "flat" | "register" | "local";
    /**
     * status_snapshot — pieces count only inside the 30-day reconciliation window.
     * derived_product — stored plans copied from other records; excluded from the headline.
     * local — device-only profile; excluded.
     * register — source and licence registry; provenance, excluded from the headline.
     */
    counting: "canonical" | "status_snapshot" | "derived_product" | "local" | "register";
    fields: FieldDef[];
}
export declare function systemEnvelope(name: string, property: string, description: string, value: ValueKind): FieldDef;
export declare function systemProvenance(name: string, property: string, description: string): FieldDef;
export declare function fact(name: string, requirement: Requirement, factClass: FactClass, value: ValueKind, description: string, extra?: Partial<FieldDef>): FieldDef;
export declare const UNKNOWN_TOKENS: readonly ["unknown", "UNKNOWN"];
export declare const MEASUREMENT_UNITS: readonly ["mm", "m", "kg", "percent"];
export declare const PROTOTYPE_LABELS: readonly ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA", "COMMUNITY-REPORTED", "VERIFIED"];
export declare const TIERS: readonly [0, 1, 2, 3, 4, "E"];
