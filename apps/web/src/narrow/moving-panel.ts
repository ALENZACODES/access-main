import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { MOVING_ARGS, movingLookInPage, type MovingLook } from './moving-inpage.js';
import { AIM_SECONDS, DEFAULT_AIM, MOVING_LISTED, aimNote, animationText, compareLooks, movedText, movingAdvice, movingNote, movingNotes, movingSummary, type MovingModel } from './moving.js';

/**
 * "Things that move": the person says how long they take to aim; the panel
 * looks at the page, waits that long, looks again, and says which controls
 * moved, appeared or went away, which animations never stop, whether a pause
 * button is there, and whether motion goes on when the device asks for less.
 *
 * Watching can be stopped at once. Every control is at least 44 CSS pixels
 * each way. The page is read, never changed, and nothing is stored or sent.
 */

export interface MovingRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface MovingPanelState {
  readonly aim: number;
  readonly chosen: boolean;
  readonly phase: 'idle' | 'watching' | 'done';
  readonly first: MovingLook | null;
  readonly model: MovingModel | null;
  readonly notice: string;
}

export const initialMovingState = (): MovingPanelState => ({ aim: DEFAULT_AIM, chosen: false, phase: 'idle', first: null, model: null, notice: '' });

export interface MovingOptions {
  readonly root: MovingRoot;
  readonly lang: Lang;
  readonly look?: () => MovingLook;
  readonly wait?: (ms: number) => Promise<void>;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: MovingPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'Things that move', fr: 'Ce qui bouge' },
  intro: {
    en: 'If you aim slowly, with a head pointer, eye gaze, dwell clicking or an unsteady hand, a control that moves can make you miss it or press something else. Say how long you take to aim; the panel watches this page for that long.',
    fr: 'Si vous visez lentement, avec un pointeur de tête, le regard, le clic par arrêt ou une main peu stable, une commande qui bouge peut vous faire la manquer ou appuyer sur autre chose. Indiquez le temps qu’il vous faut pour viser\u202F; le panneau observe cette page aussi longtemps.',
  },
  kept: { en: 'The page is read, never changed. Nothing is pressed, stored or sent.', fr: 'La page est lue, jamais modifiée. Rien n’est pressé, enregistré ni envoyé.' },
  aim: { en: 'How long you take to aim', fr: 'Votre temps pour viser' },
  watch: { en: 'Watch this page', fr: 'Observer cette page' },
  again: { en: 'Watch again', fr: 'Observer de nouveau' },
  stop: { en: 'Stop watching now', fr: 'Arrêter d’observer' },
  watching: { en: 'Watching', fr: 'Observation' },
  watchingFor: { en: 'Watching the page. You can leave the pointer where it is.', fr: 'Observation de la page. Vous pouvez laisser le pointeur où il est.' },
  done: { en: 'The watch is over. The result follows.', fr: 'L’observation est terminée. Le résultat suit.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What moved', fr: 'Ce qui a bougé' },
  harder: { en: 'What may make it hard to aim', fr: 'Ce qui peut gêner pour viser' },
  movedList: { en: 'Controls that moved', fr: 'Commandes qui ont bougé' },
  animList: { en: 'Animations running', fr: 'Animations en cours' },
  changed: { en: 'Controls that appeared or went away', fr: 'Commandes apparues ou disparues' },
  appeared: { en: 'Appeared:', fr: 'Apparue${NBSP}:' },
  gone: { en: 'Gone:', fr: 'Disparue${NBSP}:' },
  pause: { en: 'Buttons that may pause motion:', fr: 'Boutons qui peuvent arrêter le mouvement${NBSP}:' },
  help: { en: 'What may help the team', fr: 'Ce qui peut aider l’équipe' },
  limit: {
    en: 'This is two looks at this page on this screen. Something that moves only when you scroll, hover or wait longer is not seen, and a control the page rebuilds may count as gone and appeared.',
    fr: 'Ce sont deux lectures de cette page sur cet écran. Ce qui ne bouge qu’au défilement, au survol ou après une plus longue attente n’est pas vu, et une commande que la page refait peut compter comme disparue puis apparue.',
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const raw = (key: Key, lang: Lang): string => T[key][lang].replace('${NBSP}', NBSP);
const tx = (key: Key, lang: Lang): string => escapeHtml(raw(key, lang));
const secs = (s: number, lang: Lang): string => (lang === 'fr' ? `${s}${NBSP}s` : `${s} s`);

export const MOVING_CSS =
  '.moving{max-width:44rem}.moving h2,.moving h3,.moving h4,.moving h5{line-height:1.25}' +
  '.moving button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.moving button[aria-pressed="true"]{font-weight:700;border-width:3px}' +
  '.moving .moving-group,.moving .moving-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}' +
  '.moving p,.moving li{overflow-wrap:anywhere}' +
  '.moving button:focus-visible,.moving [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

function resultHtml(s: MovingPanelState, m: MovingModel, lang: Lang, h: number): string {
  const notes = movingNotes(m, lang);
  const advice = movingAdvice(m, lang);
  const moved = m.moved.slice(0, MOVING_LISTED);
  const anims = m.animations ? [...m.animations].sort((a, b) => Number(b.endless) - Number(a.endless) || Number(b.control) - Number(a.control)).slice(0, MOVING_LISTED) : [];
  const changed = [...m.appeared.map((c) => `${raw('appeared', lang)} ${c.name || 'UNKNOWN'}`), ...m.gone.map((c) => `${raw('gone', lang)} ${c.name || 'UNKNOWN'}`)].slice(0, MOVING_LISTED);
  const list = (id: string, head: Key, items: string[], tag: 'ul' | 'ol' = 'ul'): string =>
    items.length === 0 ? '' : `<h${h + 1} id="${id}">${tx(head, lang)}</h${h + 1}><${tag} aria-labelledby="${id}">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</${tag}>`;
  return (
    `<section aria-labelledby="moving-result-h"><h${h} id="moving-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    movingSummary(m, s.aim, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (notes.length === 0 ? '' : `<h${h + 1} id="moving-harder-h">${tx('harder', lang)}</h${h + 1}>${notes.map((n) => `<p>${escapeHtml(n.text)}</p>`).join('')}`) +
    list(
      'moving-moved-h',
      'movedList',
      moved.map((x) => movedText(x, lang)),
    ) +
    list(
      'moving-anim-h',
      'animList',
      anims.map((a) => animationText(a, lang)),
    ) +
    list('moving-changed-h', 'changed', changed) +
    (m.pauseControls.length === 0 ? '' : `<p>${tx('pause', lang)} ${escapeHtml(m.pauseControls.join(', '))}.</p>`) +
    list('moving-help-h', 'help', advice) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="moving-actions"><button type="button" data-action="moving-copy">${tx('copy', lang)}</button></p></section>`
  );
}

export function renderMovingPanel(lang: Lang, s: MovingPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  const aimButtons = AIM_SECONDS.map(
    (n) => `<button type="button" data-action="moving-aim" data-value="${n}" aria-pressed="${s.aim === n ? 'true' : 'false'}">${escapeHtml(secs(n, lang))}</button>`,
  ).join('');
  const watching =
    s.phase === 'watching'
      ? `<section aria-labelledby="moving-watch-h"><h${h + 1} id="moving-watch-h" tabindex="-1">${tx('watching', lang)}</h${h + 1}><p>${tx('watchingFor', lang)}</p>` +
        `<p class="moving-actions"><button type="button" data-action="moving-stop">${tx('stop', lang)}</button></p></section>`
      : `<p class="moving-actions"><button type="button" data-action="moving-watch">${tx(s.phase === 'done' ? 'again' : 'watch', lang)}</button></p>`;
  return (
    `<div class="moving"><style>${MOVING_CSS}</style>` +
    `<h${h} id="moving-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    `<p id="moving-aim-l">${tx('aim', lang)}</p><div class="moving-group" role="group" aria-labelledby="moving-aim-l">${aimButtons}</div>` +
    watching +
    (s.phase === 'done' && s.model ? resultHtml(s, s.model, lang, h + 1) : '') +
    '</div>'
  );
}

/** The result as plain text: everything found, not only what is listed on screen. */
export function movingResultText(s: MovingPanelState, lang: Lang): string {
  const lines: string[] = [T.title[lang]];
  const m = s.model;
  if (m) {
    lines.push(...movingSummary(m, s.aim, lang), ...movingNotes(m, lang).map((n) => n.text));
    if (m.moved.length > 0) lines.push('', ...m.moved.map((x) => `- ${movedText(x, lang)}`));
    if (m.animations && m.animations.length > 0) lines.push('', ...m.animations.map((a) => `- ${animationText(a, lang)}`));
    for (const c of m.appeared) lines.push(`- ${raw('appeared', lang)} ${c.name || 'UNKNOWN'}`);
    for (const c of m.gone) lines.push(`- ${raw('gone', lang)} ${c.name || 'UNKNOWN'}`);
    if (m.pauseControls.length > 0) lines.push(`${raw('pause', lang)} ${m.pauseControls.join(', ')}.`);
    const advice = movingAdvice(m, lang);
    if (advice.length > 0) lines.push('', `${T.help[lang]}${lang === 'fr' ? `${NBSP}:` : ':'}`, ...advice.map((a) => `- ${a}`));
  }
  lines.push('', T.limit[lang]);
  return `${lines.join('\n')}\n`;
}

/** Sets how long the person takes to aim. */
export function movingAim(s: MovingPanelState, value: string | null): MovingPanelState | null {
  const n = Number(value);
  if (value === null || !AIM_SECONDS.includes(n)) return null;
  return { ...s, aim: n, chosen: true, model: s.model, notice: '' };
}

/** Starts watching with the first look. */
export function movingStart(s: MovingPanelState, look: MovingLook, lang: Lang): MovingPanelState {
  return { ...s, phase: 'watching', first: look, notice: T.watchingFor[lang] };
}

/** Ends watching with the second look. */
export function movingFinish(s: MovingPanelState, look: MovingLook, lang: Lang): MovingPanelState {
  if (s.phase !== 'watching' || !s.first) return s;
  return { ...s, phase: 'done', model: compareLooks(s.first, look), first: null, notice: T.done[lang] };
}

export function movingFailed(s: MovingPanelState, err: unknown, lang: Lang): MovingPanelState {
  const why = err instanceof Error ? err.message : String(err);
  return { ...s, phase: s.model ? 'done' : 'idle', first: null, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` };
}

/** One line for the barrier text, once a watch is over. */
export function movingNoteOf(s: MovingPanelState, lang: Lang): string {
  return s.phase === 'done' ? movingNote(s.model, s.aim, lang) : '';
}

/** The person's time to aim for the access summary, once they chose it or watched with it; nothing about this page. */
export function movingAimNoteOf(s: MovingPanelState, lang: Lang): string {
  return s.chosen || s.phase === 'done' ? aimNote(s.aim, lang) : '';
}

/** The panel itself, so its own buttons are not counted with the page. */
export const MOVING_EXCLUDE = '.moving';

export function mountMovingPanel(opts: MovingOptions): { getState(): MovingPanelState; note(): string } {
  const lang = opts.lang;
  const look = opts.look ?? ((): MovingLook => movingLookInPage({ ...MOVING_ARGS, exclude: MOVING_EXCLUDE }));
  const wait = opts.wait ?? ((ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms)));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  // A watch that was running when the language changed is dropped: the time it covered would be wrong.
  let state: MovingPanelState = opts.state ? (opts.state.phase === 'watching' ? { ...opts.state, phase: opts.state.model ? 'done' : 'idle', first: null, notice: '' } : { ...opts.state, notice: '' }) : initialMovingState();
  // Each watch has a number; a wait that ends after a stop, or a new watch, does nothing.
  let watchNo = 0;

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderMovingPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };
  const finish = (): void => {
    try {
      state = movingFinish(state, look(), lang);
    } catch (err) {
      state = movingFailed(state, err, lang);
    }
    render(state.phase === 'done' ? '#moving-result-h' : '[data-action="moving-watch"]');
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'moving-aim') {
      const value = target.getAttribute?.('data-value') ?? null;
      const next = movingAim(state, value);
      if (!next || state.phase === 'watching') return;
      state = next;
      render(`[data-action="moving-aim"][data-value="${value ?? ''}"]`);
      return;
    }
    if (action === 'moving-watch') {
      if (state.phase === 'watching') return;
      // The watching section is drawn before the first look, and nothing is drawn again before the
      // second, so the panel itself does not move the page between the looks.
      const previous = state;
      state = { ...state, phase: 'watching', first: null, notice: T.watchingFor[lang] };
      render('#moving-watch-h');
      try {
        state = movingStart(state, look(), lang);
      } catch (err) {
        state = movingFailed(previous, err, lang);
        render('[data-action="moving-watch"]');
        return;
      }
      const no = ++watchNo;
      void wait(state.aim * 1_000).then(() => {
        if (no === watchNo && state.phase === 'watching') finish();
      });
      return;
    }
    if (action === 'moving-stop') {
      if (state.phase !== 'watching') return;
      watchNo += 1;
      finish();
      return;
    }
    if (action === 'moving-copy') {
      if (state.phase !== 'done' || !state.model) return;
      const text = movingResultText(state, lang);
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="moving-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="moving-copy"]');
      })();
    }
  });
  render();
  return { getState: () => state, note: () => movingNoteOf(state, lang) };
}

export const movingPanel = { title: T.title, mount: mountMovingPanel } as const;
