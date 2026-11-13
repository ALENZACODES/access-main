import { findForbiddenKeys, type FieldIssue } from "./provenance.ts";

export const PROFILE_SCHEMA_VERSION = "user-profile-1.0.0";
export const LOCAL_USER_ID = "local";
export const PRIVACY_POLICY_VERSION = "privacy-local-1";

export const EQUIPMENT_TYPES = [
  "power_chair",
  "manual_chair",
  "scooter",
  "walker",
  "walking_with_chair_in_car",
  "other",
  "prefer_not_to_say",
] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const TRANSFER_SIDES = ["left", "right", "both", "front", "prefer_not_to_say"] as const;
export type TransferSide = (typeof TRANSFER_SIDES)[number];

export const ROUTING_PREFERENCES = ["low_slope", "shortest_distance", "charging_aware", "balanced"] as const;
export type RoutingPreference = (typeof ROUTING_PREFERENCES)[number];

export const TEXT_SIZES = ["system", "large", "extra_large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface ConsentRecord {
  purpose: "store-preferences-on-device";
  policy_version: typeof PRIVACY_POLICY_VERSION;
  granted_at: string;
  withdrawn_at: string | null;
}

/**
 * Privacy-minimised preferences. Stored on the device only.
 * Timing fields are whatever the person typed. There is no clinical default.
 * Injury level, diagnosis, and location history are not fields.
 */
export interface UserProfile {
  record_type: "user_profile";
  schema_version: typeof PROFILE_SCHEMA_VERSION;
  user_id: typeof LOCAL_USER_ID;
  storage: "device-only";
  account_status: "anonymous";
  language_preference: "en" | "fr";
  region_preference: string | null;
  equipment_type_general: EquipmentType | null;
  chair_width_mm: number | null;
  chair_length_mm: number | null;
  transfer_side_preference: TransferSide | null;
  attendant_travels: boolean | null;
  max_time_between_washrooms_min: number | null;
  max_continuous_travel_min: number | null;
  pressure_relief_reminder: boolean | null;
  routing_preference: RoutingPreference | null;
  text_size_preference: TextSize;
  reduced_motion_preference: boolean | null;
  high_contrast_preference: boolean | null;
  screen_reader_user: boolean | null;
  switch_or_voice_user: boolean | null;
  notification_preferences: {
    local_only: true;
    remote_channels: [];
  };
  offline_pack_preferences: {
    wifi_only: boolean;
    storage_limit_mb: number | null;
  };
  saved_places: [];
  saved_trips: [];
  consent_records: ConsentRecord[];
  created_at: string;
  updated_at: string;
}

const MAX_MM = 2000;
const MAX_MINUTES = 24 * 60;
const MAX_STORAGE_MB = 500;
const MAX_REGION = 80;

function member<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function optionalInt(field: string, value: unknown, max: number, issues: FieldIssue[]): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    issues.push({ field, code: "not_integer" });
    return null;
  }
  if (value <= 0) issues.push({ field, code: "not_positive" });
  else if (value > max) issues.push({ field, code: "too_large" });
  return value;
}

