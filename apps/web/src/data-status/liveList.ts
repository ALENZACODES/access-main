/**
 * Ordering and length of the source list on the live panel. The static page sorts with links
 * and pages with a pager; the live panel uses one "Sort by" control and a "Show more" control,
 * so a long list is not drawn all at once and nothing reloads.
 */
import type { Locale } from './dataStatus';
import { t, type MessageKey } from './i18n';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { isSortKey, SORT_KEYS, type SortKey, type SortSpec } from './sorting';

/** Rows drawn at first, and added by each "Show more". */
export const LIVE_STEP = 50;
export const SORT_NONE = 'none';

/** The value a sort choice has in the control: `none`, or `key:asc` / `key:desc`. */
export function sortValue(spec: SortSpec | null): string {
  return spec === null ? SORT_NONE : `${spec.key}:${spec.dir}`;
}

/** Reads a control value. Anything that is not a known column and direction means no sorting. */
export function parseSortValue(value: string | null | undefined): SortSpec | null {
  if (typeof value !== 'string') return null;
  const [key, dir, extra] = value.split(':');
  if (extra !== undefined || !isSortKey(key) || (dir !== 'asc' && dir !== 'desc')) return null;
  return { key, dir };
}

export const SORT_CHOICES: readonly SortSpec[] = SORT_KEYS.flatMap((key) => [
  { key, dir: 'asc' as const },
  { key, dir: 'desc' as const },
]);

/** How many rows to draw: at least one step, never more than there are. */
export function clampLimit(limit: number, available: number): number {
  const wanted = Number.isFinite(limit) ? Math.max(LIVE_STEP, Math.trunc(limit)) : LIVE_STEP;
  return Math.min(wanted, Math.max(0, available));
}

/** How many rows the next "Show more" adds; 0 when everything is already drawn. */
export function nextStep(shown: number, available: number): number {
  return Math.max(0, Math.min(LIVE_STEP, available - shown));
}

type Key = 'll.sort' | 'll.default' | 'll.asc' | 'll.desc' | 'll.unknownLast' | 'll.showing' | 'll.more.one' | 'll.more.other' | 'll.all';

const MESSAGES: Messages<Key> = {
  en: {
    'll.sort': 'Sort by',
    'll.default': 'Order of the list',
    'll.asc': '{column}, ascending',
    'll.desc': '{column}, descending',
    'll.unknownLast': 'Rows with an UNKNOWN value always come last.',
    'll.showing': 'Showing {shown} of {total} listed sources.',
    'll.more.one': 'Show {n} more source',
    'll.more.other': 'Show {n} more sources',
    'll.all': 'All {total} listed sources are shown.',
  },
  fr: {
    'll.sort': 'Trier par',
    'll.default': 'Ordre de la liste',
    'll.asc': '{column}, ordre croissant',
    'll.desc': '{column}, ordre décroissant',
    'll.unknownLast': 'Les lignes dont la valeur est UNKNOWN viennent toujours en dernier.',
    'll.showing': 'Affichage de {shown} des {total} sources de la liste.',
    'll.more.one': 'Afficher {n} source de plus',
    'll.more.other': 'Afficher {n} sources de plus',
    'll.all': 'Les {total} sources de la liste sont affichées.',
  },
};

export const LIVE_LIST_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const COLUMN_LABEL: Readonly<Record<SortKey, MessageKey>> = {
  source: 'tbl.source',
  licence: 'tbl.licence',
  retrieved: 'tbl.retrieved',
  status: 'tbl.status',
  tier: 'tbl.tier',
};

export function sortChoiceLabel(spec: SortSpec | null, locale: Locale): string {
  if (spec === null) return tx(locale, 'll.default');
  return tx(locale, spec.dir === 'asc' ? 'll.asc' : 'll.desc', { column: t(locale, COLUMN_LABEL[spec.key]) });
}

const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';

/** The "Sort by" field. It carries `data-filter="sort"` so it travels with the other list controls. */
export function renderSortControl(current: SortSpec | null, locale: Locale): string {
  const selected = sortValue(current);
  const option = (spec: SortSpec | null) => {
    const value = sortValue(spec);
    return `<option value="${value}"${value === selected ? ' selected' : ''}>${escapeHtml(sortChoiceLabel(spec, locale))}</option>`;
  };
  return (
    `<div><label for="ds-f-sort">${escapeHtml(tx(locale, 'll.sort'))}</label> ` +
    `<select id="ds-f-sort" data-filter="sort" aria-describedby="ds-f-sort-help" style="${FIELD_STYLE}">${option(null)}${SORT_CHOICES.map(option).join('')}</select> ` +
    `<span id="ds-f-sort-help">${escapeHtml(tx(locale, 'll.unknownLast'))}</span></div>`
  );
}

export const SHOW_MORE_ACTION = 'show-more';

export function showingText(shown: number, total: number, locale: Locale): string {
  return shown >= total ? tx(locale, 'll.all', { total }) : tx(locale, 'll.showing', { shown, total });
}

/** Empty when every listed source is already drawn. */
export function renderShowMoreHtml(shown: number, total: number, locale: Locale, buttonStyle: string = FIELD_STYLE): string {
  const step = nextStep(shown, total);
  if (step === 0) return '';
  return (
    `<p data-showing="${shown}">${escapeHtml(showingText(shown, total, locale))}</p>` +
    `<p><button type="button" data-action="${SHOW_MORE_ACTION}" style="${buttonStyle}">${escapeHtml(tx.count(locale, 'll.more', step))}</button></p>`
  );
}
