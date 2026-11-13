/**
 * Classification and migration partition for access-maps records
 * (ALENZACODES/access-maps PR #1, branch cursor/ontario-open-data-pipeline-986f).
 * Every key in schema/import/fields.json is listed once.
 */

export const VENUE_PLACE_KEYS = [
  "name",
  "category_group",
  "category",
  "lat",
  "lon",
  "addr_housenumber",
  "addr_street",
  "addr_city",
  "addr_postcode",
  "addr_unit",
  "opening_hours",
  "level",
  "operator",
  "brand",
  "website",
  "wheelchair",
  "wheelchair_description",
  "access",
  "indoor",
  "ref",
  "braille",
  "hearing_loop",
  "speech_output",
  "stroller",
  "capacity_disabled",
] as const;

export const VENUE_ENTRANCE_KEYS = [
  "entrance",
  "automatic_door",
  "door",
  "door_width",
  "ramp",
  "ramp_wheelchair",
  "ramp_stroller",
  "step_count",
  "incline",
  "kerb",
  "kerb_height",
  "tactile_paving",
  "handrail",
  "width",
  "surface",
  "smoothness",
  "lit",
  "elevator",
] as const;

/** Safe renames: the value is copied unchanged. No unit is invented and no yes/no tag becomes a boolean. */
export const VENUE_PLACE_RENAMES: Record<string, string> = {
  name: "name_en",
  lat: "latitude",
  lon: "longitude",
  addr_street: "address_street",
  addr_city: "address_city",
  addr_postcode: "postal_code",
  website: "website_url",
  opening_hours: "hours_general",
};

export const VENUE_ACCESS_KEYS = new Set<string>([
  "wheelchair",
  "wheelchair_description",
  "access",
  "braille",
  "hearing_loop",
  "speech_output",
  "stroller",
  "capacity_disabled",
  ...VENUE_ENTRANCE_KEYS,
]);

export const WASHROOM_RENAMES: Record<string, string> = {
  name: "name_en",
  lat: "latitude",
  lon: "longitude",
  opening_hours: "hours_available",
};

export const WASHROOM_ACCESS_KEYS = new Set<string>([
  "wheelchair",
  "wheelchair_description",
  "changing_table",
  "changing_table_fee",
  "changing_table_location",
  "adult_changing_table",
  "access",
  "fee",
  "opening_hours",
  "unisex",
  "male",
  "female",
  "supervised",
  "locked",
  "shower",
  "disposal",
  "capacity",
  "published_accessibility",
  "status",
  "seasonal",
  "drinking_water",
]);

export const TRANSIT_RENAMES: Record<string, string> = {
  name: "stop_name",
  lat: "latitude",
  lon: "longitude",
  location_type: "stop_type",
  wheelchair_boarding: "gtfs_wheelchair_boarding",
  parent_station: "parent_station_id",
};

export const TRANSIT_ACCESS_KEYS = new Set<string>([
  "wheelchair_boarding",
  "level_index",
  "level_name",
]);

export const PATH_RENAMES: Record<string, string> = {
  kind: "segment_type",
};

export const PATH_ACCESS_KEYS = new Set<string>([
  "surface",
  "smoothness",
  "incline",
  "width",
  "kerb",
  "tactile_paving",
  "lit",
  "wheelchair",
  "wheelchair_description",
  "step_count",
  "handrail",
  "access",
  "length_m",
  "max_slope",
  "min_width",
  "stair_count",
  "ramp",
  "crossing",
  "pathway_mode",
]);

export function accessKeysFor(recordType: string): Set<string> {
  switch (recordType) {
    case "place":
      return VENUE_ACCESS_KEYS;
    case "entrance":
      return new Set(VENUE_ENTRANCE_KEYS);
    case "washroom":
      return WASHROOM_ACCESS_KEYS;
    case "transit_stop":
      return TRANSIT_ACCESS_KEYS;
    case "segment":
      return PATH_ACCESS_KEYS;
    default:
      return new Set();
  }
}
