import { describe, expect, it } from 'vitest';
import { applyChrome, bootstrap, pickLocale, type BootDeps, type DocLike } from './bootstrap';
import { createSnapshot, createSnapshotStore, lintFrench, scanHtml, visibleText } from '../index';
import { FakeHost, NOW, RECORDS, memoryStorage } from '../testkit';
import { SAVED_VIEWS_KEY, VIEW_SAVE_ACTION } from '../savedViews';

const REGISTRY = JSON.stringify([
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      { id: 'a', name: 'Alpha', source: 'A', licence: 'CC BY 4.0', retrievedAt: '2026-11-01' },
      { id: 'b', name: 'Beta', source: 'B', licence: 'OGL-Ontario', retrievedAt: '2024-01-01' },
    ],
  },
]);

function fakeDoc(): DocLike & { els: Record<string, { textContent: string | null }> } {
  const els = { 'page-title': { textContent: '' }, 'skip-link': { textContent: '' } };
  return {
    documentElement: { lang: '' },
    title: '',
    getElementById: (id) => (id in els ? els[id as keyof typeof els] : null),
    els,
  };
}

type D = BootDeps & { host: FakeHost; doc: ReturnType<typeof fakeDoc>; storage: ReturnType<typeof memoryStorage> };

const deps = (over: Partial<BootDeps> = {}): D =>
  ({
    host: new FakeHost(),
    doc: fakeDoc(),
    fetchText: async () => REGISTRY,
    storage: memoryStorage(),
    search: '',
    pathname: '/data-status',
    now: () => NOW,
    ...over,
  }) as D;

describe('pickLocale', () => {
  it('the path wins, then ?lang=, then the browser, then English', () => {
    expect(pickLocale('/fr/data-status', '?lang=en', 'en-US')).toBe('fr');
    expect(pickLocale('/data-status', '?lang=fr', 'en-US')).toBe('fr');
    expect(pickLocale('/data-status', '', 'fr-CA')).toBe('fr');
    expect(pickLocale('/data-status', '', 'de')).toBe('en');
    expect(pickLocale('/data-status', '', null)).toBe('en');
    expect(pickLocale('/data-status', '?lang=xx', 'fr')).toBe('en');
  });
});

describe('applyChrome', () => {
  it('sets language, title and the visible heading and skip text', () => {
    const doc = fakeDoc();
    applyChrome(doc, 'fr');
    expect(doc.documentElement.lang).toBe('fr');
    expect(doc.title).toBe('Sources et qualité des données');
    expect(doc.els['page-title']?.textContent).toBe('Sources et qualité des données');
    expect(doc.els['skip-link']?.textContent).toBe('Passer au contenu principal');
  });

  it('tolerates a page without those elements', () => {
    const doc: DocLike = { documentElement: { lang: '' }, title: '', getElementById: () => null };
    expect(() => applyChrome(doc, 'en')).not.toThrow();
    expect(doc.title).toBe('Data sources and quality');
  });
});

describe('bootstrap: live data', () => {
  it('shows a loading message first, then the panel, and saves an offline copy', async () => {
    const d = deps();
    let release: (v: string) => void = () => undefined;
    const pending = new Promise<string>((r) => (release = r));
    const run = bootstrap({ ...d, fetchText: () => pending });
    expect(d.host.innerHTML).toContain('Loading data sources…');
    release(REGISTRY);
    const result = await run;
    expect(result.source).toBe('live');
    expect(d.host.innerHTML).toContain('Data quality overview');
    expect(d.doc.documentElement.lang).toBe('en');
    expect(createSnapshotStore(d.storage).load().ok).toBe(true);
  });

  it('requests the registry URL it is given (default registry.json)', async () => {
    const urls: string[] = [];
    await bootstrap(deps({ fetchText: async (u) => (urls.push(u), REGISTRY) }));
    await bootstrap(deps({ registryUrl: '/data/registry.json', fetchText: async (u) => (urls.push(u), REGISTRY) }));
    expect(urls).toEqual(['registry.json', '/data/registry.json']);
  });

  it('reports licence names it recognised, as a notice in the page language', async () => {
    const d = deps({ pathname: '/fr/data-status' });
    const r = await bootstrap(d);
    expect(r.locale).toBe('fr');
    expect(r.issues).toHaveLength(1);
    expect(d.host.innerHTML).toContain('licence reconnue comme CC-BY-4.0');
    expect(d.host.innerHTML).toContain('Aperçu de la qualité des données');
  });

  it('applies filters from the URL and reports changes back as a query string', async () => {
    const d = deps({ search: '?state=stale' });
    const searches: string[] = [];
    const r = await bootstrap({ ...d, onSearchChange: (s) => searches.push(s) });
    expect(d.host.innerHTML).toContain('1 of 2 sources shown');
    d.host.filter('change', 'state', 'fresh');
    expect(searches).toEqual(['?state=fresh']);
    expect(r.panel.getFilters().state).toBe('fresh');
  });

  it('exports the CSV through the supplied callback', async () => {
    const d = deps();
    const csv: string[] = [];
    await bootstrap({ ...d, onExport: (c) => csv.push(c) });
    d.host.click('export-csv');
    expect(csv[0]).toContain('CC-BY-4.0');
  });

  it('renders clean EN and FR output', async () => {
    for (const pathname of ['/en/data-status', '/fr/data-status']) {
      const d = deps({ pathname });
      await bootstrap(d);
      expect(scanHtml(d.host.innerHTML)).toEqual([]);
      if (pathname.startsWith('/fr')) expect(lintFrench(visibleText(d.host.innerHTML))).toEqual([]);
    }
  });
});

