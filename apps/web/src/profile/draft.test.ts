import { describe, expect, it } from "vitest";
import { draftFromProfile, emptyDraft, profileFromDraft } from "./draft.ts";
import { createEmptyProfile } from "@access/shared";

const NOW = "2026-11-13T12:00:00.000Z";

describe("profile draft", () => {
  it("does not store a profile until consent is explicit", () => {
    const draft = emptyDraft("en");
    expect(draft.consent_granted).toBe(false);
    const refused = profileFromDraft(draft, null, NOW);
    expect(refused.profile).toBeNull();
    expect(refused.issues.some((issue) => issue.code === "consent_required")).toBe(true);
    draft.consent_granted = true;
    const built = profileFromDraft(draft, null, NOW);
    expect(built.issues).toEqual([]);
    expect(built.profile?.consent_records).toEqual([
      {
        purpose: "store-preferences-on-device",
        policy_version: "privacy-local-1",
        granted_at: NOW,
        withdrawn_at: null,
      },
    ]);
    expect(built.profile?.chair_width_mm).toBeNull();
    expect(built.profile?.storage).toBe("device-only");
  });

  it("rejects zero and keeps a stated chair width", () => {
    const draft = emptyDraft("fr");
    draft.consent_granted = true;
    draft.chair_width_mm = "0";
    expect(profileFromDraft(draft, null, NOW).profile).toBeNull();
    draft.chair_width_mm = "420";
    draft.equipment_type_general = "manual_chair";
    const built = profileFromDraft(draft, null, NOW);
    expect(built.profile?.chair_width_mm).toBe(420);
    expect(built.profile?.equipment_type_general).toBe("manual_chair");
    expect(draftFromProfile(built.profile!).chair_width_mm).toBe("420");
    expect(draftFromProfile(built.profile!).consent_granted).toBe(true);
  });

  it("keeps the original grant time when consent is already active", () => {
    const profile = createEmptyProfile(NOW, "en");
    profile.consent_records = [
      {
        purpose: "store-preferences-on-device",
        policy_version: "privacy-local-1",
        granted_at: NOW,
        withdrawn_at: null,
      },
    ];
    const again = profileFromDraft(draftFromProfile(profile), profile, "2026-11-13T13:00:00.000Z");
    expect(again.profile?.consent_records[0]?.granted_at).toBe(NOW);
    expect(again.profile?.created_at).toBe(profile.created_at);
  });
});
