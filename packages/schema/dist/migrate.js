import { PATH_RENAMES, TRANSIT_RENAMES, VENUE_ENTRANCE_KEYS, VENUE_PLACE_KEYS, VENUE_PLACE_RENAMES, WASHROOM_RENAMES, } from "./import-class.js";
const STOP_TYPES = new Set([
    "stop",
    "station",
    "station_entrance",
    "entrance_exit",
    "platform",
    "boarding_area",
    "generic_node",
    "other",
    "unknown",
    "UNKNOWN",
]);
const BOARDING = new Set([
    "0_unknown",
    "1_some_vehicles_accessible",
    "2_boarding_not_possible",
    "some_vehicles_accessible",
    "boarding_not_possible",
    "unknown",
    "UNKNOWN",
]);
const SEGMENT_TYPES = new Set([
    "sidewalk",
    "path",
    "crossing",
    "trail",
    "indoor_route",
    "ramp",
    "bridge",
    "other",
    "unknown",
    "UNKNOWN",
]);
/**
 * Split an access-maps record into canonical drafts.
 * Values are copied. Tags are not turned into measurements or booleans.
 * Piece count is unchanged because each source field is written once.
 */
export function migrateImportRecord(record, sources = []) {
    const names = new Map(sources.map((source) => [source.id, source.name]));
    switch (record.tranche) {
        case "venue":
            return migrateVenue(record, names);
        case "washroom":
            return [migrateFlat(record, "washroom", "washroom-1.0.0", WASHROOM_RENAMES, () => true, names)];
        case "transit":
            return [
                migrateFlat(record, "transit_stop", "transit-stop-1.0.0", TRANSIT_RENAMES, (key, value) => {
                    if (key === "location_type")
                        return STOP_TYPES.has(String(value));
                    if (key === "wheelchair_boarding")
                        return BOARDING.has(String(value));
                    return true;
                }, names),
            ];
        case "path":
            return [
                migrateFlat(record, "segment", "segment-1.0.0", PATH_RENAMES, (key, value) => {
                    if (key === "kind")
                        return SEGMENT_TYPES.has(String(value));
                    return true;
                }, names),
            ];
        default:
            throw new Error(`cannot migrate tranche ${record.tranche}`);
    }
}
function migrateVenue(record, names) {
    const placeFields = {};
    const entranceFields = {};
    const entranceKeys = new Set(VENUE_ENTRANCE_KEYS);
    const placeKeys = new Set(VENUE_PLACE_KEYS);
    for (const [key, field] of Object.entries(record.fields)) {
        if (entranceKeys.has(key))
            entranceFields[key] = field;
        else if (placeKeys.has(key))
            placeFields[key] = field;
        else
            throw new Error(`venue field ${key} is not in the migration partition`);
    }
    const place = buildRecord({
        recordType: "place",
        schemaVersion: "place-1.0.0",
        id: record.id,
        fields: placeFields,
        renames: VENUE_PLACE_RENAMES,
        allow: () => true,
        names,
        extra: { linked_entrance_ids: [`${record.id}#entrance`] },
    });
    const entrance = buildRecord({
        recordType: "entrance",
        schemaVersion: "entrance-1.0.0",
        id: `${record.id}#entrance`,
        fields: entranceFields,
        renames: {},
        allow: () => true,
        names,
        extra: { place_id: record.id },
    });
    return [place, entrance];
}
function migrateFlat(record, recordType, schemaVersion, renames, allow, names) {
    return buildRecord({
        recordType,
        schemaVersion,
        id: record.id,
        fields: record.fields,
        renames,
        allow,
        names,
    });
}
function buildRecord(input) {
    const facts = {};
    const imported = {};
    const tiers = new Set();
    let provenanceSource;
    for (const [key, field] of Object.entries(input.fields)) {
        provenanceSource ??= field;
        if (typeof field.tier === "number")
            tiers.add(field.tier);
        const target = input.renames[key];
        const copy = { ...field, import_field: key };
        if (target && input.allow(key, field.value))
            facts[target] = copy;
        else
            imported[key] = copy;
    }
    if (!provenanceSource)
        throw new Error(`record ${input.id} has no fields`);
    const tier = tiers.size > 0 ? Math.max(...tiers) : 0;
    const provenance = {
        tier,
        source_name: input.names.get(provenanceSource.source_id ?? "") ?? provenanceSource.source_id,
        source_id: provenanceSource.source_id,
        source_date: provenanceSource.retrieved_at,
        record_date: provenanceSource.retrieved_at,
        licence_id: provenanceSource.licence,
        retrieved_at: provenanceSource.retrieved_at,
    };
    if (tier === 0)
        provenance.prototype_label = "SEEDED-OPEN-DATA";
    return {
        record_type: input.recordType,
        schema_version: input.schemaVersion,
        id: input.id,
        record_status: "draft",
        publication_context: "canonical",
        provenance,
        ...input.extra,
        facts,
        imported_facts: imported,
    };
}
export function odblShareAlikeMissing(source) {
    return source.licence_id === "ODbL-1.0" && source.share_alike !== true;
}
//# sourceMappingURL=migrate.js.map