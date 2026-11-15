import type { PackRecord, UnverifiedDraft } from "./types";

/**
 * Place pages consume trusted pack records, never the proposal queue.
 * Tier 0 cannot pass this boundary even if provided by an untyped caller.
 */
export function visiblePlaceFacts(
  record: PackRecord,
): PackRecord["facts"] {
  const facts: PackRecord["facts"] = {};

  for (const [field, candidate] of Object.entries(record.facts)) {
    if (
      !candidate ||
      ![1, 2, 3].includes(candidate.tier) ||
      !candidate.source_id ||
      !candidate.licence ||
      !candidate.retrieved_at
    ) {
      continue;
    }

    facts[field] = structuredClone(candidate);
  }

  return facts;
}

/**
 * Intentionally no way to merge drafts into place facts.
 * This function returns an independent copy of the visible record.
 */
export function withoutUnverifiedDrafts(
  record: PackRecord,
  drafts: readonly UnverifiedDraft[],
): PackRecord {
  void drafts;
  return {
    id: record.id,
    facts: visiblePlaceFacts(record),
  };
}
