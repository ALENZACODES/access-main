import { assertSourceRegister } from "./validate.ts";
import type { Count, SourceEntry, TierCount } from "./types.ts";

export interface DashboardRow extends SourceEntry {
  retrieved_on: string;
  excluded_from_headline: boolean;
}

export interface DashboardTotals {
  source_count: number;
  demonstration_source_count: number;
  /** Known record counts are inventory sums, not a geographic coverage statistic. */
  demonstration_records: number;
  non_demonstration_records: number;
  unknown_record_count_sources: number;
  known_unknown_fields: number;
  unknown_field_count_sources: number;
  tier_histogram: TierCount[];
}

export interface DashboardProjection {
  rows: DashboardRow[];
  totals: DashboardTotals;
}

function known(count: Count): number {
  return count === "Unknown" ? 0 : count;
}

export function projectRegister(register: readonly SourceEntry[]): DashboardProjection {
  assertSourceRegister(register);
  const totals: DashboardTotals = {
    source_count: register.length,
    demonstration_source_count: 0,
    demonstration_records: 0,
    non_demonstration_records: 0,
    unknown_record_count_sources: 0,
    known_unknown_fields: 0,
    unknown_field_count_sources: 0,
    tier_histogram: [],
  };
  const histogram = new Map<string, TierCount>();
  const rows = register.map((entry) => {
    const excluded = entry.demonstration || entry.example === true;
    if (excluded) totals.demonstration_source_count++;
    if (entry.record_count === "Unknown") totals.unknown_record_count_sources++;
    else if (excluded) totals.demonstration_records += known(entry.record_count);
    else totals.non_demonstration_records += known(entry.record_count);
    if (entry.unknown_field_count === "Unknown") totals.unknown_field_count_sources++;
    else totals.known_unknown_fields += known(entry.unknown_field_count);
    for (const item of entry.tier_histogram) {
      const key = `${item.tier}:${item.prototype_label}`;
      const previous = histogram.get(key);
      if (previous) previous.count += item.count;
      else histogram.set(key, { ...item });
    }
    return { ...entry, retrieved_on: entry.retrieved_on ?? "Unknown", excluded_from_headline: excluded };
  });
  totals.tier_histogram = [...histogram.values()].sort((a, b) =>
    a.tier - b.tier || a.prototype_label.localeCompare(b.prototype_label),
  );
  return { rows, totals };
}
