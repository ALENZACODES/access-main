import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { DRAG_TRIES, dragDone, dragIsHard, dragNote, dragResult, dragSummary, dragTrialStep, emptyDragTrial, giveUpDrag, type DragEvent, type DragTrial } from './drag-trial.js';
import { GESTURE_ARGS, gestureInPage, type GestureFacts } from './gesture-inpage.js';
import { buildGestures, findingText, gestureAdvice, gestureSummary, type GestureModel } from './gestures.js';

/**
 * "Dragging and gestures": a short drag test, then a reading of the page for
 * controls that ask for a drag or a gesture, each with any single-tap way
 * found around it. The test can be skipped by saying dragging is not
 * possible; the reading works without it.
 *
 * The handle is moved by the pointer only; while it moves, the panel is not
 * drawn again. Every control is at least 44 CSS pixels each way. The page is
 * read, never changed, and nothing is stored or sent.
 */

export interface GestureEvent {
  readonly type: string;
  readonly target: unknown;
  readonly clientX?: number;
  readonly pointerId?: number;
  readonly pointerType?: string;
  readonly timeStamp?: number;
  preventDefault?(): void;
}

interface Box {
  readonly left: number;
  readonly width: number;
}

export interface GestureNode {
  focus?(): void;
  getBoundingClientRect?(): Box;
  setPointerCapture?(id: number): void;
  style?: { transform: string };
}

export interface GestureRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: GestureEvent) => void): void;
  querySelector?(selector: string): GestureNode | null;
}

export interface GesturesPanelState {
  readonly trial: DragTrial;
  readonly testing: boolean;
  readonly facts: GestureFacts | null;
  readonly notice: string;
}

export const initialGesturesState = (): GesturesPanelState => ({ trial: emptyDragTrial(), testing: false, facts: null, notice: '' });

export interface GesturesOptions {
  readonly root: GestureRoot;
  readonly lang: Lang;
  readonly read?: () => GestureFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly now?: () => number;
  readonly state?: GesturesPanelState;
  readonly headingLevel?: 2 | 3;
}

/** How many findings are listed on screen; all of them are in the copied text. */
export const GESTURES_LISTED = 20;

