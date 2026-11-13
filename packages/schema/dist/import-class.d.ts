/**
 * Classification and migration partition for access-maps records
 * (ALENZACODES/access-maps PR #1, branch cursor/ontario-open-data-pipeline-986f).
 * Every key in schema/import/fields.json is listed once.
 */
export declare const VENUE_PLACE_KEYS: readonly ["name", "category_group", "category", "lat", "lon", "addr_housenumber", "addr_street", "addr_city", "addr_postcode", "addr_unit", "opening_hours", "level", "operator", "brand", "website", "wheelchair", "wheelchair_description", "access", "indoor", "ref", "braille", "hearing_loop", "speech_output", "stroller", "capacity_disabled"];
export declare const VENUE_ENTRANCE_KEYS: readonly ["entrance", "automatic_door", "door", "door_width", "ramp", "ramp_wheelchair", "ramp_stroller", "step_count", "incline", "kerb", "kerb_height", "tactile_paving", "handrail", "width", "surface", "smoothness", "lit", "elevator"];
/** Safe renames: the value is copied unchanged. No unit is invented and no yes/no tag becomes a boolean. */
export declare const VENUE_PLACE_RENAMES: Record<string, string>;
export declare const VENUE_ACCESS_KEYS: Set<string>;
export declare const WASHROOM_RENAMES: Record<string, string>;
export declare const WASHROOM_ACCESS_KEYS: Set<string>;
export declare const TRANSIT_RENAMES: Record<string, string>;
export declare const TRANSIT_ACCESS_KEYS: Set<string>;
export declare const PATH_RENAMES: Record<string, string>;
export declare const PATH_ACCESS_KEYS: Set<string>;
export declare function accessKeysFor(recordType: string): Set<string>;
