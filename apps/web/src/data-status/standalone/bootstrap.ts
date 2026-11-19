/**
 * Browser bootstrap for the standalone data-status page. All browser globals are
 * passed in, so the whole flow is testable. If the registry cannot be fetched or
 * read, the panel falls back to the offline saved copy (or says there is none).
 */
import type { Locale } from '../dataStatus';
import { t } from '../i18n';
import { parseFilters } from '../filters';
import { localeFromPath, resolveLocale } from '../locale';
import { mountDataStatusPanel, type MountedPanel, type PanelHost } from '../panel';
import { describeLoadIssue, parseRegistryText, type LoadIssue } from '../registryLoader';
import { createSnapshotStore, type StorageLike } from '../snapshot';
import { createSavedViewStore } from '../savedViews';

export interface DocLike {
  documentElement: { lang: string };
  title: string;
  getElementById(id: string): { textContent: string | null } | null;
}

export interface BootDeps {
  host: PanelHost;
  doc: DocLike;
  fetchText: (url: string) => Promise<string>;
  storage: StorageLike | null;
  /** location.search, e.g. "?lang=fr&state=stale". */
  search: string;
  /** location.pathname, e.g. "/fr/data-status". */
  pathname: string;
  /** navigator.language, used when neither the path nor ?lang= names a locale. */
  browserLanguage?: string | null;
  registryUrl?: string;
  now?: () => Date;
  /** history.replaceState wrapper; receives the new query string. */
  onSearchChange?: (search: string) => void;
  onExport?: (csv: string, filename: string) => void;
}

export interface BootResult {
  locale: Locale;
  source: 'live' | 'saved-or-none';
  issues: LoadIssue[];
  panel: MountedPanel;
}

export function pickLocale(pathname: string, search: string, browserLanguage?: string | null): Locale {
  const fromPath = localeFromPath(pathname);
  if (fromPath) return fromPath;
  const lang = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('lang');
  return resolveLocale(lang ?? browserLanguage ?? null, 'en');
}

/** Set the document language, title and the visible heading/skip text. */
export function applyChrome(doc: DocLike, locale: Locale): void {
  doc.documentElement.lang = locale;
  doc.title = t(locale, 'page.title');
  const set = (id: string, text: string) => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  set('page-title', t(locale, 'page.title'));
  set('skip-link', t(locale, 'page.skip'));
}

export async function bootstrap(deps: BootDeps): Promise<BootResult> {
  const locale = pickLocale(deps.pathname, deps.search, deps.browserLanguage);
  applyChrome(deps.doc, locale);
  deps.host.innerHTML = `<p role="status">${t(locale, 'app.loading')}</p>`;

  let records: ReturnType<typeof parseRegistryText>['records'] | null = null;
  let issues: LoadIssue[] = [];
  try {
    const text = await deps.fetchText(deps.registryUrl ?? 'registry.json');
    const parsed = parseRegistryText(text);
    issues = parsed.issues;
    if (parsed.usable) records = parsed.records;
  } catch {
    records = null;
  }

  const panel = mountDataStatusPanel(deps.host, {
    getRecords: () => {
      if (records === null) throw new Error('registry not loaded');
      return records;
    },
    getLocale: () => locale,
    now: deps.now,
    store: createSnapshotStore(deps.storage),
    savedViews: createSavedViewStore(deps.storage),
    initialFilters: parseFilters(deps.search),
    onFiltersChange: deps.onSearchChange,
    onExport: deps.onExport,
    getNotices: (l) => issues.map((i) => describeLoadIssue(i, l)),
  });
  return { locale, source: records === null ? 'saved-or-none' : 'live', issues, panel };
}
