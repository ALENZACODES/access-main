import { escapeHtml } from './report.js';
import { buildScroll, placeKind, placeName, screensText, scrollNotes, scrollSummary, scrollText, type ScrollCheck } from './scroll-effort.js';
import { SCROLL_ARGS, scrollInPage, type ScrollFacts } from './scroll-inpage.js';
import { NBSP, type Lang } from './types.js';

/**
 * "Scroll effort on this page": a panel that counts how far down the page its
 * headings, send buttons and last control sit, in screens of the window as it
 * is now, and points to long stretches with no heading, bars that cover the
 * window and a missing way back to the top.
 *
 * It reads the page and changes nothing: it does not scroll and moves no
 * focus outside the panel. Every control is at least 44 CSS pixels each way.
 * Nothing is stored or sent.
 */

export interface ScrollRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface ScrollPanelState {
  readonly facts: ScrollFacts | null;
  readonly notice: string;
}

export const initialScrollState = (): ScrollPanelState => ({ facts: null, notice: '' });

export interface ScrollOptions {
  readonly root: ScrollRoot;
  readonly lang: Lang;
  readonly read?: () => ScrollFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: ScrollPanelState;
  readonly headingLevel?: 2 | 3;
}

/** Rows shown in the table. The copied text holds more. */
export const SCROLL_ROWS = 25;

const T = {
  title: { en: 'Scroll effort on this page', fr: 'Effort de défilement de cette page' },
  intro: {
    en: 'Counts how far down this page its headings, send buttons and last control sit, in screens of the window as it is now. Each screen is a swipe, a few turns of a wheel or a Page Down, which can cost a lot for a person who scrolls with effort.',
    fr: 'Compte à quelle distance du haut de cette page se trouvent ses titres, ses boutons d’envoi et sa dernière commande, en écrans de la fenêtre telle qu’elle est. Chaque écran est un balayage, quelques crans de molette ou un appui sur Page suivante, ce qui peut coûter cher à une personne qui fait défiler avec effort.',
  },
  kept: { en: 'This reads the page and does not scroll it. Nothing is stored or sent.', fr: 'Ce panneau lit la page et ne la fait pas défiler. Rien n’est enregistré ni envoyé.' },
  count: { en: 'Count the scrolling on this page', fr: 'Compter le défilement de cette page' },
  again: { en: 'Count again', fr: 'Compter de nouveau' },
  counted: { en: 'The page was read.', fr: 'La page a été lue.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What was counted', fr: 'Ce qui a été compté' },
  notes: { en: 'Points to look at', fr: 'Points à regarder' },
  table: { en: 'How far down each place is', fr: 'À quelle distance du haut se trouve chaque endroit' },
  what: { en: 'What', fr: 'Quoi' },
  name: { en: 'Name', fr: 'Nom' },
  where: { en: 'From the top', fr: 'Depuis le haut' },
  none: { en: 'No heading, send button or control was found.', fr: 'Aucun titre, bouton d’envoi ni commande n’a été trouvé.' },
  limit: {
    en: 'A screen is the part of the window that fixed bars leave free. How far one scroll goes differs from device to device, so these are counts of the page, not of how anyone scrolls.',
    fr: 'Un écran est la partie de la fenêtre que les barres fixes laissent libre. Ce que fait un coup de défilement varie d’un appareil à l’autre, donc ces comptes portent sur la page, pas sur la façon de défiler de qui que ce soit.',
  },
  copy: { en: 'Copy the counts', fr: 'Copier les comptes' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const SCROLL_CSS =
  '.scroll-effort{max-width:44rem}.scroll-effort h2,.scroll-effort h3,.scroll-effort h4{line-height:1.25}' +
  '.scroll-effort button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.scroll-effort .scroll-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.scroll-effort table{border-collapse:collapse;width:100%;table-layout:fixed}.scroll-effort caption{text-align:left;padding:4px 0}' +
  '.scroll-effort th,.scroll-effort td{border:1px solid currentColor;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
  '.scroll-effort p,.scroll-effort li{overflow-wrap:anywhere}' +
  '.scroll-effort button:focus-visible,.scroll-effort [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function scrollCheckOf(s: ScrollPanelState): ScrollCheck | null {
  return s.facts ? buildScroll(s.facts) : null;
}

function tableHtml(c: ScrollCheck, lang: Lang): string {
  if (c.kind !== 'model') return '';
  const places = c.model.places;
  if (places.length === 0) return `<p>${tx('none', lang)}</p>`;
  const shown = places.slice(0, SCROLL_ROWS);
  const more = places.length - shown.length;
  return (
    `<table><caption>${tx('table', lang)}</caption><thead><tr><th scope="col">${tx('what', lang)}</th><th scope="col">${tx('name', lang)}</th><th scope="col">${tx('where', lang)}</th></tr></thead><tbody>` +
    shown.map((p) => `<tr><td>${escapeHtml(placeKind(p, lang))}</td><th scope="row">${escapeHtml(placeName(p, lang))}</th><td>${escapeHtml(screensText(p.screens, lang))}</td></tr>`).join('') +
    '</tbody></table>' +
    (more > 0 ? `<p>${escapeHtml(lang === 'fr' ? `… et ${more} de plus, dans le texte copié.` : `… and ${more} more, in the copied text.`)}</p>` : '')
  );
}

function resultHtml(s: ScrollPanelState, lang: Lang, h: number): string {
  const c = scrollCheckOf(s);
  if (!c) return '';
  const notes = scrollNotes(c, lang);
  return (
    `<section aria-labelledby="scroll-result-h"><h${h} id="scroll-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    scrollSummary(c, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (notes.length === 0 ? '' : `<h${h + 1} id="scroll-notes-h">${tx('notes', lang)}</h${h + 1}><ul>${notes.map((n) => `<li>${escapeHtml(n.text)}</li>`).join('')}</ul>`) +
    tableHtml(c, lang) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="scroll-actions"><button type="button" data-action="scroll-copy">${tx('copy', lang)}</button> <button type="button" data-action="scroll-count">${tx('again', lang)}</button></p></section>`
  );
}

export function renderScrollPanel(lang: Lang, s: ScrollPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="scroll-effort"><style>${SCROLL_CSS}</style>` +
    `<h${h} id="scroll-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    (s.facts ? '' : `<p class="scroll-actions"><button type="button" data-action="scroll-count">${tx('count', lang)}</button></p>`) +
    resultHtml(s, lang, h + 1) +
    '</div>'
  );
}

