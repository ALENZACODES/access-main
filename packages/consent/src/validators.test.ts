import { describe, expect, it } from "vitest";
import { PURPOSES } from "./purposes.ts";
import { DATA_CATEGORIES, PURPOSE_LABELS } from "./types.ts";
import {
  SCHEMAS,
  frenchTypographyIssues,
  validateAuditEntry,
  validateConsentEvent,
  validateConsentRecord,
  validatePurpose,
  validateRevocation,
} from "./validators.ts";

const AT = "2026-01-02T03:04:05.000Z";
const record = {
  record_type: "consent_record",
  schema_version: "consent-record-1.0.0",
  seq: 1,
  purpose_id: "keep-places-offline",
  purpose_version: 1,
  decision: "granted",
  decided_at: AT,
};
const revocation = {
  record_type: "consent_revocation",
  schema_version: "consent-revocation-1.0.0",
  seq: 2,
  purpose_id: "keep-places-offline",
  purpose_version: 1,
  revokes_seq: 1,
  revoked_at: AT,
};
const audit = {
  record_type: "audit_entry",
  schema_version: "audit-entry-1.0.0",
  seq: 1,
  at: AT,
  action: "grant",
  purpose_id: "keep-places-offline",
  purpose_version: 1,
};

describe("purpose schema", () => {
  it("accepts every seed purpose", () => {
    for (const purpose of PURPOSES) expect(validatePurpose(purpose), purpose.id).toEqual({ valid: true, errors: [] });
  });

  it("stays in step with the TypeScript constants", () => {
    const props = SCHEMAS.purpose.properties;
    expect(props.data_categories.items.enum).toEqual([...DATA_CATEGORIES]);
    expect(props.prototype_label.enum).toEqual([...PURPOSE_LABELS]);
  });

  it("refuses VERIFIED and other labels on a prototype fixture", () => {
    for (const label of ["VERIFIED", "COMMUNITY-REPORTED", "UNKNOWN", 3]) {
      expect(validatePurpose({ ...PURPOSES[0], prototype_label: label }).valid, String(label)).toBe(false);
    }
  });

  it("needs EN and FR text, a version of 1 or more, and no data leaving the device", () => {
    const base = PURPOSES[0]!;
    expect(validatePurpose({ ...base, description: { en: "only english" } }).valid).toBe(false);
    expect(validatePurpose({ ...base, title: { en: " ", fr: "x" } }).valid).toBe(false);
    expect(validatePurpose({ ...base, version: 0 }).valid).toBe(false);
    expect(validatePurpose({ ...base, leaves_device: true }).valid).toBe(false);
    expect(validatePurpose({ ...base, data_categories: [] }).valid).toBe(false);
    expect(validatePurpose({ ...base, data_categories: ["diagnosis"] }).valid).toBe(false);
  });

  it("rejects health fields and third-party identifiers", () => {
    for (const extra of ["diagnosis", "injury_level", "medication", "email", "device_id", "ip_address", "user_id"]) {
      const result = validatePurpose({ ...PURPOSES[0], [extra]: "x" });
      expect(result.valid, extra).toBe(false);
      expect(result.errors.join(" ")).toContain(extra);
    }
  });
});

describe("consent record, revocation and audit schemas", () => {
  it("accept well-formed values", () => {
    expect(validateConsentRecord(record).valid).toBe(true);
    expect(validateConsentRecord({ ...record, decision: "refused" }).valid).toBe(true);
    expect(validateRevocation(revocation).valid).toBe(true);
    expect(validateAuditEntry(audit).valid).toBe(true);
    expect(validateConsentEvent(record).valid).toBe(true);
    expect(validateConsentEvent(revocation).valid).toBe(true);
  });

  it("reject an implied or unknown decision, a bad timestamp, and extra keys", () => {
    expect(validateConsentRecord({ ...record, decision: "implied" }).valid).toBe(false);
    expect(validateConsentRecord({ ...record, decided_at: "yesterday" }).valid).toBe(false);
    expect(validateConsentRecord({ ...record, purpose_version: undefined }).valid).toBe(false);
    expect(validateConsentRecord({ ...record, health_card: "x" }).valid).toBe(false);
    expect(validateRevocation({ ...revocation, revokes_seq: 0 }).valid).toBe(false);
    expect(validateRevocation({ ...revocation, account_id: "x" }).valid).toBe(false);
    expect(validateAuditEntry({ ...audit, action: "view" }).valid).toBe(false);
    expect(validateAuditEntry({ ...audit, ip: "1.2.3.4" }).valid).toBe(false);
    expect(validateConsentEvent({ record_type: "audit_entry" }).valid).toBe(false);
    expect(validateConsentEvent(null).valid).toBe(false);
  });
});

describe("frenchTypographyIssues", () => {
  it("accepts no-break spaces", () => {
    expect(frenchTypographyIssues("Données : oui ; non ? « texte » fini !")).toEqual([]);
    expect(frenchTypographyIssues("https://exemple.ca à 10:30")).toEqual([]);
  });

  it("flags regular spaces and missing spaces", () => {
    expect(frenchTypographyIssues("Données : oui")).not.toEqual([]);
    expect(frenchTypographyIssues("Données: oui")).not.toEqual([]);
    expect(frenchTypographyIssues("Vraiment?")).not.toEqual([]);
    expect(frenchTypographyIssues("« texte »")).not.toEqual([]);
    expect(frenchTypographyIssues("«texte»")).not.toEqual([]);
  });
});
