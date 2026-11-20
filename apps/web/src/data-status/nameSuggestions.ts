/**
 * When the search text matches no source, this looks for the nearest words that do appear in the
 * names being searched (a slip of one or two letters) and offers the corrected search. It only
 * offers a search that lists at least one source with the other filters as they are, and it
 * never changes the search on its own.
 */
import type { AuditedSource } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { applyFilters, MAX_QUERY_LENGTH, normaliseQuery, type Filters } from './filters';
import { createTranslator, type Messages } from './localText';
import { foldText, queryWords } from './searchText';
import { escapeHtml } from './sourceList';

export const MAX_SUGGESTIONS = 3;
/** Words shorter than this are not corrected: too many other words are one letter away. */
export const MIN_WORD_LENGTH = 4;

/**
 * How many single-letter changes turn `a` into `b`: a letter added, removed or replaced, or two
 * neighbouring letters swapped. Returns `max + 1` as soon as the answer is known to be over `max`.
 */
export function editDistance(a: string, b: string, max: number = Number.MAX_SAFE_INTEGER): number {
  const s = [...a];
  const u = [...b];
  if (Math.abs(s.length - u.length) > max) return max + 1;
  if (s.length === 0) return u.length;
  if (u.length === 0) return s.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: u.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= u.length; j++) {
      const cost = s[i - 1] === u[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && s[i - 1] === u[j - 2] && s[i - 2] === u[j - 1]) v = Math.min(v, (prev2[j - 2] ?? 0) + 1);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  const d = prev[u.length] ?? 0;
  return d > max ? max + 1 : d;
}

/** How many changes a word of this length may need and still count as a slip. */
export function allowedDistance(word: string): number {
  const n = [...word].length;
  if (n < MIN_WORD_LENGTH) return 0;
  return n < 8 ? 1 : 2;
}

/** The text the search looks in, for one source. Kept in step with applyFilters. */
function haystack(s: AuditedSource): string {
  return foldText([s.datasetName, s.name ?? '', s.sourceId, s.licence ?? ''].join(' '));
}

/** Every distinct word of at least MIN_WORD_LENGTH letters in the searched text of these sources, sorted. */
export function searchVocabulary(sources: readonly AuditedSource[]): string[] {
  const words = new Set<string>();
  for (const s of sources) {
    for (const w of haystack(s).split(/[^\p{L}\p{N}]+/u)) if ([...w].length >= MIN_WORD_LENGTH) words.add(w);
  }
  return [...words].sort();
}

export interface NameSuggestion {
  /** The corrected search text. */
  query: string;
  /** How many sources it lists with the other filters unchanged. At least 1. */
  count: number;
  /** Letter changes made, summed over the corrected words. */
  distance: number;
}

interface Near {
  word: string;
  distance: number;
}

function nearest(word: string, vocabulary: readonly string[], keep: number): Near[] {
  const max = allowedDistance(word);
  if (max === 0) return [];
  const out: Near[] = [];
  for (const v of vocabulary) {
    const d = editDistance(word, v, max);
    if (d >= 1 && d <= max) out.push({ word: v, distance: d });
  }
  return out.sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word)).slice(0, keep);
}

/**
 * Corrected searches, nearest first. Empty when the search is empty, when the filters already
 * list something, when no source passes the other filters, or when a word that matches nothing
 * has no near word. Words that already appear in some name are kept as typed.
 */
