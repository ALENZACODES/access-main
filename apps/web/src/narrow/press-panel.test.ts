import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import {
  PRESS_CSS,
  initialPressPanel,
  isPressAction,
  mountPressPanel,
  pressEvent,
  pressPanel,
  pressStep,
  renderPressPanel,
  viaOf,
  type PressEvent,
  type PressPanelState,
  type PressRoot,
} from './press-panel.js';
import { PRESSES, pressDown, pressUp, startPress, stopPress, type PressState } from './press-timing.js';
import { markupResults } from './run.js';

const LANGS = ['en', 'fr'] as const;
const PAD = { getAttribute: (n: string) => (n === 'data-press' ? 'pad' : null) };
const ELSEWHERE = { getAttribute: () => null, closest: () => null };
const ev = (type: string, more: Partial<PressEvent> = {}): PressEvent => ({ type, target: PAD, ...more });

function run(holds: readonly number[], gap = 800): PressState {
  let s = startPress();
  let t = 1000;
  for (const h of holds) {
    s = pressUp(pressDown(s, t, 'pointer'), t + h);
    t += h + gap;
  }
  return s;
}
const EIGHT = [120, 150, 180, 200, 140, 160, 170, 130];
const panel = (trial: PressState, notice = ''): PressPanelState => ({ trial, notice });

function states(): Array<[string, PressPanelState]> {
  return [
    ['at first', initialPressPanel()],
    ['at the first press', panel(startPress())],
    ['at the fifth press', panel(run([100, 100, 100, 100]))],
    ['done with nothing to point to', panel(run(EIGHT))],
    ['done with a long press and close presses', panel(run([100, 700, 150, 120, 130, 140, 110, 160], 200))],
    ['stopped after one press', panel(stopPress(run([150])))],
    ['stopped with no press', panel(stopPress(startPress()))],
  ];
}

/** A root that keeps its handlers by event type and records focus. */
function fakeRoot() {
  const handlers: Record<string, Array<(e: PressEvent) => void>> = {};
  const root = {
    innerHTML: '',
    focused: [] as string[],
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      root.attributes[name] = value;
    },
    addEventListener(type: string, handler: (e: PressEvent) => void) {
      (handlers[type] ??= []).push(handler);
    },
    querySelector(selector: string) {
      return { focus: () => root.focused.push(selector) };
    },
    fire(e: PressEvent) {
      for (const h of handlers[e.type] ?? []) h(e);
    },
    click(action: string) {
      root.fire({ type: 'click', target: { getAttribute: (n: string) => (n === 'data-action' ? action : null) } });
    },
    /** A whole press on the pad: down then up, `hold` ms apart, from `at`. */
    press(at: number, hold: number, how: 'touch' | 'mouse' | 'key' = 'mouse') {
      const [down, up] = how === 'key' ? ['keydown', 'keyup'] : ['pointerdown', 'pointerup'];
      const extra: Partial<PressEvent> = how === 'key' ? { key: 'Enter' } : { pointerType: how, button: 0, isPrimary: true };
      root.fire(ev(down, { ...extra, timeStamp: at }));
      root.fire(ev(up, { ...extra, timeStamp: at + hold }));
    },
  };
  return root satisfies PressRoot;
}

