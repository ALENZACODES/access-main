/**
 * Age distribution of retrieved dates, as a table a screen reader can read (a text
 * alternative to a chart). Bands count whole UTC days since the retrieved date and do
 * not depend on any staleness setting. Sources with no readable date, or a date in the
 * future, are counted in their own "unknown" row, never placed in a band.
 */
import { ageDays } from './age';
import type { AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export interface AgeBand {
  id: string;
  /** Inclusive lower bound in days. */
  from: number;
  /** Inclusive upper bound in days; null means no upper bound. */
  to: number | null;
}

export const AGE_BANDS: readonly AgeBand[] = [
  { id: 'd0_30', from: 0, to: 30 },
  { id: 'd31_90', from: 31, to: 90 },
  { id: 'd91_180', from: 91, to: 180 },
  { id: 'd181_365', from: 181, to: 365 },
  { id: 'd366_plus', from: 366, to: null },
];

export interface AgeBandRow {
  id: string;
  from: number;
  to: number | null;
  count: number;
}

export interface AgeDistribution {
  bands: AgeBandRow[];
  unknown: number;
  total: number;
  /** Oldest and newest known ages in days, or null when no source has a readable date. */
  oldest: number | null;
  newest: number | null;
}

export function bandFor(days: number, bands: readonly AgeBand[] = AGE_BANDS): AgeBand | null {
  if (!Number.isInteger(days) || days < 0) return null;
  for (const b of bands) if (days >= b.from && (b.to === null || days <= b.to)) return b;
  return null;
}

/** Check that a band list covers 0 and up with no gap and no overlap. Returns problems. */
export function checkBands(bands: readonly AgeBand[]): string[] {
  const problems: string[] = [];
  if (bands.length === 0) return ['no bands'];
  if (bands[0]?.from !== 0) problems.push('first band must start at 0');
  bands.forEach((b, i) => {
    if (b.to !== null && b.to < b.from) problems.push(`${b.id}: upper bound below lower bound`);
    const next = bands[i + 1];
    if (next === undefined) {
      if (b.to !== null) problems.push(`${b.id}: last band must have no upper bound`);
    } else if (b.to === null) problems.push(`${b.id}: only the last band may be open-ended`);
    else if (next.from !== b.to + 1) problems.push(`${b.id}: gap or overlap before ${next.id}`);
  });
  return problems;
}

export function buildAgeDistribution(audit: AuditResult, now: Date, bands: readonly AgeBand[] = AGE_BANDS): AgeDistribution {
  const rows: AgeBandRow[] = bands.map((b) => ({ id: b.id, from: b.from, to: b.to, count: 0 }));
  let unknown = 0;
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const s of audit.sources) {
    const days = ageDays(s.retrievedIso, now);
    const band = days === null ? null : bandFor(days, bands);
    if (days === null || band === null) {
      unknown += 1;
      continue;
    }
    const row = rows.find((r) => r.id === band.id);
    if (row !== undefined) row.count += 1;
    oldest = oldest === null ? days : Math.max(oldest, days);
    newest = newest === null ? days : Math.min(newest, days);
  }
  return { bands: rows, unknown, total: audit.sources.length, oldest, newest };
}

type Key =
  | 'age.title'
  | 'age.intro'
  | 'age.caption'
  | 'age.colBand'
  | 'age.colCount'
  | 'age.colShare'
  | 'age.band.closed'
  | 'age.band.open'
  | 'age.unknownRow'
  | 'age.none'
  | 'age.range.one'
  | 'age.range.other'
  | 'age.unknownNote.one'
  | 'age.unknownNote.other';

