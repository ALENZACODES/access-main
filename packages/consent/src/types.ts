export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DATA_CATEGORIES = [
  "display_settings",
  "route_preferences",
  "equipment_size",
  "language",
  "offline_map_cache",
  "local_usage_counts",
] as const;
export type DataCategory = (typeof DATA_CATEGORIES)[number];

/** A prototype fixture may carry only these labels. VERIFIED and tier 3 need evidence this prototype does not produce. */
export const PURPOSE_LABELS = ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA"] as const;
export type PurposeLabel = (typeof PURPOSE_LABELS)[number];

export type Localized = Record<Locale, string>;

export const STORE_SCHEMA_VERSION = "consent-store-1.0.0";

export interface Purpose {
  record_type: "consent_purpose";
  schema_version: "consent-purpose-1.0.0";
  /** Stable id. Never reused for a different purpose. */
  id: string;
  /** Version of the purpose text. Bump it whenever the text or the data categories change. */
  version: number;
  title: Localized;
  description: Localized;
  data_categories: DataCategory[];
  leaves_device: false;
  prototype_label: PurposeLabel;
}

export interface ConsentRecord {
  record_type: "consent_record";
  schema_version: "consent-record-1.0.0";
  seq: number;
  purpose_id: string;
  purpose_version: number;
  decision: "granted" | "refused";
  decided_at: string;
}

export interface ConsentRevocation {
  record_type: "consent_revocation";
  schema_version: "consent-revocation-1.0.0";
  seq: number;
  purpose_id: string;
  purpose_version: number;
  revokes_seq: number;
  revoked_at: string;
}

export type ConsentEvent = ConsentRecord | ConsentRevocation;

export type AuditAction = "grant" | "refuse" | "revoke";

export interface AuditEntry {
  record_type: "audit_entry";
  schema_version: "audit-entry-1.0.0";
  seq: number;
  at: string;
  action: AuditAction;
  purpose_id: string;
  purpose_version: number;
}

/**
 * not_asked: default. Nothing recorded.
 * granted: latest event is a grant of the current purpose version.
 * refused / revoked: latest event says no.
 * outdated: the person granted an earlier version. Not granted until they grant the new text.
 */
export type ConsentStatus = "not_asked" | "granted" | "refused" | "revoked" | "outdated";

export interface ConsentState {
  purposeId: string;
  status: ConsentStatus;
  granted: boolean;
  currentVersion: number;
  decidedVersion: number | null;
  decidedAt: string | null;
}
