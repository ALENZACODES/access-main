import { PROVENANCE_ID, SCHEMA_ID_BASE } from "./catalog/index.js";

export const GAME_NAMES = [
  "Grid Recall",
  "Pair Sequence",
  "Route Planner",
  "Pattern Rules",
  "Word Roots Builder",
  "Number Compare",
  "Focus Flankers",
  "Switch Rules",
  "Shape Assembly",
  "Order Keeper",
] as const;

export const NO_MEDICAL_CLAIMS_NOTICE = "notice.games.no-medical-or-cognitive-claims.v1";

function id(name: string): string {
  return `${SCHEMA_ID_BASE}/canonical/${name}.schema.json`;
}

export function flatSchemas(): Record<string, Record<string, unknown>> {
  const provenance = { $ref: PROVENANCE_ID };
  const gameDefinition: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("game-definition"),
    title: "Game definition",
    description:
      "One of the ten starter games named in the Part 5 scope lock. The notice id is required. No health or cognition outcome is stored.",
    type: "object",
    additionalProperties: false,
    required: [
      "record_type",
      "schema_version",
      "id",
      "name",
      "timing_mode",
      "input_modes",
      "colour_independence_note",
      "no_medical_claims_notice_id",
      "publication_context",
      "provenance",
    ],
    properties: {
      record_type: { const: "game_definition" },
      schema_version: { const: "game-definition-1.0.0" },
      id: { type: "string", minLength: 1 },
      example: { type: "boolean" },
      publication_context: { enum: ["canonical", "prototype"] },
      name: { enum: [...GAME_NAMES] },
      task_family: { type: "string" },
      timing_mode: { type: "string", minLength: 1 },
      input_modes: {
        type: "array",
        minItems: 1,
        items: { enum: ["keyboard", "tap", "switch", "voice"] },
      },
      colour_independence_note: { type: "string", minLength: 1 },
      no_medical_claims_notice_id: { const: NO_MEDICAL_CLAIMS_NOTICE },
      provenance,
    },
    allOf: [prototypeGuard()],
  };

  const gameSet: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("game-definition-set"),
    title: "Ten starter games",
    type: "array",
    minItems: GAME_NAMES.length,
    maxItems: GAME_NAMES.length,
    items: { $ref: id("game-definition") },
    allOf: GAME_NAMES.map((name) => ({
      contains: { type: "object", required: ["name"], properties: { name: { const: name } } },
    })),
  };

  const gameSession: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("game-session"),
    title: "Game session",
    description: "A local session. Scores are not a health or cognition measure.",
    type: "object",
    additionalProperties: false,
    required: ["record_type", "schema_version", "id", "game_name", "storage", "score_note"],
    properties: {
      record_type: { const: "game_session" },
      schema_version: { const: "game-session-1.0.0" },
      id: { type: "string", minLength: 1 },
      game_name: { enum: [...GAME_NAMES] },
      started_at: { type: "string" },
      timing_mode_used: { type: "string" },
      completed: { type: "boolean" },
      storage: { const: "local_device_only" },
      score_note: { const: "scores are not a health or cognition measure" },
    },
  };

  const profile: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("user-profile"),
    title: "User profile",
    description:
      "Device-only preferences for filtering and display. Profile name is the only required preference. Chair size and transfer side are optional and user-stated. No diagnosis, medication, injury level, location history, clinical reminder, pressure-relief timer, washroom interval, or continuous-travel limit. Health-aware timing is out of the prototype.",
    type: "object",
    additionalProperties: false,
    required: ["record_type", "schema_version", "id", "profile_name", "storage", "server_persistence"],
    properties: {
      record_type: { const: "user_profile" },
      schema_version: { const: "user-profile-1.0.0" },
      id: { type: "string", minLength: 1 },
      profile_name: { type: "string", minLength: 1 },
      storage: { const: "local_device_only" },
      server_persistence: { const: "forbidden" },
      language_preference: { enum: ["en", "fr"] },
      region_preference: { type: "string" },
      chair_type: { enum: ["power_chair", "manual_chair", "scooter", "walker", "other", "prefer_not_to_say"] },
      chair_width_mm: { type: "number", exclusiveMinimum: 0 },
      chair_length_mm: { type: "number", exclusiveMinimum: 0 },
      turning_circle_mm: { type: "number", exclusiveMinimum: 0 },
      transfer_type: { enum: ["left", "right", "both", "front", "prefer_not_to_say"] },
      gradient_tolerance: { enum: ["low", "moderate", "steep_rejected", "prefer_not_to_say"] },
      preferences: { type: "string" },
      routing_preference: { enum: ["low_slope", "shortest_distance", "charging_aware", "balanced"] },
      text_size_preference: { enum: ["system", "large", "extra_large"] },
      reduced_motion_preference: { type: "boolean" },
      high_contrast_preference: { type: "boolean" },
      screen_reader_user: { type: "boolean" },
      switch_or_voice_user: { type: "boolean" },
      saved_place_ids: { type: "array", items: { type: "string" } },
      created_at: { type: "string" },
      updated_at: { type: "string" },
    },
  };

  const journey: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("journey"),
    title: "Journey",
    description:
      "A derived trip plan. step_free_status is required on every leg and has no default. unknown is not step-free. Times are scheduled. The journey does not count toward the headline piece total.",
    type: "object",
    additionalProperties: false,
    required: ["record_type", "schema_version", "id", "realtime_claimed", "explanation", "legs", "provenance", "publication_context"],
    properties: {
      record_type: { const: "journey" },
      schema_version: { const: "journey-1.0.0" },
      id: { type: "string", minLength: 1 },
      example: { type: "boolean" },
      publication_context: { enum: ["canonical", "prototype"] },
      realtime_claimed: { const: false },
      explanation: { type: "string", minLength: 1 },
      provenance,
      legs: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["leg_id", "mode", "step_free_status", "source_name"],
          properties: {
            leg_id: { type: "string", minLength: 1 },
            mode: { enum: ["walk_roll", "transit", "paratransit_link", "transfer", "return"] },
            from_label: { type: "string" },
            to_label: { type: "string" },
            step_free_status: { enum: ["step_free", "unknown", "not_step_free"] },
            distance_m: { anyOf: [{ type: "number" }, { enum: ["unknown", "UNKNOWN"] }] },
            surface_note: { anyOf: [{ type: "string" }, { enum: ["unknown", "UNKNOWN"] }] },
            gradient_note: { anyOf: [{ type: "string" }, { enum: ["unknown", "UNKNOWN"] }] },
            source_name: { type: "string", minLength: 1 },
            time_label: { const: "scheduled" },
          },
        },
      },
    },
    allOf: [prototypeGuard()],
  };

  const city: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("city-skeleton"),
    title: "City skeleton",
    description: "A thin city record. not_yet_seeded must name at least one gap. It cannot imply a deep seed.",
    type: "object",
    additionalProperties: false,
    required: ["record_type", "schema_version", "id", "city_name", "province", "not_yet_seeded", "provenance", "publication_context"],
    properties: {
      record_type: { const: "city_skeleton" },
      schema_version: { const: "city-skeleton-1.0.0" },
      id: { type: "string", minLength: 1 },
      example: { type: "boolean" },
      publication_context: { enum: ["canonical", "prototype"] },
      city_name: { type: "string", minLength: 1 },
      province: { const: "Ontario" },
      transit_system_names: { type: "array", items: { type: "string" } },
      paratransit_name: { anyOf: [{ type: "string" }, { enum: ["unknown", "UNKNOWN"] }] },
      booking_contact: { anyOf: [{ type: "string" }, { enum: ["unknown", "UNKNOWN"] }] },
      not_yet_seeded: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
      provenance,
    },
    allOf: [prototypeGuard()],
  };

  const correction: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("correction-report"),
    title: "Correction report",
    description:
      "A local correction. Prototype reports stay pending and do not change the published record. Free text does not count as pieces.",
    type: "object",
    additionalProperties: false,
    required: [
      "record_type",
      "schema_version",
      "id",
      "target_record_type",
      "target_record_id",
      "field_name",
      "suggested_correction",
      "moderation_status",
      "storage",
      "changes_published_record",
      "provenance",
      "publication_context",
    ],
    properties: {
      record_type: { const: "correction_report" },
      schema_version: { const: "correction-report-1.0.0" },
      id: { type: "string", minLength: 1 },
      example: { type: "boolean" },
      publication_context: { enum: ["canonical", "prototype"] },
      target_record_type: {
        enum: ["place", "entrance", "washroom", "parking", "transit_stop", "segment", "elevator_asset", "outage"],
      },
      target_record_id: { type: "string", minLength: 1 },
      field_name: { type: "string", minLength: 1 },
      suggested_correction: { type: "string", minLength: 1 },
      note: { type: "string" },
      moderation_status: { const: "pending" },
      storage: { const: "local_device_only" },
      changes_published_record: { const: false },
      provenance,
    },
    allOf: [prototypeGuard()],
  };

  const source: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("source"),
    title: "Source",
    description:
      "A dataset or feed in the source register. Compatible with the access-maps source registry entry, which does not yet store share_alike. Provenance, not a headline data piece. odblShareAlikeMissing reports an ODbL row whose share_alike is not true.",
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "kind", "url", "download_url", "licence_name", "licence_url", "licence_id", "attribution", "retrieved_at", "tier"],
    properties: {
      id: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      kind: { enum: ["osm", "gtfs", "municipal", "operator_page", "desk", "field_verification", "user_report"] },
      url: { type: "string", minLength: 1 },
      download_url: { type: "string", minLength: 1 },
      licence_name: { type: "string", minLength: 1 },
      licence_url: { type: "string", minLength: 1 },
      licence_id: { type: "string", minLength: 1 },
      attribution: { type: "string", minLength: 1 },
      retrieved_at: { type: "string", format: "date" },
      tier: { enum: [0, 1, 2, 3, 4] },
      tier_note: { type: "string" },
      notes: { type: "string" },
      share_alike: { type: "boolean" },
      confirmation_status: { enum: ["confirmed", "pending"] },
    },
  };

  const licence: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id("licence"),
    title: "Licence",
    description: "One licence in the register. Attribution text is stored. This row is provenance, not a data piece.",
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "url", "attribution", "confirmation_status", "confirmed_on"],
    properties: {
      id: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      url: { type: "string", minLength: 1 },
      attribution: { type: "string", minLength: 1 },
      share_alike: { type: "boolean" },
      confirmation_status: { enum: ["confirmed", "pending"] },
      confirmed_on: { type: "string", format: "date" },
    },
  };

  return {
    "canonical/game-definition.schema.json": gameDefinition,
    "canonical/game-definition-set.schema.json": gameSet,
    "canonical/game-session.schema.json": gameSession,
    "canonical/user-profile.schema.json": profile,
    "canonical/journey.schema.json": journey,
    "canonical/city-skeleton.schema.json": city,
    "canonical/correction-report.schema.json": correction,
    "canonical/source.schema.json": source,
    "canonical/licence.schema.json": licence,
  };
}

