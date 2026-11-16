import { describe, expect, it } from "vitest";
import { isCoarsePeriod, looksLikePrecisePlace, monthOf, periodKey } from "./coarsen.ts";
import { report, region } from "./test-helpers.ts";
import { validateRegion, validateReport } from "./validate.ts";

describe("timestamps are reduced to a month before a report is stored", () => {
  it("drops the day and the time of day", () => {
    expect(monthOf("2026-10-31")).toBe("2026-10");
    expect(monthOf("2026-10-31T23:59:59.123Z")).toBe("2026-10");
    expect(monthOf("2026-10-31T23:59:59-04:00")).toBe("2026-10");
    expect(monthOf("2026-10-31 08:15")).toBe("2026-10");
    expect(monthOf("2026-10")).toBe("2026-10");
    expect(monthOf("UNKNOWN")).toBe("UNKNOWN");
  });

  it("maps every moment of a month to the same value, so the moment cannot be read back", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 31; day += 1) {
      for (const time of ["T00:00:00Z", "T12:34:56Z", "T23:59:59Z"]) seen.add(monthOf(`2026-10-${String(day).padStart(2, "0")}${time}`));
    }
    expect([...seen]).toEqual(["2026-10"]);
  });

  it("refuses values that are not dates", () => {
    for (const bad of ["2026-13-01", "2026-02-30", "31/10/2026", "yesterday", "", "2026-1"]) expect(() => monthOf(bad)).toThrow(RangeError);
  });

  it("coarsens a month to a quarter or a year", () => {
    expect(periodKey("2026-10", "month")).toBe("2026-10");
    expect(periodKey("2026-10", "quarter")).toBe("2026-Q4");
    expect(periodKey("2026-03", "quarter")).toBe("2026-Q1");
    expect(periodKey("2026-10", "year")).toBe("2026");
    expect(periodKey("UNKNOWN", "year")).toBe("UNKNOWN");
    expect(() => periodKey("2026-10-01", "month")).toThrow(RangeError);
  });

  it("knows which period labels are no finer than a month", () => {
    for (const ok of ["2026", "2026-Q2", "2026-10", "UNKNOWN"]) expect(isCoarsePeriod(ok)).toBe(true);
    for (const fine of ["2026-10-31", "2026-W44", "2026-10-31T10:00", "2026-Q5"]) expect(isCoarsePeriod(fine)).toBe(false);
  });
});

describe("a stored report cannot carry a precise time or place", () => {
  it("accepts a month and a region code", () => {
    expect(validateReport(report()).ok).toBe(true);
    expect(validateReport(report({ region_code: "UNKNOWN", period: "UNKNOWN", topic: "unknown" })).ok).toBe(true);
  });

  it("refuses a day, a time, or a week in the period", () => {
    for (const period of ["2026-10-31", "2026-10-31T10:00:00Z", "2026-W44", "2026"]) {
      expect(validateReport(report({ period })).ok).toBe(false);
    }
  });

  it("refuses any extra field, such as a timestamp, a position, a note or a postal code", () => {
    for (const extra of [{ occurred_at: "2026-10-31T10:00:00Z" }, { lat: 1, lng: 2 }, { note: "by the corner shop" }, { postal_code: "x" }, { address: "x" }]) {
      expect(validateReport({ ...report(), ...extra }).ok).toBe(false);
    }
  });

  it("refuses a region code shaped like a postal code, a long number or a coordinate", () => {
    for (const code of ["k1a0b1", "k1a-0b1", "area-123456", "12345"]) {
      expect(looksLikePrecisePlace(code)).toBe(true);
      expect(validateReport(report({ region_code: code })).ok).toBe(false);
      expect(validateRegion(region(code)).ok).toBe(false);
    }
    expect(looksLikePrecisePlace("43.6532")).toBe(true);
    expect(looksLikePrecisePlace("test-a")).toBe(false);
    expect(looksLikePrecisePlace("ward-12")).toBe(false);
  });

  it("refuses a topic that is not on the list for the kind, so free text cannot ride in", () => {
    expect(validateReport(report({ kind: "parking", topic: "blocked_curb_cut" })).ok).toBe(false);
    expect(validateReport(report({ kind: "barrier", topic: "the red car again" })).ok).toBe(false);
    expect(validateReport(report({ kind: "barrier", topic: "blocked_curb_cut" })).ok).toBe(true);
  });
});
