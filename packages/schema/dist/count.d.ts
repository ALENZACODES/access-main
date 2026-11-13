export declare const PIECE_DEFINITION = "A piece is one populated field value on one canonical record. unknown, empty, null, and not-assessed tokens do not count. A tri-state unknown counts only when method, observed_at, and source_id are recorded. Derived copies, translations of a populated field, system fields, provenance, free text, local profiles, and source-registry rows do not count. A stale value stays in the headline until it is older than 730 days. Elevator and escalator status observations count only inside a 30-day snapshot. Journeys are derived products and do not count. Example fixtures do not count. This is the Table T3-12 rule. The 500,000 and 502,300 figures are targets, not a claim about this file.";
export interface TypeSlice {
    records: number;
    headline_pieces: number;
    accessibility_fact_pieces: number;
    other_pieces: number;
    gaps: number;
    accessibility_fact_gaps: number;
    derived_excluded: number;
    translations_not_counted: number;
    stale_in_headline: number;
    excluded_older_than_730_days: number;
    excluded_outside_status_snapshot: number;
    excluded_undated: number;
    pieces_by_tier: Record<string, number>;
}
export interface CountReport {
    definition: string;
    as_of: string;
    records: number;
    headline_pieces: number;
    accessibility_fact_pieces: number;
    other_pieces: number;
    accessibility_fact_gaps: number;
    accessibility_fact_field_definitions: number;
    gaps: number;
    derived_excluded: number;
    translations_not_counted: number;
    stale_in_headline: number;
    excluded_older_than_730_days: number;
    excluded_outside_status_snapshot: number;
    excluded_undated: number;
    examples_excluded_records: number;
    local_profiles_not_counted: number;
    provenance_registers_not_counted: number;
    by_record_type: Record<string, TypeSlice>;
    illustrative_section_5_6: {
        venue: number;
        path: number;
        transit: number;
        washroom: number;
        total: number;
        note: string;
    };
    reconciliation_table_t3_13_target: number;
    by_record_type_note: string;
}
export declare function accessibilityFactFieldDefinitions(): number;
export declare class RecordCounter {
    private readonly asOf;
    private readonly seen;
    private readonly slices;
    private examplesExcluded;
    private localProfiles;
    private registers;
    constructor(asOf: string);
    add(record: unknown): void;
    finish(): CountReport;
    private addImport;
    private addCanonical;
    private addFlat;
    private addFact;
    private addPlain;
    private slice;
    private remember;
}
export declare function countRecords(records: unknown[], asOf: string): CountReport;
export declare function loadFieldsFile(): {
    venue: string[];
    washroom: string[];
    path: string[];
    transit: string[];
};
