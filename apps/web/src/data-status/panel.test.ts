import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  auditRegistry,
  buildQaReport,
  createSnapshot,
  createSnapshotStore,
  lintFrench,
  mountDataStatusPanel,
  renderDataStatusPanel,
  renderFilterControls,
  renderQaReportHtml,
  renderSourcesRegion,
  scanHtml,
  visibleText,
  type DatasetRecord,
} from './index';
import { FakeHost, NOW, RECORDS, memoryStorage, structureProblems, targetsBelow44 } from './testkit';

const records = RECORDS;

describe('QA report', () => {
  const audit = auditRegistry(records, NOW);

  it('counts and items are localized and escaped', () => {
    const en = buildQaReport(audit, 'en');
    expect(en.counts.find((c) => c.key === 'qa.counts.notOpen')?.value).toBe(1);
    expect(en.items[0]?.text).toContain('licence not recognised');
    const html = renderQaReportHtml(en, 'en');
    expect(html).toContain('<h2 id="ds-qa-title">Data quality overview</h2>');
    expect(html).toContain('Places &lt;A&gt; / b');
    expect(html).not.toContain('<A>');
  });

  it('FR items use NBSP before the colon and pass the lint', () => {
    const fr = buildQaReport(audit, 'fr');
    for (const item of fr.items) {
      expect(item.text).toContain('\u00A0: ');
      expect(lintFrench(item.text.replace(/Places <A>/g, 'Places'))).toEqual([]);
    }
  });

  it('says only what was checked when there are no items', () => {
    const empty = buildQaReport(auditRegistry([], NOW), 'en');
    expect(renderQaReportHtml(empty, 'en')).toContain('No items to review in the data provided.');
  });
});