export function buildNameSuggestions(sources: readonly AuditedSource[], f: Filters, limit: number = MAX_SUGGESTIONS): NameSuggestion[] {
  const words = queryWords(normaliseQuery(f.query));
  if (words.length === 0 || limit < 1 || applyFilters(sources, f).length > 0) return [];
  const pool = applyFilters(sources, { ...f, query: '' });
  if (pool.length === 0) return [];
  const hays = pool.map(haystack);
  const vocabulary = searchVocabulary(pool);
  const choices: Near[][] = [];
  for (const w of words) {
    if (hays.some((h) => h.includes(w))) {
      choices.push([{ word: w, distance: 0 }]);
      continue;
    }
    const near = nearest(w, vocabulary, limit);
    if (near.length === 0) return [];
    choices.push(near);
  }
  // Every combination of the near words, capped: with a few words and three choices each this stays small.
  let combos: Near[][] = [[]];
  for (const c of choices) {
    const next: Near[][] = [];
    for (const head of combos) for (const n of c) if (next.length < 81) next.push([...head, n]);
    combos = next;
  }
  const seen = new Set<string>();
  const out: NameSuggestion[] = [];
  for (const combo of combos) {
    const query = combo.map((n) => n.word).join(' ');
    const distance = combo.reduce((sum, n) => sum + n.distance, 0);
    if (distance === 0 || query.length > MAX_QUERY_LENGTH || seen.has(query)) continue;
    seen.add(query);
    const count = applyFilters(pool, { ...f, query }).length;
    if (count > 0) out.push({ query, count, distance });
  }
  return out.sort((a, b) => a.distance - b.distance || b.count - a.count || a.query.localeCompare(b.query)).slice(0, limit);
}

export const SUGGEST_ACTION_PREFIX = 'suggest:';

export function suggestAction(index: number): string {
  return `${SUGGEST_ACTION_PREFIX}${index}`;
}

/** The position in the suggestions an action stands for; null for anything else. */
export function parseSuggestAction(action: string | null | undefined): number | null {
  if (typeof action !== 'string' || !action.startsWith(SUGGEST_ACTION_PREFIX)) return null;
  const rest = action.slice(SUGGEST_ACTION_PREFIX.length);
  if (!/^\d{1,2}$/.test(rest)) return null;
  const n = Number(rest);
  return n < MAX_SUGGESTIONS ? n : null;
}

type Key = 'ns.lead' | 'ns.option.one' | 'ns.option.other' | 'ns.said.one' | 'ns.said.other';

const MESSAGES: Messages<Key> = {
  en: {
    'ns.lead': 'No name contains the search text as typed. A close spelling does appear.',
    'ns.option.one': 'Search for “{text}” instead ({n} source)',
    'ns.option.other': 'Search for “{text}” instead ({n} sources)',
    'ns.said.one': 'Now searching for “{text}”. {n} source listed.',
    'ns.said.other': 'Now searching for “{text}”. {n} sources listed.',
  },
  fr: {
    'ns.lead': 'Aucun nom ne contient le texte recherché tel qu’il est écrit. Une graphie proche existe.',
    'ns.option.one': 'Chercher plutôt «\u202F{text}\u202F» ({n} source)',
    'ns.option.other': 'Chercher plutôt «\u202F{text}\u202F» ({n} sources)',
    'ns.said.one': 'Recherche de «\u202F{text}\u202F». {n} source dans la liste.',
    'ns.said.other': 'Recherche de «\u202F{text}\u202F». {n} sources dans la liste.',
  },
};

export const NAME_SUGGESTION_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function suggestionLabel(s: NameSuggestion, locale: Locale): string {
  return tx.count(locale, 'ns.option', s.count, { text: s.query });
}

export function describeSuggestionApplied(s: NameSuggestion, locale: Locale): string {
  return tx.count(locale, 'ns.said', s.count, { text: s.query });
}

export interface SuggestionRenderOptions {
  /** Static pages: the link for the list with this search text. Without it, buttons are rendered. */
  hrefFor?: (s: NameSuggestion) => string;
  buttonStyle?: string;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';
const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';

/** Empty when there is nothing to suggest. */
export function renderNameSuggestionsHtml(items: readonly NameSuggestion[], locale: Locale, opts: SuggestionRenderOptions = {}): string {
  if (items.length === 0) return '';
  const controls = items
    .map((s, i) => {
      const text = escapeHtml(suggestionLabel(s, locale));
      return opts.hrefFor
        ? `<li><a href="${escapeHtml(opts.hrefFor(s))}" style="${LINK_STYLE}">${text}</a></li>`
        : `<li><button type="button" data-action="${suggestAction(i)}" style="${opts.buttonStyle ?? DEFAULT_BUTTON_STYLE}">${text}</button></li>`;
    })
    .join('');
  return `<div data-name-suggestions="${items.length}"><p>${escapeHtml(tx(locale, 'ns.lead'))}</p><ul style="list-style:none;padding:0">${controls}</ul></div>`;
}
