/**
 * Saved views: a short list of filter combinations a person wants to come back to. A view is
 * stored as the same query text the address bar uses, and is read back through the filter
 * parser, so anything unreadable or out of date is dropped instead of being trusted.
 *
 * Where the list is kept is up to the caller: with a storage object it stays on the device; with
 * none it lasts only while the page is open. Nothing is sent anywhere either way.
 */
import { listActiveFilters } from './activeFilters';
import type { Locale } from './dataStatus';
import { hasActiveFilters, parseFilters, serializeFilters, type Filters } from './filters';
import { createTranslator, type Messages } from './localText';
import type { StorageLike } from './snapshot';
import { escapeHtml } from './sourceList';

export const SAVED_VIEWS_KEY = 'data-status:saved-views:v1';
export const MAX_SAVED_VIEWS = 8;

/** The canonical query text for a set of filters ('' when none is in force). */
export function viewQuery(f: Filters): string {
  return serializeFilters(parseFilters(serializeFilters(f)));
}

export const MAX_VIEW_NAME_LENGTH = 60;

export interface SavedView {
  /** The filters, as canonical query text. */
  query: string;
  /** The name the person gave the view; null when they gave none. */
  name: string | null;
}

/** A usable name: control characters removed, spaces collapsed, cut to the limit; null when nothing is left. */
export function cleanViewName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_VIEW_NAME_LENGTH)
    .trim();
  return name === '' ? null : name;
}

function readEntry(item: unknown): SavedView | null {
  // A plain string is the first stored form (filters only); an object also carries a name.
  const rawQuery = typeof item === 'string' ? item : typeof item === 'object' && item !== null ? (item as { q?: unknown }).q : null;
  if (typeof rawQuery !== 'string') return null;
  const query = serializeFilters(parseFilters(rawQuery));
  if (query === '') return null;
  return { query, name: typeof item === 'string' ? null : cleanViewName((item as { name?: unknown }).name) };
}

/** Keeps readable, non-empty views with distinct filters, in order, up to the limit. */
export function cleanViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedView[] = [];
  for (const item of raw) {
    const view = readEntry(item);
    if (view === null || out.some((v) => v.query === view.query)) continue;
    out.push(view);
    if (out.length === MAX_SAVED_VIEWS) break;
  }
  return out;
}

/** The stored form: a plain query for a view without a name, so older lists and newer ones read the same. */
export function viewsToStored(views: readonly SavedView[]): unknown[] {
  return views.map((v) => (v.name === null ? v.query : { q: v.query, name: v.name }));
}

export interface SavedViewStore {
  /** True when views stay on the device after the page is closed. */
  readonly durable: boolean;
  load(): SavedView[];
  /** Returns false when the list could not be written. */
  save(views: readonly SavedView[]): boolean;
}

