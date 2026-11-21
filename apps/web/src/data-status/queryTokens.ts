/**
 * Search words that are really filters. Typing `tier:E licence:open` in the search box is read
 * as two filters and no search text; the panel then offers to apply them. Nothing is applied
 * until the person asks, and a word that is not understood is left in the search as typed.
 */
import { listActiveFilters, type ActiveFilterKey } from './activeFilters';
import type { FreshnessState, LicenceKind, Locale } from './dataStatus';
import { hasActiveFilters, NO_FILTERS, type AgeFilter, type DueWindow, type Filters, type GapField, type TierFilter } from './filters';
import { createTranslator, type Messages } from './localText';
import { foldText } from './searchText';
import { escapeHtml } from './sourceList';

export type TokenKey = 'tier' | 'licence' | 'state' | 'gap' | 'age' | 'due';
export const TOKEN_KEYS: readonly TokenKey[] = ['tier', 'licence', 'state', 'gap', 'age', 'due'];

// What a person may type before the colon, in either language, already folded to plain lower case.
const KEY_WORDS: Readonly<Record<string, TokenKey>> = {
  tier: 'tier',
  niveau: 'tier',
  licence: 'licence',
  license: 'licence',
  status: 'state',
  state: 'state',
  etat: 'state',
  unknown: 'gap',
  missing: 'gap',
  inconnu: 'gap',
  sans: 'gap',
  age: 'age',
  due: 'due',
  revision: 'due',
};

const TIER_VALUES: Readonly<Record<string, TierFilter>> = { '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', e: 'E', unknown: 'unknown', inconnu: 'unknown', none: 'unknown', aucun: 'unknown' };
const LICENCE_VALUES: Readonly<Record<string, LicenceKind>> = {
  open: 'open',
  ouverte: 'open',
  terms: 'terms',
  conditions: 'terms',
  unlisted: 'unrecognised',
  other: 'unrecognised',
  autre: 'unrecognised',
  unknown: 'unknown',
  inconnue: 'unknown',
  none: 'unknown',
  aucune: 'unknown',
};
const STATE_VALUES: Readonly<Record<string, FreshnessState>> = { fresh: 'fresh', ok: 'fresh', stale: 'stale', old: 'stale', perime: 'stale', unknown: 'unknown', inconnu: 'unknown' };
const GAP_VALUES: Readonly<Record<string, GapField>> = { source: 'source', licence: 'licence', license: 'licence', date: 'date', tier: 'tier', niveau: 'tier' };
const AGE_VALUES: Readonly<Record<string, AgeFilter>> = { '0-30': 'd0_30', '31-90': 'd31_90', '91-180': 'd91_180', '181-365': 'd181_365', '366+': 'd366_plus', unknown: 'unknown', inconnu: 'unknown' };
const DUE_VALUES: Readonly<Record<string, DueWindow>> = { '7': 'd7', '30': 'd30', '90': 'd90' };

export type TokenFilters = Pick<Filters, 'tier' | 'licence' | 'gap' | 'age' | 'due'> & { state?: FreshnessState };

export interface ParsedQuery {
  /** The filters the recognised words stand for. A later word for the same filter replaces an earlier one. */
  filters: TokenFilters;
  /** The search text with the recognised words taken out. */
  rest: string;
  /** The recognised words, as typed, in order. */
  recognised: string[];
  /** Words whose key is one of ours but whose value is not understood, as typed. */
  notUnderstood: string[];
}

function readValue(key: TokenKey, value: string): Partial<TokenFilters> | null {
  if (key === 'tier') return Object.hasOwn(TIER_VALUES, value) ? { tier: TIER_VALUES[value] as TierFilter } : null;
  if (key === 'licence') return Object.hasOwn(LICENCE_VALUES, value) ? { licence: LICENCE_VALUES[value] as LicenceKind } : null;
  if (key === 'state') return Object.hasOwn(STATE_VALUES, value) ? { state: STATE_VALUES[value] as FreshnessState } : null;
  if (key === 'gap') return Object.hasOwn(GAP_VALUES, value) ? { gap: GAP_VALUES[value] as GapField } : null;
  if (key === 'age') return Object.hasOwn(AGE_VALUES, value) ? { age: AGE_VALUES[value] as AgeFilter } : null;
  return Object.hasOwn(DUE_VALUES, value) ? { due: DUE_VALUES[value] as DueWindow } : null;
}

/** Splits search text into filter words and the rest. Text with no `key:value` word comes back unchanged as `rest`. */
export function parseQueryTokens(query: string): ParsedQuery {
  const out: ParsedQuery = { filters: {}, rest: '', recognised: [], notUnderstood: [] };
  const rest: string[] = [];
  for (const word of query.split(/[ \t\r\n]+/).filter((w) => w !== '')) {
    const cut = word.indexOf(':');
    const keyWord = cut > 0 ? foldText(word.slice(0, cut)) : '';
    // Only our own key words count: a word such as "constructor:1" must not reach an inherited property.
    const key = Object.hasOwn(KEY_WORDS, keyWord) ? KEY_WORDS[keyWord] : undefined;
    const value = cut > 0 ? foldText(word.slice(cut + 1)) : '';
    if (key === undefined || value === '') {
      rest.push(word);
      continue;
    }
    const read = readValue(key, value);
    if (read === null) {
      out.notUnderstood.push(word);
      rest.push(word);
      continue;
    }
    Object.assign(out.filters, read);
    out.recognised.push(word);
  }
  out.rest = rest.join(' ');
  return out;
}

