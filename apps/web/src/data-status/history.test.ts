import { describe, expect, it } from 'vitest';
import {
  HISTORY_KEY,
  MAX_HISTORY,
  addEntry,
  auditRegistry,
  createHistoryStore,
  entryFromAudit,
  lintFrench,
  parseHistory,
  renderHistoryHtml,
  scanHtml,
  trend,
  visibleText,
  type HistoryEntry,
} from './index';
import { NOW, RECORDS, memoryStorage, structureProblems } from './testkit';

const entry = (date: string, over: Partial<HistoryEntry['totals']> = {}): HistoryEntry => ({
  date,
  totals: { sources: 3, stale: 1, unknownDate: 1, notOpen: 1, missingDetails: 3, ...over },
});

describe('entryFromAudit', () => {
  it('records the UTC day and the counts, nothing else', () => {
    const e = entryFromAudit(auditRegistry(RECORDS, NOW), NOW);
    expect(e).toEqual(entry('2026-11-15'));
    expect(Object.keys(e)).toEqual(['date', 'totals']);
  });

  it('uses the UTC day even late in a local evening', () => {
    expect(entryFromAudit(auditRegistry([], NOW), new Date('2026-11-16T02:31:00Z')).date).toBe('2026-11-16');
  });
});

describe('addEntry', () => {
  it('replaces the same day (newest wins) and keeps date order', () => {
    const list = addEntry([entry('2026-11-10'), entry('2026-11-12')], entry('2026-11-11'));
    expect(list.map((e) => e.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    const replaced = addEntry(list, entry('2026-11-11', { stale: 9 }));
    expect(replaced).toHaveLength(3);
    expect(replaced[1]?.totals.stale).toBe(9);
  });

  it('keeps only the newest `max` entries', () => {
    let list: HistoryEntry[] = [];
    for (let d = 1; d <= 40; d++) list = addEntry(list, entry(`2026-10-${String(d).padStart(2, '0')}`.replace('2026-10-3', '2026-10-3')));
    expect(list.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(addEntry([entry('2026-11-01'), entry('2026-11-02')], entry('2026-11-03'), 2).map((e) => e.date)).toEqual(['2026-11-02', '2026-11-03']);
  });
});

describe('parseHistory', () => {
  it('accepts a valid list', () => {
    expect(parseHistory(JSON.stringify([entry('2026-11-01')]))).toEqual([entry('2026-11-01')]);
    expect(parseHistory('[]')).toEqual([]);
  });

  it('rejects anything malformed instead of guessing', () => {
    const bad = [
      '{',
      '{}',
      '[null]',
      JSON.stringify([{ date: '2026-11-01' }]),
      JSON.stringify([{ date: 'yesterday', totals: entry('x').totals }]),
      JSON.stringify([{ date: '2026-13-40', totals: entry('x').totals }]),
      JSON.stringify([{ date: '2026-11-01', totals: { ...entry('x').totals, stale: -1 } }]),
      JSON.stringify([{ date: '2026-11-01', totals: { ...entry('x').totals, stale: 1.5 } }]),
      JSON.stringify([{ date: '2026-11-01', totals: { ...entry('x').totals, stale: '1' } }]),
    ];
    for (const b of bad) expect(parseHistory(b), b).toBeNull();
  });

  it('drops extra fields (only counts are kept)', () => {
    const parsed = parseHistory(JSON.stringify([{ date: '2026-11-01', totals: { ...entry('x').totals, secret: 'x' }, note: 'x' }]));
    expect(parsed?.[0]).toEqual(entry('2026-11-01'));
  });
});

describe('createHistoryStore', () => {
  it('records, loads and clears', () => {
    const storage = memoryStorage();
    const store = createHistoryStore(storage);
    expect(store.load()).toEqual([]);
    expect(store.record(entry('2026-11-01'))).toHaveLength(1);
    expect(store.record(entry('2026-11-02'))).toHaveLength(2);
    expect(store.load().map((e) => e.date)).toEqual(['2026-11-01', '2026-11-02']);
    expect(storage.map.has(HISTORY_KEY)).toBe(true);
    store.clear();
    expect(store.load()).toEqual([]);
  });

  it('treats corrupted saved data as empty and starts again', () => {
    const storage = memoryStorage();
    storage.setItem(HISTORY_KEY, 'garbage');
    const store = createHistoryStore(storage);
    expect(store.load()).toEqual([]);
    expect(store.record(entry('2026-11-01'))).toHaveLength(1);
  });

  it('works without storage or with storage that throws', () => {
    expect(createHistoryStore(null).record(entry('2026-11-01'))).toHaveLength(1);
    const boom = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createHistoryStore(boom);
    expect(store.load()).toEqual([]);
    expect(store.record(entry('2026-11-01'))).toHaveLength(1);
    expect(() => store.clear()).not.toThrow();
  });

  it('honours a custom max', () => {
    const store = createHistoryStore(memoryStorage(), HISTORY_KEY, 2);
    store.record(entry('2026-11-01'));
    store.record(entry('2026-11-02'));
    expect(store.record(entry('2026-11-03')).map((e) => e.date)).toEqual(['2026-11-02', '2026-11-03']);
  });
});

describe('trend', () => {
  it('needs two entries and compares the last two with neutral directions', () => {
    expect(trend([entry('2026-11-01')], 'en')).toEqual([]);
    const lines = trend([entry('2026-10-01'), entry('2026-11-01', { stale: 4, unknownDate: 0 })], 'en');
    expect(lines.find((l) => l.key === 'stale')).toMatchObject({ from: 1, to: 4, direction: 'up' });
    expect(lines.find((l) => l.key === 'unknownDate')).toMatchObject({ from: 1, to: 0, direction: 'down' });
    expect(lines.find((l) => l.key === 'sources')).toMatchObject({ direction: 'same' });
  });
});

describe('renderHistoryHtml', () => {
  it('asks for more visits when there are fewer than two entries', () => {
    expect(renderHistoryHtml([entry('2026-11-01')], 'en')).toContain('History appears after visits on two different days.');
    expect(renderHistoryHtml([], 'fr')).toContain('L’historique apparaît après des visites faites deux jours différents.');
  });

  it('shows deltas in words and a table, newest first', () => {
    const html = renderHistoryHtml([entry('2026-10-01'), entry('2026-11-01', { stale: 4 })], 'en');
    expect(html).toContain('Sources possibly out of date: 4 (up from 1)');
    expect(html).toContain('Sources: 3 (unchanged)');
    expect(html.indexOf('2026-11-01')).toBeLessThan(html.indexOf('2026-10-01', html.indexOf('<tbody>')));
    expect(html).toContain('<time datetime="2026-11-01">2026-11-01</time>');
  });

  it('is accessible, free of banned wording, and FR passes the lint', () => {
    const list = [entry('2026-10-01'), entry('2026-11-01', { stale: 0 })];
    for (const l of ['en', 'fr'] as const) {
      const html = renderHistoryHtml(list, l);
      expect(structureProblems(html)).toEqual([]);
      expect(scanHtml(html)).toEqual([]);
      if (l === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
});
