import { fact, systemEnvelope, type FieldDef, type RecordDef } from "./types.js";

const str = { type: "string" as const };
const bool = { type: "boolean" as const };
const num = { type: "number" as const };
const mm = { type: "measurement" as const, unit: "mm" as const };
const date = { type: "date" as const };
const timestamp = { type: "timestamp" as const };

const statusEnvelope: FieldDef[] = [
  systemEnvelope("record_id", "id", "Stable id. Does not count.", str),
  systemEnvelope("schema_version", "schema_version", "Schema version. Does not count.", str),
  systemEnvelope("record_status", "record_status", "Publication status. Does not count.", {
    type: "enum",
    values: ["draft", "in_review", "published", "stale_flagged", "archived", "disputed"],
  }),
];

export const transitStopRecord: RecordDef = {
  recordType: "transit_stop",
  schemaVersion: "transit-stop-1.0.0",
  title: "Transit stop",
  description:
    "One stop, station, station entrance, or platform. GTFS wheelchair boarding stays operator-reported. An App verification is a separate fact and does not replace the GTFS value.",
  planRef: "Part 3 section 3.9 transit stop",
  shape: "facts",
  counting: "canonical",
  fields: [
    ...statusEnvelope,
    fact("gtfs_stop_id", "optional", "identity", str, "Agency GTFS stop id. Empty location_type in GTFS is already normalised by the importer; this schema does not redo that default."),
    fact("agency_id", "required", "identity", str, "Operator id."),
    fact("agency_name", "required", "identity", str, "Operator name as published. Not an endorsement."),
    fact("stop_name", "required", "identity", str, "Stop name as published by the operator."),
    fact("stop_name_fr", "optional", "identity", str, "French stop name where published. Does not add a piece when stop_name is populated.", {
      count: "translation",
      translationOf: "stop_name",
    }),
    fact("stop_type", "optional", "identity", {
      type: "enum",
      values: ["stop", "station", "station_entrance", "entrance_exit", "platform", "boarding_area", "generic_node", "other"],
    }, "Stop type. entrance_exit, boarding_area, and generic_node are the access-maps GTFS normalisations and are not relabelled."),
    fact("parent_station_id", "optional", "identity", str, "Parent station id where the operator publishes one."),
    fact("latitude", "optional", "identity", num, "Latitude in WGS84."),
    fact("longitude", "optional", "identity", num, "Longitude in WGS84."),
    fact("location_accuracy_m", "optional", "identity", { type: "measurement", unit: "m" }, "Location accuracy when known."),
    fact("gtfs_wheelchair_boarding", "optional", "accessibility", {
      type: "enum",
      values: [
        "0_unknown",
        "1_some_vehicles_accessible",
        "2_boarding_not_possible",
        "some_vehicles_accessible",
        "boarding_not_possible",
      ],
    }, "Operator-reported GTFS wheelchair_boarding. some_vehicles_accessible is GTFS code 1. It is not an App verification that the station is step-free. Code 0 stays unknown and does not count."),
    fact("gtfs_feed_version", "optional", "directory", str, "Feed version or effective dates."),
    fact("gtfs_feed_date", "optional", "directory", date, "Feed publication or effective date."),
    fact("app_verified_step_free", "optional", "accessibility", bool, "App verification of step-free access. Supersedes the GTFS value only for display of this fact, and only when evidence is present. Never copied from wheelchair_boarding.", { triState: true }),
    fact("app_verification_date", "optional", "accessibility", date, "Date of the App step-free verification."),
    fact("platform_access_note", "optional", "accessibility", str, "Level boarding, mini-platform, ramp, or lift, as verified or as published and labelled."),
    fact("shelter_present", "optional", "accessibility", bool, "Shelter observed.", { triState: true }),
    fact("seating_present", "optional", "accessibility", bool, "Seating observed.", { triState: true }),
    fact("lighting_note", "optional", "accessibility", str, "Lighting note."),
    fact("approach_note", "optional", "accessibility", str, "Approach path. Measured approach segments are separate records."),
    fact("fare_media_note", "optional", "directory", str, "Fare media as published for this operator. Not generalised across operators."),
    fact("support_person_note", "optional", "accessibility", str, "Support-person policy summary with a link or source. Not eligibility advice."),
  ],
};

export const elevatorAssetRecord: RecordDef = {
  recordType: "elevator_asset",
  schemaVersion: "elevator-asset-1.0.0",
  title: "Elevator asset",
  description:
    "One elevator or escalator asset. Live status is a separate outage record so a stale status cannot overwrite the asset.",
  planRef: "Part 1 section 5.2 and Part 3 section 3.9",
  shape: "facts",
  counting: "canonical",
  fields: [
    ...statusEnvelope,
    systemEnvelope("parent_id", "parent_id", "Station or place id. Does not count.", str),
    fact("asset_kind", "required", "identity", { type: "enum", values: ["elevator", "escalator", "platform_lift", "other"] }, "Asset kind."),
    fact("asset_name", "optional", "identity", str, "Operator's name or code for this asset."),
    fact("operator_name", "required", "directory", str, "Who operates the asset. Displayed with the help number. Not an endorsement."),
    fact("help_number", "optional", "accessibility", str, "Help number published for this asset, such as an elevator status line."),
    fact("floors_served", "optional", "accessibility", str, "Floors served as published or observed."),
    fact("car_width_mm", "optional", "accessibility", mm, "Car width measured or taken from an operator sheet that states the dimension."),
    fact("car_depth_mm", "optional", "accessibility", mm, "Car depth measured or taken from an operator sheet that states the dimension."),
    fact("door_clear_width_mm", "optional", "accessibility", mm, "Door clear width."),
    fact("control_height_note", "optional", "accessibility", str, "Control heights as measured or published."),
    fact("signals_note", "optional", "accessibility", str, "Audible and visible signals as observed."),
    fact("single_point_of_failure", "optional", "accessibility", bool, "True when this asset is the only step-free path. Unknown stays unknown.", { triState: true }),
    fact("alternate_route_note", "optional", "accessibility", str, "Alternate step-free route when one has been verified. Absence of text is not an alternate."),
  ],
};

