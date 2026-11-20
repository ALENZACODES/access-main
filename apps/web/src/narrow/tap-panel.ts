import { browserEnv, readDeviceFacts, type DeviceEnv } from './device-facts.js';
import { snapshotInPage } from './inpage.js';
import { INTERACTIVE_SELECTOR } from './page.js';
import { escapeHtml } from './report.js';
import {
  AREA_HEIGHT,
  TAPS_PER_SIZE,
  TAP_IDLE,
  TAP_SIZES,
  controlLine,
  controlsBelow,
  currentTarget,
  pageSizesSentence,
  recordTap,
  resultSentence,
  startTaps,
  stopTaps,
  tallyTaps,
  tapPlan,
  tapResult,
  zoomAdvice,
  type ControlBox,
  type PageSizes,
  type TapResult,
  type TapState,
} from './tap-trial.js';
import { NBSP, type Lang } from './types.js';

/**
 * "Button size for my taps": a short test in the page. Targets appear one at
 * a time, from large to small, and the person taps each one. A tap beside a
 * target counts as a miss. At the end the panel says the size at which every
 * tap landed, which browser zoom brings the controls of the App to that
 * size, and which controls of this page are smaller than it.
 *
 * The panel measures taps on this screen. It says nothing about the person.
 * Nothing is stored or sent. Every control is at least 44 CSS pixels each
 * way, and the targets of the test are never smaller than that either.
 */

/** The few DOM members the panel needs, so it can be driven without a browser. */
export interface TapRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface TapPanelState {
  readonly trial: TapState;
  /** What the controls of the page measured once the test ended, or null before. */
  readonly page: PageSizes | null;
  /** Width of the page area when the test ended, or null when the browser did not say. */
  readonly widthPx: number | null;
  readonly notice: string;
}

export const initialTapState = (): TapPanelState => ({ trial: TAP_IDLE, page: null, widthPx: null, notice: '' });

