import { describe, expect, it } from 'vitest';
import { scanCopy } from './copylint.js';
import { countRoutes, countRules, describeDigest, makeDigest } from './digest.js';
import { frTypographyIssues } from './i18n.js';
import { emptyReport, entry, sampleReport } from './outputs-testkit.js';
import { buildRouteAudit, makeReport, type AuditReport } from './report.js';

const at = new Date('2026-11-19T10:00:00Z');

describe('countRules', () => {
  it('orders rules by failures, then unknowns, then name, and counts routes', () => {
    expect(countRules(sampleReport())).toEqual([
      { rule: 'contrast/low', failed: 2, unknown: 0, routes: 1 },
      { rule: 'reflow/overflow', failed: 1, unknown: 0, routes: 1 },
      { rule: 'contrast/image', failed: 0, unknown: 2, routes: 2 },
      { rule: 'typography/justified', failed: 0, unknown: 1, routes: 1 },
    ]);
  });
  it('is empty when nothing was found', () => {
    expect(countRules(emptyReport())).toEqual([]);
  });
  it('breaks ties by name so the order does not change between runs', () => {
    const report = makeReport([buildRouteAudit('/', 320, { contrast: { checked: 2, entries: [entry('contrast', 'zeta', 'fail', 'a'), entry('contrast', 'alpha', 'fail', 'b')] } })], at);
    expect(countRules(report).map((r) => r.rule)).toEqual(['contrast/alpha', 'contrast/zeta']);
  });
});

describe('countRoutes', () => {
  it('lists only routes with findings, worst first', () => {
    expect(countRoutes(sampleReport())).toEqual([
      { route: '/', failed: 3, unknown: 1 },
      { route: '/help', failed: 0, unknown: 2 },
    ]);
  });
  it('adds up a route that was audited in several profiles', () => {
    const one = buildRouteAudit('/', 320, { contrast: { checked: 1, entries: [entry('contrast', 'low', 'fail', 'a')] } });
    const two = buildRouteAudit('/', 640, { contrast: { checked: 1, entries: [entry('contrast', 'low', 'fail', 'a'), entry('contrast', 'image', 'unknown', 'b')] } });
    expect(countRoutes(makeReport([one, two], at))).toEqual([{ route: '/', failed: 2, unknown: 1 }]);
  });
});

describe('makeDigest', () => {
  it('holds the totals, the number of routes and checks, and the top lists', () => {
    const d = makeDigest(sampleReport());
    expect(d.totals).toEqual({ checked: 108, failed: 3, unknown: 3, unmeasured: 2 });
    expect(d.routes).toBe(3);
    expect(d.checksRun).toBe(4);
    expect(d.rules).toHaveLength(4);
    expect(d.worstRoutes).toHaveLength(2);
    expect(d.waived).toBe(0);
    expect(d.skipped).toBe(0);
  });
  it('cuts the lists at the limit it is given', () => {
    const d = makeDigest(sampleReport(), 1);
    expect(d.rules.map((r) => r.rule)).toEqual(['contrast/low']);
    expect(d.worstRoutes.map((r) => r.route)).toEqual(['/']);
    expect(makeDigest(sampleReport(), 0).rules).toEqual([]);
    expect(makeDigest(sampleReport(), -3).rules).toEqual([]);
    expect(makeDigest(sampleReport(), 2.9).rules).toHaveLength(2);
  });
  it('counts waived failures and skipped checks', () => {
    const base = sampleReport();
    const report: AuditReport = { ...base, waived: [{ route: '/', entry: entry('contrast', 'low', 'fail', 'x'), reason: 'Redesign in progress', expires: '2027-01-31' }], skipped: ['offline', 'keyboard'] };
    const d = makeDigest(report);
    expect(d.waived).toBe(1);
    expect(d.skipped).toBe(2);
  });
});

