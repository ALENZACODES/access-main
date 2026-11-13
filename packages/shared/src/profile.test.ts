import { describe, expect, it } from "vitest";
import { createEmptyProfile, parseOptionalInt, parseRegion, validateProfile, type UserProfile } from "./profile.ts";

const NOW = "2026-11-13T12:00:00.000Z";

describe("profile privacy rules", () => {
  it("starts with empty timing fields and no clinical default", () => {
    const profile = createEmptyProfile(NOW, "en");
    expect(profile.max_time_between_washrooms_min).toBeNull();
    expect(profile.max_continuous_travel_min).toBeNull();
    expect(profile.pressure_relief_reminder).toBeNull();
    expect(profile.chair_width_mm).toBeNull();
    expect(profile.storage).toBe("device-only");
    expect(profile.saved_places).toEqual([]);
    expect(profile.notification_preferences.remote_channels).toEqual([]);
    expect(validateProfile(profile)).toEqual([]);
  });

  it("rejects a zero or blank-looking measurement and contact details in the region", () => {
    expect(parseOptionalInt("chair_width_mm", "", 2000)).toEqual({ value: null, issues: [] });
    expect(parseOptionalInt("chair_width_mm", "0", 2000).issues[0]?.code).toBe("not_positive");
    expect(parseOptionalInt("max_time_between_washrooms_min", "15", 1440).value).toBe(15);
    expect(parseOptionalInt("max_time_between_washrooms_min", "15.5", 1440).issues[0]?.code).toBe("not_integer");
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
});
