/**
 * Data-QA display helpers: unknown rates, stale badges, provenance lines.
 * Pure functions, no I/O. Unknown stays UNKNOWN: nothing here infers a value.
 */

export type Locale = 'en' | 'fr';

/** Minimum touch target (CSS px) for any interactive badge built from these helpers. */
export const MIN_TARGET_PX = 44;
export const DEFAULT_STALE_AFTER_DAYS = 180;

/** Open licences accepted for displayed data (SPDX-style ids). */
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

/**
 * Provider terms the project has accepted for a named source. They permit the
 * use shown in the app but are not open licences, so they are labelled as
 * terms of use, never flagged as a problem and never called open.
 */
export const ACCEPTED_TERMS: readonly RegExp[] = [
  /^metrolinx access and use agreement\b/i,
  /^ogl-ontario-metrolinx\b/i,
  /^ltc open data terms of use\b/i,
];

const OPEN_NAMES: readonly RegExp[] = [
  /^cc0\b/i,
  /^cc[- ]by(?:[- ]sa)?[- ]4\.0$/i,
  /^odbl\b/i,
  /^odc[- ]by\b/i,
  /^pddl\b/i,
  /^ogl\b/i,
  /^open government licen[cs]e\b/i,
  /^licence du gouvernement ouvert\b/i,
];

/** 'unknown' when no licence is recorded; 'unrecognised' is not a claim that it is closed. */
export type LicenceKind = 'open' | 'terms' | 'unrecognised' | 'unknown';

export function licenceKind(licence: string | null | undefined): LicenceKind {
  const value = clean(licence);
  if (value === null || value.toUpperCase() === 'UNKNOWN') return 'unknown';
  if (ACCEPTED_TERMS.some((pattern) => pattern.test(value))) return 'terms';
  if (OPEN_LICENCES.includes(value) || OPEN_NAMES.some((pattern) => pattern.test(value))) return 'open';
  return 'unrecognised';
}

export interface Provenance {
  source?: string | null | undefined;
  licence?: string | null | undefined;
  /** ISO 8601 date (YYYY-MM-DD) or date-time the data was retrieved. */
  retrievedAt?: string | null | undefined;
}

export type ProvenanceIssue =
  | 'missing-source'
  | 'missing-licence'
  | 'missing-date'
  | 'invalid-date'
  | 'future-date'
  | 'licence-unrecognised';

export type FreshnessState = 'fresh' | 'stale' | 'unknown';

export interface RateDisplay {
  known: boolean;
  text: string;
  ariaLabel: string;
}

export interface DataBadge {
  state: FreshnessState;
  /** Whole days since retrieval; null when the date is missing, invalid or in the future. */
  ageDays: number | null;
  licence: LicenceKind;
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
    rateUnknown: 'Unknown',
    rateUnknownSpoken: 'unknown',
    rate: 'Rate',
    today: 'Retrieved today',
    oneDay: 'Retrieved 1 day ago',
    days: 'Retrieved {n} days ago',
    stale: 'May be out of date.',
    noDate: 'Retrieval date unknown',
    source: 'Source',
    licence: 'Licence',
    retrieved: 'Retrieved',
    colon: ': ',
  },
  fr: {
    // Source, licence and date are feminine in French: « Inconnue ».
    unknown: 'Inconnue',
    // Taux is masculine: « Taux : inconnu ».
    rateUnknown: 'Inconnu',
    rateUnknownSpoken: 'inconnu',
    rate: 'Taux',
    today: 'Récupéré aujourd’hui',
    oneDay: 'Récupéré il y a 1 jour',
    days: 'Récupéré il y a {n} jours',
    stale: 'Possiblement périmé.',
    noDate: 'Date de récupération inconnue',
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
    return { known: false, text: s.rateUnknown, ariaLabel: `${s.rate}${s.colon}${s.rateUnknownSpoken}` };
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

/** Whole days since retrieval, or null when unknown (missing, invalid or future date). */
export function ageInDays(retrievedAt: string | null | undefined, now: Date): number | null {
  const t = parseIsoDate(retrievedAt);
  if (t === null) return null;
  const age = Math.floor((now.getTime() - t) / DAY_MS);
  return age < 0 ? null : age;
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
  else if (licenceKind(lic) === 'unrecognised') issues.push('licence-unrecognised');
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
  const ageDays = ageInDays(p.retrievedAt, now);
  // The label states the age; it never says "recent" for data that may be months old.
  const age = ageDays === null ? s.noDate : ageDays === 0 ? s.today : ageDays === 1 ? s.oneDay : s.days.replace('{n}', String(ageDays));
  const label = state === 'stale' ? `${age}. ${s.stale}` : age;
  const line = provenanceLine(p, locale);
  return {
    state,
    ageDays,
    licence: licenceKind(p.licence),
    label,
    provenanceLine: line,
    ariaLabel: `${label.replace(/\.$/, '')}. ${line}`,
    issues: checkProvenance(p, now),
    minTargetPx: MIN_TARGET_PX,
  };
}
