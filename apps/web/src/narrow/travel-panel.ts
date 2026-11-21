import { escapeHtml } from './report.js';
import { buildTravel, formLines, formName, formNotes, travelSummary, travelText, type TravelModel } from './travel.js';
import { TRAVEL_ARGS, travelInPage, type TravelFacts } from './travel-inpage.js';
import { NBSP, type Lang } from './types.js';

/**
 * "Pointer travel": a panel for people who move a pointer with their head,
 * their eyes, a mouth stick or a trackball. For each form of this page it
 * counts how far the pointer travels from each control to the next, how
 * often it goes back the other way, and how far the send button is.
 *
 * It reads the page and changes nothing. Every control is at least 44 CSS
 * pixels each way. Nothing is stored or sent.
 */

export interface TravelRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface TravelPanelState {
  readonly facts: TravelFacts | null;
  readonly notice: string;
}

export const initialTravelState = (): TravelPanelState => ({ facts: null, notice: '' });

export interface TravelOptions {
  readonly root: TravelRoot;
  readonly lang: Lang;
  readonly read?: () => TravelFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: TravelPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'Pointer travel', fr: 'Déplacement du pointeur' },
  intro: {
    en: 'For people who move a pointer with their head, their eyes, a mouth stick or a trackball, every move counts. For each form of this page, this counts how far the pointer travels from each control to the next, how often it goes back the other way, and how far the send button is.',
    fr: 'Pour les personnes qui déplacent un pointeur avec la tête, les yeux, une baguette buccale ou une boule de commande, chaque déplacement compte. Pour chaque formulaire de cette page, ce panneau compte la distance parcourue d’une commande à la suivante, les retours en arrière et la distance jusqu’au bouton d’envoi.',
  },
  kept: { en: 'This reads the page and changes nothing. Nothing is stored or sent.', fr: 'Ce panneau lit la page et ne change rien. Rien n’est enregistré ni envoyé.' },
  read: { en: 'Count the pointer travel', fr: 'Compter le déplacement du pointeur' },
  again: { en: 'Count again', fr: 'Compter de nouveau' },
  done: { en: 'The forms were counted.', fr: 'Les formulaires ont été comptés.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What was counted', fr: 'Ce qui a été compté' },
  limit: {
    en: 'These distances go from the centre of one control to the centre of the next, at this window size. They measure the layout, not anyone’s effort.',
    fr: 'Ces distances vont du centre d’une commande au centre de la suivante, à cette taille de fenêtre. Elles mesurent la mise en page, pas l’effort de qui que ce soit.',
  },
  copy: { en: 'Copy the counts', fr: 'Copier les comptes' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const TRAVEL_CSS =
  '.travel{max-width:44rem}.travel h2,.travel h3,.travel h4{line-height:1.25}' +
  '.travel button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.travel .travel-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.travel p,.travel li{overflow-wrap:anywhere}' +
  '.travel button:focus-visible,.travel [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function travelModelOf(s: TravelPanelState): TravelModel | null {
  return s.facts ? buildTravel(s.facts) : null;
}

function resultHtml(s: TravelPanelState, lang: Lang, h: number): string {
  const m = travelModelOf(s);
  if (!m) return '';
  return (
    `<section aria-labelledby="travel-result-h"><h${h} id="travel-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    travelSummary(m, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    m.forms
      .map((f, i) => {
        const notes = formNotes(f, m.width, lang);
        return (
          `<h${h + 1} id="travel-form-${i}">${escapeHtml(formName(f, lang))}</h${h + 1}>` +
          formLines(f, m.width, lang)
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join('') +
          (notes.length === 0 ? '' : `<ul>${notes.map((n) => `<li>${escapeHtml(n.text)}</li>`).join('')}</ul>`)
        );
      })
      .join('') +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="travel-actions"><button type="button" data-action="travel-copy">${tx('copy', lang)}</button> <button type="button" data-action="travel-read">${tx('again', lang)}</button></p></section>`
  );
}

export function renderTravelPanel(lang: Lang, s: TravelPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="travel"><style>${TRAVEL_CSS}</style>` +
    `<h${h} id="travel-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    (s.facts ? '' : `<p class="travel-actions"><button type="button" data-action="travel-read">${tx('read', lang)}</button></p>`) +
    resultHtml(s, lang, h + 1) +
    '</div>'
  );
}

export interface TravelStep {
  readonly state: TravelPanelState;
  readonly focus: string;
}

export function travelStep(s: TravelPanelState, lang: Lang, read: () => TravelFacts): TravelStep {
  try {
    return { state: { facts: read(), notice: T.done[lang] }, focus: '#travel-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#travel-h' };
  }
}

/** The panel itself, so its own buttons are not counted with the page. */
export const TRAVEL_EXCLUDE = '.travel';

export function mountTravelPanel(opts: TravelOptions): { getState(): TravelPanelState } {
  const lang = opts.lang;
  const read = opts.read ?? ((): TravelFacts => travelInPage({ ...TRAVEL_ARGS, exclude: TRAVEL_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: TravelPanelState = opts.state ? { ...opts.state, notice: '' } : initialTravelState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderTravelPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'travel-read') {
      const step = travelStep(state, lang, read);
      state = step.state;
      render(step.focus);
      return;
    }
    if (action !== 'travel-copy') return;
    const m = travelModelOf(state);
    if (!m) return;
    if (!hasClipboard) {
      state = { ...state, notice: T.noClipboard[lang] };
      render('[data-action="travel-copy"]');
      return;
    }
    void (async (): Promise<void> => {
      try {
        await copy(travelText(m, lang));
        state = { ...state, notice: T.copied[lang] };
      } catch {
        state = { ...state, notice: T.copyFailed[lang] };
      }
      render('[data-action="travel-copy"]');
    })();
  });
  render();
  return { getState: () => state };
}

export const travelPanel = { title: T.title, mount: mountTravelPanel } as const;
