/**
 * Screen-reader announcements for the source list: what the list now shows after a filter,
 * sort or page change, as one short sentence. A live region will not re-read text that did
 * not change, so the writer alternates a trailing no-break space when the same sentence
 * must be heard again (for example after pressing Apply with no change in results).
 */
import type { Filters } from './filters';
import { DUE_WINDOW_DAYS, hasActiveFilters } from './filters';
import { ageValueLabel } from './ageBands';
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { t } from './i18n';
import type { SortSpec } from './sorting';
import { kindLabel } from './licenceBreakdown';
import { factLabel } from './recordFacts';

export interface ListState {
  shown: number;
  total: number;
  filters: Filters;
  sort: SortSpec | null;
  page: number;
  pages: number;
}

type Key =
  | 'an.result.none'
  | 'an.result.one'
  | 'an.result.other'
  | 'an.filters'
  | 'an.filterState'
  | 'an.filterKind'
  | 'an.filterTier'
  | 'an.filterTierUnknown'
  | 'an.filterLicence'
  | 'an.filterDataset'
  | 'an.filterGap'
  | 'an.filterAge'
  | 'an.filterDue'
  | 'an.col.tier'
  | 'an.filterQuery'
  | 'an.filterIssues'
  | 'an.filtersCleared'
  | 'an.sorted'
  | 'an.sortedOff'
  | 'an.col.source'
  | 'an.col.licence'
  | 'an.col.retrieved'
  | 'an.col.status'
  | 'an.dir.asc'
  | 'an.dir.desc'
  | 'an.page'
  | 'an.join'
  | 'an.sentence';

const MESSAGES: Messages<Key> = {
  en: {
    'an.result.none': 'No sources match.',
    'an.result.one': '{n} source shown.',
    'an.result.other': '{n} sources shown.',
    'an.filters': 'Filters: {list}.',
    'an.filterState': 'status {value}',
    'an.filterKind': 'dataset type {value}',
    'an.filterTier': 'tier {value}',
    'an.filterTierUnknown': 'tier unknown',
    'an.filterLicence': 'licence type {value}',
    'an.filterDataset': 'dataset {value}',
    'an.filterGap': 'no {value}',
    'an.filterAge': 'age of retrieved date {value}',
    'an.filterDue': 'review due within {days} days',
    'an.col.tier': 'tier',
    'an.filterQuery': 'name contains “{value}”',
    'an.filterIssues': 'only items to review',
    'an.filtersCleared': 'Filters cleared.',
    'an.sorted': 'Sorted by {column}, {direction}.',
    'an.sortedOff': 'Sorting removed.',
    'an.col.source': 'source',
    'an.col.licence': 'licence',
    'an.col.retrieved': 'retrieved date',
    'an.col.status': 'status',
    'an.dir.asc': 'ascending',
    'an.dir.desc': 'descending',
    'an.page': 'Page {page} of {pages}.',
    'an.join': ', ',
    'an.sentence': ' ',
  },
  fr: {
    'an.result.none': 'Aucune source ne correspond.',
    'an.result.one': '{n} source affichée.',
    'an.result.other': '{n} sources affichées.',
    'an.filters': 'Filtres : {list}.',
    'an.filterState': 'état {value}',
    'an.filterKind': 'type de jeu de données {value}',
    'an.filterTier': 'niveau {value}',
    'an.filterTierUnknown': 'niveau inconnu',
    'an.filterLicence': 'type de licence {value}',
    'an.filterDataset': 'jeu de données {value}',
    'an.filterGap': 'sans {value}',
    'an.filterAge': 'âge de la date de récupération {value}',
    'an.filterDue': 'révision prévue d’ici {days} jours',
    'an.col.tier': 'niveau',
    'an.filterQuery': 'le nom contient « {value} »',
    'an.filterIssues': 'seulement les éléments à examiner',
    'an.filtersCleared': 'Filtres effacés.',
    'an.sorted': 'Tri par {column}, {direction}.',
    'an.sortedOff': 'Tri retiré.',
    'an.col.source': 'source',
    'an.col.licence': 'licence',
    'an.col.retrieved': 'date de récupération',
    'an.col.status': 'état',
    'an.dir.asc': 'croissant',
    'an.dir.desc': 'décroissant',
    'an.page': 'Page {page} sur {pages}.',
    'an.join': ', ',
    'an.sentence': ' ',
  },
};

