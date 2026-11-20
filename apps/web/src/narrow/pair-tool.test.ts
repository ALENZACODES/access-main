import { describe, expect, it } from 'vitest';
import { readColor } from './colorspace.js';
import { contrastRatio, type Rgba } from './contrast.js';
import { auditCopy } from './copylint.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { SAMPLE_CSS, pageAround, textOf } from './pair-testkit.js';
import { EMPTY_PAIR, MAX_PAIRS, MAX_THEMES, PAIR_CSS, PAIR_SELECTORS, comparePair, headline, isPairAction, pairStep, pairTool, ratioOf, renderPairTool, withInputs, type PairState } from './pair-tool.js';
import type { PageCss } from './palette.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const typed = (text: string, background: string, large = false): PairState => ({ ...EMPTY_PAIR, text, background, large });
const css = (text = SAMPLE_CSS, unreadable = 0) => (): PageCss => ({ text, unreadable });
const noCss = (): PageCss => {
  throw new Error('the style sheets are not needed for this action');
};
const c = (s: string): Rgba => readColor(s) as Rgba;

/** States that draw every part of the tool. */
const states = (lang: 'en' | 'fr'): Array<[string, PairState]> => [
  ['at first', EMPTY_PAIR],
  ['with a pair below the minimum', comparePair(typed('#777777', 'white'), lang)],
  ['with a pair that reaches it', comparePair(typed('#1b1916', '#fffdf8'), lang)],
  ['with large text', comparePair(typed('#999', '#fff', true), lang)],
  ['with both fields in error', comparePair(typed('zzz', ''), lang)],
  ['with a transparent background', comparePair(typed('#000', '#0008'), lang)],
  ['with transparent text', comparePair(typed('rgb(0 0 0 / 50%)', '#fff'), lang)],
  ['with no suggestion on either side', { ...comparePair(typed('#808080', '#777777'), lang), outcome: { kind: 'measured', text: '#808080', background: '#777777', large: false, blended: false, fix: { ratio: 1.11, required: 7, meets: false, text: [], background: [] } } }],
  ['with tokens', pairStep(comparePair(typed('#777777', 'white'), lang), 'pair-tokens', lang, css(`${SAMPLE_CSS}\n.x{--glass: rgb(0 0 0 / 50%);--glass-ink:#fff}`, 2)).state],
  ['with no token', pairStep(EMPTY_PAIR, 'pair-tokens', lang, css('p{color:red}')).state],
];

describe('withInputs', () => {
  it('takes what the form holds and keeps the rest', () => {
    const state = comparePair(typed('#000', '#fff'), 'en');
    const next = withInputs(state, { text: '#111' });
    expect(next.text).toBe('#111');
    expect(next.background).toBe('#fff');
    expect(next.outcome).toBe(state.outcome);
    expect(withInputs(state, {})).toEqual(state);
    expect(withInputs(state, { large: true, background: 'white' })).toMatchObject({ large: true, background: 'white', text: '#000' });
  });

  it('names the three fields it reads', () => {
    expect(PAIR_SELECTORS).toEqual({ text: '#pair-text', background: '#pair-background', large: '#pair-large' });
  });
});

