export type Lang = "en" | "fr";

/** What the person tapped. "UNKNOWN" is written for "I could not check". */
export type Answer = "yes" | "no" | "UNKNOWN";

/**
 * A trip-check draft. Follows the shared field shape
 * `{ value | "UNKNOWN", source_id, licence, retrieved_at, tier, source_key? }`.
 * While `state` is "local" the tier is 0 and the draft is never a place fact.
 * Exporting writes tier 1 (community-reported, unreviewed). Never 2 or 3.
 */
export interface TripDraft {
  id: string;
  field_id: string;
  prompt_id: string;
  value: Answer;
  source_id: "trip-check-device";
  source_key: string;
  licence: "CC0";
  /** ISO date-time of the tap ("last checked"). */
  retrieved_at: string;
  tier: 0 | 1;
  /** True when the field is something the person observed (not a rating). */
  observed: boolean;
  /** Optional caller-supplied place reference, e.g. an OSM id. No GPS is stored. */
  place_ref?: string;
  state: "local" | "exported";
  exported_at?: string;
}

export interface Prompt {
  id: string;
  /** Contribute-export key (I9). See catalog.ts for why these are not J1 sci-fields ids. */
  field_id: string;
  observed: boolean;
  text: Record<Lang, string>;
}

export interface Storage {
  list(): Promise<TripDraft[]>;
  put(draft: TripDraft): Promise<void>;
  remove(id: string): Promise<void>;
}
