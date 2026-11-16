import { describe, expect, it } from 'vitest';
import {
  BADGE_PALETTE,
  MIN_TARGET_PX,
  badgeInlineStyle,
  buttonInlineStyle,
  contrastRatio,
  meetsNonTextAA,
  meetsTextAA,
  paletteProblems,
  relativeLuminance,
} from './index';

describe('contrast maths', () => {
  it('matches known WCAG values', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 3);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 3);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });

  it('applies the right thresholds', () => {
    expect(meetsTextAA('#777777', '#FFFFFF')).toBe(false);
    expect(meetsTextAA('#777777', '#FFFFFF', true)).toBe(true);
    expect(meetsNonTextAA('#949494', '#FFFFFF')).toBe(true);
    expect(meetsNonTextAA('#AAAAAA', '#FFFFFF')).toBe(false);
  });

  it('rejects malformed colours', () => {
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow();
    expect(() => relativeLuminance('#FFF')).toThrow();
  });
});

describe('badge palette', () => {
  it('every state meets WCAG 2.2 AA (text 4.5:1, border 3:1)', () => {
    expect(paletteProblems()).toEqual([]);
  });

  it('reports a failing palette', () => {
    const bad = { stale: { fg: '#AAAAAA', bg: '#FFFFFF', border: '#EEEEEE' } };
    expect(paletteProblems(bad)).toHaveLength(2);
  });

  it('uses distinct colours per state and 44px targets', () => {
    const bgs = new Set(Object.values(BADGE_PALETTE).map((c) => c.bg));
    expect(bgs.size).toBe(3);
    for (const s of ['fresh', 'stale', 'unknown'] as const) {
      expect(badgeInlineStyle(s)).toContain(`min-height:${MIN_TARGET_PX}px`);
    }
    expect(buttonInlineStyle()).toContain('min-width:44px');
    expect(buttonInlineStyle()).toContain('min-height:44px');
  });
});