describe('comparePair', () => {
  it('measures a pair and says in one sentence whether it reaches the minimum', () => {
    const s = comparePair(typed('#777777', 'white'), 'en');
    expect(s.errors).toEqual([]);
    expect(s.outcome).toMatchObject({ kind: 'measured', text: '#777777', background: '#ffffff', large: false, blended: false });
    expect(s.notice).toBe('Contrast is 4.47:1. It is below the 4.5:1 minimum for normal text.');
    expect(comparePair(typed('#1b1916', '#fffdf8'), 'en').notice).toBe('Contrast is 17.25:1. It reaches the 4.5:1 minimum for normal text.');
  });

  it('uses 3 to 1 for large text', () => {
    const s = comparePair(typed('#777777', '#ffffff', true), 'en');
    expect(s.notice).toBe('Contrast is 4.47:1. It reaches the 3.0:1 minimum for large text.');
    expect(s.outcome?.kind === 'measured' && s.outcome.fix.required).toBe(3);
    expect(comparePair(typed('#aaa', '#fff', true), 'en').notice).toBe('Contrast is 2.32:1. It is below the 3.0:1 minimum for large text.');
  });

  it('says it in French', () => {
    expect(comparePair(typed('#777777', 'white'), 'fr').notice).toBe(`Le contraste est de 4,47${NBSP}:${NBSP}1. Il est sous le minimum de 4,5${NBSP}:${NBSP}1 pour un texte normal.`);
    expect(comparePair(typed('#000', '#fff', true), 'fr').notice).toBe(`Le contraste est de 21,00${NBSP}:${NBSP}1. Il atteint le minimum de 3,0${NBSP}:${NBSP}1 pour un grand texte.`);
  });

  it('asks for a colour in an empty field, and says how to write one that was not read', () => {
    const s = comparePair(typed('zzz', '  '), 'en');
    expect(s.outcome).toBeNull();
    expect(s.errors).toEqual([
      { field: 'text', message: '“zzz” was not read as a colour. Write the text colour like #1b1916, rgb(27 25 22) or hsl(36 10% 10%).' },
      { field: 'background', message: 'Type the background colour.' },
    ]);
    expect(s.notice).toBe(`The colours could not be compared. ${s.errors[0]?.message} ${s.errors[1]?.message}`);
  });

  it('reports only the field that is wrong', () => {
    expect(comparePair(typed('#000', 'var(--bg)'), 'en').errors.map((e) => e.field)).toEqual(['background']);
    expect(comparePair(typed('', '#fff'), 'en').errors).toEqual([{ field: 'text', message: 'Type the text colour.' }]);
  });

  it('shortens a very long entry in the message', () => {
    const s = comparePair(typed('x'.repeat(200), '#fff'), 'en');
    expect(s.errors[0]?.message.length).toBeLessThan(140);
  });

  it('writes the errors in French with French typography', () => {
    const s = comparePair(typed('zzz', ''), 'fr');
    expect(s.errors[0]?.message).toBe('«\u202Fzzz\u202F» n’a pas été lu comme une couleur. Écrivez la couleur du texte comme #1b1916, rgb(27 25 22) ou hsl(36 10% 10%).');
    expect(s.errors[1]?.message).toBe('Saisissez la couleur d’arrière-plan.');
    expect(comparePair(typed('', 'zzz'), 'fr').errors[0]?.message).toBe('Saisissez la couleur du texte.');
    for (const e of [...s.errors, ...comparePair(typed('', 'zzz'), 'fr').errors]) expect(frTypographyIssues(e.message), e.message).toEqual([]);
    expect(frTypographyIssues(s.notice)).toEqual([]);
  });

  it('is UNKNOWN, with no number, when the background has transparency', () => {
    const s = comparePair(typed('#000', 'rgb(255 255 255 / 80%)'), 'en');
    expect(s.outcome).toEqual({ kind: 'unknown', background: 'rgb(255 255 255 / 80%)' });
    expect(s.errors).toEqual([]);
    expect(s.notice).toContain('Contrast UNKNOWN.');
    expect(s.notice).not.toMatch(/\d:1/);
    expect(comparePair(typed('#000', 'transparent'), 'fr').notice).toContain('Contraste UNKNOWN.');
  });

  it('lays transparent text over the background and measures what is seen', () => {
    const s = comparePair(typed('rgb(0 0 0 / 50%)', '#ffffff'), 'en');
    expect(s.outcome).toMatchObject({ kind: 'measured', text: '#808080', blended: true });
    expect(s.outcome?.kind === 'measured' && s.outcome.fix.ratio).toBe(3.97);
  });

  it('clears earlier errors once the pair is measured', () => {
    const bad = comparePair(typed('zzz', ''), 'en');
    expect(comparePair({ ...bad, text: '#000', background: '#fff' }, 'en').errors).toEqual([]);
  });

  it('keeps the tokens that were read', () => {
    const withTokens = pairStep(EMPTY_PAIR, 'pair-tokens', 'en', css()).state;
    expect(comparePair({ ...withTokens, text: '#000', background: '#fff' }, 'en').tokens).toBe(withTokens.tokens);
  });
});

describe('headline', () => {
  it('never words the result as a pass or as conformance', () => {
    for (const lang of LANGS) {
      for (const [, s] of states(lang)) {
        if (!s.outcome) continue;
        const line = headline(s.outcome, lang);
        expect(line).not.toMatch(/\b(pass(es|ed)?|compliant|conforms?|accessible)\b|conforme|a réussi/i);
        if (lang === 'fr') expect(frTypographyIssues(line), line).toEqual([]);
      }
    }
  });
});

