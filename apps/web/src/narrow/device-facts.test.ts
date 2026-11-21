import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT_PX, FACT_ORDER, browserEnv, describeFacts, factValue, factsAsText, fitNotes, readDeviceFacts, widthBand, type DeviceEnv, type DeviceFacts } from './device-facts.js';
import { DESKTOP, PHONE, SILENT, envOf } from './fit-testkit.js';
import { frTypographyIssues } from './i18n.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;

describe('readDeviceFacts', () => {
  it('reads a phone', () => {
    const f = readDeviceFacts(PHONE);
    expect(f.width).toEqual({ known: true, value: 320 });
    expect(f.height).toEqual({ known: true, value: 640 });
    expect(f.textScale).toEqual({ known: true, value: 1.5 });
    expect(f.reducedMotion).toEqual({ known: true, value: true });
    expect(f.coarsePointer).toEqual({ known: true, value: true });
    expect(f.portrait).toEqual({ known: true, value: true });
    expect(f.darkScheme).toEqual({ known: true, value: true });
    expect(f.canHover).toEqual({ known: true, value: false });
  });

  it('reads a desktop with every default', () => {
    const f = readDeviceFacts(DESKTOP);
    expect(f.width).toEqual({ known: true, value: 1280 });
    expect(f.textScale).toEqual({ known: true, value: 1 });
    for (const key of ['reducedMotion', 'moreContrast', 'forcedColors', 'darkScheme', 'coarsePointer', 'portrait'] as const) {
      expect(f[key], key).toEqual({ known: true, value: false });
    }
    expect(f.canHover).toEqual({ known: true, value: true });
  });

  it('leaves a feature the browser cannot evaluate as not known', () => {
    const f = readDeviceFacts(PHONE);
    expect(f.moreContrast).toEqual({ known: false });
    expect(f.forcedColors).toEqual({ known: false });
  });

  it('does not take "matches neither value" as a no', () => {
    // A browser that parses the query but matches neither side has given no answer.
    const f = readDeviceFacts({ media: () => false });
    for (const key of ['reducedMotion', 'moreContrast', 'forcedColors', 'darkScheme', 'coarsePointer', 'canHover', 'portrait'] as const) {
      expect(f[key], key).toEqual({ known: false });
    }
  });

  it('knows nothing of a browser that reports nothing', () => {
    const f = readDeviceFacts(SILENT);
    for (const key of FACT_ORDER) expect(f[key], key).toEqual({ known: false });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('does not take %s as a width', (n) => {
    expect(readDeviceFacts({ innerWidth: n, innerHeight: n }).width).toEqual({ known: false });
    expect(readDeviceFacts({ innerWidth: n, innerHeight: n }).height).toEqual({ known: false });
  });

  it.each([null, 0, -4, Number.NaN])('does not take %s as a font size', (n) => {
    expect(readDeviceFacts({ rootFontSizePx: () => n }).textScale).toEqual({ known: false });
  });

  it('rounds a width to whole pixels and a text scale to two decimals', () => {
    const f = readDeviceFacts({ innerWidth: 359.6, innerHeight: 700.2, rootFontSizePx: () => 18.4 });
    expect(f.width).toEqual({ known: true, value: 360 });
    expect(f.height).toEqual({ known: true, value: 700 });
    expect(f.textScale).toEqual({ known: true, value: 1.15 });
    expect(DEFAULT_FONT_PX).toBe(16);
  });

  it('takes the "yes" side when a browser matches both', () => {
    expect(readDeviceFacts({ media: () => true }).reducedMotion).toEqual({ known: true, value: true });
  });
});

describe('browserEnv', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const withGlobals = (values: Record<string, unknown>, body: () => void): void => {
    const before: Record<string, unknown> = {};
    const had: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(values)) {
      had[k] = k in g;
      before[k] = g[k];
      g[k] = v;
    }
    try {
      body();
    } finally {
      for (const k of Object.keys(values)) {
        if (had[k]) g[k] = before[k];
        else delete g[k];
      }
    }
  };

  it('has nothing to report outside a browser', () => {
    const env = browserEnv();
    expect(env.innerWidth).toBeUndefined();
    expect(env.media).toBeUndefined();
    expect(env.rootFontSizePx?.()).toBeNull();
    for (const key of FACT_ORDER) expect(readDeviceFacts(env)[key], key).toEqual({ known: false });
  });

  it('reads the window, the media queries and the root font size', () => {
    withGlobals(
      {
        innerWidth: 412,
        innerHeight: 915,
        matchMedia: (q: string) => ({ matches: q.includes('coarse') || q.includes('portrait'), media: q }),
        document: { documentElement: {} },
        getComputedStyle: () => ({ fontSize: '20px' }),
      },
      () => {
        const f = readDeviceFacts(browserEnv());
        expect(f.width).toEqual({ known: true, value: 412 });
        expect(f.textScale).toEqual({ known: true, value: 1.25 });
        expect(f.coarsePointer).toEqual({ known: true, value: true });
        expect(f.portrait).toEqual({ known: true, value: true });
        expect(f.reducedMotion).toEqual({ known: false });
      },
    );
  });

  it('treats a query the browser answers with "not all" as no answer', () => {
    withGlobals({ matchMedia: () => ({ matches: false, media: 'not all' }) }, () => {
      expect(browserEnv().media?.('(prefers-contrast: more)')).toBeNull();
    });
  });

  it('treats a matchMedia that throws as no answer', () => {
    withGlobals(
      {
        matchMedia: () => {
          throw new Error('no');
        },
      },
      () => {
        expect(browserEnv().media?.('(hover: hover)')).toBeNull();
      },
    );
  });

  it('gives no font size when the style cannot be read', () => {
    withGlobals({ document: { documentElement: {} }, getComputedStyle: () => ({ fontSize: 'medium' }) }, () => {
      expect(browserEnv().rootFontSizePx?.()).toBeNull();
    });
    withGlobals(
      {
        document: { documentElement: {} },
        getComputedStyle: () => {
          throw new Error('no');
        },
      },
      () => {
        expect(browserEnv().rootFontSizePx?.()).toBeNull();
      },
    );
    withGlobals({ document: {}, getComputedStyle: () => ({ fontSize: '16px' }) }, () => {
      expect(browserEnv().rootFontSizePx?.()).toBeNull();
    });
  });
});

