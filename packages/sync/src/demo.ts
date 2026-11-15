import type { Provenance } from "@access/shared";
import { reconcile } from "./reconcile.ts";
import type { Snapshot } from "./types.ts";

/** DEMONSTRATION DATA ONLY. Fictional record; no place or service assertion. */
const source: Provenance = {
  source_name: "Demonstration local pack", source_url: null,
  licence: "CC0-1.0 (demonstration)", licence_url: null,
  source_date: "2026-01-01", retrieved_at: "2026-01-02T00:00:00Z",
  tier: 0, prototype_label: "SEEDED-OPEN-DATA", freshness: "unknown",
};
export const demonstrationLeft: Snapshot = {
  label: "Demo copy A", as_of: "2026-01-02T00:00:00Z", outbox: [],
  records: [{ id: "demo-record", kind: "place", title: "Fictional demo record",
    stored_at: "2026-01-02T00:00:00Z", provenance: source,
    contains_live_status: false, payload: { test_attribute: "option A", unknown_attribute: "UNKNOWN" } }],
};
export const demonstrationRight: Snapshot = {
  label: "Demo copy B", as_of: "2026-01-03T00:00:00Z", outbox: [],
  records: [{ ...demonstrationLeft.records[0]!, stored_at: "2026-01-03T00:00:00Z",
    payload: { test_attribute: "option B", unknown_attribute: "UNKNOWN" } }],
};
export const demonstrationReport = reconcile(demonstrationLeft, demonstrationRight);
