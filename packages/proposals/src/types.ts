export type Licence =
  | "ODbL"
  | "OGL-Ontario"
  | "OGL-Canada"
  | "CC-BY"
  | "CC0";

export type DraftValue = string | number | boolean;

export type Target =
  | { kind: "existing"; id: string }
  | { kind: "new"; localId: string; name: string };

export type EvidenceHandle =
  | { kind: "photo"; photoId: string }
  | { kind: "note"; text: string };

export interface Source {
  source_id: string;
  licence: Licence;
  retrieved_at: string;
  source_key?: string;
}

export interface UnverifiedDraft {
  id: string;
  target: Target;
  field: string;
  suggestedValue: DraftValue;
  evidence: EvidenceHandle[];
  tier: 0;
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
  source?: Source;
  personNote?: string;
  rejectionReason?: string;
  reviewedAt?: string;
}

export interface AccessibilityField {
  value: DraftValue;
  source_id: string;
  licence: Licence;
  retrieved_at: string;
  tier: 1;
  source_key?: string;
  raw?: unknown;
  derived?: boolean;
}

/**
 * A local, person-verified contribution for a separate export workflow.
 * It is not a published PackRecord and is never written to a pack here.
 */
export interface CommunityContribution {
  id: string;
  target: Target;
  field: string;
  record: AccessibilityField;
  evidence: EvidenceHandle[];
  personNote: string;
  verifiedAt: string;
  status: "accepted";
}

export interface StructuredEvidence {
  field: string;
  observation?: DraftValue;
  confidence?: number;
}

export interface Suggestion {
  field: string;
  value: DraftValue;
  confidence: number;
}

export interface PackRecord {
  id: string;
  facts: Record<string, {
    value: DraftValue;
    source_id: string;
    licence: Licence;
    retrieved_at: string;
    tier: 1 | 2 | 3;
    source_key?: string;
    raw?: unknown;
    derived?: boolean;
  }>;
}
