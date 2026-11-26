import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import type { MovingControl, MovingLook } from './moving-inpage.js';
import { DEFAULT_AIM, MOVING_LISTED } from './moving.js';
import {
  MOVING_CSS,
  MOVING_EXCLUDE,
  initialMovingState,
  mountMovingPanel,
  movingAim,
  movingFailed,
  movingAimNoteOf,
  movingFinish,
  movingNoteOf,
  movingPanel,
  movingResultText,
  movingStart,
  renderMovingPanel,
  type MovingPanelState,
  type MovingRoot,
} from './moving-panel.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const c = (name: string, left: number, top: number, id = `button[${name}]`): MovingControl => ({ id, name, left, top, width: 80, height: 44 });
const look = (at: number, controls: MovingControl[], extra: Partial<MovingLook> = {}): MovingLook => ({ at, controls, animations: [], pauseControls: [], reduceMotion: false, truncated: false, ...extra });
const BEFORE = look(0, [c('Send', 0, 300), c('Menu', 0, 0), c('Old', 0, 400)]);
const AFTER = look(5_000, [c('Send', 0, 400), c('Menu', 0, 0), c('New', 0, 500)], {
  animations: [
    { target: 'div#ad', name: 'slide', endless: true, control: true },
    { target: 'p', name: 'fade', endless: false, control: false },
  ],
  reduceMotion: true,
});
const MANY_BEFORE = look(
  0,
  Array.from({ length: MOVING_LISTED + 3 }, (_, i) => c(`Item ${i}`, 0, i * 50)),
);
const MANY_AFTER = look(
  5_000,
  Array.from({ length: MOVING_LISTED + 3 }, (_, i) => c(`Item ${i}`, 0, i * 50 + 200)),
  { truncated: true },
);
const watched = (lang: 'en' | 'fr', a = BEFORE, b = AFTER, aim = DEFAULT_AIM): MovingPanelState => movingFinish(movingStart({ ...initialMovingState(), aim }, a, lang), b, lang);

function states(lang: 'en' | 'fr'): Array<[string, MovingPanelState]> {
  return [
    ['at first', initialMovingState()],
    ['while watching', movingStart(initialMovingState(), BEFORE, lang)],
    ['after a watch with things that moved', watched(lang)],
    ['after a watch with many moves', watched(lang, MANY_BEFORE, MANY_AFTER, 10)],
    ['after a watch of a still page', watched(lang, look(0, [c('A', 0, 0)]), look(5_000, [c('A', 0, 0)], { pauseControls: ['Pause'] }))],
    ['when animations cannot be listed', watched(lang, look(0, []), look(1_000, [], { animations: null, reduceMotion: null }), 2)],
    ['after a failure', movingFailed(initialMovingState(), new Error('boom'), lang)],
  ];
}

