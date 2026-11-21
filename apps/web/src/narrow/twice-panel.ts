import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { TWICE_ARGS, twiceInPage, type TwiceFacts } from './twice-inpage.js';
import { buildTwice, twiceAdvice, twiceFindingText, twiceNote, twiceSummary, type TwiceModel } from './twice.js';

/**
 * "Asked twice": reads the forms of this page for things asked for twice
 * (WCAG 3.3.7): a field to confirm, the same autocomplete token twice, two
 * addresses with no box to reuse the first, the same label twice. A password
 * asked twice is said apart, since the rules allow it for security.
 *
 * Every control is at least 44 CSS pixels each way. The page is read, never
 * changed, and nothing is stored or sent.
 */

export interface TwiceRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface TwicePanelState {
  readonly facts: TwiceFacts | null;
  readonly notice: string;
}

export const initialTwiceState = (): TwicePanelState => ({ facts: null, notice: '' });

export interface TwiceOptions {
  readonly root: TwiceRoot;
  readonly lang: Lang;
  readonly read?: () => TwiceFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: TwicePanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'Asked twice', fr: 'Demandé deux fois' },
  intro: {
    en: 'Typing the same answer again costs a lot when you type slowly, with a mouth stick, a switch, eye gaze or dictation. The panel reads the forms of this page for things asked for twice.',
    fr: 'Retaper la même réponse coûte cher quand on tape lentement, avec une baguette buccale, un contacteur, le regard ou la dictée. Le panneau lit les formulaires de cette page pour trouver ce qui est demandé deux fois.',
  },
  kept: { en: 'The page is read, never changed. Nothing is typed, stored or sent.', fr: 'La page est lue, jamais modifiée. Rien n’est tapé, enregistré ni envoyé.' },
  read: { en: 'Find what is asked twice', fr: 'Trouver ce qui est demandé deux fois' },
  readAgain: { en: 'Read again', fr: 'Relire' },
  readDone: { en: 'The page was read.', fr: 'La page a été lue.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'Forms on this page', fr: 'Formulaires de cette page' },
  found: { en: 'Asked for again', fr: 'Demandé de nouveau' },
  help: { en: 'What may help the team', fr: 'Ce qui peut aider l’équipe' },
  limit: {
    en: 'Two fields are matched by their labels, types and autocomplete tokens. Whether they really ask for the same thing stays to be tried, and a form a script builds later is not seen.',
    fr: 'Deux champs sont rapprochés par leurs étiquettes, leurs types et leurs jetons autocomplete. Il reste à essayer s’ils demandent vraiment la même chose, et un formulaire qu’un script construit plus tard n’est pas vu.',
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const TWICE_CSS =
  '.twice{max-width:44rem}.twice h2,.twice h3,.twice h4,.twice h5{line-height:1.25}' +
  '.twice button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.twice .twice-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}' +
  '.twice p,.twice li{overflow-wrap:anywhere}' +
  '.twice button:focus-visible,.twice [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function twiceModelOf(s: TwicePanelState): TwiceModel | null {
  return s.facts ? buildTwice(s.facts) : null;
}

function resultHtml(m: TwiceModel, lang: Lang, h: number): string {
  const advice = twiceAdvice(m, lang);
  return (
    `<h${h} id="twice-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    twiceSummary(m, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (m.findings.length === 0 ? '' : `<h${h + 1} id="twice-found-h">${tx('found', lang)}</h${h + 1}><ul aria-labelledby="twice-found-h">${m.findings.map((f) => `<li>${escapeHtml(twiceFindingText(f, lang))}</li>`).join('')}</ul>`) +
    (advice.length === 0 ? '' : `<h${h + 1} id="twice-help-h">${tx('help', lang)}</h${h + 1}><ul aria-labelledby="twice-help-h">${advice.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="twice-actions"><button type="button" data-action="twice-copy">${tx('copy', lang)}</button></p>`
  );
}

export function renderTwicePanel(lang: Lang, s: TwicePanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  const m = twiceModelOf(s);
  return (
    `<div class="twice"><style>${TWICE_CSS}</style>` +
    `<h${h} id="twice-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    `<p class="twice-actions"><button type="button" data-action="twice-read">${tx(m ? 'readAgain' : 'read', lang)}</button></p>` +
    (m ? `<section aria-labelledby="twice-result-h">${resultHtml(m, lang, h + 1)}</section>` : '') +
    '</div>'
  );
}

/** The result as plain text. */
export function twiceResultText(s: TwicePanelState, lang: Lang): string {
  const m = twiceModelOf(s);
  const lines: string[] = [T.title[lang]];
  if (m) {
    lines.push(...twiceSummary(m, lang), ...m.findings.map((f) => `- ${twiceFindingText(f, lang)}`));
    const advice = twiceAdvice(m, lang);
    if (advice.length > 0) lines.push('', `${T.help[lang]}${lang === 'fr' ? `${NBSP}:` : ':'}`, ...advice.map((a) => `- ${a}`));
  }
  lines.push('', T.limit[lang]);
  return `${lines.join('\n')}\n`;
}

export interface TwiceStep {
  readonly state: TwicePanelState;
  readonly focus: string;
}

export function twiceStep(s: TwicePanelState, lang: Lang, read: () => TwiceFacts): TwiceStep {
  try {
    return { state: { facts: read(), notice: T.readDone[lang] }, focus: '#twice-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '[data-action="twice-read"]' };
  }
}

/** One line for the barrier text, when the page asks for something twice. */
export function twiceNoteOf(s: TwicePanelState, lang: Lang): string {
  return twiceNote(twiceModelOf(s), lang);
}

/** The panel itself, so nothing of it is read with the page. */
export const TWICE_EXCLUDE = '.twice';

export function mountTwicePanel(opts: TwiceOptions): { getState(): TwicePanelState; note(): string } {
  const lang = opts.lang;
  const read = opts.read ?? ((): TwiceFacts => twiceInPage({ ...TWICE_ARGS, exclude: TWICE_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: TwicePanelState = opts.state ? { ...opts.state, notice: '' } : initialTwiceState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderTwicePanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'twice-read') {
      const step = twiceStep(state, lang, read);
      state = step.state;
      render(step.focus);
      return;
    }
    if (action !== 'twice-copy' || !state.facts) return;
    const text = twiceResultText(state, lang);
    if (!hasClipboard) {
      state = { ...state, notice: T.noClipboard[lang] };
      render('[data-action="twice-copy"]');
      return;
    }
    void (async (): Promise<void> => {
      try {
        await copy(text);
        state = { ...state, notice: T.copied[lang] };
      } catch {
        state = { ...state, notice: T.copyFailed[lang] };
      }
      render('[data-action="twice-copy"]');
    })();
  });
  render();
  return { getState: () => state, note: () => twiceNoteOf(state, lang) };
}

export const twicePanel = { title: T.title, mount: mountTwicePanel } as const;
