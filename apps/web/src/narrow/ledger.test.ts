import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { ageBuckets, daysSince, describeAges, EMPTY_LEDGER, oldestFailures, openSince, parseLedger, updateLedger, type Ledger } from './ledger.js';
import { found, nov, reportOf, route, smallSite } from './report-fixtures.js';

const T = (day: number): string => nov(day).toISOString();

describe('updateLedger', () => {
  it('adds every finding with the time of the report', () => {
    const l = updateLedger(EMPTY_LEDGER, smallSite(10));
    expect(l.version).toBe(1);
    expect(l.entries).toHaveLength(5);
    for (const e of l.entries) expect([e.firstSeen, e.lastSeen]).toEqual([T(10), T(10)]);
    expect(l.entries.find((e) => e.id === 'p[3]')).toEqual({ key: '/|contrast|low|p[3]', route: '/', rule: 'contrast/low', id: 'p[3]', status: 'fail', firstSeen: T(10), lastSeen: T(10) });
  });
  it('keeps the first date of a finding that is still reported, and moves the last date', () => {
    const l = updateLedger(updateLedger(EMPTY_LEDGER, smallSite(10)), smallSite(15));
    expect(l.entries).toHaveLength(5);
    for (const e of l.entries) expect([e.firstSeen, e.lastSeen]).toEqual([T(10), T(15)]);
  });
  it('drops a finding when its check ran on its route and did not report it', () => {
    const first = updateLedger(EMPTY_LEDGER, smallSite(10));
    const fixed = reportOf([route('/', { contrast: { checked: 20, entries: [found('contrast', 'low', 'fail', 'p[3]')] }, images: { checked: 4, entries: [] } }), route('/help', { links: { checked: 6, entries: [] } })], 15);
    expect(updateLedger(first, fixed).entries.map((e) => e.id)).toEqual(['p[3]']);
  });
  it('keeps a finding as it was when its check or its route was not part of the run', () => {
    const first = updateLedger(EMPTY_LEDGER, smallSite(10));
    const partial = reportOf([route('/', { images: { checked: 4, entries: [] } })], 15);
    const l = updateLedger(first, partial);
    expect(l.entries.map((e) => e.id).sort()).toEqual(['a#nav-help', 'a[2]', 'h1[0]', 'p[3]']);
    for (const e of l.entries) expect(e.lastSeen).toBe(T(10));
  });
  it('records when an unknown became a failure, and keeps that date afterwards', () => {
    const asUnknown = reportOf([route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'unknown', 'p')] } })], 5);
    const asFail = (day: number) => reportOf([route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'fail', 'p')] } })], day);
    const l = updateLedger(updateLedger(updateLedger(EMPTY_LEDGER, asUnknown), asFail(12)), asFail(18));
    expect(l.entries[0]).toMatchObject({ status: 'fail', firstSeen: T(5), failSince: T(12), lastSeen: T(18) });
    expect(openSince(l.entries[0] as never)).toBe(T(12));
  });
  it('forgets the failure date when a failure goes back to unknown', () => {
    const fail = reportOf([route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'fail', 'p')] } })], 5);
    const unknown = reportOf([route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'unknown', 'p')] } })], 9);
    const e = updateLedger(updateLedger(EMPTY_LEDGER, fail), unknown).entries[0];
    expect(e?.status).toBe('unknown');
    expect(e?.failSince).toBeUndefined();
    expect(openSince(e as never)).toBeNull();
  });
  it('counts a finding once when a route was audited in several profiles, with the worse status', () => {
    const report = reportOf([route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'unknown', 'p')] } }, 320), route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'fail', 'p')] } }, 640)], 10);
    const l = updateLedger(EMPTY_LEDGER, report);
    expect(l.entries).toHaveLength(1);
    expect(l.entries[0]?.status).toBe('fail');
  });
  it('sorts entries by key, so the file changes little between runs, and leaves the old ledger alone', () => {
    const first = updateLedger(EMPTY_LEDGER, smallSite(10));
    const before = JSON.stringify(first);
    const second = updateLedger(first, smallSite(11));
    expect(second.entries.map((e) => e.key)).toEqual([...second.entries.map((e) => e.key)].sort((a, b) => a.localeCompare(b)));
    expect(JSON.stringify(first)).toBe(before);
  });
});

describe('parseLedger', () => {
  it('reads back what was written', () => {
    const l = updateLedger(EMPTY_LEDGER, smallSite(10));
    expect(parseLedger(JSON.stringify(l))).toEqual({ ok: true, value: l });
    expect(parseLedger(JSON.stringify(EMPTY_LEDGER))).toEqual({ ok: true, value: EMPTY_LEDGER });
  });
  const entry = { key: '/|contrast|low|p', route: '/', rule: 'contrast/low', id: 'p', status: 'fail', firstSeen: T(1), lastSeen: T(2) };
  it.each([
    ['not json', 'not valid JSON', 'JSON valide'],
    ['null', 'needs version 1', 'version 1'],
    ['{"version":2,"entries":[]}', 'needs version 1', 'version 1'],
    ['{"version":1}', 'needs version 1', 'version 1'],
    [JSON.stringify({ version: 1, entries: [null] }), 'Entry 1', 'L’entrée 1'],
    [JSON.stringify({ version: 1, entries: [{ ...entry, status: 'pass' }] }), 'Entry 1', 'L’entrée 1'],
    [JSON.stringify({ version: 1, entries: [entry, { ...entry, firstSeen: 'soon' }] }), 'Entry 2', 'L’entrée 2'],
    [JSON.stringify({ version: 1, entries: [{ ...entry, failSince: 7 }] }), 'Entry 1', 'L’entrée 1'],
    [JSON.stringify({ version: 1, entries: [{ ...entry, firstSeen: T(3) }] }), 'last seen before it was first seen', 'avant sa première observation'],
  ])('rejects %s in both languages', (text, en, fr) => {
    const p = parseLedger(text);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.error.en).toContain(en);
      expect(p.error.fr).toContain(fr);
      expect(frTypographyIssues(p.error.fr), p.error.fr).toEqual([]);
    }
  });
  it('never accepts a pass status', () => {
    expect(parseLedger(JSON.stringify({ version: 1, entries: [{ ...entry, status: 'pass' }] })).ok).toBe(false);
  });
});

