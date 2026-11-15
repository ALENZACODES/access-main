import type {
  StructuredEvidence,
  Suggestion,
} from "./types";

/**
 * Optional, pure helper. Call explicitly during draft preparation only.
 * No place-page component imports or invokes this function.
 *
 * Uncertain observations remain UNKNOWN. The helper never assigns a tier,
 * changes a pack or treats its output as a verified accessibility fact.
 */
export function suggestFromEvidence(
  evidence: StructuredEvidence,
): Suggestion | undefined {
  if (!evidence.field.trim()) return undefined;

  const confidence = evidence.confidence;

  if (
    confidence === undefined ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return undefined;
  }

  if (confidence < 0.9 || evidence.observation === undefined) {
    return {
      field: evidence.field,
      value: "UNKNOWN",
      confidence,
    };
  }

  return {
    field: evidence.field,
    value: evidence.observation,
    confidence,
  };
}