const T = {
  title: { en: 'Dragging and gestures', fr: 'Glisser et gestes' },
  intro: {
    en: 'Some controls ask you to drag, swipe or pinch. First, a short drag test shows whether dragging works for you today. Then the panel reads this page for controls that ask for a drag or a gesture, and for a single-tap way to do the same.',
    fr: 'Certaines commandes demandent de glisser, de balayer ou de pincer. D’abord, un court test montre si glisser fonctionne pour vous aujourd’hui. Ensuite, le panneau lit cette page pour trouver les commandes qui demandent un glissement ou un geste, et une façon de faire la même chose par un appui simple.',
  },
  kept: { en: 'The page is read, never changed. Nothing is stored or sent.', fr: 'La page est lue, jamais modifiée. Rien n’est enregistré ni envoyé.' },
  test: { en: 'Drag test', fr: 'Test de glissement' },
  testIntro: {
    en: `Press the square handle and drag it to the dashed end of the track, the way you usually point. There are ${DRAG_TRIES} tries, with no time limit. If you cannot drag at all, say so instead.`,
    fr: `Appuyez sur la poignée carrée et glissez-la jusqu’au bout pointillé de la piste, comme vous pointez d’habitude. Il y a ${DRAG_TRIES}${NBSP}essais, sans limite de temps. Si vous ne pouvez pas glisser du tout, dites-le plutôt.`,
  },
  start: { en: 'Start the drag test', fr: 'Commencer le test de glissement' },
  cannot: { en: 'I cannot drag', fr: 'Je ne peux pas glisser' },
  stop: { en: 'Stop the test', fr: 'Arrêter le test' },
  again: { en: 'Do the drag test again', fr: 'Refaire le test de glissement' },
  started: { en: 'The drag test has started. The handle is at the start of the track.', fr: 'Le test de glissement a commencé. La poignée est au début de la piste.' },
  over: { en: 'The drag test is over. The result follows.', fr: 'Le test de glissement est terminé. Le résultat suit.' },
  page: { en: 'This page', fr: 'Cette page' },
  read: { en: 'Find drag and gesture controls', fr: 'Trouver les commandes à glisser ou à geste' },
  readAgain: { en: 'Read the page again', fr: 'Relire la page' },
  readDone: { en: 'The page was read.', fr: 'La page a été lue.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What was found', fr: 'Ce qui a été trouvé' },
  help: { en: 'What may help the team', fr: 'Ce qui peut aider l’équipe' },
  more: { en: 'more, in the copied text.', fr: 'de plus, dans le texte copié.' },
  limit: {
    en: 'A way found is a button whose name suggests it. Whether it really does the same stays to be tried. The drag test shows one screen, today, and says nothing about you.',
    fr: 'Une façon trouvée est un bouton dont le nom la suggère. Il reste à essayer si elle fait vraiment la même chose. Le test montre un écran, aujourd’hui, et ne dit rien de vous.',
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const GESTURES_CSS =
  '.gest{max-width:44rem}.gest h2,.gest h3,.gest h4,.gest h5{line-height:1.25}' +
  '.gest button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.gest .gest-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.gest .gest-track{position:relative;height:60px;max-width:100%;border:2px solid currentColor;box-sizing:border-box;margin:12px 0}' +
  '.gest .gest-end{position:absolute;top:0;right:0;bottom:0;width:10%;border-left:2px dashed currentColor;box-sizing:border-box}' +
  '.gest .gest-handle{position:absolute;top:6px;left:6px;width:44px;height:44px;border:3px solid currentColor;box-sizing:border-box;touch-action:none;cursor:grab}' +
  '.gest p,.gest li{overflow-wrap:anywhere}' +
  '.gest button:focus-visible,.gest [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function gesturesModelOf(s: GesturesPanelState): GestureModel | null {
  return s.facts ? buildGestures(s.facts) : null;
}

function testHtml(s: GesturesPanelState, lang: Lang, h: number): string {
  const r = dragResult(s.trial);
  let body: string;
  if (s.testing) {
    const n = Math.min(s.trial.tries.length + 1, DRAG_TRIES);
    body =
      `<p id="gest-try">${escapeHtml(lang === 'fr' ? `Essai ${n} sur ${DRAG_TRIES}.` : `Try ${n} of ${DRAG_TRIES}.`)}</p>` +
      '<div class="gest-track" aria-hidden="true"><div class="gest-end"></div><div class="gest-handle" data-drag-handle="1"></div></div>' +
      `<p class="gest-actions"><button type="button" data-action="gest-cannot">${tx('cannot', lang)}</button> <button type="button" data-action="gest-stop">${tx('stop', lang)}</button></p>`;
  } else if (r.outcome === 'not-done') {
    body = `<p class="gest-actions"><button type="button" data-action="gest-start">${tx('start', lang)}</button> <button type="button" data-action="gest-cannot">${tx('cannot', lang)}</button></p>`;
  } else {
    body =
      dragSummary(r, lang)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('') + `<p class="gest-actions"><button type="button" data-action="gest-start">${tx('again', lang)}</button></p>`;
  }
  return `<section aria-labelledby="gest-test-h"><h${h} id="gest-test-h" tabindex="-1">${tx('test', lang)}</h${h}><p>${tx('testIntro', lang)}</p>${body}</section>`;
}

function pageHtml(s: GesturesPanelState, lang: Lang, h: number): string {
  const m = gesturesModelOf(s);
  let result = '';
  if (m) {
    const hard = dragIsHard(dragResult(s.trial));
    const listed = m.findings.slice(0, GESTURES_LISTED);
    const rest = m.findings.length - listed.length;
    const advice = gestureAdvice(m, lang);
    result =
      `<h${h + 1} id="gest-result-h" tabindex="-1">${tx('result', lang)}</h${h + 1}>` +
      gestureSummary(m, hard, lang)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('') +
      (listed.length === 0 ? '' : `<ul aria-labelledby="gest-result-h">${listed.map((f) => `<li>${escapeHtml(findingText(f, lang))}</li>`).join('')}</ul>`) +
      (rest > 0 ? `<p>${escapeHtml(`… ${lang === 'fr' ? 'et' : 'and'} ${rest} `)}${tx('more', lang)}</p>` : '') +
      (advice.length === 0 ? '' : `<h${h + 1} id="gest-help-h">${tx('help', lang)}</h${h + 1}><ul aria-labelledby="gest-help-h">${advice.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`) +
      `<p>${tx('limit', lang)}</p>` +
      `<p class="gest-actions"><button type="button" data-action="gest-copy">${tx('copy', lang)}</button></p>`;
  }
  return (
    `<section aria-labelledby="gest-page-h"><h${h} id="gest-page-h" tabindex="-1">${tx('page', lang)}</h${h}>` +
    `<p class="gest-actions"><button type="button" data-action="gest-read">${tx(m ? 'readAgain' : 'read', lang)}</button></p>` +
    result +
    '</section>'
  );
}

export function renderGesturesPanel(lang: Lang, s: GesturesPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="gest"><style>${GESTURES_CSS}</style>` +
    `<h${h} id="gest-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    testHtml(s, lang, h + 1) +
    pageHtml(s, lang, h + 1) +
    '</div>'
  );
}