describe('renderPressPanel', () => {
  it('starts with an h2, says there is no time limit and nothing is kept, and offers to start', () => {
    const html = renderPressPanel('en', initialPressPanel());
    expect(html).toContain('<h2 id="press-h">How I press</h2>');
    expect(html).toContain('There is no time limit. Nothing is stored or sent.');
    expect(html).toContain('<button type="button" data-action="press-start">Start the press test</button>');
    expect(html).toContain('<div role="status" aria-live="polite"></div>');
  });

  it('shows the large pad with the press number in a heading, and a way to stop', () => {
    const html = renderPressPanel('en', panel(run([100, 100])));
    expect(html).toContain('<h3 id="press-run-h" tabindex="-1">Press 3 of 8</h3>');
    expect(html).toContain('<button type="button" class="press-pad" id="press-pad" data-press="pad" aria-describedby="press-how">Press here</button>');
    expect(html).toContain('<p id="press-how">Press the large button and let go, the way you usually do. With a keyboard, use Enter or Space. Take your time.</p>');
    expect(html).toContain('data-action="press-stop">Stop the test</button>');
    expect(html).not.toContain('press-start');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderPressPanel('en', panel(run(EIGHT)), 3);
    expect(html).toContain('<h3 id="press-h">');
    expect(html).toContain('<h4 id="press-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="press-may-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('shows the result, says when nothing is pointed to, and lists each press in a table', () => {
    const html = renderPressPanel('en', panel(run(EIGHT)));
    expect(textOf(html)).toContain('8 of 8 presses measured. Each press was held from 120 ms to 200 ms, median 155 ms.');
    expect(html).toContain('<p>None of the presses measured was held long enough for a long press');
    expect(html).toContain('<caption>Each press</caption>');
    expect(html).toContain('<tr><th scope="row">1</th><td>120 ms</td><td></td></tr>');
    expect(html).toContain('<tr><th scope="row">2</th><td>150 ms</td><td>800 ms</td></tr>');
    expect(html).toContain('<strong>My presses (mouse or pointer): held from 120 ms to 200 ms; at least 800 ms between presses.</strong>');
    expect(html).toContain('data-action="press-again">Do the test again</button>');
  });

  it('lists what the times may cause, and the kind of setting that may help', () => {
    const text = textOf(renderPressPanel('en', panel(run([100, 700, 150, 120, 130, 140, 110, 160], 200))));
    expect(text).toContain('1 press was held 500 ms or more, up to 700 ms.');
    expect(text).toContain('7 presses came less than 500 ms after the one before.');
    expect(text).toContain('The accessibility settings of many phones let you lengthen the delay of a long press.');
    expect(text).toContain('Many devices have a setting that ignores presses repeated close together, or too brief.');
  });

  it('says UNKNOWN with no press, and has neither table nor barrier line then', () => {
    const html = renderPressPanel('en', panel(stopPress(startPress())));
    expect(textOf(html)).toContain('No press was measured, so the result is UNKNOWN.');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('barrier text');
  });

  it('has only buttons of type button, each with text, and nothing that sends or loads', () => {
    for (const [name, s] of states()) {
      for (const lang of LANGS) {
        const html = renderPressPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button"[^>]*>[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states()) {
        const ids = [...renderPressPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button a 44 pixel minimum and the pad a large target', () => {
    expect(PRESS_CSS).toContain('.press button{min-height:44px;min-width:44px;');
    expect(PRESS_CSS).toContain('.press .press-pad{display:block;width:100%;max-width:24rem;min-height:160px;');
  });

  it('keeps the pad from scrolling, zooming, selecting text or opening a menu on a long touch', () => {
    expect(PRESS_CSS).toContain('touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none');
  });

  it('shows focus, never removes an outline, sets no colour and does not move', () => {
    expect(PRESS_CSS).toContain('.press button:focus-visible');
    expect(PRESS_CSS).not.toMatch(/outline:(0|none)/);
    expect(PRESS_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(PRESS_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel', () => {
    for (const rule of PRESS_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.press'), selector).toBe(true);
    }
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states()) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderPressPanel(lang, state), lang);
        const results = { ...markupResults(html), 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) };
        const found = Object.values(results).flatMap((r) => (r ? r.entries : []));
        expect(found.map((e) => `${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`)).toEqual([]);
      });
    }
  }
});

describe('the wording of the panel', () => {
  const allText = (lang: 'en' | 'fr'): string =>
    states()
      .map(([, s]) => textOf(renderPressPanel(lang, s)))
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
    for (const en of ['Start the press test', 'Your press times', 'What these times may cause', 'Press here', 'Copy the result']) expect(fr).not.toContain(en);
  });

  it('makes none of the claims the App does not make, and no diagnosis', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verif', 'vérif', 'real-time', 'temps réel', 'partnership', 'partenariat', 'guarantee', 'garanti', 'eligib', 'admissib', 'diagnos', 'therap', 'thérap', 'symptom', 'symptôm', 'tremor', 'tremblement', 'spasm', 'spasme', 'compliant', 'conforme']) {
        expect(t, word).not.toContain(word);
      }
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(pressPanel.title).toEqual({ en: 'How I press', fr: 'Ma façon d’appuyer' });
    expect(pressPanel.mount).toBe(mountPressPanel);
  });
});

