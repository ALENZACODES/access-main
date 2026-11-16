import { describe, expect, it } from "vitest";
import { DataAuditError, assertPlacesClean, auditPlaces, type DataViolationCode } from "./index";
import { PROV, TODAY, mkPlace } from "./testHelpers";

const codes = (input: unknown[]): DataViolationCode[] => auditPlaces(input, TODAY).violations.map((v) => v.code);
const good = mkPlace("Hall", { elevator: "yes", "automatic-door": "unknown" });

describe("auditPlaces", () => {
  it("passes clean records, including UNKNOWN ones", () => {
    const r = auditPlaces([good, { name: "Empty", features: [] }], TODAY);
    expect(r).toEqual({ violations: [], errors: 0, warnings: 0, ok: true });
  });
  it.each([
    [[null], "not-an-object"],
    [[{ features: [] }], "missing-name"],
    [[{ name: "  ", features: [] }], "missing-name"],
    [[{ name: "A" }], "features-not-array"],
    [[{ name: "A", features: [{ feature: "teleporter", value: "yes" }] }], "unknown-feature-id"],
    [[{ name: "A", features: [{ value: "yes" }] }], "unknown-feature-id"],
    [[{ name: "A", features: [{ feature: "elevator", value: "unknown" }, { feature: "elevator", value: "unknown" }] }], "duplicate-feature"],
    [[{ name: "A", features: [{ feature: "elevator", value: "likely", provenance: PROV }] }], "bad-value"],
    [[{ name: "A", features: [{ feature: "elevator", value: "yes" }] }], "missing-provenance"],
    [[{ name: "A", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, source: "" } }] }], "missing-provenance"],
    [[{ name: "A", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, licence: "Proprietary" } }] }], "licence-not-open"],
    [[{ name: "A", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, retrievedOn: "2026-02-31" } }] }], "bad-date"],
    [[{ name: "A", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, url: "http://x.org" } }] }], "bad-url"],
    [[{ name: "A", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, retrievedOn: "2027-01-01" } }] }], "future-date"],
  ] as [unknown[], DataViolationCode][])("flags %j as %s", (input, code) => {
    const r = auditPlaces(input, TODAY);
    expect(r.violations.map((v) => v.code)).toContain(code);
    expect(r.ok).toBe(false);
  });
  it("reports stale details as warnings only", () => {
    const stale = mkPlace("Old", { elevator: "yes" }, { ...PROV, retrievedOn: "2024-01-01" });
    const r = auditPlaces([stale], TODAY);
    expect(codes([stale])).toEqual(["stale-detail"]);
    expect(r.warnings).toBe(1);
    expect(r.ok).toBe(true);
  });
  it("records the index, place and feature", () => {
    const v = auditPlaces([good, { name: "Bad", features: [{ feature: "elevator", value: "yes" }] }], TODAY).violations[0]!;
    expect(v).toMatchObject({ index: 1, place: "Bad", feature: "elevator", severity: "error" });
  });
  it("keeps going after a bad record", () => {
    expect(codes([null, { name: "A" }, good])).toEqual(["not-an-object", "features-not-array"]);
  });
});

describe("assertPlacesClean", () => {
  it("returns the result when clean (warnings allowed)", () => {
    expect(assertPlacesClean([good], TODAY).ok).toBe(true);
  });
  it("throws a DataAuditError naming each failing record", () => {
    const bad = { name: "Bad", features: [{ feature: "elevator", value: "yes" }] };
    expect(() => assertPlacesClean([good, bad], TODAY)).toThrow(DataAuditError);
    expect(() => assertPlacesClean([good, bad], TODAY)).toThrow(/#1 Bad\/elevator missing-provenance/);
  });
});
