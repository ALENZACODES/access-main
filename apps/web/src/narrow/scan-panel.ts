import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { SCAN_ARGS, scanInPage, type ScanFacts } from './scan-inpage.js';
import {
  DEFAULT_SCAN,
  SCAN_INTERVALS,
  buildScan,
  costText,
  costliest,
  durationText,
  scanAdvice,
  scanNote,
  scanNotes,
  scanSettingsNote,
  scanSummary,
  settingsText,
  type ScanMode,
  type ScanModel,
  type ScanPace,
  type ScanSettings,
} from './scan-cost.js';

/**
 * "Switch scanning": the person sets how they scan (one by one or row by
 * row, auto scan at their speed or a press a step), and the panel counts the
 * steps, the time and the presses to reach each control of this page, the
 * main action first. Changing a setting counts again without reading the
 * page again.
 *
 * Every control is at least 44 CSS pixels each way, and the chosen settings
 * are said by aria-pressed. The page is read, never changed, and nothing is
 * stored or sent.
 */

export interface ScanRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface ScanPanelState {
  readonly settings: ScanSettings;
  /** True once the person changed a setting: the barrier text names their settings only then. */
  readonly chosen: boolean;
  readonly facts: ScanFacts | null;
  readonly notice: string;
}

export const initialScanState = (): ScanPanelState => ({ settings: DEFAULT_SCAN, chosen: false, facts: null, notice: '' });

