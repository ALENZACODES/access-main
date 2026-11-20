import { describe, expect, it } from 'vitest';
import { coverageTable, parseTri, tally, unknownPercent, yesOfKnownPercent } from './index';

describe('parseTri', () => {
  it.each([
    [true, 'yes'],
    ['Yes', 'yes'],
    [' oui ', 'yes'],
    [false, 'no'],
    ['FALSE', 'no'],
    ['non', 'no'],
  ])('%s -> %s', (v, e) => expect(parseTri(v)).toBe(e));

  it.each([undefined, null, '', 'maybe', 'n/a', 'partial', 0, 1, 'unknown', {}])('%s -> unknown', (v) => {
    expect(parseTri(v)).toBe('unknown');
  });
});

describe('tally and shares', () => {
  it('keeps unknown separate from no', () => {
    const t = tally([true, false, undefined, 'maybe', 'yes']);
    expect(t).toEqual({ yes: 2, no: 1, unknown: 2, total: 5 });
    expect(unknownPercent(t)).toBeCloseTo(40);
    expect(yesOfKnownPercent(t)).toBeCloseTo(66.667, 2);
  });

  it('empty or all-unknown inputs give null, not 0', () => {
    expect(unknownPercent(tally([]))).toBeNull();
    expect(yesOfKnownPercent(tally([]))).toBeNull();
    expect(yesOfKnownPercent(tally([undefined, null]))).toBeNull();
    expect(unknownPercent(tally([undefined]))).toBe(100);
  });
});

describe('coverageTable', () => {
  const attrs = [{ key: 'entry', label: { en: 'Step-free entrance', fr: 'Entrée sans marche' } }];
  it('formats shares per locale and shows Unknown when nothing is known', () => {
    const rows = [{ entry: true }, { entry: false }, { entry: 'n/a' }, {}];
    const en = coverageTable(rows, attrs, 'en')[0]!;
    expect(en.label).toBe('Step-free entrance');
    expect(en.unknownShare.text).toBe('50.0%');
    expect(en.yesOfKnown.text).toBe('50.0%');
    const fr = coverageTable(rows, attrs, 'fr')[0]!;
    expect(fr.unknownShare.text).toBe('50,0\u00A0%');
    const none = coverageTable([{}, {}], attrs, 'fr')[0]!;
    expect(none.yesOfKnown).toMatchObject({ known: false, text: 'UNKNOWN' });
    expect(coverageTable([], attrs, 'en')[0]?.unknownShare.known).toBe(false);
  });
});
