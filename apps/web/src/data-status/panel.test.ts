import { describe, expect, it } from 'vitest';
import {
  auditRegistry,
  buildQaReport,
  createSnapshot,
  createSnapshotStore,
  lintFrench,
  mountDataStatusPanel,
  renderDataStatusPanel,
  renderQaReportHtml,
  type DatasetRecord,
  type PanelHost,
  type StorageLike,
} from './index';

const NOW = new Date('2026-11-15T12:00:00Z');
const records: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places <A>',
    kind: 'places',
    sources: [
      { id: 'a', name: 'Alpha', source: 'Publisher A', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', url: 'https://example.org/a' },
      { id: 'b', name: 'Beta', source: 'Publisher B', licence: 'Proprietary', retrievedAt: '2024-01-01' },
    ],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [{ id: 'c' }] },
];

class FakeHost implements PanelHost {
  innerHTML = '';
  attrs: Record<string, string> = {};
  listener: ((ev: unknown) => void) | null = null;
  setAttribute(n: string, v: string) {
    this.attrs[n] = v;
  }
  addEventListener(_t: 'click', l: (ev: unknown) => void) {
    this.listener = l;
  }
  removeEventListener(_t: 'click', l: (ev: unknown) => void) {
    if (this.listener === l) this.listener = null;
  }
  click(action: string) {
    this.listener?.({ target: { closest: () => ({ getAttribute: () => action }) } });
  }
}

function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('QA report', () => {
  const audit = auditRegistry(records, NOW);

  it('counts and items are localized and escaped', () => {
    const en = buildQaReport(audit, 'en');
    expect(en.counts.find((c) => c.key === 'qa.counts.notOpen')?.value).toBe(1);
    expect(en.items[0]?.text).toContain('licence is not on the open list');
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
  it('renders tables, text statuses, time elements and 44px controls', () => {
    const html = renderDataStatusPanel({ records, locale: 'en', now: NOW });
    expect(html).toContain('<caption>Datasets</caption>');
    expect(html).toContain('<caption>Sources</caption>');
    expect(html).toContain('May be out of date');
    expect(html).toContain('Update date unknown');
    expect(html).toContain('<time datetime="2026-11-01">2026-11-01</time>');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.match(/min-height:44px/g)!.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain('data-action="recalculate"');
    expect(html).toContain('data-action="export-csv"');
  });

  it('shows Unknown for a source with no licence or date', () => {
    const html = renderDataStatusPanel({ records, locale: 'fr', now: NOW });
    expect(html).toContain('<td>Inconnu</td>');
    expect(html).toContain('Nom inconnu');
  });

  it('includes coverage only when attributes are given', () => {
    const base = { records, locale: 'en', now: NOW } as const;
    expect(renderDataStatusPanel(base)).not.toContain('Coverage by attribute');
    const html = renderDataStatusPanel({
      ...base,
      attributes: [{ key: 'k', label: { en: 'Feature', fr: 'Caractéristique' } }],
      attributeRecords: [{ k: true }, {}],
    });
    expect(html).toContain('Coverage by attribute (Records: 2)');
    expect(html).toContain('<td>50.0%</td>');
  });

  it('shows the saved-copy line', () => {
    const html = renderDataStatusPanel({ records, locale: 'fr', now: NOW, snapshotSavedAt: '2026-11-10T00:00:00.000Z' });
    expect(html).toContain('Copie enregistrée le 2026-11-10');
  });
});

describe('mountDataStatusPanel', () => {
  it('renders, sets lang/role/label, and re-renders on recalculate', () => {
    const host = new FakeHost();
    let locale: 'en' | 'fr' = 'en';
    mountDataStatusPanel(host, { getRecords: () => records, getLocale: () => locale, now: () => NOW });
    expect(host.attrs).toMatchObject({ lang: 'en', role: 'region', 'aria-label': 'Data quality overview' });
    expect(host.innerHTML).toContain('Data quality overview');
    locale = 'fr';
    host.click('recalculate');
    expect(host.attrs.lang).toBe('fr');
    expect(host.innerHTML).toContain('Aperçu de la qualité des données');
  });

  it('exports CSV through the callback', () => {
    const host = new FakeHost();
    const calls: [string, string][] = [];
    mountDataStatusPanel(host, {
      getRecords: () => records,
      getLocale: () => 'en',
      now: () => NOW,
      onExport: (csv, name) => calls.push([csv, name]),
    });
    host.click('export-csv');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe('data-sources.csv');
    expect(calls[0]?.[0]).toContain('Dataset,Source,Link');
  });

  it('saves a copy when live data loads, and falls back to it offline', () => {
    const store = createSnapshotStore(memoryStorage());
    const online = new FakeHost();
    mountDataStatusPanel(online, { getRecords: () => records, getLocale: () => 'en', now: () => NOW, store });
    expect(store.load().ok).toBe(true);

    const offline = new FakeHost();
    mountDataStatusPanel(offline, {
      getRecords: () => {
        throw new Error('network down');
      },
      getLocale: () => 'en',
      now: () => new Date('2026-11-16T00:00:00Z'),
      store,
    });
    expect(offline.innerHTML).toContain('Saved copy from 2026-11-15');
    expect(offline.innerHTML).toContain('Alpha');
  });

  it('offline with no or unreadable copy shows an honest note and no data', () => {
    const empty = new FakeHost();
    mountDataStatusPanel(empty, {
      getRecords: () => {
        throw new Error('x');
      },
      getLocale: () => 'fr',
      now: () => NOW,
      store: createSnapshotStore(memoryStorage()),
    });
    expect(empty.innerHTML).toContain('Aucune copie enregistrée');
    expect(empty.innerHTML).toContain('Aucun élément à examiner dans les données fournies.');

    const bad = memoryStorage();
    bad.setItem('data-status:snapshot:v1', '{"version":1');
    const broken = new FakeHost();
    mountDataStatusPanel(broken, {
      getRecords: () => {
        throw new Error('x');
      },
      getLocale: () => 'en',
      now: () => NOW,
      store: createSnapshotStore(bad),
    });
    expect(broken.innerHTML).toContain('Saved copy could not be read');
  });

  it('destroy removes the click listener', () => {
    const host = new FakeHost();
    const m = mountDataStatusPanel(host, { getRecords: () => records, getLocale: () => 'en', now: () => NOW });
    expect(host.listener).not.toBeNull();
    m.destroy();
    expect(host.listener).toBeNull();
  });

  it('ignores clicks that are not on an action', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => records, getLocale: () => 'en', now: () => NOW });
    const before = host.innerHTML;
    host.listener?.({});
    host.listener?.({ target: { closest: () => null } });
    expect(host.innerHTML).toBe(before);
  });
});

describe('createSnapshot is used with the same records', () => {
  it('copies by value', () => {
    expect(createSnapshot(records, NOW).records).toEqual(records);
  });
});