describe('renderMovingPanel', () => {
  it('starts with an h2, the times to aim with the default pressed, and the watch button', () => {
    const html = renderMovingPanel('en', initialMovingState());
    expect(html).toContain('<h2 id="moving-h">Things that move</h2>');
    expect(html).toContain('<div class="moving-group" role="group" aria-labelledby="moving-aim-l">');
    expect(html).toContain('<button type="button" data-action="moving-aim" data-value="5" aria-pressed="true">5 s</button>');
    expect(html).toContain('data-value="10" aria-pressed="false">10 s</button>');
    expect(html).toContain('data-action="moving-watch">Watch this page</button>');
    expect(html).toContain('Nothing is pressed, stored or sent.');
  });

  it('offers to stop while watching, and no watch button', () => {
    const html = renderMovingPanel('en', movingStart(initialMovingState(), BEFORE, 'en'));
    expect(html).toContain('<h3 id="moving-watch-h" tabindex="-1">Watching</h3>');
    expect(html).toContain('data-action="moving-stop">Stop watching now</button>');
    expect(html).not.toContain('data-action="moving-watch"');
  });

  it('shows what moved, the animations, the changes, what may help and copy', () => {
    const html = renderMovingPanel('en', watched('en'));
    const text = textOf(html);
    expect(html).toContain('<h3 id="moving-result-h" tabindex="-1">What moved</h3>');
    expect(text).toContain('Controls that moved: 1. Appeared: 1. Gone: 1.');
    expect(text).toContain('“Send” moved 100 px. A pointer resting where it was now misses it.');
    expect(html.indexOf('“slide”')).toBeLessThan(html.indexOf('“fade”'));
    expect(text).toContain('Appeared: New');
    expect(text).toContain('Gone: Old');
    expect(text).toContain('Your device asks for less motion, but endless animations run anyway.');
    expect(html).toContain('data-action="moving-watch">Watch again</button>');
    expect(html).toContain('data-action="moving-copy">Copy the result</button>');
  });

  it('lists a limited number of moved controls, and names pause buttons found', () => {
    expect(renderMovingPanel('en', watched('en', MANY_BEFORE, MANY_AFTER)).match(/<li>“Item/g)).toHaveLength(MOVING_LISTED);
    expect(textOf(renderMovingPanel('en', watched('en', look(0, []), look(5_000, [], { pauseControls: ['Pause', 'Stop'] }))))).toContain('Buttons that may pause motion: Pause, Stop.');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderMovingPanel('en', watched('en'), 3);
    expect(html).toContain('<h3 id="moving-h">');
    expect(html).toContain('<h4 id="moving-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="moving-moved-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('escapes what a page wrote', () => {
    const html = renderMovingPanel('en', watched('en', look(0, [c('<b>x</b>', 0, 0)]), look(5_000, [c('<b>x</b>', 0, 90)], { pauseControls: ['<i>p</i>'] })));
    expect(html).not.toMatch(/<b>|<i>/);
  });

  it('has only buttons of type button, and no form, field, link or picture', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderMovingPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="moving-[a-z]+"( data-value="\d+" aria-pressed="(true|false)")?>[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderMovingPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button 44 pixels, shows what is pressed without colour, shows focus and does not move', () => {
    expect(MOVING_CSS).toContain('.moving button{min-height:44px;min-width:44px;');
    expect(MOVING_CSS).toContain('.moving button[aria-pressed="true"]{font-weight:700;border-width:3px}');
    expect(MOVING_CSS).toContain('.moving button:focus-visible');
    expect(MOVING_CSS).not.toMatch(/outline:(0|none)/);
    expect(MOVING_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(MOVING_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const rule of MOVING_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.moving'), selector).toBe(true);
    }
    expect(MOVING_EXCLUDE).toBe('.moving');
    expect(renderMovingPanel('en', initialMovingState())).toMatch(/^<div class="moving">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderMovingPanel(lang, state), lang);
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
      .map(([, s]) => `${textOf(renderMovingPanel(lang, s))}\n${movingResultText(s, lang)}`)
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
    for (const en of ['Things that move', 'Watch this page', 'What moved', 'Copy the result', 'aim']) expect(fr).not.toContain(en);
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
    expect(movingPanel.title).toEqual({ en: 'Things that move', fr: 'Ce qui bouge' });
    expect(movingPanel.mount).toBe(mountMovingPanel);
  });
});

describe('movingResultText', () => {
  it('is plain text with every change, not only those listed on screen', () => {
    const text = movingResultText(watched('en', MANY_BEFORE, MANY_AFTER), 'en');
    expect(text.startsWith('Things that move\nTwo looks 5 s apart')).toBe(true);
    expect(text.match(/^- “Item/gm)).toHaveLength(MOVING_LISTED + 3);
    expect(text).not.toMatch(/<|&amp;/);
  });

  it('has only the limits before a watch', () => {
    expect(movingResultText(initialMovingState(), 'fr').split('\n')[0]).toBe('Ce qui bouge');
  });
});

describe('the steps', () => {
  it('sets the time to aim, and ignores a value it does not know', () => {
    expect(movingAim(initialMovingState(), '10')).toMatchObject({ aim: 10, chosen: true });
    for (const v of ['3', 'x', null]) expect(movingAim(initialMovingState(), v)).toBeNull();
  });

  it('starts with a look and ends with another', () => {
    const started = movingStart(initialMovingState(), BEFORE, 'fr');
    expect(started).toMatchObject({ phase: 'watching', first: BEFORE, notice: 'Observation de la page. Vous pouvez laisser le pointeur où il est.' });
    const done = movingFinish(started, AFTER, 'en');
    expect(done.phase).toBe('done');
    expect(done.first).toBeNull();
    expect(done.model?.moved).toHaveLength(1);
    expect(done.notice).toBe('The watch is over. The result follows.');
    expect(movingFinish(initialMovingState(), AFTER, 'en')).toEqual(initialMovingState());
  });

  it('says why the page could not be read, and keeps an earlier result', () => {
    expect(movingFailed(initialMovingState(), new Error('boom'), 'fr')).toMatchObject({ phase: 'idle', notice: `La page n’a pas pu être lue${NBSP}: boom` });
    expect(movingFailed(watched('en'), 'x', 'en').phase).toBe('done');
  });

  it('gives the line for the barrier text after a watch only', () => {
    expect(movingNoteOf(watched('en', BEFORE, AFTER, 10), 'en')).toBe('Things that move: I take about 10 s to aim, and controls need to stay in place for that long. Here, 2 controls moved.');
    expect(movingNoteOf(initialMovingState(), 'en')).toBe('');
    expect(movingNoteOf(movingStart(initialMovingState(), BEFORE, 'en'), 'en')).toBe('');
  });
});

interface TestRoot extends MovingRoot {
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

/** A wait that ends only when the test says so. */
function manualWait(): { wait: (ms: number) => Promise<void>; asked: number[]; release(): void } {
  const pending: Array<() => void> = [];
  const asked: number[] = [];
  return {
    asked,
    wait: (ms) =>
      new Promise<void>((ok) => {
        asked.push(ms);
        pending.push(ok);
      }),
    release: () => {
      for (const ok of pending.splice(0)) ok();
    },
  };
}

describe('mountMovingPanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = testRoot();
    mountMovingPanel({ root, lang: 'fr', look: () => BEFORE });
    expect(root.innerHTML).toContain('Ce qui bouge');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('watches for the time to aim, then shows the result', async () => {
    const looks = [BEFORE, AFTER];
    const w = manualWait();
    const root = testRoot();
    const panel = mountMovingPanel({ root, lang: 'en', look: () => looks.shift() ?? AFTER, wait: w.wait });
    root.fire('moving-aim', '10');
    expect(root.focused.at(-1)).toBe('[data-action="moving-aim"][data-value="10"]');
    root.fire('moving-watch');
    expect(w.asked).toEqual([10_000]);
    expect(root.focused.at(-1)).toBe('#moving-watch-h');
    expect(panel.getState().phase).toBe('watching');
    // Pressing a time or Watch while watching does nothing.
    root.fire('moving-aim', '2');
    root.fire('moving-watch');
    expect(w.asked).toEqual([10_000]);
    w.release();
    await settle();
    expect(panel.getState().phase).toBe('done');
    expect(root.focused.at(-1)).toBe('#moving-result-h');
    expect(textOf(root.innerHTML)).toContain('“Send” moved 100 px.');
    expect(panel.note()).toContain('I take about 10 s to aim');
  });

  it('takes the first look with the watching section already drawn, and draws nothing until the second', async () => {
    const w = manualWait();
    const root = testRoot();
    const drawnAtLook: string[] = [];
    mountMovingPanel({
      root,
      lang: 'en',
      look: () => {
        drawnAtLook.push(root.innerHTML);
        return BEFORE;
      },
      wait: w.wait,
    });
    root.fire('moving-watch');
    w.release();
    await settle();
    expect(drawnAtLook).toHaveLength(2);
    expect(drawnAtLook[0]).toContain('id="moving-watch-h"');
    expect(drawnAtLook[1]).toBe(drawnAtLook[0]);
  });

  it('stops at once when asked, and a wait that ends later does nothing', async () => {
    const looks = [BEFORE, AFTER, BEFORE];
    const w = manualWait();
    const root = testRoot();
    const panel = mountMovingPanel({ root, lang: 'en', look: () => looks.shift() ?? BEFORE, wait: w.wait });
    root.fire('moving-watch');
    root.fire('moving-stop');
    expect(panel.getState().phase).toBe('done');
    const after = panel.getState();
    w.release();
    await settle();
    expect(panel.getState()).toBe(after);
    root.fire('moving-stop');
    expect(panel.getState()).toBe(after);
  });

  it('says why the page could not be read at the start or the end', async () => {
    const bad = testRoot();
    mountMovingPanel({
      root: bad,
      lang: 'en',
      look: () => {
        throw new Error('boom');
      },
      wait: () => Promise.resolve(),
    });
    bad.fire('moving-watch');
    expect(bad.innerHTML).toContain('The page could not be read: boom');
    expect(bad.focused.at(-1)).toBe('[data-action="moving-watch"]');

    let n = 0;
    const late = testRoot();
    const panel = mountMovingPanel({
      root: late,
      lang: 'en',
      look: () => {
        n += 1;
        if (n === 2) throw new Error('gone');
        return BEFORE;
      },
      wait: () => Promise.resolve(),
    });
    late.fire('moving-watch');
    await settle();
    expect(panel.getState().phase).toBe('idle');
    expect(late.innerHTML).toContain('The page could not be read: gone');
  });

  it('copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const ok = testRoot();
    mountMovingPanel({ root: ok, lang: 'en', look: () => BEFORE, state: watched('en'), copy: async (t) => void copied.push(t) });
    ok.fire('moving-copy');
    await settle();
    expect(copied[0]).toContain('- “Send” moved 100 px.');
    expect(ok.innerHTML).toContain('>Copied.</div>');

    const bad = testRoot();
    mountMovingPanel({ root: bad, lang: 'en', look: () => BEFORE, state: watched('en'), copy: () => Promise.reject(new Error('no')) });
    bad.fire('moving-copy');
    await settle();
    expect(bad.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');

    const none = testRoot();
    mountMovingPanel({ root: none, lang: 'fr', look: () => BEFORE, state: watched('fr') });
    none.fire('moving-copy');
    expect(none.innerHTML).toContain('La copie n’est pas disponible dans ce navigateur.');

    const early = testRoot();
    const copiedEarly: string[] = [];
    mountMovingPanel({ root: early, lang: 'en', look: () => BEFORE, copy: async (t) => void copiedEarly.push(t) });
    early.fire('moving-copy');
    expect(copiedEarly).toEqual([]);
  });

  it('keeps a result in another language and clears the notice, and drops a watch that was running', () => {
    const kept = mountMovingPanel({ root: testRoot(), lang: 'fr', look: () => BEFORE, state: { ...watched('en'), notice: 'x' } });
    expect(kept.getState()).toEqual({ ...watched('en'), notice: '' });
    const dropped = mountMovingPanel({ root: testRoot(), lang: 'fr', look: () => BEFORE, state: movingStart(initialMovingState(), BEFORE, 'en') });
    expect(dropped.getState()).toMatchObject({ phase: 'idle', first: null });
    const keptOld = mountMovingPanel({ root: testRoot(), lang: 'fr', look: () => BEFORE, state: movingStart(watched('en'), BEFORE, 'en') });
    expect(keptOld.getState().phase).toBe('done');
  });

  it('ignores clicks on things that are not its actions', () => {
    const root = testRoot();
    const panel = mountMovingPanel({ root, lang: 'en', look: () => BEFORE });
    const before = root.innerHTML;
    root.fire('scan-read');
    root.fire('moving-aim', '7');
    expect(root.innerHTML).toBe(before);
    expect(panel.getState()).toEqual(initialMovingState());
  });
});

describe('movingAimNoteOf', () => {
  it('gives the time to aim for the access summary once chosen or watched with, and nothing about the page', () => {
    expect(movingAimNoteOf(initialMovingState(), 'en')).toBe('');
    expect(movingAimNoteOf({ ...initialMovingState(), aim: 10, chosen: true }, 'en')).toBe('Things that move: I take about 10 s to aim, and controls need to stay in place for that long.');
    expect(movingAimNoteOf(watched('en'), 'en')).toBe('Things that move: I take about 5 s to aim, and controls need to stay in place for that long.');
    expect(movingAimNoteOf(watched('en'), 'en')).not.toContain('Here,');
  });
});