/** With a storage object the list is kept on the device; with none it lives in memory for this page only. */
export function createSavedViewStore(storage: StorageLike | null | undefined, key: string = SAVED_VIEWS_KEY): SavedViewStore {
  if (!storage) {
    let memory: SavedView[] = [];
    return {
      durable: false,
      load: () => memory.map((v) => ({ ...v })),
      save: (views) => {
        memory = cleanViews(viewsToStored(views));
        return true;
      },
    };
  }
  return {
    durable: true,
    load: () => {
      try {
        const text = storage.getItem(key);
        return text === null ? [] : cleanViews(JSON.parse(text) as unknown);
      } catch {
        return [];
      }
    },
    save: (views) => {
      try {
        const clean = cleanViews(viewsToStored(views));
        if (clean.length === 0) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(viewsToStored(clean)));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type SaveOutcome = 'saved' | 'exists' | 'empty' | 'full' | 'failed';

/** Adds the current filters as a view, with an optional name. Nothing is written unless the outcome is 'saved'. */
export function addView(store: SavedViewStore, f: Filters, name?: string | null): { outcome: SaveOutcome; views: SavedView[] } {
  const views = store.load();
  const q = viewQuery(f);
  if (q === '' || !hasActiveFilters(parseFilters(q))) return { outcome: 'empty', views };
  if (views.some((v) => v.query === q)) return { outcome: 'exists', views };
  if (views.length >= MAX_SAVED_VIEWS) return { outcome: 'full', views };
  const next = [...views, { query: q, name: cleanViewName(name) }];
  return store.save(next) ? { outcome: 'saved', views: next } : { outcome: 'failed', views };
}

/** Removes the view at a position. Out-of-range positions change nothing. */
export function removeViewAt(store: SavedViewStore, index: number): { removed: boolean; views: SavedView[] } {
  const views = store.load();
  if (!Number.isInteger(index) || index < 0 || index >= views.length) return { removed: false, views };
  const next = views.filter((_, i) => i !== index);
  return store.save(next) ? { removed: true, views: next } : { removed: false, views };
}

export const VIEW_SAVE_ACTION = 'view-save';
const APPLY_PREFIX = 'view-apply:';
const DELETE_PREFIX = 'view-delete:';

export function viewApplyAction(index: number): string {
  return `${APPLY_PREFIX}${index}`;
}

export function viewDeleteAction(index: number): string {
  return `${DELETE_PREFIX}${index}`;
}

export type ViewAction = { kind: 'save' } | { kind: 'apply'; index: number } | { kind: 'delete'; index: number };

/** Reads a `data-action` value; null when it is not a saved-view action. */
export function parseViewAction(action: string | null | undefined): ViewAction | null {
  if (typeof action !== 'string') return null;
  if (action === VIEW_SAVE_ACTION) return { kind: 'save' };
  for (const [prefix, kind] of [[APPLY_PREFIX, 'apply'], [DELETE_PREFIX, 'delete']] as const) {
    if (!action.startsWith(prefix)) continue;
    const rest = action.slice(prefix.length);
    if (!/^(0|[1-9]\d?)$/.test(rest)) return null;
    return { kind, index: Number(rest) };
  }
  return null;
}

type Key =
  | 'vw.title'
  | 'vw.durable'
  | 'vw.session'
  | 'vw.none'
  | 'vw.save'
  | 'vw.saveHint'
  | 'vw.apply'
  | 'vw.delete'
  | 'vw.label.join'
  | 'vw.named'
  | 'vw.count.one'
  | 'vw.count.other'
  | 'vw.nameLabel'
  | 'vw.nameHelp'
  | 'vw.said.saved'
  | 'vw.said.exists'
  | 'vw.said.empty'
  | 'vw.said.full'
  | 'vw.said.failed'
  | 'vw.said.deleted';

const MESSAGES: Messages<Key> = {
  en: {
    'vw.title': 'Saved views',
    'vw.durable': 'A saved view keeps the filters you have chosen. Views are kept on this device only.',
    'vw.session': 'A saved view keeps the filters you have chosen. Views are kept until you leave this page.',
    'vw.none': 'No view is saved yet.',
    'vw.save': 'Save the current filters as a view',
    'vw.saveHint': 'Choose at least one filter to save a view.',
    'vw.apply': 'Show view. {label}',
    'vw.delete': 'Delete view. {label}',
    'vw.label.join': ', ',
    'vw.named': '{name} ({filters})',
    'vw.count.one': 'Lists {n} source now.',
    'vw.count.other': 'Lists {n} sources now.',
    'vw.nameLabel': 'Name for the view (optional)',
    'vw.nameHelp': 'Up to {max} characters. Without a name, the view is described by its filters.',
    'vw.said.saved': 'View saved.',
    'vw.said.exists': 'This view is already saved.',
    'vw.said.empty': 'There is no filter to save.',
    'vw.said.full': 'The list of saved views is full. Delete one to save another.',
    'vw.said.failed': 'The view could not be saved on this device.',
    'vw.said.deleted': 'View deleted.',
  },
  fr: {
    'vw.title': 'Vues enregistrées',
    'vw.durable': 'Une vue enregistrée conserve les filtres que vous avez choisis. Les vues sont conservées sur cet appareil seulement.',
    'vw.session': 'Une vue enregistrée conserve les filtres que vous avez choisis. Les vues sont conservées jusqu’à ce que vous quittiez cette page.',
    'vw.none': 'Aucune vue n’est encore enregistrée.',
    'vw.save': 'Enregistrer les filtres actuels comme vue',
    'vw.saveHint': 'Choisissez au moins un filtre pour enregistrer une vue.',
    'vw.apply': 'Afficher la vue. {label}',
    'vw.delete': 'Supprimer la vue. {label}',
    'vw.label.join': ', ',
    'vw.named': '{name} ({filters})',
    'vw.count.one': 'Présente {n} source actuellement.',
    'vw.count.other': 'Présente {n} sources actuellement.',
    'vw.nameLabel': 'Nom de la vue (facultatif)',
    'vw.nameHelp': 'Jusqu’à {max} caractères. Sans nom, la vue est décrite par ses filtres.',
    'vw.said.saved': 'Vue enregistrée.',
    'vw.said.exists': 'Cette vue est déjà enregistrée.',
    'vw.said.empty': 'Il n’y a aucun filtre à enregistrer.',
    'vw.said.full': 'La liste des vues enregistrées est pleine. Supprimez-en une pour en enregistrer une autre.',
    'vw.said.failed': 'La vue n’a pas pu être enregistrée sur cet appareil.',
    'vw.said.deleted': 'Vue supprimée.',
  },
};

export const SAVED_VIEW_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** What a view keeps, in words. */
export function viewLabel(query: string, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string {
  return listActiveFilters(parseFilters(query), locale, datasetNames)
    .map((a) => a.label)
    .join(tx(locale, 'vw.label.join'));
}

/** A view in words: its name with its filters in brackets, or just its filters when it has no name. */
export function savedViewLabel(v: SavedView, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string {
  const filters = viewLabel(v.query, locale, datasetNames);
  return v.name === null ? filters : tx(locale, 'vw.named', { name: v.name, filters });
}

export function describeSaveOutcome(outcome: SaveOutcome, locale: Locale): string {
  return tx(locale, `vw.said.${outcome}`);
}

export function describeViewDeleted(locale: Locale): string {
  return tx(locale, 'vw.said.deleted');
}

export interface SavedViewsRenderOptions {
  durable: boolean;
  /** The filters in force, so the matching view can be marked as shown and saving can be offered. */
  active: Filters;
  datasetNames?: ReadonlyMap<string, string>;
  buttonStyle?: string;
  /** How many sources a view's filters list right now. When given, each view states its count. */
  countFor?: (filters: Filters) => number;
  /** What has been typed in the name field so far, so a redraw does not lose it. */
  draftName?: string;
}

const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';
const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';

export function renderSavedViewsHtml(views: readonly SavedView[], locale: Locale, opts: SavedViewsRenderOptions): string {
  const style = opts.buttonStyle ?? DEFAULT_BUTTON_STYLE;
  const current = viewQuery(opts.active);
  const saved = views.some((v) => v.query === current);
  const canSave = current !== '' && !saved && views.length < MAX_SAVED_VIEWS;
  const nameField =
    `<div><label for="ds-view-name">${escapeHtml(tx(locale, 'vw.nameLabel'))}</label> ` +
    `<input id="ds-view-name" type="text" data-filter="viewName" maxlength="${MAX_VIEW_NAME_LENGTH}" autocomplete="off" aria-describedby="ds-view-name-help" value="${escapeHtml(opts.draftName ?? '')}" style="${FIELD_STYLE}"> ` +
    `<span id="ds-view-name-help">${escapeHtml(tx(locale, 'vw.nameHelp', { max: MAX_VIEW_NAME_LENGTH }))}</span></div>`;
  const save = canSave
    ? `${nameField}<p><button type="button" data-action="${VIEW_SAVE_ACTION}" style="${style}">${escapeHtml(tx(locale, 'vw.save'))}</button></p>`
    : current === ''
      ? `<p>${escapeHtml(tx(locale, 'vw.saveHint'))}</p>`
      : saved
        ? `<p>${escapeHtml(tx(locale, 'vw.said.exists'))}</p>`
        : `<p>${escapeHtml(tx(locale, 'vw.said.full'))}</p>`;
  const list =
    views.length === 0
      ? `<p>${escapeHtml(tx(locale, 'vw.none'))}</p>`
      : `<ul style="list-style:none;padding:0">${views
          .map((v, i) => {
            const q = v.query;
            const label = savedViewLabel(v, locale, opts.datasetNames);
            const count = opts.countFor ? `<span style="align-self:center">${escapeHtml(tx.count(locale, 'vw.count', opts.countFor(parseFilters(q))))}</span>` : '';
            return (
              `<li style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px">` +
              `<button type="button" data-action="${viewApplyAction(i)}" aria-pressed="${q === current ? 'true' : 'false'}" style="${style}">${escapeHtml(tx(locale, 'vw.apply', { label }))}</button>` +
              `<button type="button" data-action="${viewDeleteAction(i)}" style="${style}">${escapeHtml(tx(locale, 'vw.delete', { label }))}</button>${count}</li>`
            );
          })
          .join('')}</ul>`;
  return (
    `<section aria-labelledby="ds-views-title"><h2 id="ds-views-title">${escapeHtml(tx(locale, 'vw.title'))}</h2>` +
    `<p>${escapeHtml(tx(locale, opts.durable ? 'vw.durable' : 'vw.session'))}</p>${save}${list}</section>`
  );
}
