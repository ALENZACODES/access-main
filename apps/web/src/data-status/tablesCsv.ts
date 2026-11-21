/**
 * One spreadsheet-friendly CSV of the planning tables (review workload, age bands, licences in
 * use). Long format: a section, an item, a count and a detail on every row, so the three tables
 * can be filtered together. Cells starting with a formula character are guarded by the shared
 * CSV writer.
 */
import { AGE_BAND_MESSAGES, bandLabel, buildAgeDistribution, shareText } from './ageBands';
import { toCsv } from './csv';
import type { AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { buildLicenceBreakdown, kindLabel, LICENCE_BREAKDOWN_MESSAGES, licenceDisplay } from './licenceBreakdown';
import { createTranslator, type Messages } from './localText';
import { buildWorkload, WORKLOAD_MESSAGES, weekRangeText, type WorkloadWeek } from './workload';
import type { DueItem } from './reviewDue';
import { tallyTiers, TIER_MESSAGES, tierLabel, tierMeaning, tiersInUse } from './tiers';

type Key = 'tb.section' | 'tb.item' | 'tb.count' | 'tb.detail' | 'tb.pastDue' | 'tb.beyond' | 'tb.unscheduled' | 'tb.sep';

const MESSAGES: Messages<Key> = {
  en: {
    'tb.section': 'Section',
    'tb.item': 'Item',
    'tb.count': 'Sources',
    'tb.detail': 'Detail',
    'tb.pastDue': 'Past review date',
    'tb.beyond': 'Later than the planning window',
    'tb.unscheduled': 'Not scheduled',
    'tb.sep': '; ',
  },
  fr: {
    'tb.section': 'Section',
    'tb.item': 'Élément',
    'tb.count': 'Sources',
    'tb.detail': 'Détail',
    'tb.pastDue': 'Date de révision dépassée',
    'tb.beyond': 'Au-delà de la période de planification',
    'tb.unscheduled': 'Non planifiées',
    'tb.sep': '\u202F; ',
  },
};

export const TABLES_CSV_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

function names(items: readonly DueItem[], sep: string): string {
  return items.map((i) => `${i.datasetName.trim() === '' ? i.datasetId : i.datasetName.trim()} / ${i.name?.trim() || i.sourceId}`).join(sep);
}

export function buildTablesRows(audit: AuditResult, now: Date, locale: Locale, weeks?: number): string[][] {
  const sep = tx(locale, 'tb.sep');
  const rows: string[][] = [[tx(locale, 'tb.section'), tx(locale, 'tb.item'), tx(locale, 'tb.count'), tx(locale, 'tb.detail')]];
  const wlTitle = WORKLOAD_MESSAGES[locale]['wl.title'];
  const w = buildWorkload(audit, now, weeks);
  if (w.pastDue.length > 0) rows.push([wlTitle, tx(locale, 'tb.pastDue'), String(w.pastDue.length), names(w.pastDue, sep)]);
  for (const wk of w.weeks as readonly WorkloadWeek[]) {
    if (wk.items.length > 0) rows.push([wlTitle, weekRangeText(wk, locale), String(wk.items.length), names(wk.items, sep)]);
  }
  if (w.beyond.length > 0) rows.push([wlTitle, tx(locale, 'tb.beyond'), String(w.beyond.length), names(w.beyond, sep)]);
  if (w.unscheduled.length > 0) rows.push([wlTitle, tx(locale, 'tb.unscheduled'), String(w.unscheduled.length), names(w.unscheduled, sep)]);

  const ageTitle = AGE_BAND_MESSAGES[locale]['age.title'];
  const d = buildAgeDistribution(audit, now);
  for (const b of d.bands) rows.push([ageTitle, bandLabel(b, locale), String(b.count), shareText(b.count, d.total, locale)]);
  rows.push([ageTitle, AGE_BAND_MESSAGES[locale]['age.unknownRow'], String(d.unknown), shareText(d.unknown, d.total, locale)]);

  const licTitle = LICENCE_BREAKDOWN_MESSAGES[locale]['lb.title'];
  for (const r of buildLicenceBreakdown(audit).rows) rows.push([licTitle, licenceDisplay(r.licence, locale), String(r.count), kindLabel(r.kind, locale)]);

  const tierTitle = TIER_MESSAGES[locale]['tr.caption'];
  const tally = tallyTiers(audit.sources);
  for (const id of tiersInUse(tally)) rows.push([tierTitle, tierLabel(id, locale), String(tally.counts[id]), tierMeaning(id, locale)]);
  if (tally.unknown > 0) rows.push([tierTitle, tierLabel(null, locale), String(tally.unknown), tierMeaning(null, locale)]);
  return rows;
}

export function buildTablesCsv(audit: AuditResult, now: Date, locale: Locale, weeks?: number, bom = true): string {
  return toCsv(buildTablesRows(audit, now, locale, weeks), bom);
}
