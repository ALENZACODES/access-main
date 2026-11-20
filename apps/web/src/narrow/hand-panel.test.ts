import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { fakeRoot, pageAround, settle, textOf, type FakeRoot } from './fit-testkit.js';
import { HAND_CSS, handPanel, handStep, initialHandState, isHandAction, mountHandPanel, renderHandPanel, type HandState } from './hand-panel.js';
import { MAX_NOTE, answer, newSession, setNeeds, stepIds, OPTIONAL_NEEDS } from './hand-session.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { parseManualLog, sampleManualLog } from './manual-log.js';
import { nov } from './report-fixtures.js';
import { markupResults } from './run.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const NOW = nov(19);
const FIRST = stepIds(newSession())[0] as string;
const SECOND = stepIds(newSession())[1] as string;

const withDraft = (state: HandState, result: string, note = ''): HandState => ({ ...state, drafts: { ...state.drafts, [state.session.current as string]: { result, note } } });
const named = (): HandState => {
  const s = initialHandState();
  return { ...s, session: { ...s.session, who: '@sam' } };
};

/** States that draw every part of the panel. */
function states(lang: 'en' | 'fr'): Array<[string, HandState]> {
  const read = handStep({ ...named(), earlierText: sampleManualLog() }, 'hand-read', lang, NOW).state;
  const saved = handStep(withDraft(read, 'problem', 'The form says “click the green button”.'), 'hand-save-next', lang, NOW).state;
  const errors = handStep(withDraft(saved, '', 'x'.repeat(MAX_NOTE + 1)), 'hand-save', lang, NOW).state;
  const exported = handStep({ ...saved, listOpen: true }, 'hand-export', lang, NOW).state;
  const noWho = handStep({ ...saved, session: { ...saved.session, who: '' } }, 'hand-export', lang, NOW).state;
  const badLog = handStep({ ...named(), earlierText: 'not json' }, 'hand-read', lang, NOW).state;
  const everything = { ...named(), session: setNeeds(answer(named().session, '1.1.1', 'not-sure', ''), []) };
  const onEarlier = { ...read, session: { ...setNeeds(read.session, OPTIONAL_NEEDS), current: '2.4.7' } };
  return [
    ['at first', initialHandState()],
    ['with an earlier log read', onEarlier],
    ['after a saved answer', { ...saved, session: { ...saved.session, current: FIRST } }],
    ['with errors on the step', errors],
    ['with the log prepared', exported],
    ['with no name for the log', noWho],
    ['with a log that cannot be read', badLog],
    ['with an answer for a step that no longer shows', everything],
  ];
}

