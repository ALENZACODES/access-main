import { describe, expect, it } from "vitest";
import { draftFromProfile, emptyDraft, profileFromDraft } from "./draft.ts";
import { createEmptyProfile } from "@access/shared";

describe("profile draft", () => {
  it("does not invent a timing value", () => {
    const draft = emptyDraft("en");
    expect(draft.max_time_between_washrooms_min).toBe("");
    expect(draft.max_continuous_travel_min).toBe("");
    expect(draft.pressure_relief_reminder).toBe("");
    const built = profileFromDraft(draft, null, "2026-11-13T12:00:00.000Z");
    expect(built.issues).toEqual([]);
    expect(built.profile?.max_time_between_washrooms_min).toBeNull();
    expect(built.profile?.pressure_relief_reminder).toBeNull();
    expect(built.profile?.storage).toBe("device-only");
  });

  it("rejects zero and keeps a stated number", () => {
    const draft = emptyDraft("fr");
    draft.max_time_between_washrooms_min = "0";
    expect(profileFromDraft(draft, null, "2026-11-13T12:00:00.000Z").profile).toBeNull();
    draft.max_time_between_washrooms_min = "90";
    draft.equipment_type_general = "manual_chair";
    const built = profileFromDraft(draft, null, "2026-11-13T12:00:00.000Z");
    expect(built.profile?.max_time_between_washrooms_min).toBe(90);
    expect(built.profile?.equipment_type_general).toBe("manual_chair");
    expect(draftFromProfile(built.profile!).max_time_between_washrooms_min).toBe("90");
  });

  it("round-trips an empty stored profile without filling defaults", () => {
    const profile = createEmptyProfile("2026-11-13T12:00:00.000Z", "en");
    const again = profileFromDraft(draftFromProfile(profile), profile, "2026-11-13T13:00:00.000Z");
    expect(again.profile?.chair_width_mm).toBeNull();
    expect(again.profile?.max_continuous_travel_min).toBeNull();
    expect(again.profile?.created_at).toBe(profile.created_at);
  });
});
