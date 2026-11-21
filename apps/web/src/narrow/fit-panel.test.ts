import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, MAX_WHAT, type BarrierDraft } from './barrier-report.js';
import { auditCopy } from './copylint.js';
import { readDeviceFacts } from './device-facts.js';
import { FIT_CSS, fitPanel, initialFitState, mountFitPanel, renderFitPanel, type FitState } from './fit-panel.js';
import { DESKTOP, PHONE, SILENT, fakeRoot, pageAround, settle, textOf, type FakeRoot } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { summarisePlainly } from './plain-summary.js';
import { nov, reportOf, smallSite } from './report-fixtures.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const NOW = nov(19);

const filled: BarrierDraft = { kind: 'too-small', what: 'The close button is too small to press.', includeSettings: true, includeFindings: false };

/** Every part of the panel drawn at once: findings, both field errors, a finished text and a notice. */
function fullState(): FitState {
  return {
    ...initialFitState(readDeviceFacts(PHONE)),
    audit: { kind: 'done', summary: summarisePlainly(smallSite()) },
    draft: { ...filled, what: 'Write to ana@example.org about <b>the button</b> & "more".' },
    errors: [
      { field: 'kind', message: 'Choose the kind of barrier.' },
      { field: 'what', message: 'Say what happened, in at least 10 characters.' },
    ],
    text: 'Barrier met in the App\nPage: /places/12\n',
    notice: 'The text is ready below.',
  };
}

const states = (): Array<[string, FitState]> => [
  ['at first', initialFitState(readDeviceFacts(PHONE))],
  ['with nothing known', initialFitState(readDeviceFacts(SILENT))],
  ['while running', { ...initialFitState(readDeviceFacts(DESKTOP)), audit: { kind: 'running' } }],
  ['after an error', { ...initialFitState(readDeviceFacts(DESKTOP)), audit: { kind: 'error', message: 'The page went away.' } }],
  ['with no finding', { ...initialFitState(readDeviceFacts(DESKTOP)), audit: { kind: 'done', summary: summarisePlainly(reportOf([])) } }],
  ['with everything', fullState()],
];

