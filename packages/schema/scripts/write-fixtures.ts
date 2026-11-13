import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_NAMES, NO_MEDICAL_CLAIMS_NOTICE } from "../src/flat-schemas.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "fixtures");

function write(relative: string, value: unknown): void {
  const file = path.join(dir, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const fact = (value: unknown, tier: 0 | 1 | 2 | 3 | "E" = 0) => ({
  value,
  source_id: "example",
  licence: "not-a-real-dataset",
  retrieved_at: "2026-11-13",
  tier,
});

const provenance = {
  tier: 0,
  prototype_label: "PROTOTYPE-UNVERIFIED",
  source_name: "Synthetic example, not a real place or programme",
  source_id: "example",
  source_date: "2026-11-13",
  record_date: "2026-11-13",
  licence_id: "not-a-real-dataset",
  retrieved_at: "2026-11-13",
};

write("valid/place.prototype-unverified.synthetic.json", {
  record_type: "place",
  schema_version: "place-1.0.0",
  id: "example-place",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    name_en: fact("Example Cafe"),
    step_free_route_exists: fact("unknown"),
    interior_path_min_width_mm: fact("unknown"),
  },
});

write("valid/entrance.tier3-with-evidence.synthetic.json", {
  record_type: "entrance",
  schema_version: "entrance-1.0.0",
  id: "example-entrance",
  place_id: "example-place",
  record_status: "draft",
  publication_context: "canonical",
  example: true,
  provenance: {
    tier: 3,
    source_name: "Synthetic survey, not a real entrance",
    source_id: "example",
    source_date: "2026-11-13",
    record_date: "2026-11-13",
    licence_id: "not-a-real-dataset",
    retrieved_at: "2026-11-13",
    evidence: {
      protocol_version: "measurement-protocol-1.0.0",
      verifier_role: "trained_verifier",
      method: "tape, door open to 90 degrees, nearest 5 mm",
      observed_at: "2026-11-13",
      photo_ids: ["example-photo"],
    },
  },
  facts: {
    door_clear_width_mm: {
      ...fact(820, 3),
      unit: "mm",
      method: "tape, door open to 90 degrees, nearest 5 mm",
      observed_at: "2026-11-13",
      evidence: {
        protocol_version: "measurement-protocol-1.0.0",
        verifier_role: "trained_verifier",
        method: "tape, door open to 90 degrees, nearest 5 mm",
        observed_at: "2026-11-13",
        photo_ids: ["example-photo"],
      },
    },
    step_free: fact("unknown"),
    hoist_present: undefined,
  },
});

write("valid/washroom.unknown-measurements.synthetic.json", {
  record_type: "washroom",
  schema_version: "washroom-1.0.0",
  id: "example-washroom",
  place_id: "example-place",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    washroom_name: fact("Example universal washroom"),
    transfer_side: fact("unknown"),
    turning_space_diameter_mm: fact("unknown"),
    adult_change_table_present: fact("unknown"),
    adult_change_table_load_kg: fact("unknown"),
    hoist_present: fact("unknown"),
    hoist_type: fact("unknown"),
    hoist_sling_policy: fact("unknown"),
    door_lock_type: fact("unknown"),
  },
});

write("valid/parking.no-privilege.synthetic.json", {
  record_type: "parking",
  schema_version: "parking-1.0.0",
  id: "example-parking",
  place_id: "example-place",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    record_level: fact("lot"),
    bay_type: fact("unknown_recorded"),
    distance_to_entrance_m: fact("unknown"),
  },
});

write("valid/transit-stop.operator-reported.synthetic.json", {
  record_type: "transit_stop",
  schema_version: "transit-stop-1.0.0",
  id: "example-stop",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance: { ...provenance, tier: 1, prototype_label: "PROTOTYPE-UNVERIFIED" },
  facts: {
    agency_id: { ...fact("example-agency", 1) },
    agency_name: fact("Example Transit", 1),
    stop_name: fact("Example Station", 1),
    gtfs_wheelchair_boarding: fact("unknown", 1),
    app_verified_step_free: fact("unknown", 1),
  },
});

write("valid/outage.unknown-status.synthetic.json", {
  record_type: "outage",
  schema_version: "outage-1.0.0",
  id: "example-outage",
  asset_id: "example-elevator",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    status: fact("unknown"),
    reported_at: fact("2026-11-13T15:00:00Z"),
    received_at: fact("2026-11-13T15:01:00Z"),
    expires_at: fact("2026-11-13T18:00:00Z"),
  },
});

