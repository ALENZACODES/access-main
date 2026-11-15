import {
  classForField,
  evaluate,
  type AccessibilityFact,
  type FreshnessPolicy,
} from "./classes";

export interface FreshnessRecord {
  recordId: string;
  fields: Readonly<Record<string, AccessibilityFact | null | undefined>>;
}

export interface NeedsCheckTask {
  recordId: string;
  field: string;
  lastChecked: string;
  reason: "expired";
}

/**
 * Produce local suggestions, not verified facts or contribution submissions.
 *
 * Tasks can be passed to trip-check or included in an export workflow later.
 * Neither exporting nor publishing is implemented by this package.
 *
 * Input order is preserved for records and fields. No task is created for an
 * unknown date: absence of evidence must not be represented as expired proof.
 */
export function tasks(
  records: readonly FreshnessRecord[],
  now: Date,
  policy: FreshnessPolicy = {},
): NeedsCheckTask[] {
  const output: NeedsCheckTask[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    for (const [field, fact] of Object.entries(record.fields)) {
      const classId = classForField(field, policy);
      if (!classId) continue;

      const result = evaluate(fact, now, classId, policy);
      if (result.state !== "needs-check" || !result.lastChecked) {
        continue;
      }

      // Duplicate record/field pairs must not generate duplicate tasks.
      const key = JSON.stringify([record.recordId, field]);
      if (seen.has(key)) continue;
      seen.add(key);

      output.push({
        recordId: record.recordId,
        field,
        lastChecked: result.lastChecked,
        reason: "expired",
      });
    }
  }

  return output;
}

/**
 * Optional deterministic ordering for consumers that do not retain
 * insertion order while assembling their records.
 *
 * Sorting uses code-point comparisons, not locale-sensitive collation.
 * Equal keys retain original order.
 */
export function sortTasks(
  items: readonly NeedsCheckTask[],
): NeedsCheckTask[] {
  return items
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const record = compare(left.task.recordId, right.task.recordId);
      if (record !== 0) return record;

      const field = compare(left.task.field, right.task.field);
      return field !== 0 ? field : left.index - right.index;
    })
    .map(({ task }) => task);
}

function compare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
