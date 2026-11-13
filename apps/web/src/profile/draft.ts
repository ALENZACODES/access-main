import {
  EQUIPMENT_TYPES,
  LIMITS,
  LOCAL_USER_ID,
  PRIVACY_POLICY_VERSION,
  PROFILE_SCHEMA_VERSION,
  ROUTING_PREFERENCES,
  TEXT_SIZES,
  TRANSFER_SIDES,
  hasActiveConsent,
  parseOptionalInt,
  parseRegion,
  triState,
  triStateToDraft,
  validateProfile,
  type EquipmentType,
  type FieldIssue,
  type RoutingPreference,
  type TextSize,
  type TransferSide,
  type ConsentRecord,
  type UserProfile,
} from "@access/shared";

export interface ProfileDraft {
  language_preference: "en" | "fr";
  region_preference: string;
  equipment_type_general: string;
  chair_width_mm: string;
  chair_length_mm: string;
  transfer_side_preference: string;
  attendant_travels: string;
  routing_preference: string;
  text_size_preference: TextSize;
  reduced_motion_preference: string;
  high_contrast_preference: string;
  screen_reader_user: string;
  switch_or_voice_user: string;
  wifi_only: boolean;
  storage_limit_mb: string;
  /** Explicit consent to keep the preferences on this device. Never implied. */
  consent_granted: boolean;
}

export function emptyDraft(language: "en" | "fr"): ProfileDraft {
  return {
    language_preference: language,
    region_preference: "",
    equipment_type_general: "",
    chair_width_mm: "",
    chair_length_mm: "",
    transfer_side_preference: "",
    attendant_travels: "",
    routing_preference: "",
    text_size_preference: "system",
    reduced_motion_preference: "",
    high_contrast_preference: "",
    screen_reader_user: "",
    switch_or_voice_user: "",
    wifi_only: true,
    storage_limit_mb: "",
    consent_granted: false,
  };
}

function motionToDraft(value: boolean | null): string {
  if (value === true) return "reduce";
  if (value === false) return "allow";
  return "";
}

function motionFromDraft(raw: string): boolean | null {
  if (raw === "reduce") return true;
  if (raw === "allow") return false;
  return null;
}

function asMember<T extends string>(raw: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

export function draftFromProfile(profile: UserProfile): ProfileDraft {
  return {
    language_preference: profile.language_preference,
    region_preference: profile.region_preference ?? "",
    equipment_type_general: profile.equipment_type_general ?? "",
    chair_width_mm: profile.chair_width_mm === null ? "" : String(profile.chair_width_mm),
    chair_length_mm: profile.chair_length_mm === null ? "" : String(profile.chair_length_mm),
    transfer_side_preference: profile.transfer_side_preference ?? "",
    attendant_travels: triStateToDraft(profile.attendant_travels),
    routing_preference: profile.routing_preference ?? "",
    text_size_preference: profile.text_size_preference,
    reduced_motion_preference: motionToDraft(profile.reduced_motion_preference),
    high_contrast_preference: triStateToDraft(profile.high_contrast_preference),
    screen_reader_user: triStateToDraft(profile.screen_reader_user),
    switch_or_voice_user: triStateToDraft(profile.switch_or_voice_user),
    wifi_only: profile.offline_pack_preferences.wifi_only,
    storage_limit_mb:
      profile.offline_pack_preferences.storage_limit_mb === null
        ? ""
        : String(profile.offline_pack_preferences.storage_limit_mb),
    consent_granted: hasActiveConsent(profile),
  };
}

export function profileFromDraft(
  draft: ProfileDraft,
  existing: UserProfile | null,
  nowIso: string,
): { profile: UserProfile | null; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const region = parseRegion(draft.region_preference);
  const width = parseOptionalInt("chair_width_mm", draft.chair_width_mm, LIMITS.MAX_MM);
  const length = parseOptionalInt("chair_length_mm", draft.chair_length_mm, LIMITS.MAX_MM);
  const storage = parseOptionalInt("storage_limit_mb", draft.storage_limit_mb, LIMITS.MAX_STORAGE_MB);
  issues.push(...region.issues, ...width.issues, ...length.issues, ...storage.issues);
  if (!draft.consent_granted) issues.push({ field: "consent", code: "consent_required" });
  if (issues.length > 0) return { profile: null, issues };

  const equipment = asMember(draft.equipment_type_general, EQUIPMENT_TYPES);
  if (draft.equipment_type_general && !equipment) issues.push({ field: "equipment_type_general", code: "invalid_enum" });
  const transfer = asMember(draft.transfer_side_preference, TRANSFER_SIDES);
  if (draft.transfer_side_preference && !transfer) issues.push({ field: "transfer_side_preference", code: "invalid_enum" });
  const routing = asMember(draft.routing_preference, ROUTING_PREFERENCES);
  if (draft.routing_preference && !routing) issues.push({ field: "routing_preference", code: "invalid_enum" });
  const textSize = asMember(draft.text_size_preference, TEXT_SIZES) ?? "system";
  if (issues.length > 0) return { profile: null, issues };

  const previous = existing?.consent_records ?? [];
  const active = previous.find((record) => record.withdrawn_at === null);
  const consent_records: ConsentRecord[] = active
    ? previous
    : [
        ...previous,
        {
          purpose: "store-preferences-on-device" as const,
          policy_version: PRIVACY_POLICY_VERSION,
          granted_at: nowIso,
          withdrawn_at: null,
        },
      ];

  const profile: UserProfile = {
    record_type: "user_profile",
    schema_version: PROFILE_SCHEMA_VERSION,
    user_id: LOCAL_USER_ID,
    storage: "device-only",
    account_status: "anonymous",
    language_preference: draft.language_preference,
    region_preference: region.value,
    equipment_type_general: equipment as EquipmentType | null,
    chair_width_mm: width.value,
    chair_length_mm: length.value,
    transfer_side_preference: transfer as TransferSide | null,
    attendant_travels: triState(draft.attendant_travels),
    routing_preference: routing as RoutingPreference | null,
    text_size_preference: textSize,
    reduced_motion_preference: motionFromDraft(draft.reduced_motion_preference),
    high_contrast_preference: triState(draft.high_contrast_preference),
    screen_reader_user: triState(draft.screen_reader_user),
    switch_or_voice_user: triState(draft.switch_or_voice_user),
    notification_preferences: { local_only: true, remote_channels: [] },
    offline_pack_preferences: { wifi_only: draft.wifi_only, storage_limit_mb: storage.value },
    saved_places: [],
    saved_trips: [],
    consent_records,
    created_at: existing?.created_at ?? nowIso,
    updated_at: nowIso,
  };
  const validated = validateProfile(profile);
  if (validated.length > 0) return { profile: null, issues: validated };
  return { profile, issues: [] };
}
