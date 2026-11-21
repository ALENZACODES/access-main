import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';
import type { FieldRun, PageTyping } from './typing-trial.js';
import {
  TYPING_CSS,
  TYPING_EXCLUDE,
  fieldIndexOf,
  initialTypingState,
  isTypingAction,
  mountTypingPanel,
  renderTypingPanel,
  typingInput,
  typingPanel,
  typingResultText,
  typingNoteOf,
  typingStep,
  type TypingEvent,
  type TypingPanelState,
  type TypingRoot,
} from './typing-panel.js';

const LANGS = ['en', 'fr'] as const;
const PAGE: PageTyping = { fields: 30, limitMinutes: 1, limitText: 'Your session expires after 1 minute.' };
const read = (p: PageTyping = PAGE) => (): PageTyping => p;
const run = (first: number, last: number, value: string, takenBack = 0): FieldRun => ({ first, last, value, takenBack });
const RUNS: FieldRun[] = [run(0, 4_000, 'Alex Martin'), run(0, 3_000, 'K1A 0B1', 1), run(0, 6_000, 'alex@example.ca')];
const done = (page: PageTyping | null = PAGE, runs: readonly FieldRun[] = RUNS): TypingPanelState => ({ phase: 'done', runs, page, notice: '' });
const running = (): TypingPanelState => ({ ...initialTypingState(), phase: 'running' });

function states(lang: 'en' | 'fr'): Array<[string, TypingPanelState]> {
  return [
    ['at first', initialTypingState()],
    ['while practising', typingStep(initialTypingState(), 'typing-start', lang, read()).state],
    ['with a limit that may not be enough', done()],
    ['with no limit stated', done({ fields: 2, limitMinutes: null, limitText: '' })],
    ['with no text field on the page', done({ fields: 0, limitMinutes: null, limitText: '' })],
    ['with nothing typed', done(PAGE, initialTypingState().runs)],
    [
      'after a failure',
      typingStep(running(), 'typing-done', lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderTypingPanel', () => {
  it('starts with an h2, says there is no time limit and nothing leaves, and offers the practice', () => {
    const html = renderTypingPanel('en', initialTypingState());
    expect(html).toContain('<h2 id="typing-h">My typing pace</h2>');
    expect(textOf(html)).toContain('There is no time limit here. What you type stays in the panel; nothing is stored or sent.');
    expect(html).toContain('<button type="button" data-action="typing-start">Start the typing practice</button>');
    expect(html).not.toContain('<input');
  });

  it('draws three labelled fields while practising, each saying what to type', () => {
    const html = renderTypingPanel('en', running());
    expect(html.match(/<input /g)).toHaveLength(3);
    expect(html).toContain('<label for="typing-field-name">A name</label>');
    expect(html).toContain('<p id="typing-field-postal-what">Type: <strong>K1A 0B1</strong></p>');
    expect(html).toContain('aria-describedby="typing-field-email-what" data-typing="2"');
    expect(html).toContain('autocomplete="off"');
    expect(html).toContain('data-action="typing-done">I have finished</button>');
    expect(html).toContain('data-action="typing-stop">Stop the practice</button>');
  });

  it('shows the pace, the page against its limit, and what the times are', () => {
    const text = textOf(renderTypingPanel('en', done()));
    expect(text).toContain('3 of 3 practice fields filled in.');
    expect(text).toContain('The page states a limit of 1 min: “Your session expires after 1 minute”. That may not be enough.');
    expect(text).toContain('These times come from three short tries on this screen, today. They say nothing about you');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderTypingPanel('en', done(), 3);
    expect(html).toContain('<h3 id="typing-h">');
    expect(html).toContain('<h4 id="typing-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="typing-page-h">');
    expect(html).not.toMatch(/<h2/);
    expect(renderTypingPanel('en', running(), 3)).toContain('<h4 id="typing-run-h" tabindex="-1">');
  });

  it('keeps what was typed when drawn again, and escapes it', () => {
    const s: TypingPanelState = { ...running(), runs: [run(0, 1, '<b>"x"</b>'), run(0, 1, ''), run(0, 1, '')] };
    const html = renderTypingPanel('en', s);
    expect(html).toContain('value="&lt;b&gt;&quot;x&quot;&lt;/b&gt;"');
    expect(html).not.toContain('<b>');
  });

  it('has only buttons of type button, and no form, link or picture', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderTypingPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="typing-[a-z]+">[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderTypingPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button and field a 44 pixel minimum, shows focus, sets no colour and does not move', () => {
    expect(TYPING_CSS).toContain('.typing button{min-height:44px;min-width:44px;');
    expect(TYPING_CSS).toContain('.typing .typing-field{display:block;width:100%;max-width:20rem;min-height:44px;');
    expect(TYPING_CSS).toContain('.typing input:focus-visible');
    expect(TYPING_CSS).not.toMatch(/outline:(0|none)/);
    expect(TYPING_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(TYPING_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const rule of TYPING_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.typing'), selector).toBe(true);
    }
    expect(TYPING_EXCLUDE).toBe('.typing');
    expect(renderTypingPanel('en', initialTypingState())).toMatch(/^<div class="typing">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderTypingPanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderTypingPanel(lang, s)) + '\n' + (s.phase === 'done' ? typingResultText(s, lang) : ''))
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
    for (const en of ['Start the typing', 'I have finished', 'Your typing pace', 'Copy the result', 'practice fields']) expect(fr).not.toContain(en);
  });

  it('makes none of the claims the App does not make, and no claim about the person', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verif', 'vérif', 'real-time', 'temps réel', 'partnership', 'partenariat', 'guarantee', 'garanti', 'eligib', 'admissib', 'diagnos', 'compliant', 'conforme', 'slow', 'lent']) {
        expect(t, word).not.toContain(word);
      }
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(typingPanel.title).toEqual({ en: 'My typing pace', fr: 'Mon rythme de saisie' });
    expect(typingPanel.mount).toBe(mountTypingPanel);
  });
});

