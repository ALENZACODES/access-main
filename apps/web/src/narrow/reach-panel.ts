import { REACH_ARGS, reachInPage, type ReachFacts } from './reach-inpage.js';
import { LANDMARK_LABELS, MAX_INTERVAL, MIN_INTERVAL, buildReach, findStops, reachNotes, reachSummary, reachText, readInterval, scanSeconds, secondsText, stopName, type ReachModel } from './reach.js';
import { escapeHtml } from './report.js';
import { NBSP, num, type Lang } from './types.js';

/**
 * "Reaching controls by keyboard or switch": a panel that counts the presses
 * it takes to reach each control of the page with the Tab key, or with a
 * switch that steps through the same order, and, once the person gives the
 * interval of their switch, how long an automatic scan takes to get there.
 *
 * It reads the page and changes nothing on it: focus is not moved. Every
 * control is at least 44 CSS pixels each way, and nothing is stored or sent.
 */

export interface ReachRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void; value?: string } | null;
}

export interface ReachPanelState {
  readonly model: ReachModel | null;
  /** The interval as typed. */
  readonly intervalText: string;
  /** The interval in use, in seconds, or null when none is given. */
  readonly interval: number | null;
  readonly intervalError: string;
  readonly find: string;
  readonly notice: string;
}

export const initialReachState = (): ReachPanelState => ({ model: null, intervalText: '', interval: null, intervalError: '', find: '', notice: '' });

export interface ReachOptions {
  readonly root: ReachRoot;
  readonly lang: Lang;
  /** Reads the stops of the page. Defaults to the document, leaving out this panel. */
  readonly read?: () => ReachFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: ReachPanelState;
  readonly headingLevel?: 2 | 3;
}

/** Rows shown in the table of stops. More are found by typing part of a name. */
export const MAX_ROWS = 25;

