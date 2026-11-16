/**
 * Three-state attribute coverage. "Unknown" is its own bucket: it is never merged
 * into "No", never dropped, and never guessed from other fields.
 */
import { formatRate, type Locale, type RateDisplay } from './dataStatus';

export type Tri = 'yes' | 'no' | 'unknown';

const YES = new Set(['yes', 'true', 'oui']);
const NO = new Set(['no', 'false', 'non']);

/** Strict parse: only clear yes/no values count; everything else is unknown. */
export function parseTri(v: unknown): Tri {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (YES.has(s)) return 'yes';
    if (NO.has(s)) return 'no';
  }
  return 'unknown';
}

export interface TriTally {
  yes: number;
  no: number;
  unknown: number;
  total: number;
}

export function tally(values: readonly unknown[]): TriTally {
  const t: TriTally = { yes: 0, no: 0, unknown: 0, total: values.length };
  for (const v of values) t[parseTri(v)]++;
  return t;
}

/** Share of records whose value is unknown, as a percentage; null when there are no records. */
export function unknownPercent(t: TriTally): number | null {
  return t.total === 0 ? null : (t.unknown / t.total) * 100;
}

/** Yes share among records with a known value; null when nothing is known. */
export function yesOfKnownPercent(t: TriTally): number | null {
  const known = t.yes + t.no;
  return known === 0 ? null : (t.yes / known) * 100;
}

export interface AttributeDef {
  key: string;
  label: { en: string; fr: string };
}

export interface AttributeCoverage {
  key: string;
  label: string;
  tally: TriTally;
  unknownShare: RateDisplay;
  yesOfKnown: RateDisplay;
}

export function coverageTable(
  records: readonly Readonly<Record<string, unknown>>[],
  attributes: readonly AttributeDef[],
  locale: Locale,
): AttributeCoverage[] {
  return attributes.map((a) => {
    const t = tally(records.map((r) => r[a.key]));
    return {
      key: a.key,
      label: a.label[locale],
      tally: t,
      unknownShare: formatRate(unknownPercent(t), locale),
      yesOfKnown: formatRate(yesOfKnownPercent(t), locale),
    };
  });
}
