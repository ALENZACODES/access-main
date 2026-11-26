import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { pageAround, settle, textOf } from './fit-testkit.js';
import type { HoverFacts, HoverRule } from './hover-inpage.js';
import { HOVER_LISTED } from './hover.js';
import {
  HOVER_CSS,
  HOVER_EXCLUDE,
  hoverAbilityNoteOf,
  hoverModelOf,
  hoverNeedsSite,
  hoverNoteOf,
  hoverPanel,
  hoverResultText,
  hoverStep,
  initialHoverState,
  isHoverAction,
  mountHoverPanel,
  renderHoverPanel,
  type HoverPanelState,
  type HoverRoot,
} from './hover-panel.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const rule = (selector: string, extra: Partial<HoverRule> = {}): HoverRule => ({ selector, reveals: ['display'], twin: false, hiddenNow: 0, controlsHidden: 0, controlNames: [], ...extra });
const PAGE: HoverFacts = {
  rules: [rule('nav li:hover > ul', { hiddenNow: 1, controlsHidden: 1, controlNames: ['Bus'] }), rule('.tip-host:hover .tip', { hiddenNow: 2 }), rule('.menu:hover .sub', { twin: true })],
  sheetsRead: 2,
  sheetsUnread: 1,
  deviceHover: true,
  truncated: false,
};
const MANY: HoverFacts = { ...PAGE, rules: Array.from({ length: HOVER_LISTED + 3 }, (_, i) => rule(`.c${i}:hover .x`, { hiddenNow: 1 })), truncated: true };
const read = (f: HoverFacts = PAGE) => (): HoverFacts => f;
const st = (facts: HoverFacts | null = PAGE, ability: HoverPanelState['ability'] = 'cannot'): HoverPanelState => ({ ability, facts, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, HoverPanelState]> {
  return [
    ['at first', initialHoverState()],
    ['after saying they cannot hover', hoverStep(initialHoverState(), 'hover-ability', 'cannot', lang, read()).state],
    ['with the page read', st()],
    ['with many rules', st(MANY, 'can')],
    ['with nothing found', st({ rules: [], sheetsRead: 1, sheetsUnread: 0, deviceHover: null, truncated: false }, 'unsure')],
    [
      'after a failure',
      hoverStep(initialHoverState(), 'hover-read', null, lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderHoverPanel', () => {
  it('starts with an h2, the question with no answer chosen but unsure, and the reading', () => {
    const html = renderHoverPanel('en', initialHoverState());
    expect(html).toContain('<h2 id="hover-h">Shown on hover only</h2>');
    expect(html).toContain('<div class="hover-group" role="group" aria-labelledby="hover-ability-l">');
    expect(html).toContain('<button type="button" data-action="hover-ability" data-value="can" aria-pressed="false">I can hover</button>');
    expect(html).toContain('data-value="cannot" aria-pressed="false">I cannot hover</button>');
    expect(html).toContain('data-value="unsure" aria-pressed="true">I am not sure</button>');
    expect(html).toContain('data-action="hover-read">Find what shows on hover only</button>');
    expect(html).not.toContain('hover-result-h');
  });

  it('shows the summary, the rules with hidden controls first, the hints and copy', () => {
    const html = renderHoverPanel('en', st());
    const text = textOf(html);
    expect(html).toContain('<h4 id="hover-result-h" tabindex="-1">What was found</h4>');
    expect(text).toContain('You said you cannot hover: what these 2 rules show stays hidden from you.');
    expect(html.indexOf('nav li:hover')).toBeLessThan(html.indexOf('.tip-host:hover'));
    expect(text).toContain('What may help the team');
    expect(html).toContain('data-action="hover-read">Read again</button>');
    expect(html).toContain('data-action="hover-copy">Copy the result</button>');
  });

  it('lists a limited number of rules and says the rest are in the copied text', () => {
    const html = renderHoverPanel('en', st(MANY));
    expect(html.match(/<li>Rule /g)).toHaveLength(HOVER_LISTED);
    expect(html).toContain('… and 3 more, in the copied text.');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderHoverPanel('en', st(), 3);
    expect(html).toContain('<h3 id="hover-h">');
    expect(html).toContain('<h4 id="hover-page-h" tabindex="-1">');
    expect(html).toContain('<h5 id="hover-result-h" tabindex="-1">');
    expect(html).toContain('<h6 id="hover-rules-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('escapes what a page wrote', () => {
    expect(renderHoverPanel('en', st({ ...PAGE, rules: [rule('<b>x</b>:hover', { hiddenNow: 1, controlsHidden: 1, controlNames: ['<i>y</i>'] })] }))).not.toMatch(/<b>|<i>/);
  });

  it('has only buttons of type button, and no form, field, link or picture', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderHoverPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="hover-[a-z]+"( data-value="[a-z]+" aria-pressed="(true|false)")?>[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderHoverPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button 44 pixels, shows what is pressed without colour, shows focus, and has no hover rule of its own', () => {
    expect(HOVER_CSS).toContain('.hoveronly button{min-height:44px;min-width:44px;');
    expect(HOVER_CSS).toContain('.hoveronly button[aria-pressed="true"]{font-weight:700;border-width:3px}');
    expect(HOVER_CSS).toContain('.hoveronly button:focus-visible');
    expect(HOVER_CSS).not.toContain(':hover');
    expect(HOVER_CSS).not.toMatch(/outline:(0|none)/);
    expect(HOVER_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(HOVER_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const r of HOVER_CSS.split('}').filter((x) => x !== '')) {
      for (const selector of (r.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.hoveronly'), selector).toBe(true);
    }
    expect(HOVER_EXCLUDE).toBe('.hoveronly');
    expect(renderHoverPanel('en', initialHoverState())).toMatch(/^<div class="hoveronly">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderHoverPanel(lang, state), lang);
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
      .map(([, s]) => `${textOf(renderHoverPanel(lang, s))}\n${hoverResultText(s, lang)}`)
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
    for (const en of ['Shown on hover only', 'I cannot hover', 'What was found', 'Copy the result', 'hidden from you']) expect(fr).not.toContain(en);
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
    expect(hoverPanel.title).toEqual({ en: 'Shown on hover only', fr: 'Montré au survol seulement' });
    expect(hoverPanel.mount).toBe(mountHoverPanel);
  });
});

describe('hoverResultText', () => {
  it('is plain text with every rule', () => {
    const text = hoverResultText(st(MANY), 'en');
    expect(text.startsWith('Shown on hover only\n')).toBe(true);
    expect(text.match(/^- Rule /gm)).toHaveLength(MANY.rules.length);
    expect(text).not.toMatch(/<|&amp;/);
  });

  it('has only the limits before the page is read', () => {
    expect(hoverResultText(initialHoverState(), 'fr').split('\n')[0]).toBe('Montré au survol seulement');
  });
});

describe('hoverStep', () => {
  it('keeps the answer, says it and keeps focus on the button', () => {
    const step = hoverStep(st(), 'hover-ability', 'can', 'fr', read());
    expect(step.state).toEqual({ ability: 'can', facts: PAGE, notice: 'Votre réponse est notée.' });
    expect(step.focus).toBe('[data-action="hover-ability"][data-value="can"]');
    expect(hoverStep(st(), 'hover-ability', 'maybe', 'en', read()).focus).toBe('');
    expect(hoverStep(st(), 'hover-ability', null, 'en', read()).focus).toBe('');
  });

  it('reads the page and puts focus on the result, or says why it could not', () => {
    const ok = hoverStep(initialHoverState(), 'hover-read', null, 'en', read());
    expect(ok.state.facts).toBe(PAGE);
    expect(ok.focus).toBe('#hover-result-h');
    expect(hoverModelOf(ok.state)?.counts['controls-hidden']).toBe(1);
    expect(hoverModelOf(initialHoverState())).toBeNull();
    const bad = hoverStep(st(), 'hover-read', null, 'fr', () => {
      throw new Error('boom');
    });
    expect(bad.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(bad.state.facts).toBe(PAGE);
    expect(bad.focus).toBe('#hover-page-h');
  });

  it('knows its actions', () => {
    for (const a of ['hover-ability', 'hover-read']) expect(isHoverAction(a)).toBe(true);
    for (const a of ['hover-copy', 'scan-read', '', null]) expect(isHoverAction(a)).toBe(false);
  });
});

describe('hoverNoteOf', () => {
  it('gives a line once the person said whether they can hover', () => {
    expect(hoverNoteOf(initialHoverState(), 'en')).toBe('');
    expect(hoverNoteOf(st(null, 'cannot'), 'en')).toBe('Hover: I cannot hover. Content shown only on hover is out of my reach.');
    expect(hoverNoteOf(st(), 'en')).toBe('Hover: I cannot hover. Content shown only on hover is out of my reach. Here, 2 rules hide something unless hovered.');
  });
});

interface TestRoot extends HoverRoot {
  readonly focused: string[];
  readonly attributes: Record<string, string>;
  fire(action: string, value?: string): void;
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
    fire(action, value) {
      for (const h of handlers) h({ target: { getAttribute: (n: string) => (n === 'data-action' ? action : n === 'data-value' ? (value ?? null) : null) } });
    },
  };
  return root;
}

describe('mountHoverPanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = testRoot();
    mountHoverPanel({ root, lang: 'fr', read: read() });
    expect(root.innerHTML).toContain('Montré au survol seulement');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('takes the answer, reads the page, and changes the result with the answer without reading again', () => {
    let reads = 0;
    const root = testRoot();
    const panel = mountHoverPanel({
      root,
      lang: 'en',
      read: () => {
        reads += 1;
        return PAGE;
      },
    });
    root.fire('hover-read');
    expect(root.focused.at(-1)).toBe('#hover-result-h');
    expect(textOf(root.innerHTML)).toContain('You did not say whether you can hover');
    root.fire('hover-ability', 'cannot');
    expect(reads).toBe(1);
    expect(root.focused.at(-1)).toBe('[data-action="hover-ability"][data-value="cannot"]');
    expect(textOf(root.innerHTML)).toContain('You said you cannot hover');
    expect(panel.note()).toContain('Hover: I cannot hover.');
  });

  it('copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const ok = testRoot();
    mountHoverPanel({ root: ok, lang: 'en', read: read(), copy: async (t) => void copied.push(t) });
    ok.fire('hover-copy');
    expect(copied).toEqual([]);
    ok.fire('hover-read');
    ok.fire('hover-copy');
    await settle();
    expect(copied[0]).toContain('- Rule “nav li:hover > ul”');
    expect(ok.innerHTML).toContain('>Copied.</div>');

    const bad = testRoot();
    mountHoverPanel({ root: bad, lang: 'en', read: read(), state: st(), copy: () => Promise.reject(new Error('no')) });
    bad.fire('hover-copy');
    await settle();
    expect(bad.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');

    const none = testRoot();
    mountHoverPanel({ root: none, lang: 'fr', read: read(), state: st() });
    none.fire('hover-copy');
    expect(none.innerHTML).toContain('La copie n’est pas disponible dans ce navigateur.');
  });

  it('keeps the answer and the result in another language, and clears the notice', () => {
    const kept = mountHoverPanel({ root: testRoot(), lang: 'fr', read: read(), state: { ...st(), notice: 'x' } });
    expect(kept.getState()).toEqual(st());
  });

  it('ignores clicks on things that are not its actions', () => {
    const root = testRoot();
    const panel = mountHoverPanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.fire('scan-read');
    root.fire('hover-ability', 'sometimes');
    expect(root.innerHTML).toBe(before);
    expect(panel.getState()).toEqual(initialHoverState());
  });
});

describe('hoverAbilityNoteOf and hoverNeedsSite', () => {
  it('gives the answer for the access summary, with nothing about the page', () => {
    expect(hoverAbilityNoteOf(initialHoverState(), 'en')).toBe('');
    expect(hoverAbilityNoteOf(st(PAGE, 'cannot'), 'en')).toBe('Hover: I cannot hover. Content shown only on hover is out of my reach.');
    expect(hoverAbilityNoteOf(st(PAGE, 'can'), 'fr')).toBe(`Survol${NBSP}: je peux survoler.`);
  });

  it('asks the site for something only when the person cannot hover', () => {
    expect(hoverNeedsSite(st(PAGE, 'cannot'))).toBe(true);
    expect(hoverNeedsSite(st(PAGE, 'can'))).toBe(false);
    expect(hoverNeedsSite(initialHoverState())).toBe(false);
  });
});
