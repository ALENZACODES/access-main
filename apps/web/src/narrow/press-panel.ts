import { escapeHtml } from './report.js';
import {
  PRESSES,
  initialPress,
  pressCancel,
  pressDown,
  pressFindings,
  pressNote,
  pressSettings,
  pressStats,
  pressSummary,
  pressText,
  pressUp,
  startPress,
  stopPress,
  type PressState,
  type PressVia,
} from './press-timing.js';
import { NBSP, type Lang } from './types.js';

/**
 * "How I press": the panel that runs the press timing test. The person
 * presses a large button eight times the way they usually do, by touch,
 * mouse or key, and the panel shows how long each press was held, the time
 * between presses, and what those times may cause on many devices.
 *
 * Every control is at least 44 CSS pixels each way, the pad far more.
 * Nothing is stored or sent.
 */

/** What the panel needs of a DOM event. */
export interface PressEvent {
  readonly type: string;
  readonly target: unknown;
  readonly timeStamp?: number;
  readonly key?: string;
  readonly repeat?: boolean;
  readonly pointerType?: string;
  readonly button?: number;
  readonly isPrimary?: boolean;
  preventDefault?(): void;
}

export interface PressRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: PressEvent) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface PressPanelState {
  readonly trial: PressState;
  readonly notice: string;
}

export const initialPressPanel = (): PressPanelState => ({ trial: initialPress(), notice: '' });

export interface PressOptions {
  readonly root: PressRoot;
  readonly lang: Lang;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: PressPanelState;
  readonly headingLevel?: 2 | 3;
  /** The clock used when an event has no time stamp. */
  readonly now?: () => number;
}

const T = {
  title: { en: 'How I press', fr: 'Ma façon d’appuyer' },
  intro: {
    en: `Press a large button ${PRESSES} times, the way you usually do, by touch, mouse, switch or key. The panel times how long each press is held and the time between presses, and says what those times may cause on many phones, computers and pages.`,
    fr: `Appuyez ${PRESSES}${NBSP}fois sur un grand bouton, comme vous le faites d’habitude, au toucher, à la souris, au contacteur ou au clavier. Le panneau mesure la durée de chaque appui et le temps entre les appuis, et dit ce que ces temps peuvent causer sur beaucoup de téléphones, d’ordinateurs et de pages.`,
  },
  kept: { en: 'There is no time limit. Nothing is stored or sent.', fr: 'Il n’y a pas de limite de temps. Rien n’est enregistré ni envoyé.' },
  start: { en: 'Start the press test', fr: 'Commencer le test d’appui' },
  started: { en: 'The test has started. Focus is on the large button.', fr: 'Le test a commencé. Le focus est sur le grand bouton.' },
  how: {
    en: 'Press the large button and let go, the way you usually do. With a keyboard, use Enter or Space. Take your time.',
    fr: 'Appuyez sur le grand bouton puis relâchez, comme d’habitude. Au clavier, utilisez Entrée ou Espace. Prenez votre temps.',
  },
  pad: { en: 'Press here', fr: 'Appuyez ici' },
  stop: { en: 'Stop the test', fr: 'Arrêter le test' },
  stoppedNotice: { en: 'The test was stopped.', fr: 'Le test a été arrêté.' },
  doneNotice: { en: 'The test is over. The result follows.', fr: 'Le test est terminé. Le résultat suit.' },
  result: { en: 'Your press times', fr: 'Vos temps d’appui' },
  may: { en: 'What these times may cause', fr: 'Ce que ces temps peuvent causer' },
  none: {
    en: 'None of the presses measured was held long enough for a long press, none repeated, and none came close enough to the one before to be read as a double press, on the timing many devices use.',
    fr: 'Aucun appui mesuré n’a duré assez pour un appui long, aucun ne s’est répété et aucun n’a suivi le précédent d’assez près pour passer pour un double appui, selon les délais de beaucoup d’appareils.',
  },
  table: { en: 'Each press', fr: 'Chaque appui' },
  press: { en: 'Press', fr: 'Appui' },
  held: { en: 'Held', fr: 'Durée' },
  gap: { en: 'Time since the one before', fr: 'Temps depuis le précédent' },
  limit: {
    en: 'These times are those of this screen, this way of pressing, today. They say nothing about you, and nothing here is advice about your health.',
    fr: 'Ces temps sont ceux de cet écran, de cette façon d’appuyer, aujourd’hui. Ils ne disent rien de vous, et rien ici n’est un conseil de santé.',
  },
  barrier: {
    en: 'This line goes into the barrier text of the form “Tell us about a barrier”, above, with the screen settings:',
    fr: 'Cette ligne va dans le texte de l’obstacle du formulaire «\u202FSignaler un obstacle\u202F», plus haut, avec les réglages de l’écran\u00A0:',
  },
  again: { en: 'Do the test again', fr: 'Refaire le test' },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);
