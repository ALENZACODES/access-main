import { expect, it } from "vitest";
import { records, validateDemoRecords } from "./records.ts";

it("accepts only provenance-labelled specimens or explicit Unknown fields", () => {
  expect(validateDemoRecords(records)).toBe(true);
  expect(validateDemoRecords([{ ...records[0], tier: 3 }])).toBe(false);
  expect(validateDemoRecords([{ ...records[0], prototypeLabel: "VERIFIED" }])).toBe(false);
  expect(validateDemoRecords([{ ...records[0], tier: 1, prototypeLabel: "SEEDED-OPEN-DATA" }])).toBe(false);
  expect(validateDemoRecords([{ ...records[0], date: "2026-02-30" }])).toBe(false);
});
