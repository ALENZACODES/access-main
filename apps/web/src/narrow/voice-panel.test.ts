import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { fakeRoot, pageAround, settle, textOf } from './fit-testkit.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { markupResults } from './run.js';
import { NBSP, NNBSP } from './types.js';
import type { VoiceControl, VoiceFacts } from './voice-inpage.js';
import {
  VOICE_CSS,
  VOICE_EXCLUDE,
  VOICE_LISTED,
  initialVoiceState,
  isVoiceAction,
  mountVoicePanel,
  renderVoicePanel,
  voiceModelOf,
  voicePanel,
  voiceStep,
  type VoicePanelState,
} from './voice-panel.js';

const LANGS = ['en', 'fr'] as const;
const c = (name: string, visible: string, id: string, role: VoiceControl['role'] = 'button'): VoiceControl => ({ id, role, name, visible });
const PAGE: VoiceFacts = {
  controls: [c('Send', 'Send', 'button[0]'), c('Close', '', 'button#x[1]'), c('Edit', 'Edit', 'button[2]'), c('Edit', 'Edit', 'button[3]'), c('Read more about ramps', 'Learn more', 'a[0]', 'link')],
  truncated: false,
};
const MANY: VoiceFacts = { controls: Array.from({ length: VOICE_LISTED + 4 }, (_, i) => c('', '', `button[${i}]`)), truncated: true };
const read = (f: VoiceFacts = PAGE) => () => f;
const counted = (f: VoiceFacts = PAGE): VoicePanelState => ({ ...initialVoiceState(), facts: f });

function states(lang: 'en' | 'fr'): Array<[string, VoicePanelState]> {
  const base = voiceStep(initialVoiceState(), 'voice-count', lang, read()).state;
  return [
    ['at first', initialVoiceState()],
    ['read', base],
    ['with a phrase that reaches one', voiceStep({ ...base, phrase: 'click Send' }, 'voice-try', lang, read()).state],
    ['with a phrase that reaches two', voiceStep({ ...base, phrase: 'Edit' }, 'voice-try', lang, read()).state],
    ['with a phrase that reaches none', voiceStep({ ...base, phrase: 'Learn more' }, 'voice-try', lang, read()).state],
    ['with an empty phrase', voiceStep({ ...base, phrase: '' }, 'voice-try', lang, read()).state],
    ['with many controls', counted(MANY)],
    ['with no control', counted({ controls: [], truncated: false })],
    [
      'after a failure',
      voiceStep(initialVoiceState(), 'voice-count', lang, () => {
        throw new Error('boom');
      }).state,
    ],
  ];
}

describe('renderVoicePanel', () => {
  it('starts with an h2, says it changes nothing, and offers to read the page', () => {
    const html = renderVoicePanel('en', initialVoiceState());
    expect(html).toContain('<h2 id="voice-h">Say it to press it</h2>');
    expect(html).toContain('This reads the page and changes nothing. Nothing is stored or sent.');
    expect(html).toContain('<button type="button" data-action="voice-count">Read the controls of this page</button>');
    expect(html).not.toContain('voice-say');
  });

  it('moves every heading down a level when asked', () => {
    const html = renderVoicePanel('en', counted(), 3);
    expect(html).toContain('<h3 id="voice-h">');
    expect(html).toContain('<h4 id="voice-result-h" tabindex="-1">');
    expect(html).toContain('<h5 id="voice-hard-h">');
    expect(html).toContain('<h5 id="voice-try-h">');
    expect(html).not.toMatch(/<h2/);
  });

  it('shows the summary and the controls that take extra steps, then a labelled field to try a phrase', () => {
    const html = renderVoicePanel('en', counted());
    expect(textOf(html)).toContain('Of 5 controls, 1 can be reached in one step by saying what it shows.');
    expect(html).toContain('<li><strong>button “Close”</strong>: It shows no words.');
    expect(html).toContain('<li><strong>link “Learn more”</strong>: It shows “Learn more”, but its name is “Read more about ramps”.');
    expect(html).toContain('<label for="voice-say">What you would say</label>');
    expect(html).toContain('<input class="voice-field" type="text" id="voice-say" name="voice-say" value="" autocomplete="off" spellcheck="false" aria-describedby="voice-say-hint">');
    expect(html).toContain('data-action="voice-try">See what it reaches</button>');
    expect(html).toContain('data-action="voice-count">Read the page again</button>');
  });

  it('shows what a phrase reaches, and keeps the phrase in the field', () => {
    const s = voiceStep({ ...counted(), phrase: 'Edit' }, 'voice-try', 'en', read()).state;
    const html = renderVoicePanel('en', s);
    expect(html).toContain('<p id="voice-said">2 controls answer to “edit”. The voice tool will ask which one, often with numbers.</p>');
    expect(html).toContain('value="Edit"');
  });

  it('lists a limited number of controls and says the rest are in the copied text', () => {
    const html = renderVoicePanel('en', counted(MANY));
    expect(html.match(/<li><strong>/g)).toHaveLength(VOICE_LISTED);
    expect(html).toContain('… and 4 more, in the copied text.');
  });

  it('escapes what a page or a person wrote', () => {
    const odd: VoiceFacts = { controls: [c('<b>x</b>', '<i>y</i>', 'button[0]')], truncated: false };
    const html = renderVoicePanel('en', voiceStep({ ...counted(odd), phrase: '"><script>' }, 'voice-try', 'en', read(odd)).state);
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<script>');
  });

  it('has only buttons of type button, each with text, a label for its field, and nothing that sends or loads', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const html = renderVoicePanel(lang, s);
        for (const b of html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []) expect(b, name).toMatch(/^<button type="button" data-action="voice-[a-z]+">[^<]+<\/button>$/);
        if (html.includes('id="voice-say"')) expect(html).toContain('<label for="voice-say">');
        expect(html).not.toMatch(/<form|<a |href=|src=|<img/);
      }
    }
  });

  it('has no duplicate id in any state', () => {
    for (const lang of LANGS) {
      for (const [name, s] of states(lang)) {
        const ids = [...renderVoicePanel(lang, s).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, name).toBe(ids.length);
      }
    }
  });
});

