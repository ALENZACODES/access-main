import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { fakeRoot, pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import type { ScrollFacts } from './scroll-inpage.js';
import { SCROLL_CSS, SCROLL_EXCLUDE, SCROLL_ROWS, initialScrollState, mountScrollPanel, renderScrollPanel, scrollCheckOf, scrollPanel, scrollStep, type ScrollPanelState } from './scroll-panel.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const PAGE: ScrollFacts = {
  viewportWidth: 320,
  viewportHeight: 640,
  pageHeight: 6400,
  headings: [
    { level: 1, text: 'Places near you', top: 80, inMain: true },
    { level: 2, text: 'A heading with a long name that has to wrap at 320 pixels', top: 900, inMain: true },
    { level: 2, text: 'Contact', top: 6000, inMain: true },
  ],
  submits: [{ name: 'Send', top: 6200 }],
  lastControl: { name: 'Back to top', top: 6300 },
  toTop: 0,
  coveredTop: 64,
  coveredBottom: 120,
};
const MANY: ScrollFacts = { ...PAGE, headings: Array.from({ length: SCROLL_ROWS + 3 }, (_, i) => ({ level: 3, text: `Part ${i + 1}`, top: 100 + i * 200, inMain: true })) };
const read = (f: ScrollFacts = PAGE) => () => f;
const counted = (f: ScrollFacts = PAGE): ScrollPanelState => ({ facts: f, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, ScrollPanelState]> {
  return [
    ['at first', initialScrollState()],
    ['counted', scrollStep(initialScrollState(), lang, read()).state],
    ['counted with many places', counted(MANY)],
    ['counted with nothing on the page', counted({ ...PAGE, headings: [], submits: [], lastControl: null, pageHeight: 640, coveredTop: 0, coveredBottom: 0 })],
    ['with no window size', counted({ ...PAGE, viewportHeight: null })],
    ['with bars over the whole window', counted({ ...PAGE, coveredTop: 400, coveredBottom: 300 })],
    [
      'after a failure',
      scrollStep(initialScrollState(), lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderScrollPanel', () => {
  it('starts with an h2, says it does not scroll and keeps nothing, and offers to count', () => {
    const html = renderScrollPanel('en', initialScrollState());
    expect(html).toContain('<h2 id="scroll-h">Scroll effort on this page</h2>');
    expect(html).toContain('This reads the page and does not scroll it. Nothing is stored or sent.');
    expect(html).toContain('<button type="button" data-action="scroll-count">Count the scrolling on this page</button>');
    expect(html).not.toContain('scroll-result-h');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderScrollPanel('en', counted(), 3);
    expect(html).toContain('<h3 id="scroll-h">');
    expect(html).toContain('<h4 id="scroll-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="scroll-notes-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('shows the summary, the notes and the table of places', () => {
    const html = renderScrollPanel('en', counted());
    const text = textOf(html);
    expect(text).toContain('The page is 14 screens tall, in this window of 320 by 640 CSS pixels, of which 456 are left free between fixed bars.');
    expect(text).toContain('Fixed bars cover 29% of the window.');
    expect(text).toContain('No link leads back to the top of the page.');
    expect(html).toContain('<caption>How far down each place is</caption>');
    expect(html).toContain('<tr><td>Heading, level 1</td><th scope="row">Places near you</th><td>on the first screen</td></tr>');
    expect(html).toContain('<tr><td>Send button</td><th scope="row">Send</th><td>12.5 screens down</td></tr>');
    expect(html).toContain('data-action="scroll-count">Count again</button>');
  });

  it('lists a limited number of places and says the rest are in the copied text', () => {
    const html = renderScrollPanel('en', counted(MANY));
    expect(html.match(/<tr><td>/g)).toHaveLength(SCROLL_ROWS);
    expect(html).toContain('… and 5 more, in the copied text.');
  });

  it('says when nothing was found, and UNKNOWN when nothing could be counted', () => {
    expect(renderScrollPanel('en', states('en')[3]?.[1] ?? initialScrollState())).toContain('<p>No heading, send button or control was found.</p>');
    const unknown = renderScrollPanel('en', counted({ ...PAGE, viewportHeight: null }));
    expect(textOf(unknown)).toContain('Window size UNKNOWN, so nothing was counted.');
    expect(unknown).not.toContain('<table');
  });

  it('escapes what a page wrote', () => {
    const html = renderScrollPanel('en', counted({ ...PAGE, headings: [{ level: 2, text: '<b>"x"</b>', top: 10, inMain: true }] }));
    expect(html).not.toContain('<b>');
  });

  it('has only buttons of type button, each with text, and nothing that sends or loads', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderScrollPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="scroll-[a-z]+">[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderScrollPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button a 44 pixel minimum and keeps the table inside a narrow screen', () => {
    expect(SCROLL_CSS).toContain('.scroll-effort button{min-height:44px;min-width:44px;');
    expect(SCROLL_CSS).toContain('table-layout:fixed');
    expect(SCROLL_CSS).toContain('overflow-wrap:anywhere');
  });

  it('shows focus, never removes an outline, sets no colour and does not move', () => {
    expect(SCROLL_CSS).toContain('.scroll-effort button:focus-visible');
    expect(SCROLL_CSS).not.toMatch(/outline:(0|none)/);
    expect(SCROLL_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(SCROLL_CSS).not.toMatch(/animation|transition|scroll-behavior/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the count', () => {
    for (const rule of SCROLL_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.scroll-effort'), selector).toBe(true);
    }
    expect(SCROLL_EXCLUDE).toBe('.scroll-effort');
    expect(renderScrollPanel('en', initialScrollState())).toMatch(/^<div class="scroll-effort">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderScrollPanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderScrollPanel(lang, s)))
      .join('\n');

  it('follows French typography in every state', () => {
    for (const line of allText('fr').split('\n')) {
      if (line.trim() === '') continue;
      expect(frTypographyIssues(line), line).toEqual([]);
    }
  });

  it('has no straight apostrophe in French, and no English sentence of the panel left in it', () => {
    const fr = allText('fr');
    expect(fr).not.toMatch(/\p{L}'\p{L}/u);
    for (const en of ['Count the scrolling', 'What was counted', 'Points to look at', 'screens down', 'Copy the counts']) expect(fr).not.toContain(en);
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
    expect(scrollPanel.title).toEqual({ en: 'Scroll effort on this page', fr: 'Effort de défilement de cette page' });
    expect(scrollPanel.mount).toBe(mountScrollPanel);
  });
});

describe('scrollStep and scrollCheckOf', () => {
  it('reads the page, says so and puts focus on the result', () => {
    const step = scrollStep(initialScrollState(), 'en', read());
    expect(step.state).toEqual({ facts: PAGE, notice: 'The page was read.' });
    expect(step.focus).toBe('#scroll-result-h');
    expect(scrollCheckOf(step.state)?.kind).toBe('model');
    expect(scrollCheckOf(initialScrollState())).toBeNull();
  });

  it('says why the page could not be read, keeps what was read before and keeps focus at the top', () => {
    const step = scrollStep(counted(), 'fr', () => {
      throw new Error('boom');
    });
    expect(step.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(step.state.facts).toBe(PAGE);
    expect(step.focus).toBe('#scroll-h');
  });
});

describe('mountScrollPanel', () => {
  it('renders at once, sets the language, moves no focus and reads nothing yet', () => {
    let reads = 0;
    const root = fakeRoot();
    mountScrollPanel({
      root,
      lang: 'fr',
      read: () => {
        reads += 1;
        return PAGE;
      },
    });
    expect(root.innerHTML).toContain('Effort de défilement de cette page');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
    expect(reads).toBe(0);
  });

  it('counts on a click and again on the second button, with focus on the result', () => {
    const root = fakeRoot();
    const got = mountScrollPanel({ root, lang: 'en', read: read() });
    root.click('scroll-count');
    expect(root.focused).toEqual(['#scroll-result-h']);
    expect(got.getState().facts).toBe(PAGE);
    root.click('scroll-count');
    expect(root.focused).toEqual(['#scroll-result-h', '#scroll-result-h']);
  });

  it('copies the counts and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const root = fakeRoot();
    mountScrollPanel({
      root,
      lang: 'en',
      read: read(),
      copy: async (t) => {
        copied.push(t);
      },
    });
    root.click('scroll-copy');
    expect(copied).toEqual([]);
    root.click('scroll-count');
    root.click('scroll-copy');
    await settle();
    expect(copied[0]?.split('\n')[0]).toBe('Scroll effort');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">Copied.</div>');
    const failing = fakeRoot();
    mountScrollPanel({ root: failing, lang: 'en', read: read(), copy: () => Promise.reject(new Error('no')) });
    failing.click('scroll-count');
    failing.click('scroll-copy');
    await settle();
    expect(failing.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('ignores clicks that are not its own, and keeps what was read in another language', () => {
    const root = fakeRoot();
    const got = mountScrollPanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.click('reach-count');
    root.click(null);
    expect(root.innerHTML).toBe(before);
    const fr = fakeRoot();
    const again = mountScrollPanel({ root: fr, lang: 'fr', read: read(), state: { facts: PAGE, notice: 'old' } });
    expect(again.getState().notice).toBe('');
    expect(fr.innerHTML).toContain('Ce qui a été compté');
    expect(got.getState().facts).toBeNull();
  });
});
