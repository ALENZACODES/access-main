import { escapeHtml } from './report.js';
import type { Lang } from './types.js';
import { START_FIRST, START_INFO, START_PANELS, TOOLS, TOOL_NAMES, forText, isTool, startOrder, toolsNote, toolsText, type StartPanelKey, type ToolId } from './start.js';

/**
 * "Where to start": the person marks what they use to point and type, and
 * the panel lists the tests of this page that matter most for those tools,
 * each with a button that takes focus to it. It names tools only, never a
 * condition, and nothing is stored or sent.
 *
 * Every control is at least 44 CSS pixels each way, and what is marked is
 * said by aria-pressed.
 */

export interface StartRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface StartPanelState {
  readonly tools: readonly ToolId[];
  readonly notice: string;
}

export const initialStartState = (): StartPanelState => ({ tools: [], notice: '' });

export interface StartOptions {
  readonly root: StartRoot;
  readonly lang: Lang;
  /** Takes focus to a test. Without it, the buttons to go there are left out. */
  readonly go?: (key: StartPanelKey) => void;
  readonly state?: StartPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'Where to start', fr: 'Par où commencer' },
  intro: {
    en: 'This page has many tests. Mark what you use to point and type, and the tests that matter most for it come first.',
    fr: 'Cette page compte beaucoup de tests. Indiquez ce que vous utilisez pour pointer et taper, et les tests les plus utiles pour cela viennent en premier.',
  },
  kept: { en: 'Only tools are asked for, never a reason. Nothing is stored or sent.', fr: 'On ne demande que des outils, jamais une raison. Rien n’est enregistré ni envoyé.' },
  tools: { en: 'What do you use? Mark all that apply.', fr: 'Qu’utilisez-vous\u202F? Indiquez tout ce qui s’applique.' },
  first: { en: 'Tests to try first', fr: 'Tests à faire en premier' },
  others: { en: 'The other tests', fr: 'Les autres tests' },
  none: { en: 'Mark what you use to see which tests to try first.', fr: 'Indiquez ce que vous utilisez pour voir les tests à faire en premier.' },
  marked: { en: 'Marked:', fr: 'Indiqué\u00A0:' },
  cleared: { en: 'Nothing is marked.', fr: 'Rien n’est indiqué.' },
  go: { en: 'Go to', fr: 'Aller à' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const START_CSS =
  '.start{max-width:44rem}.start h2,.start h3,.start h4{line-height:1.25}' +
  '.start button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.start button[aria-pressed="true"]{font-weight:700;border-width:3px}' +
  '.start .start-group{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}' +
  '.start li{margin-bottom:12px}.start p,.start li{overflow-wrap:anywhere}' +
  '.start button:focus-visible,.start [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

/** The words of a go button: the test it leads to, so no two buttons share a name, and no word for a button. */
export function goLabel(key: StartPanelKey, lang: Lang): string {
  const to = START_INFO[key].go[lang];
  if (lang === 'en') return `${T.go.en} ${to}`;
  // Aller à + le = au, à + les = aux.
  return `Aller ${to.startsWith('le ') ? `au ${to.slice(3)}` : to.startsWith('les ') ? `aux ${to.slice(4)}` : `à ${to}`}`;
}

function listHtml(s: StartPanelState, lang: Lang, h: number, canGo: boolean): string {
  if (s.tools.length === 0) return `<p>${tx('none', lang)}</p>`;
  const order = startOrder(s.tools);
  const first = order.filter((t) => t.score > 0).slice(0, START_FIRST);
  const firstKeys = new Set(first.map((t) => t.key));
  const others = order.filter((t) => !firstKeys.has(t.key));
  const item = (key: StartPanelKey, extra: string): string =>
    `<li><strong>${escapeHtml(START_INFO[key].title[lang])}</strong>. ${escapeHtml(START_INFO[key].why[lang])}${extra}` +
    (canGo ? ` <button type="button" data-action="start-go" data-value="${key}">${escapeHtml(goLabel(key, lang))}</button>` : '') +
    '</li>';
  return (
    `<section aria-labelledby="start-first-h"><h${h} id="start-first-h" tabindex="-1">${tx('first', lang)}</h${h}>` +
    `<ol aria-labelledby="start-first-h">${first.map((t) => item(t.key, ` ${escapeHtml(forText(t, lang))}`)).join('')}</ol>` +
    `<h${h + 1} id="start-others-h">${tx('others', lang)}</h${h + 1}>` +
    `<ul aria-labelledby="start-others-h">${others.map((t) => item(t.key, '')).join('')}</ul></section>`
  );
}

export function renderStartPanel(lang: Lang, s: StartPanelState, headingLevel: 2 | 3 = 2, canGo = true): string {
  const h = headingLevel;
  const buttons = TOOLS.map((t) => `<button type="button" data-action="start-tool" data-value="${t}" aria-pressed="${s.tools.includes(t) ? 'true' : 'false'}">${escapeHtml(TOOL_NAMES[t][lang])}</button>`).join('');
  return (
    `<div class="start"><style>${START_CSS}</style>` +
    `<h${h} id="start-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    `<p id="start-tools-l">${tx('tools', lang)}</p><div class="start-group" role="group" aria-labelledby="start-tools-l">${buttons}</div>` +
    listHtml(s, lang, h + 1, canGo) +
    '</div>'
  );
}

/** Marking or unmarking a tool. The list follows at once; focus stays on the button pressed. */
export function startToggle(s: StartPanelState, tool: ToolId, lang: Lang): StartPanelState {
  const tools = s.tools.includes(tool) ? s.tools.filter((t) => t !== tool) : TOOLS.filter((t) => t === tool || s.tools.includes(t));
  const notice = tools.length === 0 ? T.cleared[lang] : `${T.marked[lang]} ${toolsText(tools, lang)}.`;
  return { tools, notice };
}

/** One line for the access summary, once something is marked. */
export function startNoteOf(s: StartPanelState, lang: Lang): string {
  return toolsNote(s.tools, lang);
}

export function mountStartPanel(opts: StartOptions): { getState(): StartPanelState; note(): string } {
  const lang = opts.lang;
  let state: StartPanelState = opts.state ? { ...opts.state, notice: '' } : initialStartState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderStartPanel(lang, state, opts.headingLevel ?? 2, opts.go !== undefined);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    const value = target.getAttribute?.('data-value') ?? null;
    if (action === 'start-tool' && isTool(value)) {
      state = startToggle(state, value, lang);
      render(`[data-action="start-tool"][data-value="${value}"]`);
      return;
    }
    if (action === 'start-go' && (START_PANELS as readonly (string | null)[]).includes(value)) opts.go?.(value as StartPanelKey);
  });
  render();
  return { getState: () => state, note: () => startNoteOf(state, lang) };
}

export const startPanel = { title: T.title, mount: mountStartPanel } as const;
