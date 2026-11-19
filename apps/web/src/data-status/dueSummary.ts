/**
 * Reviews coming up: how many sources are past their review date, how many reach it within 7,
 * 30 and 90 days, and how many cannot be scheduled because their retrieved date is unknown.
 * The counts use the same day arithmetic as the review-date filter, so each one can be listed.
 */
import type { AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { daysUntilReview, DUE_WINDOW_DAYS, DUE_WINDOWS, isDueWithin, type DueWindow } from './filters';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export type DueRowId = 'past' | DueWindow | 'unscheduled';
export const DUE_ROW_IDS: readonly DueRowId[] = ['past', ...DUE_WINDOWS, 'unscheduled'];

export interface DueSummaryRow {
  id: DueRowId;
  count: number;
}

export interface DueSummary {
  rows: DueSummaryRow[];
  total: number;
  /** Sources with a review date further away than the widest window. */
  later: number;
}

export function buildDueSummary(audit: AuditResult): DueSummary {
  const widest = Math.max(...DUE_WINDOWS.map((w) => DUE_WINDOW_DAYS[w]));
  let past = 0;
  let unscheduled = 0;
  let later = 0;
  const within: Record<DueWindow, number> = { d7: 0, d30: 0, d90: 0 };
  for (const s of audit.sources) {
    const days = daysUntilReview(s);
    if (days === null) unscheduled += 1;
    else if (days < 0) past += 1;
    else if (days > widest) later += 1;
    for (const w of DUE_WINDOWS) if (isDueWithin(s, w)) within[w] += 1;
  }
  return {
    rows: [{ id: 'past', count: past }, ...DUE_WINDOWS.map((w) => ({ id: w, count: within[w] })), { id: 'unscheduled', count: unscheduled }],
    total: audit.sources.length,
    later,
  };
}

type Key =
  | 'du.title'
  | 'du.intro'
  | 'du.none'
  | 'du.caption'
  | 'du.colWhen'
  | 'du.colCount'
  | 'du.past'
  | 'du.within'
  | 'du.unscheduled'
  | 'du.later.one'
  | 'du.later.other';

const MESSAGES: Messages<Key> = {
  en: {
    'du.title': 'Reviews coming up',
    'du.intro': 'A review date is the retrieved date plus the review period for that kind of data. The three windows overlap: a source due within 7 days is also counted within 30 and within 90.',
    'du.none': 'There are no sources to schedule.',
    'du.caption': 'Sources by review date',
    'du.colWhen': 'Review date',
    'du.colCount': 'Sources',
    'du.past': 'Already passed',
    'du.within': 'Within {days} days',
    'du.unscheduled': 'Not scheduled (retrieved date unknown)',
    'du.later.one': '{n} source has a review date more than {days} days away.',
    'du.later.other': '{n} sources have a review date more than {days} days away.',
  },
  fr: {
    'du.title': 'Révisions à venir',
    'du.intro': 'La date de révision est la date de récupération à laquelle s’ajoute la période de révision de ce type de données. Les trois fenêtres se chevauchent : une source à réviser d’ici 7 jours est aussi comptée d’ici 30 jours et d’ici 90 jours.',
    'du.none': 'Il n’y a aucune source à planifier.',
    'du.caption': 'Sources selon la date de révision',
    'du.colWhen': 'Date de révision',
    'du.colCount': 'Sources',
    'du.past': 'Déjà dépassée',
    'du.within': 'D’ici {days} jours',
    'du.unscheduled': 'Non planifiée (date de récupération inconnue)',
    'du.later.one': '{n} source a une date de révision dans plus de {days} jours.',
    'du.later.other': '{n} sources ont une date de révision dans plus de {days} jours.',
  },
};

export const DUE_SUMMARY_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function dueRowLabel(id: DueRowId, locale: Locale): string {
  if (id === 'past') return tx(locale, 'du.past');
  if (id === 'unscheduled') return tx(locale, 'du.unscheduled');
  return tx(locale, 'du.within', { days: DUE_WINDOW_DAYS[id] });
}

/** An extra last column: a heading and one cell of ready-made HTML for each row. */
export interface DueRowExtra {
  heading: string;
  cell: (id: DueRowId) => string;
}

/** With `extra`, a row that counts no source gets an empty cell. */
export function renderDueSummaryHtml(d: DueSummary, locale: Locale, extra?: DueRowExtra): string {
  const heading = `<h2 id="ds-duesoon-title">${escapeHtml(tx(locale, 'du.title'))}</h2>`;
  if (d.total === 0) return `<section aria-labelledby="ds-duesoon-title">${heading}<p>${escapeHtml(tx(locale, 'du.none'))}</p></section>`;
  const rows = d.rows
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(dueRowLabel(r.id, locale))}</th><td>${r.count}</td>${extra ? `<td>${r.count > 0 ? extra.cell(r.id) : ''}</td>` : ''}</tr>`,
    )
    .join('');
  const widest = Math.max(...DUE_WINDOWS.map((w) => DUE_WINDOW_DAYS[w]));
  return (
    `<section aria-labelledby="ds-duesoon-title">${heading}<p>${escapeHtml(tx(locale, 'du.intro'))}</p>` +
    `<table><caption>${escapeHtml(tx(locale, 'du.caption'))}</caption><thead><tr><th scope="col">${escapeHtml(tx(locale, 'du.colWhen'))}</th>` +
    `<th scope="col">${escapeHtml(tx(locale, 'du.colCount'))}</th>${extra ? `<th scope="col">${escapeHtml(extra.heading)}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table>` +
    (d.later > 0 ? `<p>${escapeHtml(tx.count(locale, 'du.later', d.later, { days: widest }))}</p>` : '') +
    '</section>'
  );
}
