import { describe, expect, it } from "vitest";
import {
  NBSP,
  OPEN_LICENCES,
  STALE_AFTER_DAYS,
  ageLabel,
  attributionLine,
  daysBetween,
  formatDate,
  isIsoDate,
  isOpenLicence,
  isStale,
  validateProvenance,
} from "./index";

const good = { source: "City open data", licence: "OGL-Canada-2.0", retrievedOn: "2026-11-01" };

describe("validateProvenance", () => {
  it("accepts complete provenance and trims the source", () => {
    const r = validateProvenance({ ...good, source: "  City open data " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source).toBe("City open data");
  });
  it("keeps an https url", () => {
    const r = validateProvenance({ ...good, url: "https://example.org/data" });
    expect(r.ok && r.value.url).toBe("https://example.org/data");
  });
  it.each([
    [null, "not-an-object"],
    ["text", "not-an-object"],
    [{ ...good, source: " " }, "missing-source"],
    [{ ...good, source: undefined }, "missing-source"],
    [{ ...good, licence: "All-rights-reserved" }, "licence-not-open"],
    [{ ...good, licence: undefined }, "licence-not-open"],
    [{ ...good, retrievedOn: "2026-02-30" }, "bad-date"],
    [{ ...good, retrievedOn: "yesterday" }, "bad-date"],
    [{ ...good, url: "http://example.org" }, "bad-url"],
    [{ ...good, url: 42 }, "bad-url"],
  ])("rejects %j", (input, reason) => {
    const r = validateProvenance(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe("licences and dates", () => {
  it("knows its open licences", () => {
    for (const id of Object.keys(OPEN_LICENCES)) expect(isOpenLicence(id)).toBe(true);
    expect(isOpenLicence("Proprietary")).toBe(false);
    expect(isOpenLicence(5)).toBe(false);
  });
  it("validates calendar dates", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate(20260101)).toBe(false);
  });
  it("formats dates in both locales", () => {
    expect(formatDate("2026-11-15", "en")).toBe("15 November 2026");
    expect(formatDate("2026-11-15", "fr")).toBe("15 novembre 2026");
    expect(formatDate("2026-12-01", "fr")).toBe("1er décembre 2026");
    expect(formatDate("2026-12-01", "en")).toBe("1 December 2026");
    expect(formatDate("not a date", "en")).toBe("not a date");
  });
  it("counts days across month and year ends", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-11-15", "2026-11-15")).toBe(0);
    expect(daysBetween("2026-11-15", "2026-11-10")).toBe(-5);
  });
});

describe("attribution and age", () => {
  const p = { source: "City open data", licence: "OGL-Canada-2.0", retrievedOn: "2026-11-01" } as const;
  it("writes a source line with licence and date", () => {
    expect(attributionLine(p, "en")).toBe(
      "Source: City open data. Licence: Open Government Licence – Canada 2.0. Retrieved 1 November 2026.",
    );
    expect(attributionLine(p, "fr")).toContain(`Source${NBSP}: City open data`);
    expect(attributionLine(p, "fr")).toContain("Consulté le 1er novembre 2026");
  });
  it("describes age without claiming currency", () => {
    expect(ageLabel("2026-11-15", "2026-11-15", "en")).toBe("Retrieved today");
    expect(ageLabel("2026-11-14", "2026-11-15", "en")).toBe("Retrieved 1 day ago");
    expect(ageLabel("2026-11-10", "2026-11-15", "fr")).toBe("Consulté il y a 5 jours");
    expect(ageLabel("2026-11-20", "2026-11-15", "en")).toBe("Date in the future");
  });
  it("flags stale details after the threshold", () => {
    expect(isStale("2025-11-15", "2026-11-15")).toBe(false);
    expect(daysBetween("2025-11-14", "2026-11-15")).toBe(STALE_AFTER_DAYS + 1);
    expect(isStale("2025-11-14", "2026-11-15")).toBe(true);
  });
});