describe('renderDataStatusPanel', () => {
  const en = renderDataStatusPanel({ records, locale: 'en', now: NOW });
  const fr = renderDataStatusPanel({ records, locale: 'fr', now: NOW });

  it('renders every section with text statuses and real dates', () => {
    for (const caption of ['Datasets', 'Sources', 'Credits and licences']) expect(en).toContain(`<caption>${caption}</caption>`);
    expect(en).toContain('May be out of date');
    expect(en).toContain('Update date unknown');
    expect(en).toContain('<time datetime="2026-11-01">November 1, 2026</time>');
    expect(en).toContain('rel="noopener noreferrer"');
    expect(en).toContain('data-action="recalculate"');
    expect(en).toContain('data-action="export-csv"');
    expect(en).toContain('aria-live="polite"');
  });

  it('every control meets the 44px target and the structure is accessible', () => {
    for (const html of [en, fr]) {
      expect(targetsBelow44(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
    }
  });

  it('EN copy has no banned wording and FR text passes the typography lint', () => {
    expect(scanHtml(en)).toEqual([]);
    expect(scanHtml(fr)).toEqual([]);
    expect(lintFrench(visibleText(fr))).toEqual([]);
  });

  it('shows Unknown for a source with no licence or date', () => {
    expect(fr).toContain('<td>Inconnu</td>');
    expect(fr).toContain('Nom inconnu');
  });

  it('includes coverage only when attributes are given, with Unknown shown as Unknown', () => {
    const base = { records, locale: 'en', now: NOW } as const;
    expect(renderDataStatusPanel(base)).not.toContain('Coverage by attribute');
    const html = renderDataStatusPanel({
      ...base,
      attributes: [{ key: 'k', label: { en: 'Feature', fr: 'Caractéristique' } }],
      attributeRecords: [{ k: true }, {}],
    });
    expect(html).toContain('Coverage by attribute (Records: 2)');
    expect(html).toContain('<td>50.0%</td>');
    expect(structureProblems(html)).toEqual([]);
    const none = renderDataStatusPanel({ ...base, locale: 'fr', attributes: [{ key: 'k', label: { en: 'F', fr: 'C' } }], attributeRecords: [] });
    expect(none).toContain('<td>Inconnu</td><td>Inconnu</td>');
  });

  it('shows the saved-copy notice with a readable date', () => {
    const html = renderDataStatusPanel({ records, locale: 'fr', now: NOW, snapshotSavedAt: '2026-11-10T00:00:00.000Z' });
    expect(html).toContain('Affichage de la copie enregistrée');
    expect(html).toContain('Copie enregistrée le 10 novembre 2026');
  });

  it('renders notices and the changes section only when given', () => {
    expect(en).not.toContain('Changes since the saved copy');
    const html = renderDataStatusPanel({ records, locale: 'en', now: NOW, changes: [], notices: ['Note A'] });
    expect(html).toContain('<p role="status">Note A</p>');
    expect(html).toContain('No changes found.');
  });
});

describe('filters in the rendered panel', () => {
  const audit = auditRegistry(records, NOW);

  it('controls reflect the active filters', () => {
    const html = renderFilterControls('en', { state: 'stale', kind: 'places', query: 'be"ta', onlyIssues: true });
    expect(html).toContain('<option value="stale" selected>May be out of date</option>');
    expect(html).toContain('<option value="places" selected>Places</option>');
    expect(html).toContain('value="be&quot;ta"');
    expect(html).toContain(' checked>');
    expect(targetsBelow44(html)).toEqual([]);
  });

  it('region shows a count, a table, or a no-match message (never an empty table)', () => {
    expect(renderSourcesRegion(audit, 'en', NO_FILTERS)).toContain('3 of 3 sources shown');
    const none = renderSourcesRegion(audit, 'fr', { ...NO_FILTERS, query: 'zzz' });
    expect(none).toContain('0 source affichée sur 3');
    expect(none).toContain('Aucune source ne correspond à ces filtres.');
    expect(none).not.toContain('<table');
    const empty = renderSourcesRegion(auditRegistry([], NOW), 'en', NO_FILTERS);
    expect(empty).toContain('0 of 0 sources shown');
    expect(empty).not.toContain('No sources match');
  });
});

describe('mountDataStatusPanel', () => {
  const mount = (host: FakeHost, extra: Partial<Parameters<typeof mountDataStatusPanel>[1]> = {}) =>
    mountDataStatusPanel(host, { getRecords: () => records, getLocale: () => 'en', now: () => NOW, ...extra });

  it('renders, sets lang/role/label, and re-renders on recalculate', () => {
    const host = new FakeHost();
    let locale: 'en' | 'fr' = 'en';
    mount(host, { getLocale: () => locale });
    expect(host.attrs).toMatchObject({ lang: 'en', role: 'region', 'aria-label': 'Data quality overview' });
    locale = 'fr';
    host.click('recalculate');
    expect(host.attrs['lang']).toBe('fr');
    expect(host.innerHTML).toContain('Aperçu de la qualité des données');
  });

  it('exports CSV through the callback', () => {
    const host = new FakeHost();
    const calls: [string, string][] = [];
    mount(host, { onExport: (csv, name) => calls.push([csv, name]) });
    host.click('export-csv');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe('data-sources.csv');
    expect(calls[0]?.[0]).toContain('Dataset,Source,Link');
  });

  it('saves a copy when live data loads, and falls back to it offline', () => {
    const store = createSnapshotStore(memoryStorage());
    mount(new FakeHost(), { store });
    expect(store.load().ok).toBe(true);
    const offline = new FakeHost();
    mount(offline, {
      getRecords: () => {
        throw new Error('network down');
      },
      now: () => new Date('2026-11-16T00:00:00Z'),
      store,
    });
    expect(offline.innerHTML).toContain('Showing the saved copy because the data could not be loaded.');
    expect(offline.innerHTML).toContain('Saved copy from November 15, 2026');
    expect(offline.innerHTML).toContain('Alpha');
  });

  it('offline with no or unreadable copy shows an honest note and no data', () => {
    const empty = new FakeHost();
    mount(empty, {
      getRecords: () => {
        throw new Error('x');
      },
      getLocale: () => 'fr',
      store: createSnapshotStore(memoryStorage()),
    });
    expect(empty.innerHTML).toContain('Aucune copie enregistrée');
    expect(empty.innerHTML).toContain('Aucun élément à examiner dans les données fournies.');

    const bad = memoryStorage();
    bad.setItem('data-status:snapshot:v1', '{"version":1');
    const broken = new FakeHost();
    mount(broken, {
      getRecords: () => {
        throw new Error('x');
      },
      store: createSnapshotStore(bad),
    });
    expect(broken.innerHTML).toContain('Saved copy could not be read');
  });

  it('destroy removes every listener', () => {
    const host = new FakeHost();
    const m = mount(host);
    expect(host.listenerCount).toBe(3);
    m.destroy();
    expect(host.listenerCount).toBe(0);
  });

  it('ignores events that are not on a control', () => {
    const host = new FakeHost();
    mount(host);
    const before = host.innerHTML;
    host.fire('click', {});
    host.fire('click', { target: { closest: () => null } });
    host.fire('input', {});
    host.fire('change', { target: { getAttribute: () => null } });
    host.filter('input', 'unknown-key', 'x');
    expect(host.innerHTML).toBe(before);
    expect(host.region.innerHTML).toBe('');
  });

  describe('filters', () => {
    it('typing updates only the results region, so the search box keeps focus', () => {
      const host = new FakeHost();
      mount(host);
      const before = host.innerHTML;
      host.filter('input', 'query', 'beta');
      expect(host.innerHTML).toBe(before);
      expect(host.region.innerHTML).toContain('1 of 3 sources shown');
      expect(host.region.innerHTML).toContain('Beta');
      expect(host.region.innerHTML).not.toContain('Alpha');
    });

    it('status, type and only-items-to-review filters combine and report the query string', () => {
      const host = new FakeHost();
      const searches: string[] = [];
      const m = mount(host, { onFiltersChange: (s) => searches.push(s) });
      host.filter('change', 'state', 'unknown');
      expect(searches[searches.length - 1]).toBe('?state=unknown');
      host.filter('change', 'kind', 'routes');
      expect(searches[searches.length - 1]).toBe('?state=unknown&kind=routes');
      host.filter('change', 'onlyIssues', '', true);
      expect(searches[searches.length - 1]).toBe('?state=unknown&kind=routes&issues=1');
      expect(host.region.innerHTML).toContain('1 of 3 sources shown');
      expect(m.getFilters()).toEqual({ state: 'unknown', kind: 'routes', query: '', onlyIssues: true });
      host.filter('input', 'query', '  BÉTA ');
      expect(searches[searches.length - 1]).toBe('?state=unknown&kind=routes&q=beta&issues=1');
    });

    it('invalid select values fall back to "all" instead of being trusted', () => {
      const host = new FakeHost();
      const m = mount(host);
      host.filter('change', 'state', 'excellent');
      host.filter('change', 'kind', 'medical');
      expect(m.getFilters()).toMatchObject({ state: 'any', kind: 'any' });
    });

    it('caps the search text length', () => {
      const host = new FakeHost();
      const m = mount(host);
      host.filter('input', 'query', 'x'.repeat(400));
      expect(m.getFilters().query).toHaveLength(100);
    });

    it('starts from initial filters and shows them in the controls', () => {
      const host = new FakeHost();
      mount(host, { initialFilters: { ...NO_FILTERS, state: 'stale' } });
      expect(host.innerHTML).toContain('<option value="stale" selected>');
      expect(host.innerHTML).toContain('1 of 3 sources shown');
    });

    it('reset clears the filters, re-renders and reports an empty query string', () => {
      const host = new FakeHost();
      const searches: string[] = [];
      const m = mount(host, { initialFilters: { ...NO_FILTERS, kind: 'routes' }, onFiltersChange: (s) => searches.push(s) });
      host.click('reset-filters');
      expect(m.getFilters()).toEqual(NO_FILTERS);
      expect(searches).toEqual(['']);
      expect(host.innerHTML).toContain('3 of 3 sources shown');
      host.click('reset-filters');
      expect(searches).toEqual(['']);
    });

    it('falls back to a full render when the host cannot update a region', () => {
      const host = new FakeHost(false);
      mount(host);
      host.filter('change', 'state', 'stale');
      expect(host.innerHTML).toContain('1 of 3 sources shown');
    });

    it('CSV export contains only what the filters show', () => {
      const host = new FakeHost();
      const out: string[] = [];
      mount(host, { onExport: (csv) => out.push(csv) });
      host.filter('input', 'query', 'beta');
      host.click('export-csv');
      expect(out[0]).toContain('Beta');
      expect(out[0]).not.toContain('Alpha');
    });
  });

  describe('changes since the saved copy', () => {
    const older: DatasetRecord[] = [
      { id: 'p', name: 'Places <A>', kind: 'places', sources: [{ id: 'a', name: 'Alpha', source: 'Publisher A', licence: 'CC0-1.0', retrievedAt: '2026-12-01' }] },
      { id: 'gone', name: 'Gone', kind: 'reference', sources: [] },
    ];

    it('lists changes against the copy saved before this visit', () => {
      const storage = memoryStorage();
      const store = createSnapshotStore(storage);
      store.save(createSnapshot(older, new Date('2026-11-01T00:00:00Z')));
      const host = new FakeHost();
      mount(host, { store });
      expect(host.innerHTML).toContain('Changes since the saved copy');
      expect(host.innerHTML).toContain('Gone: dataset removed');
      expect(host.innerHTML).toContain('Places &lt;A&gt; / a: licence changed from CC0-1.0 to OGL-Ontario');
      expect(host.innerHTML).toContain('retrieved date moved earlier, from 2026-12-01 to 2026-11-01');
    });

    it('keeps showing them on recalculate (the baseline is the copy from before this visit)', () => {
      const store = createSnapshotStore(memoryStorage());
      store.save(createSnapshot(older, new Date('2026-11-01T00:00:00Z')));
      const host = new FakeHost();
      mount(host, { store });
      host.click('recalculate');
      expect(host.innerHTML).toContain('Gone: dataset removed');
    });

    it('is hidden on a first visit (no earlier copy) and when the copy is unreadable', () => {
      const first = new FakeHost();
      mount(first, { store: createSnapshotStore(memoryStorage()) });
      expect(first.innerHTML).not.toContain('Changes since the saved copy');
      const bad = memoryStorage();
      bad.setItem('data-status:snapshot:v1', 'garbage');
      const host = new FakeHost();
      mount(host, { store: createSnapshotStore(bad) });
      expect(host.innerHTML).not.toContain('Changes since the saved copy');
    });

    it('says so when nothing changed', () => {
      const store = createSnapshotStore(memoryStorage());
      store.save(createSnapshot(records, new Date('2026-11-01T00:00:00Z')));
      const host = new FakeHost();
      mount(host, { store });
      expect(host.innerHTML).toContain('No changes found.');
    });
  });

  it('shows extra notices in the active locale', () => {
    const host = new FakeHost();
    mount(host, { getLocale: () => 'fr', getNotices: (l) => [`notice ${l}`] });
    expect(host.innerHTML).toContain('<p role="status">notice fr</p>');
  });
});
