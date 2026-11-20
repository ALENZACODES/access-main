/**
 * Ways to narrow the list that is on screen. For each filter that is not yet set (status, kind
 * of data, tier, licence type, age of the retrieved date, unknown fact), this counts the listed
 * sources under each value and offers the values that would leave fewer sources, but at least
 * one. Choosing one adds that filter to the ones in force; nothing else is changed.
 */
import { listActiveFilters, type ActiveFilterKey } from './activeFilters';
import type { AuditedSource } from './datasetRegistry';
import { licenceKind, type FreshnessState, type LicenceKind, type Locale } from './dataStatus';
import {
  ageFilterOf,
  FILTER_AGES,
  FILTER_KINDS,
  FILTER_LICENCE_KINDS,
  FILTER_STATES,
  FILTER_TIERS,
  GAP_FIELDS,
  hasGap,
  isAgeFilter,
  isGapField,
  isLicenceKind,
  isTierFilter,
  NO_FILTERS,
  withOptionalFilter,
  type AgeFilter,
  type Filters,
  type GapField,
  type TierFilter,
} from './filters';
import type { DatasetKind } from './freshnessPolicy';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { UNKNOWN_WORD } from './unknownWord';

export const FACET_KINDS = ['state', 'kind', 'tier', 'licence', 'age', 'gap'] as const;
export type FacetKind = (typeof FACET_KINDS)[number];

export type FacetTarget =
  | { kind: 'state'; value: FreshnessState }
  | { kind: 'kind'; value: DatasetKind }
  | { kind: 'gap'; value: GapField }
  | { kind: 'tier'; value: TierFilter }
  | { kind: 'licence'; value: LicenceKind }
  | { kind: 'age'; value: AgeFilter };

export interface FacetOption {
  target: FacetTarget;
  /** How many of the listed sources have this value. Always at least 1 and fewer than the list. */
  count: number;
}

export interface Facet {
  kind: FacetKind;
  options: FacetOption[];
}

function isSet(f: Filters, kind: FacetKind): boolean {
  if (kind === 'state') return f.state !== 'any';
  if (kind === 'kind') return f.kind !== 'any';
  return f[kind] !== undefined;
}

/** The values a source is counted under. One for every filter but the unknown facts, where a source can have several or none. */
function valuesOf(s: AuditedSource, kind: FacetKind): readonly string[] {
  if (kind === 'gap') return GAP_FIELDS.filter((g) => hasGap(s, g));
  return [valueOf(s, kind)];
}

function valueOf(s: AuditedSource, kind: Exclude<FacetKind, 'gap'>): string {
  if (kind === 'state') return s.state;
  if (kind === 'kind') return s.kind;
  if (kind === 'tier') return s.tier ?? 'unknown';
  if (kind === 'licence') return licenceKind(s.licence);
  return ageFilterOf(s);
}

const VALUES: Readonly<Record<FacetKind, readonly string[]>> = { state: FILTER_STATES, kind: FILTER_KINDS, tier: FILTER_TIERS, licence: FILTER_LICENCE_KINDS, age: FILTER_AGES, gap: GAP_FIELDS };

/**
 * One facet for each unset filter that can split the list. `listed` is the list as filtered now.
 * A value every listed source shares is not offered, because choosing it would change nothing,
 * and a value no listed source has is not offered, because it would empty the list.
 */
export function buildFacets(listed: readonly AuditedSource[], f: Filters): Facet[] {
  if (listed.length < 2) return [];
  const out: Facet[] = [];
  for (const kind of FACET_KINDS) {
    if (isSet(f, kind)) continue;
    const counts = new Map<string, number>();
    for (const s of listed) for (const v of valuesOf(s, kind)) counts.set(v, (counts.get(v) ?? 0) + 1);
    const options: FacetOption[] = [];
    for (const value of VALUES[kind]) {
      const count = counts.get(value) ?? 0;
      if (count > 0 && count < listed.length) options.push({ target: { kind, value } as FacetTarget, count });
    }
    if (options.length > 0) out.push({ kind, options });
  }
  return out;
}

/** The filters with this one added. The input is not changed. */
export function narrowFilters(f: Filters, target: FacetTarget): Filters {
  if (target.kind === 'state') return { ...f, state: target.value };
  if (target.kind === 'kind') return { ...f, kind: target.value };
  if (target.kind === 'gap') return withOptionalFilter(f, 'gap', target.value);
  if (target.kind === 'tier') return withOptionalFilter(f, 'tier', target.value);
  if (target.kind === 'licence') return withOptionalFilter(f, 'licence', target.value);
  return withOptionalFilter(f, 'age', target.value);
}

export const FACET_ACTION_PREFIX = 'narrow:';

export function facetAction(target: FacetTarget): string {
  return `${FACET_ACTION_PREFIX}${target.kind}:${target.value}`;
}

