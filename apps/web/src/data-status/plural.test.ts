import { describe, expect, it } from 'vitest';
import { EN, FR, pluralCategory, tCount } from './index';

describe('pluralCategory', () => {
  it('English: only 1 is singular', () => {
    expect([0, 1, 2, 5, 21].map((n) => pluralCategory('en', n))).toEqual(['other', 'one', 'other', 'other', 'other']);
  });

  it('French: 0 and 1 are singular', () => {
    expect([0, 1, 2, 5, 21].map((n) => pluralCategory('fr', n))).toEqual(['one', 'one', 'other', 'other', 'other']);
  });
});

describe('tCount', () => {
  it('picks the right form and fills placeholders', () => {
    expect(tCount('en', 'flt.result', 1, { shown: 1, total: 1 })).toBe('1 of 1 source shown');
    expect(tCount('en', 'flt.result', 3, { shown: 1, total: 3 })).toBe('1 of 3 sources shown');
    expect(tCount('fr', 'flt.result', 0, { shown: 0, total: 3 })).toBe('0 source affichée sur 3');
    expect(tCount('fr', 'flt.result', 1, { shown: 1, total: 3 })).toBe('1 source affichée sur 3');
    expect(tCount('fr', 'flt.result', 2, { shown: 2, total: 3 })).toBe('2 sources affichées sur 3');
  });
});

describe('plural keys in the catalog', () => {
  it('every .one has a matching .other in both languages, and vice versa', () => {
    for (const cat of [EN, FR] as const) {
      const keys = Object.keys(cat);
      for (const k of keys.filter((x) => x.endsWith('.one'))) expect(keys).toContain(k.replace(/\.one$/, '.other'));
      for (const k of keys.filter((x) => x.endsWith('.other'))) expect(keys).toContain(k.replace(/\.other$/, '.one'));
    }
  });
});
