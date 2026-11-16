/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import mainSource from '../main.tsx?raw';
import globalCss from '../styles/global.css?raw';
import appShellSource from '../shell/AppShell.tsx?raw';
import { en } from '../i18n/en.ts';
import { fr } from '../i18n/fr.ts';
import {
  DARK,
  LIGHT,
  MIN_TARGET_PX,
  buildA11yCss,
  contrastRatio,
  injectA11yStyles,
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

  it('disables transitions and animations globally under reduced motion', () => {
    const block = css.match(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{([^}]+)\}/);
    expect(block, 'prefers-reduced-motion rule is missing').not.toBeNull();
    const body = block?.[1] ?? '';
    expect(body).toContain('*, *::before, *::after');
    expect(body).toContain('transition: none');
    expect(body).toContain('animation: none');
    expect(body).not.toMatch(/^\s*:focus-visible\s*\{/);
  });

  it('is deterministic', () => {
    expect(buildA11yCss()).toBe(css);
  });

  it('does not override the shell body colours', () => {
    expect(css).not.toMatch(/body\s*\{[^}]*(?:\bcolor:|background:)/);
  });

  it('narrows the tabindex focus selector', () => {
    expect(css).toContain("[tabindex]:not([tabindex='-1'])");
    expect(css).not.toMatch(/, \[tabindex\](?!:not)/);
  });
});

describe('skipLinkLabel', () => {
  it('returns French for fr locales and English otherwise', () => {
    expect(skipLinkLabel('fr-CA')).toBe('Aller au contenu principal');
    expect(skipLinkLabel('en')).toBe('Skip to main content');
  });

  it("is derived from t('skip') so the label cannot drift", () => {
    expect(skipLinkLabel('en')).toBe(en.skip);
    expect(skipLinkLabel('fr')).toBe(fr.skip);
    expect(skipLinkLabel('fr-CA')).toBe(fr.skip);
  });
});

describe('skip link wiring', () => {
  it('uses the .a11y-skip-link class on the live control', () => {
    expect(appShellSource).toMatch(/className="a11y-skip-link"/);
    expect(appShellSource).toMatch(/skipLinkLabel\(/);
    expect(buildA11yCss()).toContain('.a11y-skip-link');
  });

  it('drops unused .skip-link rules and hides the control with inset-block-start', () => {
    expect(globalCss).not.toMatch(/(?<!a11y)\.skip-link\b/);
    expect(globalCss).toContain('.a11y-skip-link');
    expect(globalCss).toContain('inset-block-start');
    expect(globalCss).not.toMatch(/\.a11y-skip-link[^{]*\{[^}]*transform:/);
  });
});

describe('injectA11yStyles', () => {
  it('injects the stylesheet into the document once', () => {
    document.getElementById('a11y-shell-styles')?.remove();
    const first = injectA11yStyles(document);
    expect(first.id).toBe('a11y-shell-styles');
    expect(first.textContent).toBe(buildA11yCss());
    expect(document.getElementById('a11y-shell-styles')).toBe(first);
    expect(injectA11yStyles(document)).toBe(first);
    expect(document.querySelectorAll('#a11y-shell-styles')).toHaveLength(1);
  });

  it('is wired from the shell entry so styles reach every route', () => {
    expect(mainSource).toMatch(/injectA11yStyles\(document\)/);
  });
});
