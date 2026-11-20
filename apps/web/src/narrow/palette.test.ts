import { describe, expect, it } from 'vitest';
import { toHex } from './colorspace.js';
import { noFrIssues } from './expect-fr.js';
import { frTypographyIssues } from './i18n.js';
import { SAMPLE_CSS } from './pair-testkit.js';
import { DEFAULT_REQUIRED, auditPalette, measurePair, pageCss, pairSentence, pairsByName, paletteEntries, themesFromCss, type Token } from './palette.js';
import { NBSP } from './types.js';

const names = (css: string, theme = 0): string[] => (themesFromCss(css)[theme]?.tokens ?? []).map((t) => t.name);
const token = (css: string, name: string, theme = 0): Token | undefined => themesFromCss(css)[theme]?.tokens.find((t) => t.name === name);

describe('themesFromCss', () => {
  it('reads the colour tokens of each block, in order, and leaves other tokens out', () => {
    const themes = themesFromCss(SAMPLE_CSS);
    expect(themes.map((t) => t.label)).toEqual([':root', '@media (prefers-color-scheme: dark) :root', '[data-theme="soft"]']);
    expect(names(SAMPLE_CSS)).toEqual(['--bg', '--surface', '--ink', '--muted', '--header', '--header-ink', '--accent', '--accent-ink']);
    expect(names(SAMPLE_CSS)).not.toContain('--space');
    expect(names(SAMPLE_CSS)).not.toContain('--font');
  });

  it('marks every token of the first block as its own', () => {
    expect(themesFromCss(SAMPLE_CSS)[0]?.tokens.every((t) => t.own)).toBe(true);
  });

  it('completes a later block with the first one, and marks what it took over', () => {
    const dark = themesFromCss(SAMPLE_CSS)[1];
    expect(dark?.tokens.filter((t) => t.own).map((t) => t.name)).toEqual(['--bg', '--surface', '--ink', '--header']);
    expect(dark?.tokens.find((t) => t.name === '--header-ink')).toMatchObject({ value: '#ffffff', own: false });
    expect(dark?.tokens.find((t) => t.name === '--ink')?.value).toBe('#ffffff');
  });

  it('reads the colour of a token', () => {
    const ink = token(SAMPLE_CSS, '--ink');
    expect(ink?.color && toHex(ink.color)).toBe('#1b1916');
    expect(ink?.gap).toBeUndefined();
  });

  it('is empty for CSS with no custom property, for broken CSS and for nothing', () => {
    expect(themesFromCss('p{color:red}')).toEqual([]);
    expect(themesFromCss('')).toEqual([]);
    expect(() => themesFromCss(':root{--ink:#000')).not.toThrow();
    expect(themesFromCss('}}{{--x')).toEqual([]);
  });

  it('leaves out a block that sets no colour token', () => {
    const css = ':root{--ink:#000}\n.wide{--gap:20px}';
    expect(themesFromCss(css).map((t) => t.label)).toEqual([':root']);
  });

  it('takes the later declaration when a block is written twice', () => {
    const css = ':root{--ink:#111111}\n:root{--ink:#222222;--bg:#ffffff}';
    const themes = themesFromCss(css);
    expect(themes).toHaveLength(1);
    expect(themes[0]?.tokens.map((t) => `${t.name}=${t.value}`)).toEqual(['--ink=#222222', '--bg=#ffffff']);
  });

  it('ignores comments', () => {
    expect(names('/* --old: #fff; */ :root{ /* x */ --ink: #000; }')).toEqual(['--ink']);
  });

  it('follows a var() reference, through more than one step, to a colour', () => {
    const css = ':root{--black:#000000;--ink:var(--black);--header-ink: var( --ink )}';
    expect(token(css, '--header-ink')?.value).toBe('#000000');
    expect(token(css, '--header-ink')?.color).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('uses the fallback of a var() whose token is not set', () => {
    expect(token(':root{--ink: var(--nope, #123456)}', '--ink')?.value).toBe('#123456');
    expect(token(':root{--ink: var(--nope, var(--also-nope, white))}', '--ink')?.value).toBe('white');
  });

  it('resolves a reference in a later block against that block first', () => {
    const css = ':root{--base:#000000;--ink:var(--base)}\n.dark{--base:#ffffff}';
    expect(token(css, '--ink', 1)?.value).toBe('#ffffff');
    expect(token(css, '--ink', 1)?.own).toBe(false);
  });

  it('keeps a colour-named token whose reference leads nowhere, as a gap', () => {
    expect(token(':root{--note-fg: var(--nope);--x:#fff}', '--note-fg')).toMatchObject({ color: null, gap: 'reference' });
  });

  it('drops a token with an open reference when its name does not say colour', () => {
    expect(names(':root{--gap: var(--nope);--x:#fff}')).toEqual(['--x']);
  });

  it('does not loop on tokens that refer to each other', () => {
    const css = ':root{--a-ink: var(--b-ink);--b-ink: var(--a-ink);--x:#fff}';
    expect(token(css, '--a-ink')).toMatchObject({ color: null, gap: 'reference' });
  });

  it.each(['oklch(0.5 0.1 200)', 'lab(50% 40 59)', 'color-mix(in srgb, red, blue)', 'light-dark(#fff, #000)', 'hwb(194 0% 0%)', 'currentColor', 'CanvasText'])(
    'keeps %s as a colour it cannot compute',
    (value) => {
      expect(token(`:root{--brand: ${value}}`, '--brand')).toMatchObject({ color: null, gap: 'unread', value });
    },
  );

  it('keeps transparency', () => {
    expect(token(':root{--glass: rgb(0 0 0 / 50%)}', '--glass')?.color?.a).toBe(0.5);
  });

  it('labels a block by the at-rules around it and its selector', () => {
    const css = '@media (min-width: 40em){@supports (color: red){.card , .tile{--card-bg:#fff}}}';
    expect(themesFromCss(css)[0]?.label).toBe('@media (min-width: 40em) @supports (color: red) .card , .tile');
  });
});

describe('pairsByName', () => {
  it('pairs -ink, -text, -fg and -foreground with the token they are named after', () => {
    expect(pairsByName(['--header', '--header-ink'])).toEqual([{ text: '--header-ink', surface: '--header' }]);
    expect(pairsByName(['--card-text', '--card'])).toEqual([{ text: '--card-text', surface: '--card' }]);
    expect(pairsByName(['--chip', '--chip-fg'])).toEqual([{ text: '--chip-fg', surface: '--chip' }]);
    expect(pairsByName(['--chip', '--chip-foreground'])).toEqual([{ text: '--chip-foreground', surface: '--chip' }]);
  });

  it('pairs --on-x with --x', () => {
    expect(pairsByName(['--primary', '--on-primary'])).toEqual([{ text: '--on-primary', surface: '--primary' }]);
  });

  it('pairs --x-fg and --x-text with --x-bg, --x-background and --x-surface', () => {
    expect(pairsByName(['--note-fg', '--note-bg'])).toEqual([{ text: '--note-fg', surface: '--note-bg' }]);
    expect(pairsByName(['--note-text', '--note-background', '--note-surface'])).toEqual([
      { text: '--note-text', surface: '--note-background' },
      { text: '--note-text', surface: '--note-surface' },
    ]);
  });

  it('pairs a bare --ink, --text or --fg with each bare --bg, --background and --surface', () => {
    expect(pairsByName(['--bg', '--surface', '--ink'])).toEqual([
      { text: '--ink', surface: '--bg' },
      { text: '--ink', surface: '--surface' },
    ]);
    expect(pairsByName(['--text', '--background'])).toEqual([{ text: '--text', surface: '--background' }]);
    expect(pairsByName(['--fg', '--bg'])).toEqual([{ text: '--fg', surface: '--bg' }]);
  });

  it('pairs nothing it has no name for, and never a token with itself', () => {
    expect(pairsByName(['--muted', '--bg', '--accent', '--line'])).toEqual([]);
    expect(pairsByName(['--header-ink'])).toEqual([]);
    expect(pairsByName(['--on-on', '--on'])).toEqual([{ text: '--on-on', surface: '--on' }]);
    expect(pairsByName([])).toEqual([]);
  });

  it('gives each pair once', () => {
    const pairs = pairsByName(['--a', '--a-ink', '--a', '--a-ink']);
    expect(pairs).toEqual([{ text: '--a-ink', surface: '--a' }]);
  });

  it('finds the pairs of the App tokens', () => {
    const all = themesFromCss(SAMPLE_CSS)[0]?.tokens.map((t) => t.name) ?? [];
    expect(pairsByName(all)).toEqual([
      { text: '--ink', surface: '--bg' },
      { text: '--ink', surface: '--surface' },
      { text: '--header-ink', surface: '--header' },
      { text: '--accent-ink', surface: '--accent' },
    ]);
  });
});

describe('measurePair', () => {
  const t = (name: string, value: string): Token => {
    const found = token(`:root{${name}: ${value}}`, name);
    if (!found) throw new Error(name);
    return found;
  };

  it('measures two opaque colours', () => {
    expect(measurePair(t('--ink', '#1b1916'), t('--surface', '#fffdf8'), 4.5)).toEqual({ text: '--ink', surface: '--surface', status: 'reaches', ratio: 17.25, fix: null });
  });

  it('gives a fix for a pair below the minimum', () => {
    const pair = measurePair(t('--a-ink', '#777777'), t('--a', '#ffffff'), 4.5);
    expect(pair.status).toBe('below');
    expect(pair.ratio).toBe(4.47);
    expect(pair.fix?.text[0]?.hex).toBe('#767676');
  });

  it('follows the minimum it is given', () => {
    expect(measurePair(t('--a-ink', '#777777'), t('--a', '#ffffff'), 3).status).toBe('reaches');
    expect(measurePair(t('--a-ink', '#1b1916'), t('--a', '#fffdf8'), 18).status).toBe('below');
  });

  it('is UNKNOWN when the surface has transparency', () => {
    expect(measurePair(t('--g-ink', '#ffffff'), t('--g', 'rgb(0 0 0 / 50%)'), 4.5)).toEqual({ text: '--g-ink', surface: '--g', status: 'unknown', ratio: null, fix: null, gap: 'surface-transparent' });
  });

  it('is UNKNOWN when either colour could not be read', () => {
    expect(measurePair(t('--b-ink', '#ffffff'), t('--b', 'oklch(0.5 0.1 200)'), 4.5).gap).toBe('surface-unread');
    expect(measurePair(t('--b-ink', 'oklch(0.9 0.1 200)'), t('--b', '#000000'), 4.5).gap).toBe('text-unread');
  });

  it('lays a text colour with transparency over the surface', () => {
    const pair = measurePair(t('--a-ink', 'rgb(0 0 0 / 50%)'), t('--a', '#ffffff'), 4.5);
    expect(pair.status).toBe('below');
    expect(pair.ratio).toBe(3.97);
  });
});

describe('auditPalette', () => {
  it('measures the named pairs of the first block', () => {
    const [root] = auditPalette(themesFromCss(SAMPLE_CSS));
    expect(root?.label).toBe(':root');
    expect(root?.colors).toBe(8);
    expect(root?.pairs.map((p) => `${p.text} ${p.surface} ${p.status} ${p.ratio}`)).toEqual([
      '--ink --bg reaches 15.54',
      '--ink --surface reaches 17.25',
      '--header-ink --header reaches 13.07',
      '--accent-ink --accent reaches 15.17',
    ]);
  });

  it('measures in a later block only the pairs that block changes', () => {
    const [, dark, soft] = auditPalette(themesFromCss(SAMPLE_CSS));
    expect(dark?.colors).toBe(4);
    expect(dark?.pairs.map((p) => `${p.text} ${p.surface} ${p.ratio}`)).toEqual(['--ink --bg 21', '--ink --surface 21', '--header-ink --header 21']);
    expect(soft?.colors).toBe(2);
    expect(soft?.pairs.map((p) => `${p.text} ${p.surface} ${p.status} ${p.ratio}`)).toEqual(['--accent-ink --accent below 2.14']);
  });

  it('pairs a token a later block sets with the surface it takes over from the first', () => {
    const css = ':root{--card:#ffffff;--card-ink:#000000}\n.quiet{--card-ink:#aaaaaa}';
    const [, quiet] = auditPalette(themesFromCss(css));
    expect(quiet?.pairs).toHaveLength(1);
    expect(quiet?.pairs[0]).toMatchObject({ text: '--card-ink', surface: '--card', status: 'below' });
  });

  it('looks at extra pairs when they are passed in, once each, and only if both tokens exist', () => {
    const themes = themesFromCss(SAMPLE_CSS);
    const extra = [
      { text: '--muted', surface: '--bg' },
      { text: '--ink', surface: '--bg' },
      { text: '--muted', surface: '--nowhere' },
    ];
    const [root] = auditPalette(themes, { pairs: extra });
    expect(root?.pairs).toHaveLength(5);
    expect(root?.pairs.at(-1)).toMatchObject({ text: '--muted', surface: '--bg', status: 'reaches' });
  });

  it('uses 4.5 to 1 unless told otherwise', () => {
    expect(DEFAULT_REQUIRED).toBe(4.5);
    const css = ':root{--a:#ffffff;--a-ink:#777777}';
    expect(auditPalette(themesFromCss(css))[0]?.pairs[0]?.status).toBe('below');
    expect(auditPalette(themesFromCss(css), { required: 3 })[0]?.pairs[0]?.status).toBe('reaches');
  });

  it('has no pair, and still the count of colours, when no names go together', () => {
    expect(auditPalette(themesFromCss(':root{--one:#fff;--two:#000}'))).toEqual([{ label: ':root', colors: 2, pairs: [] }]);
    expect(auditPalette([])).toEqual([]);
  });
});

describe('pairSentence', () => {
  const pairs = auditPalette(themesFromCss(`${SAMPLE_CSS}\n.x{--glass: rgb(0 0 0 / 50%);--glass-ink:#fff;--brand: oklch(0.5 0.1 200);--brand-ink:#fff;--note-fg: var(--nope);--note-bg:#fff}`)).flatMap((t) => t.pairs);
  const find = (text: string) => {
    const p = pairs.filter((x) => x.text === text).at(-1);
    if (!p) throw new Error(text);
    return p;
  };

  it('says what was measured for a pair that reaches the minimum', () => {
    expect(pairSentence(find('--header-ink'), 4.5, 'en')).toBe('--header-ink on --header: 21.00:1, which reaches 4.5:1.');
    expect(pairSentence(find('--header-ink'), 4.5, 'fr')).toBe(`--header-ink sur --header${NBSP}: 21,00${NBSP}:${NBSP}1, ce qui atteint 4,5${NBSP}:${NBSP}1.`);
  });

  it('gives the ratio, the minimum and an example for a pair below it', () => {
    expect(pairSentence(find('--accent-ink'), 4.5, 'en')).toBe('--accent-ink on --accent: 2.14:1, below the 4.5:1 minimum. For example, text in #78683a gives 4.53:1 on this background.');
    expect(pairSentence(find('--accent-ink'), 4.5, 'fr')).toContain(`sous le minimum de 4,5${NBSP}:${NBSP}1. Par exemple, un texte en #78683a`);
  });

  it('says UNKNOWN and why, in both languages, for a pair it could not measure', () => {
    expect(pairSentence(find('--glass-ink'), 4.5, 'en')).toBe('--glass-ink on --glass: UNKNOWN, the surface is partly transparent, and what is behind it depends on the page.');
    expect(pairSentence(find('--brand-ink'), 4.5, 'en')).toBe('--brand-ink on --brand: UNKNOWN, the value of --brand could not be read as a colour.');
    expect(pairSentence(find('--note-fg'), 4.5, 'en')).toBe('--note-fg on --note-bg: UNKNOWN, the value of --note-fg could not be read as a colour.');
    for (const name of ['--glass-ink', '--brand-ink', '--note-fg']) expect(pairSentence(find(name), 4.5, 'fr')).toContain(`${NBSP}: UNKNOWN, `);
  });

  it('follows French typography and never words a ratio as a pass', () => {
    for (const p of pairs) {
      expect(frTypographyIssues(pairSentence(p, 4.5, 'fr')), p.text).toEqual([]);
      expect(pairSentence(p, 4.5, 'en')).not.toMatch(/\b(pass(es|ed)?|compliant|conforms?|AA)\b/);
      expect(pairSentence(p, 4.5, 'fr')).not.toMatch(/conforme|a réussi/);
    }
  });
});

describe('paletteEntries', () => {
  const themes = auditPalette(themesFromCss(`${SAMPLE_CSS}\n.x{--glass: rgb(0 0 0 / 50%);--glass-ink:#fff}`));

  it('counts every pair and reports only those below the minimum or not measured', () => {
    const result = paletteEntries(themes);
    expect(result.checked).toBe(9);
    expect(result.entries.map((e) => [e.check, e.rule, e.status, e.id])).toEqual([
      ['contrast', 'token-pair-low', 'fail', '[data-theme="soft"] --accent-ink --accent'],
      ['contrast', 'token-pair-unmeasured', 'unknown', '.x --glass-ink --glass'],
    ]);
  });

  it('has both languages with French typography', () => {
    noFrIssues(paletteEntries(themes).entries);
  });

  it('gives different ids to the same pair in two blocks', () => {
    const css = ':root{--a:#fff;--a-ink:#999}\n.b{--a-ink:#aaa}';
    const ids = paletteEntries(auditPalette(themesFromCss(css))).entries.map((e) => e.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('clips a very long block label in the id', () => {
    const css = `${'.very-long-selector-name '.repeat(8)}{--a:#fff;--a-ink:#999}`;
    const id = paletteEntries(auditPalette(themesFromCss(css))).entries[0]?.id ?? '';
    expect(id.length).toBeLessThan(90);
    expect(id.endsWith(' --a-ink --a')).toBe(true);
  });

  it('is empty for no theme', () => {
    expect(paletteEntries([])).toEqual({ checked: 0, entries: [] });
  });
});

describe('pageCss', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const withDocument = (doc: unknown, body: () => void): void => {
    const had = 'document' in g;
    const before = g['document'];
    g['document'] = doc;
    try {
      body();
    } finally {
      if (had) g['document'] = before;
      else delete g['document'];
    }
  };

  it('is empty outside a browser', () => {
    expect(pageCss()).toEqual({ text: '', unreadable: 0 });
  });

  it('joins the rules of every sheet it may read and counts those it may not', () => {
    const locked = {
      get cssRules(): never {
        throw new Error('SecurityError');
      },
    };
    const sheets = [{ cssRules: [{ cssText: ':root { --ink: #000; }' }, { cssText: 'p { color: red; }' }] }, locked, { cssRules: [{ cssText: '.dark { --ink: #fff; }' }] }];
    withDocument({ styleSheets: sheets }, () => {
      const css = pageCss();
      expect(css.unreadable).toBe(1);
      expect(css.text).toBe(':root { --ink: #000; }\np { color: red; }\n.dark { --ink: #fff; }');
      expect(themesFromCss(css.text).map((t) => t.label)).toEqual([':root', '.dark']);
    });
  });

  it('is empty for a document with no style sheet', () => {
    withDocument({ styleSheets: [] }, () => expect(pageCss()).toEqual({ text: '', unreadable: 0 }));
    withDocument({}, () => expect(pageCss()).toEqual({ text: '', unreadable: 0 }));
  });
});
