import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { buildVoice, controlText, issueText, say, sayText, voiceSummary, voiceText, type SayResult, type VoiceModel } from './voice.js';
import { VOICE_ARGS, voiceInPage, type VoiceFacts } from './voice-inpage.js';

/**
 * "Say it to press it": a panel for people who use voice control. It reads
 * the controls of the page and counts those that take extra steps by voice:
 * no words shown, a name that differs from what is shown, a name shared with
 * another control, or no name. A field lets the person try a phrase and see
 * which controls it would reach.
 *
 * It reads the page and changes nothing. Every control is at least 44 CSS
 * pixels each way. Nothing is stored or sent, and what is typed in the field
 * stays in the panel.
 */

export interface VoiceRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void; value?: string } | null;
}

export interface VoicePanelState {
  readonly facts: VoiceFacts | null;
  readonly phrase: string;
  readonly said: SayResult | null;
  readonly notice: string;
}

export const initialVoiceState = (): VoicePanelState => ({ facts: null, phrase: '', said: null, notice: '' });

export interface VoiceOptions {
  readonly root: VoiceRoot;
  readonly lang: Lang;
  readonly read?: () => VoiceFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: VoicePanelState;
  readonly headingLevel?: 2 | 3;
}

/** Controls listed in the panel. The copied text holds more. */
export const VOICE_LISTED = 20;

const T = {
  title: { en: 'Say it to press it', fr: 'Le dire pour appuyer' },
  intro: {
    en: 'Voice control tools press a control when a person says its name, such as “click Send”. This counts the controls of this page that take extra steps by voice, and lets you try what you would say.',
    fr: 'Les outils de commande vocale appuient sur une commande quand on dit son nom, par exemple «\u202Fcliquer sur Envoyer\u202F». Ce panneau compte les commandes de cette page qui demandent des étapes de plus à la voix, et vous laisse essayer ce que vous diriez.',
  },
  kept: { en: 'This reads the page and changes nothing. Nothing is stored or sent.', fr: 'Ce panneau lit la page et ne change rien. Rien n’est enregistré ni envoyé.' },
  count: { en: 'Read the controls of this page', fr: 'Lire les commandes de cette page' },
  again: { en: 'Read the page again', fr: 'Relire la page' },
  counted: { en: 'The controls were read.', fr: 'Les commandes ont été lues.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What was found', fr: 'Ce qui a été trouvé' },
  hard: { en: 'Controls that take extra steps by voice', fr: 'Commandes qui demandent des étapes de plus à la voix' },
  tryH: { en: 'Try what you would say', fr: 'Essayer ce que vous diriez' },
  phrase: { en: 'What you would say', fr: 'Ce que vous diriez' },
  phraseHint: {
    en: 'For example Send, or click Send. Command words like click or tap are left out.',
    fr: 'Par exemple Envoyer, ou cliquer sur Envoyer. Les mots de commande comme cliquer ou appuyer sont laissés de côté.',
  },
  tryIt: { en: 'See what it reaches', fr: 'Voir ce que cela atteint' },
  limit: {
    en: 'Voice tools differ, and some match parts of names or show numbers on their own. These counts are about the names on the page, not about any one tool.',
    fr: 'Les outils vocaux diffèrent, et certains reconnaissent des parties de noms ou montrent des numéros d’eux-mêmes. Ces comptes portent sur les noms de la page, pas sur un outil en particulier.',
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const VOICE_CSS =
  '.voice{max-width:44rem}.voice h2,.voice h3,.voice h4{line-height:1.25}' +
  '.voice label{display:block;font-weight:600;margin-top:12px}' +
  '.voice .voice-field{display:block;width:100%;max-width:20rem;min-height:44px;box-sizing:border-box;font:inherit;padding:8px}' +
  '.voice button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.voice .voice-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.voice p,.voice li{overflow-wrap:anywhere}' +
  '.voice button:focus-visible,.voice input:focus-visible,.voice [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function voiceModelOf(s: VoicePanelState): VoiceModel | null {
  return s.facts ? buildVoice(s.facts) : null;
}

function resultHtml(s: VoicePanelState, lang: Lang, h: number): string {
  const m = voiceModelOf(s);
  if (!m) return '';
  const hard = m.outcomes.filter((o) => o.issues.length > 0);
  const shown = hard.slice(0, VOICE_LISTED);
  const more = hard.length - shown.length;
  const colon = lang === 'fr' ? `${NBSP}:` : ':';
  return (
    `<section aria-labelledby="voice-result-h"><h${h} id="voice-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    voiceSummary(m, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (shown.length === 0
      ? ''
      : `<h${h + 1} id="voice-hard-h">${tx('hard', lang)}</h${h + 1}><ul>` +
        shown.map((o) => `<li><strong>${escapeHtml(controlText(o.control, lang))}</strong>${colon} ${escapeHtml(o.issues.map((i) => issueText(o, i, lang)).join(' '))}</li>`).join('') +
        '</ul>' +
        (more > 0 ? `<p>${escapeHtml(lang === 'fr' ? `… et ${more} de plus, dans le texte copié.` : `… and ${more} more, in the copied text.`)}</p>` : '')) +
    `<h${h + 1} id="voice-try-h">${tx('tryH', lang)}</h${h + 1}>` +
    `<label for="voice-say">${tx('phrase', lang)}</label><p id="voice-say-hint">${tx('phraseHint', lang)}</p>` +
    `<input class="voice-field" type="text" id="voice-say" name="voice-say" value="${escapeHtml(s.phrase)}" autocomplete="off" spellcheck="false" aria-describedby="voice-say-hint">` +
    `<p class="voice-actions"><button type="button" data-action="voice-try">${tx('tryIt', lang)}</button></p>` +
    (s.said ? `<p id="voice-said">${escapeHtml(sayText(s.said, lang))}</p>` : '') +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="voice-actions"><button type="button" data-action="voice-copy">${tx('copy', lang)}</button> <button type="button" data-action="voice-count">${tx('again', lang)}</button></p></section>`
  );
}

export function renderVoicePanel(lang: Lang, s: VoicePanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="voice"><style>${VOICE_CSS}</style>` +
    `<h${h} id="voice-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    (s.facts ? '' : `<p class="voice-actions"><button type="button" data-action="voice-count">${tx('count', lang)}</button></p>`) +
    resultHtml(s, lang, h + 1) +
    '</div>'
  );
}