const T = {
  title: { en: 'Reaching controls by keyboard or switch', fr: 'Atteindre les commandes au clavier ou au contacteur' },
  intro: {
    en: 'Counts the presses it takes to reach each control of this page with the Tab key, or with a switch that steps through the same order, from the top of the page. Give the interval of your switch scan to see how long it takes.',
    fr: 'Compte les appuis nécessaires pour atteindre chaque commande de cette page avec la touche Tab, ou avec un contacteur qui suit le même ordre, depuis le haut de la page. Indiquez l’intervalle de balayage de votre contacteur pour voir le temps que cela prend.',
  },
  kept: { en: 'This reads the page and moves nothing. Nothing is stored or sent.', fr: 'Ce panneau lit la page et ne déplace rien. Rien n’est enregistré ni envoyé.' },
  count: { en: 'Count the stops on this page', fr: 'Compter les arrêts de cette page' },
  again: { en: 'Count again', fr: 'Compter de nouveau' },
  counted: { en: 'The stops were counted.', fr: 'Les arrêts ont été comptés.' },
  failed: { en: 'The stops could not be counted', fr: 'Les arrêts n’ont pas pu être comptés' },
  result: { en: 'What was counted', fr: 'Ce qui a été compté' },
  notes: { en: 'Points to look at', fr: 'Points à regarder' },
  landmarks: { en: 'Where each part of the page starts', fr: 'Où commence chaque partie de la page' },
  part: { en: 'Part', fr: 'Partie' },
  firstStop: { en: 'First control', fr: 'Première commande' },
  pressesCol: { en: 'Presses', fr: 'Appuis' },
  stopsCol: { en: 'Stops', fr: 'Arrêts' },
  time: { en: 'Scan time', fr: 'Temps de balayage' },
  settings: { en: 'Find a control, and time a scan', fr: 'Trouver une commande et chronométrer un balayage' },
  interval: { en: 'Interval of my switch scan, in seconds', fr: 'Intervalle de balayage de mon contacteur, en secondes' },
  intervalHint: {
    en: `From ${num(MIN_INTERVAL, 'en', 1)} to ${MAX_INTERVAL}. Leave it empty if you do not use an automatic scan. The time then stays UNKNOWN.`,
    fr: `De ${num(MIN_INTERVAL, 'fr', 1)} à ${MAX_INTERVAL}. Laissez vide si vous n’utilisez pas de balayage automatique. Le temps reste alors UNKNOWN.`,
  },
  find: { en: 'Part of the name of a control', fr: 'Une partie du nom d’une commande' },
  findHint: { en: 'For example Search or Help. Leave it empty to see the first controls.', fr: 'Par exemple Recherche ou Aide. Laissez vide pour voir les premières commandes.' },
  apply: { en: 'Show these stops', fr: 'Afficher ces arrêts' },
  applied: { en: 'The table was updated.', fr: 'Le tableau a été mis à jour.' },
  stops: { en: 'Stops', fr: 'Arrêts' },
  order: { en: 'Order', fr: 'Ordre' },
  control: { en: 'Control', fr: 'Commande' },
  part2: { en: 'Part of the page', fr: 'Partie de la page' },
  none: { en: 'No control has a name with that text.', fr: 'Aucune commande n’a un nom qui contient ce texte.' },
  limit: {
    en: 'These counts start at the top of the page and go forward, one step at a time. A switch that scans by rows or groups may take fewer steps. The counts do not say whether the page is easy to use.',
    fr: 'Ces comptes partent du haut de la page et vont vers l’avant, un pas à la fois. Un contacteur qui balaie par rangées ou par groupes peut demander moins de pas. Les comptes ne disent pas si la page est facile à utiliser.',
  },
  copy: { en: 'Copy the counts', fr: 'Copier les comptes' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const REACH_CSS =
  '.reach{max-width:44rem}.reach h2,.reach h3,.reach h4{line-height:1.25}' +
  '.reach label{display:block;font-weight:600;margin-top:12px}' +
  '.reach .reach-field{display:block;width:100%;max-width:20rem;min-height:44px;box-sizing:border-box;font:inherit;padding:8px}' +
  '.reach button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.reach .reach-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.reach .reach-error{font-weight:600}.reach [aria-invalid="true"]{outline:3px solid currentColor;outline-offset:2px}' +
  '.reach table{border-collapse:collapse;width:100%;table-layout:fixed}.reach caption{text-align:left;padding:4px 0}' +
  '.reach th,.reach td{border:1px solid currentColor;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
  '.reach .reach-n{width:4.5rem}' +
  '.reach p,.reach li{overflow-wrap:anywhere}' +
  '.reach button:focus-visible,.reach input:focus-visible,.reach [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

function landmarksTable(model: ReachModel, state: ReachPanelState, lang: Lang): string {
  const rows = model.landmarks
    .map(
      (l) =>
        `<tr><th scope="row">${escapeHtml(LANDMARK_LABELS[l.landmark][lang])}</th><td>${escapeHtml(stopName(l.first, lang))}</td><td>${l.first.best}</td><td>${l.stops}</td><td>${escapeHtml(secondsText(scanSeconds(l.first.best, state.interval), lang))}</td></tr>`,
    )
    .join('');
  return (
    `<table><caption>${tx('landmarks', lang)}</caption><thead><tr><th scope="col">${tx('part', lang)}</th><th scope="col">${tx('firstStop', lang)}</th>` +
    `<th scope="col" class="reach-n">${tx('pressesCol', lang)}</th><th scope="col" class="reach-n">${tx('stopsCol', lang)}</th><th scope="col">${tx('time', lang)}</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function stopsTable(model: ReachModel, state: ReachPanelState, lang: Lang): string {
  const found = findStops(model, state.find);
  if (found.length === 0) return `<p>${tx('none', lang)}</p>`;
  const shown = found.slice(0, MAX_ROWS);
  const rows = shown
    .map(
      (s) =>
        `<tr><td>${s.index + 1}</td><th scope="row">${escapeHtml(stopName(s, lang))}</th><td>${escapeHtml(LANDMARK_LABELS[s.stop.landmark][lang])}</td><td>${s.best}${s.viaSkip !== null ? escapeHtml(lang === 'fr' ? ` (${s.direct} sans le lien d’évitement)` : ` (${s.direct} without the skip link)`) : ''}</td><td>${escapeHtml(secondsText(scanSeconds(s.best, state.interval), lang))}</td></tr>`,
    )
    .join('');
  const more = found.length - shown.length;
  const caption = lang === 'fr' ? `${T.stops.fr}${NBSP}: ${shown.length} sur ${found.length}` : `${T.stops.en}: ${shown.length} of ${found.length}`;
  return (
    `<table><caption>${escapeHtml(caption)}</caption><thead><tr><th scope="col" class="reach-n">${tx('order', lang)}</th><th scope="col">${tx('control', lang)}</th><th scope="col">${tx('part2', lang)}</th>` +
    `<th scope="col">${tx('pressesCol', lang)}</th><th scope="col">${tx('time', lang)}</th></tr></thead><tbody>${rows}</tbody></table>` +
    (more > 0
      ? `<p>${escapeHtml(lang === 'fr' ? `… et ${more} de plus. Saisissez une partie d’un nom pour en trouver une.` : `… and ${more} more. Type part of a name to find one.`)}</p>`
      : '')
  );
}

function resultSection(state: ReachPanelState, lang: Lang, h: number): string {
  const model = state.model;
  if (!model) return '';
  const notes = reachNotes(model, lang);
  const err = state.intervalError;
  return (
    `<section aria-labelledby="reach-result-h"><h${h} id="reach-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    reachSummary(model, state.interval, lang)
      .map((s) => `<p>${escapeHtml(s)}</p>`)
      .join('') +
    (notes.length === 0 ? '' : `<h${h + 1} id="reach-notes-h">${tx('notes', lang)}</h${h + 1}><ul>${notes.map((n) => `<li>${escapeHtml(n.text)}</li>`).join('')}</ul>`) +
    (model.stops.length === 0 ? '' : landmarksTable(model, state, lang)) +
    `<h${h + 1} id="reach-find-h">${tx('settings', lang)}</h${h + 1}>` +
    `<label for="reach-interval">${tx('interval', lang)}</label><p id="reach-interval-hint">${tx('intervalHint', lang)}</p>` +
    `<input class="reach-field" type="text" inputmode="decimal" id="reach-interval" name="reach-interval" value="${escapeHtml(state.intervalText)}" autocomplete="off" spellcheck="false" aria-describedby="reach-interval-hint${err ? ' reach-interval-error' : ''}"${err ? ' aria-invalid="true"' : ''}>` +
    (err ? `<p class="reach-error" id="reach-interval-error">${escapeHtml(err)}</p>` : '') +
    `<label for="reach-find">${tx('find', lang)}</label><p id="reach-find-hint">${tx('findHint', lang)}</p>` +
    `<input class="reach-field" type="text" id="reach-find" name="reach-find" value="${escapeHtml(state.find)}" autocomplete="off" spellcheck="false" aria-describedby="reach-find-hint">` +
    `<p class="reach-actions"><button type="button" data-action="reach-apply">${tx('apply', lang)}</button></p>` +
    (model.stops.length === 0 ? '' : stopsTable(model, state, lang)) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="reach-actions"><button type="button" data-action="reach-copy">${tx('copy', lang)}</button> <button type="button" data-action="reach-count">${tx('again', lang)}</button></p>` +
    '</section>'
  );
}

export function renderReachPanel(lang: Lang, state: ReachPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="reach"><style>${REACH_CSS}</style>` +
    `<h${h} id="reach-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` +
    (state.model ? '' : `<p class="reach-actions"><button type="button" data-action="reach-count">${tx('count', lang)}</button></p>`) +
    resultSection(state, lang, h + 1) +
    '</div>'
  );
}

export type ReachAction = 'reach-count' | 'reach-apply';

export function isReachAction(action: string | null): action is ReachAction {
  return action === 'reach-count' || action === 'reach-apply';
}

export interface ReachStep {
  readonly state: ReachPanelState;
  readonly focus: string;
}

/** What an action does. The state passed in already holds what is in the two fields. */
export function reachStep(state: ReachPanelState, action: ReachAction, lang: Lang, read: () => ReachFacts): ReachStep {
  if (action === 'reach-count') {
    try {
      return { state: { ...state, model: buildReach(read()), notice: T.counted[lang] }, focus: '#reach-result-h' };
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return { state: { ...state, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#reach-h' };
    }
  }
  const got = readInterval(state.intervalText, lang);
  if (!got.ok) return { state: { ...state, intervalError: got.error, notice: got.error }, focus: '#reach-interval' };
  return { state: { ...state, interval: got.seconds, intervalError: '', notice: T.applied[lang] }, focus: '[data-action="reach-apply"]' };
}

/** The panel itself, so its own controls are not counted with the page. */
export const REACH_EXCLUDE = '.reach';

export function mountReachPanel(opts: ReachOptions): { getState(): ReachPanelState } {
  const lang = opts.lang;
  const read = opts.read ?? ((): ReachFacts => reachInPage({ ...REACH_ARGS, exclude: REACH_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  // The error and the notice were written in the other language: the counts and what was typed stay, the messages go, and the interval is read again.
  let state: ReachPanelState = opts.state ? { ...opts.state, notice: '', intervalError: '' } : initialReachState();
  if (opts.state && opts.state.intervalError !== '') {
    const again = readInterval(opts.state.intervalText, lang);
    state = again.ok ? { ...state, interval: again.seconds } : { ...state, intervalError: again.error };
  }

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderReachPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };
  const readFields = (): ReachPanelState => {
    const q = opts.root.querySelector?.bind(opts.root);
    if (!q) return state;
    return { ...state, intervalText: q('#reach-interval')?.value ?? state.intervalText, find: q('#reach-find')?.value ?? state.find };
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'reach-copy') {
      state = readFields();
      if (!state.model) return;
      const text = reachText(state.model, state.interval, lang);
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="reach-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="reach-copy"]');
      })();
      return;
    }
    if (!isReachAction(action)) return;
    const step = reachStep(readFields(), action, lang, read);
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => readFields() };
}

export const reachPanel = { title: T.title, mount: mountReachPanel } as const;
