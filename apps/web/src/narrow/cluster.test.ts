import { describe, expect, it } from 'vitest';
import { clusterFindings, describeShared, sharedFindings, summariseClusters } from './cluster.js';
import { scanCopy } from './copylint.js';
import { at, finding, routeOf, siteReport } from './findings-testkit.js';
import { frTypographyIssues } from './i18n.js';
import { makeReport, totals } from './report.js';

describe('clusterFindings', () => {
  it('groups the same finding across routes, most widespread first', () => {
    const c = clusterFindings(siteReport());
    expect(c.map((x) => [x.entry.rule, x.entry.id, x.routes])).toEqual([
      ['low', 'a#nav-help', ['/', '/help', '/map']],
      ['alt-generic', 'img#logo', ['/', '/help']],
      ['low', 'p[3]', ['/']],
    ]);
  });
  it('keeps findings apart when the element, the rule or the message differs', () => {
    const report = makeReport(
      [
        routeOf('/a', { contrast: { checked: 3, entries: [finding('contrast', 'low', 'fail', 'p', 'Ratio 2.1'), finding('contrast', 'image', 'unknown', 'p', 'Ratio 2.1')] } }),
        routeOf('/b', { contrast: { checked: 3, entries: [finding('contrast', 'low', 'fail', 'p', 'Ratio 3.0'), finding('contrast', 'low', 'fail', 'q', 'Ratio 2.1')] } }),
      ],
      at(19),
    );
    expect(clusterFindings(report)).toHaveLength(4);
    expect(sharedFindings(report)).toEqual([]);
  });
  it('counts a route once when it was audited in several profiles, and keeps the worse status', () => {
    const report = makeReport(
      [
        routeOf('/', { contrast: { checked: 1, entries: [finding('contrast', 'low', 'unknown', 'p')] } }, 320),
        routeOf('/', { contrast: { checked: 1, entries: [finding('contrast', 'low', 'fail', 'p')] } }, 640),
        routeOf('/b', { contrast: { checked: 1, entries: [finding('contrast', 'low', 'unknown', 'p')] } }, 320),
      ],
      at(19),
    );
    const c = clusterFindings(report);
    expect(c).toHaveLength(1);
    expect(c[0]?.routes).toEqual(['/', '/b']);
    expect(c[0]?.entry.status).toBe('fail');
  });
  it('orders ties by failures first, then rule, then element', () => {
    const report = makeReport(
      [routeOf('/', { contrast: { checked: 4, entries: [finding('contrast', 'low', 'unknown', 'z'), finding('contrast', 'low', 'fail', 'b'), finding('contrast', 'image', 'fail', 'c'), finding('contrast', 'low', 'fail', 'a')] } })],
      at(19),
    );
    expect(clusterFindings(report).map((x) => `${x.entry.status} ${x.entry.rule} ${x.entry.id}`)).toEqual(['fail image c', 'fail low a', 'fail low b', 'unknown low z']);
  });
  it('is empty for a report with no finding, and does not change the report', () => {
    expect(clusterFindings(makeReport([], at(19)))).toEqual([]);
    const r = siteReport();
    const before = JSON.stringify(r);
    clusterFindings(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe('sharedFindings', () => {
  it('keeps findings seen on two routes or more by default', () => {
    expect(sharedFindings(siteReport()).map((c) => c.entry.id)).toEqual(['a#nav-help', 'img#logo']);
  });
  it('takes a higher threshold, and never one under two', () => {
    expect(sharedFindings(siteReport(), 3).map((c) => c.entry.id)).toEqual(['a#nav-help']);
    expect(sharedFindings(siteReport(), 4)).toEqual([]);
    expect(sharedFindings(siteReport(), 1)).toHaveLength(2);
    expect(sharedFindings(siteReport(), 0)).toHaveLength(2);
  });
});

describe('summariseClusters', () => {
  it('counts findings as the report does, and how many repeat', () => {
    const s = summariseClusters(siteReport());
    expect(s).toEqual({ findings: 6, distinct: 3, shared: 2, inShared: 5 });
    const t = totals(siteReport().routes);
    expect(s.findings).toBe(t.failed + t.unknown);
  });
  it('is all zero for an empty report', () => {
    expect(summariseClusters(makeReport([], at(19)))).toEqual({ findings: 0, distinct: 0, shared: 0, inShared: 0 });
  });
});

describe('describeShared', () => {
  const en = describeShared(siteReport(), 'en');
  const fr = describeShared(siteReport(), 'fr');
  it('says how many findings repeat and that the cause is only likely', () => {
    expect(en.split('\n')[0]).toBe(
      '5 of the 6 findings come from 2 findings that repeat across routes. They are most likely in a shared part of the site: one change may clear them everywhere, which still has to be checked route by route.',
    );
    expect(fr.split('\n')[0]).toBe(
      '5 des 6 anomalies viennent de 2 anomalies répétées sur plusieurs routes. Elles se trouvent sans doute dans une partie commune du site\u00A0: un seul changement peut les régler partout, ce qui reste à contrôler route par route.',
    );
  });
  it('lists the shared findings with their status and routes', () => {
    expect(en).toContain('\n  FAIL contrast/low a#nav-help: 3 routes (/, /help, /map)\n');
    expect(en).toContain('\n  UNKNOWN images/alt-generic img#logo: 2 routes (/, /help)\n');
    expect(fr).toContain('\n  À CORRIGER contrast/low a#nav-help\u00A0: 3 routes (/, /help, /map)\n');
    expect(fr).toContain('\n  INCONNU images/alt-generic img#logo\u00A0: 2 routes (/, /help)\n');
  });
  it('uses the singular for one repeated finding', () => {
    const report = makeReport(['/a', '/b'].map((r) => routeOf(r, { contrast: { checked: 1, entries: [finding('contrast', 'low', 'fail', 'nav')] } })), at(19));
    expect(describeShared(report, 'en')).toContain('2 of the 2 findings come from 1 finding that repeats across routes.');
    expect(describeShared(report, 'fr')).toContain('2 des 2 anomalies viennent de 1 anomalie répétée sur plusieurs routes.');
  });
  it('shows five routes and counts the rest', () => {
    const routes = ['/a', '/b', '/c', '/d', '/e', '/f', '/g'];
    const report = makeReport(routes.map((r) => routeOf(r, { contrast: { checked: 1, entries: [finding('contrast', 'low', 'fail', 'nav')] } })), at(19));
    expect(describeShared(report, 'en')).toContain('7 routes (/a, /b, /c, /d, /e, and 2 more)');
    expect(describeShared(report, 'fr')).toContain('7 routes (/a, /b, /c, /d, /e, et 2 de plus)');
  });
  it('cuts the list at the limit', () => {
    const text = describeShared(siteReport(), 'en', 1);
    expect(text).toContain('a#nav-help');
    expect(text).not.toContain('img#logo');
    expect(text).toContain('  … and 1 more.');
    expect(describeShared(siteReport(), 'fr', 1)).toContain('  … et 1 de plus.');
  });
  it('says so when nothing repeats', () => {
    const report = makeReport([routeOf('/', { contrast: { checked: 1, entries: [finding('contrast', 'low', 'fail', 'p')] } })], at(19));
    expect(describeShared(report, 'en')).toBe('No finding repeats across routes.\n');
    expect(describeShared(report, 'fr')).toBe('Aucune anomalie ne se répète sur plusieurs routes.\n');
  });
  it('follows French typography and the copy rules, and promises no fix', () => {
    for (const line of fr.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
    expect(scanCopy(en.split('\n')[0] ?? '').map((h) => h.rule.id)).toEqual([]);
    expect(scanCopy(fr.split('\n')[0] ?? '').map((h) => h.rule.id)).toEqual([]);
    expect(en).not.toMatch(/\bwill (?:clear|fix)\b|\bfixes\b/i);
    expect(`${en}${fr}`).not.toMatch(/verif|vérif/iu);
  });
});