const msText = (n: number | undefined, lang: Lang): string => (n === undefined ? 'UNKNOWN' : lang === 'fr' ? `${n}${NBSP}ms` : `${n} ms`);

export const PRESS_CSS =
  '.press{max-width:44rem}.press h2,.press h3,.press h4{line-height:1.25}' +
  '.press button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.press .press-pad{display:block;width:100%;max-width:24rem;min-height:160px;margin:12px 0;text-align:center;font-weight:700;border:3px solid currentColor;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}' +
  '.press .press-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.press table{border-collapse:collapse;width:100%;max-width:30rem;table-layout:fixed}.press caption{text-align:left;padding:4px 0}' +
  '.press th,.press td{border:1px solid currentColor;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
  '.press p,.press li{overflow-wrap:anywhere}' +
  '.press button:focus-visible,.press [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

function runningHtml(s: PressPanelState, lang: Lang, h: number): string {
  const n = Math.min(s.trial.samples.length + 1, PRESSES);
  const heading = lang === 'fr' ? `Appui ${n} sur ${PRESSES}` : `Press ${n} of ${PRESSES}`;
  return (
    `<section aria-labelledby="press-run-h"><h${h} id="press-run-h" tabindex="-1">${escapeHtml(heading)}</h${h}>` +
    `<p id="press-how">${tx('how', lang)}</p>` +
    `<button type="button" class="press-pad" id="press-pad" data-press="pad" aria-describedby="press-how">${tx('pad', lang)}</button>` +
    `<p class="press-actions"><button type="button" data-action="press-stop">${tx('stop', lang)}</button></p></section>`
  );
}

function tableHtml(s: PressState, lang: Lang): string {
  const st = pressStats(s);
  if (st.count === 0) return '';
  const rows = st.holds
    .map((hold, i) => `<tr><th scope="row">${i + 1}</th><td>${escapeHtml(msText(hold, lang))}</td><td>${i === 0 ? '' : escapeHtml(msText(st.gaps[i - 1], lang))}</td></tr>`)
    .join('');
  return (
    `<table><caption>${tx('table', lang)}</caption><thead><tr><th scope="col">${tx('press', lang)}</th><th scope="col">${tx('held', lang)}</th><th scope="col">${tx('gap', lang)}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  );
}

function resultHtml(s: PressPanelState, lang: Lang, h: number): string {
  const trial = s.trial;
  const st = pressStats(trial);
  const findings = pressFindings(st, lang);
  const settings = pressSettings(findings, lang);
  const note = pressNote(trial, lang);
  return (
    `<section aria-labelledby="press-result-h"><h${h} id="press-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    pressSummary(trial, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (st.count === 0
      ? ''
      : `<h${h + 1} id="press-may-h">${tx('may', lang)}</h${h + 1}>` +
        (findings.length === 0 ? `<p>${tx('none', lang)}</p>` : `<ul>${findings.map((f) => `<li>${escapeHtml(f.text)}</li>`).join('')}</ul>`) +
        settings.map((line) => `<p>${escapeHtml(line)}</p>`).join('') +
        tableHtml(trial, lang)) +
    `<p>${tx('limit', lang)}</p>` +
    (note === '' ? '' : `<p>${tx('barrier', lang)}</p><p><strong>${escapeHtml(note)}</strong></p>`) +
    `<p class="press-actions"><button type="button" data-action="press-copy">${tx('copy', lang)}</button> <button type="button" data-action="press-again">${tx('again', lang)}</button></p></section>`
  );
}

