import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { DEFAULT_SCAN, FAR_STEPS, SCAN_LISTED } from './scan-cost.js';
import type { ScanControl, ScanFacts } from './scan-inpage.js';
import {
  SCAN_CSS,
  SCAN_EXCLUDE,
  initialScanState,
  isScanAction,
  mountScanPanel,
  renderScanPanel,
  scanModelOf,
  scanNoteOf,
  scanPanel,
  scanResultText,
  scanSettingsNoteOf,
  scanStep,
  type ScanPanelState,
  type ScanRoot,
} from './scan-panel.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const c = (name: string, left: number, top: number, main = false): ScanControl => ({ id: `button[${name}]`, name, main, left, top, width: 80, height: 44 });
const FORM: ScanFacts = { controls: [c('Home', 0, 0), c('Help', 100, 0), c('Name', 0, 100), c('Send', 0, 200, true)], truncated: false };
const LONG: ScanFacts = { controls: [...Array.from({ length: FAR_STEPS + 4 }, (_, i) => c(`Link ${i}`, (i % 10) * 40, 300 + Math.floor(i / 10) * 50)), c('Send', 0, 0, true)], truncated: true };
const read = (f: ScanFacts = FORM) => (): ScanFacts => f;
const st = (facts: ScanFacts | null = FORM, settings = DEFAULT_SCAN, chosen = false): ScanPanelState => ({ settings, chosen, facts, notice: '' });