describe('describeDigest', () => {
  const en = describeDigest(makeDigest(sampleReport()), 'en');
  const fr = describeDigest(makeDigest(sampleReport()), 'fr');
  it('opens with the totals in one sentence', () => {
    expect(en.split('\n')[0]).toBe('Narrow-screen audit: 3 failures to fix, 3 items to check by hand, across 3 routes and 4 checks.');
    expect(fr.split('\n')[0]).toBe('Audit écran étroit\u00A0: 3 anomalies à corriger, 3 points à contrôler à la main, sur 3 routes et 4 contrôles.');
  });
  it('lists the levels that have findings', () => {
    expect(en).toContain('By level – level AA: 3 to fix, 2 to check; level AAA: 0 to fix, 1 to check.');
    expect(fr).toContain('Par niveau – niveau AA\u00A0: 3 à corriger, 2 à contrôler\u202F; niveau AAA\u00A0: 0 à corriger, 1 à contrôler.');
    expect(en).not.toContain('level A:');
  });
  it('lists the rules and the routes', () => {
    expect(en).toContain('Most frequent rules:\n  contrast/low: 2 to fix, 0 to check, on 1 route\n');
    expect(en).toContain('  contrast/image: 0 to fix, 2 to check, on 2 routes\n');
    expect(en).toContain('Routes with the most findings:\n  /: 3 to fix, 1 to check\n  /help: 0 to fix, 2 to check\n');
    expect(fr).toContain('Règles les plus fréquentes\u00A0:\n  contrast/low\u00A0: 2 à corriger, 0 à contrôler, sur 1 route\n');
    expect(fr).toContain('Routes les plus touchées\u00A0:\n  /\u00A0: 3 à corriger, 1 à contrôler\n');
  });
  it('says how many elements were not measured', () => {
    expect(en).toContain('2 elements were not measured (hidden or no size).');
    expect(fr).toContain('2 éléments non mesurés (masqués ou sans taille).');
  });
  it('uses the singular where the language asks for it', () => {
    const one = makeReport([buildRouteAudit('/', 320, { contrast: { checked: 1, entries: [entry('contrast', 'low', 'fail', 'a')] } }, 1)], at);
    const text = describeDigest(makeDigest(one), 'en');
    expect(text).toContain('1 failure to fix, 0 items to check by hand, across 1 route and 1 check.');
    expect(text).toContain('1 element was not measured');
    const french = describeDigest(makeDigest(one), 'fr');
    expect(french).toContain('1 anomalie à corriger, 0 point à contrôler à la main, sur 1 route et 1 contrôle.');
    expect(french).toContain('1 élément non mesuré');
  });
  it('never words zero findings as a pass', () => {
    const clean = makeReport([buildRouteAudit('/', 320, { contrast: { checked: 5, entries: [] } })], at);
    const text = describeDigest(makeDigest(clean), 'en');
    expect(text).toContain('The checks that ran reported nothing. This is not a conformance statement.');
    expect(text).not.toMatch(/\bpass(?:ed|es)?\b|conform(?:s|ant)\b|compliant|accessible\b/i);
    const french = describeDigest(makeDigest(clean), 'fr');
    expect(french).toContain('Ce n’est pas une déclaration de conformité.');
    expect(french).not.toMatch(/réussi|conforme\b|accessible\b/i);
    expect(text).not.toContain('Most frequent rules');
    expect(text).not.toContain('By level');
  });
  it('mentions waivers and skipped checks only when there are some', () => {
    expect(en).not.toContain('waiver');
    expect(en).not.toContain('not run');
    const base = sampleReport();
    const report: AuditReport = { ...base, waived: [{ route: '/', entry: entry('contrast', 'low', 'fail', 'x'), reason: 'r', expires: '2027-01-31' }], skipped: ['offline'] };
    const text = describeDigest(makeDigest(report), 'en');
    expect(text).toContain('1 failure is covered by a dated waiver and is not counted above.');
    expect(text).toContain('1 check was not run: nothing is said about them.');
    const french = describeDigest(makeDigest(report), 'fr');
    expect(french).toContain('1 anomalie couverte par une dérogation datée, non comptée ci-dessus.');
    expect(french).toContain('1 contrôle n’a pas été exécuté\u00A0: rien n’est dit à leur sujet.');
  });
  it('ends with one line break and has no empty line', () => {
    for (const text of [en, fr]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text).not.toContain('\n\n');
    }
  });
  it('follows French typography and the copy rules', () => {
    for (const line of fr.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
    const fixed = (text: string): string => text.split('\n').filter((l) => !l.startsWith('  ')).join('\n');
    expect(scanCopy(fixed(en)).map((h) => h.rule.id)).toEqual([]);
    expect(scanCopy(fixed(fr)).map((h) => h.rule.id)).toEqual([]);
    expect(`${en}${fr}`).not.toMatch(/verif|vérif/iu);
  });
});