describe('renderFitPanel', () => {
  it('starts with an h2 and puts its three parts under h3', () => {
    const html = renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW);
    expect(html.match(/<h1[ >]/g)).toBeNull();
    expect(html.match(/<h2[ >]/g)).toHaveLength(1);
    expect(html.match(/<h3[ >]/g)).toHaveLength(3);
    expect(html).toContain('<h2 id="fit-h">This page on your screen</h2>');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW, 3);
    expect(html.match(/<h2[ >]/g)).toBeNull();
    expect(html.match(/<h3[ >]/g)).toHaveLength(1);
    expect(html.match(/<h4[ >]/g)).toHaveLength(3);
  });

  it('names each section by its heading', () => {
    const html = renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW);
    for (const id of ['fit-facts-h', 'fit-checks-h', 'fit-barrier-h']) {
      expect(html).toContain(`<section aria-labelledby="${id}">`);
      expect(html.match(new RegExp(`id="${id}"`, 'g'))).toHaveLength(1);
    }
  });

  it('shows the facts in a table with a caption and row headers', () => {
    const html = renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW);
    expect(html).toContain('<caption>As the browser reports them. UNKNOWN means the browser gave no answer.</caption>');
    expect(html.match(/<th scope="row">/g)).toHaveLength(10);
    expect(html.match(/<th scope="col">/g)).toHaveLength(2);
    expect(html).toContain('<th scope="row">Width of the page area</th><td>320 CSS pixels</td>');
    expect(html).toContain('<th scope="row">More contrast</th><td>UNKNOWN</td>');
  });

  it('shows UNKNOWN ten times when the browser reports nothing, in both languages', () => {
    for (const lang of LANGS) {
      const html = renderFitPanel(lang, initialFitState(readDeviceFacts(SILENT)), NOW);
      expect(html.match(/<td>UNKNOWN<\/td>/g)).toHaveLength(10);
    }
  });

  it('has a polite live region that holds the notice', () => {
    const html = renderFitPanel('en', { ...initialFitState(readDeviceFacts(PHONE)), notice: 'Settings read again.' }, NOW);
    expect(html).toContain('<div role="status" aria-live="polite">Settings read again.</div>');
  });

  it('says the checks have not run, are running, or could not run', () => {
    const base = initialFitState(readDeviceFacts(PHONE));
    expect(renderFitPanel('en', base, NOW)).toContain('The checks have not run yet.');
    const running = renderFitPanel('en', { ...base, audit: { kind: 'running' } }, NOW);
    expect(running).toContain('Running the checks…');
    expect(running).toContain('data-action="fit-run" aria-disabled="true"');
    expect(renderFitPanel('en', { ...base, audit: { kind: 'error', message: 'It <broke>.' } }, NOW)).toContain('The checks could not run: It &lt;broke&gt;.');
    expect(renderFitPanel('fr', { ...base, audit: { kind: 'error', message: 'x' } }, NOW)).toContain(`Les contrôles n’ont pas pu s’exécuter${NBSP}: x`);
  });

  it('lists the findings by theme with their examples, and always the limit of the checks', () => {
    const html = renderFitPanel('en', fullState(), NOW);
    expect(html).toContain('On this page, at this size: 2 things to fix and 3 things UNKNOWN');
    expect(html).toContain('<li>Seeing and hearing the content: 2 to fix, 2 UNKNOWN<ul>');
    expect(html.match(/<strong>FAIL<\/strong>/g)).toHaveLength(2);
    expect(html.match(/<strong>UNKNOWN<\/strong>/g)).toHaveLength(2);
    expect(html).toContain('The checks look at part of what makes a page usable.');
  });

  it('words a result with no finding as nothing found, with the limit, and no list', () => {
    const state: FitState = { ...initialFitState(readDeviceFacts(PHONE)), audit: { kind: 'done', summary: summarisePlainly(reportOf([])) } };
    for (const lang of LANGS) {
      const html = renderFitPanel(lang, state, NOW);
      const checks = html.slice(html.indexOf('fit-checks-h'), html.indexOf('fit-barrier-h'));
      expect(checks).not.toContain('<ul>');
      expect(textOf(checks)).not.toMatch(/\b(works|pass(es|ed)?|conforms?|compliant)\b|conforme|a réussi/i);
    }
    expect(renderFitPanel('en', state, NOW)).toContain('found nothing on this page at this size');
    expect(renderFitPanel('en', state, NOW)).toContain('does not mean the page suits everyone');
  });

  it('keeps the token UNKNOWN and words a failure as something to correct in French', () => {
    const html = renderFitPanel('fr', fullState(), NOW);
    expect(html.match(/<strong>À CORRIGER<\/strong>/g)).toHaveLength(2);
    expect(html.match(/<strong>UNKNOWN<\/strong>/g)).toHaveLength(2);
  });

  it('gives each field a visible label tied to it', () => {
    const html = renderFitPanel('en', fullState(), NOW);
    for (const id of ['fit-what', 'fit-settings', 'fit-findings', 'fit-text', 'fit-kind-cut-off', 'fit-kind-other']) {
      expect(html.match(new RegExp(` id="${id}"`, 'g')), id).toHaveLength(1);
      expect(html.match(new RegExp(`<label[^>]* for="${id}"`, 'g')), id).toHaveLength(1);
    }
  });

  it('offers every kind of barrier as a radio button in a named group, with none chosen at first', () => {
    const html = renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW);
    expect(html.match(/<input type="radio" /g)).toHaveLength(7);
    expect(html.match(/ name="fit-kind" /g)).toHaveLength(7);
    expect(html).toContain('<fieldset id="fit-kind" role="radiogroup" aria-labelledby="fit-kind-legend" aria-required="true">');
    expect(html).toContain('<legend id="fit-kind-legend">Kind of barrier</legend>');
    expect(html).not.toMatch(/type="radio"[^>]* checked/);
    expect(html).not.toContain('<select');
    const chosen = renderFitPanel('en', { ...initialFitState(readDeviceFacts(PHONE)), draft: filled }, NOW);
    expect(chosen).toContain('<input type="radio" id="fit-kind-too-small" name="fit-kind" value="too-small" checked>');
    expect(chosen.match(/type="radio"[^>]* checked/g)).toHaveLength(1);
  });

  it('marks the two required fields, and ties the hint to the description', () => {
    const html = renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW);
    expect(html.match(/aria-required="true"/g)).toHaveLength(2);
    expect(html).toContain('aria-describedby="fit-what-hint"');
    expect(html).toContain(`At most ${MAX_WHAT} characters.`);
    expect(html).not.toContain(' aria-invalid=');
  });

  it('puts each error in text by its field and points the field at it', () => {
    const html = renderFitPanel('en', fullState(), NOW);
    expect(html).toContain('aria-invalid="true" aria-describedby="fit-kind-error"');
    expect(html).toContain('<p class="fit-error" id="fit-kind-error">Choose the kind of barrier.</p><label class="fit-check" for="fit-kind-cut-off">');
    expect(html).toContain('aria-describedby="fit-what-hint fit-what-error" aria-invalid="true"');
    expect(html).toContain('<p class="fit-error" id="fit-what-error">Say what happened, in at least 10 characters.</p>');
  });

  it('keeps the answers in the form and escapes what the person wrote', () => {
    const html = renderFitPanel('en', fullState(), NOW);
    expect(html).toContain('Write to ana@example.org about &lt;b&gt;the button&lt;/b&gt; &amp; &quot;more&quot;.</textarea>');
    expect(html).not.toContain('<b>the button</b>');
    expect(html).toContain('id="fit-settings" name="fit-settings" checked>');
    expect(html).toContain('id="fit-findings" name="fit-findings">');
  });

  it('shows the text, a copy button and a save link only once the text is made', () => {
    const before = renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW);
    expect(before).not.toContain('fit-text');
    expect(before).not.toContain('fit-copy');
    const after = renderFitPanel('en', fullState(), NOW);
    expect(after).toContain('<textarea id="fit-text" name="fit-text" rows="12" readonly>Barrier met in the App\nPage: /places/12\n</textarea>');
    expect(after).toContain('data-action="fit-copy"');
    expect(after).toContain('download="barrier-2026-11-19.txt"');
    expect(after).toContain('href="data:text/plain;charset=utf-8,Barrier%20met');
    expect(renderFitPanel('fr', fullState(), NOW)).toContain('download="obstacle-2026-11-19.txt"');
  });

  it('warns about a personal detail next to the finished text, without repeating it', () => {
    const html = renderFitPanel('en', fullState(), NOW);
    expect(html).toContain('<p class="fit-error">Your description seems to hold an email address.');
    const noText = renderFitPanel('en', { ...fullState(), text: null }, NOW);
    expect(noText).not.toContain('seems to hold');
  });

  it('labels the control that erases by what it erases', () => {
    expect(renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW)).toContain('<button type="button" data-action="fit-clear">Erase my answers and the text</button>');
    expect(renderFitPanel('fr', initialFitState(readDeviceFacts(PHONE)), NOW)).toContain('data-action="fit-clear">Effacer mes réponses et le texte</button>');
  });

  it('has only buttons of type button, each with text', () => {
    const html = renderFitPanel('en', fullState(), NOW);
    const buttons = html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons).toHaveLength(5);
    for (const b of buttons) {
      expect(b).toContain('type="button"');
      expect(b.replace(/<[^>]+>/g, '').trim()).not.toBe('');
    }
  });

  it('has no form that submits, no script, and no address on another host', () => {
    for (const [, state] of states()) {
      const html = renderFitPanel('en', state, NOW);
      expect(html).not.toMatch(/<form|<script|\saction=|https?:\/\/|mailto:|<img|<iframe/i);
    }
  });

  it('has no duplicate id in any state', () => {
    for (const [name, state] of states()) {
      const ids = [...renderFitPanel('en', state, NOW).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });
});

