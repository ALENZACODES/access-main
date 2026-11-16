import { describe, expect, it } from 'vitest';
import { runSelfCheck, renderSelfCheckHtml, surfaceLabel, MAX_PROBLEMS_SHOWN } from './selfCheck';
import { NOW, RECORDS } from './testkit';
import { randomRegistry } from './round7Kit';
import { auditHtml, describeProblems, scanHtml, lintFrench, visibleText } from './index';

describe('self-check', () => {
  it('compares the surfaces on the sample registry and reports counts that add up', () => {
    const c = runSelfCheck(RECORDS, NOW);
    expect(c.surfaces.length).toBeGreaterThan(1);
    expect(c.shown.length + c.hidden).toBe(c.problems.length);
    expect(c.shown.length).toBeLessThanOrEqual(MAX_PROBLEMS_SHOWN);
    expect(c.ok).toBe(c.problems.length === 0);
  });
  it('agrees with itself on a set of random registries', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const c = runSelfCheck(randomRegistry(seed, NOW), NOW);
      expect(c.problems, `seed ${seed}`).toEqual([]);
      expect(c.ok).toBe(true);
    }
  });
  it('renders a section with a unique heading id in both languages, clean under the audits', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderSelfCheckHtml(runSelfCheck(RECORDS, NOW), locale);
      expect(html).toContain('id="ds-selfcheck-title"');
      expect(html).toContain('aria-labelledby="ds-selfcheck-title"');
      expect(scanHtml(html)).toEqual([]);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
  it('lists at most the cap and says how many more, with the right plural', () => {
    const many = { ok: false, surfaces: ['a', 'b'], problems: Array.from({ length: 13 }, (_, i) => `p${i}`), shown: Array.from({ length: 10 }, (_, i) => `p${i}`), hidden: 3 };
    const en = renderSelfCheckHtml(many, 'en');
    expect((en.match(/<li/g) ?? []).length).toBe(10);
    expect(en).toContain('3 more');
    const one = renderSelfCheckHtml({ ...many, problems: many.shown.concat('x'), hidden: 1 }, 'en');
    expect(one).toContain('1 more');
  });
  it('escapes problem text', () => {
    const html = renderSelfCheckHtml({ ok: false, surfaces: ['a', 'b'], problems: ['<b>x</b>'], shown: ['<b>x</b>'], hidden: 0 }, 'en');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;');
  });
  it('names each surface in both languages', () => {
    const c = runSelfCheck(RECORDS, NOW);
    for (const s of c.surfaces) for (const l of ['en', 'fr'] as const) expect(surfaceLabel(s, l).length).toBeGreaterThan(0);
  });
});
