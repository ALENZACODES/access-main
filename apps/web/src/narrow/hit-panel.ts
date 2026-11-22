import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { HIT_ARGS, hitInPage, type HitFacts } from './hit-inpage.js';
import { HIT_LISTED, buildHit, hitAdvice, hitFindingText, hitNote, hitSummary, type HitModel } from './hit.js';

/**
 * "Covered controls": asks the browser what a press would land on at five
 * points of each control, and lists the controls something else covers,
 * fully first. The page is scrolled to each control in turn and back.
 *
 * Every control is at least 44 CSS pixels each way. Nothing in the page is
 * changed or pressed, and nothing is stored or sent.
 */

export interface HitRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface HitPanelState {
  readonly facts: HitFacts | null;
  readonly notice: string;
}

export const initialHitState = (): HitPanelState => ({ facts: null, notice: '' });

export interface HitOptions {
  readonly root: HitRoot;
  readonly lang: Lang;
  readonly read?: () => HitFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: HitPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'Covered controls', fr: 'Commandes couvertes' },
  intro: {
    en: 'A banner, a bar stuck to the screen or a layer you cannot see may sit on top of a control. A finger, a head pointer or eye gaze then lands on that, not on the control. The panel asks the browser what a press would land on, at five points of each control.',
    fr: 'Une bannière, une barre fixée à l’écran ou une couche invisible peut se trouver par-dessus une commande. Un doigt, un pointeur de tête ou le regard tombe alors dessus, et pas sur la commande. Le panneau demande au navigateur sur quoi un appui tomberait, en cinq points de chaque commande.',
  },
  kept: {
    en: 'The page is scrolled to each control in turn, then put back where it was. Nothing in it is changed or pressed, and nothing is stored or sent.',
    fr: 'La page défile jusqu’à chaque commande tour à tour, puis revient où elle était. Rien n’y est modifié ni pressé, et rien n’est enregistré ni envoyé.',
  },
  read: { en: 'Find covered controls', fr: 'Trouver les commandes couvertes' },
  readAgain: { en: 'Read again', fr: 'Relire' },
  readDone: { en: 'The page was read.', fr: 'La page a été lue.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What covers controls', fr: 'Ce qui couvre des commandes' },
  list: { en: 'Covered, fully first', fr: 'Couvertes, entièrement d’abord' },
  more: { en: 'more, in the copied text.', fr: 'de plus, dans le texte copié.' },
  help: { en: 'What may help the team', fr: 'Ce qui peut aider l’équipe' },
  limit: {
    en: 'This is what the browser reports for this screen, now. A cover that comes later, or only on a hover or a press, is not seen, and a control may still work by keyboard.',
    fr: 'C’est ce que le navigateur indique pour cet écran, maintenant. Une couverture qui arrive plus tard, ou seulement au survol ou à l’appui, n’est pas vue, et une commande peut encore fonctionner au clavier.',
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const HIT_CSS =
  '.hittest{max-width:44rem}.hittest h2,.hittest h3,.hittest h4,.hittest h5{line-height:1.25}' +
  '.hittest button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.hittest .hit-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}' +
  '.hittest p,.hittest li{overflow-wrap:anywhere}' +
  '.hittest button:focus-visible,.hittest [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function hitModelOf(s: HitPanelState): HitModel | null {
  return s.facts ? buildHit(s.facts) : null;
}

function resultHtml(m: HitModel, lang: Lang, h: number): string {
  const listed = m.findings.slice(0, HIT_LISTED);
  const rest = m.findings.length - listed.length;
  const advice = hitAdvice(m, lang);
  return (
    `<h${h} id="hit-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    hitSummary(m, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (listed.length === 0 ? '' : `<h${h + 1} id="hit-list-h">${tx('list', lang)}</h${h + 1}><ul aria-labelledby="hit-list-h">${listed.map((f) => `<li>${escapeHtml(hitFindingText(f, lang))}</li>`).join('')}</ul>`) +
    (rest > 0 ? `<p>${escapeHtml(`… ${lang === 'fr' ? 'et' : 'and'} ${rest} `)}${tx('more', lang)}</p>` : '') +
    (advice.length === 0 ? '' : `<h${h + 1} id="hit-help-h">${tx('help', lang)}</h${h + 1}><ul aria-labelledby="hit-help-h">${advice.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="hit-actions"><button type="button" data-action="hit-copy">${tx('copy', lang)}</button></p>`
  );
}

export function renderHitPanel(lang: Lang, s: HitPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  const m = hitModelOf(s);
  return (
    `<div class="hittest"><style>${HIT_CSS}</style>` +
    `<h${h} id="hit-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    `<p class="hit-actions"><button type="button" data-action="hit-read">${tx(m ? 'readAgain' : 'read', lang)}</button></p>` +
    (m ? `<section aria-labelledby="hit-result-h">${resultHtml(m, lang, h + 1)}</section>` : '') +
    '</div>'
  );
}

/** The result as plain text, with every covered control. */
export function hitResultText(s: HitPanelState, lang: Lang): string {
  const m = hitModelOf(s);
  const lines: string[] = [T.title[lang]];
  if (m) {
    lines.push(...hitSummary(m, lang), ...m.findings.map((f) => `- ${hitFindingText(f, lang)}`));
    const advice = hitAdvice(m, lang);
    if (advice.length > 0) lines.push('', `${T.help[lang]}${lang === 'fr' ? `${NBSP}:` : ':'}`, ...advice.map((a) => `- ${a}`));
  }
  lines.push('', T.limit[lang]);
  return `${lines.join('\n')}\n`;
}

export interface HitStep {
  readonly state: HitPanelState;
  readonly focus: string;
}

export function hitStep(s: HitPanelState, lang: Lang, read: () => HitFacts): HitStep {
  try {
    return { state: { facts: read(), notice: T.readDone[lang] }, focus: '#hit-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '[data-action="hit-read"]' };
  }
}

/** One line for the barrier text, when a control is covered. */
export function hitNoteOf(s: HitPanelState, lang: Lang): string {
  return hitNote(hitModelOf(s), lang);
}

/** The panel itself, so its own buttons are not tested with the page. */
export const HIT_EXCLUDE = '.hittest';

export function mountHitPanel(opts: HitOptions): { getState(): HitPanelState; note(): string } {
  const lang = opts.lang;
  const read = opts.read ?? ((): HitFacts => hitInPage({ ...HIT_ARGS, exclude: HIT_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: HitPanelState = opts.state ? { ...opts.state, notice: '' } : initialHitState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderHitPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'hit-read') {
      const step = hitStep(state, lang, read);
      state = step.state;
      render(step.focus);
      return;
    }
    if (action !== 'hit-copy' || !state.facts) return;
    const text = hitResultText(state, lang);
    if (!hasClipboard) {
      state = { ...state, notice: T.noClipboard[lang] };
      render('[data-action="hit-copy"]');
      return;
    }
    void (async (): Promise<void> => {
      try {
        await copy(text);
        state = { ...state, notice: T.copied[lang] };
      } catch {
        state = { ...state, notice: T.copyFailed[lang] };
      }
      render('[data-action="hit-copy"]');
    })();
  });
  render();
  return { getState: () => state, note: () => hitNoteOf(state, lang) };
}

export const hitPanel = { title: T.title, mount: mountHitPanel } as const;
