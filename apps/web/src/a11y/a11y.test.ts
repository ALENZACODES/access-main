import { describe, expect, it } from 'vitest';
import {
  DARK,
  LIGHT,
  MIN_TARGET_PX,
  buildA11yCss,
  contrastRatio,
  meetsContrast,
  parseHex,
  skipLinkLabel,
} from './index';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('separates AA from AAA', () => {
    expect(meetsContrast('#767676', '#ffffff', 'AA')).toBe(true);
    expect(meetsContrast('#767676', '#ffffff', 'AAA')).toBe(false);
    expect(meetsContrast('#777777', '#ffffff', 'AA')).toBe(false);
  });

  it('expands 3-digit hex and rejects unknown formats', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('red')).toBeNull();
    expect(() => contrastRatio('red', '#ffffff')).toThrow(RangeError);
  });
});

for (const [name, t] of [
  ['light', LIGHT],
  ['dark', DARK],
] as const) {
  describe(`${name} theme tokens`, () => {
    it('meets AAA for text and the focus ring', () => {
      expect(meetsContrast(t.text, t.background, 'AAA')).toBe(true);
      expect(meetsContrast(t.mutedText, t.background, 'AAA')).toBe(true);
      expect(meetsContrast(t.focusRing, t.focusHalo, 'AAA')).toBe(true);
      expect(meetsContrast(t.focusRing, t.background, 'AAA')).toBe(true);
    });
  });
}

describe('buildA11yCss', () => {
  const css = buildA11yCss();

  it('declares focus-visible, 44px targets and reduced motion', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain(`min-height: ${MIN_TARGET_PX}px`);
    expect(css).toContain('prefers-reduced-motion');
  });

  it('is deterministic', () => {
    expect(buildA11yCss()).toBe(css);
  });
});

describe('skipLinkLabel', () => {
  it('returns French for fr locales and English otherwise', () => {
    expect(skipLinkLabel('fr-CA')).toBe('Passer au contenu principal');
    expect(skipLinkLabel('en')).toBe('Skip to main content');
  });
});
