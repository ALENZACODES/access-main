import { describe, expect, it } from 'vitest';
import { buildGlossary, GLOSSARY_TERMS, renderGlossaryHtml } from './glossary';
import { auditHtml, describeProblems, lintFrench, scanHtml, t, visibleText } from './index';

describe('glossary', () => {
  it('has an entry for every term, in order, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const g = buildGlossary(locale);
      expect(g.map((e) => e.term)).toEqual([...GLOSSARY_TERMS]);
      for (const e of g) {
        expect(e.name.length).toBeGreaterThan(0);
        expect(e.meaning.endsWith('.')).toBe(true);
      }
    }
  });
  it('uses the panel’s own status labels as the term names', () => {
    for (const locale of ['en', 'fr'] as const) {
      const g = buildGlossary(locale);
      expect(g.find((e) => e.term === 'fresh')?.name).toBe(t(locale, 'state.fresh'));
      expect(g.find((e) => e.term === 'stale')?.name).toBe(t(locale, 'state.stale'));
    }
  });
  it('has no repeated term names within a language', () => {
    for (const locale of ['en', 'fr'] as const) {
      const names = buildGlossary(locale).map((e) => e.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
  it('renders a definition list with one pair per term', () => {
    const html = renderGlossaryHtml('en');
    expect(html.match(/<dt>/g)).toHaveLength(GLOSSARY_TERMS.length);
    expect(html.match(/<dd>/g)).toHaveLength(GLOSSARY_TERMS.length);
    expect(html).toContain('aria-labelledby="ds-glossary-title"');
  });
  it('passes the markup and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderGlossaryHtml(locale);
      expect(scanHtml(html)).toEqual([]);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
});