describe('isPairAction', () => {
  it.each(['pair-compare', 'pair-swap', 'pair-clear', 'pair-tokens', 'pair-use-text-0', 'pair-use-background-1'])('takes %s', (a) => {
    expect(isPairAction(a)).toBe(true);
  });

  it.each([null, '', 'run', 'lang-fr', 'copy-json', 'pair-', 'pair-use-text-', 'pair-use-other-0', 'xpair-compare', 'pair-compare-now', 'fit-make'])('leaves %j alone', (a) => {
    expect(isPairAction(a)).toBe(false);
  });
});

describe('pairStep', () => {
  it('compares, and puts focus on the heading of the result', () => {
    const step = pairStep(typed('#777777', '#fff'), 'pair-compare', 'en', noCss);
    expect(step.focus).toBe('#pair-result-h');
    expect(step.state.outcome?.kind).toBe('measured');
  });

  it('puts focus on the first field in error', () => {
    expect(pairStep(typed('', ''), 'pair-compare', 'en', noCss).focus).toBe('#pair-text');
    expect(pairStep(typed('#000', 'nope'), 'pair-compare', 'en', noCss).focus).toBe('#pair-background');
  });

  it('swaps the two colours, and measures again when there was a result', () => {
    const before = comparePair(typed('#ffd84a', '#083734'), 'en');
    const step = pairStep(before, 'pair-swap', 'en', noCss);
    expect(step.state.text).toBe('#083734');
    expect(step.state.background).toBe('#ffd84a');
    expect(step.state.outcome).toMatchObject({ kind: 'measured', text: '#083734', background: '#ffd84a' });
    expect(step.focus).toBe('[data-action="pair-swap"]');
  });

  it('swaps without measuring when nothing was measured yet', () => {
    const step = pairStep(typed('#000', ''), 'pair-swap', 'en', noCss);
    expect(step.state).toMatchObject({ text: '', background: '#000', outcome: null, errors: [] });
  });

  it('gives the same ratio after a swap of two opaque colours', () => {
    const a = comparePair(typed('#6b2d12', '#efe4cc'), 'en');
    const b = pairStep(a, 'pair-swap', 'en', noCss).state;
    expect(a.outcome?.kind === 'measured' && a.outcome.fix.ratio).toBe(b.outcome?.kind === 'measured' && b.outcome.fix.ratio);
  });

  it('erases the colours and the result, keeps the tokens, and says so', () => {
    const full = pairStep(comparePair(typed('#777', '#fff', true), 'en'), 'pair-tokens', 'en', css()).state;
    const step = pairStep(full, 'pair-clear', 'en', noCss);
    expect(step.state).toMatchObject({ text: '', background: '', large: false, outcome: null, errors: [], notice: 'Both colours and the result were erased.' });
    expect(step.state.tokens).toBe(full.tokens);
    expect(step.focus).toBe('#pair-text');
    expect(pairStep(full, 'pair-clear', 'fr', noCss).state.notice).toBe('Les deux couleurs et le résultat ont été effacés.');
  });

  it('reads the tokens of the page and puts focus on their heading', () => {
    const step = pairStep(typed('#000', '#fff'), 'pair-tokens', 'en', css(SAMPLE_CSS, 1));
    expect(step.state.tokens?.themes.map((t) => t.label)).toEqual([':root', '@media (prefers-color-scheme: dark) :root', '[data-theme="soft"]']);
    expect(step.state.tokens?.unreadable).toBe(1);
    expect(step.state.notice).toBe('Colour tokens read.');
    expect(step.focus).toBe('#pair-tokens-h');
    expect(step.state.text).toBe('#000');
  });

  it('uses a suggested text colour: the pair then reaches the minimum', () => {
    const before = comparePair(typed('#777777', 'white'), 'en');
    const step = pairStep(before, 'pair-use-text-0', 'en', noCss);
    expect(step.state.text).toBe('#767676');
    expect(step.state.background).toBe('#ffffff');
    expect(step.state.outcome?.kind === 'measured' && step.state.outcome.fix.meets).toBe(true);
    expect(step.state.notice).toBe('Contrast is 4.54:1. It reaches the 4.5:1 minimum for normal text.');
    expect(step.focus).toBe('#pair-result-h');
  });

  it('uses a suggested background colour and keeps the text', () => {
    const before = comparePair(typed('#777777', 'white'), 'en');
    const hex = before.outcome?.kind === 'measured' ? before.outcome.fix.background[0]?.hex : undefined;
    const step = pairStep(before, 'pair-use-background-0', 'en', noCss);
    expect(step.state.background).toBe(hex);
    expect(step.state.text).toBe('#777777');
    expect(step.state.outcome?.kind === 'measured' && step.state.outcome.fix.meets).toBe(true);
  });

  it('every suggestion it offers reaches the minimum once used', () => {
    for (const [fg, bg, large] of [['#777777', '#fff', false], ['#ffd84a', '#fff', false], ['#0000ff', '#000080', false], ['#3d3832', '#1b1916', false], ['#aaa', '#fff', true], ['#7a7a7a', '#777777', true]] as const) {
      const before = comparePair(typed(fg, bg, large), 'en');
      if (before.outcome?.kind !== 'measured') throw new Error('not measured');
      const { fix } = before.outcome;
      expect(fix.text.length + fix.background.length, `${fg} ${bg}`).toBeGreaterThan(0);
      fix.text.forEach((_, i) => {
        const after = pairStep(before, `pair-use-text-${i}`, 'en', noCss).state;
        expect(after.outcome?.kind === 'measured' && after.outcome.fix.meets, `${fg} ${bg} text ${i}`).toBe(true);
      });
      fix.background.forEach((_, i) => {
        const after = pairStep(before, `pair-use-background-${i}`, 'en', noCss).state;
        expect(after.outcome?.kind === 'measured' && after.outcome.fix.meets, `${fg} ${bg} background ${i}`).toBe(true);
      });
    }
  });

  it('does not blend transparent text a second time when a background suggestion is used', () => {
    const before = comparePair(typed('rgb(0 0 0 / 50%)', '#ffffff'), 'en');
    const step = pairStep(before, 'pair-use-background-0', 'en', noCss);
    expect(step.state.text).toBe('#808080');
    expect(step.state.outcome?.kind === 'measured' && step.state.outcome.blended).toBe(false);
    expect(step.state.outcome?.kind === 'measured' && step.state.outcome.fix.meets).toBe(true);
  });

  it('changes nothing for a suggestion that is not there', () => {
    const before = comparePair(typed('#777777', 'white'), 'en');
    expect(pairStep(before, 'pair-use-text-7', 'en', noCss)).toEqual({ state: before, focus: '[data-action="pair-compare"]' });
    expect(pairStep(EMPTY_PAIR, 'pair-use-text-0', 'en', noCss).state).toBe(EMPTY_PAIR);
    const met = comparePair(typed('#000', '#fff'), 'en');
    expect(pairStep(met, 'pair-use-background-0', 'en', noCss).state).toBe(met);
  });

  it('asks for the style sheets only when the tokens are asked for', () => {
    for (const action of ['pair-compare', 'pair-swap', 'pair-clear', 'pair-use-text-0'] as const) {
      expect(() => pairStep(comparePair(typed('#777', '#fff'), 'en'), action, 'en', noCss)).not.toThrow();
    }
    expect(() => pairStep(EMPTY_PAIR, 'pair-tokens', 'en', noCss)).toThrow();
  });
});

