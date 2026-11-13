import { createEmptyProfile, type UserProfile } from "@access/shared";
import { describe, expect, it } from "vitest";
import { exportProfileInLanguage } from "./exportCopy.ts";

const NOW = "2026-11-13T12:00:00.000Z";

function filled(language: "en" | "fr"): UserProfile {
  const profile = createEmptyProfile(NOW, language);
  return {
    ...profile,
    region_preference: "Ottawa",
    equipment_type_general: "manual_chair",
    chair_width_mm: 700,
    transfer_side_preference: "left",
    attendant_travels: true,
    routing_preference: "low_slope",
    text_size_preference: "extra_large",
    reduced_motion_preference: true,
    high_contrast_preference: true,
    screen_reader_user: false,
    offline_pack_preferences: { ...profile.offline_pack_preferences, wifi_only: false, storage_limit_mb: 50 },
    consent_records: [
      {
        purpose: "store-preferences-on-device",
        policy_version: "privacy-local-1",
        granted_at: NOW,
        withdrawn_at: null,
      },
    ],
  };
}

describe("plain-text export language", () => {
  it("writes French labels and choice names when the UI language is French", () => {
    const text = exportProfileInLanguage(filled("fr"), "fr");
    expect(text.startsWith("the App — préférences saisies sur cet appareil\n")).toBe(true);
    expect(text).toContain("Langue: Français");
    expect(text).toContain("Équipement: Fauteuil roulant manuel");
    expect(text).toContain("Côté du transfert: Gauche");
    expect(text).toContain("Préférence d'itinéraire: Préférer des pentes plus douces");
    expect(text).toContain("Taille du texte: Très grande");
    expect(text).toContain("Mouvement: Réduire le mouvement");
    expect(text).toContain("Contraste plus élevé: Activé");
    expect(text).toContain("Lecteur d'écran: Non");
    expect(text).toContain("Consentement à enregistrer sur cet appareil: 2026-11-13T12:00:00.000Z");
    expect(text).not.toContain("manual_chair");
    expect(text).not.toContain("low_slope");
    expect(text).not.toContain("extra_large");
    expect(text).not.toContain("Language:");
    expect(text).not.toMatch(/\btrue\b/);
    expect(text).not.toMatch(/\bfalse\b/);
  });

  it("keeps English labels when the UI language is English", () => {
    const text = exportProfileInLanguage(filled("en"), "en");
    expect(text).toContain("Language: English");
    expect(text).toContain("Equipment: Manual wheelchair");
    expect(text).toContain("Route preference: Prefer gentler slopes");
    expect(text).not.toContain("Fauteuil");
    expect(text).not.toContain("manual_chair");
  });
});
