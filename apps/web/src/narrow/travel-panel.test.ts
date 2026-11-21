import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { fakeRoot, pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import type { TravelControl, TravelFacts } from './travel-inpage.js';
import { TRAVEL_CSS, TRAVEL_EXCLUDE, initialTravelState, mountTravelPanel, renderTravelPanel, travelModelOf, travelPanel, travelStep, type TravelPanelState } from './travel-panel.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const at = (name: string, x: number, y: number, form = 0, submit = false): TravelControl => ({ id: `input[${name}]`, name, kind: submit ? 'button' : 'field', form, submit, left: x - 20, top: y - 20, width: 40, height: 40 });
const PAGE: TravelFacts = {
  controls: [at('First name', 60, 100), at('Last name', 260, 100), at('Email', 60, 160), at('Phone', 260, 160), at('Town', 60, 220), at('Postal code', 260, 220), at('Send', 60, 1400, 0, true), at('Q', 60, 40, 1)],
  forms: ['A form with a long name that has to wrap at 320 pixels', ''],
  viewportWidth: 320,
  truncated: false,
};
const read = (f: TravelFacts = PAGE) => () => f;
const done = (f: TravelFacts = PAGE): TravelPanelState => ({ facts: f, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, TravelPanelState]> {
  return [
    ['at first', initialTravelState()],
    ['counted', travelStep(initialTravelState(), lang, read()).state],
    ['counted with no form', done({ controls: [], forms: [], viewportWidth: 320, truncated: false })],
    ['counted with no window width', done({ ...PAGE, viewportWidth: null, truncated: true })],
    [
      'after a failure',
      travelStep(initialTravelState(), lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderTravelPanel', () => {
  it('starts with an h2, says it changes nothing, and offers to count', () => {
    const html = renderTravelPanel('en', initialTravelState());
    expect(html).toContain('<h2 id="travel-h">Pointer travel</h2>');
    expect(html).toContain('This reads the page and changes nothing. Nothing is stored or sent.');
    expect(html).toContain('<button type="button" data-action="travel-read">Count the pointer travel</button>');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderTravelPanel('en', done(), 3);
    expect(html).toContain('<h3 id="travel-h">');
    expect(html).toContain('<h4 id="travel-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="travel-form-0">');
    expect(html).not.toMatch(/<h2/);
  });

  it('gives each form a heading, its lines and its notes', () => {
    const html = renderTravelPanel('en', done());
    expect(html).toContain('<h4 id="travel-form-0">“A form with a long name that has to wrap at 320 pixels”</h4>');
    expect(html).toContain('<h4 id="travel-form-1">Form 2</h4>');
    expect(textOf(html)).toContain('7 controls. Path from the first to the last:');
    expect(html).toContain('<li>The pointer changes direction 5 times');
    expect(html).toContain('data-action="travel-read">Count again</button>');
  });

  it('says so when there is no form', () => {
    expect(textOf(renderTravelPanel('en', states('en')[2]?.[1] ?? initialTravelState()))).toContain('This page has no form with visible controls, so no path was counted.');
  });

  it('escapes what a page wrote', () => {
    expect(renderTravelPanel('en', done({ ...PAGE, forms: ['<b>x</b>', ''] }))).not.toContain('<b>');
  });

  it('has only buttons of type button, each with text, and nothing that sends or loads', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderTravelPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="travel-[a-z]+">[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderTravelPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button a 44 pixel minimum, shows focus, sets no colour and does not move', () => {
    expect(TRAVEL_CSS).toContain('.travel button{min-height:44px;min-width:44px;');
    expect(TRAVEL_CSS).toContain('.travel button:focus-visible');
    expect(TRAVEL_CSS).not.toMatch(/outline:(0|none)/);
    expect(TRAVEL_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(TRAVEL_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const rule of TRAVEL_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.travel'), selector).toBe(true);
    }
    expect(TRAVEL_EXCLUDE).toBe('.travel');
    expect(renderTravelPanel('en', initialTravelState())).toMatch(/^<div class="travel">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderTravelPanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderTravelPanel(lang, s)))
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
    for (const en of ['Count the pointer', 'What was counted', 'Path from the first', 'Copy the counts', 'window width']) expect(fr).not.toContain(en);
  });

  it('makes none of the claims the App does not make, and no medical advice', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verif', 'vérif', 'real-time', 'temps réel', 'partnership', 'partenariat', 'guarantee', 'garanti', 'eligib', 'admissib', 'diagnos', 'therap', 'thérap', 'compliant', 'conforme']) {
        expect(t, word).not.toContain(word);
      }
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(travelPanel.title).toEqual({ en: 'Pointer travel', fr: 'Déplacement du pointeur' });
    expect(travelPanel.mount).toBe(mountTravelPanel);
  });
});

describe('travelStep', () => {
  it('reads the page, says so and puts focus on the result', () => {
    const step = travelStep(initialTravelState(), 'en', read());
    expect(step.state).toEqual({ facts: PAGE, notice: 'The forms were counted.' });
    expect(step.focus).toBe('#travel-result-h');
    expect(travelModelOf(step.state)?.forms).toHaveLength(2);
    expect(travelModelOf(initialTravelState())).toBeNull();
  });

  it('says why the page could not be read, keeps what was read and keeps focus at the top', () => {
    const step = travelStep(done(), 'fr', () => {
      throw new Error('boom');
    });
    expect(step.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(step.state.facts).toBe(PAGE);
    expect(step.focus).toBe('#travel-h');
  });
});

describe('mountTravelPanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = fakeRoot();
    mountTravelPanel({ root, lang: 'fr', read: read() });
    expect(root.innerHTML).toContain('Déplacement du pointeur');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('counts on a click and again, with focus on the result', () => {
    const root = fakeRoot();
    const got = mountTravelPanel({ root, lang: 'en', read: read() });
    root.click('travel-read');
    root.click('travel-read');
    expect(got.getState().facts).toBe(PAGE);
    expect(root.focused).toEqual(['#travel-result-h', '#travel-result-h']);
  });

  it('copies the counts and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const root = fakeRoot();
    mountTravelPanel({
      root,
      lang: 'en',
      read: read(),
      copy: async (t) => {
        copied.push(t);
      },
    });
    root.click('travel-copy');
    expect(copied).toEqual([]);
    root.click('travel-read');
    root.click('travel-copy');
    await settle();
    expect(copied[0]?.split('\n')[0]).toBe('Pointer travel');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">Copied.</div>');
    const failing = fakeRoot();
    mountTravelPanel({ root: failing, lang: 'en', read: read(), copy: () => Promise.reject(new Error('no')) });
    failing.click('travel-read');
    failing.click('travel-copy');
    await settle();
    expect(failing.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('ignores clicks that are not its own, and keeps what was read in another language', () => {
    const root = fakeRoot();
    mountTravelPanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.click('slip-read');
    root.click(null);
    expect(root.innerHTML).toBe(before);
    const fr = fakeRoot();
    mountTravelPanel({ root: fr, lang: 'fr', read: read(), state: { facts: PAGE, notice: 'old' } });
    expect(fr.innerHTML).toContain('Ce qui a été compté');
    expect(fr.innerHTML).toContain('<div role="status" aria-live="polite"></div>');
  });
});
