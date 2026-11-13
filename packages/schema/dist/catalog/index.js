import { benefitsRecord } from "./directory.js";
import { entranceRecord, parkingRecord, segmentRecord, washroomRecord } from "./built.js";
import { placeRecord } from "./place.js";
import { chargingRecord, elevatorAssetRecord, outageRecord, repairSupplyRecord, transitStopRecord, } from "./transit.js";
export const RECORDS = [
    placeRecord,
    entranceRecord,
    washroomRecord,
    parkingRecord,
    segmentRecord,
    transitStopRecord,
    elevatorAssetRecord,
    outageRecord,
    chargingRecord,
    repairSupplyRecord,
    benefitsRecord,
];
export function recordByType(recordType) {
    return RECORDS.find((record) => record.recordType === recordType);
}
export const SCHEMA_ID_BASE = "https://access-main.local/schema";
export function canonicalSchemaId(recordType) {
    return `${SCHEMA_ID_BASE}/canonical/${recordType}.schema.json`;
}
export const FIELD_FACT_ID = `${SCHEMA_ID_BASE}/common/field-fact.schema.json`;
export const PROVENANCE_ID = `${SCHEMA_ID_BASE}/common/provenance.schema.json`;
/** Illustrative arithmetic from Part 1 section 5.6. A sizing example, not an achievement. */
export const ILLUSTRATIVE_TRANCHE_TARGETS = {
    venue: 250_000,
    path: 100_000,
    transit: 50_000,
    washroom: 100_000,
};
export const ILLUSTRATIVE_TOTAL = 500_000;
/**
 * Table T3-13 line totals. TARGETS, not existing data.
 * The sum is 502,300. The counter does not pretend a fixture has reached it.
 */
export const RECONCILIATION_LINES = [
    { line: 1, category: "places", records: 4_500, fieldsPerRecord: 36, fieldValues: 162_000 },
    { line: 2, category: "entrances", records: 6_000, fieldsPerRecord: 15, fieldValues: 90_000 },
    { line: 3, category: "washrooms", records: 3_000, fieldsPerRecord: 26, fieldValues: 78_000 },
    { line: 4, category: "parking", records: 2_200, fieldsPerRecord: 13, fieldValues: 28_600 },
    { line: 5, category: "transit_stops", records: 3_800, fieldsPerRecord: 10, fieldValues: 38_000 },
    { line: 6, category: "elevator_assets", records: 600, fieldsPerRecord: 11, fieldValues: 6_600 },
    { line: 7, category: "status_observations", records: 5_000, fieldsPerRecord: 3, fieldValues: 15_000 },
    { line: 8, category: "segments", records: 2_800, fieldsPerRecord: 9, fieldValues: 25_200 },
    { line: 9, category: "services", records: 750, fieldsPerRecord: 12, fieldValues: 9_000 },
    { line: 10, category: "benefits", records: 110, fieldsPerRecord: 14, fieldValues: 1_540 },
    { line: 11, category: "clinicians", records: 380, fieldsPerRecord: 10, fieldValues: 3_800 },
    { line: 12, category: "events", records: 280, fieldsPerRecord: 9, fieldValues: 2_520 },
    { line: 13, category: "housing", records: 240, fieldsPerRecord: 12, fieldValues: 2_880 },
    { line: 14, category: "jobs", records: 180, fieldsPerRecord: 11, fieldValues: 1_980 },
    { line: 15, category: "peer_resources", records: 320, fieldsPerRecord: 8, fieldValues: 2_560 },
    { line: 16, category: "game_content", records: 550, fieldsPerRecord: 6, fieldValues: 3_300 },
    { line: 17, category: "reviews", records: 3_600, fieldsPerRecord: 7, fieldValues: 25_200 },
    { line: 18, category: "photograph_metadata", records: 1_200, fieldsPerRecord: 4, fieldValues: 4_800 },
    { line: 19, category: "policies", records: 220, fieldsPerRecord: 6, fieldValues: 1_320 },
];
export const RECONCILIATION_TARGET = 502_300;
export const IMPORT_SCHEMA_IDS = {
    fieldValue: "https://access-maps.local/schema/field-value.schema.json",
    venue: "https://access-maps.local/schema/venue.schema.json",
    washroom: "https://access-maps.local/schema/washroom.schema.json",
    path: "https://access-maps.local/schema/path-segment.schema.json",
    transit: "https://access-maps.local/schema/transit-stop.schema.json",
    source: "https://access-maps.local/schema/source-registry-entry.schema.json",
};
export const IMPORT_TRANCHES = ["venue", "washroom", "path", "transit"];
//# sourceMappingURL=index.js.map