import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { CELLS, COLS, ROWS, ZONE_PRESETS, allCells, presetCells, type ZonePreset, busiestText, cellName, checkZones, controlName, markedCount, noCells, toggleCell, whyText, zoneCounts, zoneNotes, zoneSummary, zonesText, type ZoneCheck } from './zones.js';
import { ZONE_ARGS, zonesInPage, type ZoneFacts } from './zones-inpage.js';

/**
 * "Screen zones I can reach": the person marks, on a grid of the window, the
 * zones they can reach, then the panel lists the controls of the page that
 * cannot be brought into one of them, by scrolling or not.
 *
 * It reads the page and changes nothing on it: it does not scroll and moves
 * no focus outside the panel. Every control is at least 44 CSS pixels each
 * way, and nothing is stored or sent.
 */

export interface ZonesRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface ZonesState {
  readonly cells: readonly boolean[];
  /** What was read of the page, or null before the first check. */
  readonly facts: ZoneFacts | null;
  readonly error: string;
  readonly notice: string;
}

export const initialZonesState = (): ZonesState => ({ cells: noCells(), facts: null, error: '', notice: '' });

export interface ZonesOptions {
  readonly root: ZonesRoot;
  readonly lang: Lang;
  /** Reads the controls of the page. Defaults to the document, leaving out this panel. */
  readonly read?: () => ZoneFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: ZonesState;
  readonly headingLevel?: 2 | 3;
}

/** Controls listed in the panel. The copied text holds more. */
export const ZONES_MAX_LISTED = 20;

