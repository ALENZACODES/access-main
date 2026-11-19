/**
 * One-tap filters for the source list: the records that need review, the ones that may be out
 * of date, the ones with no usable date, and the ones with no tier. Each shows how many records
 * it would list, counted from the same audit as the table, so the number and the list agree.
 */
import type { AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { applyFilters, NO_FILTERS, serializeFilters, type Filters } from './filters';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export const QUICK_FILTER_IDS = ['review', 'stale', 'undated', 'noTier'] as const;
export type QuickFilterId = (typeof QUICK_FILTER_IDS)[number];

const PRESETS: Readonly<Record<QuickFilterId, Filters>> = {
  review: { ...NO_FILTERS, onlyIssues: true },
  stale: { ...NO_FILTERS, state: 'stale' },
  undated: { ...NO_FILTERS, state: 'unknown' },
  noTier: { ...NO_FILTERS, tier: 'unknown' },
};

/** A fresh copy of the filters a quick filter applies. Any other filter is cleared. */
export function quickFilterFor(id: QuickFilterId): Filters {
  return { ...PRESETS[id] };
}

export const QUICK_ACTION_PREFIX = 'quick:';

export function quickAction(id: QuickFilterId): string {
  return `${QUICK_ACTION_PREFIX}${id}`;
}

/** The quick filter named by a `data-action` value, or null when it is not one. */
export function quickFilterFromAction(action: string | null | undefined): QuickFilterId | null {
  if (typeof action !== 'string' || !action.startsWith(QUICK_ACTION_PREFIX)) return null;
  const id = action.slice(QUICK_ACTION_PREFIX.length);
  return (QUICK_FILTER_IDS as readonly string[]).includes(id) ? (id as QuickFilterId) : null;
}

export interface QuickFilter {
  id: QuickFilterId;
  filters: Filters;
  /** How many sources the filter lists. */
  count: number;
}

export function buildQuickFilters(audit: AuditResult): QuickFilter[] {
  return QUICK_FILTER_IDS.map((id) => {
    const filters = quickFilterFor(id);
    return { id, filters, count: applyFilters(audit.sources, filters).length };
  });
}

/** Whether the active filters are exactly the ones a quick filter applies. */
export function isQuickFilterActive(id: QuickFilterId, active: Filters): boolean {
  return serializeFilters(active) === serializeFilters(PRESETS[id]);
}

type Key = 'qf.title' | 'qf.help' | 'qf.none' | `qf.${QuickFilterId}`;

const MESSAGES: Messages<Key> = {
  en: {
    'qf.title': 'Quick filters',
    'qf.help': 'Each one replaces the filters below and shows the matching sources in the list.',
    'qf.none': 'No source needs review, so there is nothing to jump to.',
    'qf.review': 'Needs review ({n})',
    'qf.stale': 'Possibly out of date ({n})',
    'qf.undated': 'Date unknown ({n})',
    'qf.noTier': 'Tier unknown ({n})',
  },
  fr: {
    'qf.title': 'Filtres rapides',
    'qf.help': 'Chacun remplace les filtres ci-dessous et présente les sources correspondantes dans la liste.',
    'qf.none': 'Aucune source n’est à examiner. Il n’y a aucun raccourci à proposer.',
    'qf.review': 'À examiner ({n})',
    'qf.stale': 'Possiblement périmées ({n})',
    'qf.undated': 'Date inconnue ({n})',
    'qf.noTier': 'Niveau inconnu ({n})',
  },
};

export const QUICK_FILTER_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function quickFilterLabel(q: Pick<QuickFilter, 'id' | 'count'>, locale: Locale): string {
  return tx(locale, `qf.${q.id}`, { n: q.count });
}

export interface QuickFilterRenderOptions {
  /** The filters in force, so the matching quick filter can be marked as on. */
  active: Filters;
  /** Static pages: the link for a set of filters. Without it, buttons are rendered. */
  hrefFor?: (filters: Filters) => string;
  /** Inline style for a button, so targets match the rest of the panel. */
  buttonStyle?: string;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';
const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';

/** Only quick filters that list at least one source are offered. */
export function renderQuickFiltersHtml(items: readonly QuickFilter[], locale: Locale, opts: QuickFilterRenderOptions): string {
  const heading = `<h2 id="ds-quick-title">${escapeHtml(tx(locale, 'qf.title'))}</h2>`;
  const useful = items.filter((q) => q.count > 0);
  if (useful.length === 0) return `<section aria-labelledby="ds-quick-title">${heading}<p>${escapeHtml(tx(locale, 'qf.none'))}</p></section>`;
  const style = opts.buttonStyle ?? DEFAULT_BUTTON_STYLE;
  const controls = useful
    .map((q) => {
      const label = escapeHtml(quickFilterLabel(q, locale));
      const on = isQuickFilterActive(q.id, opts.active);
      if (opts.hrefFor) return `<li><a href="${escapeHtml(opts.hrefFor(q.filters))}"${on ? ' aria-current="true"' : ''} style="${LINK_STYLE}">${label}</a></li>`;
      return `<li><button type="button" data-action="${quickAction(q.id)}" aria-pressed="${on ? 'true' : 'false'}" style="${style}">${label}</button></li>`;
    })
    .join('');
  return (
    `<section aria-labelledby="ds-quick-title">${heading}<p>${escapeHtml(tx(locale, 'qf.help'))}</p>` +
    `<ul style="list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px">${controls}</ul></section>`
  );
}