describe('typingResultText', () => {
  it('is plain text with the pace, the page and what the times are', () => {
    const text = typingResultText(done(), 'en');
    expect(text.startsWith('My typing pace\n3 of 3 practice fields filled in.')).toBe(true);
    expect(text).toContain('That may not be enough.');
    expect(text.endsWith('the time for the page is an estimate.\n')).toBe(true);
    expect(text).not.toMatch(/<|&amp;/);
  });

  it('leaves the page out when it could not be read', () => {
    expect(typingResultText(done(null), 'fr')).not.toContain('Cette page');
  });
});

describe('typingNoteOf', () => {
  it('gives the pace once the practice is over, and nothing before', () => {
    expect(typingNoteOf(done(), 'en')).toMatch(/^My typing pace: about \d+ characters a minute, 4 s a short field\.$/);
    expect(typingNoteOf(running(), 'en')).toBe('');
    expect(typingNoteOf(initialTypingState(), 'fr')).toBe('');
    expect(typingNoteOf(done(PAGE, initialTypingState().runs), 'en')).toBe('');
  });
});

describe('fieldIndexOf and typingInput', () => {
  const target = (i: string | null, value = 'Al') => ({ value, getAttribute: (n: string) => (n === 'data-typing' ? i : null) });

  it('knows the practice fields and nothing else', () => {
    expect(fieldIndexOf(target('0'))).toBe(0);
    expect(fieldIndexOf(target('2'))).toBe(2);
    for (const v of ['3', '-1', '1.5', 'x', null]) expect(fieldIndexOf(target(v)), String(v)).toBeNull();
    expect(fieldIndexOf(null)).toBeNull();
    expect(fieldIndexOf({})).toBeNull();
  });

  it('records a change in the field it came from, with the event time', () => {
    const e: TypingEvent = { type: 'input', target: target('1', 'K'), timeStamp: 1_500, inputType: 'insertText' };
    const s = typingInput(running(), e, () => 9);
    expect(s.runs[1]).toEqual({ first: 1_500, last: 1_500, takenBack: 0, value: 'K' });
    expect(s.runs[0]).toEqual(running().runs[0]);
  });

  it('uses the clock when the event has no time, and counts a deletion', () => {
    const s = typingInput(running(), { type: 'input', target: target('0', ''), inputType: 'deleteContentBackward' }, () => 42);
    expect(s.runs[0]).toEqual({ first: 42, last: 42, takenBack: 1, value: '' });
  });

  it('ignores input outside the practice, other events, and input after the practice', () => {
    const s = running();
    expect(typingInput(s, { type: 'input', target: target(null) }, () => 1)).toBe(s);
    expect(typingInput(s, { type: 'click', target: target('0') }, () => 1)).toBe(s);
    const d = done();
    expect(typingInput(d, { type: 'input', target: target('0') }, () => 1)).toBe(d);
  });
});

