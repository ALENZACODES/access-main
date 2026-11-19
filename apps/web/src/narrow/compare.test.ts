import { describe, expect, it } from 'vitest';
import { compareReports, describeComparison, isUnchanged, newFailures, renderComparisonMarkdown } from './compare.js';
import { scanCopy } from './copylint.js';
import { frTypographyIssues } from './i18n.js';
import { entry, sampleReport } from './outputs-testkit.js';
import { buildRouteAudit, makeReport, type AuditReport } from './report.js';
import type { CheckResult, Entry } from './types.js';

const day = (n: number): Date => new Date(`2026-11-${String(n).padStart(2, '0')}T10:00:00Z`);
const contrast = (entries: Entry[]): CheckResult => ({ checked: 10, entries });
const one = (route: string, entries: Entry[], at = 18): AuditReport => makeReport([buildRouteAudit(route, 320, { contrast: contrast(entries) })], day(at));

describe('compareReports', () => {
  it('finds nothing between a report and itself', () => {
    const c = compareReports(sampleReport(), sampleReport());
    expect(isUnchanged(c)).toBe(true);
    expect(c.kept).toBe(6);
    expect(c.added).toEqual([]);
    expect(c.gone).toEqual([]);
  });
  it('keeps the two dates', () => {
    const c = compareReports(one('/', [], 18), one('/', [], 19));
    expect([c.before, c.after]).toEqual(['2026-11-18T10:00:00.000Z', '2026-11-19T10:00:00.000Z']);
  });
  it('lists a finding that is new and one that is no longer reported', () => {
    const before = one('/', [entry('contrast', 'low', 'fail', 'p[0]'), entry('contrast', 'low', 'fail', 'p[1]')]);
    const after = one('/', [entry('contrast', 'low', 'fail', 'p[1]'), entry('contrast', 'image', 'unknown', 'h1[0]')], 19);
    const c = compareReports(before, after);
    expect(c.added.map((x) => [x.route, x.entry.rule, x.entry.id])).toEqual([['/', 'image', 'h1[0]']]);
    expect(c.gone.map((x) => [x.route, x.entry.rule, x.entry.id])).toEqual([['/', 'low', 'p[0]']]);
    expect(c.kept).toBe(1);
    expect(isUnchanged(c)).toBe(false);
  });
  it('tells a status change from a new finding', () => {
    const before = one('/', [entry('contrast', 'low', 'unknown', 'p[0]'), entry('contrast', 'low', 'fail', 'p[1]')]);
    const after = one('/', [entry('contrast', 'low', 'fail', 'p[0]'), entry('contrast', 'low', 'unknown', 'p[1]')], 19);
    const c = compareReports(before, after);
    expect(c.added).toEqual([]);
    expect(c.gone).toEqual([]);
    expect(c.statusChanged.map((x) => [x.entry.id, x.from, x.entry.status])).toEqual([['p[0]', 'unknown', 'fail'], ['p[1]', 'fail', 'unknown']]);
  });
  it('treats the same element on another route as another finding', () => {
    const c = compareReports(one('/a', [entry('contrast', 'low', 'fail', 'p[0]')]), makeReport([buildRouteAudit('/a', 320, { contrast: contrast([]) }), buildRouteAudit('/b', 320, { contrast: contrast([entry('contrast', 'low', 'fail', 'p[0]')]) })], day(19)));
    expect(c.gone.map((x) => x.route)).toEqual(['/a']);
    expect(c.notComparable).toBe(1);
    expect(c.routesAdded).toEqual(['/b']);
    expect(c.added).toEqual([]);
  });
  it('does not call a finding new when its check did not run before', () => {
    const before = makeReport([buildRouteAudit('/', 320, { contrast: contrast([]) })], day(18));
    const after = makeReport([buildRouteAudit('/', 320, { contrast: contrast([]), typography: { checked: 3, entries: [entry('typography', 'justified', 'unknown', 'p[0]')] } })], day(19));
    const c = compareReports(before, after);
    expect(c.added).toEqual([]);
    expect(c.notComparable).toBe(1);
    expect(isUnchanged(c)).toBe(false);
  });
  it('does not call a finding gone when its check did not run this time', () => {
    const before = makeReport([buildRouteAudit('/', 320, { contrast: contrast([]), typography: { checked: 3, entries: [entry('typography', 'justified', 'unknown', 'p[0]')] } })], day(18));
    const after = makeReport([buildRouteAudit('/', 320, { contrast: contrast([]) })], day(19));
    const c = compareReports(before, after);
    expect(c.gone).toEqual([]);
    expect(c.notComparable).toBe(1);
  });
  it('lists routes that were added or removed, sorted', () => {
    const before = makeReport([buildRouteAudit('/z', 320, {}), buildRouteAudit('/a', 320, {}), buildRouteAudit('/keep', 320, {})], day(18));
    const after = makeReport([buildRouteAudit('/keep', 320, {}), buildRouteAudit('/n', 320, {}), buildRouteAudit('/b', 320, {})], day(19));
    const c = compareReports(before, after);
    expect(c.routesAdded).toEqual(['/b', '/n']);
    expect(c.routesRemoved).toEqual(['/a', '/z']);
  });
  it('counts a finding once when a route was audited in several profiles, with the worse status', () => {
    const profiles = (status: 'fail' | 'unknown'): AuditReport =>
      makeReport([buildRouteAudit('/', 320, { contrast: contrast([entry('contrast', 'low', 'unknown', 'p[0]')]) }), buildRouteAudit('/', 640, { contrast: contrast([entry('contrast', 'low', status, 'p[0]')]) })], day(18));
    expect(compareReports(profiles('unknown'), profiles('unknown')).kept).toBe(1);
    const c = compareReports(profiles('unknown'), profiles('fail'));
    expect(c.statusChanged.map((x) => [x.from, x.entry.status])).toEqual([['unknown', 'fail']]);
  });
  it('puts failures first, then orders by route, rule and element', () => {
    const after = makeReport(
      [
        buildRouteAudit('/b', 320, { contrast: contrast([entry('contrast', 'image', 'unknown', 'x'), entry('contrast', 'low', 'fail', 'y')]) }),
        buildRouteAudit('/a', 320, { contrast: contrast([entry('contrast', 'low', 'fail', 'z'), entry('contrast', 'low', 'fail', 'b')]) }),
      ],
      day(19),
    );
    const before = makeReport([buildRouteAudit('/b', 320, { contrast: contrast([]) }), buildRouteAudit('/a', 320, { contrast: contrast([]) })], day(18));
    expect(compareReports(before, after).added.map((x) => `${x.route} ${x.entry.status} ${x.entry.id}`)).toEqual(['/a fail b', '/a fail z', '/b fail y', '/b unknown x']);
  });
});