export type VoiceAction = 'voice-count' | 'voice-try';

export function isVoiceAction(action: string | null): action is VoiceAction {
  return action === 'voice-count' || action === 'voice-try';
}

export interface VoiceStep {
  readonly state: VoicePanelState;
  readonly focus: string;
}

/** What an action does. The state passed in already holds what is in the field. */
export function voiceStep(s: VoicePanelState, action: VoiceAction, lang: Lang, read: () => VoiceFacts): VoiceStep {
  if (action === 'voice-count') {
    try {
      const facts = read();
      return { state: { ...s, facts, said: s.said && s.phrase !== '' ? say(s.phrase, facts) : null, notice: T.counted[lang] }, focus: '#voice-result-h' };
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#voice-h' };
    }
  }
  if (!s.facts) return { state: s, focus: '' };
  const said = say(s.phrase, s.facts);
  // The answer is said in the live region too, so a person who stays in the field hears it.
  return { state: { ...s, said, notice: sayText(said, lang) }, focus: said.kind === 'empty' ? '#voice-say' : '[data-action="voice-try"]' };
}

/** The panel itself, so its own controls are not counted with the page. */
export const VOICE_EXCLUDE = '.voice';

export function mountVoicePanel(opts: VoiceOptions): { getState(): VoicePanelState } {
  const lang = opts.lang;
  const read = opts.read ?? ((): VoiceFacts => voiceInPage({ ...VOICE_ARGS, exclude: VOICE_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: VoicePanelState = opts.state ? { ...opts.state, notice: '' } : initialVoiceState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderVoicePanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };
  const readField = (): VoicePanelState => {
    const v = opts.root.querySelector?.('#voice-say')?.value;
    return v === undefined ? state : { ...state, phrase: v };
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'voice-copy') {
      state = readField();
      const m = voiceModelOf(state);
      if (!m) return;
      const text = voiceText(m, lang);
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="voice-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="voice-copy"]');
      })();
      return;
    }
    if (!isVoiceAction(action)) return;
    const step = voiceStep(readField(), action, lang, read);
    if (step.focus === '') return;
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => readField() };
}

export const voicePanel = { title: T.title, mount: mountVoicePanel } as const;
