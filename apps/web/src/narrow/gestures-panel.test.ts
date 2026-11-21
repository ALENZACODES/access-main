import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { emptyDragTrial, giveUpDrag, type DragTrial, type DragTry } from './drag-trial.js';
import { pageAround, settle, textOf } from './fit-testkit.js';
import type { GestureFacts, GestureItem } from './gesture-inpage.js';
import {
  GESTURES_CSS,
  GESTURES_EXCLUDE,
  GESTURES_LISTED,
  gesturesDrag,
  gesturesModelOf,
  gesturesNoteOf,
  gesturesPanel,
  gesturesResultText,
  gesturesStep,
  initialGesturesState,
  isGesturesAction,
  mountGesturesPanel,
  renderGesturesPanel,
  type GestureEvent,
  type GestureNode,
  type GestureRoot,
  type GesturesPanelState,
} from './gestures-panel.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const it1 = (kind: GestureItem['kind'], name: string, alternatives: string[] = [], keyboard: boolean | null = null): GestureItem => ({ id: `${kind}[${name}]`, kind, name, alternatives, keyboard });
const PAGE: GestureFacts = { items: [it1('slider', 'Volume', ['+'], true), it1('draggable', 'Stop 2'), it1('canvas', 'Map', [], false)], truncated: false };
const MANY: GestureFacts = { items: Array.from({ length: GESTURES_LISTED + 4 }, (_, i) => it1('draggable', `Row ${i}`)), truncated: true };
const read = (f: GestureFacts = PAGE) => (): GestureFacts => f;
const tr = (reached: boolean, ms: number): DragTry => ({ start: 0, end: ms, reached, furthest: reached ? 1 : 0.5, pointerType: 'touch' });
const SOME: DragTrial = { tries: [tr(true, 1_000), tr(false, 400), tr(true, 2_000)], current: null, gaveUp: false };
const st = (trial: DragTrial = SOME, facts: GestureFacts | null = PAGE, testing = false): GesturesPanelState => ({ trial, testing, facts, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, GesturesPanelState]> {
  return [
    ['at first', initialGesturesState()],
    ['while testing', gesturesStep(initialGesturesState(), 'gest-start', lang, read()).state],
    ['after the test, before reading', st(SOME, null)],
    ['after giving up, with the page read', st(giveUpDrag(emptyDragTrial()), PAGE)],
    ['with the page read and no test', st(emptyDragTrial(), PAGE)],
    ['with many controls', st(SOME, MANY)],
    ['with nothing on the page', st(SOME, { items: [], truncated: false })],
    [
      'after a failure',
      gesturesStep(initialGesturesState(), 'gest-read', lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderGesturesPanel', () => {
  it('starts with an h2, says the page is not changed, and offers the test, a way out and the reading', () => {
    const html = renderGesturesPanel('en', initialGesturesState());
    expect(html).toContain('<h2 id="gest-h">Dragging and gestures</h2>');
    expect(html).toContain('The page is read, never changed. Nothing is stored or sent.');
    expect(html).toContain('data-action="gest-start">Start the drag test</button>');
    expect(html).toContain('data-action="gest-cannot">I cannot drag</button>');
    expect(html).toContain('data-action="gest-read">Find drag and gesture controls</button>');
    expect(html).not.toContain('class="gest-track"');
  });

  it('draws the track while testing, hidden from assistive technology, with a way out', () => {
    const html = renderGesturesPanel('en', st({ tries: [tr(true, 1)], current: null, gaveUp: false }, null, true));
    expect(html).toContain('<p id="gest-try">Try 2 of 3.</p>');
    expect(html).toContain('<div class="gest-track" aria-hidden="true"><div class="gest-end"></div><div class="gest-handle" data-drag-handle="1"></div></div>');
    expect(html).toContain('data-action="gest-cannot">I cannot drag</button>');
    expect(html).toContain('data-action="gest-stop">Stop the test</button>');
  });

  it('shows the test result, the findings with the ones to look at first, the hints and copy', () => {
    const html = renderGesturesPanel('en', st());
    const text = textOf(html);
    expect(text).toContain('2 of 3 tries reached the end of the track, with touch.');
    expect(text).toContain('3 controls found. With no single-tap way found: 2. With a possible other way, to try: 1.');
    expect(text).toContain('From your drag test, the 2 controls with no other way may block you.');
    expect(html.indexOf('Stop 2')).toBeLessThan(html.indexOf('Volume'));
    expect(text).toContain('What may help the team');
    expect(html).toContain('data-action="gest-start">Do the drag test again</button>');
    expect(html).toContain('data-action="gest-read">Read the page again</button>');
    expect(html).toContain('data-action="gest-copy">Copy the result</button>');
  });

  it('lists a limited number of controls and says the rest are in the copied text', () => {
    const html = renderGesturesPanel('en', st(SOME, MANY));
    expect(html.match(/<li>Item to drag/g)).toHaveLength(GESTURES_LISTED);
    expect(html).toContain('… and 4 more, in the copied text.');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderGesturesPanel('en', st(), 3);
    expect(html).toContain('<h3 id="gest-h">');
    expect(html).toContain('<h4 id="gest-test-h" tabindex="-1">');
    expect(html).toContain('<h4 id="gest-page-h" tabindex="-1">');
    expect(html).toContain('<h5 id="gest-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="gest-help-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('escapes what a page wrote', () => {
    expect(renderGesturesPanel('en', st(SOME, { items: [it1('slider', '<b>x</b>', ['<i>+</i>'])], truncated: false }))).not.toMatch(/<b>|<i>/);
  });

  it('has only buttons of type button, and no form, field, link or picture', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderGesturesPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="gest-[a-z]+">[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderGesturesPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button and the handle 44 pixels, shows focus, sets no colour and does not move by itself', () => {
    expect(GESTURES_CSS).toContain('.gest button{min-height:44px;min-width:44px;');
    expect(GESTURES_CSS).toContain('.gest .gest-handle{position:absolute;top:6px;left:6px;width:44px;height:44px;');
    expect(GESTURES_CSS).toContain('touch-action:none');
    expect(GESTURES_CSS).toContain('.gest button:focus-visible');
    expect(GESTURES_CSS).not.toMatch(/outline:(0|none)/);
    expect(GESTURES_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(GESTURES_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const rule of GESTURES_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.gest'), selector).toBe(true);
    }
    expect(GESTURES_EXCLUDE).toBe('.gest');
    expect(renderGesturesPanel('en', initialGesturesState())).toMatch(/^<div class="gest">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderGesturesPanel(lang, state), lang);
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
      .map(([, s]) => `${textOf(renderGesturesPanel(lang, s))}\n${gesturesResultText(s, lang)}`)
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
    for (const en of ['Start the drag', 'I cannot drag', 'What was found', 'Copy the result', 'single tap']) expect(fr).not.toContain(en);
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
    expect(gesturesPanel.title).toEqual({ en: 'Dragging and gestures', fr: 'Glisser et gestes' });
    expect(gesturesPanel.mount).toBe(mountGesturesPanel);
  });
});

describe('gesturesResultText', () => {
  it('is plain text with the test, every finding and the hints', () => {
    const text = gesturesResultText(st(SOME, MANY), 'en');
    expect(text.startsWith('Dragging and gestures\n2 of 3 tries reached')).toBe(true);
    expect(text.match(/^- Item to drag/gm)).toHaveLength(MANY.items.length);
    expect(text).toContain('What may help the team:\n- For an item to drag');
    expect(text).not.toMatch(/<|&amp;/);
  });

  it('has only the test before the page is read', () => {
    expect(gesturesResultText(st(SOME, null), 'fr')).not.toContain('Cette page');
  });
});

describe('gesturesStep', () => {
  it('starts a fresh test and keeps what was read', () => {
    const step = gesturesStep(st(), 'gest-start', 'en', read());
    expect(step.state).toEqual({ trial: emptyDragTrial(), testing: true, facts: PAGE, notice: 'The drag test has started. The handle is at the start of the track.' });
    expect(step.focus).toBe('#gest-test-h');
  });

  it('records that the person cannot drag, from the start or during the test', () => {
    for (const from of [initialGesturesState(), st(SOME, null, true)]) {
      const step = gesturesStep(from, 'gest-cannot', 'fr', read());
      expect(step.state.trial).toEqual(giveUpDrag(emptyDragTrial()));
      expect(step.state.testing).toBe(false);
      expect(step.state.notice).toBe('Le test de glissement est terminé. Le résultat suit.');
    }
  });

  it('stops a test and keeps the tries done, and does nothing when no test runs', () => {
    const step = gesturesStep(st({ ...SOME, current: { start: 0, at: 0.2, pointerType: 'touch' } }, null, true), 'gest-stop', 'en', read());
    expect(step.state.trial.tries).toHaveLength(3);
    expect(step.state.trial.current).toBeNull();
    expect(step.state.testing).toBe(false);
    expect(gesturesStep(st(), 'gest-stop', 'en', read()).focus).toBe('');
  });

  it('reads the page and puts focus on the result, or says why it could not', () => {
    const ok = gesturesStep(initialGesturesState(), 'gest-read', 'en', read());
    expect(ok.state.facts).toBe(PAGE);
    expect(ok.focus).toBe('#gest-result-h');
    expect(gesturesModelOf(ok.state)?.none).toBe(2);
    expect(gesturesModelOf(initialGesturesState())).toBeNull();
    const bad = gesturesStep(st(), 'gest-read', 'fr', () => {
      throw new Error('boom');
    });
    expect(bad.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(bad.state.facts).toBe(PAGE);
    expect(bad.focus).toBe('#gest-page-h');
  });

  it('knows its actions', () => {
    for (const a of ['gest-start', 'gest-cannot', 'gest-stop', 'gest-read']) expect(isGesturesAction(a)).toBe(true);
    for (const a of ['gest-copy', 'typing-start', '', null]) expect(isGesturesAction(a)).toBe(false);
  });
});

describe('gesturesDrag and gesturesNoteOf', () => {
  const testing = (): GesturesPanelState => st(emptyDragTrial(), null, true);

  it('says when a try reaches the end or stops short, and ends the test after the last', () => {
    let s = gesturesDrag(testing(), { kind: 'down', x: 0, at: 0, pointerType: 'touch' }, 'en');
    expect(s.notice).toBe('');
    s = gesturesDrag(s, { kind: 'move', x: 1, at: 800 }, 'en');
    expect(s.notice).toBe('Try 1 reached the end.');
    s = gesturesDrag(s, { kind: 'down', x: 0, at: 1_000, pointerType: 'touch' }, 'fr');
    s = gesturesDrag(s, { kind: 'up', x: 0.3, at: 1_200 }, 'fr');
    expect(s.notice).toBe('L’essai 2 s’est arrêté en route.');
    expect(s.testing).toBe(true);
    s = gesturesDrag(s, { kind: 'down', x: 0, at: 2_000, pointerType: 'touch' }, 'en');
    s = gesturesDrag(s, { kind: 'move', x: 0.95, at: 2_500 }, 'en');
    expect(s.testing).toBe(false);
    expect(s.notice).toBe('Try 3 reached the end. The drag test is over. The result follows.');
  });

  it('ignores pointer events when no test runs', () => {
    const s = st();
    expect(gesturesDrag(s, { kind: 'down', x: 0, at: 0, pointerType: 'touch' }, 'en')).toBe(s);
  });

  it('gives the line for the barrier text after the test only', () => {
    expect(gesturesNoteOf(st(), 'en')).toBe('Dragging: 2 of 3 tries made it. I need another way to do it, with a single tap or click.');
    expect(gesturesNoteOf(st(SOME, null, true), 'en')).toBe('');
    expect(gesturesNoteOf(initialGesturesState(), 'en')).toBe('');
  });
});

interface TestRoot extends GestureRoot {
  readonly focused: string[];
  readonly attributes: Record<string, string>;
  readonly handle: GestureNode & { captured: number[]; style: { transform: string } };
  click(action: string): void;
  pointer(type: string, clientX: number, at: number, opts?: { onHandle?: boolean; pointerId?: number; pointerType?: string }): void;
}

function testRoot(trackWidth = 300): TestRoot {
  const handlers: Record<string, Array<(e: GestureEvent) => void>> = {};
  const handle = { captured: [] as number[], style: { transform: '' }, getBoundingClientRect: () => ({ left: 6, width: 44 }), setPointerCapture: (id: number) => void handle.captured.push(id) };
  const root: TestRoot = {
    innerHTML: '',
    focused: [],
    attributes: {},
    handle,
    setAttribute(name, value) {
      root.attributes[name] = value;
    },
    addEventListener(type, handler) {
      (handlers[type] ??= []).push(handler);
    },
    querySelector(selector) {
      if (selector === '[data-drag-handle]') return handle;
      if (selector === '.gest-track') return { getBoundingClientRect: () => ({ left: 0, width: trackWidth }) };
      return { focus: () => root.focused.push(selector) };
    },
    click(action) {
      for (const h of handlers.click ?? []) h({ type: 'click', target: { getAttribute: (n: string) => (n === 'data-action' ? action : null) } });
    },
    pointer(type, clientX, at, opts = {}) {
      const onHandle = opts.onHandle ?? true;
      const target = { getAttribute: (n: string) => (n === 'data-drag-handle' && onHandle ? '1' : null) };
      for (const h of handlers[type] ?? []) h({ type, target, clientX, timeStamp: at, pointerId: opts.pointerId ?? 1, pointerType: opts.pointerType ?? 'touch', preventDefault: () => undefined });
    },
  };
  return root;
}

describe('mountGesturesPanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = testRoot();
    mountGesturesPanel({ root, lang: 'fr', read: read() });
    expect(root.innerHTML).toContain('Glisser et gestes');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('runs a whole drag test with the pointer, moving the handle without drawing the panel again', () => {
    // The track is 300 pixels wide and the handle 44: it can travel 244 pixels.
    const root = testRoot();
    const panel = mountGesturesPanel({ root, lang: 'en', read: read() });
    root.click('gest-start');
    expect(root.focused).toEqual(['#gest-test-h']);
    root.pointer('pointerdown', 20, 1_000, { pointerType: 'mouse' });
    expect(root.handle.captured).toEqual([1]);
    const drawn = root.innerHTML;
    root.pointer('pointermove', 20 + 122, 1_300);
    expect(root.handle.style.transform).toBe('translateX(122px)');
    expect(root.innerHTML).toBe(drawn);
    root.pointer('pointermove', 20 + 240, 1_600);
    expect(panel.getState().trial.tries[0]).toMatchObject({ reached: true, start: 1_000, end: 1_600, pointerType: 'mouse' });
    expect(root.innerHTML).toContain('Try 1 reached the end.');
    // A move after the try ended changes nothing.
    root.pointer('pointermove', 400, 1_700);
    expect(panel.getState().trial.tries).toHaveLength(1);
    // A press outside the handle starts nothing; a let-go short ends the try.
    root.pointer('pointerdown', 20, 2_000, { onHandle: false });
    expect(panel.getState().trial.current).toBeNull();
    root.pointer('pointerdown', 20, 2_000);
    root.pointer('pointerup', 20 + 50, 2_400);
    expect(panel.getState().trial.tries[1]).toMatchObject({ reached: false, furthest: 0.2 });
    root.pointer('pointerdown', 20, 3_000);
    root.pointer('pointercancel', 20, 3_100);
    expect(panel.getState().testing).toBe(false);
    expect(root.focused.at(-1)).toBe('#gest-test-h');
    expect(textOf(root.innerHTML)).toContain('1 of 3 tries reached the end of the track');
    expect(panel.note()).toBe('Dragging: 1 of 3 tries made it. I need another way to do it, with a single tap or click.');
  });

  it('follows only the pointer that pressed the handle', () => {
    const root = testRoot();
    const panel = mountGesturesPanel({ root, lang: 'en', read: read() });
    root.click('gest-start');
    root.pointer('pointerdown', 0, 0, { pointerId: 7 });
    root.pointer('pointerup', 300, 10, { pointerId: 8 });
    expect(panel.getState().trial.current).not.toBeNull();
    root.pointer('pointerup', 300, 20, { pointerId: 7 });
    expect(panel.getState().trial.tries[0]?.reached).toBe(true);
  });

  it('ignores the pointer when no test runs', () => {
    const root = testRoot();
    const panel = mountGesturesPanel({ root, lang: 'en', read: read() });
    root.pointer('pointerdown', 0, 0);
    root.pointer('pointerup', 300, 10);
    expect(panel.getState()).toEqual(initialGesturesState());
  });

  it('reads the page, then copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const ok = testRoot();
    mountGesturesPanel({ root: ok, lang: 'en', read: read(), copy: async (t) => void copied.push(t) });
    ok.click('gest-copy');
    expect(copied).toEqual([]);
    ok.click('gest-read');
    expect(ok.focused.at(-1)).toBe('#gest-result-h');
    ok.click('gest-copy');
    await settle();
    expect(copied[0]).toContain('Item to drag “Stop 2”');
    expect(ok.innerHTML).toContain('>Copied.</div>');
    expect(ok.focused.at(-1)).toBe('[data-action="gest-copy"]');

    const bad = testRoot();
    mountGesturesPanel({ root: bad, lang: 'en', read: read(), state: st(), copy: () => Promise.reject(new Error('no')) });
    bad.click('gest-copy');
    await settle();
    expect(bad.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');

    const none = testRoot();
    mountGesturesPanel({ root: none, lang: 'fr', read: read(), state: st() });
    none.click('gest-copy');
    expect(none.innerHTML).toContain('La copie n’est pas disponible dans ce navigateur.');
  });

  it('keeps the result in another language, clears the notice, and stops a running test where it was', () => {
    const kept = mountGesturesPanel({ root: testRoot(), lang: 'fr', read: read(), state: { ...st(), notice: 'Copied.' } });
    expect(kept.getState()).toEqual(st());
    const stopped = mountGesturesPanel({ root: testRoot(), lang: 'fr', read: read(), state: st({ ...SOME, tries: SOME.tries.slice(0, 1), current: { start: 0, at: 0.5, pointerType: 'touch' } }, null, true) });
    expect(stopped.getState().testing).toBe(false);
    expect(stopped.getState().trial).toEqual({ tries: SOME.tries.slice(0, 1), current: null, gaveUp: false });
  });

  it('ignores clicks on things that are not its actions', () => {
    const root = testRoot();
    const panel = mountGesturesPanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.click('typing-start');
    root.click('gest-stop');
    expect(root.innerHTML).toBe(before);
    expect(panel.getState()).toEqual(initialGesturesState());
  });
});