export function renderPressPanel(lang: Lang, s: PressPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  const phase = s.trial.phase;
  return (
    `<div class="press"><style>${PRESS_CSS}</style>` +
    `<h${h} id="press-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    (phase === 'idle' ? `<p class="press-actions"><button type="button" data-action="press-start">${tx('start', lang)}</button></p>` : '') +
    (phase === 'running' ? runningHtml(s, lang, h + 1) : '') +
    (phase === 'done' ? resultHtml(s, lang, h + 1) : '') +
    '</div>'
  );
}

export type PressAction = 'press-start' | 'press-stop' | 'press-again';

export function isPressAction(action: string | null): action is PressAction {
  return action === 'press-start' || action === 'press-stop' || action === 'press-again';
}

export interface PressStep {
  readonly state: PressPanelState;
  readonly focus: string;
}

export function pressStep(s: PressPanelState, action: PressAction, lang: Lang): PressStep {
  if (action === 'press-stop') {
    if (s.trial.phase !== 'running') return { state: s, focus: '' };
    return { state: { trial: stopPress(s.trial), notice: T.stoppedNotice[lang] }, focus: '#press-result-h' };
  }
  return { state: { trial: startPress(), notice: T.started[lang] }, focus: '#press-pad' };
}

/** How an event came: touch, a pointer or a key. Null for an event the test does not count. */
export function viaOf(e: PressEvent): PressVia | null {
  if (e.type === 'keydown' || e.type === 'keyup') return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' ? 'key' : null;
  if (e.type === 'pointerdown' || e.type === 'pointerup') {
    if (e.isPrimary === false) return null;
    if (e.pointerType === 'mouse' && e.button !== undefined && e.button !== 0) return null;
    return e.pointerType === 'touch' ? 'touch' : 'pointer';
  }
  return null;
}

const onPad = (target: unknown): boolean => {
  const t = target as { getAttribute?(n: string): string | null; closest?(s: string): unknown } | null;
  if (!t) return false;
  if (t.getAttribute?.('data-press') === 'pad') return true;
  return Boolean(t.closest?.('[data-press="pad"]'));
};

/** What one event does to the test: a press going down or up on the pad, or a cancel. */
export function pressEvent(s: PressState, e: PressEvent, now: () => number): PressState {
  if (s.phase !== 'running') return s;
  if (e.type === 'pointercancel') return pressCancel(s);
  const via = viaOf(e);
  if (via === null) return s;
  const at = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : now();
  if (e.type === 'keydown' || e.type === 'pointerdown') {
    if (!onPad(e.target)) return s;
    return pressDown(s, at, via, e.repeat === true);
  }
  // An up counts only for the press under way, and only in the way it went down.
  if (s.pending && s.pending.via !== via) return s;
  return pressUp(s, at);
}

export function mountPressPanel(opts: PressOptions): { getState(): PressPanelState } {
  const lang = opts.lang;
  const now = opts.now ?? ((): number => (globalThis as unknown as { performance?: { now(): number } }).performance?.now() ?? Date.now());
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  // A test that was running when the language changed starts over: its times were taken with the old page.
  let state: PressPanelState = opts.state ? { trial: opts.state.trial.phase === 'running' ? initialPress() : opts.state.trial, notice: '' } : initialPressPanel();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderPressPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  const onPress = (e: PressEvent): void => {
    if (state.trial.phase !== 'running') return;
    const before = state.trial;
    const after = pressEvent(before, e, now);
    if (after === before) return;
    // Keep the pad from opening a menu, selecting text or sending a click of its own.
    if (e.type === 'keydown' || e.type === 'pointerdown') e.preventDefault?.();
    state = { ...state, trial: after };
    if (after.samples.length === before.samples.length && after.phase === before.phase) return;
    if (after.phase === 'done') {
      state = { ...state, notice: T.doneNotice[lang] };
      render('#press-result-h');
      return;
    }
    const n = after.samples.length;
    state = { ...state, notice: lang === 'fr' ? `${n} sur ${PRESSES}.` : `${n} of ${PRESSES}.` };
    render('#press-pad');
  };
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'keydown', 'keyup']) opts.root.addEventListener(type, onPress);
  opts.root.addEventListener('contextmenu', (e) => {
    if (onPad(e.target)) e.preventDefault?.();
  });

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'press-copy') {
      const text = pressText(state.trial, lang);
      if (text === '') return;
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="press-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="press-copy"]');
      })();
      return;
    }
    if (!isPressAction(action)) return;
    const step = pressStep(state, action, lang);
    if (step.focus === '') return;
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => state };
}

export const pressPanel = { title: T.title, mount: mountPressPanel } as const;
