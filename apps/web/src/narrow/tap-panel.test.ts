import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { PHONE, SILENT, fakeRoot, pageAround, settle, textOf, type FakeRoot } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { MAX_LISTED, TAP_CSS, initialTapState, isTapAction, mountTapPanel, renderTapPanel, tapPanel, tapResultText, tapStep, type TapMeasure, type TapPanelState } from './tap-panel.js';
import { AREA_HEIGHT, TAPS_PER_SIZE, TAP_SIZES, tapPlan, type ControlBox } from './tap-trial.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const TOTAL = TAP_SIZES.length * TAPS_PER_SIZE;
const CONTROLS: ControlBox[] = [
  { id: 'a[0]', name: 'Help', width: 30, height: 20 },
  { id: 'button#close[0]', name: '', width: 100, height: 44 },
  { id: 'button[1]', name: 'Go', width: 80, height: 80 },
];
const measure = (controls: readonly ControlBox[] = CONTROLS, width: number | null = 320): TapMeasure => ({ controls: () => controls, width: () => width });

/** Runs the test through `tapStep`: `miss(i)` true makes the i-th tap a miss. */
function run(miss: (i: number) => boolean = () => false, lang: 'en' | 'fr' = 'en', m: TapMeasure = measure()): TapPanelState {
  let s = tapStep(initialTapState(), 'tap-start', lang, m).state;
  for (let i = 0; i < TOTAL; i += 1) s = tapStep(s, miss(i) ? 'tap-miss' : 'tap-hit', lang, m).state;
  return s;
}

function states(lang: 'en' | 'fr'): Array<[string, TapPanelState]> {
  const started = tapStep(initialTapState(), 'tap-start', lang, measure()).state;
  const many: ControlBox[] = Array.from({ length: MAX_LISTED + 3 }, (_, i) => ({ id: `a[${i}]`, name: `Link ${i}`, width: 20, height: 20 }));
  return [
    ['at first', initialTapState()],
    ['at the first target', started],
    ['at the last target', (() => {
      let s = started;
      for (let i = 0; i < TOTAL - 1; i += 1) s = tapStep(s, 'tap-hit', lang, measure()).state;
      return s;
    })()],
    ['with a size and small controls', run((i) => i === 9, lang)],
    ['with every tap landing', run(() => false, lang)],
    ['with a miss at the largest size', run((i) => i === 0, lang)],
    ['stopped early', tapStep(tapStep(started, 'tap-hit', lang, measure()).state, 'tap-stop', lang, measure()).state],
    ['with no width', run((i) => i === 9, lang, measure(CONTROLS, null))],
    ['with many small controls', run((i) => i === 5, lang, measure(many))],
  ];
}

