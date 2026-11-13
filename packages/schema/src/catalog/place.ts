import { fact, systemEnvelope, systemProvenance, type FieldDef, type RecordDef } from "./types.js";

const str = { type: "string" as const };
const num = { type: "number" as const };
const bool = { type: "boolean" as const };
const url = { type: "url" as const };
const date = { type: "date" as const };
const timestamp = { type: "timestamp" as const };
const textList = { type: "string_array" as const };
const mm = { type: "measurement" as const, unit: "mm" as const };

/**
 * Place fields 1–100 from Part 3 Table T3-16.
 * Rows that the table marks "does not count" are system fields. That is 20 rows.
 * The summary sentence in the plan says 19 system fields and 81 counted candidates.
 * The row-by-row table is what this catalog follows. See docs/decisions.md.
 */
const envelope: FieldDef[] = [
  systemEnvelope("place_id", "id", "Stable identifier. Never reused. Does not count.", { type: "string" }),
  systemEnvelope("schema_version", "schema_version", "Schema version. Does not count.", str),
  systemEnvelope("protocol_version", "protocol_version", "Measurement protocol version. Does not count.", str),
  systemEnvelope("record_version", "record_version", "Increments on each published change. Does not count.", {
    type: "number",
  }),
  systemEnvelope(
    "record_status",
    "record_status",
    "draft, in_review, published, stale_flagged, archived, or disputed. Does not count.",
    {
      type: "enum",
      values: ["draft", "in_review", "published", "stale_flagged", "archived", "disputed"],
    },
  ),
];

const identity: FieldDef[] = [
  fact("name_en", "required", "identity", str, "Official English name as published by the venue or operator."),
  fact(
    "name_fr",
    "conditional",
    "identity",
    str,
    "Official French name where it exists. A translation of name_en does not add a second piece.",
    { count: "translation", translationOf: "name_en" },
  ),
  fact("former_names", "optional", "identity", textList, "Former names with dates. One piece when the array is populated."),
  fact("also_known_as", "optional", "identity", textList, "Search aliases. One piece when populated."),
  fact("category_primary", "required", "identity", str, "Primary category as published. The controlled list is versioned and is not closed in this schema, because the plan does not publish the list and a closed list would force relabelled categories."),
  fact("category_secondary", "optional", "identity", textList, "Secondary categories. One piece when populated."),
  fact("place_type", "required", "identity", {
    type: "enum",
    values: [
      "venue",
      "facility",
      "park",
      "trailhead",
      "station_building",
      "healthcare",
      "retail",
      "hospitality",
      "education",
      "government",
      "recreation",
      "other",
    ],
  }, "Place type from the plan. Not inferred from an amenity tag during migration."),
  fact("address_street", "required", "identity", str, "Street address, including unit where it is already one published string."),
  fact("address_city", "required", "identity", str, "City, town, or community name."),
  fact("municipality_lower_tier", "required", "identity", str, "Lower-tier municipality where applicable."),
  fact("municipality_upper_tier", "conditional", "identity", str, "Upper-tier municipality or region where applicable."),
  fact("postal_code", "optional", "identity", str, "Postal code as published."),
  fact("latitude", "required", "identity", num, "Latitude in WGS84 decimal degrees."),
  fact("longitude", "required", "identity", num, "Longitude in WGS84 decimal degrees."),
  fact("location_accuracy_m", "optional", "identity", { type: "measurement", unit: "m" }, "Estimated accuracy in metres, with method."),
  fact("geocode_source", "required", "identity", {
    type: "enum",
    values: ["field_gps", "osm", "municipal_open_data", "operator_data", "manual", "other"],
  }, "How the coordinate was obtained."),
  fact("geocode_date", "required", "identity", date, "Date the location was determined or last checked."),
  fact("phone_main", "optional", "directory", str, "Main public phone number."),
  fact("phone_accessibility", "optional", "accessibility", str, "Accessibility or assistance phone, where published separately."),
  fact("email_public", "optional", "directory", str, "Public email address."),
  fact("website_url", "optional", "directory", url, "Official website."),
  fact("accessibility_page_url", "optional", "accessibility", url, "Venue accessibility page, where published."),
  fact("hours_general", "optional", "directory", str, "General opening hours as published."),
  fact("hours_accessibility_note", "optional", "accessibility", str, "Hours that differ for the accessible entrance or route."),
  fact("admission_cost", "optional", "directory", str, "Admission cost or free status as published. Not pricing advice."),
  fact("booking_required", "optional", "directory", bool, "Whether booking or advance notice is required.", { triState: true }),
  fact("booking_details", "conditional", "directory", str, "Booking method and lead time where booking is required."),
];