/** The result as plain text: the drag test, then every finding and the hints. */
export function gesturesResultText(s: GesturesPanelState, lang: Lang): string {
  const r = dragResult(s.trial);
  const lines = [T.title[lang], ...dragSummary(r, lang)];
  const m = gesturesModelOf(s);
  if (m) {
    lines.push('', T.page[lang], ...gestureSummary(m, dragIsHard(r), lang), ...m.findings.map((f) => `- ${findingText(f, lang)}`));
    const advice = gestureAdvice(m, lang);
    if (advice.length > 0) lines.push('', `${T.help[lang]}${lang === 'fr' ? `${NBSP}:` : ':'}`, ...advice.map((a) => `- ${a}`));
  }
  lines.push('', T.limit[lang]);
  return `${lines.join('\n')}\n`;
}

export type GesturesAction = 'gest-start' | 'gest-cannot' | 'gest-stop' | 'gest-read';

export function isGesturesAction(a: string | null): a is GesturesAction {
  return a === 'gest-start' || a === 'gest-cannot' || a === 'gest-stop' || a === 'gest-read';
}

export interface GesturesStep {
  readonly state: GesturesPanelState;
  readonly focus: string;
}

export function gesturesStep(s: GesturesPanelState, action: GesturesAction, lang: Lang, read: () => GestureFacts): GesturesStep {
  switch (action) {
    case 'gest-start':
      return { state: { ...s, trial: emptyDragTrial(), testing: true, notice: T.started[lang] }, focus: '#gest-test-h' };
    case 'gest-cannot':
      return { state: { ...s, trial: giveUpDrag(emptyDragTrial()), testing: false, notice: T.over[lang] }, focus: '#gest-test-h' };
    case 'gest-stop':
      if (!s.testing) return { state: s, focus: '' };
      return { state: { ...s, trial: { ...s.trial, current: null }, testing: false, notice: T.over[lang] }, focus: '#gest-test-h' };
    case 'gest-read':
      try {
        return { state: { ...s, facts: read(), notice: T.readDone[lang] }, focus: '#gest-result-h' };
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#gest-page-h' };
      }
  }
}

/**
 * One pointer event on the track, as the test sees it. `x` is how far the
 * handle has moved, as a fraction of how far it can go.
 */
export function gesturesDrag(s: GesturesPanelState, e: DragEvent, lang: Lang): GesturesPanelState {
  if (!s.testing) return s;
  const before = s.trial.tries.length;
  const trial = dragTrialStep(s.trial, e);
  if (trial.tries.length === before) return { ...s, trial };
  const last = trial.tries[trial.tries.length - 1];
  const n = trial.tries.length;
  const said = last?.reached
    ? lang === 'fr'
      ? `L’essai ${n} a atteint le bout.`
      : `Try ${n} reached the end.`
    : lang === 'fr'
      ? `L’essai ${n} s’est arrêté en route.`
      : `Try ${n} stopped short.`;
  if (dragDone(trial)) return { ...s, trial, testing: false, notice: `${said} ${T.over[lang]}` };
  return { ...s, trial, notice: said };
}