describe('renderTapPanel', () => {
  it('starts with an h2, says what the test is and what it is not, and offers to start', () => {
    const html = renderTapPanel('en', initialTapState());
    expect(html).toContain('<h2 id="tap-h">Button size for my taps</h2>');
    expect(html.match(/<h1[ >]/g)).toBeNull();
    const text = textOf(html);
    expect(text).toContain(`Targets appear one at a time at ${TAP_SIZES.length} sizes, from large to small, ${TAPS_PER_SIZE} at each size.`);
    expect(text).toContain('A tap beside a target counts as a miss.');
    expect(text).toContain('With a keyboard or a switch, every press lands on the target');
    expect(text).toContain('Nothing is stored or sent.');
    expect(html).toContain('<button type="button" data-action="tap-start">Start the test</button>');
    expect(html).not.toContain('id="tap-target"');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderTapPanel('en', run((i) => i === 9), 3);
    expect(html.match(/<h2[ >]/g)).toBeNull();
    expect(html).toContain('<h3 id="tap-h">');
    expect(html).toContain('<h4 id="tap-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="tap-zoom-h">');
  });

  it('shows one target at a time, inside a named area, with its number and size in a heading', () => {
    const html = renderTapPanel('en', tapStep(initialTapState(), 'tap-start', 'en', measure()).state);
    expect(html).toContain(`<h3 id="tap-run-h">Target 1 of ${TOTAL}, 96 CSS pixels</h3>`);
    expect(html).toContain('<div class="tap-area" data-action="tap-miss" role="group" aria-label="Area of the test">');
    expect(html.match(/id="tap-target"/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="Tap here, target 1 of ${TOTAL}" style="width:96px;height:96px;left:calc((100% - 96px) * 0.5);top:calc((${AREA_HEIGHT}px - 96px) * 0.5)">Tap here</button>`);
    expect(html).toContain('data-action="tap-stop">Stop the test</button>');
    expect(html).not.toContain('data-action="tap-start"');
  });

  it('gives the target a name that holds its visible text', () => {
    const html = renderTapPanel('fr', tapStep(initialTapState(), 'tap-start', 'fr', measure()).state);
    expect(html).toContain(`aria-label="Appuyez ici, cible 1 sur ${TOTAL}"`);
    expect(html).toContain('>Appuyez ici</button>');
    expect(html).toContain(`Cible 1 sur ${TOTAL}, 96${NBSP}pixels CSS</h3>`);
  });

  it('places each target of the plan inside the area, by its own fractions', () => {
    let s = tapStep(initialTapState(), 'tap-start', 'en', measure()).state;
    for (const t of tapPlan()) {
      const html = renderTapPanel('en', s);
      expect(html, String(t.index)).toContain(`style="width:${t.size}px;height:${t.size}px;left:calc((100% - ${t.size}px) * ${t.x});top:calc((${AREA_HEIGHT}px - ${t.size}px) * ${t.y})"`);
      s = tapStep(s, 'tap-hit', 'en', measure()).state;
    }
  });

  it('shows the result, the taps at each size, what it means for the App and the small controls of the page', () => {
    const html = renderTapPanel('en', run((i) => i === 9));
    expect(html).toContain('<section aria-labelledby="tap-result-h"><h3 id="tap-result-h" tabindex="-1">Result</h3>');
    expect(html).toContain('<p>On this screen, today, every tap landed from 72 CSS pixels up.</p>');
    expect(html).toContain('<caption>Taps at each size</caption>');
    expect(html).toContain('<tr><th scope="row">96 CSS pixels</th><td>4 of 4</td><td>4</td></tr>');
    expect(html).toContain('<tr><th scope="row">56 CSS pixels</th><td>4 of 4</td><td>3</td></tr>');
    expect(html).toContain('<h4 id="tap-zoom-h">What it means for the App</h4>');
    expect(html).toContain('A browser zoom of 175% brings them to 77 CSS pixels or more.');
    expect(html).toContain('<h4 id="tap-page-h">Controls of this page</h4>');
    expect(html).toContain('<p>2 of the 3 controls measured on this page are smaller than 72 CSS pixels, with no zoom.</p>');
    expect(html).toContain('<li>“Help”, 30 × 20</li><li>no name (button#close[0]), 100 × 44</li>');
    expect(html).toContain('data-action="tap-copy">Copy the result</button>');
    expect(html).toContain('data-action="tap-again">Take the test again</button>');
  });

  it('writes UNKNOWN for a size with no tap', () => {
    const html = renderTapPanel('en', states('en')[6]?.[1] as TapPanelState);
    expect(html).toContain('<tr><th scope="row">96 CSS pixels</th><td>1 of 4</td><td>1</td></tr>');
    expect(html).toContain('<tr><th scope="row">44 CSS pixels</th><td>0 of 4</td><td>UNKNOWN</td></tr>');
    expect(html).toContain('Size UNKNOWN. There were too few taps to say.');
    expect(html).not.toContain('tap-zoom-h');
    expect(html).not.toContain('tap-page-h');
  });

  it('names no zoom and lists no control when taps missed at the largest size', () => {
    const html = renderTapPanel('en', run((i) => i === 0));
    expect(html).toContain('Size UNKNOWN. Taps missed at 96 CSS pixels');
    expect(html).toContain('this test does not say how far to go');
    expect(html).not.toContain('tap-page-h');
  });

  it('lists a limited number of controls and says how many more there are', () => {
    const html = renderTapPanel('en', states('en')[8]?.[1] as TapPanelState);
    expect(html.match(/<li>“Link \d+”, 20 × 20<\/li>/g)).toHaveLength(MAX_LISTED);
    expect(html).toContain('<p>… and 3 more.</p>');
  });

  it('has only buttons of type button, each with text, and nothing that sends or loads', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderTapPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) {
          expect(b, name).toContain('type="button"');
          expect(b.replace(/<[^>]+>/g, '').trim(), name).not.toBe('');
        }
        expect(html).not.toMatch(/<form|<script|\saction=|https?:\/\/|mailto:|<img|<iframe|\shref=/i);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const [name, s] of states('en')) {
      const ids = [...renderTapPanel('en', s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button a 44 pixel minimum, and the targets their own size, never below it', () => {
    expect(TAP_CSS).toContain('.tap button{min-height:44px;min-width:44px;');
    expect(Math.min(...TAP_SIZES)).toBeGreaterThanOrEqual(44);
  });

  it('keeps the targets inside an area as wide as the panel, so the test never widens the page', () => {
    expect(TAP_CSS).toContain(`.tap .tap-area{position:relative;width:100%;height:${AREA_HEIGHT}px;`);
    expect(TAP_CSS).toContain('.tap .tap-target{position:absolute;');
    expect(TAP_CSS).toContain('touch-action:manipulation');
  });

  it('shows focus, never removes an outline, sets no colour and does not move', () => {
    expect(TAP_CSS).toContain('.tap button:focus-visible');
    expect(TAP_CSS).not.toMatch(/outline:(0|none)/);
    expect(TAP_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(TAP_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel', () => {
    for (const rule of TAP_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.tap'), selector).toBe(true);
    }
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderTapPanel(lang, state), lang);
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
      .map(([, s]) => `${textOf(renderTapPanel(lang, s))}\n${tapResultText(s, lang)}`)
      .join('\n');

  it('follows French typography in every state', () => {
    for (const line of allText('fr').split('\n')) {
      if (line.trim() === '' || /“|Link \d+|Help|Go”/.test(line)) continue;
      expect(frTypographyIssues(line), line).toEqual([]);
    }
  });

  it('has no straight apostrophe in French, and no English sentence of the panel left in it', () => {
    const fr = allText('fr');
    expect(fr).not.toMatch(/\p{L}'\p{L}/u);
    for (const phrase of ['Button size', 'Start the', 'Stop the', 'Tap here', 'Target ', 'Result', 'Taps at', 'Copy the', 'Take the', 'Controls of', 'every tap', 'CSS pixels', 'What it means']) expect(fr, phrase).not.toContain(phrase);
  });

  it('makes none of the claims the App does not make, and none about the person', () => {
    for (const lang of LANGS) {
      const text = allText(lang);
      expect(text).not.toMatch(/verif|vérif|real.?time|temps réel|partner|partenari|guarantee|garanti|certif|conform|complian/i);
      expect(text).not.toMatch(/disab|handicap|tremor|tremblement|dexterit|dextérité|diagnos|medical|médical|therap|impair/i);
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(tapPanel.title).toEqual({ en: 'Button size for my taps', fr: 'Taille de bouton pour mes appuis' });
    expect(tapPanel.mount).toBe(mountTapPanel);
  });
});

describe('isTapAction', () => {
  it.each(['tap-start', 'tap-hit', 'tap-miss', 'tap-stop', 'tap-again'])('takes %s', (a) => expect(isTapAction(a)).toBe(true));
  it.each([null, '', 'tap-copy', 'tap', 'hand-save', 'tap-hit-2'])('leaves %j alone', (a) => expect(isTapAction(a)).toBe(false));
});

describe('tapStep', () => {
  it('starts the test, says so, and puts focus on the target', () => {
    const step = tapStep(initialTapState(), 'tap-start', 'en', measure());
    expect(step.state.trial.phase).toBe('running');
    expect(step.state.notice).toBe('The test has started. The first target is on screen.');
    expect(step.focus).toBe('#tap-target');
  });

  it('counts a hit and a miss, says nothing between targets, and keeps focus on the target', () => {
    const started = tapStep(initialTapState(), 'tap-start', 'en', measure()).state;
    const hit = tapStep(started, 'tap-hit', 'en', measure());
    expect(hit.state.trial.taps).toEqual([{ size: 96, outcome: 'hit' }]);
    expect(hit.state.notice).toBe('');
    expect(hit.focus).toBe('#tap-target');
    const miss = tapStep(hit.state, 'tap-miss', 'en', measure());
    expect(miss.state.trial.taps.at(-1)).toEqual({ size: 96, outcome: 'miss' });
  });

  it('ignores a tap, a miss or a stop when no test is running', () => {
    const idle = initialTapState();
    for (const action of ['tap-hit', 'tap-miss', 'tap-stop'] as const) expect(tapStep(idle, action, 'en', measure()).state, action).toBe(idle);
    const done = run();
    expect(tapStep(done, 'tap-miss', 'en', measure()).state).toBe(done);
  });

  it('ends after the last target: measures the page, gives the result and puts focus on it', () => {
    let reads = 0;
    const counting: TapMeasure = { controls: () => (reads++, CONTROLS), width: () => 412 };
    let s = tapStep(initialTapState(), 'tap-start', 'en', counting).state;
    for (let i = 0; i < TOTAL - 1; i += 1) s = tapStep(s, 'tap-hit', 'en', counting).state;
    expect(reads).toBe(0);
    const last = tapStep(s, 'tap-hit', 'en', counting);
    expect(reads).toBe(1);
    expect(last.focus).toBe('#tap-result-h');
    expect(last.state.trial.phase).toBe('done');
    expect(last.state.widthPx).toBe(412);
    expect(last.state.page?.smaller.map((c) => c.id)).toEqual(['a[0]']);
    expect(last.state.notice).toBe('The test is over. On this screen, today, every tap landed from 44 CSS pixels up.');
  });

  it('does not measure the controls of the page when there is no size to compare with', () => {
    let reads = 0;
    const counting: TapMeasure = { controls: () => (reads++, CONTROLS), width: () => 320 };
    const stopped = tapStep(tapStep(initialTapState(), 'tap-start', 'en', counting).state, 'tap-stop', 'en', counting);
    expect(reads).toBe(0);
    expect(stopped.state.page).toBeNull();
    expect(stopped.state.notice).toBe('The test was stopped.');
    expect(stopped.focus).toBe('#tap-result-h');
  });

  it('starts again from nothing', () => {
    const step = tapStep(run(), 'tap-again', 'en', measure());
    expect(step.state).toEqual({ trial: { phase: 'running', taps: [], stopped: false }, page: null, widthPx: null, notice: 'The test has started. The first target is on screen.' });
  });

  it('says it in French', () => {
    expect(tapStep(initialTapState(), 'tap-start', 'fr', measure()).state.notice).toBe('Le test a commencé. La première cible est à l’écran.');
    expect(run(() => false, 'fr').notice).toBe(`Le test est terminé. Sur cet écran, aujourd’hui, tous les appuis ont atteint leur cible à partir de 44${NBSP}pixels CSS.`);
  });
});

describe('tapResultText', () => {
  it('is empty before the test ends', () => {
    expect(tapResultText(initialTapState(), 'en')).toBe('');
    expect(tapResultText(tapStep(initialTapState(), 'tap-start', 'en', measure()).state, 'en')).toBe('');
  });

  it('holds the title, the result, the advice and the small controls', () => {
    expect(tapResultText(run((i) => i === 9), 'en').split('\n')).toEqual([
      'Button size for my taps',
      'On this screen, today, every tap landed from 72 CSS pixels up.',
      'Controls of the App are at least 44 CSS pixels. A browser zoom of 175% brings them to 77 CSS pixels or more.',
      'At that zoom the page would have only 182 CSS pixels of width, less than the 320 CSS pixels the App is checked down to. Some content may scroll sideways. If it does, tell us with the form “Tell us about a barrier” on this page.',
      '2 of the 3 controls measured on this page are smaller than 72 CSS pixels, with no zoom.',
      '- “Help”, 30 × 20',
      '- no name (button#close[0]), 100 × 44',
      '',
    ]);
  });

  it('holds UNKNOWN and no list when there is no size', () => {
    const text = tapResultText(run((i) => i === 0), 'fr');
    expect(text).toContain('Taille UNKNOWN.');
    expect(text).not.toContain('commandes mesurées');
  });
});

describe('mountTapPanel', () => {
  interface Mounted {
    readonly root: FakeRoot;
    readonly panel: ReturnType<typeof mountTapPanel>;
    readonly copied: string[];
  }
  const mount = (over: Partial<Parameters<typeof mountTapPanel>[0]> = {}): Mounted => {
    const root = fakeRoot();
    const copied: string[] = [];
    const panel = mountTapPanel({ root, lang: 'en', controls: () => CONTROLS, env: () => PHONE, copy: async (t) => void copied.push(t), ...over });
    return { root, panel, copied };
  };
  const finishTest = (root: FakeRoot, miss: (i: number) => boolean = () => false): void => {
    root.click('tap-start');
    for (let i = 0; i < TOTAL; i += 1) root.click(miss(i) ? 'tap-miss' : 'tap-hit');
  };

  it('renders at once, sets the language on its root and moves no focus', () => {
    const { root } = mount();
    expect(root.innerHTML).toContain('<h2 id="tap-h">Button size for my taps</h2>');
    expect(root.attributes['lang']).toBe('en');
    expect(root.focused).toEqual([]);
  });

  it('runs the test from the clicks, with focus on each new target, then on the result', () => {
    const { root, panel } = mount();
    root.click('tap-start');
    expect(root.focused).toEqual(['#tap-target']);
    root.click('tap-hit');
    root.click('tap-miss');
    expect(root.innerHTML).toContain(`Target 3 of ${TOTAL}`);
    for (let i = 2; i < TOTAL; i += 1) root.click('tap-hit');
    expect(panel.getState().trial.phase).toBe('done');
    expect(root.focused.at(-1)).toBe('#tap-result-h');
    expect(root.innerHTML).toContain('Size UNKNOWN. Taps missed at 96 CSS pixels');
  });

  it('reads the width of the page from the browser facts, and says UNKNOWN when there is none', () => {
    const phone = mount();
    finishTest(phone.root, (i) => i === 9);
    expect(phone.panel.getState().widthPx).toBe(320);
    const silent = mount({ env: () => SILENT });
    finishTest(silent.root, (i) => i === 9);
    expect(silent.panel.getState().widthPx).toBeNull();
    expect(silent.root.innerHTML).toContain('Width of the page UNKNOWN');
  });

  it('copies the result and says so', async () => {
    const m = mount();
    finishTest(m.root, (i) => i === 9);
    m.root.click('tap-copy');
    await settle();
    expect(m.copied).toEqual([tapResultText(m.panel.getState(), 'en')]);
    expect(m.panel.getState().notice).toBe('Copied.');
    expect(m.root.focused.at(-1)).toBe('[data-action="tap-copy"]');
  });

  it('says how to copy by hand when copying fails or is not there', async () => {
    const failing = mount({ copy: async () => Promise.reject(new Error('denied')) });
    finishTest(failing.root);
    failing.root.click('tap-copy');
    await settle();
    expect(failing.panel.getState().notice).toBe('Copying failed. Select the text and copy it by hand.');
    const root = fakeRoot();
    const panel = mountTapPanel({ root, lang: 'fr', controls: () => CONTROLS, env: () => PHONE });
    finishTest(root);
    root.click('tap-copy');
    expect(panel.getState().notice).toBe('La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.');
  });

  it('does nothing on copy before there is a result, and ignores clicks that are not its own', () => {
    const m = mount();
    const before = m.root.innerHTML;
    for (const action of [null, 'tap-copy', 'run', 'hand-save', 'tap-hit', 'tap-miss']) m.root.click(action);
    expect(m.root.innerHTML).toBe(before);
    expect(m.copied).toEqual([]);
    expect(m.root.focused).toEqual([]);
  });

  it('keeps a finished result when mounted again in another language, and starts a running test over', () => {
    const first = mount();
    finishTest(first.root, (i) => i === 9);
    const second = mount({ lang: 'fr', state: first.panel.getState() });
    expect(second.root.innerHTML).toContain(`à partir de 72${NBSP}pixels CSS`);
    expect(second.panel.getState().notice).toBe('');
    const running = mount();
    running.root.click('tap-start');
    running.root.click('tap-hit');
    const third = mount({ lang: 'fr', state: running.panel.getState() });
    expect(third.panel.getState().trial.phase).toBe('idle');
    expect(third.root.innerHTML).toContain('Commencer le test');
  });

  it('says that no control was measured when there is no document to measure', () => {
    const root = fakeRoot();
    const panel = mountTapPanel({ root, lang: 'en', env: () => PHONE });
    finishTest(root);
    expect(panel.getState().page).toEqual({ measured: 0, smaller: [] });
    expect(root.innerHTML).toContain('No control was measured on this page.');
  });
});
