/**
 * What the panel would show on later days if no source were retrieved again. For today and for
 * a few dates ahead, this counts the sources that would be past their review date, and names
 * the ones that cross over between one date and the next. It applies this panel's own rule
 * (retrieved date plus review period) to the calendar. It is arithmetic on the saved records,
 * not a forecast of what any publisher will do.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { t } from './i18n';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { addDaysIso } from './reviewDue';
import { escapeHtml } from './sourceList';

/** Days ahead of today. 0 is today. */
export const FORECAST_HORIZONS = [0, 30, 60, 90, 180, 365] as const;
export const MAX_FORECAST_EXAMPLES = 3;

export interface ForecastStep {
  days: number;
  /** YYYY-MM-DD of that day (UTC); null when it cannot be worked out. */
  iso: string | null;
  /** Sources past their review date on that day. */
  past: number;
  /** Sources that cross over after the step before and by this one, soonest first. Empty for today. */
  crossing: AuditedSource[];
}

export interface Forecast {
  steps: ForecastStep[];
  /** Sources with a usable retrieved date: the only ones a date can be worked out for. */
  dated: number;
  undated: number;
  /** Sources still within their review period at the last step. */
  stillWithin: number;
}

/** Days from today until a source is past its review date: 0 or less when it already is. Null with no usable date. */
export function daysUntilPast(s: AuditedSource): number | null {
  if (s.ageDays === null || s.state === 'unknown') return null;
  // Past review means older than the period, so the first day past is the day after the period ends.
  return s.limitDays - s.ageDays + 1;
}

export function buildForecast(audit: AuditResult, now: Date, horizons: readonly number[] = FORECAST_HORIZONS): Forecast {
  const today = now.toISOString().slice(0, 10);
  const dated = audit.sources.map((s) => ({ s, at: daysUntilPast(s) })).filter((x): x is { s: AuditedSource; at: number } => x.at !== null);
  const ordered = [...new Set(horizons.filter((h) => Number.isInteger(h) && h >= 0))].sort((a, b) => a - b);
  const steps: ForecastStep[] = [];
  let before = -1;
  for (const days of ordered) {
    const past = dated.filter((x) => x.at <= days).length;
    const crossing = steps.length === 0 ? [] : dated.filter((x) => x.at > before && x.at <= days).sort((a, b) => a.at - b.at || a.s.datasetName.localeCompare(b.s.datasetName) || a.s.sourceId.localeCompare(b.s.sourceId)).map((x) => x.s);
    steps.push({ days, iso: days === 0 ? today : addDaysIso(today, days), past, crossing });
    before = days;
  }
  const last = steps.at(-1);
  return { steps, dated: dated.length, undated: audit.sources.length - dated.length, stillWithin: dated.length - (last?.past ?? 0) };
}

type Key =
  | 'fc2.title'
  | 'fc2.intro'
  | 'fc2.none'
  | 'fc2.noDates'
  | 'fc2.caption'
  | 'fc2.colWhen'
  | 'fc2.colPast'
  | 'fc2.colNew'
  | 'fc2.colWhich'
  | 'fc2.today'
  | 'fc2.inDays'
  | 'fc2.join'
  | 'fc2.more.one'
  | 'fc2.more.other'
  | 'fc2.nobody'
  | 'fc2.notApplicable'
  | 'fc2.undated.one'
  | 'fc2.undated.other'
  | 'fc2.within.one'
  | 'fc2.within.other'
  | 'fc2.allPast';

