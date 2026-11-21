import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { PRACTICE, emptyRun, fieldResults, paceOf, paceSummary, pageNotes, recordChange, takesBack, typingNote, type FieldRun, type PageTyping } from './typing-trial.js';
import { TYPING_ARGS, pageTypingOf, typingRawInPage } from './typing-inpage.js';

/**
 * "My typing pace": the person types three short practice items the way they
 * usually do; the panel measures their pace and sets the text fields of this
 * page against any time limit the page states. The fields are not re-drawn
 * while the person types, so focus and what they typed stay put.
 *
 * Every control is at least 44 CSS pixels each way. Nothing typed leaves the
 * panel, and nothing is stored or sent.
 */

export interface TypingEvent {
  readonly type: string;
  readonly target: unknown;
  readonly timeStamp?: number;
  readonly inputType?: string;
}

export interface TypingRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: TypingEvent) => void): void;
  querySelector?(selector: string): { focus?(): void; textContent?: string | null } | null;
}

export interface TypingPanelState {
  readonly phase: 'idle' | 'running' | 'done';
  readonly runs: readonly FieldRun[];
  readonly page: PageTyping | null;
  readonly notice: string;
}

export const initialTypingState = (): TypingPanelState => ({ phase: 'idle', runs: PRACTICE.map(() => emptyRun()), page: null, notice: '' });

export interface TypingOptions {
  readonly root: TypingRoot;
  readonly lang: Lang;
  readonly read?: () => PageTyping;
  readonly copy?: (text: string) => Promise<void>;
  readonly now?: () => number;
  readonly state?: TypingPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'My typing pace', fr: 'Mon rythme de saisie' },
  intro: {
    en: 'Type three short things the way you usually do: with a keyboard, an on-screen keyboard, a mouth stick, switch scanning or dictation. The panel measures your pace and sets the text fields of this page against any time limit the page states.',
    fr: 'Tapez trois courtes choses comme d’habitude${NBSP}: au clavier, avec un clavier à l’écran, une baguette buccale, un balayage par contacteur ou la dictée. Le panneau mesure votre rythme et compare les champs de texte de cette page à toute limite de temps qu’elle indique.'.replace('${NBSP}', '\u00A0'),
  },
  kept: { en: 'There is no time limit here. What you type stays in the panel; nothing is stored or sent.', fr: 'Il n’y a pas de limite de temps ici. Ce que vous tapez reste dans le panneau${NBSP}; rien n’est enregistré ni envoyé.'.replace('${NBSP}', '\u202F') },
  start: { en: 'Start the typing practice', fr: 'Commencer l’essai de saisie' },
  started: { en: 'The practice has started. Focus is on the first field.', fr: 'L’essai a commencé. Le focus est sur le premier champ.' },
  practice: { en: 'Practice', fr: 'Essai' },
  type: { en: 'Type:', fr: 'Tapez\u00A0:' },
  done: { en: 'I have finished', fr: 'J’ai terminé' },
  stop: { en: 'Stop the practice', fr: 'Arrêter l’essai' },
  doneNotice: { en: 'The practice is over. The result follows.', fr: 'L’essai est terminé. Le résultat suit.' },
  result: { en: 'Your typing pace', fr: 'Votre rythme de saisie' },
  page: { en: 'This page', fr: 'Cette page' },
  limit: {
    en: 'These times come from three short tries on this screen, today. They say nothing about you, and the time for the page is an estimate.',
    fr: 'Ces temps viennent de trois courts essais sur cet écran, aujourd’hui. Ils ne disent rien de vous, et le temps pour la page est une estimation.',
  },
  again: { en: 'Do the practice again', fr: 'Refaire l’essai' },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const TYPING_CSS =
  '.typing{max-width:44rem}.typing h2,.typing h3,.typing h4{line-height:1.25}' +
  '.typing label{display:block;font-weight:600;margin-top:12px}' +
  '.typing .typing-field{display:block;width:100%;max-width:20rem;min-height:44px;box-sizing:border-box;font:inherit;padding:8px}' +
  '.typing button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.typing .typing-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.typing p,.typing li{overflow-wrap:anywhere}' +
  '.typing button:focus-visible,.typing input:focus-visible,.typing [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

const fieldId = (i: number): string => `typing-field-${PRACTICE[i]?.id ?? i}`;

function runningHtml(s: TypingPanelState, lang: Lang, h: number): string {
  const fields = PRACTICE.map((item, i) => {
    const id = fieldId(i);
    return (
      `<label for="${id}">${escapeHtml(item.label[lang])}</label>` +
      `<p id="${id}-what">${tx('type', lang)} <strong>${escapeHtml(item.text[lang])}</strong></p>` +
      `<input class="typing-field" type="text" id="${id}" name="${id}" value="${escapeHtml(s.runs[i]?.value ?? '')}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="${id}-what" data-typing="${i}">`
    );
  }).join('');
  return (
    `<section aria-labelledby="typing-run-h"><h${h} id="typing-run-h" tabindex="-1">${tx('practice', lang)}</h${h}>` +
    fields +
    `<p class="typing-actions"><button type="button" data-action="typing-done">${tx('done', lang)}</button> <button type="button" data-action="typing-stop">${tx('stop', lang)}</button></p></section>`
  );
}