export interface ScrollStep {
  readonly state: ScrollPanelState;
  readonly focus: string;
}

/** Counting: reads the page, says so and puts focus on the result; on a failure, says why at the top of the panel. */
export function scrollStep(s: ScrollPanelState, lang: Lang, read: () => ScrollFacts): ScrollStep {
  try {
    return { state: { facts: read(), notice: T.counted[lang] }, focus: '#scroll-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#scroll-h' };
  }
}

/** The panel itself, so its own headings and buttons are not counted with the page. */
export const SCROLL_EXCLUDE = '.scroll-effort';

export function mountScrollPanel(opts: ScrollOptions): { getState(): ScrollPanelState } {
  const lang = opts.lang;
  const read = opts.read ?? ((): ScrollFacts => scrollInPage({ ...SCROLL_ARGS, exclude: SCROLL_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: ScrollPanelState = opts.state ? { ...opts.state, notice: '' } : initialScrollState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderScrollPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'scroll-count') {
      const step = scrollStep(state, lang, read);
      state = step.state;
      render(step.focus);
      return;
    }
    if (action !== 'scroll-copy') return;
    const c = scrollCheckOf(state);
    if (!c) return;
    const text = scrollText(c, lang);
    if (!hasClipboard) {
      state = { ...state, notice: T.noClipboard[lang] };
      render('[data-action="scroll-copy"]');
      return;
    }
    void (async (): Promise<void> => {
      try {
        await copy(text);
        state = { ...state, notice: T.copied[lang] };
      } catch {
        state = { ...state, notice: T.copyFailed[lang] };
      }
      render('[data-action="scroll-copy"]');
    })();
  });
  render();
  return { getState: () => state };
}

export const scrollPanel = { title: T.title, mount: mountScrollPanel } as const;
