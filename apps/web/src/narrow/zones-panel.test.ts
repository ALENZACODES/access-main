import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { fakeRoot, pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';
import { CELLS, allCells, noCells } from './zones.js';
import type { ZoneControl, ZoneFacts } from './zones-inpage.js';
import {
  ZONES_MAX_LISTED,
  ZONES_CSS,
  ZONES_EXCLUDE,
  initialZonesState,
  isZonesAction,
  mountZonesPanel,
  renderZonesPanel,
  zoneCellOf,
  zonePresetOf,
  zonesCheckOf,
  zonesPanel,
  zonesStep,
  type ZonesState,
} from './zones-panel.js';

const LANGS = ['en', 'fr'] as const;
const ctl = (name: string, cx: number, cy: number, pinned = false): ZoneControl => ({ id: `button[${name}]`, name, left: cx - 22, top: cy - 22, width: 44, height: 44, pinned });
const PAGE: ZoneFacts = {
  controls: [ctl('Menu', 280, 30, true), ctl('Search', 150, 200), ctl('Next', 280, 600), ctl('', 40, 900)],
  viewportWidth: 320,
  viewportHeight: 640,
  scrollY: 0,
  maxScrollY: 600,
  offPage: 0,
  truncated: false,
};
const MANY: ZoneFacts = { ...PAGE, controls: Array.from({ length: ZONES_MAX_LISTED + 3 }, (_, i) => ctl(`Link ${i + 1}`, 300, 100 + i * 20)), truncated: true };
const read = (f: ZoneFacts = PAGE) => () => f;
const bottomLeft = (): boolean[] => noCells().map((_, i) => i === 9);

const marked = (cells: boolean[] = bottomLeft()): ZonesState => ({ ...initialZonesState(), cells });
const checked = (lang: 'en' | 'fr', f: ZoneFacts = PAGE, cells: boolean[] = bottomLeft()): ZonesState => zonesStep(marked(cells), 'zones-check', lang, read(f)).state;

function states(lang: 'en' | 'fr'): Array<[string, ZonesState]> {
  return [
    ['at first', initialZonesState()],
    ['with one zone', marked()],
    ['asked to check with no zone', zonesStep(initialZonesState(), 'zones-check', lang, read()).state],
    ['checked', checked(lang)],
    ['checked with every zone', checked(lang, PAGE, allCells())],
    ['checked with many out of reach', checked(lang, MANY)],
    ['checked with no window size', checked(lang, { ...PAGE, viewportWidth: null })],
    ['checked, then every zone unmarked', zonesStep(checked(lang), 'zones-clear', lang, read()).state],
    [
      'after a failure',
      zonesStep(marked(), 'zones-check', lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderZonesPanel', () => {
  it('starts with an h2, says what it does and that it moves nothing, and shows the grid of 12 zones, none marked', () => {
    const html = renderZonesPanel('en', initialZonesState());
    expect(html).toContain('<h2 id="zones-h">Screen zones I can reach</h2>');
    expect(html).toContain('This reads the page and moves nothing. Nothing is stored or sent.');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(CELLS);
    expect(html).toContain('<button type="button" data-action="zone-0" aria-pressed="false">Top, left</button>');
    expect(html).toContain('<button type="button" data-action="zone-11" aria-pressed="false">Bottom, right</button>');
    expect(html).toContain('<ul class="zones-grid" role="list" aria-labelledby="zones-grid-h" aria-describedby="zones-grid-hint">');
    expect(html).toContain('data-action="zones-check">Find the controls out of reach</button>');
    expect(html).not.toContain('zones-result-h');
    expect(html).not.toContain('barrier text');
  });

  it('shows a marked zone by its pressed state and a check mark hidden from assistive technology', () => {
    const html = renderZonesPanel('en', marked());
    expect(html).toContain('<button type="button" data-action="zone-9" aria-pressed="true"><span aria-hidden="true">✓ </span>Bottom, left</button>');
    expect(html).toContain('The zones you marked go into the barrier text of the form “Tell us about a barrier”, above, with the screen settings.');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderZonesPanel('en', checked('en'), 3);
    expect(html).toContain('<h3 id="zones-h">');
    expect(html).toContain('<h4 id="zones-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="zones-out-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('shows what was found, the controls out of reach with the reason, and the notes', () => {
    const html = renderZonesPanel('en', checked('en'));
    const text = textOf(html);
    expect(text).toContain('You marked 1 of 12 zones. Counted for this window, 320 by 640 CSS pixels.');
    expect(text).toContain('Of 4 controls, 1 can be brought into a zone you marked, by scrolling if needed, and 3 cannot.');
    expect(html).toContain('<li><strong>Menu</strong>: Stays in place, at Top, right, when the page scrolls.</li>');
    expect(html).toContain('<li><strong>Search</strong>: In the centre column, where no zone is marked.</li>');
    expect(html).toContain('<h4 id="zones-notes-h">Points to look at</h4>');
    expect(html).toContain('data-action="zones-check">Read the page again</button>');
  });

  it('shows, in a table laid out like the grid, the controls each zone can take, with the marked zones said in words', () => {
    const html = renderZonesPanel('en', checked('en'));
    expect(html).toContain('<table class="zones-counts"><caption>Controls each zone can take, by scrolling if needed</caption>');
    expect(html).toContain('<thead><tr><th scope="col">Row</th><th scope="col">Left</th><th scope="col">Centre</th><th scope="col">Right</th></tr></thead>');
    // Search can only go up from 200, the control with no name only down from 900, and Next anywhere in the right column.
    expect(html).toContain('<tr><th scope="row">Top</th><td>0</td><td>1</td><td>2</td></tr>');
    expect(html).toContain('<tr><th scope="row">Bottom</th><td>1 (marked)</td><td>0</td><td>1</td></tr>');
    expect(textOf(html)).toContain('The zone that can take the most controls: Top, right, with 2 of 4.');
    expect(renderZonesPanel('fr', checked('fr'))).toContain('<th scope="col">Gauche</th>');
    expect(renderZonesPanel('fr', checked('fr'))).toContain('<td>1 (cochée)</td>');
    expect(renderZonesPanel('en', checked('en', { ...PAGE, viewportWidth: null }))).not.toContain('zones-counts');
  });

  it('lists no control when all can be reached', () => {
    const html = renderZonesPanel('en', checked('en', PAGE, allCells()));
    expect(html).toContain('All 4 controls of this page can be brought into a zone you marked, by scrolling if needed.');
    expect(html).not.toContain('zones-out-h');
  });

  it('lists a limited number of controls and says the rest are in the copied text', () => {
    const html = renderZonesPanel('en', checked('en', MANY));
    expect(html.match(/<li><strong>/g)).toHaveLength(ZONES_MAX_LISTED);
    expect(html).toContain('… and 3 more, in the copied text.');
  });

  it('marks the grid and says why when checking with no zone', () => {
    const html = renderZonesPanel('en', zonesStep(initialZonesState(), 'zones-check', 'en', read()).state);
    expect(html).toContain('aria-describedby="zones-grid-hint zones-error"');
    expect(html).toContain('<p class="zones-error" id="zones-error">Mark at least one zone you can reach first.</p>');
  });

  it('says UNKNOWN once the zones are unmarked after a check', () => {
    expect(textOf(renderZonesPanel('en', zonesStep(checked('en'), 'zones-clear', 'en', read()).state))).toContain('No zone is marked. The result stays UNKNOWN.');
  });

  it('escapes what a page wrote', () => {
    const html = renderZonesPanel('en', checked('en', { ...PAGE, controls: [ctl('<b>"x"</b>', 280, 30, true)] }));
    expect(html).not.toContain('<b>');
  });

  it('has only buttons of type button, each with text, and nothing that sends or loads', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderZonesPanel(lang, s);
        for (const b of html.match(/<button[^>]*>.*?<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="zones?-[a-z0-9-]+"( aria-pressed="(true|false)")?>(<span aria-hidden="true">✓ <\/span>)?[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderZonesPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button a 44 pixel minimum, and the zones more', () => {
    expect(ZONES_CSS).toContain('.zones button{min-height:44px;min-width:44px;');
    expect(ZONES_CSS).toContain('grid-template-columns:repeat(3,minmax(44px,1fr))');
    expect(ZONES_CSS).toContain('.zones .zones-grid button{width:100%;min-height:56px;');
  });

  it('shows a marked zone by its border and weight, not by colour', () => {
    expect(ZONES_CSS).toContain('.zones .zones-grid button[aria-pressed="true"]{border-width:4px;font-weight:700}');
  });

  it('shows focus, never removes an outline, sets no colour and does not move', () => {
    expect(ZONES_CSS).toContain('.zones button:focus-visible');
    expect(ZONES_CSS).not.toMatch(/outline:(0|none)/);
    expect(ZONES_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(ZONES_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel', () => {
    for (const rule of ZONES_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.zones'), selector).toBe(true);
    }
  });

  it('leaves the panel itself out of the reading', () => {
    expect(ZONES_EXCLUDE).toBe('.zones');
    expect(renderZonesPanel('en', initialZonesState())).toMatch(/^<div class="zones">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderZonesPanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderZonesPanel(lang, s)))
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
    for (const en of ['Mark every zone', 'What was found', 'Points to look at', 'out of reach', 'Copy the result']) expect(fr).not.toContain(en);
  });

  it('makes none of the claims the App does not make, and gives no advice about the person', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verified', 'vérifié', 'real-time', 'temps réel', 'partnership', 'partenariat', 'guarantee', 'garanti', 'eligib', 'admissib', 'diagnos', 'therap', 'thérap', 'compliant', 'conforme', 'verif', 'vérif']) {
        expect(t, word).not.toContain(word);
      }
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(zonesPanel.title.en).toBe('Screen zones I can reach');
    expect(zonesPanel.title.fr).toBe('Zones de l’écran que j’atteins');
    expect(zonesPanel.mount).toBe(mountZonesPanel);
  });
});

describe('zoneCellOf and isZonesAction', () => {
  it('reads the zone of a zone action, and knows its own actions only', () => {
    expect(zoneCellOf('zone-0')).toBe(0);
    expect(zoneCellOf('zone-11')).toBe(11);
    expect(zoneCellOf('zone-12')).toBeNull();
    expect(zoneCellOf('zone-x')).toBeNull();
    expect(zoneCellOf(null)).toBeNull();
    for (const a of ['zone-3', 'zones-all', 'zones-clear', 'zones-check']) expect(isZonesAction(a), a).toBe(true);
    for (const a of ['zones-copy', 'zone-99', 'reach-count', null]) expect(isZonesAction(a), String(a)).toBe(false);
  });

  it('reads the set of a preset action', () => {
    expect(zonePresetOf('zones-preset-bottom')).toBe('bottom');
    expect(zonePresetOf('zones-preset-right')).toBe('right');
    expect(zonePresetOf('zones-preset-top')).toBeNull();
    expect(zonePresetOf('zones-all')).toBeNull();
    expect(isZonesAction('zones-preset-left')).toBe(true);
    expect(isZonesAction('zones-preset-top')).toBe(false);
  });
});

describe('zonesStep', () => {
  it('marks and unmarks a zone, says nothing, and keeps focus on it', () => {
    const on = zonesStep(initialZonesState(), 'zone-4', 'en', read());
    expect(on.state.cells[4]).toBe(true);
    expect(on.state.notice).toBe('');
    expect(on.focus).toBe('[data-action="zone-4"]');
    expect(zonesStep(on.state, 'zone-4', 'en', read()).state.cells[4]).toBe(false);
  });

  it('marks a set of zones in one press, in place of what was marked, clears an error and keeps focus on the button', () => {
    const asked = zonesStep(initialZonesState(), 'zones-check', 'en', read()).state;
    const step = zonesStep({ ...asked, cells: noCells().map((_, i) => i === 0) }, 'zones-preset-bottom', 'en', read());
    expect(step.state.cells.map((on, i) => (on ? i : -1)).filter((i) => i >= 0)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(step.state.error).toBe('');
    expect(step.focus).toBe('[data-action="zones-preset-bottom"]');
  });

  it('shows the sets as a named group of buttons', () => {
    const html = renderZonesPanel('en', initialZonesState());
    expect(html).toContain('<p id="zones-presets-h">Or mark a set of zones in one press, in place of the zones marked now:</p>');
    expect(html).toContain(
      '<p class="zones-actions" role="group" aria-labelledby="zones-presets-h"><button type="button" data-action="zones-preset-bottom">Bottom half</button> <button type="button" data-action="zones-preset-left">Left column</button> <button type="button" data-action="zones-preset-right">Right column</button></p>',
    );
    expect(renderZonesPanel('fr', initialZonesState())).toContain(`à la place des zones cochées maintenant${NBSP}:</p>`);
  });

  it('marks and unmarks every zone', () => {
    const all = zonesStep(initialZonesState(), 'zones-all', 'en', read());
    expect(all.state.cells).toEqual(allCells());
    expect(all.focus).toBe('[data-action="zones-all"]');
    expect(zonesStep(all.state, 'zones-clear', 'en', read()).state.cells).toEqual(noCells());
  });

  it('does not read the page with no zone, says why and puts focus on the first zone', () => {
    let reads = 0;
    const step = zonesStep(initialZonesState(), 'zones-check', 'fr', () => {
      reads += 1;
      return PAGE;
    });
    expect(reads).toBe(0);
    expect(step.state.error).toBe('Cochez d’abord au moins une zone que vous atteignez.');
    expect(step.state.notice).toBe(step.state.error);
    expect(step.focus).toBe('[data-action="zone-0"]');
    expect(zonesStep(step.state, 'zone-2', 'fr', read()).state.error).toBe('');
  });

  it('reads the page, says so and puts focus on the result, and works the result out again as zones change', () => {
    const step = zonesStep(marked(), 'zones-check', 'en', read());
    expect(step.state.facts).toBe(PAGE);
    expect(step.state.notice).toBe('The controls of this page were read.');
    expect(step.focus).toBe('#zones-result-h');
    const before = zonesCheckOf(step.state);
    const after = zonesCheckOf(zonesStep(step.state, 'zones-all', 'en', read()).state);
    expect(before?.kind === 'result' && before.result.out.length).toBe(3);
    expect(after?.kind === 'result' && after.result.out.length).toBe(0);
  });

  it('says why the page could not be read and keeps focus at the top of the panel', () => {
    const step = zonesStep(marked(), 'zones-check', 'fr', () => {
      throw new Error('boom');
    });
    expect(step.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(step.state.facts).toBeNull();
    expect(step.focus).toBe('#zones-h');
  });
});

describe('mountZonesPanel', () => {
  const mount = (opts: { lang?: 'en' | 'fr'; copy?: (t: string) => Promise<void>; state?: ZonesState } = {}) => {
    const root = fakeRoot();
    const got = mountZonesPanel({ root, lang: opts.lang ?? 'en', read: read(), ...(opts.copy ? { copy: opts.copy } : {}), ...(opts.state ? { state: opts.state } : {}) });
    return { root, got };
  };

  it('renders at once, sets the language on its root and moves no focus', () => {
    const { root } = mount({ lang: 'fr' });
    expect(root.innerHTML).toContain('Zones de l’écran que j’atteins');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('marks zones and checks from the clicks, with focus where each step puts it', () => {
    const { root, got } = mount();
    root.click('zone-9');
    root.click('zone-10');
    root.click('zones-check');
    expect(root.focused).toEqual(['[data-action="zone-9"]', '[data-action="zone-10"]', '#zones-result-h']);
    expect(got.getState().cells.filter(Boolean)).toHaveLength(2);
    expect(root.innerHTML).toContain('You marked 2 of 12 zones.');
  });

  it('finds the action from the check mark inside a zone button', () => {
    const handlers: Array<(e: { target: unknown }) => void> = [];
    const root = { innerHTML: '', addEventListener: (_t: 'click', h: (e: { target: unknown }) => void) => handlers.push(h) };
    const got = mountZonesPanel({ root, lang: 'en', read: read() });
    const span = { getAttribute: () => null, closest: (s: string) => (s === '[data-action]' ? { getAttribute: (n: string) => (n === 'data-action' ? 'zone-5' : null) } : null) };
    for (const h of handlers) h({ target: span });
    expect(got.getState().cells[5]).toBe(true);
  });

  it('copies the result as text and says so', async () => {
    const copied: string[] = [];
    const { root } = mount({
      copy: async (t) => {
        copied.push(t);
      },
    });
    root.click('zone-9');
    root.click('zones-check');
    root.click('zones-copy');
    await settle();
    expect(copied[0]?.split('\n').slice(0, 2)).toEqual(['Screen zones I can reach', 'Screen zones I can reach: Bottom, left (1 of 12).']);
    expect(copied[0]).toContain('can take the most controls');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">Copied.</div>');
    expect(root.focused.at(-1)).toBe('[data-action="zones-copy"]');
  });

  it('says how to copy by hand when copying fails', async () => {
    const { root } = mount({ copy: () => Promise.reject(new Error('no')) });
    root.click('zone-9');
    root.click('zones-check');
    root.click('zones-copy');
    await settle();
    expect(root.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('does nothing on copy before a check, and ignores clicks that are not its own', () => {
    const copied: string[] = [];
    const { root } = mount({
      copy: async (t) => {
        copied.push(t);
      },
    });
    const before = root.innerHTML;
    root.click('zones-copy');
    root.click('reach-count');
    root.click(null);
    expect(copied).toEqual([]);
    expect(root.innerHTML).toBe(before);
  });

  it('keeps the zones and what was read when mounted again in another language, and writes the error again in it', () => {
    const { root, got } = mount();
    root.click('zones-check');
    const kept = got.getState();
    expect(kept.error).not.toBe('');
    const fr = mount({ lang: 'fr', state: kept });
    expect(fr.root.innerHTML).toContain('Cochez d’abord au moins une zone que vous atteignez.');
    expect(fr.root.innerHTML).toContain('<div role="status" aria-live="polite"></div>');
    const done = mount({ lang: 'fr', state: checked('en') });
    expect(done.root.innerHTML).toContain('Vous avez coché 1 zone sur 12.');
  });
});
