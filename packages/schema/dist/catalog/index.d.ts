import type { RecordDef } from "./types.js";
export declare const RECORDS: RecordDef[];
export declare function recordByType(recordType: string): RecordDef | undefined;
export declare const SCHEMA_ID_BASE = "https://access-main.local/schema";
export declare function canonicalSchemaId(recordType: string): string;
export declare const FIELD_FACT_ID = "https://access-main.local/schema/common/field-fact.schema.json";
export declare const PROVENANCE_ID = "https://access-main.local/schema/common/provenance.schema.json";
/** Illustrative arithmetic from Part 1 section 5.6. A sizing example, not an achievement. */
export declare const ILLUSTRATIVE_TRANCHE_TARGETS: {
    readonly venue: 250000;
    readonly path: 100000;
    readonly transit: 50000;
    readonly washroom: 100000;
};
export declare const ILLUSTRATIVE_TOTAL = 500000;
/**
 * Table T3-13 line totals. TARGETS, not existing data.
 * The sum is 502,300. The counter does not pretend a fixture has reached it.
 */
export declare const RECONCILIATION_LINES: readonly [{
    readonly line: 1;
    readonly category: "places";
    readonly records: 4500;
    readonly fieldsPerRecord: 36;
    readonly fieldValues: 162000;
}, {
    readonly line: 2;
    readonly category: "entrances";
    readonly records: 6000;
    readonly fieldsPerRecord: 15;
    readonly fieldValues: 90000;
}, {
    readonly line: 3;
    readonly category: "washrooms";
    readonly records: 3000;
    readonly fieldsPerRecord: 26;
    readonly fieldValues: 78000;
}, {
    readonly line: 4;
    readonly category: "parking";
    readonly records: 2200;
    readonly fieldsPerRecord: 13;
    readonly fieldValues: 28600;
}, {
    readonly line: 5;
    readonly category: "transit_stops";
    readonly records: 3800;
    readonly fieldsPerRecord: 10;
    readonly fieldValues: 38000;
}, {
    readonly line: 6;
    readonly category: "elevator_assets";
    readonly records: 600;
    readonly fieldsPerRecord: 11;
    readonly fieldValues: 6600;
}, {
    readonly line: 7;
    readonly category: "status_observations";
    readonly records: 5000;
    readonly fieldsPerRecord: 3;
    readonly fieldValues: 15000;
}, {
    readonly line: 8;
    readonly category: "segments";
    readonly records: 2800;
    readonly fieldsPerRecord: 9;
    readonly fieldValues: 25200;
}, {
    readonly line: 9;
    readonly category: "services";
    readonly records: 750;
    readonly fieldsPerRecord: 12;
    readonly fieldValues: 9000;
}, {
    readonly line: 10;
    readonly category: "benefits";
    readonly records: 110;
    readonly fieldsPerRecord: 14;
    readonly fieldValues: 1540;
}, {
    readonly line: 11;
    readonly category: "clinicians";
    readonly records: 380;
    readonly fieldsPerRecord: 10;
    readonly fieldValues: 3800;
}, {
    readonly line: 12;
    readonly category: "events";
    readonly records: 280;
    readonly fieldsPerRecord: 9;
    readonly fieldValues: 2520;
}, {
    readonly line: 13;
    readonly category: "housing";
    readonly records: 240;
    readonly fieldsPerRecord: 12;
    readonly fieldValues: 2880;
}, {
    readonly line: 14;
    readonly category: "jobs";
    readonly records: 180;
    readonly fieldsPerRecord: 11;
    readonly fieldValues: 1980;
}, {
    readonly line: 15;
    readonly category: "peer_resources";
    readonly records: 320;
    readonly fieldsPerRecord: 8;
    readonly fieldValues: 2560;
}, {
    readonly line: 16;
    readonly category: "game_content";
    readonly records: 550;
    readonly fieldsPerRecord: 6;
    readonly fieldValues: 3300;
}, {
    readonly line: 17;
    readonly category: "reviews";
    readonly records: 3600;
    readonly fieldsPerRecord: 7;
    readonly fieldValues: 25200;
}, {
    readonly line: 18;
    readonly category: "photograph_metadata";
    readonly records: 1200;
    readonly fieldsPerRecord: 4;
    readonly fieldValues: 4800;
}, {
    readonly line: 19;
    readonly category: "policies";
    readonly records: 220;
    readonly fieldsPerRecord: 6;
    readonly fieldValues: 1320;
}];
export declare const RECONCILIATION_TARGET = 502300;
export declare const IMPORT_SCHEMA_IDS: {
    readonly fieldValue: "https://access-maps.local/schema/field-value.schema.json";
    readonly venue: "https://access-maps.local/schema/venue.schema.json";
    readonly washroom: "https://access-maps.local/schema/washroom.schema.json";
    readonly path: "https://access-maps.local/schema/path-segment.schema.json";
    readonly transit: "https://access-maps.local/schema/transit-stop.schema.json";
    readonly source: "https://access-maps.local/schema/source-registry-entry.schema.json";
};
export declare const IMPORT_TRANCHES: readonly ["venue", "washroom", "path", "transit"];
export type ImportTranche = (typeof IMPORT_TRANCHES)[number];