/** Reads an action back; null for anything that is not a facet action with a value this panel knows. */
export function parseFacetAction(action: string | null | undefined): FacetTarget | null {
  if (typeof action !== 'string' || !action.startsWith(FACET_ACTION_PREFIX)) return null;
  const rest = action.slice(FACET_ACTION_PREFIX.length);
  const cut = rest.indexOf(':');
  if (cut < 1) return null;
  const kind = rest.slice(0, cut);
  const value = rest.slice(cut + 1);
  if (kind === 'state') return (FILTER_STATES as readonly string[]).includes(value) ? { kind, value: value as FreshnessState } : null;
  if (kind === 'kind') return (FILTER_KINDS as readonly string[]).includes(value) ? { kind, value: value as DatasetKind } : null;
  if (kind === 'gap') return isGapField(value) ? { kind, value } : null;
  if (kind === 'tier') return isTierFilter(value) ? { kind, value } : null;
  if (kind === 'licence') return isLicenceKind(value) ? { kind, value } : null;
  if (kind === 'age') return isAgeFilter(value) ? { kind, value } : null;
  return null;
}

type Key = 'fa.title' | 'fa.intro' | 'fa.state' | 'fa.kind' | 'fa.gap' | 'fa.tier' | 'fa.licence' | 'fa.age' | 'fa.option' | 'fa.tierUnknown' | 'fa.said.one' | 'fa.said.other';

const MESSAGES: Messages<Key> = {
  en: {
    'fa.title': 'Narrow this list',
    'fa.intro': 'Each choice adds one filter to the ones already set. The number is how many of the listed sources it keeps. A source with several facts that are UNKNOWN is counted under each.',
    'fa.state': 'By status',
    'fa.kind': 'By kind of data',
    'fa.gap': 'By fact that is UNKNOWN',
    'fa.tier': 'By tier',
    'fa.licence': 'By licence type',
    'fa.age': 'By age of the retrieved date',
    'fa.option': '{label} ({count})',
    'fa.tierUnknown': 'Tier: {unknown}',
    'fa.said.one': 'Filter added. {label}. {n} source listed.',
    'fa.said.other': 'Filter added. {label}. {n} sources listed.',
  },
  fr: {
    'fa.title': 'Restreindre cette liste',
    'fa.intro': 'Chaque choix ajoute un filtre à ceux déjà en place. Le nombre indique combien de sources de la liste il conserve. Une source dont plusieurs éléments sont UNKNOWN est comptée sous chacun.',
    'fa.state': 'Par état',
    'fa.kind': 'Par type de données',
    'fa.gap': 'Par élément UNKNOWN',
    'fa.tier': 'Par niveau',
    'fa.licence': 'Par type de licence',
    'fa.age': 'Par âge de la date de récupération',
    'fa.option': '{label} ({count})',
    'fa.tierUnknown': 'Niveau\u00A0: {unknown}',
    'fa.said.one': 'Filtre ajouté. {label}. {n} source dans la liste.',
    'fa.said.other': 'Filtre ajouté. {label}. {n} sources dans la liste.',
  },
};

export const FACET_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const FILTER_KEY: Readonly<Record<FacetKind, ActiveFilterKey>> = { state: 'state', kind: 'kind', tier: 'tier', licence: 'licence', age: 'age', gap: 'gap' };

/** The filter in words, as the list of filters in force would name it. A tier that is not known is the token UNKNOWN. */
export function facetLabel(target: FacetTarget, locale: Locale): string {
  if (target.kind === 'tier' && target.value === 'unknown') return tx(locale, 'fa.tierUnknown', { unknown: UNKNOWN_WORD });
  const named = listActiveFilters(narrowFilters({ ...NO_FILTERS }, target), locale).find((a) => a.key === FILTER_KEY[target.kind]);
  return named?.label ?? `${target.kind}: ${target.value}`;
}

export function facetHeading(kind: FacetKind, locale: Locale): string {
  return tx(locale, `fa.${kind}`);
}

export function describeNarrowed(target: FacetTarget, listed: number, locale: Locale): string {
  return tx.count(locale, 'fa.said', listed, { label: facetLabel(target, locale) });
}

export interface FacetRenderOptions {
  /** Static pages: the link for the list with these filters. Without it, buttons are rendered. */
  hrefFor?: (target: FacetTarget) => string;
  buttonStyle?: string;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';
const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';
const LIST_STYLE = 'list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px';

/** Empty when nothing would narrow the list. */
export function renderFacetsHtml(facets: readonly Facet[], locale: Locale, opts: FacetRenderOptions = {}): string {
  if (facets.length === 0) return '';
  let html = `<section aria-labelledby="ds-facets-title" data-facets="${facets.length}"><h3 id="ds-facets-title">${escapeHtml(tx(locale, 'fa.title'))}</h3><p>${escapeHtml(tx(locale, 'fa.intro'))}</p>`;
  for (const facet of facets) {
    const id = `ds-facet-${facet.kind}`;
    html += `<p id="${id}">${escapeHtml(facetHeading(facet.kind, locale))}</p><ul aria-labelledby="${id}" style="${LIST_STYLE}">`;
    for (const o of facet.options) {
      const text = escapeHtml(tx(locale, 'fa.option', { label: facetLabel(o.target, locale), count: o.count }));
      html += opts.hrefFor
        ? `<li><a href="${escapeHtml(opts.hrefFor(o.target))}" style="${LINK_STYLE}">${text}</a></li>`
        : `<li><button type="button" data-action="${escapeHtml(facetAction(o.target))}" style="${opts.buttonStyle ?? DEFAULT_BUTTON_STYLE}">${text}</button></li>`;
    }
    html += '</ul>';
  }
  return `${html}</section>`;
}