export interface TapOptions {
  readonly root: TapRoot;
  readonly lang: Lang;
  /** The controls of the page, measured. Defaults to the controls of the document. */
  readonly controls?: () => readonly ControlBox[];
  /** Where the width of the page comes from. Defaults to the browser. */
  readonly env?: () => DeviceEnv;
  /** Puts text on the clipboard. Defaults to the browser clipboard when there is one. */
  readonly copy?: (text: string) => Promise<void>;
  /** A state to start from, so a panel mounted again in another language keeps the result. */
  readonly state?: TapPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'Button size for my taps', fr: 'Taille de bouton pour mes appuis' },
  intro: {
    en: `Find the button size at which your taps land on this screen. Targets appear one at a time at ${TAP_SIZES.length} sizes, from large to small, ${TAPS_PER_SIZE} at each size. Tap each one where you see it. A tap beside a target counts as a miss.`,
    fr: `Trouvez la taille de bouton à laquelle vos appuis atteignent leur cible sur cet écran. Des cibles apparaissent une à une, en ${TAP_SIZES.length} tailles, de la plus grande à la plus petite, ${TAPS_PER_SIZE} par taille. Appuyez sur chacune là où vous la voyez. Un appui à côté d’une cible compte comme manqué.`,
  },
  keys: {
    en: 'This test is for touch and for a pointer. With a keyboard or a switch, every press lands on the target, so the result says nothing new.',
    fr: 'Ce test vise le toucher et le pointeur. Au clavier ou au contacteur, chaque appui atteint la cible, donc le résultat n’apprend rien de nouveau.',
  },
  kept: { en: 'The test measures taps, on this screen, today. Nothing is stored or sent.', fr: 'Le test mesure des appuis, sur cet écran, aujourd’hui. Rien n’est enregistré ni envoyé.' },
  start: { en: 'Start the test', fr: 'Commencer le test' },
  started: { en: 'The test has started. The first target is on screen.', fr: 'Le test a commencé. La première cible est à l’écran.' },
  area: { en: 'Area of the test', fr: 'Zone du test' },
  tapHere: { en: 'Tap here', fr: 'Appuyez ici' },
  stop: { en: 'Stop the test', fr: 'Arrêter le test' },
  again: { en: 'Take the test again', fr: 'Refaire le test' },
  result: { en: 'Result', fr: 'Résultat' },
  taps: { en: 'Taps at each size', fr: 'Appuis à chaque taille' },
  size: { en: 'Size', fr: 'Taille' },
  tapped: { en: 'Tapped', fr: 'Appuis' },
  landed: { en: 'Landed', fr: 'Sur la cible' },
  zoom: { en: 'What it means for the App', fr: 'Ce que cela veut dire pour l’App' },
  page: { en: 'Controls of this page', fr: 'Commandes de cette page' },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
  stopped: { en: 'The test was stopped.', fr: 'Le test a été arrêté.' },
  done: { en: 'The test is over.', fr: 'Le test est terminé.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);
const pxText = (n: number, lang: Lang): string => (lang === 'fr' ? `${n}${NBSP}pixels CSS` : `${n} CSS pixels`);

/** The most controls of the page listed by name. */
export const MAX_LISTED = 10;

/** Styles of the panel, scoped to its own class. The area keeps every target inside it, so it never widens the page. */
export const TAP_CSS =
  '.tap{max-width:44rem}.tap h2,.tap h3,.tap h4{line-height:1.25}' +
  '.tap button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.tap .tap-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  `.tap .tap-area{position:relative;width:100%;height:${AREA_HEIGHT}px;border:2px dashed currentColor;box-sizing:border-box;margin-top:12px;touch-action:manipulation}` +
  '.tap .tap-target{position:absolute;padding:0;border:3px solid currentColor;border-radius:50%;text-align:center;font-size:0.875rem;line-height:1.1;overflow-wrap:anywhere}' +
  '.tap table{border-collapse:collapse;width:100%;table-layout:fixed}.tap caption{text-align:left;padding:4px 0}' +
  '.tap th,.tap td{border:1px solid currentColor;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
  '.tap p,.tap li{overflow-wrap:anywhere}' +
  '.tap button:focus-visible,.tap [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

function runningSection(state: TapPanelState, lang: Lang, h: number): string {
  const target = currentTarget(state.trial);
  if (!target) return '';
  const total = tapPlan().length;
  const at = target.index + 1;
  const where = (fraction: number): string => `calc((100% - ${target.size}px) * ${fraction})`;
  const name = lang === 'fr' ? `${T.tapHere.fr}, cible ${at} sur ${total}` : `${T.tapHere.en}, target ${at} of ${total}`;
  return (
    `<section aria-labelledby="tap-run-h"><h${h} id="tap-run-h">${escapeHtml(lang === 'fr' ? `Cible ${at} sur ${total}, ${pxText(target.size, 'fr')}` : `Target ${at} of ${total}, ${pxText(target.size, 'en')}`)}</h${h}>` +
    `<div class="tap-area" data-action="tap-miss" role="group" aria-label="${tx('area', lang)}">` +
    `<button type="button" id="tap-target" class="tap-target" data-action="tap-hit" aria-label="${escapeHtml(name)}" style="width:${target.size}px;height:${target.size}px;left:${where(target.x)};top:calc((${AREA_HEIGHT}px - ${target.size}px) * ${target.y})">${tx('tapHere', lang)}</button>` +
    '</div>' +
    `<p class="tap-actions"><button type="button" data-action="tap-stop">${tx('stop', lang)}</button></p></section>`
  );
}

function tallyTable(state: TapPanelState, lang: Lang): string {
  const rows = tallyTaps(state.trial.taps)
    .map((t) => `<tr><th scope="row">${escapeHtml(pxText(t.size, lang))}</th><td>${t.attempts}${lang === 'fr' ? ' sur ' : ' of '}${TAPS_PER_SIZE}</td><td>${t.attempts === 0 ? 'UNKNOWN' : t.hits}</td></tr>`)
    .join('');
  return `<table><caption>${tx('taps', lang)}</caption><thead><tr><th scope="col">${tx('size', lang)}</th><th scope="col">${tx('tapped', lang)}</th><th scope="col">${tx('landed', lang)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function pageSection(page: PageSizes | null, result: TapResult, lang: Lang, h: number): string {
  if (result.kind !== 'size' || page === null) return '';
  const listed = page.smaller.slice(0, MAX_LISTED);
  const more = page.smaller.length - listed.length;
  return (
    `<h${h} id="tap-page-h">${tx('page', lang)}</h${h}>` +
    `<p>${escapeHtml(pageSizesSentence(page, result.px, lang))}</p>` +
    (listed.length === 0 ? '' : `<ul>${listed.map((c) => `<li>${escapeHtml(controlLine(c, lang))}</li>`).join('')}</ul>`) +
    (more > 0 ? `<p>${escapeHtml(lang === 'fr' ? `… et ${more} de plus.` : `… and ${more} more.`)}</p>` : '')
  );
}

function resultSection(state: TapPanelState, lang: Lang, h: number): string {
  if (state.trial.phase !== 'done') return '';
  const result = tapResult(state.trial.taps);
  const advice = zoomAdvice(result, state.widthPx, lang);
  return (
    `<section aria-labelledby="tap-result-h"><h${h} id="tap-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    `<p>${escapeHtml(resultSentence(result, lang))}</p>` +
    tallyTable(state, lang) +
    (advice.length === 0 ? '' : `<h${h + 1} id="tap-zoom-h">${tx('zoom', lang)}</h${h + 1}>${advice.map((a) => `<p>${escapeHtml(a)}</p>`).join('')}`) +
    pageSection(state.page, result, lang, h + 1) +
    `<p class="tap-actions"><button type="button" data-action="tap-copy">${tx('copy', lang)}</button> <button type="button" data-action="tap-again">${tx('again', lang)}</button></p>` +
    '</section>'
  );
}

