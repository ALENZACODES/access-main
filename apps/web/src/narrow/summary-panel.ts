import { PART_TITLES, SUMMARY_PARTS, notDoneText, requestText, summaryItems, summaryStatus, accessSummaryText, type SummaryItem, type SummaryLines, type SummaryPart } from './access-summary.js';
import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';

/**
 * "My access summary": the panel that brings together, on request, what the
 * person measured in the other panels of this page, and gives it as text to
 * copy, with a short request they may send with it. A part not done yet is
 * UNKNOWN, with a button that takes focus to the test.
 *
 * It reads only what the other panels hold now. Every control is at least 44
 * CSS pixels each way. Nothing is stored or sent.
 */

export interface SummaryRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface SummaryPanelState {
  /** What the other panels gave at the last gathering, or null before the first. */
  readonly lines: SummaryLines | null;
  /** When it was gathered. */
  readonly when: Date | null;
  readonly notice: string;
}

export const initialSummaryState = (): SummaryPanelState => ({ lines: null, when: null, notice: '' });

export interface SummaryOptions {
  readonly root: SummaryRoot;
  readonly lang: Lang;
  /** What the other panels hold now. */
  readonly collect: () => SummaryLines;
  /** Takes focus to the test of a part. Without it, the buttons to go there are left out. */
  readonly go?: (part: SummaryPart) => void;
  readonly copy?: (text: string) => Promise<void>;
  readonly now?: () => Date;
  readonly state?: SummaryPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'My access summary', fr: 'Mon résumé d’accès' },
  intro: {
    en: 'Brings together what you measured in the panels above, to share with a site or a service when you ask for a change. You choose what to send, and to whom.',
    fr: 'Rassemble ce que vous avez mesuré dans les panneaux plus haut, pour le transmettre à un site ou à un service quand vous demandez un changement. Vous choisissez quoi envoyer, et à qui.',
  },
  kept: { en: 'Nothing is stored or sent. The summary is made again each time you ask.', fr: 'Rien n’est enregistré ni envoyé. Le résumé est refait chaque fois que vous le demandez.' },
  make: { en: 'Make my summary', fr: 'Faire mon résumé' },
  again: { en: 'Make it again', fr: 'Le refaire' },
  made: { en: 'The summary was made.', fr: 'Le résumé a été fait.' },
  failed: { en: 'The summary could not be made', fr: 'Le résumé n’a pas pu être fait' },
  result: { en: 'Your summary', fr: 'Votre résumé' },
  textLabel: { en: 'Summary to share', fr: 'Résumé à transmettre' },
  textHint: { en: 'You can select this text and copy it by hand.', fr: 'Vous pouvez sélectionner ce texte et le copier à la main.' },
  requestH: { en: 'A request you may send with it', fr: 'Une demande à envoyer avec, si vous le voulez' },
  requestLabel: { en: 'Request', fr: 'Demande' },
  limit: {
    en: 'The summary holds only what was measured on this screen. It says nothing about your health, and it is yours to change before sending.',
    fr: 'Le résumé ne contient que ce qui a été mesuré sur cet écran. Il ne dit rien de votre santé, et vous pouvez le modifier avant de l’envoyer.',
  },
  copy: { en: 'Copy the summary', fr: 'Copier le résumé' },
  copyRequest: { en: 'Copy the summary and the request', fr: 'Copier le résumé et la demande' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const SUMMARY_CSS =
  '.summary{max-width:44rem}.summary h2,.summary h3,.summary h4{line-height:1.25}' +
  '.summary label{display:block;font-weight:600;margin-top:12px}' +
  '.summary textarea{display:block;width:100%;min-height:8rem;box-sizing:border-box;font:inherit;padding:8px}' +
  '.summary button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.summary .summary-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.summary dt{font-weight:600;margin-top:8px}.summary dd{margin:0 0 4px 0}' +
  '.summary p,.summary dd{overflow-wrap:anywhere}' +
  '.summary button:focus-visible,.summary textarea:focus-visible,.summary [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

const GO: Readonly<Record<SummaryPart, { readonly en: string; readonly fr: string }>> = {
  tap: { en: 'Go to the tap test', fr: 'Aller au test des touchers' },
  zones: { en: 'Go to the zones test', fr: 'Aller au test des zones' },
  press: { en: 'Go to the press test', fr: 'Aller au test d’appui' },
};

/** The words of a go button: the test it leads to, short and without the word button. */
export function goText(i: SummaryItem, lang: Lang): string {
  return GO[i.part][lang];
}

export function summaryItemsOf(s: SummaryPanelState, lang: Lang): SummaryItem[] | null {
  return s.lines ? summaryItems(s.lines, lang) : null;
}

function resultHtml(s: SummaryPanelState, lang: Lang, h: number, canGo: boolean): string {
  const items = summaryItemsOf(s, lang);
  if (!items) return '';
  const text = accessSummaryText(items, lang, s.when);
  const request = requestText(items, lang);
  return (
    `<section aria-labelledby="summary-result-h"><h${h} id="summary-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    `<p>${escapeHtml(summaryStatus(items, lang))}</p>` +
    '<dl>' +
    items
      .map(
        (i) =>
          `<dt>${escapeHtml(i.title)}</dt><dd>${escapeHtml(i.line ?? notDoneText(lang))}` +
          // Each button names its test, so no two buttons share a name (by voice, a shared name takes an extra step).
          (i.line === null && canGo ? ` <button type="button" data-action="summary-go-${i.part}">${escapeHtml(goText(i, lang))}</button>` : '') +
          '</dd>',
      )
      .join('') +
    '</dl>' +
    `<label for="summary-text">${tx('textLabel', lang)}</label><p id="summary-text-hint">${tx('textHint', lang)}</p>` +
    `<textarea id="summary-text" readonly rows="8" aria-describedby="summary-text-hint">${escapeHtml(text)}</textarea>` +
    (request === ''
      ? ''
      : `<h${h + 1} id="summary-request-h">${tx('requestH', lang)}</h${h + 1}><label for="summary-request">${tx('requestLabel', lang)}</label>` +
        `<textarea id="summary-request" readonly rows="4">${escapeHtml(request)}</textarea>`) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="summary-actions"><button type="button" data-action="summary-copy">${tx('copy', lang)}</button>` +
    (request === '' ? '' : ` <button type="button" data-action="summary-copy-request">${tx('copyRequest', lang)}</button>`) +
    ` <button type="button" data-action="summary-make">${tx('again', lang)}</button></p></section>`
  );
}

export function renderSummaryPanel(lang: Lang, s: SummaryPanelState, headingLevel: 2 | 3 = 2, canGo = true): string {
  const h = headingLevel;
  return (
    `<div class="summary"><style>${SUMMARY_CSS}</style>` +
    `<h${h} id="summary-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    (s.lines ? '' : `<p class="summary-actions"><button type="button" data-action="summary-make">${tx('make', lang)}</button></p>`) +
    resultHtml(s, lang, h + 1, canGo) +
    '</div>'
  );
}

/** The part of a go action, or null for another action. */
export function goPartOf(action: string | null): SummaryPart | null {
  const m = /^summary-go-([a-z]+)$/.exec(action ?? '');
  const p = m?.[1] ?? '';
  return (SUMMARY_PARTS as readonly string[]).includes(p) ? (p as SummaryPart) : null;
}

export interface SummaryStep {
  readonly state: SummaryPanelState;
  readonly focus: string;
}

/** Making the summary: gathers what the other panels hold, says so and puts focus on it. */
export function summaryStep(s: SummaryPanelState, lang: Lang, collect: () => SummaryLines, now: () => Date): SummaryStep {
  try {
    return { state: { lines: collect(), when: now(), notice: T.made[lang] }, focus: '#summary-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#summary-h' };
  }
}

export function mountSummaryPanel(opts: SummaryOptions): { getState(): SummaryPanelState } {
  const lang = opts.lang;
  const now = opts.now ?? ((): Date => new Date());
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: SummaryPanelState = opts.state ? { ...opts.state, notice: '' } : initialSummaryState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderSummaryPanel(lang, state, opts.headingLevel ?? 2, opts.go !== undefined);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  const copyText = (text: string, focus: string): void => {
    if (!hasClipboard) {
      state = { ...state, notice: T.noClipboard[lang] };
      render(focus);
      return;
    }
    void (async (): Promise<void> => {
      try {
        await copy(text);
        state = { ...state, notice: T.copied[lang] };
      } catch {
        state = { ...state, notice: T.copyFailed[lang] };
      }
      render(focus);
    })();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'summary-make') {
      const step = summaryStep(state, lang, opts.collect, now);
      state = step.state;
      render(step.focus);
      return;
    }
    const part = goPartOf(action);
    if (part !== null) {
      opts.go?.(part);
      return;
    }
    const items = summaryItemsOf(state, lang);
    if (!items) return;
    if (action === 'summary-copy') copyText(accessSummaryText(items, lang, state.when), '[data-action="summary-copy"]');
    if (action === 'summary-copy-request') {
      const request = requestText(items, lang);
      if (request !== '') copyText(`${request}\n\n${accessSummaryText(items, lang, state.when)}`, '[data-action="summary-copy-request"]');
    }
  });
  render();
  return { getState: () => state };
}

/** The heading each part's test starts with on this page, for the go buttons. */
export const PART_HEADINGS: Readonly<Record<SummaryPart, string>> = { tap: '#tap-h', zones: '#zones-h', press: '#press-h' };

export const summaryPanel = { title: T.title, mount: mountSummaryPanel, parts: PART_TITLES } as const;
