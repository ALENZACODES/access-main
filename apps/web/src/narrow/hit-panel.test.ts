import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { pageAround, settle, textOf } from './fit-testkit.js';
import type { HitControl, HitFacts } from './hit-inpage.js';
import { HIT_LISTED } from './hit.js';
import { HIT_CSS, HIT_EXCLUDE, hitModelOf, hitNoteOf, hitPanel, hitResultText, hitStep, initialHitState, mountHitPanel, renderHitPanel, type HitPanelState, type HitRoot } from './hit-panel.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const c = (name: string, reached: number, pinned = true, invisible = false): HitControl => ({
  id: `button[${name}]`,
  name,
  reached,
  cover: reached === 5 ? null : { what: 'div#bar', name: 'Cookies', pinned, invisible },
});
const PAGE: HitFacts = { controls: [c('Send', 0), c('Menu', 2, false, true), c('Back', 5)], offScreen: 3, truncated: false };
const MANY: HitFacts = { controls: Array.from({ length: HIT_LISTED + 4 }, (_, i) => c(`Item ${i}`, 0)), offScreen: 0, truncated: true };
const read = (x: HitFacts = PAGE) => (): HitFacts => x;
const st = (facts: HitFacts | null = PAGE): HitPanelState => ({ facts, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, HitPanelState]> {
  return [
    ['at first', initialHitState()],
    ['with covered controls', st()],
    ['with many covered controls', st(MANY)],
    ['with every control clear', st({ controls: [c('A', 5)], offScreen: 0, truncated: false })],
    ['with no control on the screen', st({ controls: [], offScreen: 6, truncated: false })],
    [
      'after a failure',
      hitStep(initialHitState(), lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderHitPanel', () => {
  it('starts with an h2 and the reading', () => {
    const html = renderHitPanel('en', initialHitState());
    expect(html).toContain('<h2 id="hit-h">Covered controls</h2>');
    expect(html).toContain('The page is scrolled to each control in turn, then put back where it was. Nothing in it is changed or pressed');
    expect(html).toContain('<button type="button" data-action="hit-read">Find covered controls</button>');
    expect(html).not.toContain('hit-result-h');
  });

  it('shows the summary, the covered controls fully covered first, the hints and copy', () => {
    const html = renderHitPanel('en', st());
    const text = textOf(html);
    expect(html).toContain('<section aria-labelledby="hit-result-h"><h3 id="hit-result-h" tabindex="-1">What covers controls</h3>');
    expect(text).toContain('3 controls tested. Fully covered: 1. Partly: 1. Clear: 1.');
    expect(text).toContain('3 controls could not be brought fully onto the screen, so they stay UNKNOWN.');
    expect(html.indexOf('“Send”')).toBeLessThan(html.indexOf('“Menu”'));
    expect(html).toContain('<h4 id="hit-help-h">What may help the team</h4>');
    expect(html).toContain('data-action="hit-read">Read again</button>');
    expect(html).toContain('data-action="hit-copy">Copy the result</button>');
  });

  it('lists a limited number of controls and says the rest are in the copied text', () => {
    const html = renderHitPanel('en', st(MANY));
    expect(html.match(/<li>“Item/g)).toHaveLength(HIT_LISTED);
    expect(html).toContain('… and 4 more, in the copied text.');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderHitPanel('en', st(), 3);
    expect(html).toContain('<h3 id="hit-h">');
    expect(html).toContain('<h4 id="hit-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="hit-list-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('escapes what a page wrote', () => {
    const bad: HitFacts = { controls: [{ id: 'b', name: '<b>x</b>', reached: 0, cover: { what: '<i>w</i>', name: '<i>y</i>', pinned: false, invisible: false } }], offScreen: 0, truncated: false };
    expect(renderHitPanel('en', st(bad))).not.toMatch(/<b>|<i>/);
  });

  it('has only buttons of type button, and no form, field, link or picture', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderHitPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="hit-[a-z]+">[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderHitPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button 44 pixels, shows focus, sets no colour and does not move', () => {
    expect(HIT_CSS).toContain('.hittest button{min-height:44px;min-width:44px;');
    expect(HIT_CSS).toContain('.hittest button:focus-visible');
    expect(HIT_CSS).not.toMatch(/outline:(0|none)/);
    expect(HIT_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:|:hover|position:(fixed|sticky)/i);
    expect(HIT_CSS).not.toMatch(/animation|transition/);
    for (const r of HIT_CSS.split('}').filter((x) => x !== '')) {
      for (const selector of (r.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.hittest'), selector).toBe(true);
    }
    expect(HIT_EXCLUDE).toBe('.hittest');
    expect(renderHitPanel('en', initialHitState())).toMatch(/^<div class="hittest">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderHitPanel(lang, state), lang);
        const results = { ...markupResults(html), 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) };
        const found = Object.values(results).flatMap((r) => (r ? r.entries : []));
        expect(found.map((e) => `${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`)).toEqual([]);
      });
    }
  }
});

describe('the wording of the panel', () => {
  const allText = (lang: 'en' | 'fr'): string =>
    states(lang)
      .map(([, s]) => `${textOf(renderHitPanel(lang, s))}\n${hitResultText(s, lang)}`)
      .join('\n');

  it('follows French typography in every state', () => {
    for (const line of allText('fr').split('\n')) {
      if (line.trim() === '') continue;
      expect(frTypographyIssues(line), line).toEqual([]);
    }
  });

  it('has no straight apostrophe in French, no English sentence of the panel and no placeholder left', () => {
    const fr = allText('fr');
    expect(fr).not.toMatch(/\p{L}'\p{L}/u);
    expect(`${fr}\n${allText('en')}`).not.toContain('${');
    for (const en of ['Covered controls', 'Find covered', 'What covers', 'Copy the result', 'fully covered']) expect(fr).not.toContain(en);
  });

  it('makes none of the claims the App does not make', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verif', 'vérif', 'real-time', 'temps réel', 'partnership', 'partenariat', 'guarantee', 'garanti', 'eligib', 'admissib', 'diagnos', 'compliant', 'conforme']) {
        expect(t, word).not.toContain(word);
      }
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(hitPanel.title).toEqual({ en: 'Covered controls', fr: 'Commandes couvertes' });
    expect(hitPanel.mount).toBe(mountHitPanel);
  });
});

describe('hitResultText, hitStep and hitNoteOf', () => {
  it('gives plain text with every covered control and the hints', () => {
    const text = hitResultText(st(MANY), 'en');
    expect(text.startsWith('Covered controls\n')).toBe(true);
    expect(text.match(/^- “Item/gm)).toHaveLength(MANY.controls.length);
    expect(text).not.toMatch(/<|&amp;/);
    expect(hitResultText(initialHitState(), 'fr').split('\n')[0]).toBe('Commandes couvertes');
  });

  it('reads the page and puts focus on the result, or says why it could not and keeps the result', () => {
    const ok = hitStep(initialHitState(), 'en', read());
    expect(ok.state).toEqual({ facts: PAGE, notice: 'The page was read.' });
    expect(ok.focus).toBe('#hit-result-h');
    expect(hitModelOf(ok.state)?.covered).toBe(1);
    expect(hitModelOf(initialHitState())).toBeNull();
    const bad = hitStep(st(), 'fr', () => {
      throw new Error('boom');
    });
    expect(bad.state).toEqual({ facts: PAGE, notice: `La page n’a pas pu être lue${NBSP}: boom` });
    expect(bad.focus).toBe('[data-action="hit-read"]');
  });

  it('gives the line for the barrier text when a control is covered', () => {
    expect(hitNoteOf(st(), 'en')).toBe('Covered controls: 2 controls are covered by something else, fully or partly, so a press may not reach them.');
    expect(hitNoteOf(initialHitState(), 'en')).toBe('');
  });
});

interface TestRoot extends HitRoot {
  readonly focused: string[];
  readonly attributes: Record<string, string>;
  fire(action: string): void;
}

function testRoot(): TestRoot {
  const handlers: Array<(e: { target: unknown }) => void> = [];
  const root: TestRoot = {
    innerHTML: '',
    focused: [],
    attributes: {},
    setAttribute(name, value) {
      root.attributes[name] = value;
    },
    addEventListener(_type, handler) {
      handlers.push(handler);
    },
    querySelector(selector) {
      return { focus: () => void root.focused.push(selector) };
    },
    fire(action) {
      for (const h of handlers) h({ target: { getAttribute: (n: string) => (n === 'data-action' ? action : null) } });
    },
  };
  return root;
}

describe('mountHitPanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = testRoot();
    mountHitPanel({ root, lang: 'fr', read: read() });
    expect(root.innerHTML).toContain('Commandes couvertes');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('reads the page, then copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const ok = testRoot();
    const panel = mountHitPanel({ root: ok, lang: 'en', read: read(), copy: async (t) => void copied.push(t) });
    ok.fire('hit-copy');
    expect(copied).toEqual([]);
    ok.fire('hit-read');
    expect(ok.focused.at(-1)).toBe('#hit-result-h');
    expect(panel.note()).toContain('Covered controls:');
    ok.fire('hit-copy');
    await settle();
    expect(copied[0]).toContain('- “Send” is fully covered');
    expect(ok.innerHTML).toContain('>Copied.</div>');

    const bad = testRoot();
    mountHitPanel({ root: bad, lang: 'en', read: read(), state: st(), copy: () => Promise.reject(new Error('no')) });
    bad.fire('hit-copy');
    await settle();
    expect(bad.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');

    const none = testRoot();
    mountHitPanel({ root: none, lang: 'fr', read: read(), state: st() });
    none.fire('hit-copy');
    expect(none.innerHTML).toContain('La copie n’est pas disponible dans ce navigateur.');
  });

  it('keeps the result in another language and clears the notice', () => {
    expect(mountHitPanel({ root: testRoot(), lang: 'fr', read: read(), state: { ...st(), notice: 'x' } }).getState()).toEqual(st());
  });

  it('ignores clicks on things that are not its actions', () => {
    const root = testRoot();
    const panel = mountHitPanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.fire('twice-read');
    expect(root.innerHTML).toBe(before);
    expect(panel.getState()).toEqual(initialHitState());
  });
});
