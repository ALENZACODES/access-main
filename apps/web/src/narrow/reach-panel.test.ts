import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { fakeRoot, pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import type { ReachFacts, ReachLandmark, ReachStop } from './reach-inpage.js';
import { MAX_ROWS, REACH_CSS, REACH_EXCLUDE, initialReachState, isReachAction, mountReachPanel, reachPanel, reachStep, renderReachPanel, type ReachPanelState } from './reach-panel.js';
import { buildReach } from './reach.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const stop = (name: string, landmark: ReachLandmark = 'none', jumpTo: number | null = null): ReachStop => ({ id: `a[${name}]`, tag: 'a', name, landmark, jumpTo, jumpsToMain: jumpTo !== null, jumpLands: false });
const PAGE: ReachFacts = {
  stops: [stop('Skip to content', 'banner', 6), ...Array.from({ length: 5 }, (_, i) => stop(`Menu ${i + 1}`, 'navigation')), stop('Search', 'main'), stop('', 'main'), stop('Contact', 'contentinfo')],
  invisible: 1,
  positive: 0,
  truncated: false,
};
const MANY: ReachFacts = { stops: Array.from({ length: MAX_ROWS + 4 }, (_, i) => stop(`Link ${i + 1}`, i < 3 ? 'navigation' : 'main')), invisible: 0, positive: 2, truncated: true };
const EMPTY: ReachFacts = { stops: [], invisible: 0, positive: 0, truncated: false };

const counted = (facts: ReachFacts = PAGE): ReachPanelState => ({ ...initialReachState(), model: buildReach(facts) });

function states(lang: 'en' | 'fr'): Array<[string, ReachPanelState]> {
  return [
    ['at first', initialReachState()],
    ['once counted', counted()],
    ['with an interval', reachStep({ ...counted(), intervalText: '1.5' }, 'reach-apply', lang, () => PAGE).state],
    ['with a wrong interval', reachStep({ ...counted(), intervalText: 'fast' }, 'reach-apply', lang, () => PAGE).state],
    ['with a search that finds one', reachStep({ ...counted(), find: 'search' }, 'reach-apply', lang, () => PAGE).state],
    ['with a search that finds none', reachStep({ ...counted(), find: 'zzz' }, 'reach-apply', lang, () => PAGE).state],
    ['with more stops than rows', counted(MANY)],
    ['with no stop', counted(EMPTY)],
    ['after a failure', reachStep(initialReachState(), 'reach-count', lang, () => { throw new Error('boom'); }).state],
  ];
}

describe('renderReachPanel', () => {
  it('starts with an h2, says what it counts and that it moves nothing, and offers to count', () => {
    const html = renderReachPanel('en', initialReachState());
    expect(html).toContain('<h2 id="reach-h">Reaching controls by keyboard or switch</h2>');
    expect(html).toContain('This reads the page and moves nothing. Nothing is stored or sent.');
    expect(html).toContain('<button type="button" data-action="reach-count">Count the stops on this page</button>');
    expect(html).toContain('<div role="status" aria-live="polite"></div>');
    expect(html).not.toContain('reach-result-h');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderReachPanel('en', counted(), 3);
    expect(html).toContain('<h3 id="reach-h">');
    expect(html).toContain('<h4 id="reach-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="reach-notes-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('shows the summary, the notes, where each part starts and the stops, with UNKNOWN time before an interval', () => {
    const text = textOf(renderReachPanel('en', counted()));
    expect(text).toContain('This page has 9 keyboard stops. Going from the first to the last takes 9 presses.');
    expect(text).toContain('The first control of the main content takes 7 presses from the top, or 3 presses with the skip link.');
    expect(text).toContain('1 control can take focus with no size.');
    const html = renderReachPanel('en', counted());
    expect(html).toContain('<caption>Where each part of the page starts</caption>');
    expect(html).toContain('<tr><th scope="row">Main content</th><td>Search</td><td>3</td><td>2</td><td>UNKNOWN</td></tr>');
    expect(html).toContain('<caption>Stops: 9 of 9</caption>');
    expect(html).toContain('<tr><td>7</td><th scope="row">Search</th><td>Main content</td><td>3 (7 without the skip link)</td><td>UNKNOWN</td></tr>');
    expect(html).toContain('<th scope="row">no name (a[])</th>');
  });

  it('gives times once the interval is in use', () => {
    const s = reachStep({ ...counted(), intervalText: '2' }, 'reach-apply', 'en', () => PAGE).state;
    const html = renderReachPanel('en', s);
    expect(html).toContain('<td>3</td><td>2</td><td>6 s</td>');
    expect(html).toContain('value="2"');
  });

  it('shows a limited number of rows and how to find the others', () => {
    const html = renderReachPanel('en', counted(MANY));
    expect(html).toContain(`<caption>Stops: ${MAX_ROWS} of ${MAX_ROWS + 4}</caption>`);
    expect(html).toContain('… and 4 more. Type part of a name to find one.');
    expect(html.match(/<tr><td>/g)).toHaveLength(MAX_ROWS);
  });

  it('says so when no name holds the text, and shows no tables when nothing can be reached', () => {
    expect(renderReachPanel('en', { ...counted(), find: 'zzz' })).toContain('<p>No control has a name with that text.</p>');
    const none = renderReachPanel('en', counted(EMPTY));
    expect(none).toContain('No control of this page can be reached with the Tab key.');
    expect(none).not.toContain('<table');
  });

  it('marks a wrong interval, ties the message to the field and keeps what was typed', () => {
    const s = reachStep({ ...counted(), intervalText: 'fast' }, 'reach-apply', 'en', () => PAGE).state;
    const html = renderReachPanel('en', s);
    expect(html).toContain('aria-describedby="reach-interval-hint reach-interval-error" aria-invalid="true"');
    expect(html).toContain('<p class="reach-error" id="reach-interval-error">Write a number of seconds from 0.2 to 10, such as 1.5.</p>');
    expect(html).toContain('value="fast"');
  });

  it('escapes what a page or a person wrote', () => {
    const odd: ReachFacts = { ...EMPTY, stops: [stop('<b>"x"</b>', 'main')] };
    const html = renderReachPanel('en', { ...counted(odd), find: '"><script>', intervalText: '<i>' });
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>');
  });

  it('has only buttons of type button, each with text, labelled fields and nothing that sends or loads', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderReachPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) {
          expect(b, name).toMatch(/^<button type="button" data-action="reach-[a-z]+">[^<]+<\/button>$/);
        }
        for (const id of html.match(/<input[^>]* id="([^"]+)"/g) ?? []) {
          const field = /id="([^"]+)"/.exec(id)?.[1] ?? '';
          expect(html, `${name}: ${field}`).toContain(`<label for="${field}">`);
        }
        expect(html).not.toMatch(/<form|<a |href=|src=|<img/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderReachPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button and field a 44 pixel minimum', () => {
    expect(REACH_CSS).toContain('.reach button{min-height:44px;min-width:44px;');
    expect(REACH_CSS).toContain('.reach .reach-field{display:block;width:100%;max-width:20rem;min-height:44px;');
  });

  it('keeps tables and text inside a narrow screen', () => {
    expect(REACH_CSS).toContain('table-layout:fixed');
    expect(REACH_CSS).toContain('overflow-wrap:anywhere');
  });

  it('shows focus, never removes an outline, sets no colour and does not move', () => {
    expect(REACH_CSS).toContain('.reach button:focus-visible');
    expect(REACH_CSS).not.toMatch(/outline:(0|none)/);
    expect(REACH_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|color:/i);
    expect(REACH_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel', () => {
    for (const rule of REACH_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.reach'), selector).toBe(true);
    }
  });

  it('leaves the panel itself out of the count', () => {
    expect(REACH_EXCLUDE).toBe('.reach');
    expect(renderReachPanel('en', initialReachState())).toMatch(/^<div class="reach">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderReachPanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderReachPanel(lang, s)))
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
    for (const en of ['Count the stops', 'What was counted', 'Points to look at', 'presses', 'Copy the counts']) expect(fr).not.toContain(en);
  });

  it('makes none of the claims the App does not make, and gives no advice about the person', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verified', 'vérifié', 'real-time', 'temps réel', 'partnership', 'partenariat', 'guarantee', 'garanti', 'eligib', 'admissib', 'diagnos', 'compliant', 'conforme', 'passed', 'réussi']) {
        expect(t, word).not.toContain(word);
      }
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(reachPanel.title.en).toBe('Reaching controls by keyboard or switch');
    expect(reachPanel.title.fr).toBe('Atteindre les commandes au clavier ou au contacteur');
    expect(reachPanel.mount).toBe(mountReachPanel);
  });
});

