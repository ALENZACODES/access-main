/**
 * Review workload forecast: how many sources reach their review date in each coming week.
 * It only regroups the review queue; it never invents a date. Sources without a readable
 * retrieved date are listed as not scheduled. Past-due sources are counted on their own,
 * not folded into this week.
 */
import type { AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { formatDisplayDate } from './locale';
import { buildReviewQueue, addDaysIso, toIsoDay, type DueItem } from './reviewDue';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export const DEFAULT_WEEKS = 12;
export const MIN_WEEKS = 1;
export const MAX_WEEKS = 104;

export interface WorkloadWeek {
  /** 0 is the week that starts today (UTC). */
  index: number;
  startIso: string;
  endIso: string;
  items: DueItem[];
}

export interface Workload {
  todayIso: string;
  weeks: WorkloadWeek[];
  pastDue: DueItem[];
  beyond: DueItem[];
  unscheduled: DueItem[];
  /** The week with the most sources, earliest on a tie; null when no week has any. */
  busiest: WorkloadWeek | null;
}

export function clampWeeks(weeks: number): number {
  if (!Number.isFinite(weeks)) return DEFAULT_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.trunc(weeks)));
}

export function buildWorkload(audit: AuditResult, now: Date, weeks: number = DEFAULT_WEEKS): Workload {
  const count = clampWeeks(weeks);
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayIso = toIsoDay(todayMs);
  const grid: WorkloadWeek[] = [];
  for (let i = 0; i < count; i++) {
    const startIso = addDaysIso(todayIso, i * 7) ?? todayIso;
    const endIso = addDaysIso(todayIso, i * 7 + 6) ?? startIso;
    grid.push({ index: i, startIso, endIso, items: [] });
  }
  const pastDue: DueItem[] = [];
  const beyond: DueItem[] = [];
  const unscheduled: DueItem[] = [];
  for (const item of buildReviewQueue(audit, now)) {
    if (item.daysUntil === null) unscheduled.push(item);
    else if (item.daysUntil < 0) pastDue.push(item);
    else {
      const week = grid[Math.floor(item.daysUntil / 7)];
      if (week === undefined) beyond.push(item);
      else week.items.push(item);
    }
  }
  let busiest: WorkloadWeek | null = null;
  for (const w of grid) if (w.items.length > 0 && (busiest === null || w.items.length > busiest.items.length)) busiest = w;
  return { todayIso, weeks: grid, pastDue, beyond, unscheduled, busiest };
}

export function scheduledCount(w: Workload): number {
  return w.weeks.reduce((n, week) => n + week.items.length, 0);
}

type Key =
  | 'wl.title'
  | 'wl.intro'
  | 'wl.none'
  | 'wl.caption'
  | 'wl.colWeek'
  | 'wl.colCount'
  | 'wl.colSources'
  | 'wl.range'
  | 'wl.pastDue.one'
  | 'wl.pastDue.other'
  | 'wl.thisWeek.one'
  | 'wl.thisWeek.other'
  | 'wl.within.one'
  | 'wl.within.other'
  | 'wl.busiest.one'
  | 'wl.busiest.other'
  | 'wl.beyond.one'
  | 'wl.beyond.other'
  | 'wl.unscheduled.one'
  | 'wl.unscheduled.other'
  | 'wl.empty'
  | 'wl.sep';

const MESSAGES: Messages<Key> = {
  en: {
    'wl.title': 'Review workload',
    'wl.intro': 'Sources grouped by the week their review date falls in. A review date is a reminder to look at the source again, not a statement about the data.',
    'wl.none': 'No source has a review date to plan around.',
    'wl.caption': 'Sources to review, by week',
    'wl.colWeek': 'Week',
    'wl.colCount': 'Sources',
    'wl.colSources': 'Which sources',
    'wl.range': '{start} to {end}',
    'wl.pastDue.one': '{n} source is past its review date.',
    'wl.pastDue.other': '{n} sources are past their review date.',
    'wl.thisWeek.one': '{n} source reaches its review date in the next 7 days.',
    'wl.thisWeek.other': '{n} sources reach their review date in the next 7 days.',
    'wl.within.one': '{n} source reaches its review date within {weeks} weeks.',
    'wl.within.other': '{n} sources reach their review date within {weeks} weeks.',
    'wl.busiest.one': 'The busiest week starts {start}, with {n} source.',
    'wl.busiest.other': 'The busiest week starts {start}, with {n} sources.',
    'wl.beyond.one': '{n} source is due after that.',
    'wl.beyond.other': '{n} sources are due after that.',
    'wl.unscheduled.one': '{n} source is not scheduled because its retrieved date is unknown.',
    'wl.unscheduled.other': '{n} sources are not scheduled because their retrieved date is unknown.',
    'wl.empty': 'None',
    'wl.sep': ', ',
  },
  fr: {
    'wl.title': 'Charge de révision',
    'wl.intro': 'Les sources sont regroupées selon la semaine de leur date de révision. Une date de révision est un rappel pour consulter de nouveau la source, pas un constat sur les données.',
    'wl.none': 'Aucune source n’a de date de révision à planifier.',
    'wl.caption': 'Sources à réviser, par semaine',
    'wl.colWeek': 'Semaine',
    'wl.colCount': 'Sources',
    'wl.colSources': 'Quelles sources',
    'wl.range': '{start} au {end}',
    'wl.pastDue.one': '{n} source a dépassé sa date de révision.',
    'wl.pastDue.other': '{n} sources ont dépassé leur date de révision.',
    'wl.thisWeek.one': '{n} source atteint sa date de révision dans les 7 prochains jours.',
    'wl.thisWeek.other': '{n} sources atteignent leur date de révision dans les 7 prochains jours.',
    'wl.within.one': '{n} source atteint sa date de révision d’ici {weeks} semaines.',
    'wl.within.other': '{n} sources atteignent leur date de révision d’ici {weeks} semaines.',
    'wl.busiest.one': 'La semaine la plus chargée commence le {start}, avec {n} source.',
    'wl.busiest.other': 'La semaine la plus chargée commence le {start}, avec {n} sources.',
    'wl.beyond.one': '{n} source est à réviser plus tard.',
    'wl.beyond.other': '{n} sources sont à réviser plus tard.',
    'wl.unscheduled.one': '{n} source n’est pas planifiée, car sa date de récupération est inconnue.',
    'wl.unscheduled.other': '{n} sources ne sont pas planifiées, car leur date de récupération est inconnue.',
    'wl.empty': 'Aucune',
    'wl.sep': ', ',
  },
};