const access: FieldDef[] = [
  fact("general_access_summary", "optional", "accessibility", str, "Factual summary written from measurements. Not a bare accessible label."),
  fact("step_free_route_exists", "conditional", "accessibility", bool, "Whether a step-free route to the main activity was observed. Never assumed.", { triState: true }),
  fact("step_free_route_description", "conditional", "accessibility", str, "Description of the step-free route, including a side or rear entrance where that is the route."),
  fact("accessible_entrance_location", "conditional", "accessibility", str, "Where the step-free entrance is relative to the street and the main entrance."),
  fact("entrance_count_total", "optional", "accessibility", num, "Count of public entrances observed."),
  fact("entrance_count_step_free", "optional", "accessibility", num, "Count of step-free public entrances observed."),
  fact("lift_or_elevator_present", "conditional", "accessibility", bool, "Whether a lift or elevator serves public areas.", { triState: true }),
  fact("lift_or_elevator_details", "conditional", "accessibility", str, "Lift location, floors served, and operator. Elevator assets are separate records."),
  fact("platform_lift_present", "optional", "accessibility", bool, "Whether a platform lift was observed.", { triState: true }),
  fact("ramp_present_general", "optional", "accessibility", bool, "Whether a ramp serves the main access route. Ramp measurements live on the entrance.", { triState: true }),
  fact("interior_path_min_width_mm", "optional", "accessibility", mm, "Minimum clear interior path width, measured."),
  fact("interior_turning_space_mm", "optional", "accessibility", mm, "Clear turning diameter in key interior areas, measured."),
  fact("interior_floor_surface", "optional", "accessibility", {
    type: "enum",
    values: ["tile", "carpet", "wood", "concrete", "other"],
  }, "Primary interior floor surface as observed."),
  fact("interior_floor_obstructions", "optional", "accessibility", str, "Recurring obstructions as observed."),
  fact("seating_available", "optional", "accessibility", bool, "Whether seating is available in public areas.", { triState: true }),
  fact("seating_types", "optional", "accessibility", str, "Seating types, armrests, back support, and space for a wheelchair alongside."),
  fact("wheelchair_spaces_count", "optional", "accessibility", num, "Designated wheelchair spaces as observed or as published."),
  fact("wheelchair_spaces_location", "optional", "accessibility", str, "Location and sightline note for wheelchair spaces."),
  fact("counter_heights_mm", "optional", "accessibility", str, "Service counter heights in millimetres, including a lowered section where present."),
  fact("counter_knee_clearance", "optional", "accessibility", str, "Knee clearance at a lowered counter, height and depth, measured."),
  fact("till_or_service_desk_access", "optional", "accessibility", str, "Access note for tills, desks, and reception, including the queue."),
  fact("changing_facilities_general", "optional", "accessibility", str, "General changing note. Adult change and hoist fields live on the washroom."),
  fact("baby_change_present", "optional", "accessibility", bool, "Baby changing, distinct from an adult change table.", { triState: true }),
  fact("hearing_loop_present", "optional", "accessibility", bool, "Hearing loop or assistive listening as observed or published.", { triState: true }),
  fact("hearing_loop_locations", "conditional", "accessibility", str, "Where the hearing loop works and how to request it."),
  fact("signage_braille_tactile", "optional", "accessibility", bool, "Braille or tactile signage observed.", { triState: true }),
  fact("signage_visual_contrast", "optional", "accessibility", str, "Visual signage contrast, size, and placement as observed."),
  fact("lighting_general", "optional", "accessibility", str, "Lighting note. No invented lux value."),
  fact("noise_level_general", "optional", "accessibility", str, "Noise note. No decibel claim without a measurement."),
  fact("quiet_space_available", "optional", "accessibility", bool, "Quiet or low-stimulation space as observed or published.", { triState: true }),
  fact("scent_free_policy", "optional", "accessibility", str, "Scent policy as published, with its own source and date on the fact."),
  fact("service_animal_policy", "optional", "accessibility", str, "Service-animal policy as published for this place. Not generalised."),
  fact("support_person_policy_place", "optional", "accessibility", str, "Support-person admission or fare policy as published for this place."),
  fact("accessible_format_available", "optional", "accessibility", str, "Accessible formats and how to request them, as published."),
  fact("asl_lsq_available", "optional", "accessibility", str, "ASL or LSQ interpretation as published, including lead time."),
  fact("french_service_available", "optional", "directory", str, "French-language service as published or designated. Not machine-translated."),
  fact("staff_assistance_available", "optional", "accessibility", str, "Staff assistance and how to request it."),
  fact("queue_management", "optional", "accessibility", str, "Queue layout, accessible queue route, and seating while waiting."),
  fact("emergency_procedure_note", "optional", "accessibility", str, "Evacuation note as published by the venue. The App does not invent a procedure."),
  fact("emergency_exit_access", "optional", "accessibility", str, "Emergency exit access as observed or published."),
  fact("charging_available_general", "optional", "accessibility", bool, "Whether device or power-chair charging is available. Detail lives on a charging record.", { triState: true }),
  fact("charging_details_general", "conditional", "accessibility", str, "Charging location, permission, and hours where charging is available."),
  fact("wifi_available", "optional", "directory", bool, "Public Wi-Fi as published.", { triState: true }),
  fact("drinking_water_available", "optional", "accessibility", bool, "Drinking water or a bottle-filling station as observed.", { triState: true }),
  fact("outdoor_areas_access", "optional", "accessibility", str, "Outdoor path, seating, shade, and shelter note."),
  fact("trail_access_summary", "conditional", "accessibility", str, "Trail summary for parks and trailheads. Segment records hold the measured parts."),
  fact("construction_or_disruption_note", "optional", "accessibility", str, "Construction or closure note with its own expiry on the fact."),
  fact("winter_access_note", "optional", "accessibility", str, "Snow, ice, and seasonal entrance changes. A summer note is not a winter verification."),
  fact("build_or_renovation_year", "optional", "directory", num, "Build or last major renovation year where known. Context only, not a compliance label."),
  fact("code_version_context", "optional", "directory", str, "Code-version context where known. Never a compliance label."),
  fact("rhfac_or_certification_note", "optional", "directory", str, "Voluntary certification note where published. Distinct from a code-compliance claim."),
  fact("accessibility_plan_url", "optional", "accessibility", url, "Multi-year accessibility plan where the venue publishes one."),
  fact("feedback_process", "optional", "directory", str, "Venue accessibility feedback process as published."),
];

