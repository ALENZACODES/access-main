/**
 * Aggregation and small-community suppression.
 *
 * Rules, in order, for a cell with a known count:
 *   1. count < k                                   -> suppressed (below_threshold)
 *   2. small community and count < k * factor      -> suppressed (small_community)
 *   3. unknown community size and count < k * factor -> suppressed (community_size_unknown)
 * A cell with any unknown contribution is published as unknown, never as a partial sum.
 * Suppressed counts are withheld. They are not rounded, banded, or estimated.
 */
import { daysBetween } from "./dates.ts";
import {
  CELL_SCHEMA_VERSION,
  HEADLINE_EXCLUSIONS,
  UNKNOWN,
  type Category,
  type Cell,
  type CellProvenance,
  type CommunityBand,
  type Geography,
  type HeadlineExclusion,
  type Observation,
  type PrototypeLabel,
  type Tier,
} from "./types.ts";

export interface SuppressionConfig {
  /** Counts below k are suppressed. */
  k: number;
  /** Small or unknown-size communities need at least k * factor. */
  smallCommunityFactor: number;
}

export const DEFAULT_SUPPRESSION: SuppressionConfig = { k: 5, smallCommunityFactor: 4 };
/** A threshold below 3 would let a count of 2 through. It is refused. */
export const MIN_K = 3;
export const HEADLINE_MAX_AGE_DAYS = 730;
export const STATUS_WINDOW_DAYS = 30;

export function resolveConfig(partial: Partial<SuppressionConfig> = {}): SuppressionConfig {
  const config = { ...DEFAULT_SUPPRESSION, ...partial };
  if (!Number.isInteger(config.k) || config.k < MIN_K) {
    throw new RangeError(`k must be an integer of at least ${MIN_K}`);
  }
  if (!Number.isInteger(config.smallCommunityFactor) || config.smallCommunityFactor < 1) {
    throw new RangeError("smallCommunityFactor must be an integer of at least 1");
  }
  return config;
}

export function smallCommunityMinimum(config: SuppressionConfig): number {
  return config.k * config.smallCommunityFactor;
}

export type SuppressionReason = "below_threshold" | "small_community" | "community_size_unknown";

/** In-memory only. It holds raw counts and must never be serialised or shown. */
export interface InternalCell {
  category: Category;
  geography: Geography;
  period: string;
  count: number | typeof UNKNOWN;
  band: CommunityBand;
  example: boolean;
  headline_exclusions: HeadlineExclusion[];
  provenance: CellProvenance;
}

export interface Decision {
  state: "published" | "suppressed" | "unknown";
  reasons: SuppressionReason[];
}

function isFixture(o: Observation): boolean {
  return (
    o.id.startsWith("example-") ||
    o.id.startsWith("synthetic-") ||
    o.source_id === "example" ||
    o.licence === "not-a-real-dataset"
  );
}

/** Headline rules from packages/schema/docs/counting-rules.md, applied to one observation. */
function exclusionsFor(o: Observation, asOf: string): HeadlineExclusion[] {
  const out: HeadlineExclusion[] = [];
  if (o.example) out.push("example_record");
  if (isFixture(o)) out.push("fixture_record");
  if (o.source_date === UNKNOWN) {
    out.push("undated");
  } else {
    const age = daysBetween(asOf, o.source_date);
    if (age < 0) out.push("future_dated");
    else if (age > HEADLINE_MAX_AGE_DAYS) out.push("too_old");
    else if (o.category === "outage" && age > STATUS_WINDOW_DAYS) out.push("status_window");
  }
  return out;
}

function mergeBand(bands: CommunityBand[]): CommunityBand {
  for (const band of ["small", "unknown", "medium"] as const) {
    if (bands.includes(band)) return band;
  }
  return "large";
}

function buildProvenance(list: readonly Observation[]): CellProvenance {
  const tiers = new Map<string, Tier>();
  const labels = new Set<PrototypeLabel>();
  for (const o of list) {
    tiers.set(String(o.tier), o.tier);
    if (o.prototype_label) labels.add(o.prototype_label);
  }
  const dates = list.map((o) => o.source_date).filter((d) => d !== UNKNOWN);
  return {
    source_ids: [...new Set(list.map((o) => o.source_id))].sort(),
    licences: [...new Set(list.map((o) => o.licence))].sort(),
    tiers: [...tiers.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, tier]) => tier),
    prototype_labels: [...labels].sort(),
    latest_source_date: dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : UNKNOWN,
  };
}

function buildCell(list: readonly Observation[], asOf: string): InternalCell {
  const first = list[0];
  if (!first) throw new Error("empty group");
  let total = 0;
  let unknown = false;
  for (const o of list) {
    if (typeof o.count === "number") total += o.count;
    else unknown = true;
  }
  const exclusions = new Set<HeadlineExclusion>(list.flatMap((o) => exclusionsFor(o, asOf)));
  return {
    category: first.category,
    geography: { level: first.geography.level, id: first.geography.id },
    period: first.period,
    count: unknown ? UNKNOWN : total,
    band: mergeBand(list.map((o) => o.geography.community_size_band)),
    example: list.some((o) => o.example),
    headline_exclusions: HEADLINE_EXCLUSIONS.filter((code) => exclusions.has(code)),
    provenance: buildProvenance(list),
  };
}

/** Group by category, area and period, in a stable order that does not depend on input order or on counts. */
export function aggregate(observations: readonly Observation[], asOf: string): InternalCell[] {
  const groups = new Map<string, Observation[]>();
  for (const o of observations) {
    const key = [o.category, o.geography.level, o.geography.id, o.period].join("|");
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }
  return [...groups.keys()].sort().map((key) => buildCell(groups.get(key) ?? [], asOf));
}

export function decide(cell: InternalCell, config: SuppressionConfig): Decision {
  if (cell.count === UNKNOWN) return { state: "unknown", reasons: [] };
  const reasons: SuppressionReason[] = [];
  const minimum = smallCommunityMinimum(config);
  if (cell.count < config.k) reasons.push("below_threshold");
  if (cell.band === "small" && cell.count < minimum) reasons.push("small_community");
  if (cell.band === "unknown" && cell.count < minimum) reasons.push("community_size_unknown");
  return { state: reasons.length > 0 ? "suppressed" : "published", reasons };
}

/** Turn internal cells into publishable cells. A suppressed cell keeps only its identity. */
export function publish(cells: readonly InternalCell[], config: SuppressionConfig): Cell[] {
  return cells.map((cell): Cell => {
    const base = {
      record_type: "advocacy_cell" as const,
      schema_version: CELL_SCHEMA_VERSION,
      category: cell.category,
      geography: { level: cell.geography.level, id: cell.geography.id },
      period: cell.period,
    };
    const { state } = decide(cell, config);
    if (state === "suppressed") return { ...base, state };
    if (typeof cell.count !== "number") {
      return { ...base, state: "unknown", example: cell.example, provenance: cell.provenance };
    }
    return {
      ...base,
      state: "published",
      count: cell.count,
      example: cell.example,
      headline_eligible: cell.headline_exclusions.length === 0,
      headline_exclusions: cell.headline_exclusions,
      provenance: cell.provenance,
    };
  });
}
