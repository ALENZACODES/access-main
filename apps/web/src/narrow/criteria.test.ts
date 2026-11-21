import { describe, expect, it } from 'vitest';
import { byCriterion, byLevel, compareSc, CRITERIA, criterionLabel, criterionOf, criterionOfCheck, isScNumber, principleOf, PRINCIPLES } from './criteria.js';
import { frTypographyIssues } from './i18n.js';
import { emptyReport, sampleReport } from './outputs-testkit.js';
import { CHECK_SC } from './types.js';

describe('the criteria table', () => {
  it('has well-formed numbers, no number twice, and names in both languages', () => {
    expect(new Set(CRITERIA.map((c) => c.sc)).size).toBe(CRITERIA.length);
    for (const c of CRITERIA) {
      expect(isScNumber(c.sc), c.sc).toBe(true);
      expect(c.en.trim(), c.sc).not.toBe('');
      expect(c.fr.trim(), c.sc).not.toBe('');
      expect(['A', 'AA', 'AAA']).toContain(c.level);
      expect(frTypographyIssues(c.fr), c.fr).toEqual([]);
    }
  });
  it('is in criterion order', () => {
    const sorted = [...CRITERIA].sort((a, b) => compareSc(a.sc, b.sc)).map((c) => c.sc);
    expect(CRITERIA.map((c) => c.sc)).toEqual(sorted);
  });
  it('covers every criterion a check relates to', () => {
    for (const [check, sc] of Object.entries(CHECK_SC)) {
      if (sc === null) continue;
      expect(criterionOf(sc), `${check} ${sc}`).not.toBeNull();
    }
  });
  it.each([
    ['1.1.1', 'A', 'Non-text Content'],
    ['1.4.3', 'AA', 'Contrast (Minimum)'],
    ['1.4.8', 'AAA', 'Visual Presentation'],
    ['1.4.10', 'AA', 'Reflow'],
    ['2.4.7', 'AA', 'Focus Visible'],
    ['2.4.11', 'AA', 'Focus Not Obscured (Minimum)'],
    ['2.5.7', 'AA', 'Dragging Movements'],
    ['2.5.8', 'AA', 'Target Size (Minimum)'],
    ['3.1.5', 'AAA', 'Reading Level'],
    ['3.3.8', 'AA', 'Accessible Authentication (Minimum)'],
    ['4.1.2', 'A', 'Name, Role, Value'],
    ['4.1.3', 'AA', 'Status Messages'],
  ])('%s is level %s, %s', (sc, level, name) => {
    expect(criterionOf(sc)).toMatchObject({ sc, level, en: name });
  });
  it('names the four principles in both languages', () => {
    expect(Object.keys(PRINCIPLES)).toEqual(['1', '2', '3', '4']);
    expect(PRINCIPLES[1]).toEqual({ en: 'Perceivable', fr: 'Perceptible' });
    expect(PRINCIPLES[4].fr).toBe('Robuste');
  });
});

describe('lookups', () => {
  it('recognises a criterion number', () => {
    for (const x of ['1.1.1', '1.4.10', '2.5.8', '4.1.3']) expect(isScNumber(x), x).toBe(true);
    for (const x of ['', '1.1', '5.1.1', '0.1.1', '1.4.100', 'a.b.c', '1.4.10 ', '1-4-10']) expect(isScNumber(x), x).toBe(false);
  });
  it('finds a criterion, trimming spaces, and returns null for one it does not hold', () => {
    expect(criterionOf(' 1.4.10 ')?.en).toBe('Reflow');
    expect(criterionOf('1.2.1')).toBeNull();
    expect(criterionOf('reflow')).toBeNull();
  });
  it('gives the principle of a number', () => {
    expect(principleOf('1.4.10')).toBe(1);
    expect(principleOf('2.1.1')).toBe(2);
    expect(principleOf('3.3.2')).toBe(3);
    expect(principleOf('4.1.2')).toBe(4);
    expect(principleOf('none')).toBeNull();
  });
  it('orders numbers as numbers', () => {
    expect(['1.4.10', '1.4.3', '2.4.11', '1.3.1', '2.4.7'].sort(compareSc)).toEqual(['1.3.1', '1.4.3', '1.4.10', '2.4.7', '2.4.11']);
    expect(compareSc('1.4.3', '1.4.3')).toBe(0);
    expect(['zzz', '1.1.1', 'aaa'].sort(compareSc)).toEqual(['1.1.1', 'aaa', 'zzz']);
  });
  it('labels a criterion in either language, and falls back to the bare number', () => {
    expect(criterionLabel('1.4.10', 'en')).toBe('1.4.10 Reflow (AA)');
    expect(criterionLabel('1.4.10', 'fr')).toBe('1.4.10 Redistribution (AA)');
    expect(criterionLabel('1.2.1', 'en')).toBe('1.2.1');
  });
  it('maps a check to its criterion', () => {
    expect(criterionOfCheck('reflow')?.sc).toBe('1.4.10');
    expect(criterionOfCheck('contrast')?.sc).toBe('1.4.3');
    expect(criterionOfCheck('copy')).toBeNull();
    expect(criterionOfCheck('budget')).toBeNull();
  });
});

describe('byCriterion', () => {
  it('sums checks by criterion in criterion order, with the checks outside WCAG last', () => {
    const rows = byCriterion(sampleReport());
    expect(rows.map((r) => [r.sc, r.level, r.failed, r.unknown, r.checked])).toEqual([
      ['1.4.3', 'AA', 2, 2, 42],
      ['1.4.8', 'AAA', 0, 1, 5],
      ['1.4.10', 'AA', 1, 0, 21],
      [null, null, 0, 0, 40],
    ]);
    expect(rows[0]?.checks).toEqual(['contrast']);
    expect(rows[3]?.checks).toEqual(['copy']);
  });
  it('is empty for an empty report', () => {
    expect(byCriterion(emptyReport())).toEqual([]);
  });
});

describe('byLevel', () => {
  it('always gives the four rows, in order', () => {
    expect(byLevel(emptyReport())).toEqual([
      { level: 'A', failed: 0, unknown: 0 },
      { level: 'AA', failed: 0, unknown: 0 },
      { level: 'AAA', failed: 0, unknown: 0 },
      { level: 'none', failed: 0, unknown: 0 },
    ]);
  });
  it('sums findings by level', () => {
    expect(byLevel(sampleReport())).toEqual([
      { level: 'A', failed: 0, unknown: 0 },
      { level: 'AA', failed: 3, unknown: 2 },
      { level: 'AAA', failed: 0, unknown: 1 },
      { level: 'none', failed: 0, unknown: 0 },
    ]);
  });
});
