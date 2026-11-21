import { describe, expect, it } from 'vitest';
import { at, finding, routeOf, siteReport } from './findings-testkit.js';
import { frTypographyIssues } from './i18n.js';
import { describeClashes, mergeReports } from './merge.js';
import { makeReport, totals, type AuditReport } from './report.js';

describe('mergeReports', () => {
  it('gives an empty report, dated as asked, for no reports', () => {
    const m = mergeReports([], at(19));
    expect(m.report.routes).toEqual([]);
    expect(m.report.generatedAt).toBe('2026-11-19T10:00:00.000Z');
    expect(m.clashes).toEqual([]);
  });
  it('returns the same findings for one report', () => {
    const m = mergeReports([siteReport()], at(1));
    expect(m.report.routes).toEqual(siteReport().routes);
    expect(m.report.generatedAt).toBe(siteReport().generatedAt);
    expect(m.clashes).toEqual([]);
  });
  it('puts the routes of two reports side by side and takes the newest date', () => {
    const a = makeReport([routeOf('/', { contrast: { checked: 3, entries: [finding('contrast', 'low', 'fail', 'p')] } })], at(18));
    const b = makeReport([routeOf('/help', { contrast: { checked: 2, entries: [] } })], at(19));
    const m = mergeReports([b, a], at(1));
    expect(m.report.routes.map((r) => r.route)).toEqual(['/', '/help']);
    expect(m.report.generatedAt).toBe('2026-11-19T10:00:00.000Z');
    expect(totals(m.report.routes)).toEqual({ checked: 5, failed: 1, unknown: 0, unmeasured: 0 });
  });
  it('joins different checks of the same route and viewport into one route', () => {
    const browser = makeReport([routeOf('/', { contrast: { checked: 3, entries: [finding('contrast', 'low', 'fail', 'p')] } })], at(19, 9));
    const files = makeReport([routeOf('/', { images: { checked: 2, entries: [finding('images', 'alt-generic', 'unknown', 'img')] } })], at(19, 10));
    const m = mergeReports([browser, files], at(1));
    expect(m.report.routes).toHaveLength(1);
    expect(m.report.routes[0]?.checks.map((c) => c.check)).toEqual(['contrast', 'images']);
    expect(m.report.routes[0]?.entries.map((e) => e.rule)).toEqual(['low', 'alt-generic']);
    expect(m.clashes).toEqual([]);
  });
  it('keeps the same route at two widths apart', () => {
    const a = makeReport([routeOf('/', { contrast: { checked: 1, entries: [] } }, 320)], at(18));
    const b = makeReport([routeOf('/', { contrast: { checked: 1, entries: [] } }, 640)], at(19));
    const m = mergeReports([a, b], at(1));
    expect(m.report.routes.map((r) => r.viewportWidth)).toEqual([320, 640]);
    expect(m.clashes).toEqual([]);
  });
  it('keeps the newer result when one check ran twice on a route, and lists the clash', () => {
    const older = makeReport([routeOf('/', { contrast: { checked: 3, entries: [finding('contrast', 'low', 'fail', 'old')] } })], at(18));
    const newer = makeReport([routeOf('/', { contrast: { checked: 4, entries: [finding('contrast', 'low', 'fail', 'new'), finding('contrast', 'image', 'unknown', 'h1')] } })], at(19));
    for (const order of [[older, newer], [newer, older]]) {
      const m = mergeReports(order, at(1));
      expect(m.report.routes[0]?.entries.map((e) => e.id)).toEqual(['new', 'h1']);
      expect(m.report.routes[0]?.checks).toEqual([{ check: 'contrast', checked: 4, failed: 1, unknown: 1 }]);
      expect(m.clashes).toEqual([{ route: '/', viewportWidth: 320, check: 'contrast', kept: '2026-11-19T10:00:00.000Z' }]);
    }
  });
  it('does not add the two results of a clash together', () => {
    const one = makeReport([routeOf('/', { contrast: { checked: 3, entries: [finding('contrast', 'low', 'fail', 'p')] } })], at(18));
    const two = makeReport([routeOf('/', { contrast: { checked: 3, entries: [finding('contrast', 'low', 'fail', 'p')] } })], at(19));
    expect(totals(mergeReports([one, two], at(1)).report.routes).failed).toBe(1);
  });
  it('keeps the larger unmeasured count and stays truncated when either part was', () => {
    const a: AuditReport = makeReport([{ ...routeOf('/', { contrast: { checked: 1, entries: [] } }), unmeasured: 4, truncated: true }], at(18));
    const b: AuditReport = makeReport([{ ...routeOf('/', { images: { checked: 1, entries: [] } }), unmeasured: 1, truncated: false }], at(19));
    const r = mergeReports([a, b], at(1)).report.routes[0];
    expect(r?.unmeasured).toBe(4);
    expect(r?.truncated).toBe(true);
  });
  it('calls a check skipped only when every report skipped it and none ran it', () => {
    const a: AuditReport = { ...makeReport([routeOf('/', { contrast: { checked: 1, entries: [] } })], at(18)), skipped: ['offline', 'keyboard', 'images'] };
    const b: AuditReport = { ...makeReport([routeOf('/b', { images: { checked: 1, entries: [] } })], at(19)), skipped: ['offline', 'contrast'] };
    expect(mergeReports([a, b], at(1)).report.skipped).toEqual(['offline']);
    const c = makeReport([routeOf('/c', {})], at(20));
    expect(mergeReports([a, b, c], at(1)).report.skipped).toBeUndefined();
  });
  it('keeps each waived failure once', () => {
    const waived = { route: '/', entry: finding('contrast', 'low', 'fail', 'p'), reason: 'Redesign', expires: '2027-01-31' };
    const a: AuditReport = { ...makeReport([routeOf('/', {})], at(18)), waived: [waived] };
    const b: AuditReport = { ...makeReport([routeOf('/b', {})], at(19)), waived: [waived, { ...waived, route: '/b' }] };
    const m = mergeReports([a, b], at(1));
    expect(m.report.waived?.map((w) => w.route)).toEqual(['/', '/b']);
    expect(mergeReports([makeReport([], at(18))], at(1)).report.waived).toBeUndefined();
  });
  it('keeps each reference once', () => {
    const m = mergeReports([siteReport(), siteReport()], at(1));
    expect(m.report.references).toEqual(siteReport().references);
  });
  it('does not change the reports it is given', () => {
    const a = siteReport();
    const before = JSON.stringify(a);
    mergeReports([a, siteReport()], at(1));
    expect(JSON.stringify(a)).toBe(before);
  });
});

describe('describeClashes', () => {
  it('says which result was kept and why, in both languages', () => {
    const lines = describeClashes([{ route: '/', viewportWidth: 320, check: 'contrast', kept: '2026-11-19T10:00:00.000Z' }, { route: 'strings', viewportWidth: null, check: 'copy', kept: '2026-11-19T10:00:00.000Z' }]);
    expect(lines[0]?.en).toBe('The check contrast ran on / (320px) in more than one report. The result of 2026-11-19T10:00:00.000Z was kept and the older one dropped, so findings are not counted twice.');
    expect(lines[1]?.en).toContain('ran on strings in more than one report');
    expect(lines[0]?.fr).toContain('Le contrôle contrast a été exécuté sur / (320px) dans plus d’un rapport.');
    for (const l of lines) expect(frTypographyIssues(l.fr), l.fr).toEqual([]);
    expect(describeClashes([])).toEqual([]);
  });
});