describe('isReachAction', () => {
  it('knows its own actions only', () => {
    expect(isReachAction('reach-count')).toBe(true);
    expect(isReachAction('reach-apply')).toBe(true);
    expect(isReachAction('reach-copy')).toBe(false);
    expect(isReachAction('tap-hit')).toBe(false);
    expect(isReachAction(null)).toBe(false);
  });
});

describe('reachStep', () => {
  it('counts the stops, says so and puts focus on the result', () => {
    const step = reachStep(initialReachState(), 'reach-count', 'en', () => PAGE);
    expect(step.state.model?.stops).toHaveLength(9);
    expect(step.state.notice).toBe('The stops were counted.');
    expect(step.focus).toBe('#reach-result-h');
  });

  it('counts again with what the page holds now, keeping the interval and the search', () => {
    const before = { ...counted(), interval: 1, intervalText: '1', find: 'menu' };
    const step = reachStep(before, 'reach-count', 'en', () => MANY);
    expect(step.state.model?.stops).toHaveLength(MAX_ROWS + 4);
    expect([step.state.interval, step.state.find]).toEqual([1, 'menu']);
  });

  it('says why the count failed and keeps focus at the top of the panel', () => {
    const step = reachStep(initialReachState(), 'reach-count', 'fr', () => {
      throw new Error('boom');
    });
    expect(step.state.notice).toBe(`Les arrêts n’ont pas pu être comptés${NBSP}: boom`);
    expect(step.state.model).toBeNull();
    expect(step.focus).toBe('#reach-h');
  });

  it('uses a good interval, clears an earlier error, and keeps focus on the button', () => {
    const step = reachStep({ ...counted(), intervalText: '0,5', intervalError: 'old' }, 'reach-apply', 'fr', () => PAGE);
    expect(step.state).toMatchObject({ interval: 0.5, intervalError: '', notice: 'Le tableau a été mis à jour.' });
    expect(step.focus).toBe('[data-action="reach-apply"]');
  });

  it('refuses a wrong interval, keeps the one in use, and puts focus on the field', () => {
    const step = reachStep({ ...counted(), interval: 2, intervalText: '99' }, 'reach-apply', 'en', () => PAGE);
    expect(step.state.interval).toBe(2);
    expect(step.state.intervalError).toBe(step.state.notice);
    expect(step.focus).toBe('#reach-interval');
  });

  it('goes back to an UNKNOWN time when the field is emptied', () => {
    const step = reachStep({ ...counted(), interval: 2, intervalText: '' }, 'reach-apply', 'en', () => PAGE);
    expect(step.state.interval).toBeNull();
  });
});

