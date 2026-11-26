import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import type { TwiceFacts, TwiceField } from './twice-inpage.js';
import {
  TWICE_CSS,
  TWICE_EXCLUDE,
  initialTwiceState,
  mountTwicePanel,
  renderTwicePanel,
  twiceModelOf,
  twiceNoteOf,
  twicePanel,
  twiceResultText,
  twiceStep,
  type TwicePanelState,
  type TwiceRoot,
} from './twice-panel.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const f = (label: string, extra: Partial<TwiceField> = {}): TwiceField => ({ id: `input[${label}]`, label, type: 'text', token: '', form: 0, group: '', ...extra });
const PAGE: TwiceFacts = {
  fields: [f('Email', { type: 'email' }), f('Confirm email', { type: 'email' }), f('Password', { type: 'password' }), f('Repeat password', { type: 'password' }), f('Street', { token: 'shipping street-address' }), f('Street', { token: 'billing street-address' })],
  sameAs: [],
  truncated: false,
};
const read = (x: TwiceFacts = PAGE) => (): TwiceFacts => x;
const st = (facts: TwiceFacts | null = PAGE): TwicePanelState => ({ facts, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, TwicePanelState]> {
  return [
    ['at first', initialTwiceState()],
    ['with things asked twice', st()],
    ['with nothing asked twice', st({ fields: [f('Name')], sameAs: ['Same as above'], truncated: true })],
    ['with no field', st({ fields: [], sameAs: [], truncated: false })],
    [
      'after a failure',
      twiceStep(initialTwiceState(), lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderTwicePanel', () => {
  it('starts with an h2 and the reading', () => {
    const html = renderTwicePanel('en', initialTwiceState());
    expect(html).toContain('<h2 id="twice-h">Asked twice</h2>');
    expect(html).toContain('Nothing is typed, stored or sent.');
    expect(html).toContain('<button type="button" data-action="twice-read">Find what is asked twice</button>');
    expect(html).not.toContain('twice-result-h');
  });

  it('shows the summary, what is asked again, the hints and copy', () => {
    const html = renderTwicePanel('en', st());
    const text = textOf(html);
    expect(html).toContain('<section aria-labelledby="twice-result-h"><h3 id="twice-result-h" tabindex="-1">Forms on this page</h3>');
    expect(text).toContain('6 fields to fill in. Asked for twice: 2.');
    expect(text).toContain('“Confirm email” asks for “Email” again.');
    expect(text).toContain('The rules allow this for security');
    expect(html).toContain('<h4 id="twice-help-h">What may help the team</h4>');
    expect(html).toContain('data-action="twice-read">Read again</button>');
    expect(html).toContain('data-action="twice-copy">Copy the result</button>');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderTwicePanel('en', st(), 3);
    expect(html).toContain('<h3 id="twice-h">');
    expect(html).toContain('<h4 id="twice-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="twice-found-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('escapes what a page wrote', () => {
    expect(renderTwicePanel('en', st({ fields: [f('<b>x</b>', { type: 'email' }), f('Confirm <b>x</b>', { type: 'email' })], sameAs: ['<i>y</i>'], truncated: false }))).not.toMatch(/<b>|<i>/);
  });

  it('has only buttons of type button, and no form, field, link or picture', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderTwicePanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="twice-[a-z]+">[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderTwicePanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button 44 pixels, shows focus, sets no colour and does not move', () => {
    expect(TWICE_CSS).toContain('.twice button{min-height:44px;min-width:44px;');
    expect(TWICE_CSS).toContain('.twice button:focus-visible');
    expect(TWICE_CSS).not.toMatch(/outline:(0|none)/);
    expect(TWICE_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:|:hover/i);
    expect(TWICE_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const r of TWICE_CSS.split('}').filter((x) => x !== '')) {
      for (const selector of (r.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.twice'), selector).toBe(true);
    }
    expect(TWICE_EXCLUDE).toBe('.twice');
    expect(renderTwicePanel('en', initialTwiceState())).toMatch(/^<div class="twice">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderTwicePanel(lang, state), lang);
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
      .map(([, s]) => `${textOf(renderTwicePanel(lang, s))}\n${twiceResultText(s, lang)}`)
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
    for (const en of ['Asked twice', 'Find what is asked', 'Forms on this page', 'Copy the result', 'asks for']) expect(fr).not.toContain(en);
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
    expect(twicePanel.title).toEqual({ en: 'Asked twice', fr: 'Demandé deux fois' });
    expect(twicePanel.mount).toBe(mountTwicePanel);
  });
});

describe('twiceResultText, twiceStep and twiceNoteOf', () => {
  it('gives plain text with every finding and the hints', () => {
    const text = twiceResultText(st(), 'en');
    expect(text.startsWith('Asked twice\n6 fields to fill in.')).toBe(true);
    expect(text.match(/^- /gm)?.length).toBeGreaterThanOrEqual(3);
    expect(text).toContain('What may help the team:\n- Ask for each answer once');
    expect(text).not.toMatch(/<|&amp;/);
    expect(twiceResultText(initialTwiceState(), 'fr').split('\n')[0]).toBe('Demandé deux fois');
  });

  it('reads the page and puts focus on the result, or says why it could not and keeps the result', () => {
    const ok = twiceStep(initialTwiceState(), 'en', read());
    expect(ok.state).toEqual({ facts: PAGE, notice: 'The page was read.' });
    expect(ok.focus).toBe('#twice-result-h');
    expect(twiceModelOf(ok.state)?.twice).toBe(2);
    expect(twiceModelOf(initialTwiceState())).toBeNull();
    const bad = twiceStep(st(), 'fr', () => {
      throw new Error('boom');
    });
    expect(bad.state).toEqual({ facts: PAGE, notice: `La page n’a pas pu être lue${NBSP}: boom` });
    expect(bad.focus).toBe('[data-action="twice-read"]');
  });

  it('gives the line for the barrier text when something is asked twice', () => {
    expect(twiceNoteOf(st(), 'en')).toBe('Asked twice: this page asks for 2 things twice. I need to answer once.');
    expect(twiceNoteOf(initialTwiceState(), 'en')).toBe('');
  });
});

interface TestRoot extends TwiceRoot {
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

describe('mountTwicePanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = testRoot();
    mountTwicePanel({ root, lang: 'fr', read: read() });
    expect(root.innerHTML).toContain('Demandé deux fois');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('reads the page, then copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const ok = testRoot();
    const panel = mountTwicePanel({ root: ok, lang: 'en', read: read(), copy: async (t) => void copied.push(t) });
    ok.fire('twice-copy');
    expect(copied).toEqual([]);
    ok.fire('twice-read');
    expect(ok.focused.at(-1)).toBe('#twice-result-h');
    expect(panel.note()).toContain('Asked twice:');
    ok.fire('twice-copy');
    await settle();
    expect(copied[0]).toContain('- “Confirm email” asks for “Email” again.');
    expect(ok.innerHTML).toContain('>Copied.</div>');
    expect(ok.focused.at(-1)).toBe('[data-action="twice-copy"]');

    const bad = testRoot();
    mountTwicePanel({ root: bad, lang: 'en', read: read(), state: st(), copy: () => Promise.reject(new Error('no')) });
    bad.fire('twice-copy');
    await settle();
    expect(bad.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');

    const none = testRoot();
    mountTwicePanel({ root: none, lang: 'fr', read: read(), state: st() });
    none.fire('twice-copy');
    expect(none.innerHTML).toContain('La copie n’est pas disponible dans ce navigateur.');
  });

  it('keeps the result in another language and clears the notice', () => {
    expect(mountTwicePanel({ root: testRoot(), lang: 'fr', read: read(), state: { ...st(), notice: 'x' } }).getState()).toEqual(st());
  });

  it('ignores clicks on things that are not its actions', () => {
    const root = testRoot();
    const panel = mountTwicePanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.fire('hover-read');
    expect(root.innerHTML).toBe(before);
    expect(panel.getState()).toEqual(initialTwiceState());
  });
});
