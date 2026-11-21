import { escapeHtml } from './report.js';
import { buildSlips, pairText, slipAdvice, slipSummary, slipText, smallText, type SlipModel } from './slip.js';
import { SLIP_ARGS, slipInPage, type SlipFacts } from './slip-inpage.js';
import { NBSP, type Lang } from './types.js';

/**
 * "Slips onto risky controls": a panel that finds where a tap aimed at one
 * control of this page may land on another that does something hard to take
 * back. It uses the person's own tap size when they took the tap test above,
 * and the App's 44 pixel minimum when they did not.
 *
 * It reads the page and changes nothing. Every control is at least 44 CSS
 * pixels each way. Nothing is stored or sent.
 */

export interface SlipRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface SlipPanelState {
  readonly facts: SlipFacts | null;
  /** The tap size used at the last reading, or null when the tap test was not taken. */
  readonly tapPx: number | null;
  readonly notice: string;
}

export const initialSlipState = (): SlipPanelState => ({ facts: null, tapPx: null, notice: '' });

export interface SlipOptions {
  readonly root: SlipRoot;
  readonly lang: Lang;
  readonly read?: () => SlipFacts;
  /** The person's tap size from the tap test, or null when it was not taken. Read at each reading. */
  readonly tapSize?: () => number | null;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: SlipPanelState;
  readonly headingLevel?: 2 | 3;
}

/** Places listed in the panel. The copied text holds more. */
export const SLIP_LISTED = 20;

const T = {
  title: { en: 'Slips onto risky controls', fr: 'Glissements vers des commandes à risque' },
  intro: {
    en: 'Finds where a tap aimed at one control of this page may land on another that does something hard to take back, such as delete, cancel or send. It uses your tap size from the tap test above, or the App’s 44 pixel minimum when you have not taken it.',
    fr: 'Trouve où un toucher visant une commande de cette page peut tomber sur une autre qui fait une action difficile à défaire, comme supprimer, annuler ou envoyer. Le panneau utilise votre taille de toucher du test plus haut, ou le minimum de 44\u00A0pixels de l’App si vous ne l’avez pas fait.',
  },
  kept: { en: 'This reads the page and changes nothing. Nothing is stored or sent.', fr: 'Ce panneau lit la page et ne change rien. Rien n’est enregistré ni envoyé.' },
  read: { en: 'Find the slips on this page', fr: 'Trouver les glissements de cette page' },
  again: { en: 'Read the page again', fr: 'Relire la page' },
  done: { en: 'The page was read.', fr: 'La page a été lue.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What was found', fr: 'Ce qui a été trouvé' },
  pairs: { en: 'Where a tap may land on a risky control', fr: 'Où un toucher peut tomber sur une commande à risque' },
  small: { en: 'Risky controls smaller than the tap size', fr: 'Commandes à risque plus petites que la taille de toucher' },
  limit: {
    en: 'These counts are about where the controls sit at this window size. They do not say how often anyone slips, and the words that make a control risky are a short list.',
    fr: 'Ces comptes portent sur la place des commandes à cette taille de fenêtre. Ils ne disent pas à quelle fréquence quelqu’un glisse, et les mots qui rendent une commande à risque forment une liste courte.',
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const SLIP_CSS =
  '.slip{max-width:44rem}.slip h2,.slip h3,.slip h4{line-height:1.25}' +
  '.slip button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.slip .slip-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.slip p,.slip li{overflow-wrap:anywhere}' +
  '.slip button:focus-visible,.slip [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function slipModelOf(s: SlipPanelState): SlipModel | null {
  return s.facts ? buildSlips(s.facts, s.tapPx) : null;
}

const more = (n: number, lang: Lang): string => (n > 0 ? `<p>${escapeHtml(lang === 'fr' ? `… et ${n} de plus, dans le texte copié.` : `… and ${n} more, in the copied text.`)}</p>` : '');

function resultHtml(s: SlipPanelState, lang: Lang, h: number): string {
  const m = slipModelOf(s);
  if (!m) return '';
  const pairs = m.pairs.slice(0, SLIP_LISTED);
  const small = m.smallRisky.slice(0, SLIP_LISTED);
  return (
    `<section aria-labelledby="slip-result-h"><h${h} id="slip-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    slipSummary(m, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (pairs.length === 0
      ? ''
      : `<h${h + 1} id="slip-pairs-h">${tx('pairs', lang)}</h${h + 1}><ul>${pairs.map((p) => `<li>${escapeHtml(pairText(p, lang))}</li>`).join('')}</ul>${more(m.pairs.length - pairs.length, lang)}`) +
    (small.length === 0
      ? ''
      : `<h${h + 1} id="slip-small-h">${tx('small', lang)}</h${h + 1}><ul>${small.map((c) => `<li>${escapeHtml(smallText(c, m.tap, lang))}</li>`).join('')}</ul>${more(m.smallRisky.length - small.length, lang)}`) +
    slipAdvice(m, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="slip-actions"><button type="button" data-action="slip-copy">${tx('copy', lang)}</button> <button type="button" data-action="slip-read">${tx('again', lang)}</button></p></section>`
  );
}

export function renderSlipPanel(lang: Lang, s: SlipPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="slip"><style>${SLIP_CSS}</style>` +
    `<h${h} id="slip-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    (s.facts ? '' : `<p class="slip-actions"><button type="button" data-action="slip-read">${tx('read', lang)}</button></p>`) +
    resultHtml(s, lang, h + 1) +
    '</div>'
  );
}

export interface SlipStep {
  readonly state: SlipPanelState;
  readonly focus: string;
}

/** Reading: the page and the tap size as they are now. */
export function slipStep(s: SlipPanelState, lang: Lang, read: () => SlipFacts, tapSize: () => number | null): SlipStep {
  try {
    return { state: { facts: read(), tapPx: tapSize(), notice: T.done[lang] }, focus: '#slip-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#slip-h' };
  }
}

/** The panel itself, so its own buttons are not counted with the page. */
export const SLIP_EXCLUDE = '.slip';

export function mountSlipPanel(opts: SlipOptions): { getState(): SlipPanelState } {
  const lang = opts.lang;
  const read = opts.read ?? ((): SlipFacts => slipInPage({ ...SLIP_ARGS, exclude: SLIP_EXCLUDE }));
  const tapSize = opts.tapSize ?? ((): number | null => null);
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: SlipPanelState = opts.state ? { ...opts.state, notice: '' } : initialSlipState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderSlipPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'slip-read') {
      const step = slipStep(state, lang, read, tapSize);
      state = step.state;
      render(step.focus);
      return;
    }
    if (action !== 'slip-copy') return;
    const m = slipModelOf(state);
    if (!m) return;
    if (!hasClipboard) {
      state = { ...state, notice: T.noClipboard[lang] };
      render('[data-action="slip-copy"]');
      return;
    }
    void (async (): Promise<void> => {
      try {
        await copy(slipText(m, lang));
        state = { ...state, notice: T.copied[lang] };
      } catch {
        state = { ...state, notice: T.copyFailed[lang] };
      }
      render('[data-action="slip-copy"]');
    })();
  });
  render();
  return { getState: () => state };
}

export const slipPanel = { title: T.title, mount: mountSlipPanel } as const;
