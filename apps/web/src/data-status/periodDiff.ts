/**
 * What the review periods chosen on the panel change, source by source. With the default
 * periods some sources are marked possibly out of date; with the periods chosen here the marks
 * can differ. This lists the sources marked only because of the chosen periods, and the ones no
 * longer marked because of them, so a person can see exactly what trying another period did.
 * With the defaults in use there is nothing to list.
 */
import { auditRegistry, type AuditedSource, type DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { DATASET_KINDS, DEFAULT_STALE_DAYS, staleAfterFor, type DatasetKind } from './freshnessPolicy';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import type { Thresholds } from './thresholds';

export const MAX_PERIOD_DIFF_NAMES = 8;

export interface PeriodDiff {
  /** The kinds whose period differs from the default, with both values, in the fixed order of the kinds. */
  changed: { kind: DatasetKind; days: number; defaultDays: number }[];
  /** Marked with the chosen periods and not with the defaults. */
  nowMarked: AuditedSource[];
  /** Marked with the defaults and not with the chosen periods. */
  noLongerMarked: AuditedSource[];
}

const SEP = '\u0000';

/**
 * Compares the audit under the chosen periods with the audit under the defaults. Sources are
 * matched by dataset and record id, in order, so two records that share both ids are compared
 * first with first and second with second.
 */
export function buildPeriodDiff(records: readonly DatasetRecord[], now: Date, thresholds: Thresholds): PeriodDiff {
  const changed = DATASET_KINDS.filter((kind) => staleAfterFor(kind, thresholds) !== DEFAULT_STALE_DAYS[kind]).map((kind) => ({ kind, days: staleAfterFor(kind, thresholds), defaultDays: DEFAULT_STALE_DAYS[kind] }));
  if (changed.length === 0) return { changed, nowMarked: [], noLongerMarked: [] };
  const chosen = auditRegistry(records, now, thresholds);
  const byDefault = auditRegistry(records, now, {});
  const defaults = new Map<string, AuditedSource[]>();
  for (const s of byDefault.sources) {
    const k = `${s.datasetId}${SEP}${s.sourceId}`;
    const list = defaults.get(k);
    if (list) list.push(s);
    else defaults.set(k, [s]);
  }
  const nowMarked: AuditedSource[] = [];
  const noLongerMarked: AuditedSource[] = [];
  for (const s of chosen.sources) {
    const before = defaults.get(`${s.datasetId}${SEP}${s.sourceId}`)?.shift();
    if (before === undefined || before.state === s.state) continue;
    if (s.state === 'stale') nowMarked.push(s);
    else if (before.state === 'stale') noLongerMarked.push(s);
  }
  return { changed, nowMarked, noLongerMarked };
}

type Key =
  | 'pd.title'
  | 'pd.defaults'
  | 'pd.changed'
  | 'pd.changedItem'
  | 'pd.join'
  | 'pd.same'
  | 'pd.now.one'
  | 'pd.now.other'
  | 'pd.gone.one'
  | 'pd.gone.other'
  | 'pd.more.one'
  | 'pd.more.other';

const MESSAGES: Messages<Key> = {
  en: {
    'pd.title': 'Compared with the default periods',
    'pd.defaults': 'The default review periods are in use, so no mark comes from a period chosen here.',
    'pd.changed': 'Periods chosen here: {list}.',
    'pd.changedItem': '{kind}, {days} days in place of {defaultDays}',
    'pd.join': '; ',
    'pd.same': 'With these periods, the same sources are marked possibly out of date as with the defaults.',
    'pd.now.one': '{n} source is marked possibly out of date only because of a period chosen here:',
    'pd.now.other': '{n} sources are marked possibly out of date only because of a period chosen here:',
    'pd.gone.one': '{n} source would be marked with the default period and is not marked now:',
    'pd.gone.other': '{n} sources would be marked with the default periods and are not marked now:',
    'pd.more.one': 'And {n} more.',
    'pd.more.other': 'And {n} more.',
  },
  fr: {
    'pd.title': 'Par rapport aux périodes par défaut',
    'pd.defaults': 'Les périodes de révision par défaut sont utilisées, aucune marque ne vient donc d’une période choisie ici.',
    'pd.changed': 'Périodes choisies ici\u00A0: {list}.',
    'pd.changedItem': '{kind}, {days} jours au lieu de {defaultDays}',
    'pd.join': '\u202F; ',
    'pd.same': 'Avec ces périodes, les mêmes sources sont marquées comme possiblement périmées qu’avec les valeurs par défaut.',
    'pd.now.one': '{n} source est marquée comme possiblement périmée uniquement en raison d’une période choisie ici\u00A0:',
    'pd.now.other': '{n} sources sont marquées comme possiblement périmées uniquement en raison d’une période choisie ici\u00A0:',
    'pd.gone.one': '{n} source serait marquée avec la période par défaut et ne l’est pas maintenant\u00A0:',
    'pd.gone.other': '{n} sources seraient marquées avec les périodes par défaut et ne le sont pas maintenant\u00A0:',
    'pd.more.one': 'Et {n} de plus.',
    'pd.more.other': 'Et {n} de plus.',
  },
};

export const PERIOD_DIFF_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** "Places, 90 days in place of 180; Routes, 365 days in place of 120". */
export function periodDiffChangedText(d: PeriodDiff, locale: Locale): string {
  return d.changed.map((c) => tx(locale, 'pd.changedItem', { kind: t(locale, `kind.${c.kind}`), days: c.days, defaultDays: c.defaultDays })).join(tx(locale, 'pd.join'));
}

function names(sources: readonly AuditedSource[], locale: Locale, max: number): { items: string; more: string } {
  const shown = sources.slice(0, Math.max(0, max));
  const items = shown.map((s) => `<li>${escapeHtml(`${s.datasetName.trim() === '' ? s.datasetId : s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`)}</li>`).join('');
  const rest = sources.length - shown.length;
  return { items, more: rest > 0 ? `<p>${escapeHtml(tx.count(locale, 'pd.more', rest))}</p>` : '' };
}

/** A block to put inside the review-periods section: a heading one level below it, then the two lists. */
export function renderPeriodDiffHtml(d: PeriodDiff, locale: Locale, max: number = MAX_PERIOD_DIFF_NAMES): string {
  const open = `<section aria-labelledby="ds-perioddiff-title" data-period-diff="${d.nowMarked.length + d.noLongerMarked.length}"><h3 id="ds-perioddiff-title">${escapeHtml(tx(locale, 'pd.title'))}</h3>`;
  if (d.changed.length === 0) return `${open}<p>${escapeHtml(tx(locale, 'pd.defaults'))}</p></section>`;
  let html = `${open}<p>${escapeHtml(tx(locale, 'pd.changed', { list: periodDiffChangedText(d, locale) }))}</p>`;
  if (d.nowMarked.length === 0 && d.noLongerMarked.length === 0) return `${html}<p>${escapeHtml(tx(locale, 'pd.same'))}</p></section>`;
  if (d.nowMarked.length > 0) {
    const n = names(d.nowMarked, locale, max);
    html += `<p>${escapeHtml(tx.count(locale, 'pd.now', d.nowMarked.length))}</p><ul data-list="now">${n.items}</ul>${n.more}`;
  }
  if (d.noLongerMarked.length > 0) {
    const n = names(d.noLongerMarked, locale, max);
    html += `<p>${escapeHtml(tx.count(locale, 'pd.gone', d.noLongerMarked.length))}</p><ul data-list="gone">${n.items}</ul>${n.more}`;
  }
  return `${html}</section>`;
}
