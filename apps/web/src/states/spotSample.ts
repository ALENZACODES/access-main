/**
 * Choosing places for a spot check: a short list of saved places for a person to look at in
 * person, to see whether what the pack says matches what they find. The choice is made from the
 * seed alone, so the same places and seed give the same list on any device.
 *
 * With "balanced" on, the list takes places in turn from each wheelchair tag the pack reports, so
 * a rare tag such as "no" is not crowded out by a common one. That is a way to spread the looking,
 * not a statistical sample, and the App never says it represents the whole pack.
 */
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";
import { shuffleSeeded } from "./spotRandom";

export const SAMPLE_SIZES = [3, 5, 10, 20] as const;
export type SampleSize = (typeof SAMPLE_SIZES)[number];
export const DEFAULT_SAMPLE_SIZE: SampleSize = 5;

/** The order tags are taken in when balancing. UNKNOWN is last: it is looked at after the tags the pack does report. */
export const SAMPLE_TAG_ORDER: readonly WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];

export interface SampleOptions {
  readonly size: number;
  readonly seed: string;
  readonly balanced: boolean;
}

export interface SamplePick {
  readonly place: PackPlaceRecord;
  /** The tag the pack reports for it. */
  readonly tag: WheelchairTag;
}

export interface Sample {
  readonly picks: readonly SamplePick[];
  /** Places the person asked for, capped at the size limits. */
  readonly wanted: number;
  /** Places there were to choose from. */
  readonly available: number;
  /** How many picks carry each tag. */
  readonly byTag: Readonly<Record<WheelchairTag, number>>;
}

export function isSampleSize(value: unknown): value is SampleSize {
  return typeof value === "number" && (SAMPLE_SIZES as readonly number[]).includes(value);
}

/** A size from the text of a choice. Anything that is not one of the offered sizes is the default. */
export function parseSampleSize(raw: unknown): SampleSize {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return isSampleSize(n) ? n : DEFAULT_SAMPLE_SIZE;
}

export const MAX_SEED_CHARS = 60;

/** The seed as typed: trimmed, cut to the limit, and "default" when blank. Case is kept: it is part of the seed. */
export function cleanSeed(raw: string, fallback: string): string {
  const s = raw.replace(/\s+/g, " ").trim().slice(0, MAX_SEED_CHARS);
  return s === "" ? fallback : s;
}

const emptyTally = (): Record<WheelchairTag, number> => ({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 });

export function tallyPicks(picks: readonly SamplePick[]): Record<WheelchairTag, number> {
  const out = emptyTally();
  for (const p of picks) out[p.tag] += 1;
  return out;
}

/**
 * The places to look at. Places are first put in a fixed order (by id) so the input order never
 * matters, then drawn with the seed. Never more than `size` places and never the same place twice.
 */
export function sampleForSpotCheck(places: readonly PackPlaceRecord[], options: SampleOptions): Sample {
  const wanted = Math.max(0, Math.min(Math.floor(options.size) || 0, 200));
  const sorted = [...places].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seen = new Set<string>();
  const unique = sorted.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  let chosen: PackPlaceRecord[];
  if (!options.balanced) {
    chosen = shuffleSeeded(unique, options.seed).slice(0, wanted);
  } else {
    // One shuffled queue per tag, each with its own seed, so adding a place to one tag does not reshuffle the others.
    const queues = SAMPLE_TAG_ORDER.map((tag) => shuffleSeeded(unique.filter((p) => p.tag === tag), `${options.seed}|${tag}`));
    chosen = [];
    for (let round = 0; chosen.length < wanted; round += 1) {
      let took = false;
      for (const q of queues) {
        const next = q[round];
        if (next && chosen.length < wanted) {
          chosen.push(next);
          took = true;
        }
      }
      if (!took) break;
    }
  }
  const picks = chosen.map((place) => ({ place, tag: place.tag }));
  return { picks, wanted, available: unique.length, byTag: tallyPicks(picks) };
}