export const WORKLOAD_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function weekRangeText(week: Pick<WorkloadWeek, 'startIso' | 'endIso'>, locale: Locale): string {
  return tx(locale, 'wl.range', { start: formatDisplayDate(week.startIso, locale), end: formatDisplayDate(week.endIso, locale) });
}

/** Plain sentences, in the order a reader needs them: past due, soon, busiest, later, not scheduled. */
export function workloadSentences(w: Workload, locale: Locale): string[] {
  const out: string[] = [];
  if (w.pastDue.length > 0) out.push(tx.count(locale, 'wl.pastDue', w.pastDue.length));
  const first = w.weeks[0];
  if (first !== undefined && first.items.length > 0) out.push(tx.count(locale, 'wl.thisWeek', first.items.length));
  const planned = scheduledCount(w);
  if (planned > 0) out.push(tx.count(locale, 'wl.within', planned, { weeks: w.weeks.length }));
  if (w.busiest !== null) {
    out.push(tx.count(locale, 'wl.busiest', w.busiest.items.length, { start: formatDisplayDate(w.busiest.startIso, locale) }));
  }
  if (w.beyond.length > 0) out.push(tx.count(locale, 'wl.beyond', w.beyond.length));
  if (w.unscheduled.length > 0) out.push(tx.count(locale, 'wl.unscheduled', w.unscheduled.length));
  return out;
}

function itemName(i: DueItem): string {
  const name = i.name !== null && i.name.trim() !== '' ? i.name.trim() : i.sourceId;
  return `${i.datasetName.trim() === '' ? i.datasetId : i.datasetName.trim()} / ${name}`;
}

/** Accessible table: a caption, scoped headers, one row per week that has work (empty weeks are skipped). */
export function renderWorkloadHtml(w: Workload, locale: Locale): string {
  const title = escapeHtml(tx(locale, 'wl.title'));
  const sentences = workloadSentences(w, locale);
  const rows = w.weeks.filter((wk) => wk.items.length > 0);
  const nothing = rows.length === 0 && w.pastDue.length === 0 && w.beyond.length === 0 && w.unscheduled.length === 0;
  const summary = nothing
    ? `<p>${escapeHtml(tx(locale, 'wl.none'))}</p>`
    : `<ul>${sentences.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`;
  const sep = tx(locale, 'wl.sep');
  const table =
    rows.length === 0
      ? ''
      : `<table><caption>${escapeHtml(tx(locale, 'wl.caption'))}</caption><thead><tr>` +
        `<th scope="col">${escapeHtml(tx(locale, 'wl.colWeek'))}</th>` +
        `<th scope="col">${escapeHtml(tx(locale, 'wl.colCount'))}</th>` +
        `<th scope="col">${escapeHtml(tx(locale, 'wl.colSources'))}</th></tr></thead><tbody>` +
        rows
          .map(
            (wk) =>
              `<tr><th scope="row">${escapeHtml(weekRangeText(wk, locale))}</th><td>${wk.items.length}</td>` +
              `<td>${escapeHtml(wk.items.map(itemName).join(sep))}</td></tr>`,
          )
          .join('') +
        '</tbody></table>';
  return (
    `<section aria-labelledby="ds-workload-title"><h2 id="ds-workload-title">${title}</h2>` +
    `<p>${escapeHtml(tx(locale, 'wl.intro'))}</p>${summary}${table}</section>`
  );
}
