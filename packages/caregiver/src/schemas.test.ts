import { EQUIPMENT_TYPES, LIMITS, TRANSFER_SIDES, findForbiddenKeys } from "@access/shared";
import { describe, expect, it } from "vitest";
import { SCHEMAS, validateAuditEntry, validateGrant, validateScope, validateView } from "./validate.ts";
import { SNAPSHOT_FIELDS } from "./types.ts";

const NOW = "2026-11-15T12:00:00.000Z";

function grant(scope: unknown, extra: Record<string, unknown> = {}) {
  return {
    record_type: "caregiver_grant",
    schema_version: "caregiver-grant-1.0.0",
    grant_id: "g-00000001",
    caregiver_label: "Sam",
    scope,
    created_at: NOW,
    expires_at: null,
    revoked_at: null,
    ...extra,
  };
}

const journey = { kind: "journey_reference", journey_ref: "trip-1", label: "Clinic visit" };

describe("scope schema", () => {
  it("accepts the three enumerated scopes", () => {
    expect(validateScope(journey)).toEqual([]);
    expect(validateScope({ kind: "check_in_receipt", receipt_id: "r-1", label: "Check-in", recorded_at: NOW })).toEqual([]);
    expect(validateScope({ kind: "equipment_snapshot", snapshot: { chair_width_mm: 680, attendant_travels: null } })).toEqual([]);
  });

  it("has no scope for the whole profile", () => {
    expect(validateScope({ kind: "full_profile" }).length).toBeGreaterThan(0);
    expect(validateScope({ kind: "equipment_snapshot", snapshot: { routing_preference: "low_slope" } }).length).toBeGreaterThan(0);
    expect(validateScope({ kind: "equipment_snapshot", snapshot: { diagnosis: "x" } }).length).toBeGreaterThan(0);
    expect(validateScope({ kind: "equipment_snapshot", snapshot: {} }).length).toBeGreaterThan(0);
  });

  it("rejects values the profile itself would reject", () => {
    expect(validateScope({ kind: "equipment_snapshot", snapshot: { chair_width_mm: 0 } }).length).toBeGreaterThan(0);
    expect(validateScope({ kind: "equipment_snapshot", snapshot: { chair_width_mm: LIMITS.MAX_MM + 1 } }).length).toBeGreaterThan(0);
    expect(validateScope({ kind: "equipment_snapshot", snapshot: { equipment_type_general: "hovercraft" } }).length).toBeGreaterThan(0);
  });

  it("uses the same field names and enums as the shared profile", () => {
    const snapshot = SCHEMAS.scope.$defs.snapshot.properties;
    expect(Object.keys(snapshot).sort()).toEqual([...SNAPSHOT_FIELDS].sort());
    expect(snapshot.equipment_type_general.enum.filter((v) => v !== null)).toEqual([...EQUIPMENT_TYPES]);
    expect(snapshot.transfer_side_preference.enum.filter((v) => v !== null)).toEqual([...TRANSFER_SIDES]);
    expect(snapshot.chair_width_mm.maximum).toBe(LIMITS.MAX_MM);
    expect(snapshot.chair_length_mm.maximum).toBe(LIMITS.MAX_MM);
  });

  it("carries no health or diagnosis field name", () => {
    for (const schema of Object.values(SCHEMAS)) expect(findForbiddenKeys(schema)).toEqual([]);
  });
});

describe("grant schema", () => {
  it("accepts a grant and refuses extra or missing keys", () => {
    expect(validateGrant(grant(journey))).toEqual([]);
    expect(validateGrant(grant(journey, { extra: 1 })).length).toBeGreaterThan(0);
    const { revoked_at, ...incomplete } = grant(journey);
    expect(revoked_at).toBeDefined();
    expect(validateGrant(incomplete).length).toBeGreaterThan(0);
  });

  it("refuses contact details in names and labels", () => {
    expect(validateGrant(grant(journey, { caregiver_label: "sam@example.com" }))).toContainEqual({ path: "/caregiver_label", code: "looks_like_contact" });
    expect(validateGrant(grant({ ...journey, label: "call 416 555 0100" }))).toContainEqual({ path: "/scope/label", code: "looks_like_contact" });
  });

  it("refuses an end before the start", () => {
    expect(validateGrant(grant(journey, { expires_at: "2026-11-14T12:00:00.000Z" }))).toContainEqual({ path: "/expires_at", code: "expires_before_created" });
  });
});

describe("audit entry and view schemas", () => {
  const entry = {
    record_type: "caregiver_audit_entry",
    schema_version: "caregiver-audit-1.0.0",
    entry_id: "a-00000001",
    seq: 1,
    at: NOW,
    action: "grant_created",
    outcome: "allowed",
    reason: null,
    grant_id: "g-00000001",
    caregiver_label: "Sam",
    scope_kind: "journey_reference",
    fields_removed: [],
    expires_at: null,
  };

  it("ties a reason to a refusal", () => {
    expect(validateAuditEntry(entry)).toEqual([]);
    expect(validateAuditEntry({ ...entry, outcome: "denied" }).length).toBeGreaterThan(0);
    expect(validateAuditEntry({ ...entry, outcome: "denied", action: "access_denied", reason: "revoked" })).toEqual([]);
    expect(validateAuditEntry({ ...entry, reason: "revoked" }).length).toBeGreaterThan(0);
  });

  const view = { record_type: "caregiver_view", schema_version: "caregiver-view-1.0.0", caregiver_label: "Sam", generated_at: NOW };

  it("makes an empty view say why, and a non-empty view carry items", () => {
    expect(validateView({ ...view, empty: true, empty_reason: "no_active_grants", items: [] })).toEqual([]);
    expect(validateView({ ...view, empty: true, empty_reason: null, items: [] }).length).toBeGreaterThan(0);
    expect(validateView({ ...view, empty: false, empty_reason: null, items: [] }).length).toBeGreaterThan(0);
    const item = { grant_id: "g-00000001", expires_at: null, scope: journey };
    expect(validateView({ ...view, empty: false, empty_reason: null, items: [item] })).toEqual([]);
    expect(validateView({ ...view, empty: true, empty_reason: "no_active_grants", items: [item] }).length).toBeGreaterThan(0);
  });
});
