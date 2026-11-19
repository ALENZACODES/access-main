/**
 * When the filters match no source, this works out which single filter, if removed, would bring
 * sources back, and how many. It only counts; it never changes the filters on its own.
 */
import { listActiveFilters, clearAction, withoutFilter, type ActiveFilter, type ActiveFilterKey } from './activeFilters';
import type { AuditedSource } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { applyFilters, type Filters } from './filters';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export interface NoMatchHint {
  filter: ActiveFilter;
  /** How many sources the list would show with only this filter removed. */
  count: number;
}

/**
 * One hint for each filter whose removal alone would show at least one source, most sources
 * first. Empty when the filters already match something, when no filter is in force, or when
 * no single removal helps.
 */
export function buildNoMatchHints(sources: readonly AuditedSource[], f: Filters, locale: Locale, datasetNames?: ReadonlyMap<string, string>): NoMatchHint[] {
  if (sources.length === 0 || applyFilters(sources, f).length > 0) return [];
  return listActiveFilters(f, locale, datasetNames)
    .map((filter, index) => ({ filter, index, count: applyFilters(sources, withoutFilter(f, filter.key)).length }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map(({ filter, count }) => ({ filter, count }));
}

type Key = 'nm.lead' | 'nm.none' | 'nm.hint.one' | 'nm.hint.other';

const MESSAGES: Messages<Key> = {
  en: {
    'nm.lead': 'Removing one filter would bring sources back.',
    'nm.none': 'No single filter is the cause. Clear the filters to see every source.',
    'nm.hint.one': 'Remove filter. {label} (shows {n} source)',
    'nm.hint.other': 'Remove filter. {label} (shows {n} sources)',
  },
  fr: {
    'nm.lead': 'Le retrait d’un seul filtre ferait réapparaître des sources.',
    'nm.none': 'Aucun filtre n’est à lui seul en cause. Effacez les filtres pour voir toutes les sources.',
    'nm.hint.one': 'Retirer le filtre. {label} (présente {n} source)',
    'nm.hint.other': 'Retirer le filtre. {label} (présente {n} sources)',
  },
};

export const NO_MATCH_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function hintLabel(h: NoMatchHint, locale: Locale): string {
  return tx.count(locale, 'nm.hint', h.count, { label: h.filter.label });
}

export interface NoMatchRenderOptions {
  /** Static pages: the link that shows the list without the given filter. Without it, buttons are rendered. */
  hrefFor?: (key: ActiveFilterKey) => string;
  buttonStyle?: string;
  /** How many filters are in force. With fewer than two, "no single filter" would be untrue, so nothing is said. */
  activeCount: number;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';
const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';

export function renderNoMatchHintsHtml(hints: readonly NoMatchHint[], locale: Locale, opts: NoMatchRenderOptions): string {
  if (hints.length === 0) return opts.activeCount >= 2 ? `<p data-no-match="none">${escapeHtml(tx(locale, 'nm.none'))}</p>` : '';
  const style = opts.buttonStyle ?? DEFAULT_BUTTON_STYLE;
  const items = hints
    .map((h) => {
      const text = escapeHtml(hintLabel(h, locale));
      if (opts.hrefFor) return `<li><a href="${escapeHtml(opts.hrefFor(h.filter.key))}" style="${LINK_STYLE}">${text}</a></li>`;
      return `<li><button type="button" data-action="${clearAction(h.filter.key)}" style="${style}">${text}</button></li>`;
    })
    .join('');
  return (
    `<div data-no-match="${hints.length}"><p>${escapeHtml(tx(locale, 'nm.lead'))}</p>` +
    `<ul style="list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px">${items}</ul></div>`
  );
}
