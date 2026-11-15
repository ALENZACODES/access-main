import type { CacheEntry, OutboxItem, Provenance } from "@access/shared";

/** A field override is used when individual facts come from different sources. */
export interface SyncEntry extends CacheEntry {
  field_provenance?: Record<string, Provenance>;
}

export interface Snapshot {
  label: string;
  as_of: string;
  records: SyncEntry[];
  /** Unsent notes remain on the device. This engine never transmits them. */
  outbox: OutboxItem[];
}

export type FactValue = null | boolean | number | string | FactValue[] | { [key: string]: FactValue };
export interface SourcedValue { value: FactValue; provenance: Provenance }

export interface Conflict {
  record_id: string;
  field: string;
  left: SourcedValue;
  right: SourcedValue;
}

export interface UnknownObservation {
  record_id: string;
  field: string;
  side: "left" | "right";
}

export interface ReconcileReport {
  left_label: string;
  right_label: string;
  merged: Snapshot;
  conflicts: Conflict[];
  unknown_observations: UnknownObservation[];
  metadata_lww: { record_id: string; field: "stored_at"; chosen: "left" | "right" }[];
}

export type ResolutionChoice = "left" | "right" | "unknown";
export interface Resolution { record_id: string; field: string; choice: ResolutionChoice }