describe('renderHandPanel', () => {
  it('starts with an h2, and has its sections under h3', () => {
    const html = renderHandPanel('en', initialHandState(), NOW);
    expect(html).toContain('<h2 id="hand-h">Look by hand</h2>');
    expect(html.match(/<h1[ >]/g)).toBeNull();
    expect(html.match(/<h2[ >]/g)).toHaveLength(1);
    expect(html.match(/<h3[ >]/g)).toHaveLength(3);
    for (const id of ['hand-setup-h', 'hand-step-h', 'hand-log-h']) expect(html).toContain(`<section aria-labelledby="${id}">`);
  });

  it('moves every heading down a level when asked', () => {
    const html = renderHandPanel('en', initialHandState(), NOW, 3);
    expect(html.match(/<h2[ >]/g)).toBeNull();
    expect(html.match(/<h3[ >]/g)).toHaveLength(1);
    expect(html.match(/<h4[ >]/g)).toHaveLength(3);
  });

  it('says what the steps are, what they are not, and that nothing is kept', () => {
    const text = textOf(renderHandPanel('en', initialHandState(), NOW));
    expect(text).toContain('Some things only a person can judge.');
    expect(text).toContain('Going through all of them records that someone looked. It does not make a page conform.');
    expect(text).toContain('Nothing here is stored or sent.');
    expect(text).toContain('your answers are lost, so prepare the log and save it first');
  });

  it('shows the step on screen: its number, its criterion, what to do, what to look for and what is needed', () => {
    const html = renderHandPanel('en', { ...initialHandState(), session: { ...newSession(), current: '1.4.10' } }, NOW);
    const total = stepIds(newSession()).length;
    const at = stepIds(newSession()).indexOf('1.4.10') + 1;
    expect(html).toContain(`<h3 id="hand-step-h" tabindex="-1">Step ${at} of ${total}: 1.4.10 Reflow (AA)</h3>`);
    expect(html).toContain('<p><strong>Do:</strong> Set the window to 320 CSS pixels wide');
    expect(html).toContain('<p><strong>Look for:</strong> ');
    expect(html).toContain('<p><strong>You need:</strong> a browser.</p>');
    expect(html).toContain(`<p>0 of ${total} steps looked at.</p>`);
  });

  it('writes the step in French with a no-break space before each colon', () => {
    const html = renderHandPanel('fr', { ...initialHandState(), session: { ...newSession(), current: '1.4.10' } }, NOW);
    expect(html).toContain(`${NBSP}: 1.4.10 Redistribution (AA)</h3>`);
    expect(html).toContain(`<p><strong>À faire${NBSP}:</strong> `);
    expect(html).toContain(`<p><strong>Il vous faut${NBSP}:</strong> un navigateur.</p>`);
  });

  it('offers the three results as radio buttons in a named group, with none chosen at first', () => {
    const html = renderHandPanel('en', initialHandState(), NOW);
    expect(html).toContain('<fieldset id="hand-result" role="radiogroup" aria-labelledby="hand-result-legend" aria-required="true">');
    expect(html).toContain('<legend id="hand-result-legend">What I found</legend>');
    expect(html.match(/<input type="radio" /g)).toHaveLength(3);
    expect(html).toContain('<label class="hand-check" for="hand-result-problem"><input type="radio" id="hand-result-problem" name="hand-result" value="problem"> I saw a problem</label>');
    expect(html).not.toMatch(/type="radio"[^>]* checked/);
  });

  it('gives every field a visible label tied to it', () => {
    const html = renderHandPanel('en', states('en')[4]?.[1] as HandState, NOW);
    for (const id of ['hand-who', 'hand-earlier', 'hand-note', 'hand-log', 'hand-summary', 'hand-need-keyboard', 'hand-need-media', 'hand-result-not-sure']) {
      expect(html.match(new RegExp(` id="${id}"`, 'g')), id).toHaveLength(1);
      expect(html.match(new RegExp(`<label[^>]* for="${id}"`, 'g')), id).toHaveLength(1);
    }
  });

  it('ticks what the person has, with a capital at the start of each label', () => {
    const html = renderHandPanel('en', initialHandState(), NOW);
    expect(html).toContain('id="hand-need-keyboard" name="hand-need-keyboard" checked> A keyboard</label>');
    expect(html).toContain('id="hand-need-screen-reader" name="hand-need-screen-reader"> A screen reader</label>');
    expect(html).toContain('> A phone or tablet</label>');
    expect(renderHandPanel('fr', initialHandState(), NOW)).toContain('> Un lecteur d’écran</label>');
    expect(html.match(/<input type="checkbox" /g)).toHaveLength(OPTIONAL_NEEDS.length);
  });

  it('ties the hints to their fields', () => {
    const html = renderHandPanel('en', initialHandState(), NOW);
    expect(html).toContain('aria-describedby="hand-who-hint"');
    expect(html).toContain('aria-describedby="hand-note-hint"');
    expect(html).toContain('aria-describedby="hand-earlier-hint"');
    expect(html).toContain(`At most ${MAX_NOTE} characters. Do not write personal details about anyone.`);
    expect(html).not.toContain(' aria-invalid=');
  });

  it('keeps what is in the form of the step, escaped', () => {
    const html = renderHandPanel('en', withDraft(initialHandState(), 'not-sure', '<b>bold</b> & "quoted"'), NOW);
    expect(html).toContain('value="not-sure" checked>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;</textarea>');
    expect(html).not.toContain('<b>bold</b>');
  });

  it('shows a saved answer again in the form and as a line of text', () => {
    const state = { ...initialHandState(), session: answer(newSession(), FIRST, 'problem', 'Seen on the home page.') };
    const html = renderHandPanel('en', state, NOW);
    expect(html).toContain('<p><strong>Saved answer:</strong> I saw a problem. Seen on the home page.</p>');
    expect(html).toContain('value="problem" checked>');
    expect(html).toContain('>Seen on the home page.</textarea>');
    expect(html).toContain('data-action="hand-clear">Erase the answer of this step</button>');
  });

  it('offers to erase the answer of a step only when it has one', () => {
    expect(renderHandPanel('en', initialHandState(), NOW)).not.toContain('hand-clear');
  });

  it('shows the last look from an earlier log next to the step', () => {
    const html = renderHandPanel('en', states('en')[1]?.[1] as HandState, NOW);
    expect(html).toContain('<p>Looked on 2026-11-12 by @name (7 days ago): no problem was found. Light and dark mode, home and place pages.</p>');
    expect(html).toContain('<p>3 notes read from the earlier log.</p>');
  });

  it('puts each error in text by its field and points the field at it', () => {
    const html = renderHandPanel('en', states('en')[3]?.[1] as HandState, NOW);
    expect(html).toContain('aria-required="true" aria-invalid="true" aria-describedby="hand-result-error">');
    expect(html).toContain('<p class="hand-error" id="hand-result-error">Choose what you found.</p>');
    expect(html).toContain('aria-describedby="hand-note-hint hand-note-error" aria-invalid="true">');
    expect(html).toContain(`<p class="hand-error" id="hand-note-error">The note is ${MAX_NOTE + 1} characters long.`);
  });

  it('marks the name when the log cannot be prepared without it', () => {
    const html = renderHandPanel('en', states('en')[5]?.[1] as HandState, NOW);
    expect(html).toContain('aria-describedby="hand-who-hint hand-who-error" aria-invalid="true">');
    expect(html).toContain('<p class="hand-error" id="hand-who-error">Say who looked. A handle or initials is enough.</p>');
    expect(html).not.toContain('id="hand-log"');
  });

  it('marks the earlier log when it cannot be read, and keeps what was pasted', () => {
    const html = renderHandPanel('en', states('en')[6]?.[1] as HandState, NOW);
    expect(html).toContain('aria-describedby="hand-earlier-hint hand-earlier-error" aria-invalid="true">not json</textarea>');
    expect(html).toContain('<p class="hand-error" id="hand-earlier-error">The by-hand log is not valid JSON.</p>');
  });

  it('lists all steps in a closed disclosure, each a button that says where it stands', () => {
    const state = { ...initialHandState(), session: answer(newSession(), SECOND, 'no-problem-found', '') };
    const html = renderHandPanel('en', state, NOW);
    const total = stepIds(newSession()).length;
    expect(html).toContain(`<details id="hand-all"><summary>All steps (1 of ${total} looked at)</summary><ol>`);
    expect(html.match(/data-action="hand-go-/g)).toHaveLength(total);
    expect(html).toContain(`data-action="hand-go-${FIRST.replace(/\./g, '-')}" aria-current="step">`);
    expect(html.match(/ aria-current="step">/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`data-action="hand-go-${SECOND.replace(/\./g, '-')}">[^<]*: no problem found</button>`));
    expect(html).toMatch(/: not looked at yet<\/button>/);
  });

  it('keeps the list open when the state says so', () => {
    expect(renderHandPanel('en', { ...initialHandState(), listOpen: true }, NOW)).toContain('<details id="hand-all" open>');
  });

  it('gives every step button a different name', () => {
    for (const lang of LANGS) {
      const labels = [...renderHandPanel(lang, initialHandState(), NOW).matchAll(/data-action="hand-go-[^"]+"[^>]*>([^<]+)</g)].map((m) => m[1]);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('shows the log and the same in words only once prepared, with a copy button each and a link to save the file', () => {
    const before = renderHandPanel('en', initialHandState(), NOW);
    expect(before).not.toContain('id="hand-log"');
    expect(before).not.toContain('hand-copy-log');
    const after = renderHandPanel('en', states('en')[4]?.[1] as HandState, NOW);
    expect(after).toContain('<textarea id="hand-log" name="hand-log" rows="10" readonly spellcheck="false">{');
    expect(after).toContain('<textarea id="hand-summary" name="hand-summary" rows="8" readonly>Look by hand on 2026-11-19, by @sam');
    expect(after).toContain('data-action="hand-copy-log">Copy the log</button>');
    expect(after).toContain('data-action="hand-copy-summary">Copy the words</button>');
    expect(after).toContain('download="narrow-audit.manual-log.2026-11-19.json">Save the log as a file</a>');
    expect(after).toContain('href="data:text/plain;charset=utf-8,%7B%0A');
  });

  it('the log on screen is a file the tool reads', () => {
    const state = states('en')[4]?.[1] as HandState;
    const parsed = parseManualLog(state.output?.log ?? '', NOW);
    expect(parsed.ok && parsed.value.notes).toHaveLength(4);
    expect(parsed.ok && parsed.value.notes.at(-1)).toMatchObject({ result: 'problem', by: '@sam', on: '2026-11-19' });
  });

  it('says that an answer for a step that no longer shows stays in the log', () => {
    const html = renderHandPanel('en', states('en')[7]?.[1] as HandState, NOW);
    expect(html).toContain('1 answer is for a step that no longer shows. It stays in the log.');
    expect(renderHandPanel('fr', states('fr')[7]?.[1] as HandState, NOW)).toContain('1 réponse concerne une étape qui n’est plus affichée. Elle reste dans le journal.');
  });

  it('labels the controls that erase by what they erase', () => {
    const html = renderHandPanel('en', initialHandState(), NOW);
    expect(html).toContain('data-action="hand-reset">Erase all my answers and start again</button>');
    expect(renderHandPanel('fr', initialHandState(), NOW)).toContain('data-action="hand-reset">Effacer toutes mes réponses et recommencer</button>');
  });

  it('has only buttons of type button, each with text', () => {
    for (const [name, state] of states('en')) {
      const buttons = renderHandPanel('en', state, NOW).match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
      expect(buttons.length, name).toBeGreaterThan(10);
      for (const b of buttons) {
        expect(b).toContain('type="button"');
        expect(b.replace(/<[^>]+>/g, '').trim()).not.toBe('');
      }
    }
  });

  it('has no form that submits, no script, no image, and no address but the file it offers', () => {
    for (const lang of LANGS) {
      for (const [, state] of states(lang)) {
        const html = renderHandPanel(lang, state, NOW);
        expect(html).not.toMatch(/<form|<script|\saction=|https?:\/\/|mailto:|<img|<iframe/i);
        for (const m of html.matchAll(/ href="([^"]*)"/g)) expect(m[1]).toMatch(/^data:text\/plain;charset=utf-8,/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const [name, state] of states('en')) {
      const ids = [...renderHandPanel('en', state, NOW).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });
});

describe('the styles of the panel', () => {
  it('gives buttons, fields, boxes, the save link and the disclosure a 44 pixel minimum', () => {
    expect(HAND_CSS).toContain('.hand button,.hand .hand-save{min-height:44px;min-width:44px;');
    expect(HAND_CSS).toContain('.hand .hand-field{display:block;width:100%;max-width:24rem;min-height:44px;');
    expect(HAND_CSS).toContain('.hand .hand-check input{width:44px;height:44px;');
    expect(HAND_CSS).toContain('.hand summary{min-height:44px;');
  });

  it('wraps on a narrow screen and hides nothing', () => {
    expect(HAND_CSS).toContain('overflow-wrap:anywhere');
    expect(HAND_CSS).toContain('flex-wrap:wrap');
    expect(HAND_CSS).toContain('white-space:normal');
    expect(HAND_CSS).not.toMatch(/white-space:nowrap|overflow:hidden|position:(fixed|absolute)|display:none/);
  });

  it('shows focus, also on the heading it moves focus to, never removes an outline, and sets no colour', () => {
    expect(HAND_CSS).toContain('.hand [tabindex="-1"]:focus-visible');
    expect(HAND_CSS).not.toMatch(/outline:(0|none)/);
    expect(HAND_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(HAND_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel', () => {
    for (const rule of HAND_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.hand'), selector).toBe(true);
    }
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderHandPanel(lang, state, NOW), lang);
        const results = { ...markupResults(html), 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) };
        const found = Object.values(results).flatMap((r) => (r ? r.entries : []));
        expect(found.map((e) => `${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`)).toEqual([]);
        expect(Object.values(results).reduce((n, r) => n + (r ? r.checked : 0), 0)).toBeGreaterThan(20);
      });
    }
  }
});

describe('the wording of the panel', () => {
  /** The text of every state, without what a person typed or what a file holds. */
  const allText = (lang: 'en' | 'fr'): string =>
    states(lang)
      .map(([, s]) => textOf(renderHandPanel(lang, { ...s, drafts: {}, earlierText: '' }, NOW).replace(/<textarea[^>]*readonly[^>]*>[\s\S]*?<\/textarea>/g, '')))
      .join('\n');

  it('follows French typography in every state', () => {
    for (const line of allText('fr').split('\n')) {
      // Notes from the sample log and the saved answer are a person's own words, in English.
      if (line.trim() === '' || /Light and dark mode|green button|@name/.test(line)) continue;
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

  it('speaks of conformance only to say what the steps do not do', () => {
    const lines = allText('en').split('\n').filter((l) => /conform/i.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/does not make a page conform|do not say that the pages conform/);
  });

  it('gives no medical or eligibility advice and asks nothing about the person but a name for the log', () => {
    expect(allText('en')).not.toMatch(/diagnos|medical|eligib|disabilit/i);
    expect(allText('fr')).not.toMatch(/diagnos|médical|admissib|handicap/i);
    const html = renderHandPanel('en', initialHandState(), NOW);
    expect(html).not.toMatch(/type="(email|tel)"|autocomplete="(name|email|tel)/);
  });

  it('is fully translated: no English phrase of the panel is left in the French', () => {
    const fr = allText('fr');
    for (const phrase of ['Look by hand', 'Before you start', 'Who is looking', 'What I have', 'Show the steps', 'Read this log', 'Step ', 'Look for', 'You need', 'What I found', 'Save and', 'Save this', 'Previous', 'Next step', 'Erase', 'All steps', 'The log', 'Prepare', 'looked at', 'I saw', 'I found', 'I am not']) {
      expect(fr, phrase).not.toContain(phrase);
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(handPanel.title).toEqual({ en: 'Look by hand', fr: 'Regarder à la main' });
    expect(handPanel.mount).toBe(mountHandPanel);
  });
});

describe('isHandAction', () => {
  it.each(['hand-needs', 'hand-read', 'hand-save', 'hand-save-next', 'hand-previous', 'hand-next', 'hand-next-open', 'hand-clear', 'hand-export', 'hand-reset', 'hand-go-1-4-10', 'hand-go-2-5-8'])('takes %s', (a) => {
    expect(isHandAction(a)).toBe(true);
  });

  it.each([null, '', 'run', 'fit-make', 'pair-compare', 'hand-', 'hand-go-', 'hand-go-reflow', 'hand-save-file', 'hand-copy-log', 'xhand-save', 'hand-save-now'])('leaves %j alone', (a) => {
    expect(isHandAction(a)).toBe(false);
  });
});

describe('handStep', () => {
  it('saves a valid answer and moves to the next step with none, with focus on its heading', () => {
    const step = handStep(withDraft(named(), 'no-problem-found'), 'hand-save-next', 'en', NOW);
    expect(step.state.session.answers[FIRST]).toEqual({ result: 'no-problem-found', note: '' });
    expect(step.state.session.current).toBe(SECOND);
    expect(step.state.notice).toBe('Saved.');
    expect(step.state.drafts).toEqual({});
    expect(step.focus).toBe('#hand-step-h');
  });

  it('saves and stays when asked to', () => {
    const step = handStep(withDraft(named(), 'not-sure', 'Ask the design lead.'), 'hand-save', 'en', NOW);
    expect(step.state.session.current).toBe(FIRST);
    expect(step.state.session.answers[FIRST]).toEqual({ result: 'not-sure', note: 'Ask the design lead.' });
    expect(step.focus).toBe('[data-action="hand-save"]');
  });

  it('does not save without a choice: the error, the notice and focus on the first choice', () => {
    const step = handStep(named(), 'hand-save-next', 'en', NOW);
    expect(step.state.session.answers).toEqual({});
    expect(step.state.session.current).toBe(FIRST);
    expect(step.state.errors).toEqual([{ field: 'result', message: 'Choose what you found.' }]);
    expect(step.state.notice).toBe('The answer was not saved. Choose what you found.');
    expect(step.focus).toBe('#hand-result-problem');
  });

  it('does not save a problem without a note, and puts focus on the note', () => {
    const step = handStep(withDraft(named(), 'problem'), 'hand-save', 'en', NOW);
    expect(step.state.session.answers).toEqual({});
    expect(step.state.errors.map((e) => e.field)).toEqual(['note']);
    expect(step.focus).toBe('#hand-note');
    expect(step.state.drafts[FIRST]).toEqual({ result: 'problem', note: '' });
  });

  it('saves a step again from its saved answer when the form was not touched', () => {
    const state = { ...named(), session: answer(named().session, FIRST, 'no-problem-found', '') };
    const step = handStep(state, 'hand-save', 'en', NOW);
    expect(step.state.errors).toEqual([]);
    expect(step.state.session.answers[FIRST]?.result).toBe('no-problem-found');
  });

  it('says every step has an answer after the last one, and puts focus on the button that prepares the log', () => {
    let state = named();
    for (const sc of stepIds(state.session).slice(1)) state = { ...state, session: answer(state.session, sc, 'no-problem-found', '') };
    const step = handStep(withDraft(state, 'no-problem-found'), 'hand-save-next', 'en', NOW);
    expect(step.state.notice).toBe('Every step has an answer. Prepare the log below.');
    expect(step.focus).toBe('[data-action="hand-export"]');
    expect(step.state.session.current).toBe(FIRST);
  });

  it('moves without saving, keeps what is in the form of each step, and clears errors', () => {
    const typed = withDraft(named(), 'problem', 'Half a sentence');
    const withError = handStep(typed, 'hand-save', 'en', NOW).state;
    const next = handStep({ ...withError, errors: [{ field: 'note', message: 'x' }] }, 'hand-next', 'en', NOW);
    expect(next.state.session.current).toBe(SECOND);
    expect(next.state.session.answers[FIRST]?.note).toBe('Half a sentence');
    const unsaved = handStep(withDraft(named(), 'not-sure', 'Draft only'), 'hand-next', 'en', NOW);
    expect(unsaved.state.session.answers).toEqual({});
    expect(unsaved.state.drafts[FIRST]).toEqual({ result: 'not-sure', note: 'Draft only' });
    expect(unsaved.state.errors).toEqual([]);
    const back = handStep(unsaved.state, 'hand-previous', 'en', NOW);
    expect(back.state.session.current).toBe(FIRST);
    expect(renderHandPanel('en', back.state, NOW)).toContain('>Draft only</textarea>');
    expect(back.focus).toBe('#hand-step-h');
  });

  it('jumps to a step from the list', () => {
    const step = handStep(named(), 'hand-go-1-4-10', 'en', NOW);
    expect(step.state.session.current).toBe('1.4.10');
    expect(step.focus).toBe('#hand-step-h');
    expect(handStep(named(), 'hand-go-9-9-9', 'en', NOW).state.session.current).toBe(FIRST);
  });

  it('goes to the next step with no answer', () => {
    const state = { ...named(), session: answer(named().session, SECOND, 'no-problem-found', '') };
    expect(handStep(state, 'hand-next-open', 'en', NOW).state.session.current).toBe(stepIds(state.session)[2]);
  });

  it('erases the answer of the step on screen, and what was in its form', () => {
    const state = withDraft({ ...named(), session: answer(named().session, FIRST, 'problem', 'Seen.') }, 'problem', 'Seen, and more');
    const step = handStep(state, 'hand-clear', 'en', NOW);
    expect(step.state.session.answers).toEqual({});
    expect(step.state.drafts).toEqual({});
    expect(step.state.notice).toBe('The answer of this step was erased.');
  });

  it('applies what the person has, keeps the answers, and says the steps changed', () => {
    const state = { ...named(), session: answer(named().session, FIRST, 'not-sure', ''), needsDraft: ['keyboard', 'screen-reader'] as const };
    const step = handStep(state, 'hand-needs', 'en', NOW);
    expect(step.state.session.needs).toEqual(['keyboard', 'screen-reader']);
    expect(stepIds(step.state.session).length).toBeGreaterThan(stepIds(newSession()).length);
    expect(step.state.session.answers[FIRST]).toBeDefined();
    expect(step.state.notice).toBe('The steps were updated.');
    expect(step.focus).toBe('#hand-step-h');
  });

  it('reads an earlier log, empties the box and says how many notes it read', () => {
    const step = handStep({ ...named(), earlierText: sampleManualLog() }, 'hand-read', 'en', NOW);
    expect(step.state.session.earlier.notes).toHaveLength(3);
    expect(step.state.earlierText).toBe('');
    expect(step.state.earlierError).toBe('');
    expect(step.state.notice).toBe('3 notes read from the earlier log.');
    expect(step.focus).toBe('[data-action="hand-read"]');
    const one = JSON.stringify({ version: 1, notes: [{ sc: '2.4.7', result: 'not-sure', on: '2026-11-01', by: '@a' }] });
    expect(handStep({ ...named(), earlierText: one }, 'hand-read', 'fr', NOW).state.notice).toBe('1 note lue dans le journal précédent.');
  });

  it('keeps what was pasted and gives the reason when the earlier log cannot be read', () => {
    const step = handStep({ ...named(), earlierText: '{"version":1}' }, 'hand-read', 'en', NOW);
    expect(step.state.earlierText).toBe('{"version":1}');
    expect(step.state.earlierError).toContain('needs "version": 1 and a "notes" list');
    expect(step.state.notice).toBe(step.state.earlierError);
    expect(step.focus).toBe('#hand-earlier');
    expect(step.state.session.earlier.notes).toEqual([]);
  });

  it('prepares the log and the same in words, with focus on the log', () => {
    const saved = handStep(withDraft(named(), 'problem', 'Seen on the home page.'), 'hand-save', 'en', NOW).state;
    const step = handStep(saved, 'hand-export', 'en', NOW);
    expect(step.focus).toBe('#hand-log');
    expect(step.state.notice).toBe('The log is ready below. Read it before you share it.');
    expect(JSON.parse(step.state.output?.log ?? '{}')).toEqual({ version: 1, notes: [{ sc: FIRST, result: 'problem', on: '2026-11-19', by: '@sam', note: 'Seen on the home page.' }] });
    expect(step.state.output?.summary).toContain('I saw a problem. Seen on the home page.');
  });

  it('does not prepare a log with nothing in it', () => {
    const step = handStep(named(), 'hand-export', 'en', NOW);
    expect(step.state.output).toBeNull();
    expect(step.state.notice).toBe('There is nothing to put in the log yet. Save an answer first.');
  });

  it('asks who looked before it prepares a log with new answers', () => {
    const saved = handStep(withDraft(initialHandState(), 'not-sure'), 'hand-save', 'en', NOW).state;
    const step = handStep(saved, 'hand-export', 'en', NOW);
    expect(step.state.output).toBeNull();
    expect(step.state.errors).toEqual([{ field: 'who', message: 'Say who looked. A handle or initials is enough.' }]);
    expect(step.focus).toBe('#hand-who');
    const email = handStep({ ...saved, session: { ...saved.session, who: 'sam@example.org' } }, 'hand-export', 'en', NOW);
    expect(email.state.errors[0]?.message).toContain('use a handle or initials');
  });

  it('prepares a log of earlier notes alone without asking for a name', () => {
    const read = handStep({ ...initialHandState(), earlierText: sampleManualLog() }, 'hand-read', 'en', NOW).state;
    const step = handStep(read, 'hand-export', 'en', NOW);
    expect(step.state.errors).toEqual([]);
    expect(JSON.parse(step.state.output?.log ?? '{}').notes).toHaveLength(3);
  });

  it('takes the prepared log away as soon as an answer changes, so a stale one is never copied', () => {
    const saved = handStep(withDraft(named(), 'not-sure'), 'hand-save', 'en', NOW).state;
    const exported = handStep(saved, 'hand-export', 'en', NOW).state;
    expect(exported.output).not.toBeNull();
    for (const action of ['hand-save', 'hand-clear', 'hand-needs'] as const) {
      expect(handStep(withDraft(exported, 'not-sure'), action, 'en', NOW).state.output, action).toBeNull();
    }
    expect(handStep({ ...exported, earlierText: sampleManualLog() }, 'hand-read', 'en', NOW).state.output).toBeNull();
    expect(handStep(exported, 'hand-next', 'en', NOW).state.output).not.toBeNull();
  });

  it('erases everything but the name, and says so', () => {
    const saved = handStep(withDraft({ ...named(), earlierText: 'x', listOpen: true }, 'not-sure'), 'hand-save', 'en', NOW).state;
    const step = handStep(saved, 'hand-reset', 'en', NOW);
    expect(step.state.session.answers).toEqual({});
    expect(step.state.session.who).toBe('@sam');
    expect(step.state.session.current).toBe(FIRST);
    expect(step.state.earlierText).toBe('');
    expect(step.state.notice).toBe('All answers were erased.');
  });
});

describe('mountHandPanel', () => {
  interface Mounted {
    readonly root: FakeRoot;
    readonly panel: ReturnType<typeof mountHandPanel>;
    readonly copied: string[];
  }
  const mount = (over: Partial<Parameters<typeof mountHandPanel>[0]> = {}): Mounted => {
    const root = fakeRoot();
    const copied: string[] = [];
    const panel = mountHandPanel({
      root,
      lang: 'en',
      now: () => NOW,
      copy: async (text) => {
        copied.push(text);
      },
      ...over,
    });
    return { root, panel, copied };
  };
  const type = (root: FakeRoot, result: string, note = '', who = '@sam'): void => {
    root.fields['input[name="hand-result"]:checked'] = { value: result };
    root.fields['#hand-note'] = { value: note };
    root.fields['#hand-who'] = { value: who };
  };

  it('renders at once, sets the language on its root and moves no focus', () => {
    const { root, panel } = mount();
    expect(root.innerHTML).toContain('<h2 id="hand-h">Look by hand</h2>');
    expect(root.attributes['lang']).toBe('en');
    expect(root.focused).toEqual([]);
    expect(panel.getState().session.answers).toEqual({});
    expect(mount({ lang: 'fr' }).root.innerHTML).toContain('<h2 id="hand-h">Regarder à la main</h2>');
  });

  it('saves what is in the form and moves on', () => {
    const { root, panel } = mount();
    type(root, 'no-problem-found');
    root.click('hand-save-next');
    expect(panel.getState().session.answers[FIRST]).toEqual({ result: 'no-problem-found', note: '' });
    expect(root.focused).toEqual(['#hand-step-h']);
    expect(root.innerHTML).toContain('Step 2 of ');
  });

  it('reads the name and the boxes from the form', () => {
    const { root, panel } = mount();
    type(root, 'not-sure', '', '@lee');
    root.fields['#hand-need-screen-reader'] = { checked: true };
    root.fields['#hand-need-keyboard'] = { checked: false };
    root.click('hand-needs');
    const state = panel.getState();
    expect(state.session.who).toBe('@lee');
    expect(state.session.needs).toEqual(['screen-reader']);
    expect(root.innerHTML).toContain('id="hand-need-screen-reader" name="hand-need-screen-reader" checked>');
    expect(root.innerHTML).toContain('id="hand-need-keyboard" name="hand-need-keyboard">');
  });

  it('keeps the list open across a re-render when it was open', () => {
    const { root } = mount();
    (root.fields as Record<string, { open?: boolean }>)['#hand-all'] = { open: true };
    type(root, 'not-sure');
    root.click('hand-save');
    expect(root.innerHTML).toContain('<details id="hand-all" open>');
  });

  it('prepares the log, then copies it and says so', async () => {
    const m = mount();
    type(m.root, 'problem', 'Seen on the home page.');
    m.root.click('hand-save');
    m.root.click('hand-export');
    expect(m.root.focused.at(-1)).toBe('#hand-log');
    m.root.click('hand-copy-log');
    await settle();
    expect(m.copied).toHaveLength(1);
    expect(JSON.parse(m.copied[0] ?? '{}').notes[0]).toMatchObject({ sc: FIRST, result: 'problem', by: '@sam' });
    expect(m.panel.getState().notice).toBe('Copied.');
    expect(m.root.focused.at(-1)).toBe('[data-action="hand-copy-log"]');
    m.root.click('hand-copy-summary');
    await settle();
    expect(m.copied[1]).toContain('Look by hand on 2026-11-19, by @sam');
  });

  it('says how to copy by hand when copying fails or is not there', async () => {
    const failing = mount({
      copy: async () => {
        throw new Error('denied');
      },
    });
    type(failing.root, 'not-sure');
    failing.root.click('hand-save');
    failing.root.click('hand-export');
    failing.root.click('hand-copy-log');
    await settle();
    expect(failing.panel.getState().notice).toBe('Copying failed. Select the text and copy it by hand.');
    expect(failing.root.focused.at(-1)).toBe('#hand-log');
    const root = fakeRoot();
    const panel = mountHandPanel({ root, lang: 'fr', now: () => NOW });
    type(root, 'not-sure');
    root.click('hand-save');
    root.click('hand-export');
    root.click('hand-copy-summary');
    await settle();
    expect(panel.getState().notice).toBe('La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.');
    expect(root.focused.at(-1)).toBe('#hand-summary');
  });

  it('does nothing on copy before the log is prepared', async () => {
    const m = mount();
    m.root.click('hand-copy-log');
    await settle();
    expect(m.copied).toEqual([]);
    expect(m.root.focused).toEqual([]);
  });

  it('ignores clicks that are not its own, and leaves the save link to the browser', () => {
    const m = mount();
    const before = m.root.innerHTML;
    for (const action of [null, 'run', 'fit-make', 'pair-compare', 'hand-save-file', 'hand-nothing']) m.root.click(action);
    expect(m.root.innerHTML).toBe(before);
    expect(m.root.focused).toEqual([]);
  });

  it('starts from a state handed over, keeps the session and drops the messages of the other language', () => {
    const first = mount();
    type(first.root, 'problem', 'Seen on the home page.');
    first.root.click('hand-save');
    first.root.click('hand-export');
    const handed = first.panel.getState();
    expect(handed.output).not.toBeNull();
    const second = mount({ lang: 'fr', state: handed });
    const state = second.panel.getState();
    expect(state.session.answers[FIRST]).toEqual({ result: 'problem', note: 'Seen on the home page.' });
    expect(state.session.who).toBe('@sam');
    expect(state.notice).toBe('');
    expect(state.output).toBeNull();
    expect(second.root.innerHTML).toContain('J’ai vu un problème. Seen on the home page.');
  });

  it('works on a root with no way to look inside, from the state alone', () => {
    const handlers: Array<(e: { target: unknown }) => void> = [];
    const bare = { innerHTML: '', addEventListener: (_t: 'click', h: (e: { target: unknown }) => void) => void handlers.push(h) };
    const panel = mountHandPanel({ root: bare, lang: 'en', now: () => NOW });
    for (const h of handlers) h({ target: { getAttribute: () => 'hand-next' } });
    expect(panel.getState().session.current).toBe(SECOND);
    for (const h of handlers) h({ target: {} });
    expect(panel.getState().session.current).toBe(SECOND);
  });

  it('is in French from end to end', () => {
    const { root, panel } = mount({ lang: 'fr' });
    root.click('hand-save-next');
    expect(panel.getState().notice).toBe('La réponse n’a pas été enregistrée. Choisissez ce que vous avez constaté.');
    type(root, 'no-problem-found');
    root.click('hand-save-next');
    expect(panel.getState().notice).toBe('Enregistré.');
    root.click('hand-export');
    expect(panel.getState().notice).toBe('Le journal est prêt ci-dessous. Relisez-le avant de le partager.');
    expect(panel.getState().output?.summary).toContain('Examen à la main du 2026-11-19, par @sam');
  });
});
