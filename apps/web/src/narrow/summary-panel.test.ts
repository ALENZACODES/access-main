import { describe, expect, it } from 'vitest';
import type { SummaryLines, SummaryPart } from './access-summary.js';
import { auditCopy } from './copylint.js';
import { fakeRoot, pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import {
  PART_HEADINGS,
  SUMMARY_CSS,
  goPartOf,
  goText,
  initialSummaryState,
  mountSummaryPanel,
  renderSummaryPanel,
  summaryItemsOf,
  summaryPanel,
  summaryStep,
  type SummaryPanelState,
} from './summary-panel.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const NONE: SummaryLines = { tap: '', zones: '', press: '' };
// Lines with no colon or semicolon, so they read the same in either language.
const SOME: SummaryLines = { tap: 'Smallest size tapped well 56 px.', zones: '', press: 'Presses held from 120 ms to 640 ms, at least 300 ms apart.' };
const ALL: SummaryLines = { ...SOME, zones: 'Zones reached Bottom, left (1 of 12).' };
const WHEN = new Date(2026, 10, 20, 11, 30);
const made = (lines: SummaryLines): SummaryPanelState => ({ lines, when: WHEN, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, SummaryPanelState]> {
  return [
    ['at first', initialSummaryState()],
    ['made with nothing done', summaryStep(initialSummaryState(), lang, () => NONE, () => WHEN).state],
    ['made with some parts done', made(SOME)],
    ['made with all parts done', made(ALL)],
    [
      'after a failure',
      summaryStep(
        initialSummaryState(),
        lang,
        () => {
          throw new Error('boom');
        },
        () => WHEN,
      ).state,
    ],
  ];
}

describe('renderSummaryPanel', () => {
  it('starts with an h2, says nothing is kept, and offers to make the summary', () => {
    const html = renderSummaryPanel('en', initialSummaryState());
    expect(html).toContain('<h2 id="summary-h">My access summary</h2>');
    expect(html).toContain('Nothing is stored or sent. The summary is made again each time you ask.');
    expect(html).toContain('<button type="button" data-action="summary-make">Make my summary</button>');
    expect(html).not.toContain('summary-result-h');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderSummaryPanel('en', made(SOME), 3);
    expect(html).toContain('<h3 id="summary-h">');
    expect(html).toContain('<h4 id="summary-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="summary-request-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('lists each part, gives UNKNOWN with a way to the test for a part not done, and the text to share', () => {
    const html = renderSummaryPanel('en', made(SOME));
    expect(html).toContain('<p>2 of 3 parts done. The others stay UNKNOWN.</p>');
    expect(html).toContain(`<dt>Button size for my taps</dt><dd>${SOME.tap}</dd>`);
    expect(html).toContain('<dt>Screen zones I can reach</dt><dd>UNKNOWN, not done yet. <button type="button" data-action="summary-go-zones">Go to the zones test</button></dd>');
    expect(html).toContain('<label for="summary-text">Summary to share</label>');
    expect(html).toContain('<textarea id="summary-text" readonly rows="8" aria-describedby="summary-text-hint">My access summary\nMeasured on 20 November 2026, on this screen.');
    expect(html).toContain('<label for="summary-request">Request</label>');
    expect(html).toContain('data-action="summary-copy-request">Copy the summary and the request</button>');
    expect(html).toContain('data-action="summary-make">Make it again</button>');
  });

  it('leaves out the go buttons when there is no way to go, and the request when nothing was measured', () => {
    expect(renderSummaryPanel('en', made(SOME), 2, false)).not.toContain('summary-go-');
    const none = renderSummaryPanel('en', made(NONE));
    expect(none).not.toContain('summary-request');
    expect(none).not.toContain('summary-copy-request');
    expect(none.match(/data-action="summary-go-/g)).toHaveLength(3);
  });

  it('escapes what the panels gave', () => {
    const html = renderSummaryPanel('en', made({ ...NONE, tap: '<b>x</b>' }));
    expect(html).not.toContain('<b>');
  });

  it('has only buttons of type button, each with its own text, and nothing that sends or loads', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderSummaryPanel(lang, s);
        const buttons = html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
        for (const b of buttons) expect(b, name).toMatch(/^<button type="button" data-action="summary-[a-z-]+">[^<]+<\/button>$/);
        const texts = buttons.map((b) => b.replace(/<[^>]+>/g, ''));
        expect(new Set(texts).size, name).toBe(texts.length);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderSummaryPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button a 44 pixel minimum and the text areas room', () => {
    expect(SUMMARY_CSS).toContain('.summary button{min-height:44px;min-width:44px;');
    expect(SUMMARY_CSS).toContain('.summary textarea{display:block;width:100%;min-height:8rem;');
  });

  it('shows focus, never removes an outline, sets no colour and does not move', () => {
    expect(SUMMARY_CSS).toContain('.summary button:focus-visible');
    expect(SUMMARY_CSS).not.toMatch(/outline:(0|none)/);
    expect(SUMMARY_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(SUMMARY_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel', () => {
    for (const rule of SUMMARY_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.summary'), selector).toBe(true);
    }
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderSummaryPanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderSummaryPanel(lang, s)))
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
    for (const en of ['Make my summary', 'Your summary', 'Summary to share', 'Copy the summary', 'Go to the']) expect(fr).not.toContain(en);
  });

  it('makes none of the claims the App does not make, and no medical advice', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verif', 'vérif', 'real-time', 'temps réel', 'partnership', 'partenariat', 'guarantee', 'garanti', 'eligib', 'admissib', 'diagnos', 'therap', 'thérap', 'compliant', 'conforme']) {
        expect(t, word).not.toContain(word);
      }
    }
  });

  it('has the title and the part titles in both languages for the app shell', () => {
    expect(summaryPanel.title).toEqual({ en: 'My access summary', fr: 'Mon résumé d’accès' });
    expect(summaryPanel.mount).toBe(mountSummaryPanel);
    expect(Object.keys(summaryPanel.parts)).toEqual(['tap', 'zones', 'press']);
  });
});

describe('goPartOf, goText and the part headings', () => {
  it('reads the part of a go action, and only of a known part', () => {
    expect(goPartOf('summary-go-tap')).toBe('tap');
    expect(goPartOf('summary-go-press')).toBe('press');
    expect(goPartOf('summary-go-hand')).toBeNull();
    expect(goPartOf('summary-make')).toBeNull();
    expect(goPartOf(null)).toBeNull();
  });

  it('names the test in the button, and points each part to the heading of its panel', () => {
    const items = summaryItemsOf(made(NONE), 'fr') ?? [];
    expect(items.map((i) => goText(i, 'fr'))).toEqual(['Aller au test des touchers', 'Aller au test des zones', 'Aller au test d’appui']);
    expect(PART_HEADINGS).toEqual({ tap: '#tap-h', zones: '#zones-h', press: '#press-h' });
  });
});

describe('summaryStep', () => {
  it('gathers what the panels hold now, with the time, says so and puts focus on the summary', () => {
    const step = summaryStep(initialSummaryState(), 'en', () => SOME, () => WHEN);
    expect(step.state).toEqual({ lines: SOME, when: WHEN, notice: 'The summary was made.' });
    expect(step.focus).toBe('#summary-result-h');
  });

  it('says why it could not be made, keeps the last summary and keeps focus at the top', () => {
    const step = summaryStep(
      made(SOME),
      'fr',
      () => {
        throw new Error('boom');
      },
      () => WHEN,
    );
    expect(step.state.notice).toBe(`Le résumé n’a pas pu être fait${NBSP}: boom`);
    expect(step.state.lines).toBe(SOME);
    expect(step.focus).toBe('#summary-h');
  });
});

describe('mountSummaryPanel', () => {
  it('renders at once, sets the language, moves no focus and gathers nothing yet', () => {
    let gathered = 0;
    const root = fakeRoot();
    mountSummaryPanel({
      root,
      lang: 'fr',
      collect: () => {
        gathered += 1;
        return SOME;
      },
    });
    expect(root.innerHTML).toContain('Mon résumé d’accès');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
    expect(gathered).toBe(0);
  });

  it('gathers again each time, so a test done after the first summary shows in the next', () => {
    let lines: SummaryLines = NONE;
    const root = fakeRoot();
    mountSummaryPanel({ root, lang: 'en', collect: () => lines, now: () => WHEN });
    root.click('summary-make');
    expect(root.innerHTML).toContain('No part is done yet.');
    lines = ALL;
    root.click('summary-make');
    expect(root.innerHTML).toContain('All 3 parts are done.');
    expect(root.focused).toEqual(['#summary-result-h', '#summary-result-h']);
  });

  it('sends a go button to the test of its part, and shows no go button without a way to go', () => {
    const went: SummaryPart[] = [];
    const root = fakeRoot();
    mountSummaryPanel({ root, lang: 'en', collect: () => NONE, go: (p) => went.push(p) });
    root.click('summary-make');
    root.click('summary-go-press');
    root.click('summary-go-nothing');
    expect(went).toEqual(['press']);
    const without = fakeRoot();
    mountSummaryPanel({ root: without, lang: 'en', collect: () => NONE });
    without.click('summary-make');
    expect(without.innerHTML).not.toContain('summary-go-');
  });

  it('copies the summary, or the request with the summary, and says so', async () => {
    const copied: string[] = [];
    const root = fakeRoot();
    mountSummaryPanel({
      root,
      lang: 'en',
      collect: () => SOME,
      now: () => WHEN,
      copy: async (t) => {
        copied.push(t);
      },
    });
    root.click('summary-copy');
    expect(copied).toEqual([]);
    root.click('summary-make');
    root.click('summary-copy');
    await settle();
    root.click('summary-copy-request');
    await settle();
    expect(copied[0]?.startsWith('My access summary\nMeasured on 20 November 2026')).toBe(true);
    expect(copied[1]?.startsWith('Hello, your site would be easier for me to use with')).toBe(true);
    expect(copied[1]).toContain('\n\nMy access summary\n');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">Copied.</div>');
    expect(root.focused.at(-1)).toBe('[data-action="summary-copy-request"]');
  });

  it('says how to copy by hand when copying fails', async () => {
    const root = fakeRoot();
    mountSummaryPanel({ root, lang: 'en', collect: () => SOME, copy: () => Promise.reject(new Error('no')) });
    root.click('summary-make');
    root.click('summary-copy');
    await settle();
    expect(root.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('keeps the last summary when mounted again in another language, written in that language', () => {
    const root = fakeRoot();
    mountSummaryPanel({ root, lang: 'fr', collect: () => NONE, state: { ...made(SOME), notice: 'old' } });
    expect(root.innerHTML).toContain('<dt>Taille des boutons pour mes touchers</dt>');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite"></div>');
  });
});
