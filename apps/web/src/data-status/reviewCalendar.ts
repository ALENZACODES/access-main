/**
 * Review dates by month: for the twelve months starting with the current one, how many sources
 * reach their review date in each, with a few names. Dates already passed, dates further away
 * and sources that cannot be scheduled are counted on their own lines, so every source is
 * counted exactly once.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { daysUntilReview } from './filters';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { reviewDateIso } from './rowDetail';
import { escapeHtml } from './sourceList';

export const CALENDAR_MONTHS = 12;
export const MAX_MONTH_EXAMPLES = 3;

export interface CalendarMonth {
  /** YYYY-MM */
  id: string;
  sources: AuditedSource[];
}

export interface ReviewCalendar {
  months: CalendarMonth[];
  /** Review date already passed. */
  past: number;
  /** Review date after the last month shown. */
  later: number;
  /** No usable retrieved date, so nothing is scheduled. */
  unscheduled: number;
  total: number;
}

/** The YYYY-MM ids of `count` months starting with the month `now` falls in (UTC). */
export function monthIds(now: Date, count: number = CALENDAR_MONTHS): string[] {
  const out: string[] = [];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  for (let i = 0; i < Math.max(0, Math.trunc(count)); i++) {
    const d = new Date(Date.UTC(year, month + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Sorts every source into past, one of the months, later, or unscheduled. A review date earlier
 * in the current month that has already passed counts as past, not under the month.
 */
export function buildReviewCalendar(audit: AuditResult, now: Date, count: number = CALENDAR_MONTHS): ReviewCalendar {
  const ids = monthIds(now, count);
  const byId = new Map<string, AuditedSource[]>(ids.map((id) => [id, []]));
  let past = 0;
  let later = 0;
  let unscheduled = 0;
  for (const s of audit.sources) {
    const iso = reviewDateIso(s);
    const days = daysUntilReview(s);
    if (iso === null || days === null) unscheduled += 1;
    else if (days < 0) past += 1;
    else {
      const list = byId.get(iso.slice(0, 7));
      if (list === undefined) later += 1;
      else list.push(s);
    }
  }
  const months = ids.map((id) => ({
    id,
    sources: (byId.get(id) ?? []).sort((a, b) => (reviewDateIso(a) ?? '').localeCompare(reviewDateIso(b) ?? '') || a.datasetName.localeCompare(b.datasetName) || a.sourceId.localeCompare(b.sourceId)),
  }));
  return { months, past, later, unscheduled, total: audit.sources.length };
}

type Key =
  | 'rc.title'
  | 'rc.intro'
  | 'rc.none'
  | 'rc.caption'
  | 'rc.colMonth'
  | 'rc.colCount'
  | 'rc.colExamples'
  | 'rc.join'
  | 'rc.more.one'
  | 'rc.more.other'
  | 'rc.nothing'
  | 'rc.past.one'
  | 'rc.past.other'
  | 'rc.later.one'
  | 'rc.later.other'
  | 'rc.unscheduled.one'
  | 'rc.unscheduled.other'
  | 'rc.quiet';

const MESSAGES: Messages<Key> = {
  en: {
    'rc.title': 'Review dates by month',
    'rc.intro': 'Each source is counted in the month its review date falls in. Months are counted in UTC.',
    'rc.none': 'There are no sources to schedule.',
    'rc.caption': 'Sources reaching their review date, month by month',
    'rc.colMonth': 'Month',
    'rc.colCount': 'Sources',
    'rc.colExamples': 'For example',
    'rc.join': '; ',
    'rc.more.one': '{list}, and {n} more',
    'rc.more.other': '{list}, and {n} more',
    'rc.nothing': 'None',
    'rc.past.one': '{n} source is already past its review date.',
    'rc.past.other': '{n} sources are already past their review date.',
    'rc.later.one': '{n} source has a review date after the months shown.',
    'rc.later.other': '{n} sources have a review date after the months shown.',
    'rc.unscheduled.one': '{n} source is not scheduled, because its retrieved date is UNKNOWN.',
    'rc.unscheduled.other': '{n} sources are not scheduled, because their retrieved date is UNKNOWN.',
    'rc.quiet': 'No review date falls in the months shown.',
  },
  fr: {
    'rc.title': 'Dates de révision par mois',
    'rc.intro': 'Chaque source est comptée dans le mois où tombe sa date de révision. Les mois sont comptés en temps universel (UTC).',
    'rc.none': 'Il n’y a aucune source à planifier.',
    'rc.caption': 'Sources atteignant leur date de révision, mois par mois',
    'rc.colMonth': 'Mois',
    'rc.colCount': 'Sources',
    'rc.colExamples': 'Par exemple',
    'rc.join': '\u202F; ',
    'rc.more.one': '{list}, et {n} de plus',
    'rc.more.other': '{list}, et {n} de plus',
    'rc.nothing': 'Aucune',
    'rc.past.one': '{n} source a déjà dépassé sa date de révision.',
    'rc.past.other': '{n} sources ont déjà dépassé leur date de révision.',
    'rc.later.one': '{n} source a une date de révision postérieure aux mois affichés.',
    'rc.later.other': '{n} sources ont une date de révision postérieure aux mois affichés.',
    'rc.unscheduled.one': '{n} source n’est pas planifiée, car sa date de récupération est UNKNOWN.',
    'rc.unscheduled.other': '{n} sources ne sont pas planifiées, car leur date de récupération est UNKNOWN.',
    'rc.quiet': 'Aucune date de révision ne tombe dans les mois affichés.',
  },
};

export const REVIEW_CALENDAR_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** "November 2026" / "novembre 2026" for a YYYY-MM id; the id itself when it cannot be read. */
export function monthLabel(id: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})$/.exec(id);
  if (m === null) return id;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== Number(m[2]) - 1) return id;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
}

/** A few names from a month, then how many more there are. */
export function monthExamples(month: CalendarMonth, locale: Locale): string {
  if (month.sources.length === 0) return tx(locale, 'rc.nothing');
  const names = month.sources.slice(0, MAX_MONTH_EXAMPLES).map((s) => `${s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`);
  const list = names.join(tx(locale, 'rc.join'));
  const more = month.sources.length - names.length;
  return more > 0 ? tx.count(locale, 'rc.more', more, { list }) : list;
}

export function calendarNotes(c: ReviewCalendar, locale: Locale): string[] {
  const notes: string[] = [];
  if (c.past > 0) notes.push(tx.count(locale, 'rc.past', c.past));
  if (c.later > 0) notes.push(tx.count(locale, 'rc.later', c.later));
  if (c.unscheduled > 0) notes.push(tx.count(locale, 'rc.unscheduled', c.unscheduled));
  return notes;
}

export function renderReviewCalendarHtml(c: ReviewCalendar, locale: Locale): string {
  const heading = `<h2 id="ds-calendar-title">${escapeHtml(tx(locale, 'rc.title'))}</h2>`;
  if (c.total === 0) return `<section aria-labelledby="ds-calendar-title">${heading}<p>${escapeHtml(tx(locale, 'rc.none'))}</p></section>`;
  const notes = calendarNotes(c, locale)
    .map((n) => `<p>${escapeHtml(n)}</p>`)
    .join('');
  const busy = c.months.some((m) => m.sources.length > 0);
  if (!busy) return `<section aria-labelledby="ds-calendar-title">${heading}<p>${escapeHtml(tx(locale, 'rc.quiet'))}</p>${notes}</section>`;
  const rows = c.months
    .map((m) => `<tr><th scope="row">${escapeHtml(monthLabel(m.id, locale))}</th><td>${m.sources.length}</td><td>${escapeHtml(monthExamples(m, locale))}</td></tr>`)
    .join('');
  return (
    `<section aria-labelledby="ds-calendar-title">${heading}<p>${escapeHtml(tx(locale, 'rc.intro'))}</p>` +
    `<table><caption>${escapeHtml(tx(locale, 'rc.caption'))}</caption><thead><tr><th scope="col">${escapeHtml(tx(locale, 'rc.colMonth'))}</th>` +
    `<th scope="col">${escapeHtml(tx(locale, 'rc.colCount'))}</th><th scope="col">${escapeHtml(tx(locale, 'rc.colExamples'))}</th></tr></thead><tbody>${rows}</tbody></table>${notes}</section>`
  );
}
