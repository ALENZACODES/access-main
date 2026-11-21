import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { fakeRoot, pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import type { SlipControl, SlipFacts } from './slip-inpage.js';
import { SLIP_CSS, SLIP_EXCLUDE, SLIP_LISTED, initialSlipState, mountSlipPanel, renderSlipPanel, slipModelOf, slipPanel, slipStep, type SlipPanelState } from './slip-panel.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const ctl = (name: string, left: number, top: number, width = 44, height = 44): SlipControl => ({ id: `button[${name}]`, name, left, top, width, height });
const PAGE: SlipFacts = { controls: [ctl('Save', 0, 0), ctl('Delete', 48, 0, 30, 30), ctl('Help', 300, 300)], truncated: false };
const MANY: SlipFacts = { controls: [ctl('Delete', 0, 0, 20, 20), ...Array.from({ length: SLIP_LISTED + 3 }, (_, i) => ctl(`Item ${i}`, 0, 0))], truncated: true };
const read = (f: SlipFacts = PAGE) => () => f;
const done = (f: SlipFacts = PAGE, tapPx: number | null = 72): SlipPanelState => ({ facts: f, tapPx, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, SlipPanelState]> {
  return [
    ['at first', initialSlipState()],
    ['read with the tap size', slipStep(initialSlipState(), lang, read(), () => 72).state],
    ['read without the tap test', done(PAGE, null)],
    ['read with many slips', done(MANY, null)],
    ['read with nothing on the page', done({ controls: [], truncated: false }, null)],
    [
      'after a failure',
      slipStep(
        initialSlipState(),
        lang,
        () => {
          throw new Error('boom');
        },
        () => null,
      ).state,
    ],
  ];
}

describe('renderSlipPanel', () => {
  it('starts with an h2, says it changes nothing, and offers to read the page', () => {
    const html = renderSlipPanel('en', initialSlipState());
    expect(html).toContain('<h2 id="slip-h">Slips onto risky controls</h2>');
    expect(html).toContain('This reads the page and changes nothing. Nothing is stored or sent.');
    expect(html).toContain('<button type="button" data-action="slip-read">Find the slips on this page</button>');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderSlipPanel('en', done(), 3);
    expect(html).toContain('<h3 id="slip-h">');
    expect(html).toContain('<h4 id="slip-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="slip-pairs-h">');
    expect(html).toContain('<h5 id="slip-small-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('shows the tap size used, the places a tap may slip, the small risky controls and the advice', () => {
    const html = renderSlipPanel('en', done());
    const text = textOf(html);
    expect(text).toContain('Tap size used: 72 px, from your tap test.');
    expect(html).toContain('<li>A tap aimed at “Save” may land on “Delete”, 26 px from its centre.</li>');
    expect(html).toContain('<li>“Delete” is 30 × 30 px, less than the tap size of 72 px.</li>');
    expect(text).toContain('What may help the team:');
    expect(html).toContain('data-action="slip-read">Read the page again</button>');
  });

  it('says the size is UNKNOWN without the tap test, and has no lists when nothing was found', () => {
    const html = renderSlipPanel('en', done({ controls: [ctl('Save', 0, 0), ctl('Help', 300, 0)], truncated: false }, null));
    expect(textOf(html)).toContain('Yours stays UNKNOWN.');
    expect(html).not.toContain('slip-pairs-h');
    expect(html).not.toContain('What may help');
  });

  it('lists a limited number of places and says the rest are in the copied text', () => {
    const html = renderSlipPanel('en', done(MANY, null));
    expect(html.match(/<li>A tap aimed at/g)).toHaveLength(SLIP_LISTED);
    expect(html).toContain('… and 3 more, in the copied text.');
  });

  it('escapes what a page wrote', () => {
    expect(renderSlipPanel('en', done({ controls: [ctl('<b>x</b>', 0, 0), ctl('Delete', 10, 0)], truncated: false }))).not.toContain('<b>');
  });

  it('has only buttons of type button, each with text, and nothing that sends or loads', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderSlipPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="slip-[a-z]+">[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderSlipPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button a 44 pixel minimum, shows focus, sets no colour and does not move', () => {
    expect(SLIP_CSS).toContain('.slip button{min-height:44px;min-width:44px;');
    expect(SLIP_CSS).toContain('.slip button:focus-visible');
    expect(SLIP_CSS).not.toMatch(/outline:(0|none)/);
    expect(SLIP_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(SLIP_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const rule of SLIP_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.slip'), selector).toBe(true);
    }
    expect(SLIP_EXCLUDE).toBe('.slip');
    expect(renderSlipPanel('en', initialSlipState())).toMatch(/^<div class="slip">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderSlipPanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderSlipPanel(lang, s)))
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
    for (const en of ['Find the slips', 'What was found', 'Tap size used', 'Copy the result', 'may land on']) expect(fr).not.toContain(en);
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
    expect(slipPanel.title).toEqual({ en: 'Slips onto risky controls', fr: 'Glissements vers des commandes à risque' });
    expect(slipPanel.mount).toBe(mountSlipPanel);
  });
});

describe('slipStep', () => {
  it('reads the page and the tap size as they are now, says so and puts focus on the result', () => {
    const step = slipStep(initialSlipState(), 'en', read(), () => 56);
    expect(step.state).toEqual({ facts: PAGE, tapPx: 56, notice: 'The page was read.' });
    expect(step.focus).toBe('#slip-result-h');
    expect(slipModelOf(step.state)?.tap).toBe(56);
    expect(slipModelOf(initialSlipState())).toBeNull();
  });

  it('says why the page could not be read, keeps what was read and keeps focus at the top', () => {
    const step = slipStep(
      done(),
      'fr',
      () => {
        throw new Error('boom');
      },
      () => null,
    );
    expect(step.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(step.state.facts).toBe(PAGE);
    expect(step.focus).toBe('#slip-h');
  });
});

describe('mountSlipPanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = fakeRoot();
    mountSlipPanel({ root, lang: 'fr', read: read() });
    expect(root.innerHTML).toContain('Glissements vers des commandes à risque');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('reads the tap size again at each reading, so a tap test taken later counts', () => {
    let size: number | null = null;
    const root = fakeRoot();
    const got = mountSlipPanel({ root, lang: 'en', read: read(), tapSize: () => size });
    root.click('slip-read');
    expect(got.getState().tapPx).toBeNull();
    size = 72;
    root.click('slip-read');
    expect(got.getState().tapPx).toBe(72);
    expect(root.innerHTML).toContain('Tap size used: 72 px, from your tap test.');
    expect(root.focused).toEqual(['#slip-result-h', '#slip-result-h']);
  });

  it('copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const root = fakeRoot();
    mountSlipPanel({
      root,
      lang: 'en',
      read: read(),
      tapSize: () => 72,
      copy: async (t) => {
        copied.push(t);
      },
    });
    root.click('slip-copy');
    expect(copied).toEqual([]);
    root.click('slip-read');
    root.click('slip-copy');
    await settle();
    expect(copied[0]?.split('\n')[0]).toBe('Slips onto risky controls');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">Copied.</div>');
    const failing = fakeRoot();
    mountSlipPanel({ root: failing, lang: 'en', read: read(), copy: () => Promise.reject(new Error('no')) });
    failing.click('slip-read');
    failing.click('slip-copy');
    await settle();
    expect(failing.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('ignores clicks that are not its own, and keeps what was read in another language', () => {
    const root = fakeRoot();
    mountSlipPanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.click('voice-count');
    root.click(null);
    expect(root.innerHTML).toBe(before);
    const fr = fakeRoot();
    mountSlipPanel({ root: fr, lang: 'fr', read: read(), state: { ...done(), notice: 'old' } });
    expect(fr.innerHTML).toContain('Ce qui a été trouvé');
    expect(fr.innerHTML).toContain('<div role="status" aria-live="polite"></div>');
  });
});