describe('the styles of the panel', () => {
  it('gives buttons, the select and the save link a 44 pixel minimum both ways', () => {
    expect(FIT_CSS).toContain('.fit button,.fit .fit-save{min-height:44px;min-width:44px;');
    expect(FIT_CSS).toContain('.fit .fit-check input{width:44px;height:44px;');
    expect(FIT_CSS).toContain('.fit .fit-check{display:flex;align-items:center;gap:8px;min-height:44px;');
  });

  it('lets the table and the controls wrap on a narrow screen', () => {
    expect(FIT_CSS).toContain('table-layout:fixed');
    expect(FIT_CSS).toContain('overflow-wrap:anywhere');
    expect(FIT_CSS).toContain('flex-wrap:wrap');
    expect(FIT_CSS).not.toMatch(/white-space:nowrap|overflow:hidden|position:(fixed|absolute)/);
  });

  it('shows focus and never removes an outline', () => {
    expect(FIT_CSS).toContain(':focus-visible');
    expect(FIT_CSS).not.toMatch(/outline:(0|none)/);
  });

  it('sets no colour of its own, so the page theme and forced colours apply', () => {
    expect(FIT_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(FIT_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel', () => {
    for (const rule of FIT_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.fit'), selector).toBe(true);
    }
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states()) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderFitPanel(lang, state, NOW), lang);
        const results = { ...markupResults(html), 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) };
        const all = Object.values(results).flatMap((r) => (r ? r.entries : []));
        expect(all.map((e) => `${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`)).toEqual([]);
        expect(Object.values(results).reduce((n, r) => n + (r ? r.checked : 0), 0)).toBeGreaterThan(20);
      });
    }
  }
});