/** One line for the barrier text, or nothing before the test. */
export function gesturesNoteOf(s: GesturesPanelState, lang: Lang): string {
  return s.testing ? '' : dragNote(dragResult(s.trial), lang);
}

/** The panel itself, so its own handle is not counted with the page. */
export const GESTURES_EXCLUDE = '.gest';

export function mountGesturesPanel(opts: GesturesOptions): { getState(): GesturesPanelState; note(): string } {
  const lang = opts.lang;
  const read = opts.read ?? ((): GestureFacts => gestureInPage({ ...GESTURE_ARGS, exclude: GESTURES_EXCLUDE }));
  const now = opts.now ?? ((): number => (globalThis as unknown as { performance?: { now(): number } }).performance?.now() ?? Date.now());
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  // A test that was running when the language changed is stopped where it was.
  let state: GesturesPanelState = opts.state ? { ...opts.state, testing: false, trial: { ...opts.state.trial, current: null }, notice: '' } : initialGesturesState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderGesturesPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  // The pointer that pressed the handle, where it started and how far the handle can go.
  let drag: { id: number; startX: number; span: number } | null = null;
  const at = (e: GestureEvent): number => (typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : now());
  const fraction = (e: GestureEvent): number => (drag && drag.span > 0 ? ((e.clientX ?? drag.startX) - drag.startX) / drag.span : 0);
  const isHandle = (t: unknown): boolean => (t as { getAttribute?(n: string): string | null } | null)?.getAttribute?.('data-drag-handle') === '1';
  const moveHandle = (x: number): void => {
    const handle = opts.root.querySelector?.('[data-drag-handle]');
    if (handle?.style && drag) handle.style.transform = `translateX(${Math.round(Math.min(1, Math.max(0, x)) * drag.span)}px)`;
  };
  const end = (e: GestureEvent, kind: 'up' | 'cancel'): void => {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    const ev: DragEvent = kind === 'up' ? { kind: 'up', x: fraction(e), at: at(e) } : { kind: 'cancel', at: at(e) };
    drag = null;
    const wasTesting = state.testing;
    state = gesturesDrag(state, ev, lang);
    render(wasTesting && !state.testing ? '#gest-test-h' : undefined);
  };

  opts.root.addEventListener('pointerdown', (e) => {
    if (!state.testing || drag || !isHandle(e.target)) return;
    e.preventDefault?.();
    const track = opts.root.querySelector?.('.gest-track')?.getBoundingClientRect?.();
    const handle = opts.root.querySelector?.('[data-drag-handle]');
    const hw = handle?.getBoundingClientRect?.().width ?? 44;
    drag = { id: e.pointerId ?? 0, startX: e.clientX ?? 0, span: Math.max(0, (track?.width ?? 0) - hw - 12) };
    handle?.setPointerCapture?.(drag.id);
    state = gesturesDrag(state, { kind: 'down', x: 0, at: at(e), pointerType: e.pointerType ?? '' }, lang);
  });
  opts.root.addEventListener('pointermove', (e) => {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    const x = fraction(e);
    moveHandle(x);
    const before = state.trial.tries.length;
    state = gesturesDrag(state, { kind: 'move', x, at: at(e) }, lang);
    // Reaching the end ends the try at once.
    if (state.trial.tries.length !== before) {
      drag = null;
      render(state.testing ? undefined : '#gest-test-h');
    }
  });
  opts.root.addEventListener('pointerup', (e) => end(e, 'up'));
  opts.root.addEventListener('pointercancel', (e) => end(e, 'cancel'));

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'gest-copy') {
      if (!state.facts) return;
      const text = gesturesResultText(state, lang);
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="gest-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="gest-copy"]');
      })();
      return;
    }
    if (!isGesturesAction(action)) return;
    const step = gesturesStep(state, action, lang, read);
    if (step.focus === '') return;
    drag = null;
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => state, note: () => gesturesNoteOf(state, lang) };
}

export const gesturesPanel = { title: T.title, mount: mountGesturesPanel } as const;