describe('isPressAction and pressStep', () => {
  it('knows its own actions only', () => {
    for (const a of ['press-start', 'press-stop', 'press-again']) expect(isPressAction(a)).toBe(true);
    for (const a of ['press-copy', 'tap-start', null]) expect(isPressAction(a)).toBe(false);
  });

  it('starts and starts again with focus on the pad, and stops a running test with focus on the result', () => {
    const start = pressStep(initialPressPanel(), 'press-start', 'en');
    expect(start.state.trial.phase).toBe('running');
    expect(start.state.notice).toBe('The test has started. Focus is on the large button.');
    expect(start.focus).toBe('#press-pad');
    const again = pressStep(panel(run(EIGHT)), 'press-again', 'fr');
    expect(again.state.trial.samples).toEqual([]);
    expect(again.state.notice).toBe('Le test a commencé. Le focus est sur le grand bouton.');
    const stop = pressStep(panel(run([100])), 'press-stop', 'en');
    expect(stop.state.trial).toMatchObject({ phase: 'done', stopped: true });
    expect(stop.focus).toBe('#press-result-h');
    expect(pressStep(initialPressPanel(), 'press-stop', 'en').focus).toBe('');
  });
});

describe('viaOf and pressEvent', () => {
  it('counts Enter and Space keys, the primary pointer and the main mouse button only', () => {
    expect(viaOf(ev('keydown', { key: 'Enter' }))).toBe('key');
    expect(viaOf(ev('keyup', { key: ' ' }))).toBe('key');
    expect(viaOf(ev('keydown', { key: 'Tab' }))).toBeNull();
    expect(viaOf(ev('pointerdown', { pointerType: 'touch', isPrimary: true }))).toBe('touch');
    expect(viaOf(ev('pointerdown', { pointerType: 'pen' }))).toBe('pointer');
    expect(viaOf(ev('pointerdown', { pointerType: 'mouse', button: 2 }))).toBeNull();
    expect(viaOf(ev('pointerdown', { pointerType: 'touch', isPrimary: false }))).toBeNull();
    expect(viaOf(ev('click'))).toBeNull();
  });

  it('starts a press only on the pad, ends it anywhere, and only in the way it began', () => {
    const now = () => 0;
    let s = pressEvent(startPress(), ev('pointerdown', { target: ELSEWHERE, pointerType: 'mouse', button: 0, timeStamp: 5 }), now);
    expect(s.pending).toBeNull();
    s = pressEvent(s, ev('pointerdown', { pointerType: 'mouse', button: 0, timeStamp: 10 }), now);
    s = pressEvent(s, ev('keyup', { key: 'Enter', timeStamp: 20 }), now);
    expect(s.samples).toEqual([]);
    s = pressEvent(s, ev('pointerup', { target: ELSEWHERE, pointerType: 'mouse', button: 0, timeStamp: 210 }), now);
    expect(s.samples).toEqual([{ down: 10, up: 210, via: 'pointer' }]);
  });

  it('uses the clock when an event has no time stamp, counts key repeats, and drops a cancelled press', () => {
    let t = 100;
    const now = () => t;
    let s = pressEvent(startPress(), ev('keydown', { key: ' ' }), now);
    s = pressEvent(s, ev('keydown', { key: ' ', repeat: true }), now);
    t = 650;
    s = pressEvent(s, ev('keyup', { key: ' ' }), now);
    expect(s.samples).toEqual([{ down: 100, up: 650, via: 'key' }]);
    expect(s.repeats).toBe(1);
    const cancelled = pressEvent(pressEvent(s, ev('pointerdown', { pointerType: 'touch', timeStamp: 900 }), now), ev('pointercancel'), now);
    expect(cancelled.pending).toBeNull();
  });

  it('does nothing when no test is running', () => {
    const idle = startPress();
    const done = run(EIGHT);
    expect(pressEvent(done, ev('pointerdown', { pointerType: 'mouse', button: 0, timeStamp: 1 }), () => 0)).toBe(done);
    expect(pressEvent({ ...idle, phase: 'idle' }, ev('keydown', { key: 'Enter' }), () => 0).pending).toBeNull();
  });
});