/** The markup of the panel for a state. */
export function renderTapPanel(lang: Lang, state: TapPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  const idle = state.trial.phase === 'idle';
  return (
    `<div class="tap"><style>${TAP_CSS}</style>` +
    `<h${h} id="tap-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('keys', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` +
    (idle ? `<p class="tap-actions"><button type="button" data-action="tap-start">${tx('start', lang)}</button></p>` : '') +
    runningSection(state, lang, h + 1) +
    resultSection(state, lang, h + 1) +
    '</div>'
  );
}

/** The result as plain text, to paste into a message or a barrier report. */
export function tapResultText(state: TapPanelState, lang: Lang): string {
  if (state.trial.phase !== 'done') return '';
  const result = tapResult(state.trial.taps);
  const lines = [T.title[lang], resultSentence(result, lang), ...zoomAdvice(result, state.widthPx, lang)];
  if (result.kind === 'size' && state.page !== null) {
    lines.push(pageSizesSentence(state.page, result.px, lang), ...state.page.smaller.slice(0, MAX_LISTED).map((c) => `- ${controlLine(c, lang)}`));
  }
  return `${lines.join('\n')}\n`;
}

export type TapAction = 'tap-start' | 'tap-hit' | 'tap-miss' | 'tap-stop' | 'tap-again';

export function isTapAction(action: string | null): action is TapAction {
  return action === 'tap-start' || action === 'tap-hit' || action === 'tap-miss' || action === 'tap-stop' || action === 'tap-again';
}

export interface TapStep {
  readonly state: TapPanelState;
  /** Selector of the element to put focus on after the re-render. */
  readonly focus: string;
}

/** What is measured when the test ends: the controls of the page and its width. */
export interface TapMeasure {
  readonly controls: () => readonly ControlBox[];
  readonly width: () => number | null;
}

function finish(trial: TapState, lang: Lang, measure: TapMeasure): TapStep {
  return {
    // The page is measured only when there is a size to compare with.
    state: { trial, page: sizeOf(trial) > 0 ? controlsBelow(measure.controls(), sizeOf(trial)) : null, widthPx: measure.width(), notice: trial.stopped ? T.stopped[lang] : `${T.done[lang]} ${resultSentence(tapResult(trial.taps), lang)}` },
    focus: '#tap-result-h',
  };
}

const sizeOf = (trial: TapState): number => {
  const r = tapResult(trial.taps);
  return r.kind === 'size' ? r.px : 0;
};

/** What an action does to the state. */
export function tapStep(state: TapPanelState, action: TapAction, lang: Lang, measure: TapMeasure): TapStep {
  if (action === 'tap-start' || action === 'tap-again') {
    return { state: { ...initialTapState(), trial: startTaps(), notice: T.started[lang] }, focus: '#tap-target' };
  }
  if (state.trial.phase !== 'running') return { state, focus: '#tap-h' };
  if (action === 'tap-stop') return finish(stopTaps(state.trial), lang, measure);
  const trial = recordTap(state.trial, action === 'tap-hit' ? 'hit' : 'miss');
  if (trial.phase === 'done') return finish(trial, lang, measure);
  // No message after each tap: a status after every target would talk over the test. The heading of the target says where it is.
  return { state: { ...state, trial, notice: '' }, focus: '#tap-target' };
}

/** The controls of the document the code runs in, with their names and sizes. The targets of this panel are not among them once the test is over. */
export function documentControls(): ControlBox[] {
  // Outside a browser there is nothing to measure, and the result says that no control was measured.
  if (!(globalThis as unknown as { document?: { body?: unknown } }).document?.body) return [];
  return snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 3000 }).interactive.map((e) => ({
    id: e.id,
    name: e.name,
    width: e.rect.right - e.rect.left,
    height: e.rect.bottom - e.rect.top,
  }));
}

/** Mounts the panel. Each re-render replaces the markup, and focus goes to the next target, or to the result. */
export function mountTapPanel(opts: TapOptions): { getState(): TapPanelState } {
  const lang = opts.lang;
  const env = opts.env ?? browserEnv;
  const controls = opts.controls ?? documentControls;
  const measure: TapMeasure = {
    controls,
    width: () => {
      const w = readDeviceFacts(env()).width;
      return w.known ? w.value : null;
    },
  };
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  // A test that was running when the language changed starts again: half a test in two languages would be hard to follow.
  let state: TapPanelState = opts.state ? { ...opts.state, trial: opts.state.trial.phase === 'running' ? TAP_IDLE : opts.state.trial, notice: '' } : initialTapState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderTapPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'tap-copy') {
      const text = tapResultText(state, lang);
      if (text === '') return;
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="tap-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="tap-copy"]');
      })();
      return;
    }
    if (!isTapAction(action)) return;
    const step = tapStep(state, action, lang, measure);
    if (step.state === state) return;
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => state };
}

/** What the app shell needs to place the panel on a page. */
export const tapPanel = {
  title: T.title,
  mount: mountTapPanel,
} as const;