describe('typingStep', () => {
  it('starts a fresh practice and puts focus on the first field', () => {
    for (const action of ['typing-start', 'typing-again'] as const) {
      const step = typingStep(done(), action, 'en', read());
      expect(step.state.phase).toBe('running');
      expect(step.state.page).toBeNull();
      expect(step.state.runs.every((r) => r.first === null)).toBe(true);
      expect(step.state.notice).toBe('The practice has started. Focus is on the first field.');
      expect(step.focus).toBe('#typing-field-name');
    }
  });

  it('reads the page when the practice ends, either way, and puts focus on the result', () => {
    for (const action of ['typing-done', 'typing-stop'] as const) {
      const step = typingStep({ ...running(), runs: RUNS }, action, 'fr', read());
      expect(step.state).toEqual({ phase: 'done', runs: RUNS, page: PAGE, notice: 'L’essai est terminé. Le résultat suit.' });
      expect(step.focus).toBe('#typing-result-h');
    }
  });

  it('says why the page could not be read and still shows the pace', () => {
    const step = typingStep({ ...running(), runs: RUNS }, 'typing-done', 'fr', () => {
      throw new Error('boom');
    });
    expect(step.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(step.state.page).toBeNull();
    expect(textOf(renderTypingPanel('fr', step.state))).toContain('3 champs d’essai remplis sur 3.');
  });

  it('does nothing when ending a practice that is not running', () => {
    expect(typingStep(initialTypingState(), 'typing-done', 'en', read()).focus).toBe('');
    expect(typingStep(done(), 'typing-stop', 'en', read()).focus).toBe('');
  });

  it('knows its actions', () => {
    for (const a of ['typing-start', 'typing-again', 'typing-done', 'typing-stop']) expect(isTypingAction(a)).toBe(true);
    for (const a of ['typing-copy', 'slip-read', '', null]) expect(isTypingAction(a)).toBe(false);
  });
});

interface TypingTestRoot extends TypingRoot {
  readonly focused: string[];
  readonly attributes: Record<string, string>;
  click(action: string): void;
  type(field: number, value: string, at: number, inputType?: string): void;
}

function typingRoot(): TypingTestRoot {
  const handlers: Record<string, Array<(e: TypingEvent) => void>> = {};
  const root: TypingTestRoot = {
    innerHTML: '',
    focused: [],
    attributes: {},
    setAttribute(name, value) {
      root.attributes[name] = value;
    },
    addEventListener(type, handler) {
      (handlers[type] ??= []).push(handler);
    },
    querySelector(selector) {
      return { focus: () => root.focused.push(selector) };
    },
    click(action) {
      for (const h of handlers.click ?? []) h({ type: 'click', target: { getAttribute: (n: string) => (n === 'data-action' ? action : null) } });
    },
    type(field, value, at, inputType = 'insertText') {
      const target = { value, getAttribute: (n: string) => (n === 'data-typing' ? String(field) : null) };
      for (const h of handlers.input ?? []) h({ type: 'input', target, timeStamp: at, inputType });
    },
  };
  return root;
}

describe('mountTypingPanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = typingRoot();
    mountTypingPanel({ root, lang: 'fr', read: read() });
    expect(root.innerHTML).toContain('Mon rythme de saisie');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('runs a whole practice without drawing the fields again while typing', () => {
    const root = typingRoot();
    const panel = mountTypingPanel({ root, lang: 'en', read: read() });
    root.click('typing-start');
    expect(root.focused).toEqual(['#typing-field-name']);
    const drawn = root.innerHTML;
    root.type(0, 'A', 1_000);
    root.type(0, 'Alex Martin', 5_000);
    root.type(1, 'K1A 0B', 6_000);
    root.type(1, 'K1A 0', 7_000, 'deleteContentBackward');
    root.type(1, 'K1A 0B1', 9_000);
    expect(root.innerHTML).toBe(drawn);
    expect(panel.note()).toBe('');
    root.click('typing-done');
    expect(root.focused.at(-1)).toBe('#typing-result-h');
    expect(panel.getState().runs[1]).toEqual({ first: 6_000, last: 9_000, takenBack: 1, value: 'K1A 0B1' });
    expect(textOf(root.innerHTML)).toContain('2 of 3 practice fields filled in.');
    expect(panel.note()).toMatch(/^My typing pace: about \d+ characters a minute, 3\.5 s a short field\.$/);
  });

  it('copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const ok = typingRoot();
    mountTypingPanel({ root: ok, lang: 'en', read: read(), state: done(), copy: async (t) => void copied.push(t) });
    ok.click('typing-copy');
    await settle();
    expect(copied[0]).toBe(typingResultText(done(), 'en'));
    expect(ok.innerHTML).toContain('>Copied.</div>');
    expect(ok.focused.at(-1)).toBe('[data-action="typing-copy"]');

    const bad = typingRoot();
    mountTypingPanel({ root: bad, lang: 'en', read: read(), state: done(), copy: () => Promise.reject(new Error('no')) });
    bad.click('typing-copy');
    await settle();
    expect(bad.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('says copying is not available when the browser has no clipboard', () => {
    const root = typingRoot();
    mountTypingPanel({ root, lang: 'fr', read: read(), state: done() });
    root.click('typing-copy');
    expect(root.innerHTML).toContain('La copie n’est pas disponible dans ce navigateur.');
  });

  it('does not copy before the practice is over', () => {
    const copied: string[] = [];
    const root = typingRoot();
    mountTypingPanel({ root, lang: 'en', read: read(), copy: async (t) => void copied.push(t) });
    root.click('typing-copy');
    expect(copied).toEqual([]);
  });

  it('keeps a result in another language and clears the notice, but starts a running practice over', () => {
    const kept = mountTypingPanel({ root: typingRoot(), lang: 'fr', read: read(), state: { ...done(), notice: 'Copied.' } });
    expect(kept.getState()).toEqual(done());
    const fresh = mountTypingPanel({ root: typingRoot(), lang: 'fr', read: read(), state: { ...running(), runs: RUNS } });
    expect(fresh.getState()).toEqual(initialTypingState());
  });

  it('ignores clicks on things that are not its actions', () => {
    const root = typingRoot();
    const panel = mountTypingPanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.click('slip-read');
    root.click('typing-done');
    expect(root.innerHTML).toBe(before);
    expect(panel.getState()).toEqual(initialTypingState());
  });
});
