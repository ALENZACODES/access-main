/**
 * Data-QA display helpers: unknown rates, stale badges, provenance lines.
 * Pure functions, no I/O. Unknown stays UNKNOWN: nothing here infers a value.
 */

export type Locale = 'en' | 'fr';

/** Minimum touch target (CSS px) for any interactive badge built from these helpers. */
export const MIN_TARGET_PX = 44;
export const DEFAULT_STALE_AFTER_DAYS = 180;

/** Open licences accepted for displayed data (SPDX-style ids). Anything else is flagged. */
export const OPEN_LICENCES: readonly string[] = [
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'ODbL-1.0',
  'ODC-By-1.0',
  'PDDL-1.0',
  'OGL-Canada-2.0',
  'OGL-Ontario',
];

export interface Provenance {
  source?: string | null;
  licence?: string | null;
  /** ISO 8601 date (YYYY-MM-DD) or date-time the data was retrieved. */
  retrievedAt?: string | null;
}

export type ProvenanceIssue =
  | 'missing-source'
  | 'missing-licence'
  | 'missing-date'
  | 'invalid-date'
  | 'future-date'
  | 'licence-not-open';

export type FreshnessState = 'fresh' | 'stale' | 'unknown';

export interface RateDisplay {
  known: boolean;
  text: string;
  ariaLabel: string;
}

export interface DataBadge {
  state: FreshnessState;
  label: string;
  provenanceLine: string;
  ariaLabel: string;
  issues: ProvenanceIssue[];
  minTargetPx: number;
}

const NBSP = '\u00A0';
const DAY_MS = 86_400_000;

const STRINGS = {
  en: {
    unknown: 'Unknown',
    rateUnknown: 'Rate unknown',
    rate: 'Rate',
    fresh: 'Recently updated',
    stale: 'May be out of date',
    noDate: 'Update date unknown',
    source: 'Source',
    licence: 'Licence',
    retrieved: 'Retrieved',
    colon: ': ',
  },
  fr: {
    unknown: 'Inconnue',
    rateUnknown: 'Taux inconnu',
    rate: 'Taux',
    fresh: 'Mis à jour récemment',
    stale: 'Possiblement périmé',
    noDate: 'Date de mise à jour inconnue',
    source: 'Source',
    licence: 'Licence',
    retrieved: 'Date de récupération',
    colon: `${NBSP}: `,
  },
} as const;

function clean(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * Format a percentage rate. Anything that is not a finite number in 0..100
 * (null, undefined, NaN, strings, out of range) is UNKNOWN, never 0.
 */
export function formatRate(value: unknown, locale: Locale): RateDisplay {
  const s = STRINGS[locale];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    return { known: false, text: s.unknown, ariaLabel: s.rateUnknown };
  }
  const n = value.toFixed(1);
  const text = locale === 'fr' ? `${n.replace('.', ',')}${NBSP}%` : `${n}%`;
  return { known: true, text, ariaLabel: `${s.rate}${s.colon}${text}` };
}

/** Parse an ISO date; returns epoch ms or null if not a strict ISO date. */
export function parseIsoDate(value: string | null | undefined): number | null {
  const v = clean(value);
  if (v === null || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** Freshness: invalid or future dates are 'unknown', never 'fresh'. */
export function freshness(
  retrievedAt: string | null | undefined,
  now: Date,
  staleAfterDays: number = DEFAULT_STALE_AFTER_DAYS,
): FreshnessState {
  const t = parseIsoDate(retrievedAt);
  if (t === null) return 'unknown';
  const age = Math.floor((now.getTime() - t) / DAY_MS);
  if (age < 0) return 'unknown';
  return age > staleAfterDays ? 'stale' : 'fresh';
}

export function checkProvenance(p: Provenance, now: Date): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  if (clean(p.source) === null) issues.push('missing-source');
  const lic = clean(p.licence);
  if (lic === null) issues.push('missing-licence');
  else if (!OPEN_LICENCES.includes(lic)) issues.push('licence-not-open');
  if (clean(p.retrievedAt) === null) issues.push('missing-date');
  else {
    const t = parseIsoDate(p.retrievedAt);
    if (t === null) issues.push('invalid-date');
    else if (t > now.getTime() + DAY_MS) issues.push('future-date');
  }
  return issues;
}

/** One consistent provenance line; missing parts show as Unknown, never blank or guessed. */
export function provenanceLine(p: Provenance, locale: Locale): string {
  const s = STRINGS[locale];
  const date = parseIsoDate(p.retrievedAt) === null ? null : (clean(p.retrievedAt) as string).slice(0, 10);
  const part = (label: string, v: string | null) => `${label}${s.colon}${v ?? s.unknown}`;
  return [
    part(s.source, clean(p.source)),
    part(s.licence, clean(p.licence)),
    part(s.retrieved, date),
  ].join(' · ');
}

export function dataBadge(
  p: Provenance,
  locale: Locale,
  now: Date,
  staleAfterDays: number = DEFAULT_STALE_AFTER_DAYS,
): DataBadge {
  const s = STRINGS[locale];
  const state = freshness(p.retrievedAt, now, staleAfterDays);
  const label = state === 'fresh' ? s.fresh : state === 'stale' ? s.stale : s.noDate;
  const line = provenanceLine(p, locale);
  return {
    state,
    label,
    provenanceLine: line,
    ariaLabel: `${label}. ${line}`,
    issues: checkProvenance(p, now),
    minTargetPx: MIN_TARGET_PX,
  };
}
