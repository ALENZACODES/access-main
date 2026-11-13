import { describe, expect, it } from "vitest";
import { createEmptyProfile, parseOptionalInt, parseRegion, validateProfile, withdrawConsent, type UserProfile } from "./profile.ts";

const NOW = "2026-11-13T12:00:00.000Z";

describe("profile privacy rules", () => {
  it("starts without a health profile and without consent", () => {
    const profile = createEmptyProfile(NOW, "en");
    expect(profile.chair_width_mm).toBeNull();
    expect(profile.routing_preference).toBeNull();
    expect(profile.storage).toBe("device-only");
    expect(profile.saved_places).toEqual([]);
    expect(profile.consent_records).toEqual([]);
    expect(profile.notification_preferences.remote_channels).toEqual([]);
    expect(validateProfile(profile)).toEqual([]);
  });

  it("rejects a washroom interval, a travel limit, and a pressure-relief reminder", () => {
    const profile = createEmptyProfile(NOW, "en");
    for (const field of ["max_time_between_washrooms_min", "max_continuous_travel_min", "pressure_relief_reminder"]) {
      const tainted = { ...profile, [field]: 30 } as UserProfile;
      const issues = validateProfile(tainted);
      expect(issues.some((issue) => issue.field === field && issue.code === "forbidden_field")).toBe(true);
    }
  });

  it("rejects a zero measurement and contact details in the region", () => {
    expect(parseOptionalInt("chair_width_mm", "", 2000)).toEqual({ value: null, issues: [] });
    expect(parseOptionalInt("chair_width_mm", "0", 2000).issues[0]?.code).toBe("not_positive");
    expect(parseOptionalInt("chair_width_mm", "15.5", 2000).issues[0]?.code).toBe("not_integer");
    expect(parseRegion("Kingston").value).toBe("Kingston");
    expect(parseRegion("ada@example.com").issues[0]?.code).toBe("looks_like_contact");
    expect(parseRegion("416-555-0100").issues[0]?.code).toBe("looks_like_contact");
  });

  it("refuses diagnosis and place lists on the profile", () => {
    const profile = createEmptyProfile(NOW, "fr");
    const tainted = { ...profile, diagnosis: "do-not-store" } as UserProfile;
    expect(validateProfile(tainted).some((issue) => issue.code === "forbidden_field")).toBe(true);
    const withPlaces = { ...profile, saved_places: ["some-place"] } as unknown as UserProfile;
    expect(validateProfile(withPlaces).some((issue) => issue.code === "places_not_in_profile")).toBe(true);
  });

  it("withdraws consent without keeping entered mobility fields", () => {
    const profile = createEmptyProfile(NOW, "en");
    profile.equipment_type_general = "manual_chair";
    profile.chair_width_mm = 420;
    profile.consent_records = [
      {
        purpose: "store-preferences-on-device",
        policy_version: "privacy-local-1",
        granted_at: NOW,
        withdrawn_at: null,
      },
    ];
    const withdrawn = withdrawConsent(profile, "2026-11-13T15:00:00.000Z");
    expect(withdrawn.equipment_type_general).toBeNull();
    expect(withdrawn.chair_width_mm).toBeNull();
    expect(withdrawn.consent_records[0]?.withdrawn_at).toBe("2026-11-13T15:00:00.000Z");
    expect(validateProfile(withdrawn)).toEqual([]);
  });
});
