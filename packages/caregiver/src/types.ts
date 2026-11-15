import type { EquipmentType, TransferSide, UserProfile } from "@access/shared";

export const SCOPE_KINDS = ["journey_reference", "check_in_receipt", "equipment_snapshot"] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];

/** Equipment-profile field names, exactly as in packages/shared/src/profile.ts. Only the fields a booking needs. */
export const SNAPSHOT_FIELDS = [
  "equipment_type_general",
  "chair_width_mm",
  "chair_length_mm",
  "transfer_side_preference",
  "attendant_travels",
] as const satisfies readonly (keyof UserProfile)[];
export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export interface EquipmentSnapshot {
  equipment_type_general?: EquipmentType | null;
  chair_width_mm?: number | null;
  chair_length_mm?: number | null;
  transfer_side_preference?: TransferSide | null;
  attendant_travels?: boolean | null;
}

export interface JourneyReferenceScope {
  kind: "journey_reference";
  journey_ref: string;
  label: string;
}
export interface CheckInReceiptScope {
  kind: "check_in_receipt";
  receipt_id: string;
  label: string;
  recorded_at: string;
}
export interface EquipmentSnapshotScope {
  kind: "equipment_snapshot";
  snapshot: EquipmentSnapshot;
}
export type Scope = JourneyReferenceScope | CheckInReceiptScope | EquipmentSnapshotScope;

/** What the owner asks for. An equipment snapshot lists field names; the values are copied from the profile. */
export type ScopeInput =
  | JourneyReferenceScope
  | CheckInReceiptScope
  | { kind: "equipment_snapshot"; fields: readonly SnapshotField[] };

export const GRANT_SCHEMA_VERSION = "caregiver-grant-1.0.0";
export const AUDIT_SCHEMA_VERSION = "caregiver-audit-1.0.0";
export const VIEW_SCHEMA_VERSION = "caregiver-view-1.0.0";

export interface Grant {
  record_type: "caregiver_grant";
  schema_version: typeof GRANT_SCHEMA_VERSION;
  grant_id: string;
  caregiver_label: string;
  scope: Scope;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export type GrantStatus = "active" | "revoked" | "expired";
export type GrantRow = Grant & { status: GrantStatus };

export type AuditAction = "grant_created" | "grant_narrowed" | "grant_revoked" | "grant_viewed" | "access_denied";
export type AuditReason = "revoked" | "expired" | "unknown_grant" | "wrong_caregiver";

export interface AuditEntry {
  record_type: "caregiver_audit_entry";
  schema_version: typeof AUDIT_SCHEMA_VERSION;
  entry_id: string;
  seq: number;
  at: string;
  action: AuditAction;
  outcome: "allowed" | "denied";
  reason: AuditReason | null;
  grant_id: string | null;
  caregiver_label: string;
  scope_kind: ScopeKind | null;
  fields_removed: SnapshotField[];
  expires_at: string | null;
}

export interface ViewItem {
  grant_id: string;
  expires_at: string | null;
  scope: Scope;
}

export interface CaregiverView {
  record_type: "caregiver_view";
  schema_version: typeof VIEW_SCHEMA_VERSION;
  caregiver_label: string;
  generated_at: string;
  empty: boolean;
  empty_reason: "no_active_grants" | null;
  items: ViewItem[];
}

export interface GrantState {
  grants: Grant[];
  audit: AuditEntry[];
}

export interface Issue {
  path: string;
  code: string;
}