describe('renderPairTool', () => {
  it('starts with an h2 and has a section for the tokens under an h3', () => {
    const html = renderPairTool('en', EMPTY_PAIR);
    expect(html).toContain('<h2 id="pair-h">Compare two colours</h2>');
    expect(html.match(/<h2[ >]/g)).toHaveLength(1);
    expect(html.match(/<h3[ >]/g)).toHaveLength(1);
    expect(html).toContain('<section aria-labelledby="pair-tokens-h"><h3 id="pair-tokens-h" tabindex="-1">Colour tokens of this page</h3>');
    expect(html).not.toContain('pair-result-h');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderPairTool('en', pairStep(comparePair(typed('#777', '#fff'), 'en'), 'pair-tokens', 'en', css()).state, 3);
    expect(html.match(/<h2[ >]/g)).toBeNull();
    expect(html.match(/<h3[ >]/g)).toHaveLength(1);
    expect(html.match(/<h4[ >]/g)).toHaveLength(2);
    expect(html.match(/<h5[ >]/g)).toHaveLength(4);
  });

  it('gives each field a visible label, a shared hint and no browser help that gets in the way', () => {
    const html = renderPairTool('en', EMPTY_PAIR);
    for (const id of ['pair-text', 'pair-background', 'pair-large']) {
      expect(html.match(new RegExp(` id="${id}"`, 'g')), id).toHaveLength(1);
      expect(html.match(new RegExp(`<label[^>]* for="${id}"`, 'g')), id).toHaveLength(1);
    }
    expect(html.match(/aria-describedby="pair-hint"/g)).toHaveLength(2);
    expect(html.match(/autocomplete="off" autocapitalize="none" spellcheck="false" aria-required="true"/g)).toHaveLength(2);
    expect(html).toContain('<p id="pair-hint">For example #1b1916, rgb(27 25 22), hsl(36 10% 10%) or white.</p>');
    expect(html).not.toContain(' aria-invalid=');
  });

  it('keeps what was typed, escaped, and the state of the box', () => {
    const html = renderPairTool('en', typed('"><b>x', '#FFF', true));
    expect(html).toContain('value="&quot;&gt;&lt;b&gt;x"');
    expect(html).toContain('value="#FFF"');
    expect(html).toContain('id="pair-large" name="pair-large" checked>');
    expect(html).not.toContain('<b>x');
  });

  it('puts each error in text under its field and points the field at it', () => {
    const html = renderPairTool('en', comparePair(typed('zzz', ''), 'en'));
    expect(html).toContain('aria-describedby="pair-hint pair-text-error" aria-invalid="true">');
    expect(html).toContain('<p class="pair-error" id="pair-text-error">“zzz” was not read as a colour.');
    expect(html).toContain('<p class="pair-error" id="pair-background-error">Type the background colour.</p>');
    expect(html).not.toContain('pair-result-h');
  });

  it('announces the result in a polite live region', () => {
    const html = renderPairTool('en', comparePair(typed('#777777', 'white'), 'en'));
    expect(html).toContain('<div role="status" aria-live="polite">Contrast is 4.47:1. It is below the 4.5:1 minimum for normal text.</div>');
  });

  it('shows the measured pair in a table of three uses, with a caption that gives the colours and the ratio', () => {
    const html = renderPairTool('en', comparePair(typed('#777777', 'white'), 'en'));
    expect(html).toContain('<caption>#777777 on #ffffff: 4.47:1</caption>');
    expect(html.match(/<th scope="col">/g)).toHaveLength(3);
    expect(html).toContain('<tr><th scope="row">Normal text</th><td>4.5:1</td><td>below it</td></tr>');
    expect(html).toContain('<tr><th scope="row">Large text</th><td>3.0:1</td><td>reaches it</td></tr>');
    expect(html).toContain('<tr><th scope="row">Parts of controls and graphics</th><td>3.0:1</td><td>reaches it</td></tr>');
  });

  it('compares the number it shows with each minimum, so 4.49 is never shown as reaching 4.5', () => {
    for (const [fg, bg] of [['#777777', '#ffffff'], ['#767676', '#ffffff'], ['#949494', '#ffffff'], ['#959595', '#ffffff']] as const) {
      const html = renderPairTool('en', comparePair(typed(fg, bg), 'en'));
      const raw = contrastRatio(c(fg), c(bg));
      expect(html.includes('<td>4.5:1</td><td>reaches it</td>'), fg).toBe(raw >= 4.5);
      expect(html.includes('<td>3.0:1</td><td>reaches it</td>'), fg).toBe(raw >= 3);
    }
  });

  it('always says what the ratio does not tell', () => {
    for (const s of [comparePair(typed('#777', '#fff'), 'en'), comparePair(typed('#000', '#fff'), 'en')]) {
      expect(renderPairTool('en', s)).toContain('It does not tell whether a text is easy to read');
      expect(renderPairTool('en', s)).toContain('it says nothing about a whole page');
    }
  });

  it('lists the suggestions with a button that names the colour and where it goes', () => {
    const html = renderPairTool('en', comparePair(typed('#777777', 'white'), 'en'));
    expect(html).toContain('<h4 id="pair-suggest-h">Closest colours that reach the minimum</h4>');
    expect(html).toContain('Darker text: #767676 gives 4.54:1. <button type="button" data-action="pair-use-text-0">Use #767676 for the text</button>');
    expect(html).toMatch(/Darker background: #[0-9a-f]{6} gives 4\.5\d:1\. <button type="button" data-action="pair-use-background-0">Use #[0-9a-f]{6} for the background<\/button>/);
    expect(html).toContain('They are examples, and the choice stays with the designer.');
  });

  it('gives every suggestion button a different name', () => {
    for (const lang of LANGS) {
      const html = renderPairTool(lang, comparePair(typed('#7a7a7a', '#777777', true), lang));
      const labels = [...html.matchAll(/data-action="pair-use-[a-z]+-\d">([^<]+)</g)].map((m) => m[1]);
      expect(labels.length).toBeGreaterThanOrEqual(3);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('has no suggestions for a pair that reaches the minimum', () => {
    const html = renderPairTool('en', comparePair(typed('#000', '#fff'), 'en'));
    expect(html).not.toContain('pair-suggest-h');
    expect(html).not.toContain('pair-use-');
  });

  it('says both colours have to change when neither side can do it alone', () => {
    const state = states('en').find(([name]) => name === 'with no suggestion on either side')?.[1] as PairState;
    const html = renderPairTool('en', state);
    expect(html).toContain('No colour reaches the minimum by changing one side only. Both colours have to change.');
    expect(html).not.toContain('pair-use-');
  });

  it('shows a swatch for each colour, hidden from assistive technology, next to the value in text', () => {
    const html = renderPairTool('en', comparePair(typed('#777777', 'white'), 'en'));
    const swatches = html.match(/<span class="pair-swatch" aria-hidden="true" style="background:#[0-9a-f]{6}"><\/span>/g) ?? [];
    expect(swatches).toHaveLength(4);
    expect(html).toContain('style="background:#777777"></span><span class="pair-swatch" aria-hidden="true" style="background:#ffffff"></span>Contrast is 4.47:1.');
  });

  it('writes only colours it computed into a style attribute, never what was typed', () => {
    const nasty = 'red;background:url(//x)';
    for (const s of [typed(nasty, nasty), comparePair(typed(nasty, '#fff'), 'en'), comparePair(typed('#FFF', '#000'), 'en')]) {
      const html = renderPairTool('en', s);
      for (const m of html.matchAll(/ style="([^"]*)"/g)) expect(m[1]).toMatch(/^background:#[0-9a-f]{6}$/);
    }
  });

  it('says UNKNOWN in the result for a transparent background, with no table', () => {
    for (const lang of LANGS) {
      const html = renderPairTool(lang, comparePair(typed('#000', '#0008'), lang));
      const result = html.slice(html.indexOf('pair-result-h'), html.indexOf('pair-tokens-h'));
      expect(result).toContain('UNKNOWN');
      expect(result).not.toContain('<table');
      expect(result).not.toContain('pair-swatch');
    }
  });

  it('says which colour was measured when the text has transparency', () => {
    const html = renderPairTool('en', comparePair(typed('rgb(0 0 0 / 50%)', '#fff'), 'en'));
    expect(html).toContain('The text colour is partly transparent. Laid over this background it gives #808080, and that is the colour measured.');
    expect(renderPairTool('en', comparePair(typed('#808080', '#fff'), 'en'))).not.toContain('partly transparent');
  });

  it('labels the control that erases by what it erases', () => {
    expect(renderPairTool('en', EMPTY_PAIR)).toContain('<button type="button" data-action="pair-clear">Erase both colours and the result</button>');
    expect(renderPairTool('fr', EMPTY_PAIR)).toContain('data-action="pair-clear">Effacer les deux couleurs et le résultat</button>');
  });

  it('has only buttons of type button, each with text', () => {
    for (const [name, s] of states('en')) {
      const buttons = renderPairTool('en', s).match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
      expect(buttons.length, name).toBeGreaterThanOrEqual(4);
      for (const b of buttons) {
        expect(b).toContain('type="button"');
        expect(b.replace(/<[^>]+>/g, '').trim()).not.toBe('');
      }
    }
  });

  it('has no form that submits, no script, no image and no address', () => {
    for (const lang of LANGS) {
      for (const [, s] of states(lang)) expect(renderPairTool(lang, s)).not.toMatch(/<form|<script|\saction=|https?:\/\/|<img|<iframe|\shref=/i);
    }
  });

  it('has no duplicate id in any state', () => {
    for (const [name, s] of states('en')) {
      const ids = [...renderPairTool('en', s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });
});

describe('the tokens of the page in the tool', () => {
  const read = (text: string, unreadable = 0, lang: 'en' | 'fr' = 'en'): string => renderPairTool(lang, pairStep(EMPTY_PAIR, 'pair-tokens', lang, css(text, unreadable)).state);

  it('lists each block with its count and its pairs in words', () => {
    const html = read(SAMPLE_CSS);
    expect(html).toContain('<h4><code>:root</code></h4><p>8 colour tokens read, 4 pairs measured from the names.</p>');
    expect(html).toContain('<li>--header-ink on --header: 13.07:1, which reaches 4.5:1.</li>');
    expect(html).toContain('<h4><code>[data-theme=&quot;soft&quot;]</code></h4><p>2 colour tokens read, 1 pair measured from the names.</p>');
    expect(html).toContain('<li>--accent-ink on --accent: 2.14:1, below the 4.5:1 minimum. For example, text in #78683a gives 4.53:1 on this background.</li>');
  });

  it('uses the singular for one token', () => {
    expect(read(':root{--a:#fff}')).toContain('1 colour token read, 0 pairs measured from the names.');
    expect(read(':root{--a:#fff}', 0, 'fr')).toContain('1 jeton de couleur lu, 0 paire mesurée d’après les noms.');
  });

  it('says so when no colour token is found', () => {
    expect(read('p{color:red}')).toContain('No colour token was found in the style sheets of this page.');
    expect(read('')).toContain('No colour token was found');
  });

  it('says UNKNOWN for style sheets the page could not read', () => {
    expect(read(SAMPLE_CSS, 2)).toContain('2 style sheets could not be read by the page. Their tokens are UNKNOWN.');
    expect(read(SAMPLE_CSS, 1)).toContain('1 style sheet could not be read by the page. Their tokens are UNKNOWN.');
    expect(read('', 3, 'fr')).toContain('3 feuilles de style n’ont pas pu être lues par la page. Leurs jetons sont UNKNOWN.');
    expect(read(SAMPLE_CSS, 0)).not.toContain('could not be read by the page');
  });

  it('shows a limited number of pairs and blocks and says how many are left out', () => {
    const many = `:root{${Array.from({ length: MAX_PAIRS + 3 }, (_, i) => `--c${i}:#ffffff;--c${i}-ink:#000000;`).join('')}}`;
    const html = read(many);
    expect(html.match(/<li>--c\d+-ink on/g)).toHaveLength(MAX_PAIRS);
    expect(html).toContain('… and 3 more.');
    const blocks = Array.from({ length: MAX_THEMES + 2 }, (_, i) => `.t${i}{--a:#fff;--a-ink:#00000${i}}`).join('\n');
    const html2 = read(blocks);
    expect(html2.match(/<h4>/g)).toHaveLength(MAX_THEMES);
    expect(html2).toContain('2 more blocks of tokens are not shown.');
    expect(read(blocks, 0, 'fr')).toContain('2 autres blocs de jetons ne sont pas affichés.');
  });

  it('escapes and shortens a block label', () => {
    const html = read(`.a > .b[title="<x>"] ${'.long-selector '.repeat(12)}{--a:#fff;--a-ink:#000}`);
    expect(html).toContain('<h4><code>.a &gt; .b[title=&quot;&lt;x&gt;&quot;]');
    expect((/<h4><code>([^<]*)<\/code>/.exec(html)?.[1] ?? '').length).toBeLessThan(140);
  });

  it('has only the button before the tokens are read', () => {
    const html = renderPairTool('en', EMPTY_PAIR);
    const section = html.slice(html.indexOf('pair-tokens-h'));
    expect(section).toContain('data-action="pair-tokens">Read the colour tokens of this page</button>');
    expect(section).not.toContain('<h4>');
    expect(section).not.toContain('<ul>');
  });
});

describe('the styles of the tool', () => {
  it('gives buttons, fields and the box a 44 pixel minimum', () => {
    expect(PAIR_CSS).toContain('.pair button{min-height:44px;min-width:44px;');
    expect(PAIR_CSS).toContain('.pair .pair-field{display:block;width:100%;max-width:20rem;min-height:44px;');
    expect(PAIR_CSS).toContain('.pair .pair-check input{width:44px;height:44px;');
  });

  it('wraps on a narrow screen and hides nothing', () => {
    expect(PAIR_CSS).toContain('table-layout:fixed');
    expect(PAIR_CSS).toContain('overflow-wrap:anywhere');
    expect(PAIR_CSS).toContain('flex-wrap:wrap');
    expect(PAIR_CSS).not.toMatch(/white-space:nowrap|overflow:hidden|position:(fixed|absolute)|display:none/);
  });

  it('shows focus, never removes an outline, and sets no colour of its own', () => {
    expect(PAIR_CSS).toContain(':focus-visible');
    expect(PAIR_CSS).not.toMatch(/outline:(0|none)/);
    expect(PAIR_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(PAIR_CSS).not.toMatch(/animation|transition/);
  });

  it('keeps the swatch its colour in forced colours, with a border that follows the text colour', () => {
    expect(PAIR_CSS).toContain('.pair .pair-swatch{display:inline-block;width:1.25em;height:1.25em;border:2px solid currentColor;');
    expect(PAIR_CSS).toContain('forced-color-adjust:none');
  });

  it('scopes every rule to the tool', () => {
    for (const rule of PAIR_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.pair'), selector).toBe(true);
    }
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderPairTool(lang, state), lang);
        const results = { ...markupResults(html), 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) };
        const all = Object.values(results).flatMap((r) => (r ? r.entries : []));
        expect(all.map((e) => `${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`)).toEqual([]);
        expect(Object.values(results).reduce((n, r) => n + (r ? r.checked : 0), 0)).toBeGreaterThan(20);
      });
    }
  }
});

describe('the wording of the tool', () => {
  const allText = (lang: 'en' | 'fr'): string =>
    states(lang)
      // A block label is CSS as the style sheet wrote it, not copy.
      .map(([, s]) => textOf(renderPairTool(lang, s).replace(/<code>[^<]*<\/code>/g, '')))
      .join('\n');

  it('follows French typography in every state', () => {
    for (const line of allText('fr').split('\n')) {
      if (line.trim() === '') continue;
      expect(frTypographyIssues(line), line).toEqual([]);
    }
  });

  it('has no straight apostrophe in French', () => {
    expect(allText('fr')).not.toMatch(/\p{L}'\p{L}/u);
  });

  it('makes none of the claims the App does not make, and no claim of conformance', () => {
    expect(allText('en')).not.toMatch(/verif|real.?time|partner|guarantee|certif|complian|conform|\bpass(es|ed)?\b|\bAA\b/i);
    expect(allText('fr')).not.toMatch(/vérif|temps réel|partenari|garanti|certifi|conform|a réussi/i);
  });

  it('is fully translated: no English phrase of the tool is left in the French', () => {
    const fr = allText('fr');
    for (const phrase of ['Compare two', 'Compare the', 'Text colour', 'Background', 'Swap', 'Erase', 'Result', 'Minimum:', 'This pair', 'Normal text', 'Large text', 'reaches', 'below', 'Closest', 'Use #', 'Read the', 'For example', 'Contrast is', 'Darker', 'Lighter', ' on --', 'tokens read']) {
      expect(fr, phrase).not.toContain(phrase);
    }
  });

  it('keeps the token UNKNOWN in French', () => {
    const fr = allText('fr');
    expect(fr).toContain('Contraste UNKNOWN.');
    expect(fr).toContain('Leurs jetons sont UNKNOWN.');
    expect(fr).toContain(`--glass-ink sur --glass${NBSP}: UNKNOWN,`);
  });

  it('has the title in both languages', () => {
    expect(pairTool.title).toEqual({ en: 'Compare two colours', fr: 'Comparer deux couleurs' });
  });
});

describe('ratioOf', () => {
  it('gives the ratio of two colours as typed', () => {
    expect(ratioOf('#777777', 'white')).toBe(4.47);
    expect(ratioOf('000', 'FFF')).toBe(21);
    expect(ratioOf('rgb(0 0 0 / 50%)', '#fff')).toBe(3.97);
  });

  it('is null when a colour is not read or the background has transparency', () => {
    expect(ratioOf('nope', '#fff')).toBeNull();
    expect(ratioOf('#000', '')).toBeNull();
    expect(ratioOf('#000', '#ffffff80')).toBeNull();
  });
});
