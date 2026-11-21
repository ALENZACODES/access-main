/**
 * The planning outlook as one CSV sheet: the later-days table, the review-period table and the
 * web-site table, one under the other in long form (a section, an item and its values on every
 * row) so the three can be filtered together in a spreadsheet. It covers every saved record and
 * follows the review periods in the address, as the page does.
 */
import { toCsv } from './csv';
import type { AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { buildForecast, forecastRows } from './forecast';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { buildPageHosts, pageHostRows } from './pageHosts';
import { buildPeriodWhatIf, PERIOD_PRESETS, periodNowText } from './reviewPeriods';
import type { Thresholds } from './thresholds';

export const OUTLOOK_ROUTE = '/outlook.csv';
export const OUTLOOK_FILENAME = 'outlook.csv';
const NO_LIMIT = 100_000;

type Key = 'ol.section' | 'ol.item' | 'ol.count' | 'ol.detail' | 'ol.later' | 'ol.periods' | 'ol.sites' | 'ol.periodItem' | 'ol.label';

const MESSAGES: Messages<Key> = {
  en: {
    'ol.section': 'Section',
    'ol.item': 'Item',
    'ol.count': 'Sources',
    'ol.detail': 'Detail',
    'ol.later': 'If no source is retrieved again',
    'ol.periods': 'Review periods',
    'ol.sites': 'Sources by web site',
    'ol.periodItem': '{kind}, with a period of {days} days',
    'ol.label': 'Download the planning outlook (CSV)',
  },
  fr: {
    'ol.section': 'Section',
    'ol.item': 'Élément',
    'ol.count': 'Sources',
    'ol.detail': 'Détail',
    'ol.later': 'Si aucune source n’est récupérée de nouveau',
    'ol.periods': 'Périodes de révision',
    'ol.sites': 'Sources par site Web',
    'ol.periodItem': '{kind}, avec une période de {days} jours',
    'ol.label': 'Télécharger les perspectives de planification (CSV)',
  },
};

export const OUTLOOK_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function outlookLabel(locale: Locale): string {
  return tx(locale, 'ol.label');
}

/**
 * A heading row, then: one row per later day (sources past review, and which ones cross over),
 * one row per kind of data and period (sources that period would mark, and the period in use),
 * and one row per web site (its sources, and whether its addresses start with https).
 */
export function outlookRows(audit: AuditResult, now: Date, thresholds: Thresholds, locale: Locale): string[][] {
  const rows: string[][] = [[tx(locale, 'ol.section'), tx(locale, 'ol.item'), tx(locale, 'ol.count'), tx(locale, 'ol.detail')]];
  const later = tx(locale, 'ol.later');
  for (const r of forecastRows(buildForecast(audit, now), locale).slice(1)) rows.push([later, r[0] ?? '', r[1] ?? '', r[3] ?? '']);
  const periods = tx(locale, 'ol.periods');
  for (const row of buildPeriodWhatIf(audit, thresholds).rows) {
    const kind = t(locale, `kind.${row.kind}`);
    PERIOD_PRESETS.forEach((days, i) => rows.push([periods, tx(locale, 'ol.periodItem', { kind, days }), String(row.counts[i] ?? 0), periodNowText(row, locale)]));
  }
  const sites = tx(locale, 'ol.sites');
  for (const r of pageHostRows(buildPageHosts(audit, NO_LIMIT), locale).slice(1)) rows.push([sites, r[0] ?? '', r[1] ?? '', r[4] ?? '']);
  return rows;
}

/** The sheet as CSV, starting with a byte order mark for spreadsheet programs. */
export function outlookToCsv(audit: AuditResult, now: Date, thresholds: Thresholds, locale: Locale): string {
  return toCsv(outlookRows(audit, now, thresholds, locale), true);
}