describe('the styles of the panel', () => {
  it('gives every button and the field a 44 pixel minimum', () => {
    expect(VOICE_CSS).toContain('.voice button{min-height:44px;min-width:44px;');
    expect(VOICE_CSS).toContain('.voice .voice-field{display:block;width:100%;max-width:20rem;min-height:44px;');
  });

  it('shows focus, never removes an outline, sets no colour and does not move', () => {
    expect(VOICE_CSS).toContain('.voice button:focus-visible');
    expect(VOICE_CSS).not.toMatch(/outline:(0|none)/);
    expect(VOICE_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|background|[^-]color:/i);
    expect(VOICE_CSS).not.toMatch(/animation|transition/);
  });

  it('scopes every rule to the panel, and leaves the panel out of the reading', () => {
    for (const rule of VOICE_CSS.split('}').filter((r) => r !== '')) {
      for (const selector of (rule.split('{')[0] ?? '').split(',')) expect(selector.startsWith('.voice'), selector).toBe(true);
    }
    expect(VOICE_EXCLUDE).toBe('.voice');
    expect(renderVoicePanel('en', initialVoiceState())).toMatch(/^<div class="voice">/);
  });
});

describe('the markup under the checks of this module', () => {
  for (const lang of LANGS) {
    for (const [name, state] of states(lang)) {
      it(`has no finding ${name}, in ${lang}`, () => {
        const html = pageAround(renderVoicePanel(lang, state), lang);
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
      .map(([, s]) => textOf(renderVoicePanel(lang, s)))
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
    for (const en of ['Read the controls', 'What was found', 'Try what you would say', 'See what it reaches', 'Copy the result']) expect(fr).not.toContain(en);
  });

  it('makes none of the claims the App does not make, and names no voice product', () => {
    for (const lang of LANGS) {
      const t = allText(lang).toLowerCase();
      for (const word of ['verif', 'vérif', 'real-time', 'temps réel', 'partnership', 'partenariat', 'guarantee', 'garanti', 'eligib', 'admissib', 'diagnos', 'compliant', 'conforme', 'dragon', 'siri', 'alexa', 'google assistant']) {
        expect(t, word).not.toContain(word);
      }
    }
  });

  it('has the title in both languages for the app shell', () => {
    expect(voicePanel.title).toEqual({ en: 'Say it to press it', fr: 'Le dire pour appuyer' });
    expect(voicePanel.mount).toBe(mountVoicePanel);
  });
});

describe('isVoiceAction and voiceStep', () => {
  it('knows its own actions only', () => {
    expect(isVoiceAction('voice-count')).toBe(true);
    expect(isVoiceAction('voice-try')).toBe(true);
    for (const a of ['voice-copy', 'scroll-count', null]) expect(isVoiceAction(a)).toBe(false);
  });

  it('reads the page, says so and puts focus on the result', () => {
    const step = voiceStep(initialVoiceState(), 'voice-count', 'en', read());
    expect(step.state.facts).toBe(PAGE);
    expect(step.state.notice).toBe('The controls were read.');
    expect(step.focus).toBe('#voice-result-h');
    expect(voiceModelOf(step.state)?.direct).toBe(1);
    expect(voiceModelOf(initialVoiceState())).toBeNull();
  });

  it('works out the phrase again when the page is read again', () => {
    const tried = voiceStep({ ...counted(), phrase: 'Send' }, 'voice-try', 'en', read()).state;
    const again = voiceStep(tried, 'voice-count', 'en', read({ controls: [], truncated: false })).state;
    expect(again.said?.kind).toBe('none');
  });

  it('says what a phrase reaches in the live region, keeping focus on the button, or on the field when it is empty', () => {
    const one = voiceStep({ ...counted(), phrase: 'tap Send' }, 'voice-try', 'fr', read());
    expect(one.state.notice).toBe(`Une seule commande répond à «${NNBSP}send${NNBSP}»${NBSP}: bouton «${NNBSP}Send${NNBSP}».`);
    expect(one.focus).toBe('[data-action="voice-try"]');
    const empty = voiceStep({ ...counted(), phrase: ' ' }, 'voice-try', 'en', read());
    expect(empty.state.notice).toBe('Write what you would say, such as Send.');
    expect(empty.focus).toBe('#voice-say');
    expect(voiceStep(initialVoiceState(), 'voice-try', 'en', read()).focus).toBe('');
  });

  it('says why the page could not be read and keeps focus at the top', () => {
    const step = voiceStep(initialVoiceState(), 'voice-count', 'fr', () => {
      throw new Error('boom');
    });
    expect(step.state.notice).toBe(`La page n’a pas pu être lue${NBSP}: boom`);
    expect(step.focus).toBe('#voice-h');
  });
});

describe('mountVoicePanel', () => {
  it('renders at once, sets the language, moves no focus and reads nothing yet', () => {
    let reads = 0;
    const root = fakeRoot();
    mountVoicePanel({
      root,
      lang: 'fr',
      read: () => {
        reads += 1;
        return PAGE;
      },
    });
    expect(root.innerHTML).toContain('Le dire pour appuyer');
    expect(root.attributes.lang).toBe('fr');
    expect(root.focused).toEqual([]);
    expect(reads).toBe(0);
  });

  it('reads the page on a click, then reads the field before trying the phrase', () => {
    const root = fakeRoot();
    const got = mountVoicePanel({ root, lang: 'en', read: read() });
    root.click('voice-count');
    expect(root.focused).toEqual(['#voice-result-h']);
    root.fields['#voice-say'] = { value: 'click Edit' };
    root.click('voice-try');
    expect(root.innerHTML).toContain('2 controls answer to “edit”.');
    expect(got.getState().phrase).toBe('click Edit');
  });

  it('copies the result and says so, or says how to copy by hand', async () => {
    const copied: string[] = [];
    const root = fakeRoot();
    mountVoicePanel({
      root,
      lang: 'en',
      read: read(),
      copy: async (t) => {
        copied.push(t);
      },
    });
    root.click('voice-copy');
    expect(copied).toEqual([]);
    root.click('voice-count');
    root.click('voice-copy');
    await settle();
    expect(copied[0]?.split('\n')[0]).toBe('Say it to press it');
    expect(root.innerHTML).toContain('<div role="status" aria-live="polite">Copied.</div>');
    const failing = fakeRoot();
    mountVoicePanel({ root: failing, lang: 'en', read: read(), copy: () => Promise.reject(new Error('no')) });
    failing.click('voice-count');
    failing.click('voice-copy');
    await settle();
    expect(failing.innerHTML).toContain('Copying failed. Select the text and copy it by hand.');
  });

  it('ignores clicks that are not its own, and keeps what was read and typed in another language', () => {
    const root = fakeRoot();
    mountVoicePanel({ root, lang: 'en', read: read() });
    const before = root.innerHTML;
    root.click('scroll-count');
    root.click(null);
    expect(root.innerHTML).toBe(before);
    const fr = fakeRoot();
    const kept = voiceStep({ ...counted(), phrase: 'Edit' }, 'voice-try', 'en', read()).state;
    mountVoicePanel({ root: fr, lang: 'fr', read: read(), state: kept });
    expect(fr.innerHTML).toContain(`2${NBSP}commandes répondent à «${NNBSP}edit${NNBSP}».`);
    expect(fr.innerHTML).toContain('<div role="status" aria-live="polite"></div>');
  });
});