function states(lang: 'en' | 'fr'): Array<[string, ScanPanelState]> {
  return [
    ['at first', initialScanState()],
    ['with a short page read', st()],
    ['with a long page read', st(LONG)],
    ['row by row on a long page', st(LONG, { ...DEFAULT_SCAN, mode: 'row-column' }, true)],
    ['step by step', st(FORM, { ...DEFAULT_SCAN, pace: 'step' }, true)],
    ['with no control', st({ controls: [], truncated: false })],
    ['with no main action', st({ controls: [c('A', 0, 0)], truncated: false })],
    [
      'after a failure',
      scanStep(initialScanState(), 'scan-read', null, lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderScanPanel', () => {
  it('starts with an h2, the settings with the defaults pressed, and the reading', () => {
    const html = renderScanPanel('en', initialScanState());
    expect(html).toContain('<h2 id="scan-h">Switch scanning</h2>');
    expect(html).toContain('<button type="button" data-action="scan-mode" data-value="linear" aria-pressed="true">One by one, in tab order</button>');
    expect(html).toContain('data-value="row-column" aria-pressed="false">Row by row, then along the row</button>');
    expect(html).toContain('data-action="scan-speed" data-value="1500" aria-pressed="true">1.5 s</button>');
    expect(html).toContain('<div class="scan-group" role="group" aria-labelledby="scan-mode-l">');
    expect(textOf(html)).toContain('Set: Scanning one by one, with auto scan, 1.5 s a step.');
    expect(html).toContain('data-action="scan-read">Count the steps on this page</button>');
    expect(html).not.toContain('scan-result-h');
  });

  it('hides the speeds with step scan', () => {
    const html = renderScanPanel('en', st(null, { ...DEFAULT_SCAN, pace: 'step' }));
    expect(html).not.toContain('data-action="scan-speed"');
    expect(html).toContain('data-value="step" aria-pressed="true">Step scan: one press a step</button>');
  });

  it('shows the summary, what may make it harder, the longest, the hints and copy', () => {
    const html = renderScanPanel('en', st(LONG));
    const text = textOf(html);
    expect(text).toContain('25 controls on 4 rows (the reading stopped before the end).');
    expect(text).toContain('The first control that looks like the main action: “Send” (number 25 by Tab): 25 steps, about 37.5 s, 1 press.');
    expect(html).toContain('<h4 id="scan-result-h" tabindex="-1">Steps on this page</h4>');
    expect(html).toContain('<h5 id="scan-harder-h">What may make it harder</h5>');
    expect(html.match(/<li>“/g)).toHaveLength(SCAN_LISTED + 0);
    expect(text).toContain('Put the main action early in the tab order');
    expect(html).toContain('data-action="scan-read">Count again</button>');
    expect(html).toContain('data-action="scan-copy">Copy the result</button>');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderScanPanel('en', st(LONG), 3);
    expect(html).toContain('<h3 id="scan-h">');
    expect(html).toContain('<h4 id="scan-set-h">');
    expect(html).toContain('<h4 id="scan-page-h" tabindex="-1">Scanning this page</h4>');
    expect(html).toContain('<h5 id="scan-result-h" tabindex="-1">');
    expect(html).toContain('<h6 id="scan-longest-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('escapes what a page wrote', () => {
    expect(renderScanPanel('en', st({ controls: [c('<b>x</b>', 0, 0, true), c('y', 0, 50)], truncated: false }))).not.toContain('<b>');
  });

  it('has only buttons of type button, and no form, field, link or picture', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderScanPanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="scan-[a-z]+"( data-value="[a-z0-9-]+" aria-pressed="(true|false)")?>[^<]+<\/button>$/);
        expect(html).not.toMatch(/<form|<a |href=|src=|<img|<input/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderScanPanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button 44 pixels, shows what is pressed without colour, shows focus and does not move', () => {
    expect(SCAN_CSS).toContain('.scancost button{min-height:44px;min-width:44px;');
    expect(SCAN_CSS).toContain('.scancost button[aria-pressed="true"]{font-weight:700;border-width:3px}');
    expect(SCAN_CSS).toContain('.scancost button:focus-visible');
    expect(SCAN_CSS).not.toMatch(/outline:(0|none)/);
    expect(SCAN_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(SCAN_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const rule of SCAN_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.scancost'), selector).toBe(true);
    }
    expect(SCAN_EXCLUDE).toBe('.scancost');
    expect(renderScanPanel('en', initialScanState())).toMatch(/^<div class="scancost">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderScanPanel(lang, state), lang);
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
      .map(([, s]) => `${textOf(renderScanPanel(lang, s))}\n${scanResultText(s, lang)}`)
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
    for (const en of ['Switch scanning', 'Count the steps', 'One by one', 'Copy the result', 'main action']) expect(fr).not.toContain(en);
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
    expect(scanPanel.title).toEqual({ en: 'Switch scanning', fr: 'Balayage par contacteur' });
    expect(scanPanel.mount).toBe(mountScanPanel);
  });
});

describe('scanResultText', () => {
  it('is plain text with the summary and every control', () => {
    const text = scanResultText(st(LONG), 'en');
    expect(text.startsWith('Switch scanning\nScanning one by one')).toBe(true);
    expect(text.match(/^- “/gm)).toHaveLength(LONG.controls.length);
    expect(text).toContain('What may help the team:\n- Put the main action early');
    expect(text).not.toMatch(/<|&amp;/);
  });

  it('has only the settings before the page is read', () => {
    expect(scanResultText(initialScanState(), 'fr')).toContain('Balayage un par un, en défilement automatique');
  });
});

describe('scanStep', () => {
  it('changes a setting, says it, keeps focus on the button and keeps what was read', () => {
    const step = scanStep(st(), 'scan-mode', 'row-column', 'en', read());
    expect(step.state.settings.mode).toBe('row-column');
    expect(step.state.chosen).toBe(true);
    expect(step.state.facts).toBe(FORM);
    expect(step.state.notice).toBe('Scanning row by row, with auto scan, 1.5 s a step.');
    expect(step.focus).toBe('[data-action="scan-mode"][data-value="row-column"]');
    expect(scanStep(st(), 'scan-pace', 'step', 'fr', read()).state.settings.pace).toBe('step');
    expect(scanStep(st(), 'scan-speed', '3000', 'en', read()).state.settings.intervalMs).toBe(3_000);
  });

  it('ignores a value it does not know', () => {
    for (const [a, v] of [
      ['scan-mode', 'zigzag'],
      ['scan-pace', null],
      ['scan-speed', '1234'],
      ['scan-speed', 'x'],
    ] as const) {
      expect(scanStep(st(), a, v, 'en', read()).focus, `${a} ${String(v)}`).toBe('');
    }
  });

  it('reads the page and puts focus on the result, or says why it could not', () => {
    const ok = scanStep(initialScanState(), 'scan-read', null, 'en', read());
    expect(ok.state.facts).toBe(FORM);
    expect(ok.focus).toBe('#scan-result-h');
    expect(scanModelOf(ok.state)?.main?.steps).toBe(4);
    expect(scanModelOf(initialScanState())).toBeNull();
    const bad = scanStep(st(), 'scan-read', null, 'fr', () => {
      throw new Error('boom');
    });
    expect(bad.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(bad.state.facts).toBe(FORM);
    expect(bad.focus).toBe('#scan-page-h');
  });

  it('knows its actions', () => {
    for (const a of ['scan-mode', 'scan-pace', 'scan-speed', 'scan-read']) expect(isScanAction(a)).toBe(true);
    for (const a of ['scan-copy', 'gest-read', '', null]) expect(isScanAction(a)).toBe(false);
  });
});

describe('scanNoteOf', () => {
  it('gives a line only once the person set how they scan and the page was read', () => {
    expect(scanNoteOf(st(), 'en')).toBe('');
    expect(scanNoteOf(st(null, DEFAULT_SCAN, true), 'en')).toBe('');
    expect(scanNoteOf(st(FORM, DEFAULT_SCAN, true), 'en')).toBe('Switch scanning: one by one, with auto scan, 1.5 s a step. The main action takes 4 steps.');
  });
});

interface ScanTestRoot extends ScanRoot {
  readonly focused: string[];
  readonly attributes: Record<string, string>;
  fire(action: string, value?: string): void;
}

function fakeRoot(): ScanTestRoot {
  const handlers: Array<(e: { target: unknown }) => void> = [];
  const root: ScanTestRoot = {
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

describe('mountScanPanel', () => {
  const click = (root: ScanTestRoot, action: string, value?: string): void => root.fire(action, value);

  it('renders at once, sets the language and moves no focus', () => {
    const root = fakeRoot();
    mountScanPanel({ root, lang: 'fr', read: read() });
    expect(root.innerHTML).toContain('Balayage par contacteur');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
  });

  it('reads, then counts again with a new setting without reading again', () => {
    let reads = 0;
    const root = fakeRoot();
    const panel = mountScanPanel({
      root,
      lang: 'en',
      read: () => {
        reads += 1;
        return FORM;
      },
    });
    click(root, 'scan-read');
    expect(root.focused.at(-1)).toBe('#scan-result-h');
    click(root, 'scan-mode', 'row-column');
    expect(reads).toBe(1);
    expect(root.focused.at(-1)).toBe('[data-action="scan-mode"][data-value="row-column"]');
    expect(textOf(root.innerHTML)).toContain('“Send” (number 4 by Tab): 4 steps, about 6 s, 2 presses.');
    expect(panel.note()).toBe('Switch scanning: row by row, with auto scan, 1.5 s a step. The main action takes 4 steps.');
  });

  it('copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const ok = fakeRoot();
    mountScanPanel({ root: ok, lang: 'en', read: read(), copy: async (t) => void copied.push(t) });
    click(ok, 'scan-copy');
    expect(copied).toEqual([]);
    click(ok, 'scan-read');
    click(ok, 'scan-copy');
    await settle();
    expect(copied[0]).toContain('- “Send” (number 4 by Tab)');
    expect(ok.innerHTML).toContain('>Copied.</div>');

    const bad = fakeRoot();
    mountScanPanel({ root: bad, lang: 'en', read: read(), state: st(), copy: () => Promise.reject(new Error('no')) });
    click(bad, 'scan-copy');
    await settle();
    expect(bad.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');

    const none = fakeRoot();
    mountScanPanel({ root: none, lang: 'fr', read: read(), state: st() });
    click(none, 'scan-copy');
    expect(none.innerHTML).toContain('La copie n’est pas disponible dans ce navigateur.');
  });

  it('keeps the settings and the result in another language, and clears the notice', () => {
    const kept = mountScanPanel({ root: fakeRoot(), lang: 'fr', read: read(), state: { ...st(FORM, { ...DEFAULT_SCAN, pace: 'step' }, true), notice: 'x' } });
    expect(kept.getState()).toEqual(st(FORM, { ...DEFAULT_SCAN, pace: 'step' }, true));
  });

  it('ignores clicks on things that are not its actions', () => {
    const root = fakeRoot();
    const panel = mountScanPanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    click(root, 'gest-read');
    click(root, 'scan-speed', '42');
    expect(root.innerHTML).toBe(before);
    expect(panel.getState()).toEqual(initialScanState());
  });
});

describe('scanSettingsNoteOf', () => {
  it('gives the settings for the access summary once the person set them, whether or not the page was read', () => {
    expect(scanSettingsNoteOf(initialScanState(), 'en')).toBe('');
    expect(scanSettingsNoteOf(st(null, DEFAULT_SCAN, true), 'en')).toBe('Switch scanning: one by one, with auto scan, 1.5 s a step.');
    expect(scanSettingsNoteOf(st(FORM, { ...DEFAULT_SCAN, mode: 'row-column' }, true), 'en')).toBe('Switch scanning: row by row, with auto scan, 1.5 s a step.');
  });
});