const MESSAGES: Messages<Key> = {
  en: {
    'fc2.title': 'If no source is retrieved again',
    'fc2.intro': 'How many sources would be past their review date on later days, with the records as they are now. This applies the rule of this panel to the calendar. It does not say what any publisher will do.',
    'fc2.none': 'There are no sources, so there is no later day to work out.',
    'fc2.noDates': 'No source has a usable retrieved date, so no later day can be worked out.',
    'fc2.caption': 'Sources past their review date, today and on later days',
    'fc2.colWhen': 'Day',
    'fc2.colPast': 'Past review date',
    'fc2.colNew': 'More than the row above',
    'fc2.colWhich': 'Which ones',
    'fc2.today': 'Today ({date})',
    'fc2.inDays': 'In {count} days ({date})',
    'fc2.join': '; ',
    'fc2.more.one': '{list}, and {n} more',
    'fc2.more.other': '{list}, and {n} more',
    'fc2.nobody': 'None',
    'fc2.notApplicable': 'Does not apply',
    'fc2.undated.one': '{n} source has no usable retrieved date and is in no row.',
    'fc2.undated.other': '{n} sources have no usable retrieved date and are in no row.',
    'fc2.within.one': '{n} source would still be within its review period on the last day shown.',
    'fc2.within.other': '{n} sources would still be within their review period on the last day shown.',
    'fc2.allPast': 'Every source with a usable date would be past its review date by the last day shown.',
  },
  fr: {
    'fc2.title': 'Si aucune source n’est récupérée de nouveau',
    'fc2.intro': 'Nombre de sources qui auraient dépassé leur date de révision à des dates ultérieures, avec les enregistrements tels qu’ils sont aujourd’hui. La règle de ce panneau est simplement appliquée au calendrier. Cela ne dit rien de ce que fera un diffuseur.',
    'fc2.none': 'Il n’y a aucune source, il n’y a donc aucune date ultérieure à calculer.',
    'fc2.noDates': 'Aucune source n’a de date de récupération utilisable, aucune date ultérieure ne peut donc être calculée.',
    'fc2.caption': 'Sources ayant dépassé leur date de révision, aujourd’hui et à des dates ultérieures',
    'fc2.colWhen': 'Jour',
    'fc2.colPast': 'Date de révision dépassée',
    'fc2.colNew': 'De plus que la ligne précédente',
    'fc2.colWhich': 'Lesquelles',
    'fc2.today': 'Aujourd’hui ({date})',
    'fc2.inDays': 'Dans {count} jours ({date})',
    'fc2.join': '\u202F; ',
    'fc2.more.one': '{list}, et {n} de plus',
    'fc2.more.other': '{list}, et {n} de plus',
    'fc2.nobody': 'Aucune',
    'fc2.notApplicable': 'Sans objet',
    'fc2.undated.one': '{n} source n’a pas de date de récupération utilisable et ne figure dans aucune ligne.',
    'fc2.undated.other': '{n} sources n’ont pas de date de récupération utilisable et ne figurent dans aucune ligne.',
    'fc2.within.one': '{n} source serait encore dans sa période de révision au dernier jour présenté.',
    'fc2.within.other': '{n} sources seraient encore dans leur période de révision au dernier jour présenté.',
    'fc2.allPast': 'Toutes les sources dont la date est utilisable auraient dépassé leur date de révision au dernier jour présenté.',
  },
};

export const FORECAST_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function forecastWhen(step: ForecastStep, locale: Locale): string {
  const date = step.iso === null ? '' : formatDisplayDate(step.iso, locale);
  return step.days === 0 ? tx(locale, 'fc2.today', { date }) : tx(locale, 'fc2.inDays', { count: step.days, date });
}

/** A few of the sources that cross over at this step, then how many more. */
export function forecastWhich(step: ForecastStep, locale: Locale): string {
  if (step.days === 0) return tx(locale, 'fc2.notApplicable');
  if (step.crossing.length === 0) return tx(locale, 'fc2.nobody');
  const names = step.crossing.slice(0, MAX_FORECAST_EXAMPLES).map((s) => `${s.datasetName.trim() === '' ? s.datasetId : s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`);
  const list = names.join(tx(locale, 'fc2.join'));
  const more = step.crossing.length - names.length;
  return more > 0 ? tx.count(locale, 'fc2.more', more, { list }) : list;
}

export function forecastNotes(d: Forecast, locale: Locale): string[] {
  const notes: string[] = [];
  if (d.dated > 0) notes.push(d.stillWithin === 0 ? tx(locale, 'fc2.allPast') : tx.count(locale, 'fc2.within', d.stillWithin));
  if (d.undated > 0) notes.push(tx.count(locale, 'fc2.undated', d.undated));
  return notes;
}

/** The table as rows of text: a heading row, then one row per day. */
export function forecastRows(d: Forecast, locale: Locale): string[][] {
  return [
    [tx(locale, 'fc2.colWhen'), tx(locale, 'fc2.colPast'), tx(locale, 'fc2.colNew'), tx(locale, 'fc2.colWhich')],
    ...d.steps.map((s) => [forecastWhen(s, locale), String(s.past), s.days === 0 ? tx(locale, 'fc2.notApplicable') : String(s.crossing.length), forecastWhich(s, locale)]),
  ];
}

export function renderForecastHtml(d: Forecast, locale: Locale): string {
  const open = `<section aria-labelledby="ds-forecast-title" data-forecast="${d.dated}"><h2 id="ds-forecast-title">${escapeHtml(tx(locale, 'fc2.title'))}</h2>`;
  if (d.dated + d.undated === 0) return `${open}<p>${escapeHtml(tx(locale, 'fc2.none'))}</p></section>`;
  const notes = forecastNotes(d, locale)
    .map((n) => `<p>${escapeHtml(n)}</p>`)
    .join('');
  if (d.dated === 0) return `${open}<p>${escapeHtml(tx(locale, 'fc2.noDates'))}</p>${notes}</section>`;
  const [head, ...rows] = forecastRows(d, locale);
  const heads = (head ?? []).map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows.map((r) => `<tr><th scope="row">${escapeHtml(r[0] ?? '')}</th>${r.slice(1).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  const caption = escapeHtml(tx(locale, 'fc2.caption'));
  return (
    `${open}<p>${escapeHtml(tx(locale, 'fc2.intro'))}</p>` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${caption}"><table><caption>${caption}</caption><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div>${notes}</section>`
  );
}
