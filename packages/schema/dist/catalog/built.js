import { fact, systemEnvelope } from "./types.js";
const str = { type: "string" };
const bool = { type: "boolean" };
const mm = { type: "measurement", unit: "mm" };
function childEnvelope(idDescription) {
    return [
        systemEnvelope("record_id", "id", idDescription, str),
        systemEnvelope("schema_version", "schema_version", "Schema version. Does not count.", str),
        systemEnvelope("place_id", "place_id", "Parent place id. A reference, not a data piece.", str),
        systemEnvelope("record_status", "record_status", "Publication status. Does not count.", {
            type: "enum",
            values: ["draft", "in_review", "published", "stale_flagged", "archived", "disputed"],
        }),
    ];
}
const entranceFacts = [
    fact("entrance_name", "optional", "identity", str, "Name such as main, north, rear, or parking level."),
    fact("entrance_type", "optional", "identity", {
        type: "enum",
        values: ["main", "side", "rear", "parking_level", "service", "other"],
    }, "Which kind of entrance this is."),
    fact("is_primary_public_entrance", "optional", "identity", bool, "Whether this is the primary public entrance.", { triState: true }),
    fact("step_free", "optional", "accessibility", bool, "Step-free status as observed. Never assumed from a missing step count.", { triState: true }),
    fact("step_count", "optional", "accessibility", { type: "number" }, "Observed step count. Zero is a recorded observation only when method and date are present."),
    fact("step_height_max_mm", "optional", "accessibility", mm, "Largest single step, tread to tread, at the centre."),
    fact("threshold_height_mm", "optional", "accessibility", mm, "Highest threshold, including a weather bar."),
    fact("door_clear_width_mm", "optional", "accessibility", mm, "Clear opening with the door at 90 degrees, excluding door thickness and hardware."),
    fact("door_type", "optional", "accessibility", {
        type: "enum",
        values: ["single", "double", "sliding", "revolving", "other"],
    }, "Door type as observed."),
    fact("door_operator_present", "optional", "accessibility", bool, "Power or automatic operator observed.", { triState: true }),
    fact("door_operator_working", "optional", "accessibility", bool, "Operator working on the verification date. Presence is not working status.", { triState: true }),
    fact("door_opening_force_note", "optional", "accessibility", str, "Observed heavy, moderate, or light, with the method note. No invented Newton value."),
    fact("door_swing", "optional", "accessibility", {
        type: "enum",
        values: ["outward", "inward", "sliding", "revolving", "other"],
    }, "Door swing as observed."),
    fact("ramp_present", "optional", "accessibility", bool, "Ramp present at this entrance.", { triState: true }),
    fact("ramp_gradient_ratio", "optional", "accessibility", str, "Ratio computed from recorded rise and run. A ratio alone is not accepted as a measurement."),
    fact("ramp_rise_mm", "optional", "accessibility", mm, "Total rise, bottom to top, measured."),
    fact("ramp_run_mm", "optional", "accessibility", mm, "Total run, measured."),
    fact("ramp_length_mm", "optional", "accessibility", mm, "Total length including landings."),
    fact("ramp_clear_width_mm", "optional", "accessibility", mm, "Clear width between handrails at the narrowest point."),
    fact("ramp_landing_top_mm", "optional", "accessibility", str, "Top landing length and width, clear of the door swing."),
    fact("ramp_landing_bottom_mm", "optional", "accessibility", str, "Bottom landing length and width, clear of obstructions."),
    fact("ramp_handrails", "optional", "accessibility", {
        type: "enum",
        values: ["both_sides", "one_side", "none", "other"],
    }, "Handrails as observed."),
    fact("ramp_surface", "optional", "accessibility", str, "Ramp surface with slip and drainage note."),
    fact("approach_surface", "optional", "accessibility", str, "Approach surface and condition."),
    fact("approach_width_min_mm", "optional", "accessibility", mm, "Narrowest clear approach width, excluding obstructions at the time of verification."),
    fact("approach_gradient_note", "optional", "accessibility", str, "Gradient observations on the approach. Not a computed slope from a map."),
    fact("lighting_note", "optional", "accessibility", str, "Lighting at the entrance as observed."),
    fact("signage_note", "optional", "accessibility", str, "Directions from the street and accessible-entrance signage."),
];
const washroomFacts = [
    fact("name_en", "optional", "identity", str, "Name as published by the source. A washroom that is its own open-data record may have no parent place."),
    fact("latitude", "optional", "identity", { type: "number" }, "Latitude in WGS84 when the source publishes a point."),
    fact("longitude", "optional", "identity", { type: "number" }, "Longitude in WGS84 when the source publishes a point."),
    fact("washroom_name", "optional", "identity", str, "Name such as universal washroom, ground floor, near lobby."),
    fact("washroom_type", "optional", "accessibility", {
        type: "enum",
        values: ["universal", "single_occupant_accessible", "accessible_stall", "standard", "family", "other"],
    }, "Washroom type. Standard means no accessibility features were observed, which is a fact, not a gap."),
    fact("location_description", "optional", "accessibility", str, "Floor, wing, and directions from the entrance."),
    fact("floor_level", "optional", "accessibility", str, "Floor, with a lift-access note where one was observed."),
    fact("route_to_washroom_note", "optional", "accessibility", str, "Step-free route, including stairs, lifts, or narrow points that were observed."),
    fact("door_clear_width_mm", "optional", "accessibility", mm, "Washroom door clear width. Counted on the washroom, not on the entrance."),
    fact("door_operator_present", "optional", "accessibility", bool, "Door operator present.", { triState: true }),
    fact("door_operator_working", "optional", "accessibility", bool, "Door operator working on the verification date.", { triState: true }),
    fact("door_swing", "optional", "accessibility", {
        type: "enum",
        values: ["outward", "inward", "sliding", "other"],
    }, "Door swing."),
    fact("door_lock_type", "optional", "accessibility", {
        type: "enum",
        values: ["none", "key", "code", "staff_assist", "radar_key", "other"],
    }, "Lock type. A lock without the access process is not a usable access fact on its own."),
    fact("door_lock_details", "optional", "accessibility", str, "Where the key is, how the code is published, staff-assist method, and hours when locked."),
    fact("turning_space_diameter_mm", "optional", "accessibility", mm, "Clear turning diameter excluding the door swing and fixtures."),
    fact("turning_space_shape_note", "optional", "accessibility", str, "Shape, obstructions, and door-swing intrusion."),
    fact("transfer_side", "optional", "accessibility", {
        type: "enum",
        values: ["left", "right", "both", "front", "none", "unknown_recorded"],
    }, "Transfer side. unknown_recorded counts only as a tri-state observation with method and date. none means no clear transfer space."),
    fact("transfer_space_width_mm", "optional", "accessibility", mm, "Clear transfer-space width beside the toilet."),
    fact("transfer_space_depth_mm", "optional", "accessibility", mm, "Clear transfer-space depth."),
    fact("toilet_seat_height_mm", "optional", "accessibility", mm, "Floor to top of seat."),
    fact("toilet_type", "optional", "accessibility", {
        type: "enum",
        values: ["floor_mounted", "wall_hung", "other"],
    }, "Toilet type as observed."),
    fact("grab_bar_left", "optional", "accessibility", bool, "Left grab bar present.", { triState: true }),
    fact("grab_bar_right", "optional", "accessibility", bool, "Right grab bar present.", { triState: true }),
    fact("grab_bar_rear", "optional", "accessibility", bool, "Rear grab bar present.", { triState: true }),
    fact("grab_bar_details", "optional", "accessibility", str, "Lengths, heights, diameters, folding or fixed, as observed. No invented dimensions."),
    fact("sink_height_mm", "optional", "accessibility", mm, "Sink rim height."),
    fact("sink_knee_clearance_mm", "optional", "accessibility", mm, "Clearance height under the sink."),
    fact("sink_tap_type", "optional", "accessibility", {
        type: "enum",
        values: ["lever", "sensor", "push", "twist", "other"],
    }, "Tap operation."),
    fact("mirror_height_note", "optional", "accessibility", str, "Mirror bottom height and whether it is usable from a seated position."),
    fact("shelf_and_hook_present", "optional", "accessibility", bool, "Shelf and hook for bags and supplies.", { triState: true }),
    fact("shelf_and_hook_details", "optional", "accessibility", str, "Shelf and hook heights and locations."),
    fact("emergency_call_present", "optional", "accessibility", bool, "Emergency cord or button present. Do not test emergency systems without permission.", { triState: true }),
    fact("emergency_call_reach_note", "optional", "accessibility", str, "Cord length and reach from the floor and from the toilet, as observed."),
    fact("privacy_note", "optional", "accessibility", str, "Door privacy, gaps, and attendant space."),
    fact("attendant_space_present", "optional", "accessibility", bool, "Space for an attendant inside the washroom.", { triState: true }),
    fact("adult_change_table_present", "optional", "accessibility", bool, "Adult change table. Distinct from baby changing.", { triState: true }),
    fact("adult_change_table_dimensions", "optional", "accessibility", str, "Length, width, and height range, measured or read from a label. Do not invent a size."),
    fact("adult_change_table_load_kg", "optional", "accessibility", { type: "measurement", unit: "kg" }, "Rated load as labelled or published. Do not guess a load."),
    fact("adult_change_table_type", "optional", "accessibility", {
        type: "enum",
        values: ["fixed", "height_adjustable", "fold_down", "other"],
    }, "Adult change table type."),
    fact("hoist_present", "optional", "accessibility", bool, "Hoist present. Presence is not a claim that it is working or that a sling is provided.", { triState: true }),
    fact("hoist_type", "optional", "accessibility", {
        type: "enum",
        values: ["ceiling_track", "mobile", "none", "other"],
    }, "Hoist type. none is a recorded absence, not an unknown."),
    fact("hoist_sling_policy", "optional", "accessibility", str, "Bring-your-own sling, sling provided, and sling type, as published or observed. Quoted, not paraphrased into advice."),
    fact("hoist_details", "optional", "accessibility", str, "Track coverage, labelled load, operation, and whether staff assistance is required."),
    fact("lighting_note", "optional", "accessibility", str, "Lighting as observed."),
    fact("flooring_note", "optional", "accessibility", str, "Surface, slip, and drainage as observed."),
    fact("cleanliness_and_maintenance_note", "optional", "accessibility", str, "Condition on the verification date."),
    fact("reliability_note", "optional", "accessibility", str, "Known outages, storage use, or blockages, with dates."),
    fact("hours_available", "optional", "accessibility", str, "Hours the washroom is available when they differ from the place hours."),
    fact("access_restriction_note", "optional", "accessibility", str, "Customers only, key, staff only, or fee, with source and date."),
];
const parkingFacts = [
    fact("record_level", "required", "identity", {
        type: "enum",
        values: ["lot", "bay", "bay_group"],
    }, "Lot, bay, or bay group. Usability claims need bay-level records."),
    fact("lot_name", "optional", "identity", str, "Lot or garage name as published."),
    fact("operator_name", "optional", "directory", str, "Operator. Required in practice for a private-lot privilege claim."),
    fact("lot_access", "optional", "directory", {
        type: "enum",
        values: ["municipal", "private", "unknown_recorded"],
    }, "Whether the lot is municipal or private. A private rule is not stated as a municipal bylaw."),
    fact("bay_identifier", "optional", "identity", str, "Bay number or label where it exists."),
    fact("bay_type", "optional", "accessibility", {
        type: "enum",
        values: ["type_a_van_accessible", "type_b_standard_accessible", "standard", "unknown_recorded"],
    }, "Bay type. Type A is van-accessible. unknown_recorded is not a van-accessible claim."),
    fact("bay_width_mm", "optional", "accessibility", mm, "Bay width measured."),
    fact("bay_length_mm", "optional", "accessibility", mm, "Bay length measured."),
    fact("access_aisle_width_mm", "optional", "accessibility", mm, "Access aisle width. Zero only when the absence of an aisle was observed and recorded with method and date."),
    fact("access_aisle_side", "optional", "accessibility", {
        type: "enum",
        values: ["left", "right", "both", "none"],
    }, "Which side the access aisle is on."),
    fact("surface_type", "optional", "accessibility", str, "Surface type and condition."),
    fact("surface_gradient_note", "optional", "accessibility", str, "Gradient observations. Not a guessed percent."),
    fact("signage_present", "optional", "accessibility", bool, "International Symbol of Access signage observed.", { triState: true }),
    fact("distance_to_entrance_m", "optional", "accessibility", { type: "measurement", unit: "m" }, "Step-free route distance to the accessible entrance, when measured."),
    fact("route_to_entrance_note", "optional", "accessibility", str, "Kerb ramps, crossings, and gradients on the route to the entrance."),
    fact("kerb_ramp_present", "optional", "accessibility", bool, "Kerb ramp on the route to the entrance.", { triState: true }),
    fact("payment_method", "optional", "accessibility", {
        type: "enum",
        values: ["cash", "card", "app_only", "attendant", "free", "other"],
    }, "Payment method as observed or published."),
    fact("payment_details", "optional", "accessibility", str, "App name, attendant hours, and cash acceptance."),
    fact("reservation_required", "optional", "accessibility", bool, "Whether a reservation is required.", { triState: true }),
    fact("reservation_details", "optional", "accessibility", str, "Cutoff, phone, and permit rules as published."),
    fact("privilege_municipality", "conditional", "accessibility", str, "Municipality that sets the privilege. Required when privilege_details is populated."),
    fact("privilege_source", "conditional", "accessibility", str, "Bylaw or page, with URL and date. Required when privilege_details is populated."),
    fact("privilege_details", "optional", "accessibility", str, "Fee, time limit, and exemptions as sourced. Never a province-wide rule."),
    fact("snow_clearance_note", "optional", "accessibility", str, "Snow clearance observation, dated. Seasonal."),
];
const segmentFacts = [
    fact("segment_type", "optional", "identity", {
        type: "enum",
        values: ["sidewalk", "path", "crossing", "trail", "indoor_route", "ramp", "bridge", "other"],
    }, "Segment type."),
    fact("surface_type", "optional", "accessibility", {
        type: "enum",
        values: ["asphalt", "concrete", "pavers", "gravel", "grass", "wood", "tile", "carpet", "other"],
    }, "Surface type."),
    fact("surface_condition", "optional", "accessibility", {
        type: "enum",
        values: ["good", "fair", "poor", "damaged", "unknown_recorded"],
    }, "Surface condition with a date on the fact."),
    fact("width_min_mm", "optional", "accessibility", mm, "Minimum clear width, measured or imported with the import method named on the fact."),
    fact("gradient_max_percent", "optional", "accessibility", { type: "measurement", unit: "percent" }, "Maximum gradient. Derived slopes stay derived and do not count twice."),
    fact("gradient_note", "optional", "accessibility", str, "Gradient profile, rest landings, and steep sections."),
    fact("kerb_ramp_start", "optional", "accessibility", {
        type: "enum",
        values: ["present", "absent", "blocked", "unknown_recorded"],
    }, "Kerb ramp at the start of the segment."),
    fact("kerb_ramp_end", "optional", "accessibility", {
        type: "enum",
        values: ["present", "absent", "blocked", "unknown_recorded"],
    }, "Kerb ramp at the end of the segment."),
    fact("kerb_ramp_details", "optional", "accessibility", str, "Ramp widths, slopes, and tactile paving as observed."),
    fact("obstacles", "optional", "accessibility", str, "Recurring obstacles with dates."),
    fact("construction_flag", "optional", "accessibility", bool, "Active construction or closure. Needs an expiry and does not outlive it.", { triState: true }),
    fact("construction_details", "optional", "accessibility", str, "Detour, dates, source, and expiry."),
    fact("snow_status", "optional", "accessibility", {
        type: "enum",
        values: ["cleared", "partially_cleared", "blocked", "unknown_recorded"],
    }, "Snow status. A summer verification is not a winter status."),
    fact("snow_status_date", "optional", "accessibility", { type: "timestamp" }, "When the snow status was observed."),
    fact("snow_source", "optional", "directory", {
        type: "enum",
        values: ["municipal_data", "user_report", "verifier", "unknown_recorded"],
    }, "Who reported the snow status."),
    fact("rest_opportunity", "optional", "accessibility", bool, "Seating, shelter, or a rest area on the segment.", { triState: true }),
    fact("shade_shelter_note", "optional", "accessibility", str, "Shade, shelter, and lighting."),
    fact("osm_way_id", "optional", "identity", str, "OSM way id when the geometry comes from OSM. ODbL provenance stays on the fact."),
    fact("geometry_geojson", "optional", "identity", str, "LineString coordinates as a JSON string. One piece for the geometry, not one piece per vertex. Routing costs computed from it do not count."),
];
export const entranceRecord = {
    recordType: "entrance",
    schemaVersion: "entrance-1.0.0",
    title: "Entrance",
    description: "One entrance. Ramp rise and run are stored separately so a ratio cannot hide the length.",
    planRef: "Part 3 section 3.7",
    shape: "facts",
    counting: "canonical",
    fields: [...childEnvelope("Stable entrance id. Does not count."), ...entranceFacts],
};
export const washroomRecord = {
    recordType: "washroom",
    schemaVersion: "washroom-1.0.0",
    title: "Washroom",
    description: "One washroom, including adult change table and hoist fields. Baby changing is not an adult change table. A hoist without a sling policy is not a complete hoist record.",
    planRef: "Part 3 section 3.8",
    shape: "facts",
    counting: "canonical",
    fields: [...childEnvelope("Stable washroom id. Does not count."), ...washroomFacts],
};
export const parkingRecord = {
    recordType: "parking",
    schemaVersion: "parking-1.0.0",
    title: "Parking",
    description: "One lot, bay, or bay group. A privilege claim requires the municipality and the source. Type A means van-accessible.",
    planRef: "Part 3 section 3.9 parking",
    shape: "facts",
    counting: "canonical",
    fields: [...childEnvelope("Stable parking id. Does not count."), ...parkingFacts],
};
export const segmentRecord = {
    recordType: "segment",
    schemaVersion: "segment-1.0.0",
    title: "Segment",
    description: "One sidewalk, path, crossing, trail, or indoor route. Winter freshness is not inherited from a summer observation. Computed routing cost does not count.",
    planRef: "Part 3 section 3.9 segment",
    shape: "facts",
    counting: "canonical",
    fields: [
        systemEnvelope("record_id", "id", "Stable segment id. Does not count.", str),
        systemEnvelope("schema_version", "schema_version", "Schema version. Does not count.", str),
        systemEnvelope("record_status", "record_status", "Publication status. Does not count.", {
            type: "enum",
            values: ["draft", "in_review", "published", "stale_flagged", "archived", "disputed"],
        }),
        fact("routing_cost_version", "optional", "identity", str, "Cost-function version. Derived product marker. Does not count.", {
            count: "derived",
        }),
        ...segmentFacts,
    ],
};
//# sourceMappingURL=built.js.map