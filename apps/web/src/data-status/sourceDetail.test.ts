import { describe, expect, it } from 'vitest';
import { auditRegistry } from './datasetRegistry';
import { buildSourceDetails, renderSourceDetailsHtml, MAX_DETAILS } from './sourceDetail';
import { NOW, RECORDS, targetsBelow44 } from './testkit';
import { randomRegistry } from './round7Kit';
import { auditHtml, describeProblems, lintFrench, scanHtml, visibleText } from './index';

describe('source details', () => {
  const audit = auditRegistry(RECORDS, NOW, {});
  it('lists only sources that have findings, once each', () => {
    const d = buildSourceDetails(audit);
    const withFindings = new Set(audit.findings.filter((f) => f.sourceId !== null).map((f) => `${f.datasetId}|${f.sourceId}`));
    expect(d.items.length + d.hidden).toBe(withFindings.size);
    const keys = d.items.map((i) => `${i.source.datasetId}|${i.source.sourceId}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(withFindings.has(k)).toBe(true);
  });
  it('lists finding codes without repeats for each source', () => {
    for (const i of buildSourceDetails(audit).items) {
      expect(i.codes.length).toBeGreaterThan(0);
      expect(new Set(i.codes).size).toBe(i.codes.length);
    }
  });
  it('respects the limit and reports the rest as hidden', () => {
    const all = buildSourceDetails(audit, 1000);
    expect(all.hidden).toBe(0);
    if (all.items.length > 1) {
      const one = buildSourceDetails(audit, 1);
      expect(one.items).toHaveLength(1);
      expect(one.hidden).toBe(all.items.length - 1);
    }
    expect(buildSourceDetails(audit, 0).items).toEqual([]);
    expect(buildSourceDetails(audit, -3).items).toEqual([]);
  });
  it('caps at the default on a large random registry', () => {
    const big = auditRegistry(randomRegistry(7, NOW), NOW, {});
    expect(buildSourceDetails(big).items.length).toBeLessThanOrEqual(MAX_DETAILS);
  });
  it('is stable across repeated calls', () => {
    expect(buildSourceDetails(audit)).toEqual(buildSourceDetails(audit));
  });
  it('renders clean details in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderSourceDetailsHtml(buildSourceDetails(audit), locale);
      expect(html).toContain('id="ds-detail-title"');
      expect(scanHtml(html)).toEqual([]);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
  it('shows a plain message when no source has an item', () => {
    const html = renderSourceDetailsHtml({ items: [], hidden: 0 }, 'en');
    expect(html).not.toContain('<details');
    expect(html).toContain('No source has an item to review.');
  });
  it('mentions how many are not listed', () => {
    const d = buildSourceDetails(audit, 1000);
    expect(renderSourceDetailsHtml({ ...d, hidden: 1 }, 'en')).toContain('1 more source with');
    expect(renderSourceDetailsHtml({ ...d, hidden: 2 }, 'en')).toContain('2 more sources with');
  });
});