describe('mountReachPanel', () => {
  const mount = (opts: { lang?: 'en' | 'fr'; read?: () => ReachFacts; copy?: (t: string) => Promise<void>; state?: ReachPanelState } = {}) => {
    const root = fakeRoot();
    const got = mountReachPanel({ root, lang: opts.lang ?? 'en', read: opts.read ?? (() => PAGE), ...(opts.copy ? { copy: opts.copy } : {}), ...(opts.state ? { state: opts.state } : {}) });
    return { root, got };
  };

  it('renders at once, sets the language on its root, moves no focus and reads nothing yet', () => {
    let reads = 0;
    const { root } = mount({
      lang: 'fr',
      read: () => {
        reads += 1;
        return PAGE;
      },
    });
    expect(root.innerHTML).toContain('Atteindre les commandes au clavier ou au contacteur');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
    expect(reads).toBe(0);
  });

  it('counts on a click, then reads the two fields before applying them', () => {
    const { root, got } = mount();
    root.click('reach-count');
    expect(root.focused).toEqual(['#reach-result-h']);
    root.fields['#reach-interval'] = { value: '1' };
    root.fields['#reach-find'] = { value: 'menu' };
    root.click('reach-apply');
    expect(root.focused.at(-1)).toBe('[data-action="reach-apply"]');
    expect(root.innerHTML).toContain('<caption>Stops: 5 of 5</caption>');
    expect(got.getState()).toMatchObject({ interval: 1, find: 'menu' });
  });

  it('copies the counts as text and says so', async () => {
    const copied: string[] = [];
    const { root } = mount({
      copy: async (t) => {
        copied.push(t);
      },
    });
    root.click('reach-count');
    root.fields['#reach-interval'] = { value: '2' };
    root.click('reach-apply');
    root.click('reach-copy');
    await settle();
    expect(copied[0]?.split('\n')[0]).toBe('Reaching controls by keyboard or switch');
    expect(copied[0]).toContain('7. Search (Main content): 3 presses, 6 s');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">Copied.</div>');
    expect(root.focused.at(-1)).toBe('[data-action="reach-copy"]');
  });

  it('says how to copy by hand when copying fails', async () => {
    const { root } = mount({ copy: () => Promise.reject(new Error('no')) });
    root.click('reach-count');
    root.click('reach-copy');
    await settle();
    expect(root.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('says how to copy by hand when the browser has no clipboard', () => {
    const nav = (globalThis as { navigator?: unknown }).navigator;
    const root = fakeRoot();
    if (nav && (nav as { clipboard?: unknown }).clipboard !== undefined) return;
    mountReachPanel({ root, lang: 'en', read: () => PAGE });
    root.click('reach-count');
    root.click('reach-copy');
    expect(root.innerHTML).toContain('Copying is not available in this browser.');
  });

  it('does nothing on copy before a count, and ignores clicks that are not its own', () => {
    const copied: string[] = [];
    const { root } = mount({
      copy: async (t) => {
        copied.push(t);
      },
    });
    const before = root.innerHTML;
    root.click('reach-copy');
    root.click('tap-hit');
    root.click(null);
    expect(copied).toEqual([]);
    expect(root.innerHTML).toBe(before);
  });

  it('keeps the counts and what was typed when mounted again in another language, and reads the interval again', () => {
    const { root, got } = mount();
    root.click('reach-count');
    root.fields['#reach-interval'] = { value: 'slow' };
    root.click('reach-apply');
    const kept = got.getState();
    expect(kept.intervalError).not.toBe('');
    const again = mount({ lang: 'fr', state: kept });
    expect(again.root.innerHTML).toContain('Écrivez un nombre de secondes entre 0,2 et 10, par exemple 1,5.');
    expect(again.root.innerHTML).toContain('value="slow"');
    expect(again.root.innerHTML).toContain('<div role="status" aria-live="polite"></div>');
    const good = mount({ lang: 'fr', state: { ...kept, intervalText: '1' } });
    expect(good.got.getState()).toMatchObject({ interval: 1, intervalError: '' });
  });
});