export function createEmptyProfile(nowIso: string, language: "en" | "fr"): UserProfile {
  return {
    record_type: "user_profile",
    schema_version: PROFILE_SCHEMA_VERSION,
    user_id: LOCAL_USER_ID,
    storage: "device-only",
    account_status: "anonymous",
    language_preference: language,
    region_preference: null,
    equipment_type_general: null,
    chair_width_mm: null,
    chair_length_mm: null,
    transfer_side_preference: null,
    attendant_travels: null,
    max_time_between_washrooms_min: null,
    max_continuous_travel_min: null,
    pressure_relief_reminder: null,
    routing_preference: null,
    text_size_preference: "system",
    reduced_motion_preference: null,
    high_contrast_preference: null,
    screen_reader_user: null,
    switch_or_voice_user: null,
    notification_preferences: { local_only: true, remote_channels: [] },
    offline_pack_preferences: { wifi_only: true, storage_limit_mb: null },
    saved_places: [],
    saved_trips: [],
    consent_records: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export function validateProfile(profile: UserProfile): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (profile.record_type !== "user_profile") issues.push({ field: "record_type", code: "invalid_enum" });
  if (profile.schema_version !== PROFILE_SCHEMA_VERSION) issues.push({ field: "schema_version", code: "invalid_enum" });
  if (profile.user_id !== LOCAL_USER_ID) issues.push({ field: "user_id", code: "invalid_enum" });
  if (profile.storage !== "device-only") issues.push({ field: "storage", code: "not_device_only" });
  if (profile.account_status !== "anonymous") issues.push({ field: "account_status", code: "invalid_enum" });
  if (profile.language_preference !== "en" && profile.language_preference !== "fr") {
    issues.push({ field: "language_preference", code: "invalid_language" });
  }
  if (profile.region_preference !== null) {
    if (typeof profile.region_preference !== "string") {
      issues.push({ field: "region_preference", code: "invalid_enum" });
    } else if (profile.region_preference.length > MAX_REGION) {
      issues.push({ field: "region_preference", code: "too_long" });
    } else if (looksLikeContact(profile.region_preference)) {
      issues.push({ field: "region_preference", code: "looks_like_contact" });
    }
  }
  if (profile.equipment_type_general !== null && !member(profile.equipment_type_general, EQUIPMENT_TYPES)) {
    issues.push({ field: "equipment_type_general", code: "invalid_enum" });
  }
  optionalInt("chair_width_mm", profile.chair_width_mm, MAX_MM, issues);
  optionalInt("chair_length_mm", profile.chair_length_mm, MAX_MM, issues);
  if (profile.transfer_side_preference !== null && !member(profile.transfer_side_preference, TRANSFER_SIDES)) {
    issues.push({ field: "transfer_side_preference", code: "invalid_enum" });
  }
  for (const field of ["attendant_travels", "pressure_relief_reminder", "reduced_motion_preference", "high_contrast_preference", "screen_reader_user", "switch_or_voice_user"] as const) {
    const value = profile[field];
    if (value !== null && typeof value !== "boolean") issues.push({ field, code: "invalid_enum" });
  }
  optionalInt("max_time_between_washrooms_min", profile.max_time_between_washrooms_min, MAX_MINUTES, issues);
  optionalInt("max_continuous_travel_min", profile.max_continuous_travel_min, MAX_MINUTES, issues);
  if (profile.routing_preference !== null && !member(profile.routing_preference, ROUTING_PREFERENCES)) {
    issues.push({ field: "routing_preference", code: "invalid_enum" });
  }
  if (!member(profile.text_size_preference, TEXT_SIZES)) {
    issues.push({ field: "text_size_preference", code: "invalid_enum" });
  }
  if (!profile.notification_preferences?.local_only || profile.notification_preferences.remote_channels.length > 0) {
    issues.push({ field: "notification_preferences", code: "remote_notifications" });
  }
  optionalInt(
    "offline_pack_preferences.storage_limit_mb",
    profile.offline_pack_preferences?.storage_limit_mb ?? null,
    MAX_STORAGE_MB,
    issues,
  );
  if (profile.saved_places.length > 0) issues.push({ field: "saved_places", code: "places_not_in_profile" });
  if (profile.saved_trips.length > 0) issues.push({ field: "saved_trips", code: "places_not_in_profile" });
  issues.push(...findForbiddenKeys(profile));
  return issues;
}

export function looksLikeContact(value: string): boolean {
  if (value.includes("@")) return true;
  if (/https?:\/\//i.test(value)) return true;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7;
}

export function parseOptionalInt(field: string, raw: string, max: number): { value: number | null; issues: FieldIssue[] } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, issues: [] };
  if (trimmed.startsWith("-")) return { value: null, issues: [{ field, code: "not_positive" }] };
  if (!/^\d+$/.test(trimmed)) {
    const code = /\d/.test(trimmed) ? "not_integer" : "not_a_number";
    return { value: null, issues: [{ field, code }] };
  }
  const value = Number(trimmed);
  if (value <= 0) return { value: null, issues: [{ field, code: "not_positive" }] };
  if (value > max) return { value: null, issues: [{ field, code: "too_large" }] };
  return { value, issues: [] };
}

export function parseRegion(raw: string): { value: string | null; issues: FieldIssue[] } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, issues: [] };
  if (trimmed.length > MAX_REGION) return { value: null, issues: [{ field: "region_preference", code: "too_long" }] };
  if (looksLikeContact(trimmed)) return { value: null, issues: [{ field: "region_preference", code: "looks_like_contact" }] };
  return { value: trimmed, issues: [] };
}

export const LIMITS = { MAX_MM, MAX_MINUTES, MAX_STORAGE_MB, MAX_REGION } as const;

export function triState(raw: string): boolean | null {
  if (raw === "yes") return true;
  if (raw === "no") return false;
  return null;
}

export function triStateToDraft(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}