export const ANNOUNCE_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function filterParts(f: Filters, locale: Locale): string[] {
  const parts: string[] = [];
  if (f.state !== 'any') parts.push(tx(locale, 'an.filterState', { value: t(locale, `state.${f.state}`).toLowerCase() }));
  if (f.kind !== 'any') parts.push(tx(locale, 'an.filterKind', { value: t(locale, `kind.${f.kind}`).toLowerCase() }));
  const q = f.query.trim();
  if (q !== '') parts.push(tx(locale, 'an.filterQuery', { value: q }));
  if (f.onlyIssues) parts.push(tx(locale, 'an.filterIssues'));
  if (f.tier !== undefined) parts.push(f.tier === 'unknown' ? tx(locale, 'an.filterTierUnknown') : tx(locale, 'an.filterTier', { value: f.tier }));
  if (f.licence !== undefined) parts.push(tx(locale, 'an.filterLicence', { value: kindLabel(f.licence, locale).toLowerCase() }));
  if (f.dataset !== undefined) parts.push(tx(locale, 'an.filterDataset', { value: f.dataset }));
  if (f.age !== undefined) parts.push(tx(locale, 'an.filterAge', { value: (ageValueLabel(f.age, locale) ?? f.age).toLowerCase() }));
  if (f.due !== undefined) parts.push(tx(locale, 'an.filterDue', { days: DUE_WINDOW_DAYS[f.due] }));
  if (f.gap !== undefined) parts.push(tx(locale, 'an.filterGap', { value: factLabel(f.gap, locale).toLowerCase() }));
  return parts;
}

export function sortPart(s: SortSpec | null, locale: Locale): string | null {
  if (s === null) return null;
  return tx(locale, 'an.sorted', { column: tx(locale, `an.col.${s.key}`), direction: tx(locale, `an.dir.${s.dir}`) });
}

/** One full description of the list as it is now. */
export function describeList(state: ListState, locale: Locale): string {
  const out: string[] = [state.shown === 0 ? tx(locale, 'an.result.none') : tx.count(locale, 'an.result', state.shown)];
  const parts = filterParts(state.filters, locale);
  if (parts.length > 0) out.push(tx(locale, 'an.filters', { list: parts.join(tx(locale, 'an.join')) }));
  const sort = sortPart(state.sort, locale);
  if (sort !== null) out.push(sort);
  if (state.pages > 1) out.push(tx(locale, 'an.page', { page: state.page, pages: state.pages }));
  return out.join(tx(locale, 'an.sentence'));
}

/**
 * Say only what changed. A page change alone says the page and the row count; a filter or sort
 * change says the new result, then the changed setting. No change at all repeats the full text.
 */
export function describeListChange(prev: ListState | null, next: ListState, locale: Locale): string {
  if (prev === null) return describeList(next, locale);
  const sentence = tx(locale, 'an.sentence');
  const filterChanged = JSON.stringify(prev.filters) !== JSON.stringify(next.filters);
  const sortChanged = JSON.stringify(prev.sort) !== JSON.stringify(next.sort);
  const pageChanged = prev.page !== next.page || prev.pages !== next.pages;
  if (!filterChanged && !sortChanged && !pageChanged) return describeList(next, locale);
  const out: string[] = [];
  if (filterChanged) {
    out.push(next.shown === 0 ? tx(locale, 'an.result.none') : tx.count(locale, 'an.result', next.shown));
    out.push(hasActiveFilters(next.filters) ? tx(locale, 'an.filters', { list: filterParts(next.filters, locale).join(tx(locale, 'an.join')) }) : tx(locale, 'an.filtersCleared'));
  }
  if (sortChanged) out.push(sortPart(next.sort, locale) ?? tx(locale, 'an.sortedOff'));
  if (pageChanged && next.pages > 1) out.push(tx(locale, 'an.page', { page: next.page, pages: next.pages }));
  if (!filterChanged && pageChanged) out.push(next.shown === 0 ? tx(locale, 'an.result.none') : tx.count(locale, 'an.result', next.shown));
  return out.join(sentence);
}

export interface LiveRegionLike {
  textContent: string | null;
}

export const REPEAT_MARK = ' ';

/** Writes announcements into a live region; identical consecutive text gets a trailing no-break space. */
export function createAnnouncer(region: LiveRegionLike): { say(text: string): string; clear(): void } {
  let lastText: string | null = null;
  let marked = false;
  return {
    say(text: string): string {
      marked = text === lastText ? !marked : false;
      lastText = text;
      const value = marked ? `${text}${REPEAT_MARK}` : text;
      region.textContent = value;
      return value;
    },
    clear(): void {
      lastText = null;
      marked = false;
      region.textContent = '';
    },
  };
}
