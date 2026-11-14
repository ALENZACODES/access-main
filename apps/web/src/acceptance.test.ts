/**
 * Master plan, Part 5, Days 1 and 6: unit-level acceptance checks for this repository.
 * Each test title starts with its check id from the access-help day catalogue.
 * Browser checks for Day 6 are in e2e/days-1-6.spec.ts.
 */
import { describe, expect, it } from "vitest";
import { createEmptyProfile, type UserProfile } from "@access/shared";
import { exportProfileInLanguage } from "./profile/exportCopy.ts";
import userProfileSchemaText from "../../../packages/schema/schema/canonical/user-profile.schema.json?raw";

const NOW = "2026-11-13T12:00:00.000Z";

/** Words that would mean the profile holds health data. */
const HEALTH = /diagnos|medic|clinic|injury|condition|symptom|treatment|therap|bladder|bowel|pressure.?relief|washroom.?interval|level_of_injury|asia/i;

function propertyNames(schema: unknown, out: string[] = []): string[] {
  if (!schema || typeof schema !== "object") return out;
  const node = schema as Record<string, unknown>;
  const properties = node.properties;
  if (properties && typeof properties === "object") {
    for (const [name, child] of Object.entries(properties)) {
      out.push(name);
      propertyNames(child, out);
    }
  }
  for (const key of ["items", "additionalProperties", "$defs"]) {
    const child = node[key];
    if (child && typeof child === "object") {
      if (key === "$defs") for (const def of Object.values(child)) propertyNames(def, out);
      else propertyNames(child, out);
    }
  }
  return out;
}

describe("Day 1", () => {
  it("D01-5 the equipment profile schema has no health, diagnosis, medication, or clinical field", () => {
    const schema = JSON.parse(userProfileSchemaText) as Record<string, unknown>;
    const names = propertyNames(schema);
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter((name) => HEALTH.test(name))).toEqual([]);
    expect(schema.additionalProperties).toBe(false);

    const shellFields = Object.keys(createEmptyProfile(NOW, "en"));
    expect(shellFields.filter((name) => HEALTH.test(name))).toEqual([]);
  });
});

describe("Day 6", () => {
  function consent(profile: UserProfile): UserProfile {
    return {
      ...profile,
      consent_records: [
        { purpose: "store-preferences-on-device", policy_version: "privacy-local-1", granted_at: NOW, withdrawn_at: null },
      ],
    };
  }

  it("D06-4 a plain-text profile export contains only entered fields", () => {
    const manualOnly = consent({ ...createEmptyProfile(NOW, "en"), equipment_type_general: "manual_chair" });
    const lines = exportProfileInLanguage(manualOnly, "en").trimEnd().split("\n");
    expect(lines).toEqual([
      "the App — preferences entered on this device",
      "Language: English",
      "Equipment: Manual wheelchair",
      `Consent to store on this device: ${NOW}`,
    ]);

    const power = consent({ ...createEmptyProfile(NOW, "en"), equipment_type_general: "power_chair", chair_width_mm: 680 });
    const powerLines = exportProfileInLanguage(power, "en").trimEnd().split("\n");
    expect(powerLines).toContain("Equipment: Power wheelchair");
    expect(powerLines.some((line) => line.includes("680"))).toBe(true);
    expect(powerLines).toHaveLength(5);

    const text = exportProfileInLanguage(power, "en");
    expect(text).not.toMatch(/null|undefined|Not set|Unknown/);
    expect(text).not.toMatch(/\b(record_type|user_id|schema_version|storage)\b/);
  });
});
