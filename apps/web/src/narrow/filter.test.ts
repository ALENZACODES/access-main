import { describe, expect, it } from 'vitest';
import { describeFiltered, filteredOut, filterReport, formatFilter, isEmptyFilter, matchesFilter, parseFilter, type Filter } from './filter.js';
import { at, finding, routeOf, siteReport } from './findings-testkit.js';
import { frTypographyIssues } from './i18n.js';
import { makeReport, totals, type AuditReport } from './report.js';

const ids = (r: AuditReport): string[] => r.routes.flatMap((x) => x.entries.map((e) => `${x.route} ${e.check}/${e.rule} ${e.id}`));

describe('matchesFilter', () => {
  const e = finding('contrast', 'low', 'fail', 'a#Nav-Help');
  it('matches everything with an empty filter', () => {
    expect(matchesFilter('/', e, {})).toBe(true);
  });
  it('matches on status, route pattern, rule pattern and id text', () => {
    expect(matchesFilter('/', e, { status: 'fail' })).toBe(true);
    expect(matchesFilter('/', e, { status: 'unknown' })).toBe(false);
    expect(matchesFilter('/help/faq', e, { routes: ['/help*'] })).toBe(true);
    expect(matchesFilter('/map', e, { routes: ['/help*', '/about'] })).toBe(false);
    expect(matchesFilter('/', e, { rules: ['contrast/*'] })).toBe(true);
    expect(matchesFilter('/', e, { rules: ['images/*', '*/low'] })).toBe(true);
    expect(matchesFilter('/', e, { rules: ['images/*'] })).toBe(false);
    expect(matchesFilter('/', e, { idIncludes: 'nav-help' })).toBe(true);
    expect(matchesFilter('/', e, { idIncludes: 'footer' })).toBe(false);
  });
  it('lets an exclusion win over an inclusion', () => {
    expect(matchesFilter('/', e, { rules: ['contrast/*'], excludeRules: ['contrast/low'] })).toBe(false);
    expect(matchesFilter('/', e, { excludeRules: ['images/*'] })).toBe(true);
  });
  it('needs every part of the filter to match', () => {
    expect(matchesFilter('/', e, { status: 'fail', routes: ['/'], rules: ['contrast/*'], idIncludes: 'nav' })).toBe(true);
    expect(matchesFilter('/', e, { status: 'fail', routes: ['/x'], rules: ['contrast/*'] })).toBe(false);
  });
  it('uses general for a finding with no rule', () => {
    expect(matchesFilter('/', { check: 'reflow', id: 'x', status: 'fail', message: { en: 'e', fr: 'f' } }, { rules: ['reflow/general'] })).toBe(true);
  });
});

describe('filterReport', () => {
  it('returns the report itself for an empty filter', () => {
    const r = siteReport();
    expect(filterReport(r, {})).toBe(r);
    expect(isEmptyFilter({ routes: [], rules: [], excludeRules: [], idIncludes: '' })).toBe(true);
    expect(isEmptyFilter({ status: 'fail' })).toBe(false);
  });
  it('keeps one status and recounts, leaving the number checked as it was', () => {
    const f = filterReport(siteReport(), { status: 'unknown' });
    expect(ids(f)).toEqual(['/ images/alt-generic img#logo', '/help images/alt-generic img#logo']);
    expect(totals(f.routes)).toEqual({ checked: totals(siteReport().routes).checked, failed: 0, unknown: 2, unmeasured: 0 });
    expect(f.routes.map((r) => r.route)).toEqual(['/', '/help', '/map', '/about']);
  });
  it('drops the routes that match no route pattern', () => {
    const f = filterReport(siteReport(), { routes: ['/help', '/ma*'] });
    expect(f.routes.map((r) => r.route)).toEqual(['/help', '/map']);
    expect(ids(f)).toHaveLength(3);
  });
  it('keeps and leaves out rules by pattern', () => {
    expect(ids(filterReport(siteReport(), { rules: ['images/*'] }))).toHaveLength(2);
    expect(ids(filterReport(siteReport(), { excludeRules: ['images/*'] }))).toHaveLength(4);
    expect(ids(filterReport(siteReport(), { rules: ['contrast/*'], idIncludes: 'p[' }))).toEqual(['/ contrast/low p[3]']);
  });
  it('filters waived failures the same way', () => {
    const base: AuditReport = { ...siteReport(), waived: [{ route: '/', entry: finding('contrast', 'low', 'fail', 'x'), reason: 'r', expires: '2027-01-31' }, { route: '/', entry: finding('images', 'broken', 'fail', 'y'), reason: 'r', expires: '2027-01-31' }] };
    expect(filterReport(base, { rules: ['images/*'] }).waived?.map((w) => w.entry.id)).toEqual(['y']);
    expect(filterReport(siteReport(), { status: 'fail' }).waived).toBeUndefined();
  });
  it('does not change the report it is given, and keeps its date and notes', () => {
    const r = siteReport();
    const before = JSON.stringify(r);
    const f = filterReport(r, { status: 'fail' });
    expect(JSON.stringify(r)).toBe(before);
    expect(f.generatedAt).toBe(r.generatedAt);
    expect(f.scopeNote).toEqual(r.scopeNote);
  });
  it('counts what it leaves out', () => {
    expect(filteredOut(siteReport(), {})).toBe(0);
    expect(filteredOut(siteReport(), { status: 'fail' })).toBe(2);
    expect(filteredOut(siteReport(), { routes: ['/nowhere'] })).toBe(6);
  });
});

