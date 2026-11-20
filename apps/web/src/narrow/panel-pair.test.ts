import { describe, expect, it } from 'vitest';
import { SAMPLE_CSS, fakeRoot, settle, type FakeRoot } from './pair-testkit.js';
import { mountNarrowPanel, renderPanel } from './panel.js';
import { EMPTY_PAIR, comparePair } from './pair-tool.js';
import { smallSite } from './report-fixtures.js';
import { NBSP } from './types.js';

/** "Compare two colours" inside the audit panel: one root, one click handler, two tools that leave each other alone. */

interface Mounted {
  readonly root: FakeRoot;
  readonly panel: ReturnType<typeof mountNarrowPanel>;
  readonly langs: string[];
  cssReads: number;
  runs: number;
}

function mount(lang: 'en' | 'fr' = 'en', heading = false): Mounted {
  const root = fakeRoot();
  const m: Mounted = { root, langs: [], cssReads: 0, runs: 0, panel: undefined as never };
  const panel = mountNarrowPanel({
    root,
    lang,
    heading,
    onLang: (l) => m.langs.push(l),
    run: () => {
      m.runs += 1;
      return smallSite();
    },
    copy: async () => undefined,
    css: () => {
      m.cssReads += 1;
      return { text: SAMPLE_CSS, unreadable: 0 };
    },
  });
  return Object.assign(m, { panel });
}

describe('renderPanel', () => {
  it('is unchanged when no colour tool state is passed', () => {
    const html = renderPanel('en', { kind: 'idle' }, '', true);
    expect(html).not.toContain('class="pair"');
    expect(html.startsWith('<h1>Narrow-screen audit</h1>')).toBe(true);
  });

  it('draws the colour tool after the audit, under an h2', () => {
    const html = renderPanel('en', { kind: 'idle' }, '', true, EMPTY_PAIR);
    expect(html.indexOf('data-action="run"')).toBeLessThan(html.indexOf('<div class="pair">'));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('<h2 id="pair-h">Compare two colours</h2>');
    expect(html.endsWith('</section></div>')).toBe(true);
  });

  it('draws the state of the tool it is given, in the language of the panel', () => {
    const html = renderPanel('fr', { kind: 'idle' }, '', false, comparePair({ ...EMPTY_PAIR, text: '#777777', background: '#fff' }, 'fr'));
    expect(html).toContain('<h2 id="pair-h">Comparer deux couleurs</h2>');
    expect(html).toContain(`Le contraste est de 4,47${NBSP}:${NBSP}1.`);
    expect(html).not.toContain('<h1');
  });

  it('keeps two live regions apart: one for the audit, one for the tool', () => {
    const html = renderPanel('en', { kind: 'idle' }, '', false, comparePair({ ...EMPTY_PAIR, text: '#000', background: '#fff' }, 'en'));
    const regions = html.match(/<div role="status" aria-live="polite">[^<]*<\/div>/g) ?? [];
    expect(regions).toHaveLength(2);
    expect(regions[0]).toContain('No audit has been run yet.');
    expect(regions[1]).toContain('Contrast is 21.00:1.');
  });

  it('has no duplicate id with a report and a result on screen', () => {
    const pair = comparePair({ ...EMPTY_PAIR, text: '#777', background: '#fff' }, 'en');
    const html = renderPanel('en', { kind: 'done', report: smallSite() }, '', true, pair);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('pair-result-h');
    expect(ids).toContain('route-0');
  });
});