const MESSAGES: Messages<Key> = {
  en: {
    'age.title': 'How old the retrieved dates are',
    'age.intro': 'Each source is counted once, by whole days since its retrieved date. This does not use the review-period setting.',
    'age.caption': 'Sources by age of retrieved date',
    'age.colBand': 'Age',
    'age.colCount': 'Sources',
    'age.colShare': 'Share of all sources',
    'age.band.closed': '{from} to {to} days',
    'age.band.open': 'More than {from} days',
    'age.unknownRow': 'Date UNKNOWN',
    'age.none': 'There are no sources to count.',
    'age.range.one': 'The most recent retrieved date is {newest} day old and the oldest is {oldest} days old.',
    'age.range.other': 'The most recent retrieved date is {newest} days old and the oldest is {oldest} days old.',
    'age.unknownNote.one': '{n} source has no usable retrieved date and is not placed in an age band.',
    'age.unknownNote.other': '{n} sources have no usable retrieved date and are not placed in an age band.',
  },
  fr: {
    'age.title': 'Âge des dates de récupération',
    'age.intro': 'Chaque source est comptée une seule fois, selon le nombre de jours entiers écoulés depuis sa date de récupération. Le seuil de péremption n’est pas utilisé.',
    'age.caption': 'Sources selon l’âge de la date de récupération',
    'age.colBand': 'Âge',
    'age.colCount': 'Sources',
    'age.colShare': 'Part de toutes les sources',
    'age.band.closed': 'De {from} à {to} jours',
    'age.band.open': 'Plus de {from} jours',
    'age.unknownRow': 'Date UNKNOWN',
    'age.none': 'Il n’y a aucune source à compter.',
    'age.range.one': 'La date de récupération la plus récente date de {newest} jour et la plus ancienne de {oldest} jours.',
    'age.range.other': 'La date de récupération la plus récente date de {newest} jours et la plus ancienne de {oldest} jours.',
    'age.unknownNote.one': '{n} source n’a pas de date de récupération utilisable et n’est placée dans aucune tranche d’âge.',
    'age.unknownNote.other': '{n} sources n’ont pas de date de récupération utilisable et ne sont placées dans aucune tranche d’âge.',
  },
};

export const AGE_BAND_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function bandLabel(b: Pick<AgeBand, 'from' | 'to'>, locale: Locale): string {
  return b.to === null ? tx(locale, 'age.band.open', { from: b.from - 1 }) : tx(locale, 'age.band.closed', { from: b.from, to: b.to });
}

/** Whole-number share ("33 %" in French, "33%" in English); empty when there is nothing to divide. */
export function shareText(count: number, total: number, locale: Locale): string {
  if (total <= 0) return '';
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', { style: 'percent', maximumFractionDigits: 0 }).format(count / total);
}

/** The words for one age filter value: a band's label, or the Unknown-date label. Null for an id that is not a band. */
export function ageValueLabel(id: string, locale: Locale): string | null {
  if (id === 'unknown') return tx(locale, 'age.unknownRow');
  const band = AGE_BANDS.find((b) => b.id === id);
  return band === undefined ? null : bandLabel(band, locale);
}

/** An extra last column on the age table: a heading and one cell of ready-made HTML for each row ('unknown' is the last row). */
export interface AgeRowExtra {
  heading: string;
  cell: (id: string) => string;
}

/** With `extra`, a row that counts no source gets an empty cell. */
export function renderAgeBandsHtml(d: AgeDistribution, locale: Locale, extra?: AgeRowExtra): string {
  const title = `<h2 id="ds-age-title">${escapeHtml(tx(locale, 'age.title'))}</h2>`;
  if (d.total === 0) {
    return `<section aria-labelledby="ds-age-title">${title}<p>${escapeHtml(tx(locale, 'age.none'))}</p></section>`;
  }
  const rows = [
    ...d.bands.map((b) => ({ id: b.id, label: bandLabel(b, locale), count: b.count })),
    { id: 'unknown', label: tx(locale, 'age.unknownRow'), count: d.unknown },
  ];
  const body = rows
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${r.count}</td><td>${escapeHtml(shareText(r.count, d.total, locale))}</td>${extra ? `<td>${r.count > 0 ? extra.cell(r.id) : ''}</td>` : ''}</tr>`,
    )
    .join('');
  const notes: string[] = [];
  if (d.oldest !== null && d.newest !== null) {
    notes.push(tx.count(locale, 'age.range', d.newest, { newest: d.newest, oldest: d.oldest }));
  }
  if (d.unknown > 0) notes.push(tx.count(locale, 'age.unknownNote', d.unknown));
  return (
    `<section aria-labelledby="ds-age-title">${title}<p>${escapeHtml(tx(locale, 'age.intro'))}</p>` +
    `<table><caption>${escapeHtml(tx(locale, 'age.caption'))}</caption><thead><tr>` +
    `<th scope="col">${escapeHtml(tx(locale, 'age.colBand'))}</th><th scope="col">${escapeHtml(tx(locale, 'age.colCount'))}</th>` +
    `<th scope="col">${escapeHtml(tx(locale, 'age.colShare'))}</th>${extra ? `<th scope="col">${escapeHtml(extra.heading)}</th>` : ''}</tr></thead><tbody>${body}</tbody></table>` +
    notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('') +
    '</section>'
  );
}