write("valid/elevator-asset.unknown-dimensions.synthetic.json", {
  record_type: "elevator_asset",
  schema_version: "elevator-asset-1.0.0",
  id: "example-elevator",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    asset_kind: fact("elevator"),
    operator_name: fact("Example operator, not a real agency"),
    car_width_mm: fact("unknown"),
    door_clear_width_mm: fact("unknown"),
    single_point_of_failure: fact("unknown"),
  },
});

write("valid/charging.unknown.synthetic.json", {
  record_type: "charging",
  schema_version: "charging-1.0.0",
  id: "example-charging",
  place_id: "example-place",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    charging_present: fact("unknown"),
    connector_type: fact("unknown"),
    plug_type: fact("unknown"),
  },
});

write("valid/repair-supply.directory-only.synthetic.json", {
  record_type: "repair_supply",
  schema_version: "repair-supply-1.0.0",
  id: "example-repair",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    name_en: fact("Example Repair Desk"),
    service_kind: fact("repair"),
    mobile_service: fact("unknown"),
  },
});

write("valid/benefits.desk-link.synthetic.json", {
  record_type: "benefits_directory",
  schema_version: "benefits-directory-1.0.0",
  id: "example-benefit",
  record_status: "published",
  publication_context: "prototype",
  example: true,
  provenance: { ...provenance, tier: 1 },
  facts: {
    name_en: fact("Example Benefit, not a real programme", 1),
    administering_body: fact("Example department", 1),
    organisation_type: fact("government_provincial", 1),
    benefit_type: fact("example income support", 1),
    official_url: fact("https://example.test/benefit", 1),
    official_url_checked_on: fact("2026-11-13", 1),
    desk_verified_date: fact("2026-11-13", 1),
    eligibility_general_note: fact("See the official page. This record is not an eligibility decision.", 1),
    rate_or_amount_text: fact("unknown", 1),
  },
});

write("valid/segment.summer-note.synthetic.json", {
  record_type: "segment",
  schema_version: "segment-1.0.0",
  id: "example-segment",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    segment_type: fact("sidewalk"),
    width_min_mm: fact("unknown"),
    gradient_max_percent: fact("unknown"),
    snow_status: fact("unknown_recorded"),
  },
});

write("valid/journey.unknown-approach.synthetic.json", {
  record_type: "journey",
  schema_version: "journey-1.0.0",
  id: "example-journey",
  publication_context: "prototype",
  example: true,
  realtime_claimed: false,
  explanation: "Scheduled example. The approach distance is unknown. This is not a real trip.",
  provenance,
  legs: [
    {
      leg_id: "approach",
      mode: "walk_roll",
      step_free_status: "unknown",
      distance_m: "unknown",
      surface_note: "unknown",
      gradient_note: "unknown",
      source_name: "Synthetic example, not a real place or programme",
      time_label: "scheduled",
    },
  ],
});

write("valid/user-profile.local.synthetic.json", {
  record_type: "user_profile",
  schema_version: "user-profile-1.0.0",
  id: "example-profile",
  profile_name: "Example chair",
  storage: "local_device_only",
  server_persistence: "forbidden",
  chair_type: "power_chair",
  transfer_type: "left",
});

write("valid/city-skeleton.gap-stated.synthetic.json", {
  record_type: "city_skeleton",
  schema_version: "city-skeleton-1.0.0",
  id: "example-city",
  publication_context: "prototype",
  example: true,
  city_name: "Example City",
  province: "Ontario",
  transit_system_names: [],
  paratransit_name: "unknown",
  booking_contact: "unknown",
  not_yet_seeded: ["washrooms", "entrances", "elevator status"],
  provenance,
});

write("valid/correction-report.pending.synthetic.json", {
  record_type: "correction_report",
  schema_version: "correction-report-1.0.0",
  id: "example-correction",
  publication_context: "prototype",
  example: true,
  target_record_type: "washroom",
  target_record_id: "example-washroom",
  field_name: "hoist_present",
  suggested_correction: "unknown",
  note: "Synthetic correction. It does not change the record.",
  moderation_status: "pending",
  storage: "local_device_only",
  changes_published_record: false,
  provenance,
});

write(
  "valid/game-definitions.scope-lock.synthetic.json",
  GAME_NAMES.map((name, index) => ({
    record_type: "game_definition",
    schema_version: "game-definition-1.0.0",
    id: `example-game-${index + 1}`,
    publication_context: "prototype",
    example: true,
    name,
    timing_mode: "untimed",
    input_modes: ["keyboard", "tap"],
    colour_independence_note: "Shape and text labels carry the meaning. Colour is not the only signal.",
    no_medical_claims_notice_id: NO_MEDICAL_CLAIMS_NOTICE,
    provenance,
  })),
);

write("valid/game-session.local.synthetic.json", {
  record_type: "game_session",
  schema_version: "game-session-1.0.0",
  id: "example-session",
  game_name: "Grid Recall",
  storage: "local_device_only",
  score_note: "scores are not a health or cognition measure",
});