describe('describeFacts', () => {
  it('has one line per fact, in a fixed order, in both languages', () => {
    for (const lang of LANGS) {
      const lines = describeFacts(readDeviceFacts(PHONE), lang);
      expect(lines.map((l) => l.key)).toEqual([...FACT_ORDER]);
      for (const l of lines) {
        expect(l.label, l.key).not.toBe('');
        expect(l.value, l.key).not.toBe('');
      }
    }
  });

  it('says UNKNOWN, in both languages, for what the browser does not report', () => {
    for (const lang of LANGS) {
      const lines = describeFacts(readDeviceFacts(SILENT), lang);
      expect(lines.every((l) => l.value === 'UNKNOWN' && !l.known)).toBe(true);
    }
    const phone = describeFacts(readDeviceFacts(PHONE), 'fr');
    expect(phone.find((l) => l.key === 'moreContrast')?.value).toBe('UNKNOWN');
    expect(phone.find((l) => l.key === 'forcedColors')?.value).toBe('UNKNOWN');
    expect(phone.find((l) => l.key === 'reducedMotion')?.known).toBe(true);
  });

  it('puts the values of a phone in words', () => {
    const f = readDeviceFacts(PHONE);
    expect(factValue('width', f, 'en')).toBe('320 CSS pixels');
    expect(factValue('width', f, 'fr')).toBe(`320${NBSP}pixels CSS`);
    expect(factValue('textScale', f, 'en')).toBe('150% of the browser default');
    expect(factValue('textScale', f, 'fr')).toBe(`150${NBSP}% de la taille par défaut du navigateur`);
    expect(factValue('portrait', f, 'en')).toBe('portrait');
    expect(factValue('coarsePointer', f, 'en')).toBe('finger or another coarse pointer');
    expect(factValue('coarsePointer', f, 'fr')).toBe('doigt ou pointeur peu précis');
    expect(factValue('reducedMotion', f, 'en')).toBe('asked for');
    expect(factValue('reducedMotion', f, 'fr')).toBe('demandée');
    expect(factValue('darkScheme', f, 'fr')).toBe('sombre');
    expect(factValue('canHover', f, 'en')).toBe('not available');
  });

  it('puts the values of a desktop in words', () => {
    const f = readDeviceFacts(DESKTOP);
    expect(factValue('portrait', f, 'en')).toBe('landscape');
    expect(factValue('portrait', f, 'fr')).toBe('paysage');
    expect(factValue('coarsePointer', f, 'en')).toBe('mouse or another fine pointer');
    expect(factValue('coarsePointer', f, 'fr')).toBe('souris ou pointeur précis');
    expect(factValue('reducedMotion', f, 'en')).toBe('not asked for');
    expect(factValue('moreContrast', f, 'fr')).toBe('non demandé');
    expect(factValue('forcedColors', f, 'en')).toBe('off');
    expect(factValue('forcedColors', f, 'fr')).toBe('désactivées');
    expect(factValue('darkScheme', f, 'en')).toBe('light');
    expect(factValue('darkScheme', f, 'fr')).toBe('clair');
    expect(factValue('canHover', f, 'fr')).toBe('disponible');
  });

  it('says forced colours are on when they are', () => {
    const f = readDeviceFacts(envOf(800, 600, 16, ['forced-colors: active', 'prefers-contrast: more']));
    expect(factValue('forcedColors', f, 'en')).toBe('on');
    expect(factValue('forcedColors', f, 'fr')).toBe('activées');
    expect(factValue('moreContrast', f, 'en')).toBe('asked for');
  });

  it('follows French typography in every value and label', () => {
    for (const env of [PHONE, DESKTOP, SILENT] as DeviceEnv[]) {
      for (const l of describeFacts(readDeviceFacts(env), 'fr')) {
        expect(frTypographyIssues(l.label), l.label).toEqual([]);
        expect(frTypographyIssues(l.value), l.value).toEqual([]);
      }
      for (const line of factsAsText(readDeviceFacts(env), 'fr').split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
    }
  });
});

describe('factsAsText', () => {
  it('has one line per fact', () => {
    const text = factsAsText(readDeviceFacts(PHONE), 'en');
    expect(text.split('\n')).toHaveLength(FACT_ORDER.length);
    expect(text).toContain('Width of the page area: 320 CSS pixels');
    expect(text).toContain('More contrast: UNKNOWN');
  });

  it('puts a no-break space before the colon in French', () => {
    const text = factsAsText(readDeviceFacts(PHONE), 'fr');
    expect(text).toContain(`Largeur de la zone de page${NBSP}: 320${NBSP}pixels CSS`);
    expect(text).toContain(`Contraste accru${NBSP}: UNKNOWN`);
    expect(text).not.toMatch(/[^\u00A0]:/);
  });
});

describe('widthBand', () => {
  it.each([
    [240, 'narrowest'],
    [320, 'narrowest'],
    [321, 'narrow'],
    [480, 'narrow'],
    [481, 'medium'],
    [1024, 'medium'],
    [1025, 'wide'],
  ] as const)('puts %i in %s', (w, band) => {
    expect(widthBand(w)).toBe(band);
  });
});

describe('fitNotes', () => {
  const notes = (env: DeviceEnv, lang: 'en' | 'fr' = 'en'): string[] => fitNotes(readDeviceFacts(env), lang);

  it('names the 320 pixel width, large text and the finger on a phone', () => {
    const n = notes(PHONE);
    expect(n).toHaveLength(3);
    expect(n[0]).toContain('320 CSS pixels');
    expect(n[1]).toContain('150%');
    expect(n[2]).toContain('44 CSS pixels');
  });

  it('says a wide window does not bring narrow-screen problems out', () => {
    const n = notes(DESKTOP);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain('Narrow the window or zoom in');
  });

  it('calls a width between 321 and 480 a phone width', () => {
    expect(notes(envOf(400, 800, 16, []))[0]).toContain('phone width');
  });

  it('says so when the width is not reported', () => {
    expect(notes(SILENT)).toEqual(['The browser does not report the width of the page. The checks cannot say at which width they looked.']);
  });

  it('does not mention text size below 125%', () => {
    expect(notes(envOf(320, 640, 19, [])).some((x) => x.includes('%'))).toBe(false);
    expect(notes(envOf(320, 640, 20, [])).some((x) => x.includes('125%'))).toBe(true);
  });

  it('never says the page works, passes or conforms', () => {
    for (const env of [PHONE, DESKTOP, SILENT, envOf(400, 800, 32, ['coarse'])]) {
      for (const n of notes(env)) expect(n).not.toMatch(/\b(works|pass(es|ed)?|conforms?|compliant|accessible)\b/i);
      for (const n of notes(env, 'fr')) expect(n).not.toMatch(/conforme|a réussi|fonctionne|accessible/i);
    }
  });

  it('follows French typography', () => {
    for (const env of [PHONE, DESKTOP, SILENT, envOf(400, 800, 32, ['coarse'])]) {
      const fr = notes(env, 'fr');
      expect(fr).toHaveLength(notes(env).length);
      for (const n of fr) expect(frTypographyIssues(n), n).toEqual([]);
    }
  });

  it('returns facts typed as known or not', () => {
    const f: DeviceFacts = readDeviceFacts(PHONE);
    expect(f.width.known && f.width.value).toBe(320);
  });
});