function prototypeGuard(): Record<string, unknown> {
  return {
    if: { properties: { publication_context: { const: "prototype" } }, required: ["publication_context"] },
    then: {
      properties: {
        provenance: {
          type: "object",
          required: ["prototype_label"],
          properties: {
            prototype_label: { enum: ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA"] },
            tier: { enum: [0, 1] },
          },
        },
      },
    },
  };
}

export function freshnessPolicySchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${SCHEMA_ID_BASE}/common/freshness-policy.schema.json`,
    title: "Freshness policy",
    type: "object",
    additionalProperties: false,
    required: ["headline_max_age_days", "status_snapshot_days", "winter_months", "layers"],
    properties: {
      headline_max_age_days: { const: 730 },
      status_snapshot_days: { const: 30 },
      winter_months: { const: [11, 12, 1, 2, 3, 4] },
      layers: { type: "array", minItems: 1 },
    },
  };
}

export function freshnessPolicyDocument(): Record<string, unknown> {
  return {
    headline_max_age_days: 730,
    status_snapshot_days: 30,
    winter_months: [11, 12, 1, 2, 3, 4],
    layers: [
      { id: "tier_3_surveyor", stale_after_days: 365, estimate: false, source: "Part 1 section 5.5: annual re-contact" },
      { id: "tier_2_washroom", stale_after_days: 90, estimate: true, source: "Part 1 section 5.5 marks 90 days ESTIMATE" },
      { id: "tier_2_venue", stale_after_days: 180, estimate: true, source: "Part 1 section 5.5 marks 180 days ESTIMATE" },
      { id: "tier_1_claim", stale_after_days: 180, estimate: true, source: "Part 1 section 5.5 marks 180 days ESTIMATE" },
      { id: "washroom_layer", stale_after_days: 90, estimate: true, source: "Part 1 section 5.5 layer table, ESTIMATE" },
      { id: "venue_measurements", stale_after_days: 365, estimate: false, source: "Part 1 section 5.5: 12 months without re-contact" },
      { id: "benefits", stale_after_days: 90, estimate: true, source: "Quarterly check. Exact indexation date comes from the programme, not from this policy." },
      { id: "status_snapshot", stale_after_days: 30, estimate: false, source: "Part 3 Table T3-13 line 7 and Table T3-12" },
      { id: "headline_exclusion", stale_after_days: 730, estimate: false, source: "Part 3 Table T3-15: older than 730 days leaves the headline" },
    ],
    display_rule: "Stale values stay visible with a stale label. They stay in the headline total until 730 days. Status observations leave the headline after 30 days.",
  };
}