describe('ages', () => {
  const ledger: Ledger = {
    version: 1,
    entries: [
      { key: 'a', route: '/', rule: 'contrast/low', id: 'a', status: 'fail', firstSeen: T(18), lastSeen: T(19) },
      { key: 'b', route: '/', rule: 'contrast/low', id: 'b', status: 'fail', firstSeen: T(1), lastSeen: T(19) },
      { key: 'c', route: '/help', rule: 'name/empty', id: 'c', status: 'fail', firstSeen: new Date(Date.UTC(2026, 6, 1)).toISOString(), lastSeen: T(19) },
      { key: 'd', route: '/', rule: 'images/alt-generic', id: 'd', status: 'unknown', firstSeen: T(1), lastSeen: T(19) },
      { key: 'e', route: '/', rule: 'contrast/low', id: 'e', status: 'fail', firstSeen: T(1), failSince: T(10), lastSeen: T(19) },
    ],
  };
  it('counts whole days and never goes negative', () => {
    expect(daysSince(T(18), nov(19))).toBe(1);
    expect(daysSince(T(19), nov(19, 23))).toBe(0);
    expect(daysSince(T(1), nov(19))).toBe(18);
    expect(daysSince(T(25), nov(19))).toBe(0);
  });
  it('lists failures oldest first and leaves unknowns out', () => {
    expect(oldestFailures(ledger, nov(19)).map((f) => [f.entry.id, f.days])).toEqual([['c', 141], ['b', 18], ['e', 9], ['a', 1]]);
  });
  it('puts failures in age buckets', () => {
    expect(ageBuckets(ledger, nov(19))).toEqual([
      { from: 0, to: 7, count: 1 },
      { from: 7, to: 30, count: 2 },
      { from: 30, to: 90, count: 0 },
      { from: 90, to: null, count: 1 },
    ]);
  });
  it('takes other limits, sorted and without repeats or bad values', () => {
    expect(ageBuckets(ledger, nov(19), [30, 10, 10, -5, Number.NaN]).map((b) => [b.from, b.to, b.count])).toEqual([[0, 10, 2], [10, 30, 1], [30, null, 1]]);
    expect(ageBuckets(ledger, nov(19), []).map((b) => [b.from, b.to, b.count])).toEqual([[0, null, 4]]);
  });
});

describe('describeAges', () => {
  const ledger = updateLedger(updateLedger(EMPTY_LEDGER, smallSite(1)), smallSite(19));
  const en = describeAges(ledger, nov(19), 'en');
  const fr = describeAges(ledger, nov(19), 'fr');
  it('says how many failures are open and what an age means', () => {
    expect(en.split('\n')[0]).toBe('2 failures are open. Age counts from when the tool first saw the finding, not from when the problem appeared.');
    expect(fr.split('\n')[0]).toBe('2 anomalies à corriger sont ouvertes. L’âge compte depuis la première observation par l’outil, pas depuis l’apparition du problème.');
  });
  it('lists the buckets that hold something, then the oldest failures', () => {
    expect(en).toContain('\n  7 to 29 days: 2\n');
    expect(en).not.toContain('0 to 6 days');
    expect(en).toContain('Oldest:\n  18 days: contrast/low a#nav-help on /\n  18 days: contrast/low p[3] on /\n');
    expect(fr).toContain('\n  de 7 à 29 jours\u00A0: 2\n');
    expect(fr).toContain('Les plus anciennes\u00A0:\n  18 jours\u00A0: contrast/low a#nav-help sur /\n');
  });
  it('cuts the list and uses the singular', () => {
    expect(describeAges(ledger, nov(19), 'en', 1)).toContain('  … and 1 more.');
    const one = updateLedger(EMPTY_LEDGER, reportOf([route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'fail', 'p')] } })], 18));
    expect(describeAges(one, nov(19), 'en')).toContain('1 failure is open.');
    expect(describeAges(one, nov(19), 'en')).toContain('  1 day: contrast/low p on /');
    expect(describeAges(one, nov(19), 'fr')).toContain('1 anomalie à corriger est ouverte.');
    expect(describeAges(one, nov(19), 'fr')).toContain('  1 jour\u00A0: contrast/low p sur /');
  });
  it('does not word an empty ledger as a pass', () => {
    const text = describeAges(EMPTY_LEDGER, nov(19), 'en');
    expect(text).toBe('The ledger holds no failure. It only knows what the checks reported.\n');
    expect(describeAges(EMPTY_LEDGER, nov(19), 'fr')).toContain('Il ne connaît que ce que les contrôles ont signalé.');
  });
  it('follows French typography', () => {
    for (const line of fr.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });
});
