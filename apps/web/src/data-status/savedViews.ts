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

/** Keeps readable, non-empty, distinct views, in order, up to the limit. */
export function cleanViews(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const q = serializeFilters(parseFilters(item));
    if (q === '' || out.includes(q)) continue;
    out.push(q);
    if (out.length === MAX_SAVED_VIEWS) break;
  }
  return out;
}

export interface SavedViewStore {
  /** True when views stay on the device after the page is closed. */
  readonly durable: boolean;
  load(): string[];
  /** Returns false when the list could not be written. */
  save(views: readonly string[]): boolean;
}

/** With a storage object the list is kept on the device; with none it lives in memory for this page only. */
export function createSavedViewStore(storage: StorageLike | null | undefined, key: string = SAVED_VIEWS_KEY): SavedViewStore {
  if (!storage) {
    let memory: string[] = [];
    return {
      durable: false,
      load: () => [...memory],
      save: (views) => {
        memory = cleanViews([...views]);
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
        const clean = cleanViews([...views]);
        if (clean.length === 0) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(clean));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type SaveOutcome = 'saved' | 'exists' | 'empty' | 'full' | 'failed';

/** Adds the current filters as a view. Nothing is written unless the outcome is 'saved'. */
export function addView(store: SavedViewStore, f: Filters): { outcome: SaveOutcome; views: string[] } {
  const views = store.load();
  const q = viewQuery(f);
  if (q === '' || !hasActiveFilters(parseFilters(q))) return { outcome: 'empty', views };
  if (views.includes(q)) return { outcome: 'exists', views };
  if (views.length >= MAX_SAVED_VIEWS) return { outcome: 'full', views };
  const next = [...views, q];
  return store.save(next) ? { outcome: 'saved', views: next } : { outcome: 'failed', views };
}

/** Removes the view at a position. Out-of-range positions change nothing. */
export function removeViewAt(store: SavedViewStore, index: number): { removed: boolean; views: string[] } {
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
}

const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';

export function renderSavedViewsHtml(views: readonly string[], locale: Locale, opts: SavedViewsRenderOptions): string {
  const style = opts.buttonStyle ?? DEFAULT_BUTTON_STYLE;
  const current = viewQuery(opts.active);
  const canSave = current !== '' && !views.includes(current) && views.length < MAX_SAVED_VIEWS;
  const save = canSave
    ? `<p><button type="button" data-action="${VIEW_SAVE_ACTION}" style="${style}">${escapeHtml(tx(locale, 'vw.save'))}</button></p>`
    : current === ''
      ? `<p>${escapeHtml(tx(locale, 'vw.saveHint'))}</p>`
      : views.includes(current)
        ? `<p>${escapeHtml(tx(locale, 'vw.said.exists'))}</p>`
        : `<p>${escapeHtml(tx(locale, 'vw.said.full'))}</p>`;
  const list =
    views.length === 0
      ? `<p>${escapeHtml(tx(locale, 'vw.none'))}</p>`
      : `<ul style="list-style:none;padding:0">${views
          .map((q, i) => {
            const label = viewLabel(q, locale, opts.datasetNames);
            return (
              `<li style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px">` +
              `<button type="button" data-action="${viewApplyAction(i)}" aria-pressed="${q === current ? 'true' : 'false'}" style="${style}">${escapeHtml(tx(locale, 'vw.apply', { label }))}</button>` +
              `<button type="button" data-action="${viewDeleteAction(i)}" style="${style}">${escapeHtml(tx(locale, 'vw.delete', { label }))}</button></li>`
            );
          })
          .join('')}</ul>`;
  return (
    `<section aria-labelledby="ds-views-title"><h2 id="ds-views-title">${escapeHtml(tx(locale, 'vw.title'))}</h2>` +
    `<p>${escapeHtml(tx(locale, opts.durable ? 'vw.durable' : 'vw.session'))}</p>${save}${list}</section>`
  );
}
