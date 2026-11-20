/**
 * The two ends of the retrieved dates: the sources retrieved most recently and the ones
 * retrieved longest ago, a few of each. It answers "what was looked at last?" and "what has
 * waited longest?" at a glance. Sources with no usable retrieved date are counted, not ranked.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { t } from './i18n';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export const RECENCY_COUNT = 5;

export interface Recency {
  /** Most recently retrieved first. */
  newest: AuditedSource[];
  /** Longest ago first. No source appears in both lists. */
  oldest: AuditedSource[];
  dated: number;
  undated: number;
}

function usable(s: AuditedSource): boolean {
  return s.ageDays !== null && s.state !== 'unknown' && s.retrievedIso !== null;
}

function tieBreak(a: AuditedSource, b: AuditedSource): number {
  return a.datasetName.localeCompare(b.datasetName) || (a.name ?? '').localeCompare(b.name ?? '') || a.sourceId.localeCompare(b.sourceId);
}

/**
 * The newest `count` and the oldest `count`. With fewer than twice `count` dated sources the
 * lists share them out without repeating one: the newest list is filled first.
 */
export function buildRecency(audit: AuditResult, count: number = RECENCY_COUNT): Recency {
  const n = Math.max(0, Math.trunc(count));
  const dated = audit.sources.filter(usable);
  const byNewest = [...dated].sort((a, b) => (a.ageDays ?? 0) - (b.ageDays ?? 0) || tieBreak(a, b));
  const newest = byNewest.slice(0, n);
  const taken = new Set(newest);
  const oldest = [...dated]
    .filter((s) => !taken.has(s))
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0) || tieBreak(a, b))
    .slice(0, n);
  return { newest, oldest, dated: dated.length, undated: audit.sources.length - dated.length };
}

type Key =
  | 'rc2.title'
  | 'rc2.none'
  | 'rc2.noDates'
  | 'rc2.newest'
  | 'rc2.oldest'
  | 'rc2.colSource'
  | 'rc2.colRetrieved'
  | 'rc2.colAge'
  | 'rc2.colStatus'
  | 'rc2.today'
  | 'rc2.days.one'
  | 'rc2.days.other'
  | 'rc2.undated.one'
  | 'rc2.undated.other'
  | 'rc2.allShown';

const MESSAGES: Messages<Key> = {
  en: {
    'rc2.title': 'Retrieved most recently and longest ago',
    'rc2.none': 'There are no sources to rank.',
    'rc2.noDates': 'No source has a usable retrieved date, so none can be ranked.',
    'rc2.newest': 'Retrieved most recently',
    'rc2.oldest': 'Retrieved longest ago',
    'rc2.colSource': 'Source',
    'rc2.colRetrieved': 'Retrieved',
    'rc2.colAge': 'Age',
    'rc2.colStatus': 'Status',
    'rc2.today': 'Today',
    'rc2.days.one': '{n} day',
    'rc2.days.other': '{n} days',
    'rc2.undated.one': '{n} source has no usable retrieved date and is in neither list.',
    'rc2.undated.other': '{n} sources have no usable retrieved date and are in neither list.',
    'rc2.allShown': 'Every source with a usable date is in the first list.',
  },
  fr: {
    'rc2.title': 'Récupérées le plus récemment et il y a le plus longtemps',
    'rc2.none': 'Il n’y a aucune source à classer.',
    'rc2.noDates': 'Aucune source n’a de date de récupération utilisable, aucune ne peut donc être classée.',
    'rc2.newest': 'Récupérées le plus récemment',
    'rc2.oldest': 'Récupérées il y a le plus longtemps',
    'rc2.colSource': 'Source',
    'rc2.colRetrieved': 'Récupération',
    'rc2.colAge': 'Âge',
    'rc2.colStatus': 'État',
    'rc2.today': 'Aujourd’hui',
    'rc2.days.one': '{n} jour',
    'rc2.days.other': '{n} jours',
    'rc2.undated.one': '{n} source n’a pas de date de récupération utilisable et ne figure dans aucune des deux listes.',
    'rc2.undated.other': '{n} sources n’ont pas de date de récupération utilisable et ne figurent dans aucune des deux listes.',
    'rc2.allShown': 'Toutes les sources dont la date est utilisable figurent dans la première liste.',
  },
};

export const RECENCY_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function recencyAgeText(s: AuditedSource, locale: Locale): string {
  return s.ageDays === 0 ? tx(locale, 'rc2.today') : tx.count(locale, 'rc2.days', s.ageDays ?? 0);
}

/** One list as rows of text: a heading row, then one row per source. */
export function recencyRows(sources: readonly AuditedSource[], locale: Locale): string[][] {
  return [
    [tx(locale, 'rc2.colSource'), tx(locale, 'rc2.colRetrieved'), tx(locale, 'rc2.colAge'), tx(locale, 'rc2.colStatus')],
    ...sources.map((s) => [
      `${s.datasetName.trim() === '' ? s.datasetId : s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`,
      formatDisplayDate(s.retrievedIso, locale),
      recencyAgeText(s, locale),
      t(locale, `state.${s.state}`),
    ]),
  ];
}

export function recencyNotes(d: Recency, locale: Locale): string[] {
  const notes: string[] = [];
  if (d.dated > 0 && d.oldest.length === 0) notes.push(tx(locale, 'rc2.allShown'));
  if (d.undated > 0) notes.push(tx.count(locale, 'rc2.undated', d.undated));
  return notes;
}

function table(caption: string, sources: readonly AuditedSource[], locale: Locale): string {
  const [head, ...rows] = recencyRows(sources, locale);
  const heads = (head ?? []).map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows.map((r) => `<tr><th scope="row">${escapeHtml(r[0] ?? '')}</th>${r.slice(1).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderRecencyHtml(d: Recency, locale: Locale): string {
  const open = `<section aria-labelledby="ds-recency-title" data-recency="${d.dated}"><h2 id="ds-recency-title">${escapeHtml(tx(locale, 'rc2.title'))}</h2>`;
  if (d.dated + d.undated === 0) return `${open}<p>${escapeHtml(tx(locale, 'rc2.none'))}</p></section>`;
  const notes = recencyNotes(d, locale)
    .map((n) => `<p>${escapeHtml(n)}</p>`)
    .join('');
  if (d.dated === 0) return `${open}<p>${escapeHtml(tx(locale, 'rc2.noDates'))}</p>${notes}</section>`;
  return (
    open +
    (d.newest.length > 0 ? table(tx(locale, 'rc2.newest'), d.newest, locale) : '') +
    (d.oldest.length > 0 ? table(tx(locale, 'rc2.oldest'), d.oldest, locale) : '') +
    `${notes}</section>`
  );
}
