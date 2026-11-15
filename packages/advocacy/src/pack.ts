import { isRealDate } from "./dates.ts";
import {
  HEADLINE_MAX_AGE_DAYS,
  STATUS_WINDOW_DAYS,
  aggregate,
  publish,
  resolveConfig,
  smallCommunityMinimum,
  type SuppressionConfig,
} from "./engine.ts";
import { t, type Lang, type MessageKey } from "./i18n/index.ts";
import { PACK_SCHEMA_VERSION, type EvidencePack, type LocalisedText, type Observation } from "./types.ts";
import { validateObservation, validatePack, type ValidationIssue } from "./validate.ts";

export interface BuildOptions {
  /** The as-of date, YYYY-MM-DD. It is supplied, never read from the clock, so a pack is reproducible. */
  asOf: string;
  config?: Partial<SuppressionConfig>;
}

export interface RejectedObservation {
  index: number;
  issues: ValidationIssue[];
}

export interface BuildResult {
  pack: EvidencePack;
  rejected: RejectedObservation[];
}

const METHOD_KEYS = ["pack.method.1", "pack.method.2", "pack.method.3", "pack.method.4", "pack.method.5"] as const;
const RULE_IDS = [
  "small_cell_threshold",
  "small_community_minimum",
  "community_size_unknown_minimum",
  "no_rounding",
  "no_totals",
] as const;

function both(key: MessageKey, vars: Record<string, string | number>): LocalisedText {
  return { en: t("en", key, vars), fr: t("fr", key, vars) };
}

function statements(lang: Lang, vars: Record<string, string | number>): string[] {
  return METHOD_KEYS.map((key) => t(lang, key, vars));
}

/**
 * Validate the inputs, aggregate them, suppress, and assemble the pack. Invalid observations are
 * rejected and counted; their content is never copied into the pack.
 */
export function buildEvidencePack(raw: readonly unknown[], options: BuildOptions): BuildResult {
  if (!isRealDate(options.asOf)) throw new RangeError("asOf must be a real date written YYYY-MM-DD");
  const config = resolveConfig(options.config);
  const limit = smallCommunityMinimum(config);
  const vars = { k: config.k, limit };

  const accepted: Observation[] = [];
  const rejected: RejectedObservation[] = [];
  raw.forEach((value, index) => {
    const result = validateObservation(value);
    if (result.ok) accepted.push(result.value);
    else rejected.push({ index, issues: result.issues });
  });

  const cells = publish(aggregate(accepted, options.asOf), config);
  const pack: EvidencePack = {
    record_type: "advocacy_evidence_pack",
    schema_version: PACK_SCHEMA_VERSION,
    publication_context: "prototype",
    as_of: options.asOf,
    demonstration: accepted.some((o) => o.example),
    methodology: { en: statements("en", vars), fr: statements("fr", vars) },
    suppression: {
      k: config.k,
      small_community_factor: config.smallCommunityFactor,
      small_community_minimum: limit,
      raw_counts_withheld: true,
      totals_published: false,
      rules: RULE_IDS.map((id) => ({ id, ...both(`pack.rule.${id}`, vars) })),
    },
    counting: {
      reference: "packages/schema/docs/counting-rules.md",
      headline_max_age_days: HEADLINE_MAX_AGE_DAYS,
      status_window_days: STATUS_WINDOW_DAYS,
      note: both("pack.counting", vars),
    },
    headline: {
      eligible_cells: cells.filter((c) => c.state === "published" && c.headline_eligible).length,
      province_wide_total: null,
    },
    inputs: {
      observations_received: raw.length,
      observations_accepted: accepted.length,
      observations_rejected: rejected.length,
      example_observations: accepted.filter((o) => o.example).length,
    },
    counts: {
      published: cells.filter((c) => c.state === "published").length,
      suppressed: cells.filter((c) => c.state === "suppressed").length,
      unknown: cells.filter((c) => c.state === "unknown").length,
    },
    cells,
  };

  const check = validatePack(pack);
  if (!check.ok) throw new Error(`evidence pack failed its own schema: ${JSON.stringify(check.issues)}`);
  return { pack, rejected };
}

export function serialisePack(pack: EvidencePack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

export function packFilename(pack: EvidencePack): string {
  return `advocacy-evidence-pack-${pack.as_of}.json`;
}