describe('newFailures', () => {
  it('holds new failures and findings that became failures, and nothing else', () => {
    const before = one('/', [entry('contrast', 'low', 'unknown', 'p[0]'), entry('contrast', 'low', 'fail', 'p[9]')]);
    const after = one('/', [entry('contrast', 'low', 'fail', 'p[0]'), entry('contrast', 'low', 'fail', 'p[1]'), entry('contrast', 'image', 'unknown', 'p[2]'), entry('contrast', 'low', 'fail', 'p[9]')], 19);
    expect(newFailures(compareReports(before, after)).map((x) => x.entry.id)).toEqual(['p[1]', 'p[0]']);
    expect(newFailures(compareReports(after, after))).toEqual([]);
  });
});

describe('describeComparison', () => {
  const before = one('/', [entry('contrast', 'low', 'fail', 'p[0]'), entry('contrast', 'low', 'fail', 'p[1]'), entry('contrast', 'image', 'unknown', 'p[5]')]);
  const after = one('/', [entry('contrast', 'low', 'fail', 'p[1]'), entry('contrast', 'low', 'fail', 'p[2]'), entry('contrast', 'image', 'fail', 'p[5]')], 19);
  const c = compareReports(before, after);
  const en = describeComparison(c, 'en');
  const fr = describeComparison(c, 'fr');
  it('names the earlier report', () => {
    expect(en.split('\n')[0]).toBe('Compared with the report of 2026-11-18T10:00:00.000Z:');
    expect(fr.split('\n')[0]).toBe('Comparaison avec le rapport du 2026-11-18T10:00:00.000Z\u00A0:');
  });
  it('counts new findings, the ones no longer reported, status changes and the rest', () => {
    expect(en).toContain('  1 new finding, including 1 with the status FAIL.');
    expect(en).toContain('  1 finding is no longer reported, including 1 with the status FAIL.');
    expect(en).toContain('  1 finding changed status: 1 from UNKNOWN to FAIL, 0 the other way.');
    expect(en).toContain('  1 finding is unchanged.');
    expect(fr).toContain('  1 nouvelle anomalie, dont 1 au statut À CORRIGER.');
    expect(fr).toContain('  1 anomalie n’est plus signalée, dont 1 au statut À CORRIGER.');
    expect(fr).toContain('  1 anomalie a changé de statut\u00A0: 1 de INCONNU vers À CORRIGER, 0 dans l’autre sens.');
    expect(fr).toContain('  1 anomalie inchangée.');
  });
  it('never says fixed, and says why', () => {
    expect(en).toContain('No longer reported does not mean fixed: the element may have moved or been removed.');
    expect(fr).toContain('Ne plus être signalée ne veut pas dire corrigée\u00A0: l’élément a pu être déplacé ou retiré.');
    expect(en.replace('does not mean fixed', '')).not.toMatch(/\bfixed\b|resolved|\bpass/i);
  });
  it('has a short form when nothing changed, which still does not claim a pass', () => {
    const same = describeComparison(compareReports(before, before), 'en');
    expect(same).toBe('Compared with the report of 2026-11-18T10:00:00.000Z:\n  Same findings as last time (3). This says nothing about what the checks do not look at.\n');
    expect(describeComparison(compareReports(before, before), 'fr')).toContain('Mêmes anomalies que la dernière fois (3).');
  });
  it('mentions findings that cannot be compared and routes that came or went, only when there are some', () => {
    expect(en).not.toContain('cannot be compared');
    expect(en).not.toContain('Routes');
    const wider = makeReport([buildRouteAudit('/', 320, { contrast: contrast([]), typography: { checked: 1, entries: [entry('typography', 'justified', 'unknown', 'p')] } }), buildRouteAudit('/new', 320, {})], day(19));
    const text = describeComparison(compareReports(one('/', []), wider), 'en');
    expect(text).toContain('  1 finding cannot be compared: the check ran on one side only for that route.');
    expect(text).toContain('  Routes added: /new');
    const french = describeComparison(compareReports(wider, one('/', [], 20)), 'fr');
    expect(french).toContain('  1 anomalie non comparable\u00A0: le contrôle n’a été exécuté que d’un côté pour cette route.');
    expect(french).toContain('  Routes retirées\u00A0: /new');
  });
  it('follows French typography and the copy rules', () => {
    for (const line of fr.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
    expect(scanCopy(en).map((h) => h.rule.id)).toEqual([]);
    expect(scanCopy(fr).map((h) => h.rule.id)).toEqual([]);
    expect(`${en}${fr}`).not.toMatch(/verif|vérif/iu);
  });
});

describe('renderComparisonMarkdown', () => {
  const before = one('/', [entry('contrast', 'low', 'fail', 'p[0]'), entry('contrast', 'image', 'unknown', 'p[5]')]);
  const after = one('/', [entry('contrast', 'low', 'fail', 'p[2]', 'New <b>text</b>'), entry('contrast', 'image', 'fail', 'p[5]')], 19);
  const md = renderComparisonMarkdown(compareReports(before, after), 'en');
  it('has a title, the two dates and the counts as a list', () => {
    expect(md.startsWith('# Narrow-screen audit – what changed\n\nFrom 2026-11-18T10:00:00.000Z to 2026-11-19T10:00:00.000Z.\n\n- 1 new finding, including 1 with the status FAIL.\n')).toBe(true);
  });
  it('lists new findings, status changes with the old status, and findings no longer reported', () => {
    expect(md).toContain('## New findings\n\n- **FAIL** `/` `contrast/low` `p[2]` New &lt;b&gt;text&lt;/b&gt;');
    expect(md).toContain('## Status changed\n\n- **FAIL** (was UNKNOWN) `/` `contrast/image` `p[5]`');
    expect(md).toContain('## Findings no longer reported\n\n- **FAIL** `/` `contrast/low` `p[0]`');
    expect(md).not.toContain('<b>');
  });
  it('is in French when asked', () => {
    const fr = renderComparisonMarkdown(compareReports(before, after), 'fr');
    expect(fr).toContain('# Audit écran étroit – ce qui a changé');
    expect(fr).toContain('## Nouvelles anomalies');
    expect(fr).toContain('- **À CORRIGER** (avant INCONNU) `/` `contrast/image` `p[5]`');
    expect(fr).toContain('## Anomalies qui ne sont plus signalées');
  });
  it('leaves out the sections that are empty', () => {
    const same = renderComparisonMarkdown(compareReports(before, before), 'en');
    expect(same).not.toContain('##');
    expect(same).toContain('- Same findings as last time \\(2\\).');
  });
  it('cuts long lists at the limit', () => {
    const many = one('/', Array.from({ length: 6 }, (_, i) => entry('contrast', 'low', 'fail', `p[${i}]`)), 19);
    const cut = renderComparisonMarkdown(compareReports(one('/', []), many), 'en', 4);
    expect(cut.match(/\*\*FAIL\*\*/g)).toHaveLength(4);
    expect(cut).toContain('- … and 2 more.');
    expect(renderComparisonMarkdown(compareReports(one('/', []), many), 'fr', 4)).toContain('- … et 2 de plus.');
  });
  it('ends with one line break and has no trailing spaces', () => {
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
    expect(md).not.toMatch(/[ \t]\n/);
  });
});