describe('the wording of the panel', () => {
  const allText = (lang: 'en' | 'fr'): string =>
    states()
      .map(([, s]) => textOf(renderFitPanel(lang, lang === 'fr' ? { ...s, draft: EMPTY_DRAFT, errors: [], text: s.text === null ? null : 'Texte.', notice: '' } : s, NOW)))
      .join('\n');

  it('follows French typography in every state', () => {
    for (const line of allText('fr').split('\n')) {
      if (line.trim() === '' || /^(English|Texte français)/.test(line.trim())) continue;
      expect(frTypographyIssues(line), line).toEqual([]);
    }
  });

  it('has no straight apostrophe in French', () => {
    expect(allText('fr')).not.toMatch(/\p{L}'\p{L}/u);
  });

  it('makes none of the claims the App does not make', () => {
    expect(allText('en')).not.toMatch(/verif|real.?time|partner|guarantee|certif|complian/i);
    expect(allText('fr')).not.toMatch(/vérif|temps réel|partenari|garanti|certifi/i);
  });

  it('gives no medical or eligibility advice and asks nothing about the person', () => {
    expect(allText('en')).not.toMatch(/diagnos|medical|eligib|disabilit/i);
    expect(allText('fr')).not.toMatch(/diagnos|médical|admissib|handicap/i);
    const form = renderFitPanel('en', fullState(), NOW);
    expect(form).not.toMatch(/type="(email|tel|text)"|autocomplete="(name|email|tel)/);
    expect(form.match(/<(input|select|textarea)\b/g)).toHaveLength(11);
  });

  it('says that nothing is sent, and that the person chooses where the text goes', () => {
    expect(allText('en')).toContain('Nothing here is sent anywhere.');
    expect(allText('en')).toContain('you choose where to send it');
    expect(allText('fr')).toContain('Rien ici n’est envoyé nulle part.');
  });

  it('is fully translated: no English sentence of the panel is left in the French', () => {
    const fr = allText('fr');
    for (const phrase of ['This page', 'Your screen', 'Run the checks', 'Tell us', 'Kind of barrier', 'What happened', 'Prepare the text', 'Copy the text', 'Save the text', 'Erase', 'Setting', 'Value']) {
      expect(fr, phrase).not.toContain(phrase);
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(fitPanel.title).toEqual({ en: 'This page on your screen', fr: 'Cette page sur votre écran' });
    expect(fitPanel.mount).toBe(mountFitPanel);
  });
});

describe('mountFitPanel', () => {
  interface Mounted {
    readonly root: FakeRoot;
    readonly panel: ReturnType<typeof mountFitPanel>;
    readonly copied: string[];
    runs: number;
  }
  const mount = (over: Partial<Parameters<typeof mountFitPanel>[0]> = {}): Mounted => {
    const root = fakeRoot();
    const m: Mounted = { root, copied: [], runs: 0, panel: undefined as never };
    const panel = mountFitPanel({
      root,
      lang: 'en',
      env: () => PHONE,
      now: () => NOW,
      location: () => '/places/12?q=ramp',
      run: () => {
        m.runs += 1;
        return smallSite();
      },
      copy: async (text) => {
        m.copied.push(text);
      },
      ...over,
    });
    return Object.assign(m, { panel });
  };
  const fill = (root: FakeRoot, d: BarrierDraft): void => {
    root.fields['input[name="fit-kind"]:checked'] = { value: d.kind };
    root.fields['#fit-what'] = { value: d.what };
    root.fields['#fit-settings'] = { checked: d.includeSettings };
    root.fields['#fit-findings'] = { checked: d.includeFindings };
  };

  it('renders at once, sets the language on its root and moves no focus', () => {
    const { root, panel } = mount();
    expect(root.innerHTML).toContain('This page on your screen');
    expect(root.attributes['lang']).toBe('en');
    expect(root.focused).toEqual([]);
    expect(panel.getState().audit.kind).toBe('idle');
    expect(mount({ lang: 'fr' }).root.attributes['lang']).toBe('fr');
  });

  it('reads the settings again and puts focus back on the button', () => {
    let env = PHONE;
    const { root, panel } = mount({ env: () => env });
    expect(root.innerHTML).toContain('<td>320 CSS pixels</td>');
    env = DESKTOP;
    root.click('fit-refresh');
    expect(root.innerHTML).toContain('<td>1280 CSS pixels</td>');
    expect(panel.getState().notice).toBe('Settings read again.');
    expect(root.focused).toEqual(['[data-action="fit-refresh"]']);
  });

  it('runs the checks, says so while they run, then says what was found', async () => {
    const m = mount();
    m.root.click('fit-run');
    expect(m.panel.getState().audit.kind).toBe('running');
    expect(m.root.innerHTML).toContain('<div role="status" aria-live="polite">Running the checks…</div>');
    await settle();
    expect(m.runs).toBe(1);
    expect(m.panel.getState().audit.kind).toBe('done');
    expect(m.panel.getState().notice).toContain('2 things to fix and 3 things UNKNOWN');
    expect(m.root.focused).toEqual(['[data-action="fit-run"]', '[data-action="fit-run"]']);
  });

  it('does not start a second run while one is going', async () => {
    let release: (r: ReturnType<typeof smallSite>) => void = () => undefined;
    let runs = 0;
    const m = mount({
      run: () => {
        runs += 1;
        return new Promise((ok) => {
          release = ok;
        });
      },
    });
    m.root.click('fit-run');
    m.root.click('fit-run');
    expect(runs).toBe(1);
    release(smallSite());
    await settle();
    expect(m.panel.getState().audit.kind).toBe('done');
  });

  it('says the checks could not run when they throw, with the reason', async () => {
    const m = mount({
      run: () => {
        throw new Error('The page went away.');
      },
    });
    m.root.click('fit-run');
    await settle();
    expect(m.panel.getState().audit).toEqual({ kind: 'error', message: 'The page went away.' });
    expect(m.root.innerHTML).toContain('The checks could not run: The page went away.');
    expect(m.panel.getState().notice).toBe('The checks could not run');
  });

  it('refuses an empty form, says why in the live region and moves focus to the first field in error', () => {
    const m = mount();
    m.root.click('fit-make');
    const state = m.panel.getState();
    expect(state.errors.map((e) => e.field)).toEqual(['kind', 'what']);
    expect(state.text).toBeNull();
    expect(state.notice).toBe('The text could not be prepared. Choose the kind of barrier. Say what happened, in at least 10 characters.');
    expect(m.root.focused).toEqual(['#fit-kind-cut-off']);
    expect(m.root.innerHTML).toContain('id="fit-kind-error"');
  });

  it('moves focus to the description when only it is in error, and keeps the chosen kind', () => {
    const m = mount();
    fill(m.root, { ...filled, what: 'short' });
    m.root.click('fit-make');
    expect(m.root.focused).toEqual(['#fit-what']);
    expect(m.root.innerHTML).toContain('value="too-small" checked>');
    expect(m.root.innerHTML).toContain('>short</textarea>');
    expect(m.root.innerHTML).not.toContain('fit-kind-error');
  });

  it('prepares the text from the answers, with the path of the page and no query', async () => {
    const m = mount();
    fill(m.root, filled);
    m.root.click('fit-make');
    await settle();
    const text = m.panel.getState().text ?? '';
    expect(text).toContain('Page: /places/12\n');
    expect(text).not.toContain('ramp');
    expect(text).toContain('Kind of barrier: A button or link is too small or too close to another');
    expect(text).toContain('The close button is too small to press.');
    expect(text).toContain('Width of the page area: 320 CSS pixels');
    expect(text).not.toContain('checks of the App found');
    expect(m.runs).toBe(0);
    expect(m.panel.getState().notice).toBe('The text is ready below. Read it before you share it.');
    expect(m.root.focused).toEqual(['#fit-text']);
  });

  it('runs the checks only when the person asks for the findings in the text', async () => {
    const m = mount();
    fill(m.root, { ...filled, includeFindings: true, includeSettings: false });
    m.root.click('fit-make');
    await settle();
    expect(m.runs).toBe(1);
    const text = m.panel.getState().text ?? '';
    expect(text).toContain('What the checks of the App found on this page:');
    expect(text).toContain('2 things to fix and 3 things UNKNOWN');
    expect(text).not.toContain('Width of the page area');
    expect(m.panel.getState().audit.kind).toBe('done');
  });

  it('writes UNKNOWN for the findings when the checks could not run, and still prepares the text', async () => {
    const m = mount({
      run: () => {
        throw new Error('no');
      },
    });
    fill(m.root, { ...filled, includeFindings: true });
    m.root.click('fit-make');
    await settle();
    expect(m.panel.getState().text).toContain('UNKNOWN. The checks could not run.');
  });

  it('clears earlier errors once the text is made', async () => {
    const m = mount();
    m.root.click('fit-make');
    expect(m.panel.getState().errors).toHaveLength(2);
    fill(m.root, filled);
    m.root.click('fit-make');
    await settle();
    expect(m.panel.getState().errors).toEqual([]);
    expect(m.root.innerHTML).not.toContain(' aria-invalid=');
  });

  it('copies the text and says so', async () => {
    const m = mount();
    fill(m.root, filled);
    m.root.click('fit-make');
    await settle();
    m.root.click('fit-copy');
    await settle();
    expect(m.copied).toEqual([m.panel.getState().text]);
    expect(m.panel.getState().notice).toBe('Copied.');
    expect(m.root.focused.at(-1)).toBe('[data-action="fit-copy"]');
  });

  it('says how to copy by hand when copying fails, and puts focus on the text', async () => {
    const m = mount({
      copy: async () => {
        throw new Error('denied');
      },
    });
    fill(m.root, filled);
    m.root.click('fit-make');
    await settle();
    m.root.click('fit-copy');
    await settle();
    expect(m.panel.getState().notice).toBe('Copying failed. Select the text and copy it by hand.');
    expect(m.root.focused.at(-1)).toBe('#fit-text');
  });

  it('says copying is not available when the browser has no clipboard', async () => {
    const root = fakeRoot();
    const panel = mountFitPanel({ root, lang: 'fr', env: () => PHONE, now: () => NOW, location: () => '/', run: () => smallSite() });
    fill(root, filled);
    root.click('fit-make');
    await settle();
    root.click('fit-copy');
    await settle();
    expect(panel.getState().notice).toBe('La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.');
    expect(root.focused.at(-1)).toBe('#fit-text');
  });

  it('does nothing on copy before there is a text', async () => {
    const m = mount();
    m.root.click('fit-copy');
    await settle();
    expect(m.copied).toEqual([]);
    expect(m.panel.getState().notice).toBe('');
  });

  it('erases the answers and the text, says so, and puts focus on the first field', async () => {
    const m = mount();
    fill(m.root, filled);
    m.root.click('fit-make');
    await settle();
    m.root.click('fit-clear');
    const state = m.panel.getState();
    expect(state.draft).toEqual(EMPTY_DRAFT);
    expect(state.text).toBeNull();
    expect(state.notice).toBe('Your answers and the text were erased.');
    expect(m.root.focused.at(-1)).toBe('#fit-kind-cut-off');
    expect(m.root.innerHTML).not.toContain('The close button');
  });

  it('keeps what the person typed when another part of the panel re-renders', () => {
    const m = mount();
    fill(m.root, { ...filled, includeSettings: false, includeFindings: true });
    m.root.click('fit-refresh');
    expect(m.panel.getState().draft).toEqual({ ...filled, includeSettings: false, includeFindings: true });
    expect(m.root.innerHTML).toContain('>The close button is too small to press.</textarea>');
    expect(m.root.innerHTML).toContain('id="fit-settings" name="fit-settings">');
    expect(m.root.innerHTML).toContain('id="fit-findings" name="fit-findings" checked>');
  });

  it('ignores clicks that are not its own, and leaves the save link to the browser', () => {
    const m = mount();
    const before = m.root.innerHTML;
    for (const action of [null, 'run', 'lang-fr', 'fit-save', 'fit-nothing']) m.root.click(action);
    expect(m.root.focused).toEqual([]);
    expect(m.root.innerHTML).toBe(before);
  });

  it('starts from the answers it is given, and hands back what is in the form', () => {
    const m = mount({ draft: filled });
    expect(m.panel.getState().draft).toEqual(filled);
    expect(m.root.innerHTML).toContain('value="too-small" checked>');
    fill(m.root, { ...filled, kind: 'moves', what: 'The banner slides away.' });
    expect(m.panel.getDraft()).toEqual({ ...filled, kind: 'moves', what: 'The banner slides away.' });
  });

  it('takes a kind it does not know in the form as no choice', () => {
    const m = mount();
    m.root.fields['input[name="fit-kind"]:checked'] = { value: 'made-up' };
    expect(m.panel.getDraft().kind).toBe('');
  });

  it('works on a root with no way to look inside, from the state alone', async () => {
    const handlers: Array<(e: { target: unknown }) => void> = [];
    const bare = { innerHTML: '', addEventListener: (_t: 'click', h: (e: { target: unknown }) => void) => void handlers.push(h) };
    const panel = mountFitPanel({ root: bare, lang: 'en', env: () => SILENT, now: () => NOW, run: () => smallSite(), draft: filled, location: () => '/x' });
    for (const h of handlers) h({ target: { getAttribute: () => 'fit-make' } });
    await settle();
    expect(panel.getState().text).toContain('Page: /x');
    expect(panel.getState().text?.match(/: UNKNOWN$/gm)).toHaveLength(10);
    for (const h of handlers) h({ target: {} });
    expect(panel.getState().text).not.toBeNull();
  });

  it('is in French from end to end', async () => {
    const m = mount({ lang: 'fr' });
    m.root.click('fit-make');
    expect(m.panel.getState().notice).toBe('Le texte n’a pas pu être préparé. Choisissez le type d’obstacle. Décrivez ce qui s’est passé, en au moins 10 caractères.');
    fill(m.root, { ...filled, what: 'Le bouton Fermer est trop petit.' });
    m.root.click('fit-make');
    await settle();
    expect(m.panel.getState().text).toContain('Obstacle rencontré dans l’App');
    expect(m.root.innerHTML).toContain('download="obstacle-2026-11-19.txt"');
    m.root.click('fit-clear');
    expect(m.panel.getState().notice).toBe('Vos réponses et le texte ont été effacés.');
    for (const notice of ['Réglages relus.', 'Copié.']) expect(frTypographyIssues(notice)).toEqual([]);
  });
});
