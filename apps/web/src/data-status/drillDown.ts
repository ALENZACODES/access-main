/**
 * From a count to the rows behind it: a control beside a tier, or a dataset, that lists exactly
 * those sources in the source list. It applies one filter and clears the others, so the number
 * of rows listed is the count the control sits beside.
 */
import { listActiveFilters } from './activeFilters';
import type { FreshnessState, LicenceKind, Locale } from './dataStatus';
import { isDatasetFilter, isLicenceKind, isTierFilter, NO_FILTERS, type Filters, type TierFilter } from './filters';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export type DrillTarget =
  | { kind: 'tier'; value: TierFilter }
  | { kind: 'licence'; value: LicenceKind }
  | { kind: 'state'; value: FreshnessState }
  | { kind: 'dataset'; value: string };

export const DRILL_KINDS = ['tier', 'licence', 'state', 'dataset'] as const;
const STATES: readonly FreshnessState[] = ['fresh', 'stale', 'unknown'];

/** The filters a target applies: that one filter and nothing else. */
export function drillFilters(target: DrillTarget): Filters {
  switch (target.kind) {
    case 'tier':
      return { ...NO_FILTERS, tier: target.value };
    case 'licence':
      return { ...NO_FILTERS, licence: target.value };
    case 'state':
      return { ...NO_FILTERS, state: target.value };
    case 'dataset':
      return { ...NO_FILTERS, dataset: target.value };
  }
}

export const DRILL_ACTION_PREFIX = 'show:';

/** The `data-action` value for a target. A dataset id is percent-encoded so any id is safe in an attribute. */
export function drillAction(target: DrillTarget): string {
  return `${DRILL_ACTION_PREFIX}${target.kind}:${target.kind === 'dataset' ? encodeURIComponent(target.value) : target.value}`;
}

/** Reads a `data-action` value; null when it is not a well-formed drill-down action. */
export function parseDrillAction(action: string | null | undefined): DrillTarget | null {
  if (typeof action !== 'string' || !action.startsWith(DRILL_ACTION_PREFIX)) return null;
  const rest = action.slice(DRILL_ACTION_PREFIX.length);
  const cut = rest.indexOf(':');
  if (cut < 1) return null;
  const kind = rest.slice(0, cut);
  const raw = rest.slice(cut + 1);
  if (kind === 'tier') return isTierFilter(raw) ? { kind, value: raw } : null;
  if (kind === 'licence') return isLicenceKind(raw) ? { kind, value: raw } : null;
  if (kind === 'state') return (STATES as readonly string[]).includes(raw) ? { kind, value: raw as FreshnessState } : null;
  if (kind === 'dataset') {
    let id: string;
    try {
      id = decodeURIComponent(raw);
    } catch {
      return null;
    }
    return isDatasetFilter(id) ? { kind, value: id } : null;
  }
  return null;
}

type Key = 'dd.column' | 'dd.show';

const MESSAGES: Messages<Key> = {
  en: { 'dd.column': 'In the source list', 'dd.show': 'List these sources. {label}' },
  fr: { 'dd.column': 'Dans la liste des sources', 'dd.show': 'Afficher ces sources. {label}' },
};

export const DRILL_DOWN_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function drillColumnHeading(locale: Locale): string {
  return tx(locale, 'dd.column');
}

/** The control's name: what it does, then which sources, in the same words the filters use. */
export function drillLabel(target: DrillTarget, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string {
  const label = listActiveFilters(drillFilters(target), locale, datasetNames)[0]?.label ?? '';
  return tx(locale, 'dd.show', { label });
}

export interface DrillRenderOptions {
  /** Static pages: the link for a set of filters. Without it, a button is rendered. */
  hrefFor?: (filters: Filters) => string;
  buttonStyle?: string;
  datasetNames?: ReadonlyMap<string, string>;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';
const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';

export function renderDrillControl(target: DrillTarget, locale: Locale, opts: DrillRenderOptions = {}): string {
  const text = escapeHtml(drillLabel(target, locale, opts.datasetNames));
  if (opts.hrefFor) return `<a href="${escapeHtml(opts.hrefFor(drillFilters(target)))}" style="${LINK_STYLE}">${text}</a>`;
  return `<button type="button" data-action="${escapeHtml(drillAction(target))}" style="${opts.buttonStyle ?? DEFAULT_BUTTON_STYLE}">${text}</button>`;
}