const tail: FieldDef[] = [
  systemEnvelope("photo_evidence_summary", "photo_evidence_summary", "Computed from photograph records. Does not count.", str),
  systemEnvelope("linked_entrance_ids", "linked_entrance_ids", "Entrance record ids. Does not count.", { type: "id_array" }),
  systemEnvelope("linked_washroom_ids", "linked_washroom_ids", "Washroom record ids. Does not count.", { type: "id_array" }),
  systemEnvelope("linked_parking_ids", "linked_parking_ids", "Parking record ids. Does not count.", { type: "id_array" }),
  systemEnvelope("linked_segment_ids", "linked_segment_ids", "Approach segment ids. Does not count.", { type: "id_array" }),
  systemEnvelope("linked_transit_stop_ids", "linked_transit_stop_ids", "Transit stop ids. Does not count.", { type: "id_array" }),
  systemProvenance("source_primary", "source_id", "Primary source id. Provenance, not a data piece. source_name is the display name."),
  systemProvenance("source_date", "source_date", "Date of the primary source. Provenance, not a data piece."),
  systemEnvelope("verification_tier_summary", "verification_tier_summary", "Optional computed summary. The stored field tiers are authoritative. Does not count.", str),
  systemEnvelope("last_verified_date", "last_verified_date", "Optional computed date. Does not count.", date),
  systemEnvelope("verification_method_summary", "verification_method_summary", "Optional computed method summary. Does not count.", str),
  systemEnvelope("stale_flag", "stale_flag", "Optional computed stale flag. Freshness is evaluated by the counter. Does not count.", bool),
  systemEnvelope("created_at", "created_at", "Creation timestamp. Does not count.", timestamp),
  systemEnvelope("updated_at", "updated_at", "Modification timestamp. Does not count.", timestamp),
  systemEnvelope("created_by_role", "created_by_role", "Creator role only. No personal identifier. Does not count.", {
    type: "enum",
    values: ["verifier", "moderator", "importer", "administrator", "peer"],
  }),
];

export const placeRecord: RecordDef = {
  recordType: "place",
  schemaVersion: "place-1.0.0",
  title: "Place",
  description:
    "Parent record for a venue, facility, park, trailhead, or station building. Entrance, washroom, and parking measurements are child records and are not stored here.",
  planRef: "Part 3 section 3.6, Table T3-16",
  shape: "facts",
  counting: "canonical",
  fields: [...envelope, ...identity, ...access, ...tail],
};