describe('parseFilter', () => {
  const ok = (text: string): Filter => {
    const p = parseFilter(text);
    if (!p.ok) throw new Error(p.error.en);
    return p.value;
  };
  it('reads every key', () => {
    expect(ok('status:fail route:/help* rule:contrast/* -rule:copy/claim-live id:nav')).toEqual({ status: 'fail', routes: ['/help*'], rules: ['contrast/*'], excludeRules: ['copy/claim-live'], idIncludes: 'nav' });
  });
  it('gives an empty filter for empty text', () => {
    expect(ok('')).toEqual({});
    expect(ok('   ')).toEqual({});
  });
  it('lets route and rule repeat, and reads a bare check name as all of its rules', () => {
    expect(ok('route:/a route:/b rule:contrast rule:images/broken -rule:plain')).toEqual({ routes: ['/a', '/b'], rules: ['contrast/*', 'images/broken'], excludeRules: ['plain/*'] });
  });
  it('reads keys and the status without case, and keeps a colon inside a value', () => {
    expect(ok('STATUS:Unknown Route:html:dist/index.html')).toEqual({ status: 'unknown', routes: ['html:dist/index.html'] });
  });
  it('accepts the same status twice', () => {
    expect(ok('status:fail status:fail')).toEqual({ status: 'fail' });
  });
  it.each([
    ['fail', 'not of the form key:value', 'n’a pas la forme'],
    ['status:', 'not of the form key:value', 'n’a pas la forme'],
    [':fail', 'not of the form key:value', 'n’a pas la forme'],
    ['status:pass', 'is not fail or unknown', 'n’est ni fail ni unknown'],
    ['status:fail status:unknown', 'two different statuses', 'deux statuts différents'],
    ['id:a id:b', 'id more than once', 'id plus d’une fois'],
    ['check:contrast', 'is not known', 'est inconnue'],
  ])('rejects "%s" in both languages', (text, en, fr) => {
    const p = parseFilter(text);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.error.en).toContain(en);
      expect(p.error.fr).toContain(fr);
      expect(frTypographyIssues(p.error.fr), p.error.fr).toEqual([]);
    }
  });
  it('never offers a pass status', () => {
    const p = parseFilter('status:pass');
    expect(p.ok).toBe(false);
  });
});

describe('formatFilter', () => {
  it('writes a filter back as text that reads the same', () => {
    const f: Filter = { status: 'fail', routes: ['/help*', '/'], rules: ['contrast/*'], excludeRules: ['copy/*'], idIncludes: 'nav' };
    expect(formatFilter(f)).toBe('status:fail route:/help* route:/ rule:contrast/* -rule:copy/* id:nav');
    expect(parseFilter(formatFilter(f))).toEqual({ ok: true, value: f });
    expect(formatFilter({})).toBe('');
  });
});

describe('describeFiltered', () => {
  it('says how many findings are hidden and that they still count', () => {
    const d = describeFiltered(siteReport(), { status: 'fail' });
    expect(d.en).toBe('Filter status:fail: 2 findings are not shown here. They are still in the full report and still count.');
    expect(d.fr).toBe('Filtre status:fail\u00A0: 2 anomalies ne sont pas affichées ici. Elles restent dans le rapport complet et comptent toujours.');
  });
  it('uses the singular for one, and for none in French', () => {
    const one = makeReport([routeOf('/', { contrast: { checked: 2, entries: [finding('contrast', 'low', 'fail', 'a'), finding('contrast', 'image', 'unknown', 'b')] } })], at(19));
    expect(describeFiltered(one, { status: 'fail' }).en).toContain('1 finding is not shown here.');
    expect(describeFiltered(one, { status: 'fail' }).fr).toContain('1 anomalie n’est pas affichée ici. Elle reste dans le rapport complet et compte toujours.');
    expect(describeFiltered(one, { routes: ['/'] }).fr).toContain('0 anomalie n’est pas affichée ici.');
    expect(describeFiltered(one, { routes: ['/'] }).en).toContain('0 findings are not shown here.');
  });
  it('says so when there is no filter', () => {
    expect(describeFiltered(siteReport(), {})).toEqual({ en: 'No filter: every finding is shown.', fr: 'Aucun filtre\u00A0: toutes les anomalies sont affichées.' });
  });
  it('follows French typography', () => {
    for (const f of [{}, { status: 'fail' as const }, { rules: ['contrast/*'], routes: ['/'] }]) expect(frTypographyIssues(describeFiltered(siteReport(), f).fr)).toEqual([]);
  });
});