export function typingResultText(s: TypingPanelState, lang: Lang): string {
  const fr = lang === 'fr';
  const pace = paceOf(fieldResults(s.runs, lang));
  const lines = [fr ? 'Mon rythme de saisie' : 'My typing pace', ...paceSummary(pace, lang)];
  if (s.page) lines.push(...pageNotes(pace, s.page, lang).map((n) => n.text));
  lines.push(T.limit[lang]);
  return `${lines.join('\n')}\n`;
}

function resultHtml(s: TypingPanelState, lang: Lang, h: number): string {
  const pace = paceOf(fieldResults(s.runs, lang));
  const notes = s.page ? pageNotes(pace, s.page, lang) : [];
  return (
    `<section aria-labelledby="typing-result-h"><h${h} id="typing-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    paceSummary(pace, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (notes.length === 0 ? '' : `<h${h + 1} id="typing-page-h">${tx('page', lang)}</h${h + 1}>${notes.map((n) => `<p>${escapeHtml(n.text)}</p>`).join('')}`) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="typing-actions"><button type="button" data-action="typing-copy">${tx('copy', lang)}</button> <button type="button" data-action="typing-again">${tx('again', lang)}</button></p></section>`
  );
}

export function renderTypingPanel(lang: Lang, s: TypingPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="typing"><style>${TYPING_CSS}</style>` +
    `<h${h} id="typing-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    (s.phase === 'idle' ? `<p class="typing-actions"><button type="button" data-action="typing-start">${tx('start', lang)}</button></p>` : '') +
    (s.phase === 'running' ? runningHtml(s, lang, h + 1) : '') +
    (s.phase === 'done' ? resultHtml(s, lang, h + 1) : '') +
    '</div>'
  );
}

/** Which practice field an event came from, or null. */
export function fieldIndexOf(target: unknown): number | null {
  const t = target as { getAttribute?(n: string): string | null } | null;
  const v = t?.getAttribute?.('data-typing');
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < PRACTICE.length ? n : null;
}

/** What one input event does to the practice. */
export function typingInput(s: TypingPanelState, e: TypingEvent, now: () => number): TypingPanelState {
  if (s.phase !== 'running' || e.type !== 'input') return s;
  const i = fieldIndexOf(e.target);
  if (i === null) return s;
  const value = (e.target as { value?: string }).value ?? '';
  const at = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : now();
  const runs = s.runs.map((r, j) => (j === i ? recordChange(r, at, takesBack(e.inputType), value) : r));
  return { ...s, runs };
}

export type TypingAction = 'typing-start' | 'typing-again' | 'typing-done' | 'typing-stop';

export function isTypingAction(a: string | null): a is TypingAction {
  return a === 'typing-start' || a === 'typing-again' || a === 'typing-done' || a === 'typing-stop';
}

export interface TypingStep {
  readonly state: TypingPanelState;
  readonly focus: string;
}

export function typingStep(s: TypingPanelState, action: TypingAction, lang: Lang, read: () => PageTyping): TypingStep {
  if (action === 'typing-start' || action === 'typing-again') {
    return { state: { ...initialTypingState(), phase: 'running', notice: T.started[lang] }, focus: `#${fieldId(0)}` };
  }
  if (s.phase !== 'running') return { state: s, focus: '' };
  try {
    return { state: { ...s, phase: 'done', page: read(), notice: T.doneNotice[lang] }, focus: '#typing-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...s, phase: 'done', page: null, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#typing-result-h' };
  }
}

/** One line for the summary of what the person measured, or nothing before a practice is over. */
export function typingNoteOf(s: TypingPanelState, lang: Lang): string {
  return s.phase === 'done' ? typingNote(paceOf(fieldResults(s.runs, lang)), lang) : '';
}

/** The panel itself, so its own practice fields are not counted with the page. */
export const TYPING_EXCLUDE = '.typing';

export function mountTypingPanel(opts: TypingOptions): { getState(): TypingPanelState; note(): string } {
  const lang = opts.lang;
  const read = opts.read ?? ((): PageTyping => pageTypingOf(typingRawInPage({ ...TYPING_ARGS, exclude: TYPING_EXCLUDE })));
  const now = opts.now ?? ((): number => (globalThis as unknown as { performance?: { now(): number } }).performance?.now() ?? Date.now());
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  // A practice that was running when the language changed starts over: its fields are drawn again.
  let state: TypingPanelState = opts.state ? (opts.state.phase === 'running' ? initialTypingState() : { ...opts.state, notice: '' }) : initialTypingState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderTypingPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  // Typing changes the state only: the fields are not re-drawn, so focus and the caret stay where they are.
  opts.root.addEventListener('input', (e) => {
    state = typingInput(state, e, now);
  });

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'typing-copy') {
      if (state.phase !== 'done') return;
      const text = typingResultText(state, lang);
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="typing-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="typing-copy"]');
      })();
      return;
    }
    if (!isTypingAction(action)) return;
    const step = typingStep(state, action, lang, read);
    if (step.focus === '') return;
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => state, note: () => typingNoteOf(state, lang) };
}

export const typingPanel = { title: T.title, mount: mountTypingPanel } as const;