describe('mountPressPanel', () => {
  it('renders at once, sets the language on its root and moves no focus', () => {
    const root = fakeRoot();
    mountPressPanel({ root, lang: 'fr' });
    expect(root.innerHTML).toContain('Ma façon d’appuyer');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('runs the test from real events: counts each press, keeps focus on the pad, then shows the result', () => {
    const root = fakeRoot();
    const got = mountPressPanel({ root, lang: 'en' });
    root.click('press-start');
    expect(root.focused).toEqual(['#press-pad']);
    for (let i = 0; i < PRESSES - 1; i += 1) root.press(1000 + i * 1000, 150 + i * 10, i % 2 === 0 ? 'mouse' : 'key');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">7 of 8.</div>');
    expect(root.innerHTML).toContain('Press 8 of 8');
    expect(root.focused.at(-1)).toBe('#press-pad');
    root.press(9000, 600, 'touch');
    expect(got.getState().trial.phase).toBe('done');
    expect(root.focused.at(-1)).toBe('#press-result-h');
    expect(root.innerHTML).toContain('The test is over. The result follows.');
    expect(root.innerHTML).toContain('My presses (mouse or pointer, key, touch): held from 150 ms to 600 ms');
  });

  it('stops the browser from acting on a press of the pad, and from opening a menu on it', () => {
    const root = fakeRoot();
    mountPressPanel({ root, lang: 'en' });
    root.click('press-start');
    let prevented = 0;
    const preventDefault = () => {
      prevented += 1;
    };
    root.fire(ev('pointerdown', { pointerType: 'touch', timeStamp: 10, preventDefault }));
    root.fire(ev('contextmenu', { preventDefault }));
    root.fire(ev('contextmenu', { target: ELSEWHERE, preventDefault }));
    expect(prevented).toBe(2);
  });

  it('ignores presses before the start, and does not render while a press is held', () => {
    const root = fakeRoot();
    const got = mountPressPanel({ root, lang: 'en' });
    root.press(0, 100);
    expect(got.getState().trial.phase).toBe('idle');
    root.click('press-start');
    const before = root.innerHTML;
    root.fire(ev('pointerdown', { pointerType: 'mouse', button: 0, timeStamp: 10 }));
    expect(root.innerHTML).toBe(before);
  });

  it('stops the test and gives what was measured', () => {
    const root = fakeRoot();
    mountPressPanel({ root, lang: 'en' });
    root.click('press-start');
    root.press(0, 200);
    root.click('press-stop');
    expect(root.innerHTML).toContain('1 of 8 press measured, the test was stopped before the end.');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">The test was stopped.</div>');
  });

  it('copies the result and says so, or says how to copy by hand when it fails', async () => {
    const copied: string[] = [];
    const root = fakeRoot();
    mountPressPanel({
      root,
      lang: 'en',
      copy: async (t) => {
        copied.push(t);
      },
    });
    root.click('press-copy');
    expect(copied).toEqual([]);
    root.click('press-start');
    root.press(0, 200);
    root.click('press-stop');
    root.click('press-copy');
    await settle();
    expect(copied[0]?.split('\n')[0]).toBe('How I press');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">Copied.</div>');
    const failing = fakeRoot();
    mountPressPanel({ root: failing, lang: 'en', copy: () => Promise.reject(new Error('no')) });
    failing.click('press-start');
    failing.press(0, 200);
    failing.click('press-stop');
    failing.click('press-copy');
    await settle();
    expect(failing.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('keeps a finished result when mounted again in another language, and starts a running test over', () => {
    const done = mountPressPanel({ root: fakeRoot(), lang: 'fr', state: panel(run(EIGHT), 'old') });
    expect(done.getState()).toEqual({ trial: run(EIGHT), notice: '' });
    const running = mountPressPanel({ root: fakeRoot(), lang: 'fr', state: panel(run([100])) });
    expect(running.getState().trial.phase).toBe('idle');
  });
});