describe('mountNarrowPanel with the colour tool', () => {
  it('shows the tool at once, empty, and moves no focus', () => {
    const { root } = mount();
    expect(root.innerHTML).toContain('<h2 id="pair-h">Compare two colours</h2>');
    expect(root.innerHTML).toContain('id="pair-text" name="pair-text" value=""');
    expect(root.focused).toEqual([]);
  });

  it('compares what is typed and puts focus on the result', () => {
    const { root } = mount();
    root.type('#777777', 'white');
    root.click('pair-compare');
    expect(root.innerHTML).toContain('<caption>#777777 on #ffffff: 4.47:1</caption>');
    expect(root.innerHTML).toContain('value="#777777"');
    expect(root.innerHTML).toContain('value="white"');
    expect(root.focused).toEqual(['#pair-result-h']);
  });

  it('reads the large-text box', () => {
    const { root } = mount();
    root.type('#777777', '#fff', true);
    root.click('pair-compare');
    expect(root.innerHTML).toContain('It reaches the 3.0:1 minimum for large text.');
    expect(root.innerHTML).toContain('id="pair-large" name="pair-large" checked>');
  });

  it('refuses what is not a colour and puts focus on the field', () => {
    const { root } = mount();
    root.type('#000', 'nope');
    root.click('pair-compare');
    expect(root.innerHTML).toContain('id="pair-background-error"');
    expect(root.innerHTML).toContain('value="nope"');
    expect(root.focused).toEqual(['#pair-background']);
  });

  it('uses a suggestion: the field takes the colour and the pair reaches the minimum', () => {
    const { root } = mount();
    root.type('#777777', '#ffffff');
    root.click('pair-compare');
    // The person has not typed anything since: the form holds what was rendered.
    root.click('pair-use-text-0');
    expect(root.innerHTML).toContain('id="pair-text" name="pair-text" value="#767676"');
    expect(root.innerHTML).toContain('It reaches the 4.5:1 minimum for normal text.');
    expect(root.focused.at(-1)).toBe('#pair-result-h');
  });

  it('swaps and erases', () => {
    const { root } = mount();
    root.type('#083734', '#ffd84a');
    root.click('pair-swap');
    expect(root.innerHTML).toContain('id="pair-text" name="pair-text" value="#ffd84a"');
    expect(root.innerHTML).toContain('id="pair-background" name="pair-background" value="#083734"');
    expect(root.focused.at(-1)).toBe('[data-action="pair-swap"]');
    root.type('#ffd84a', '#083734');
    root.click('pair-clear');
    expect(root.innerHTML).toContain('id="pair-text" name="pair-text" value=""');
    expect(root.innerHTML).toContain('Both colours and the result were erased.');
    expect(root.focused.at(-1)).toBe('#pair-text');
  });

  it('reads the tokens of the page only when asked', () => {
    const m = mount();
    m.root.type('#000', '#fff');
    m.root.click('pair-compare');
    m.root.click('run');
    expect(m.cssReads).toBe(0);
    m.root.click('pair-tokens');
    expect(m.cssReads).toBe(1);
    expect(m.root.innerHTML).toContain('<h4><code>:root</code></h4>');
    expect(m.root.innerHTML).toContain('--accent-ink on --accent: 2.14:1, below the 4.5:1 minimum.');
    expect(m.root.focused.at(-1)).toBe('#pair-tokens-h');
  });

  it('does not lose what is typed when the audit runs', async () => {
    const m = mount();
    m.root.type('#123456', '#fedcba', true);
    m.root.click('run');
    await settle();
    expect(m.runs).toBe(1);
    expect(m.root.innerHTML).toContain('value="#123456"');
    expect(m.root.innerHTML).toContain('value="#fedcba"');
    expect(m.root.innerHTML).toContain('id="pair-large" name="pair-large" checked>');
    expect(m.root.innerHTML).toContain('data-action="copy-json"');
    expect(m.root.focused.at(-1)).toBe('[data-action="run"]');
  });

  it('does not lose what is typed when a report is copied', async () => {
    const m = mount();
    m.root.click('run');
    await settle();
    m.root.type('#abcdef', '#000');
    m.root.click('copy-json');
    await settle();
    expect(m.root.innerHTML).toContain('value="#abcdef"');
    expect(m.root.innerHTML).toContain('Copied.');
  });

  it('leaves the audit alone when the tool is used', async () => {
    const m = mount();
    m.root.click('run');
    await settle();
    m.root.type('#777', '#fff');
    m.root.click('pair-compare');
    expect(m.runs).toBe(1);
    expect(m.root.innerHTML).toContain('data-action="copy-sarif"');
    expect(m.root.innerHTML).toContain('id="route-0"');
    expect(m.langs).toEqual([]);
  });

  it('keeps the colours and makes the result again in the new language', () => {
    const m = mount();
    m.root.type('#777777', 'white');
    m.root.click('pair-compare');
    m.root.click('lang-fr');
    expect(m.langs).toEqual(['fr']);
    expect(m.root.attributes['lang']).toBe('fr');
    expect(m.root.innerHTML).toContain('<h2 id="pair-h">Comparer deux couleurs</h2>');
    expect(m.root.innerHTML).toContain('value="#777777"');
    expect(m.root.innerHTML).toContain(`<caption>#777777 sur #ffffff${NBSP}: 4,47${NBSP}:${NBSP}1</caption>`);
    expect(m.root.innerHTML).toContain('Utiliser #767676 pour le texte');
    expect(m.root.innerHTML).not.toContain('Contrast is');
    // The switch is not a new result, so the tool announces nothing.
    expect(m.root.innerHTML).toContain('<div class="pair">');
    expect(m.root.innerHTML.slice(m.root.innerHTML.indexOf('<div class="pair">'))).toContain('<div role="status" aria-live="polite"></div>');
    expect(m.root.focused.at(-1)).toBe('[data-action="lang-en"]');
  });

  it('writes field errors again in the new language', () => {
    const m = mount();
    m.root.type('zzz', '');
    m.root.click('pair-compare');
    m.root.click('lang-fr');
    expect(m.root.innerHTML).toContain('Saisissez la couleur d’arrière-plan.');
    expect(m.root.innerHTML).not.toContain('Type the background colour.');
  });

  it('keeps colours that were typed and not yet compared through a language switch', () => {
    const m = mount();
    m.root.type('#111', '#eee');
    m.root.click('lang-fr');
    expect(m.root.innerHTML).toContain('value="#111"');
    expect(m.root.innerHTML).not.toContain('pair-result-h');
  });

  it('starts in French when the panel does', () => {
    const { root } = mount('fr');
    expect(root.innerHTML).toContain('Comparer les deux couleurs');
    root.type('#777777', '#ffffff');
    root.click('pair-compare');
    expect(root.innerHTML).toContain(`Texte plus sombre${NBSP}: #767676 donne 4,54${NBSP}:${NBSP}1.`);
  });

  it('ignores a click on something with no action, and actions it does not know', () => {
    const { root } = mount();
    const before = root.innerHTML;
    for (const action of [null, 'pair-', 'pair-use-nothing-0', 'fit-make', 'elsewhere']) root.click(action);
    expect(root.innerHTML).toBe(before);
    expect(root.focused).toEqual([]);
  });

  it('works on a root with no way to look inside', () => {
    const handlers: Array<(e: { target: unknown }) => void> = [];
    const bare = { innerHTML: '', addEventListener: (_t: 'click', h: (e: { target: unknown }) => void) => void handlers.push(h) };
    mountNarrowPanel({ root: bare, lang: 'en', css: () => ({ text: SAMPLE_CSS, unreadable: 0 }) });
    for (const h of handlers) h({ target: { getAttribute: () => 'pair-compare' } });
    expect(bare.innerHTML).toContain('Type the text colour.');
    for (const h of handlers) h({ target: { getAttribute: () => 'pair-tokens' } });
    expect(bare.innerHTML).toContain('8 colour tokens read');
  });
});
