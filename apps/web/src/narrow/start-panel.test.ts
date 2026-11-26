import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { pageAround, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { START_FIRST, START_PANELS, TOOLS, type StartPanelKey } from './start.js';
import { START_CSS, goLabel, initialStartState, mountStartPanel, renderStartPanel, startNoteOf, startPanel, startToggle, type StartPanelState, type StartRoot } from './start-panel.js';

const LANGS = ['en', 'fr'] as const;
const st = (tools: StartPanelState['tools']): StartPanelState => ({ tools, notice: '' });

function states(): Array<[string, StartPanelState]> {
  return [
    ['at first', initialStartState()],
    ['with one tool', st(['switch'])],
    ['with several tools', st(['finger', 'voice', 'mouth-stick'])],
    ['with every tool', st([...TOOLS])],
  ];
}

describe('renderStartPanel', () => {
  it('starts with an h2, every tool unpressed, and a line saying what to do', () => {
    const html = renderStartPanel('en', initialStartState());
    expect(html).toContain('<h2 id="start-h">Where to start</h2>');
    expect(html).toContain('<div class="start-group" role="group" aria-labelledby="start-tools-l">');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(TOOLS.length);
    expect(html).toContain('<button type="button" data-action="start-tool" data-value="mouth-stick" aria-pressed="false">A mouth stick</button>');
    expect(textOf(html)).toContain('Mark what you use to see which tests to try first.');
    expect(textOf(html)).toContain('Only tools are asked for, never a reason.');
    expect(html).not.toContain('start-first-h');
  });

  it('lists the tests to try first for the tools marked, with why, and the others after', () => {
    const html = renderStartPanel('en', st(['switch']));
    expect(html).toContain('data-value="switch" aria-pressed="true">One or two switches</button>');
    expect(html).toContain('<h3 id="start-first-h" tabindex="-1">Tests to try first</h3>');
    const first = html.slice(html.indexOf('<ol'), html.indexOf('</ol>'));
    expect(first.match(/<li>/g)).toHaveLength(START_FIRST);
    expect(first.indexOf('Switch scanning')).toBeLessThan(first.indexOf('Reaching controls'));
    expect(first).toContain('Useful with one or two switches.');
    expect(first).toContain('<button type="button" data-action="start-go" data-value="scan">Go to switch scanning</button>');
    const others = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'));
    expect(others.match(/<li>/g)).toHaveLength(START_PANELS.length - START_FIRST);
    expect(others).not.toContain('Useful with');
  });

  it('leaves out the go buttons when there is no way to go', () => {
    expect(renderStartPanel('en', st(['voice']), 2, false)).not.toContain('start-go');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderStartPanel('en', st(['voice']), 3);
    expect(html).toContain('<h3 id="start-h">');
    expect(html).toContain('<h4 id="start-first-h" tabindex="-1">');
    expect(html).toContain('<h5 id="start-others-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('gives every go button its own name', () => {
    for (const lang of LANGS) {
      const names = START_PANELS.map((k) => goLabel(k, lang));
      expect(new Set(names).size, lang).toBe(names.length);
    }
    expect(goLabel('twice', 'fr')).toBe('Aller à demandé deux fois');
    expect(goLabel('tap', 'fr')).toBe('Aller au test des appuis');
    expect(goLabel('slip', 'fr')).toBe('Aller aux glissements à risque');
    expect(goLabel('typing', 'fr')).toBe('Aller à l’essai de saisie');
    for (const lang of LANGS) for (const k of START_PANELS) expect(goLabel(k, lang).toLowerCase(), k).not.toMatch(/button|bouton/);
  });

  it('has only buttons of type button, and no form, field, link or picture', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states()) {
        const html = renderStartPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="start-(tool|go)" data-value="[a-z-]+"( aria-pressed="(true|false)")?>[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states()) {
        const ids = [...renderStartPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button 44 pixels, shows what is pressed without colour, shows focus and does not move', () => {
    expect(START_CSS).toContain('.start button{min-height:44px;min-width:44px;');
    expect(START_CSS).toContain('.start button[aria-pressed="true"]{font-weight:700;border-width:3px}');
    expect(START_CSS).toContain('.start button:focus-visible');
    expect(START_CSS).not.toMatch(/outline:(0|none)/);
    expect(START_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:|:hover/i);
    expect(START_CSS).not.toMatch(/animation|transition/);
    for (const r of START_CSS.split('}').filter((x) => x !== '')) {
      for (const selector of (r.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.start'), selector).toBe(true);
    }
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states()) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderStartPanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderStartPanel(lang, startToggle(s, 'voice', lang))))
      .join('\n');

  it('follows French typography in every state', () => {
    for (const line of allText('fr').split('\n')) {
      if (line.trim() === '') continue;
      expect(frTypographyIssues(line), line).toEqual([]);
    }
    expect(allText('fr')).not.toMatch(/\p{L}'\p{L}/u);
  });

  it('makes no claim and says nothing about health', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verif', 'vérif', 'guarantee', 'garanti', 'diagnos', 'disab', 'handicap', 'injur', 'blessure', 'health', 'santé']) expect(t, word).not.toContain(word);
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(startPanel.title).toEqual({ en: 'Where to start', fr: 'Par où commencer' });
    expect(startPanel.mount).toBe(mountStartPanel);
  });
});

describe('startToggle and startNoteOf', () => {
  it('marks and unmarks a tool, keeps the tools in a set order, and says what is marked', () => {
    let s = startToggle(initialStartState(), 'voice', 'en');
    expect(s).toEqual({ tools: ['voice'], notice: 'Marked: my voice.' });
    s = startToggle(s, 'finger', 'en');
    expect(s.tools).toEqual(['finger', 'voice']);
    s = startToggle(s, 'voice', 'fr');
    expect(s).toEqual({ tools: ['finger'], notice: 'Indiqué\u00A0: un doigt sur un écran tactile.' });
    expect(startToggle(s, 'finger', 'en')).toEqual({ tools: [], notice: 'Nothing is marked.' });
  });

  it('gives the line for the summary once something is marked', () => {
    expect(startNoteOf(initialStartState(), 'en')).toBe('');
    expect(startNoteOf(st(['keyboard', 'voice']), 'en')).toBe('What I use: my voice and a keyboard only.');
  });
});

interface TestRoot extends StartRoot {
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

describe('mountStartPanel', () => {
  it('renders at once, sets the language and moves no focus', () => {
    const root = testRoot();
    mountStartPanel({ root, lang: 'fr', go: () => undefined });
    expect(root.innerHTML).toContain('Par où commencer');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('marks a tool, keeps focus on its button, and sends a go button to its test', () => {
    const went: StartPanelKey[] = [];
    const root = testRoot();
    const panel = mountStartPanel({ root, lang: 'en', go: (k) => void went.push(k) });
    root.fire('start-tool', 'head-pointer');
    expect(root.focused).toEqual(['[data-action="start-tool"][data-value="head-pointer"]']);
    expect(root.innerHTML).toContain('>Marked: a head pointer.</div>');
    expect(panel.note()).toBe('What I use: a head pointer.');
    root.fire('start-go', 'moving');
    expect(went).toEqual(['moving']);
  });

  it('ignores a tool or a test it does not know, and other actions', () => {
    const went: StartPanelKey[] = [];
    const root = testRoot();
    const panel = mountStartPanel({ root, lang: 'en', go: (k) => void went.push(k) });
    const before = root.innerHTML;
    root.fire('start-tool', 'hand');
    root.fire('start-go', 'toString');
    root.fire('start-go', 'summary');
    root.fire('scan-read');
    expect(root.innerHTML).toBe(before);
    expect(went).toEqual([]);
    expect(panel.getState()).toEqual(initialStartState());
  });

  it('keeps what is marked in another language, and clears the notice', () => {
    expect(mountStartPanel({ root: testRoot(), lang: 'fr', state: { tools: ['voice'], notice: 'x' } }).getState()).toEqual({ tools: ['voice'], notice: '' });
  });

  it('draws no go button without a way to go', () => {
    const root = testRoot();
    mountStartPanel({ root, lang: 'en', state: st(['voice']) });
    expect(root.innerHTML).not.toContain('start-go');
  });
});