export const outageRecord: RecordDef = {
  recordType: "outage",
  schemaVersion: "outage-1.0.0",
  title: "Elevator outage",
  description:
    "One timestamped status observation for one asset. Counted only inside the 30-day snapshot window. A missing status is unknown, never working.",
  planRef: "Part 1 section 5.5 Tier 4 and Part 5 Day 1 elevator outage",
  shape: "facts",
  counting: "status_snapshot",
  fields: [
    ...statusEnvelope,
    systemEnvelope("asset_id", "asset_id", "Elevator asset id. Does not count.", str),
    systemEnvelope("parent_id", "parent_id", "Station or place id. Does not count.", str),
    fact("status", "required", "status", {
      type: "enum",
      values: ["in_service", "out_of_service", "planned_outage", "unknown"],
    }, "Status from the feed or report. There is no default."),
    fact("reported_at", "required", "status", timestamp, "When the operator or reporter said the status was observed."),
    fact("received_at", "required", "status", timestamp, "When the App received the status."),
    fact("expires_at", "required", "status", timestamp, "When this observation must no longer be shown as current."),
    fact("feed_age_seconds", "optional", "status", num, "Age of the feed at receipt, when the feed provides it."),
    fact("alternate_available", "optional", "status", bool, "Whether a verified alternate was known at this time. Unknown is not an alternate.", { triState: true }),
    fact("effect_note", "optional", "status", str, "What the outage blocks, in the operator's words or a verifier's observation. Not a guessed reroute."),
  ],
};

export const chargingRecord: RecordDef = {
  recordType: "charging",
  schemaVersion: "charging-1.0.0",
  title: "Charging",
  description: "One charging point for a mobility device or a phone. Presence without connector, hours, and access is not a complete charging fact set.",
  planRef: "Part 1 section 5.2 transport, charging, and live-status fields",
  shape: "facts",
  counting: "canonical",
  fields: [
    ...statusEnvelope,
    systemEnvelope("place_id", "place_id", "Place id when the point is inside a place. Does not count.", str),
    fact("charging_present", "required", "accessibility", bool, "Whether a charging point was observed or published.", { triState: true }),
    fact("location_description", "optional", "accessibility", str, "Where the outlet is."),
    fact("connector_type", "optional", "accessibility", str, "Connector as labelled. Do not guess a plug from a photo that does not show it."),
    fact("plug_type", "optional", "accessibility", str, "Plug type as labelled."),
    fact("hours", "optional", "accessibility", str, "Hours charging is available."),
    fact("access_note", "optional", "accessibility", str, "Who can use it and how, as published or observed."),
    fact("cost_note", "optional", "directory", str, "Cost or free status as published. Not pricing advice."),
    fact("seating_while_charging", "optional", "accessibility", bool, "Seating while charging.", { triState: true }),
  ],
};

export const repairSupplyRecord: RecordDef = {
  recordType: "repair_supply",
  schemaVersion: "repair-supply-1.0.0",
  title: "Repair and supply",
  description:
    "A directory entry for repair, parts, pharmacy, or supply. Linking and hours only. No eligibility, no prescription, and no recommendation.",
  planRef: "Part 1 section 5.2 repair and supply proximity",
  shape: "facts",
  counting: "canonical",
  fields: [
    ...statusEnvelope,
    fact("name_en", "required", "identity", str, "Published name."),
    fact("name_fr", "optional", "identity", str, "French name where published.", { count: "translation", translationOf: "name_en" }),
    fact("service_kind", "required", "identity", {
      type: "enum",
      values: ["repair", "parts", "pharmacy", "supply", "other"],
    }, "What the listing is. pharmacy is a directory category, not a clinical recommendation."),
    fact("hours", "optional", "directory", str, "Published hours."),
    fact("mobile_service", "optional", "directory", bool, "Whether mobile service is published.", { triState: true }),
    fact("out_of_hours", "optional", "directory", bool, "Whether out-of-hours availability is published.", { triState: true }),
    fact("phone", "optional", "directory", str, "Public phone."),
    fact("official_url", "optional", "directory", { type: "url" }, "Official page."),
    fact("address", "optional", "identity", str, "Published address or service area."),
    fact("latitude", "optional", "identity", num, "Latitude when the source publishes one."),
    fact("longitude", "optional", "identity", num, "Longitude when the source publishes one."),
  ],
};
