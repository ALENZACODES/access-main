import {
  CANONICAL_TIER_IDS as SCHEMA_TIERS,
  PROTOTYPE_LABELS as SCHEMA_LABELS,
  canonicalTierFromForeign as schemaTierFromForeign,
} from "@access-main/schema/tiers";
import { describe, expect, it } from "vitest";
import { CANONICAL_TIER_IDS, PROTOTYPE_LABELS, canonicalTierFromForeign } from "./tiers.ts";

describe("tier constants", () => {
  it("uses the schema package lists", () => {
    expect(CANONICAL_TIER_IDS).toBe(SCHEMA_TIERS);
    expect(PROTOTYPE_LABELS).toBe(SCHEMA_LABELS);
    expect([...CANONICAL_TIER_IDS]).toEqual([0, 1, 2, 3, 4, "E"]);
  });

  it("maps foreign strings through the schema package and keeps shell-only tokens", () => {
    expect(canonicalTierFromForeign("tier-0-open-data")).toBe(0);
    expect(canonicalTierFromForeign("tier-4-live-feed")).toBe(4);
    expect(canonicalTierFromForeign("administrator_page")).toBe("E");
    expect(schemaTierFromForeign("administrator_page")).toBe("E");
    expect(canonicalTierFromForeign("TIER_2")).toBe(2);
    expect(canonicalTierFromForeign("UNKNOWN")).toBeNull();
  });
});