export interface ScanOptions {
  readonly root: ScanRoot;
  readonly lang: Lang;
  readonly read?: () => ScanFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: ScanPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'Switch scanning', fr: 'Balayage par contacteur' },
  intro: {
    en: 'If you use one or two switches with scanning, set how you scan. The panel counts the steps, the time and the presses to reach each control of this page, the main action first.',
    fr: 'Si vous utilisez un ou deux contacteurs avec un balayage, indiquez comment vous balayez. Le panneau compte les étapes, le temps et les appuis pour atteindre chaque commande de cette page, l’action principale d’abord.',
  },
  kept: { en: 'The page is read, never changed. Nothing is stored or sent.', fr: 'La page est lue, jamais modifiée. Rien n’est enregistré ni envoyé.' },
  settings: { en: 'How you scan', fr: 'Comment vous balayez' },
  mode: { en: 'Order', fr: 'Ordre' },
  linear: { en: 'One by one, in tab order', fr: 'Un par un, dans l’ordre du clavier' },
  rows: { en: 'Row by row, then along the row', fr: 'Ligne par ligne, puis le long de la ligne' },
  pace: { en: 'Moving on', fr: 'Avancer' },
  auto: { en: 'Auto scan: it moves on by itself', fr: 'Défilement automatique' },
  step: { en: 'Step scan: one press a step', fr: 'Pas à pas${NBSP}: un appui par étape' },
  speed: { en: 'Time a step stays', fr: 'Durée d’une étape' },
  set: { en: 'Set:', fr: 'Choisi${NBSP}:' },
  page: { en: 'Scanning this page', fr: 'Balayer cette page' },
  read: { en: 'Count the steps on this page', fr: 'Compter les étapes de cette page' },
  readAgain: { en: 'Count again', fr: 'Compter de nouveau' },
  readDone: { en: 'The page was read.', fr: 'La page a été lue.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'Steps on this page', fr: 'Étapes dans cette page' },
  harder: { en: 'What may make it harder', fr: 'Ce qui peut compliquer' },
  longest: { en: 'The longest to reach', fr: 'Les plus longues à atteindre' },
  help: { en: 'What may help the team', fr: 'Ce qui peut aider l’équipe' },
  limit: {
    en: 'These counts are for this page as laid out on this screen, from the start of the page, with one press to select. A scanner may group controls another way, so its counts can differ.',
    fr: 'Ces comptes valent pour cette page telle qu’affichée sur cet écran, depuis le début de la page, avec un appui pour choisir. Un balayeur peut regrouper les commandes autrement, et ses comptes peuvent différer.',
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const raw = (key: Key, lang: Lang): string => T[key][lang].replace('${NBSP}', NBSP);
const tx = (key: Key, lang: Lang): string => escapeHtml(raw(key, lang));

export const SCAN_CSS =
  '.scancost{max-width:44rem}.scancost h2,.scancost h3,.scancost h4,.scancost h5{line-height:1.25}' +
  '.scancost button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.scancost button[aria-pressed="true"]{font-weight:700;border-width:3px}' +
  '.scancost .scan-group,.scancost .scan-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}' +
  '.scancost p,.scancost li{overflow-wrap:anywhere}' +
  '.scancost button:focus-visible,.scancost [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function scanModelOf(s: ScanPanelState): ScanModel | null {
  return s.facts ? buildScan(s.facts, s.settings) : null;
}

const choice = (action: string, value: string, label: string, pressed: boolean): string =>
  `<button type="button" data-action="${action}" data-value="${value}" aria-pressed="${pressed ? 'true' : 'false'}">${escapeHtml(label)}</button>`;

function settingsHtml(s: ScanPanelState, lang: Lang, h: number): string {
  const st = s.settings;
  const group = (id: string, head: Key, buttons: string): string => `<p id="${id}">${tx(head, lang)}</p><div class="scan-group" role="group" aria-labelledby="${id}">${buttons}</div>`;
  return (
    `<section aria-labelledby="scan-set-h"><h${h} id="scan-set-h">${tx('settings', lang)}</h${h}>` +
    group('scan-mode-l', 'mode', choice('scan-mode', 'linear', raw('linear', lang), st.mode === 'linear') + choice('scan-mode', 'row-column', raw('rows', lang), st.mode === 'row-column')) +
    group('scan-pace-l', 'pace', choice('scan-pace', 'auto', raw('auto', lang), st.pace === 'auto') + choice('scan-pace', 'step', raw('step', lang), st.pace === 'step')) +
    (st.pace === 'auto' ? group('scan-speed-l', 'speed', SCAN_INTERVALS.map((ms) => choice('scan-speed', String(ms), durationText(ms, lang), st.intervalMs === ms)).join('')) : '') +
    `<p>${tx('set', lang)} ${escapeHtml(settingsText(st, lang))}.</p></section>`
  );
}

function resultHtml(m: ScanModel, lang: Lang, h: number): string {
  const notes = scanNotes(m, lang);
  const longest = costliest(m);
  const advice = scanAdvice(m, lang);
  return (
    `<h${h} id="scan-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    scanSummary(m, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (notes.length === 0 ? '' : `<h${h + 1} id="scan-harder-h">${tx('harder', lang)}</h${h + 1}>${notes.map((n) => `<p>${escapeHtml(n.text)}</p>`).join('')}`) +
    (longest.length < 2 ? '' : `<h${h + 1} id="scan-longest-h">${tx('longest', lang)}</h${h + 1}><ol aria-labelledby="scan-longest-h">${longest.map((c) => `<li>${escapeHtml(costText(c, lang))}</li>`).join('')}</ol>`) +
    (advice.length === 0 ? '' : `<h${h + 1} id="scan-help-h">${tx('help', lang)}</h${h + 1}><ul aria-labelledby="scan-help-h">${advice.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="scan-actions"><button type="button" data-action="scan-copy">${tx('copy', lang)}</button></p>`
  );
}

export function renderScanPanel(lang: Lang, s: ScanPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  const m = scanModelOf(s);
  return (
    `<div class="scancost"><style>${SCAN_CSS}</style>` +
    `<h${h} id="scan-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    settingsHtml(s, lang, h + 1) +
    `<section aria-labelledby="scan-page-h"><h${h + 1} id="scan-page-h" tabindex="-1">${tx('page', lang)}</h${h + 1}>` +
    `<p class="scan-actions"><button type="button" data-action="scan-read">${tx(m ? 'readAgain' : 'read', lang)}</button></p>` +
    (m ? resultHtml(m, lang, h + 2) : '') +
    '</section></div>'
  );
}

/** The result as plain text: the settings, the summary, what may make it harder, every control's cost and the hints. */
export function scanResultText(s: ScanPanelState, lang: Lang): string {
  const m = scanModelOf(s);
  const lines: string[] = [T.title[lang]];
  if (!m) lines.push(`${settingsText(s.settings, lang)}.`);
  else {
    lines.push(...scanSummary(m, lang), ...scanNotes(m, lang).map((n) => n.text));
    if (m.costs.length > 0) lines.push('', ...m.costs.map((c) => `- ${costText(c, lang)}`));
    const advice = scanAdvice(m, lang);
    if (advice.length > 0) lines.push('', `${T.help[lang]}${lang === 'fr' ? `${NBSP}:` : ':'}`, ...advice.map((a) => `- ${a}`));
  }
  lines.push('', raw('limit', lang));
  return `${lines.join('\n')}\n`;
}

export type ScanAction = 'scan-mode' | 'scan-pace' | 'scan-speed' | 'scan-read';

export function isScanAction(a: string | null): a is ScanAction {
  return a === 'scan-mode' || a === 'scan-pace' || a === 'scan-speed' || a === 'scan-read';
}

export interface ScanStep {
  readonly state: ScanPanelState;
  readonly focus: string;
}

export function scanStep(s: ScanPanelState, action: ScanAction, value: string | null, lang: Lang, read: () => ScanFacts): ScanStep {
  if (action === 'scan-read') {
    try {
      return { state: { ...s, facts: read(), notice: T.readDone[lang] }, focus: '#scan-result-h' };
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#scan-page-h' };
    }
  }
  let settings: ScanSettings | null = null;
  if (action === 'scan-mode' && (value === 'linear' || value === 'row-column')) settings = { ...s.settings, mode: value as ScanMode };
  if (action === 'scan-pace' && (value === 'auto' || value === 'step')) settings = { ...s.settings, pace: value as ScanPace };
  if (action === 'scan-speed' && value !== null && SCAN_INTERVALS.includes(Number(value))) settings = { ...s.settings, intervalMs: Number(value) };
  if (!settings) return { state: s, focus: '' };
  // The speed buttons go away with step scan: focus then stays on the pace button pressed.
  return { state: { ...s, settings, chosen: true, notice: `${settingsText(settings, lang)}.` }, focus: `[data-action="${action}"][data-value="${value ?? ''}"]` };
}

/** One line for the barrier text, once the person set how they scan and the page was read. */
export function scanNoteOf(s: ScanPanelState, lang: Lang): string {
  return s.chosen ? scanNote(scanModelOf(s), lang) : '';
}

/** The person's settings for the access summary, once they set them; nothing about this page. */
export function scanSettingsNoteOf(s: ScanPanelState, lang: Lang): string {
  return s.chosen ? scanSettingsNote(s.settings, lang) : '';
}

/** The panel itself, so its own buttons are not counted with the page. */
export const SCAN_EXCLUDE = '.scancost';

export function mountScanPanel(opts: ScanOptions): { getState(): ScanPanelState; note(): string } {
  const lang = opts.lang;
  const read = opts.read ?? ((): ScanFacts => scanInPage({ ...SCAN_ARGS, exclude: SCAN_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: ScanPanelState = opts.state ? { ...opts.state, notice: '' } : initialScanState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderScanPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'scan-copy') {
      if (!state.facts) return;
      const text = scanResultText(state, lang);
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="scan-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="scan-copy"]');
      })();
      return;
    }
    if (!isScanAction(action)) return;
    const step = scanStep(state, action, target.getAttribute?.('data-value') ?? null, lang, read);
    if (step.focus === '') return;
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => state, note: () => scanNoteOf(state, lang) };
}

export const scanPanel = { title: T.title, mount: mountScanPanel } as const;
