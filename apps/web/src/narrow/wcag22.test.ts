import { describe, expect, it } from 'vitest';
import { CRITERIA, compareSc, isScNumber } from './criteria.js';
import { frTypographyIssues } from './i18n.js';
import { CHECK_SC } from './types.js';
import { REMOVED_IN_22, WCAG22_AA, WCAG22_SOURCE, aaCriterion, aaLabel, addedIn, principleNumber } from './wcag22.js';

describe('the Level A and AA criteria of WCAG 2.2', () => {
  it('counts 31 at Level A and 24 at Level AA', () => {
    expect(WCAG22_AA.filter((c) => c.level === 'A')).toHaveLength(31);
    expect(WCAG22_AA.filter((c) => c.level === 'AA')).toHaveLength(24);
    expect(WCAG22_AA).toHaveLength(55);
  });

  it('lists each number once, in the order of WCAG', () => {
    const numbers = WCAG22_AA.map((c) => c.sc);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect([...numbers].sort(compareSc)).toEqual(numbers);
    for (const n of numbers) expect(isScNumber(n), n).toBe(true);
  });

  it('leaves out the criterion WCAG 2.2 removed', () => {
    expect(REMOVED_IN_22).toEqual(['4.1.1']);
    for (const sc of REMOVED_IN_22) expect(aaCriterion(sc)).toBeNull();
  });

  it('marks the six criteria WCAG 2.2 added at these levels', () => {
    expect(addedIn('2.2').map((c) => `${c.sc} ${c.level}`)).toEqual(['2.4.11 AA', '2.5.7 AA', '2.5.8 AA', '3.2.6 A', '3.3.7 A', '3.3.8 AA']);
  });

  it('marks the twelve criteria WCAG 2.1 added at these levels', () => {
    expect(addedIn('2.1').map((c) => c.sc)).toEqual(['1.3.4', '1.3.5', '1.4.10', '1.4.11', '1.4.12', '1.4.13', '2.1.4', '2.5.1', '2.5.2', '2.5.3', '2.5.4', '4.1.3']);
  });

  it('has a name in both languages for every criterion', () => {
    for (const c of WCAG22_AA) {
      expect(c.en.trim(), c.sc).not.toBe('');
      expect(c.fr.trim(), c.sc).not.toBe('');
      expect(frTypographyIssues(c.fr), `${c.sc} ${c.fr}`).toEqual([]);
    }
  });

  it('agrees with the criteria table of the report tools wherever both have a criterion', () => {
    let shared = 0;
    for (const c of CRITERIA) {
      const mine = aaCriterion(c.sc);
      if (c.level === 'AAA') {
        expect(mine, c.sc).toBeNull();
        continue;
      }
      expect(mine, c.sc).not.toBeNull();
      expect({ en: mine?.en, fr: mine?.fr, level: mine?.level }, c.sc).toEqual({ en: c.en, fr: c.fr, level: c.level });
      shared++;
    }
    expect(shared).toBeGreaterThan(30);
  });

  it('knows every Level A or AA criterion a check names', () => {
    const outside: string[] = [];
    for (const sc of Object.values(CHECK_SC)) if (sc !== null && aaCriterion(sc) === null) outside.push(sc);
    expect([...new Set(outside)].sort(compareSc)).toEqual(['1.4.8', '3.1.5']);
  });

  it('names its source with an address, a date and a licence', () => {
    expect(WCAG22_SOURCE.url).toBe('https://www.w3.org/TR/WCAG22/');
    expect(WCAG22_SOURCE.date).toBe('2023-10-05');
    expect(WCAG22_SOURCE.licence).not.toBe('');
  });
});

describe('aaLabel and principleNumber', () => {
  it('labels a criterion in both languages', () => {
    expect(aaLabel('1.4.10', 'en')).toBe('1.4.10 Reflow (AA)');
    expect(aaLabel('1.4.10', 'fr')).toBe('1.4.10 Redistribution (AA)');
  });

  it('gives the number alone outside the list', () => {
    expect(aaLabel('1.4.8', 'en')).toBe('1.4.8');
    expect(aaLabel('4.1.1', 'fr')).toBe('4.1.1');
  });

  it.each([
    ['1.1.1', 1],
    ['2.5.8', 2],
    ['3.3.8', 3],
    ['4.1.3', 4],
    ['5.1.1', null],
    ['', null],
  ])('principle of %j is %s', (sc, want) => {
    expect(principleNumber(sc)).toBe(want);
  });
});