write("valid/licence.synthetic.json", {
  id: "not-a-real-dataset",
  name: "Synthetic licence placeholder",
  url: "https://example.test/licence",
  attribution: "Synthetic example. Not an open-data licence.",
  share_alike: false,
  confirmation_status: "pending",
  confirmed_on: "2026-11-13",
});

write("invalid/place.missing-tier.synthetic.json", {
  record_type: "place",
  schema_version: "place-1.0.0",
  id: "example-place-missing-tier",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance: {
    prototype_label: "PROTOTYPE-UNVERIFIED",
    source_name: "Synthetic example, not a real place or programme",
    source_id: "example",
    source_date: "2026-11-13",
    record_date: "2026-11-13",
    licence_id: "not-a-real-dataset",
    retrieved_at: "2026-11-13",
  },
});

write("invalid/place.verified-without-evidence.synthetic.json", {
  record_type: "place",
  schema_version: "place-1.0.0",
  id: "example-place-verified",
  record_status: "draft",
  publication_context: "canonical",
  example: true,
  provenance: {
    tier: 3,
    prototype_label: "VERIFIED",
    source_name: "Synthetic example, not a real place or programme",
    source_id: "example",
    source_date: "2026-11-13",
    record_date: "2026-11-13",
    licence_id: "not-a-real-dataset",
    retrieved_at: "2026-11-13",
  },
});

write("invalid/place.prototype-verified.synthetic.json", {
  record_type: "place",
  schema_version: "place-1.0.0",
  id: "example-place-prototype-verified",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance: {
    tier: 3,
    prototype_label: "VERIFIED",
    source_name: "Synthetic example, not a real place or programme",
    source_id: "example",
    source_date: "2026-11-13",
    record_date: "2026-11-13",
    licence_id: "not-a-real-dataset",
    retrieved_at: "2026-11-13",
  },
});

write("invalid/entrance.measurement-without-unit.synthetic.json", {
  record_type: "entrance",
  schema_version: "entrance-1.0.0",
  id: "example-entrance-bad-width",
  place_id: "example-place",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    door_clear_width_mm: fact(900),
  },
});

write("invalid/parking.privilege-without-source.synthetic.json", {
  record_type: "parking",
  schema_version: "parking-1.0.0",
  id: "example-parking-privilege",
  place_id: "example-place",
  record_status: "draft",
  publication_context: "prototype",
  example: true,
  provenance,
  facts: {
    record_level: fact("lot"),
    privilege_details: fact("free parking"),
    privilege_municipality: fact("unknown"),
    privilege_source: fact("unknown"),
  },
});

write("invalid/user-profile.diagnosis.synthetic.json", {
  record_type: "user_profile",
  schema_version: "user-profile-1.0.0",
  id: "example-profile-diagnosis",
  profile_name: "Example",
  storage: "local_device_only",
  server_persistence: "forbidden",
  diagnosis: "not collected",
});

write("invalid/journey.missing-step-free.synthetic.json", {
  record_type: "journey",
  schema_version: "journey-1.0.0",
  id: "example-journey-bad",
  publication_context: "prototype",
  example: true,
  realtime_claimed: false,
  explanation: "Missing step-free status must fail.",
  provenance,
  legs: [
    {
      leg_id: "approach",
      mode: "walk_roll",
      source_name: "Synthetic example, not a real place or programme",
    },
  ],
});

write("invalid/game-definition.lumosity-name.synthetic.json", {
  record_type: "game_definition",
  schema_version: "game-definition-1.0.0",
  id: "example-game-bad",
  publication_context: "prototype",
  example: true,
  name: "Lumosity",
  timing_mode: "untimed",
  input_modes: ["keyboard"],
  colour_independence_note: "n/a",
  no_medical_claims_notice_id: NO_MEDICAL_CLAIMS_NOTICE,
  provenance,
});

write("invalid/washroom.tier3-without-photos.synthetic.json", {
  record_type: "washroom",
  schema_version: "washroom-1.0.0",
  id: "example-washroom-tier3",
  place_id: "example-place",
  record_status: "draft",
  publication_context: "canonical",
  example: true,
  provenance: {
    tier: 3,
    source_name: "Synthetic survey, not a real washroom",
    source_id: "example",
    source_date: "2026-11-13",
    record_date: "2026-11-13",
    licence_id: "not-a-real-dataset",
    retrieved_at: "2026-11-13",
    evidence: {
      protocol_version: "measurement-protocol-1.0.0",
      verifier_role: "trained_verifier",
      method: "tape",
      observed_at: "2026-11-13",
    },
  },
});

console.log("fixtures written");