describe('bootstrap: offline and bad input', () => {
  it('falls back to the saved copy when the fetch fails', async () => {
    const storage = memoryStorage();
    createSnapshotStore(storage).save(createSnapshot(RECORDS, new Date('2026-11-10T00:00:00Z')));
    const d = deps({
      storage,
      fetchText: async () => {
        throw new Error('offline');
      },
    });
    const r = await bootstrap(d);
    expect(r.source).toBe('saved-or-none');
    expect(d.host.innerHTML).toContain('Showing the saved copy because the data could not be loaded.');
    expect(d.host.innerHTML).toContain('Saved copy from November 10, 2026');
    expect(d.host.innerHTML).toContain('Alpha');
  });

  it('says there is no saved copy when offline on a first visit, and shows no data', async () => {
    const d = deps({
      pathname: '/fr/data-status',
      fetchText: async () => {
        throw new Error('offline');
      },
    });
    await bootstrap(d);
    expect(d.host.innerHTML).toContain('Aucune copie enregistrée');
    expect(d.host.innerHTML).toContain('Aucun élément à examiner dans les données fournies.');
  });

  it('invalid JSON is reported and does not erase the saved copy', async () => {
    const storage = memoryStorage();
    const store = createSnapshotStore(storage);
    store.save(createSnapshot(RECORDS, new Date('2026-11-10T00:00:00Z')));
    const d = deps({ storage, fetchText: async () => '{oops' });
    const r = await bootstrap(d);
    expect(r.issues.map((i) => i.code)).toEqual(['not-json']);
    expect(d.host.innerHTML).toContain('The registry file is not valid JSON.');
    expect(d.host.innerHTML).toContain('Alpha');
    expect(store.load().ok).toBe(true);
  });

  it('a registry that is not a list is unusable but does not throw', async () => {
    const d = deps({ fetchText: async () => '{"hello":1}' });
    const r = await bootstrap(d);
    expect(r.source).toBe('saved-or-none');
    expect(r.issues.map((i) => i.code)).toEqual(['not-array']);
  });

  it('works without any storage', async () => {
    const d = deps({ storage: null });
    const r = await bootstrap(d);
    expect(r.source).toBe('live');
    expect(d.host.innerHTML).toContain('Alpha');
  });
});

describe('bootstrap: saved views', () => {
  it('keeps saved views on the device when storage is available, and offers them on the next visit', async () => {
    const d = deps({ search: '?state=stale' });
    await bootstrap(d);
    expect(d.host.innerHTML).toContain('Views are kept on this device only.');
    d.host.click(VIEW_SAVE_ACTION);
    expect(JSON.parse(d.storage.map.get(SAVED_VIEWS_KEY) ?? 'null')).toEqual(['?state=stale']);
    const again = deps({ storage: d.storage });
    await bootstrap(again);
    expect(again.host.innerHTML).toContain('Show view. Status: May be out of date');
  });
  it('keeps them for the page only when storage is not available', async () => {
    const d = deps({ storage: null, search: '?state=stale' });
    await bootstrap(d);
    expect(d.host.innerHTML).toContain('Views are kept until you leave this page.');
    d.host.click(VIEW_SAVE_ACTION);
    expect(d.host.innerHTML).toContain('Show view. Status: May be out of date');
  });
  it('ignores a saved list that is not readable', async () => {
    const storage = memoryStorage();
    storage.setItem(SAVED_VIEWS_KEY, '{broken');
    const d = deps({ storage });
    await bootstrap(d);
    expect(d.host.innerHTML).toContain('No view is saved yet.');
  });
});

describe('bootstrap: order of the list', () => {
  it('starts in the order named in the address, and writes a new order back to it', async () => {
    const searches: string[] = [];
    const d = deps({ search: '?sort=licence&dir=desc', onSearchChange: (s) => searches.push(s) });
    const out = await bootstrap(d);
    expect(out.panel.getSort()).toEqual({ key: 'licence', dir: 'desc' });
    expect(d.host.innerHTML).toContain('<option value="licence:desc" selected>');
    d.host.filter('change', 'sort', 'source:asc');
    expect(searches.at(-1)).toBe('?sort=source');
  });
  it('ignores an order it cannot read', async () => {
    const out = await bootstrap(deps({ search: '?sort=bogus' }));
    expect(out.panel.getSort()).toBeNull();
  });
});