/** The filters with the recognised words applied and taken out of the search text. The input is not changed. */
export function applyQueryTokens(f: Filters, parsed: ParsedQuery): Filters {
  if (parsed.recognised.length === 0) return { ...f };
  const { state, ...optional } = parsed.filters;
  return { ...f, ...optional, ...(state === undefined ? {} : { state }), query: parsed.rest };
}

type Key = 'qt.offer' | 'qt.apply' | 'qt.join' | 'qt.notUnderstood' | 'qt.examples' | 'qt.said.one' | 'qt.said.other';

const MESSAGES: Messages<Key> = {
  en: {
    'qt.offer': 'Some search words can be used as filters: {list}.',
    'qt.apply': 'Use them as filters',
    'qt.join': '; ',
    'qt.notUnderstood': 'Not understood as a filter: {list}.',
    'qt.examples': 'Examples that work: {list}.',
    'qt.said.one': '{n} search word is now a filter.',
    'qt.said.other': '{n} search words are now filters.',
  },
  fr: {
    'qt.offer': 'Certains mots de la recherche peuvent servir de filtres\u00A0: {list}.',
    'qt.apply': 'Les utiliser comme filtres',
    'qt.join': '\u202F; ',
    'qt.notUnderstood': 'Non compris comme filtre\u00A0: {list}.',
    'qt.examples': 'Exemples qui fonctionnent\u00A0: {list}.',
    'qt.said.one': '{n} mot de la recherche est maintenant un filtre.',
    'qt.said.other': '{n} mots de la recherche sont maintenant des filtres.',
  },
};

export const QUERY_TOKEN_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** Words to type, not prose: kept out of the message table so they stay exactly as the parser reads them. */
export const TOKEN_EXAMPLES: Readonly<Record<Locale, readonly string[]>> = {
  en: ['tier:E', 'licence:open', 'status:stale', 'unknown:date', 'age:0-30', 'due:30'],
  fr: ['niveau:E', 'licence:ouverte', 'etat:perime', 'sans:date', 'age:0-30', 'revision:30'],
};

export const TOKENS_APPLY_ACTION = 'tokens-apply';

const TOKEN_FILTER_KEYS: readonly ActiveFilterKey[] = ['state', 'tier', 'licence', 'gap', 'age', 'due'];

/** The filters the recognised words stand for, in words. */
export function tokenFilterLabels(parsed: ParsedQuery, locale: Locale): string[] {
  const only = applyQueryTokens({ ...NO_FILTERS }, { ...parsed, rest: '' });
  if (!hasActiveFilters(only)) return [];
  return listActiveFilters(only, locale)
    .filter((a) => TOKEN_FILTER_KEYS.includes(a.key))
    .map((a) => a.label);
}

export function describeTokensApplied(parsed: ParsedQuery, locale: Locale): string {
  return tx.count(locale, 'qt.said', parsed.recognised.length);
}

export interface QueryTokenRenderOptions {
  /** Static pages: the link that shows the list with the words applied. Without it, a button is rendered. */
  href?: string;
  buttonStyle?: string;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';
const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';

/** Empty when the search text holds no filter word, understood or not. */
export function renderQueryTokensHtml(parsed: ParsedQuery, locale: Locale, opts: QueryTokenRenderOptions = {}): string {
  if (parsed.recognised.length === 0 && parsed.notUnderstood.length === 0) return '';
  const join = tx(locale, 'qt.join');
  let html = `<div data-query-tokens="${parsed.recognised.length}">`;
  if (parsed.recognised.length > 0) {
    const apply = escapeHtml(tx(locale, 'qt.apply'));
    html +=
      `<p>${escapeHtml(tx(locale, 'qt.offer', { list: tokenFilterLabels(parsed, locale).join(join) }))}</p><p>` +
      (opts.href !== undefined
        ? `<a href="${escapeHtml(opts.href)}" style="${LINK_STYLE}">${apply}</a>`
        : `<button type="button" data-action="${TOKENS_APPLY_ACTION}" style="${opts.buttonStyle ?? DEFAULT_BUTTON_STYLE}">${apply}</button>`) +
      '</p>';
  }
  if (parsed.notUnderstood.length > 0) {
    html += `<p>${escapeHtml(tx(locale, 'qt.notUnderstood', { list: parsed.notUnderstood.join(join) }))} ${escapeHtml(tx(locale, 'qt.examples', { list: TOKEN_EXAMPLES[locale].join(', ') }))}</p>`;
  }
  return `${html}</div>`;
}
