import { createEmptyProfile, type UserProfile } from "@access/shared";

/**
 * Demonstration data. An invented profile so the screens have something to share.
 * It is not a real person's profile and it states nothing about any place.
 */
export function demoProfile(nowIso = "2026-01-01T00:00:00.000Z"): UserProfile {
  return {
    ...createEmptyProfile(nowIso, "en"),
    equipment_type_general: "power_chair",
    chair_width_mm: 680,
    chair_length_mm: 1100,
    transfer_side_preference: "left",
    attendant_travels: true,
    routing_preference: "low_slope",
  };
}
