/**
 * The filters in force on the source list, each with a control that removes just that one.
 * It restates the filter model in words; removing one never touches the others.
 */
import type { Locale } from './dataStatus';
import { NO_FILTERS, normaliseQuery, withOptionalFilter, type Filters } from './filters';
import { t } from './i18n';
import { kindLabel } from './licenceBreakdown';
import { factLabel } from './recordFacts';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export const ACTIVE_FILTER_KEYS = ['state', 'kind', 'query', 'issues', 'tier', 'licence', 'dataset', 'gap'] as const;
export type ActiveFilterKey = (typeof ACTIVE_FILTER_KEYS)[number];

export interface ActiveFilter {
  key: ActiveFilterKey;
  /** What the filter keeps, in words. */
  label: string;
}

type Key =
  | 'af.title.one'
  | 'af.title.other'
  | 'af.state'
  | 'af.kind'
  | 'af.query'
  | 'af.issues'
  | 'af.tier'
  | 'af.licence'
  | 'af.dataset'
  | 'af.gap'
  | 'af.remove';

const MESSAGES: Messages<Key> = {
  en: {
    'af.title.one': '{n} filter in force',
    'af.title.other': '{n} filters in force',
    'af.state': 'Status: {value}',
    'af.kind': 'Dataset type: {value}',
    'af.query': 'Name contains “{value}”',
    'af.issues': 'Needs review only',
    'af.tier': 'Tier: {value}',
    'af.licence': 'Licence type: {value}',
    'af.dataset': 'Dataset: {value}',
    'af.gap': 'Unknown: {value}',
    'af.remove': 'Remove filter. {label}',
  },
  fr: {
    'af.title.one': '{n} filtre appliqué',
    'af.title.other': '{n} filtres appliqués',
    'af.state': 'État\u00A0: {value}',
    'af.kind': 'Type de jeu de données\u00A0: {value}',
    'af.query': 'Le nom contient «\u00A0{value}\u00A0»',
    'af.issues': 'À examiner seulement',
    'af.tier': 'Niveau\u00A0: {value}',
    'af.licence': 'Type de licence\u00A0: {value}',
    'af.dataset': 'Jeu de données\u00A0: {value}',
    'af.gap': 'Inconnu\u00A0: {value}',
    'af.remove': 'Retirer le filtre. {label}',
  },
};

export const ACTIVE_FILTER_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** The active filters in a fixed order. `datasetNames` maps a dataset id to its display name. */
export function listActiveFilters(f: Filters, locale: Locale, datasetNames?: ReadonlyMap<string, string>): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (f.state !== 'any') out.push({ key: 'state', label: tx(locale, 'af.state', { value: t(locale, `state.${f.state}`) }) });
  if (f.kind !== 'any') out.push({ key: 'kind', label: tx(locale, 'af.kind', { value: t(locale, `kind.${f.kind}`) }) });
  const q = normaliseQuery(f.query);
  if (q !== '') out.push({ key: 'query', label: tx(locale, 'af.query', { value: q }) });
  if (f.onlyIssues) out.push({ key: 'issues', label: tx(locale, 'af.issues') });
  if (f.tier !== undefined) out.push({ key: 'tier', label: tx(locale, 'af.tier', { value: f.tier === 'unknown' ? t(locale, 'unknown') : f.tier }) });
  if (f.licence !== undefined) out.push({ key: 'licence', label: tx(locale, 'af.licence', { value: kindLabel(f.licence, locale) }) });
  if (f.dataset !== undefined) out.push({ key: 'dataset', label: tx(locale, 'af.dataset', { value: datasetNames?.get(f.dataset) ?? f.dataset }) });
  if (f.gap !== undefined) out.push({ key: 'gap', label: tx(locale, 'af.gap', { value: factLabel(f.gap, locale) }) });
  return out;
}

/** A copy of the filters with one of them back at its default. The input is not changed. */
export function withoutFilter(f: Filters, key: ActiveFilterKey): Filters {
  switch (key) {
    case 'state':
      return { ...f, state: NO_FILTERS.state };
    case 'kind':
      return { ...f, kind: NO_FILTERS.kind };
    case 'query':
      return { ...f, query: '' };
    case 'issues':
      return { ...f, onlyIssues: false };
    case 'tier':
    case 'licence':
    case 'dataset':
    case 'gap':
      return withOptionalFilter(f, key, undefined);
  }
}

export const CLEAR_ACTION_PREFIX = 'clear:';

export function clearAction(key: ActiveFilterKey): string {
  return `${CLEAR_ACTION_PREFIX}${key}`;
}

/** The filter named by a `data-action` value, or null when it is not a remove action. */
export function clearKeyFromAction(action: string | null | undefined): ActiveFilterKey | null {
  if (typeof action !== 'string' || !action.startsWith(CLEAR_ACTION_PREFIX)) return null;
  const key = action.slice(CLEAR_ACTION_PREFIX.length);
  return (ACTIVE_FILTER_KEYS as readonly string[]).includes(key) ? (key as ActiveFilterKey) : null;
}

export function removeLabel(a: ActiveFilter, locale: Locale): string {
  return tx(locale, 'af.remove', { label: a.label });
}

export interface ActiveFilterRenderOptions {
  /** Static pages: the link that shows the list without the given filter. Without it, buttons are rendered. */
  hrefFor?: (key: ActiveFilterKey) => string;
  buttonStyle?: string;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';
const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';

/** Empty when no filter is in force. */
export function renderActiveFiltersHtml(items: readonly ActiveFilter[], locale: Locale, opts: ActiveFilterRenderOptions = {}): string {
  if (items.length === 0) return '';
  const style = opts.buttonStyle ?? DEFAULT_BUTTON_STYLE;
  const controls = items
    .map((a) => {
      const text = escapeHtml(removeLabel(a, locale));
      if (opts.hrefFor) return `<li><a href="${escapeHtml(opts.hrefFor(a.key))}" style="${LINK_STYLE}">${text}</a></li>`;
      return `<li><button type="button" data-action="${clearAction(a.key)}" style="${style}">${text}</button></li>`;
    })
    .join('');
  return (
    `<div data-active-filters="${items.length}"><p>${escapeHtml(tx.count(locale, 'af.title', items.length))}</p>` +
    `<ul style="list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px">${controls}</ul></div>`
  );
}