const T = {
  title: { en: 'Screen zones I can reach', fr: 'Zones de l’écran que j’atteins' },
  intro: {
    en: 'Mark the parts of this window you can reach with the hand, finger, stylus or pointer you use. The panel then lists the controls of this page that cannot be brought into one of them, even by scrolling.',
    fr: 'Cochez les parties de cette fenêtre que vous atteignez avec la main, le doigt, le stylet ou le pointeur que vous utilisez. Le panneau liste ensuite les commandes de cette page qui ne peuvent pas y être amenées, même en faisant défiler.',
  },
  kept: { en: 'This reads the page and moves nothing. Nothing is stored or sent.', fr: 'Ce panneau lit la page et ne déplace rien. Rien n’est enregistré ni envoyé.' },
  grid: { en: 'Zones of the window, from the top', fr: 'Zones de la fenêtre, depuis le haut' },
  gridHint: {
    en: 'Each button is one zone, in the same place as on the window. Press it to mark it, and again to unmark it.',
    fr: 'Chaque bouton est une zone, à la même place que sur la fenêtre. Appuyez pour la cocher, et de nouveau pour la décocher.',
  },
  all: { en: 'Mark every zone', fr: 'Cocher toutes les zones' },
  clear: { en: 'Unmark every zone', fr: 'Décocher toutes les zones' },
  presets: { en: 'Or mark a set of zones in one press, in place of the zones marked now:', fr: 'Ou cochez un ensemble de zones d’un seul appui, à la place des zones cochées maintenant\u00A0:' },
  'preset-bottom': { en: 'Bottom half', fr: 'Moitié du bas' },
  'preset-left': { en: 'Left column', fr: 'Colonne de gauche' },
  'preset-right': { en: 'Right column', fr: 'Colonne de droite' },
  check: { en: 'Find the controls out of reach', fr: 'Trouver les commandes hors d’atteinte' },
  again: { en: 'Read the page again', fr: 'Relire la page' },
  needZone: { en: 'Mark at least one zone you can reach first.', fr: 'Cochez d’abord au moins une zone que vous atteignez.' },
  checked: { en: 'The controls of this page were read.', fr: 'Les commandes de cette page ont été lues.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What was found', fr: 'Ce qui a été trouvé' },
  outList: { en: 'Controls out of reach', fr: 'Commandes hors d’atteinte' },
  counts: { en: 'Controls each zone can take, by scrolling if needed', fr: 'Commandes que chaque zone peut recevoir, en faisant défiler au besoin' },
  row: { en: 'Row', fr: 'Rangée' },
  notes: { en: 'Points to look at', fr: 'Points à regarder' },
  limit: {
    en: 'The zones are the ones you marked, on this screen, today. The centre of each control is what counts. Nothing here says what you can or cannot do.',
    fr: 'Les zones sont celles que vous avez cochées, sur cet écran, aujourd’hui. Le centre de chaque commande est ce qui compte. Rien ici ne dit ce que vous pouvez faire ou non.',
  },
  barrier: {
    en: 'The zones you marked go into the barrier text of the form “Tell us about a barrier”, above, with the screen settings.',
    fr: 'Les zones cochées vont dans le texte de l’obstacle du formulaire «\u202FSignaler un obstacle\u202F», plus haut, avec les réglages de l’écran.',
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const ZONES_CSS =
  '.zones{max-width:44rem}.zones h2,.zones h3,.zones h4{line-height:1.25}' +
  `.zones .zones-grid{display:grid;grid-template-columns:repeat(${COLS},minmax(44px,1fr));gap:4px;margin:8px 0;padding:0;list-style:none;max-width:24rem}` +
  '.zones .zones-grid li{display:flex}' +
  '.zones button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.zones .zones-grid button{width:100%;min-height:56px;padding:6px;text-align:center;border:1px solid currentColor}' +
  '.zones .zones-grid button[aria-pressed="true"]{border-width:4px;font-weight:700}' +
  '.zones .zones-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.zones .zones-error{font-weight:600}' +
  '.zones table{border-collapse:collapse;width:100%;max-width:24rem;table-layout:fixed;margin-top:12px}.zones caption{text-align:left;padding:4px 0}' +
  '.zones th,.zones td{border:1px solid currentColor;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
  '.zones p,.zones li{overflow-wrap:anywhere}' +
  '.zones button:focus-visible,.zones [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

function gridHtml(state: ZonesState, lang: Lang): string {
  const items = Array.from({ length: CELLS }, (_, i) => {
    const on = state.cells[i] === true;
    return `<li><button type="button" data-action="zone-${i}" aria-pressed="${on ? 'true' : 'false'}">${on ? '<span aria-hidden="true">✓ </span>' : ''}${escapeHtml(cellName(i, lang))}</button></li>`;
  }).join('');
  const err = state.error;
  return (
    `<p id="zones-grid-h"><strong>${tx('grid', lang)}</strong></p><p id="zones-grid-hint">${tx('gridHint', lang)}</p>` +
    `<ul class="zones-grid" role="list" aria-labelledby="zones-grid-h" aria-describedby="zones-grid-hint${err ? ' zones-error' : ''}">${items}</ul>` +
    (err ? `<p class="zones-error" id="zones-error">${escapeHtml(err)}</p>` : '') +
    `<p class="zones-actions"><button type="button" data-action="zones-all">${tx('all', lang)}</button> <button type="button" data-action="zones-clear">${tx('clear', lang)}</button></p>` +
    `<p id="zones-presets-h">${tx('presets', lang)}</p>` +
    `<p class="zones-actions" role="group" aria-labelledby="zones-presets-h">${ZONE_PRESETS.map((p) => `<button type="button" data-action="zones-preset-${p}">${tx(`preset-${p}`, lang)}</button>`).join(' ')}</p>` +
    `<p class="zones-actions"><button type="button" data-action="zones-check">${tx(state.facts ? 'again' : 'check', lang)}</button></p>`
  );
}

export function zonesCheckOf(state: ZonesState): ZoneCheck | null {
  return state.facts ? checkZones(state.facts, state.cells) : null;
}

/** The number of controls each zone can take, as a table laid out like the grid. */
function countsHtml(state: ZonesState, lang: Lang): string {
  if (!state.facts) return '';
  const counts = zoneCounts(state.facts);
  if (!counts) return '';
  const colName = (c: number): string => {
    const name = cellName(c, lang).split(', ')[1] ?? '';
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const cols = Array.from({ length: COLS }, (_, c) => `<th scope="col">${escapeHtml(colName(c))}</th>`).join('');
  const rows = Array.from({ length: ROWS }, (_, r) => {
    const cells = Array.from({ length: COLS }, (_, c) => {
      const i = r * COLS + c;
      return `<td>${counts[i] ?? 0}${state.cells[i] === true ? escapeHtml(lang === 'fr' ? ' (cochée)' : ' (marked)') : ''}</td>`;
    }).join('');
    return `<tr><th scope="row">${escapeHtml(cellName(r * COLS, lang).split(', ')[0] ?? '')}</th>${cells}</tr>`;
  }).join('');
  return (
    `<table class="zones-counts"><caption>${tx('counts', lang)}</caption><thead><tr><th scope="col">${tx('row', lang)}</th>${cols}</tr></thead><tbody>${rows}</tbody></table>` +
    `<p>${escapeHtml(busiestText(state.facts, lang))}</p>`
  );
}

function resultHtml(state: ZonesState, lang: Lang, h: number): string {
  const check = zonesCheckOf(state);
  if (!check) return '';
  const notes = zoneNotes(check, lang);
  let list = '';
  if (check.kind === 'result' && check.result.out.length > 0) {
    const shown = check.result.out.slice(0, ZONES_MAX_LISTED);
    const more = check.result.out.length - shown.length;
    list =
      `<h${h + 1} id="zones-out-h">${tx('outList', lang)}</h${h + 1}><ul>` +
      shown.map((o) => `<li><strong>${escapeHtml(controlName(o.control, lang))}</strong>${lang === 'fr' ? `${NBSP}:` : ':'} ${escapeHtml(whyText(o, lang))}</li>`).join('') +
      '</ul>' +
      (more > 0 ? `<p>${escapeHtml(lang === 'fr' ? `… et ${more} de plus, dans le texte copié.` : `… and ${more} more, in the copied text.`)}</p>` : '');
  }
  return (
    `<section aria-labelledby="zones-result-h"><h${h} id="zones-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    zoneSummary(check, lang)
      .map((s) => `<p>${escapeHtml(s)}</p>`)
      .join('') +
    list +
    (notes.length === 0 ? '' : `<h${h + 1} id="zones-notes-h">${tx('notes', lang)}</h${h + 1}><ul>${notes.map((n) => `<li>${escapeHtml(n.text)}</li>`).join('')}</ul>`) +
    countsHtml(state, lang) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="zones-actions"><button type="button" data-action="zones-copy">${tx('copy', lang)}</button></p>` +
    '</section>'
  );
}

export function renderZonesPanel(lang: Lang, state: ZonesState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="zones"><style>${ZONES_CSS}</style>` +
    `<h${h} id="zones-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` +
    gridHtml(state, lang) +
    (markedCount(state.cells) > 0 ? `<p>${tx('barrier', lang)}</p>` : '') +
    resultHtml(state, lang, h + 1) +
    '</div>'
  );
}

export type ZonesAction = 'zones-all' | 'zones-clear' | 'zones-check' | `zone-${number}` | `zones-preset-${ZonePreset}`;

/** The set of a preset action, or null for another action. */
export function zonePresetOf(action: string | null): ZonePreset | null {
  const m = /^zones-preset-([a-z]+)$/.exec(action ?? '');
  const p = m?.[1] ?? '';
  return (ZONE_PRESETS as readonly string[]).includes(p) ? (p as ZonePreset) : null;
}

/** The cell of a zone action, or null for another action. */
export function zoneCellOf(action: string | null): number | null {
  const m = /^zone-(\d+)$/.exec(action ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n < CELLS ? n : null;
}

export function isZonesAction(action: string | null): action is ZonesAction {
  return action === 'zones-all' || action === 'zones-clear' || action === 'zones-check' || zoneCellOf(action) !== null || zonePresetOf(action) !== null;
}

export interface ZonesStep {
  readonly state: ZonesState;
  readonly focus: string;
}

export function zonesStep(state: ZonesState, action: ZonesAction, lang: Lang, read: () => ZoneFacts): ZonesStep {
  const cell = zoneCellOf(action);
  if (cell !== null) {
    const cells = toggleCell(state.cells, cell);
    return { state: { ...state, cells, error: markedCount(cells) > 0 ? '' : state.error, notice: '' }, focus: `[data-action="zone-${cell}"]` };
  }
  const preset = zonePresetOf(action);
  if (preset !== null) return { state: { ...state, cells: presetCells(preset), error: '', notice: '' }, focus: `[data-action="zones-preset-${preset}"]` };
  if (action === 'zones-all') return { state: { ...state, cells: allCells(), error: '', notice: '' }, focus: '[data-action="zones-all"]' };
  if (action === 'zones-clear') return { state: { ...state, cells: noCells(), notice: '' }, focus: '[data-action="zones-clear"]' };
  if (markedCount(state.cells) === 0) return { state: { ...state, error: T.needZone[lang], notice: T.needZone[lang] }, focus: '[data-action="zone-0"]' };
  try {
    return { state: { ...state, facts: read(), error: '', notice: T.checked[lang] }, focus: '#zones-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...state, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#zones-h' };
  }
}

/** The panel itself, so its own controls are not counted with the page. */
export const ZONES_EXCLUDE = '.zones';

export function mountZonesPanel(opts: ZonesOptions): { getState(): ZonesState } {
  const lang = opts.lang;
  const read = opts.read ?? ((): ZoneFacts => zonesInPage({ ...ZONE_ARGS, exclude: ZONES_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  // The notice and the error were written in the other language: the zones and what was read stay.
  let state: ZonesState = opts.state ? { ...opts.state, notice: '', error: opts.state.error === '' ? '' : T.needZone[lang] } : initialZonesState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderZonesPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null; closest?(s: string): { getAttribute(n: string): string | null } | null };
    // The check mark inside a zone button is a span, so the button is looked for from it.
    const action = target.getAttribute?.('data-action') ?? target.closest?.('[data-action]')?.getAttribute('data-action') ?? null;
    if (action === 'zones-copy') {
      const check = zonesCheckOf(state);
      if (!check) return;
      const text = zonesText(check, state.cells, lang, 40, state.facts);
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="zones-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="zones-copy"]');
      })();
      return;
    }
    if (!isZonesAction(action)) return;
    const step = zonesStep(state, action, lang, read);
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => state };
}

export const zonesPanel = { title: T.title, mount: mountZonesPanel } as const;
