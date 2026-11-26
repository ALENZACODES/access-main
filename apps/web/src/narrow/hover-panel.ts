import { escapeHtml } from './report.js';
import { NBSP, type Lang } from './types.js';
import { HOVER_ARGS, hoverInPage, type HoverFacts } from './hover-inpage.js';
import { HOVER_LISTED, buildHover, hoverFindingText, hoverAdvice, hoverNote, hoverSummary, type HoverAbility, type HoverModel } from './hover.js';

/**
 * "Shown on hover only": the person says whether they can hover; the panel
 * reads the style rules of this page for what is shown on hover with no focus
 * rule to match, and what that keeps hidden right now, controls first.
 *
 * Every control is at least 44 CSS pixels each way, and the choice is said by
 * aria-pressed. The page is read, never changed, and nothing is stored or
 * sent.
 */

export interface HoverRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: string, handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface HoverPanelState {
  readonly ability: HoverAbility;
  readonly facts: HoverFacts | null;
  readonly notice: string;
}

export const initialHoverState = (): HoverPanelState => ({ ability: 'unsure', facts: null, notice: '' });

export interface HoverOptions {
  readonly root: HoverRoot;
  readonly lang: Lang;
  readonly read?: () => HoverFacts;
  readonly copy?: (text: string) => Promise<void>;
  readonly state?: HoverPanelState;
  readonly headingLevel?: 2 | 3;
}

const T = {
  title: { en: 'Shown on hover only', fr: 'Montré au survol seulement' },
  intro: {
    en: 'Some pages show a menu, a button or a note only while a mouse pointer rests on something. With a touch screen, a switch, a keyboard or your voice, you cannot hover, so that content stays out of reach. Say whether you can hover; the panel reads the style rules of this page.',
    fr: 'Certaines pages montrent un menu, un bouton ou une note seulement quand le pointeur d’une souris reste sur un élément. Avec un écran tactile, un contacteur, un clavier ou la voix, on ne peut pas survoler, et ce contenu reste hors de portée. Indiquez si vous pouvez survoler\u202F; le panneau lit les règles de style de cette page.',
  },
  kept: { en: 'The page is read, never changed. Nothing is stored or sent.', fr: 'La page est lue, jamais modifiée. Rien n’est enregistré ni envoyé.' },
  ability: { en: 'Can you hover?', fr: 'Pouvez-vous survoler\u202F?' },
  can: { en: 'I can hover', fr: 'Je peux survoler' },
  cannot: { en: 'I cannot hover', fr: 'Je ne peux pas survoler' },
  unsure: { en: 'I am not sure', fr: 'Je ne sais pas' },
  set: { en: 'Your answer is kept.', fr: 'Votre réponse est notée.' },
  page: { en: 'Hover on this page', fr: 'Le survol dans cette page' },
  read: { en: 'Find what shows on hover only', fr: 'Trouver ce qui n’apparaît qu’au survol' },
  readAgain: { en: 'Read again', fr: 'Relire' },
  readDone: { en: 'The page was read.', fr: 'La page a été lue.' },
  failed: { en: 'The page could not be read', fr: 'La page n’a pas pu être lue' },
  result: { en: 'What was found', fr: 'Ce qui a été trouvé' },
  rules: { en: 'Hover rules', fr: 'Règles de survol' },
  more: { en: 'more, in the copied text.', fr: 'de plus, dans le texte copié.' },
  help: { en: 'What may help the team', fr: 'Ce qui peut aider l’équipe' },
  limit: {
    en: 'Only style rules are read. Content a script shows on hover, and rules in sheets that could not be read, are not seen. A focus rule found is a rule in the same place; whether it shows the same content stays to be tried.',
    fr: 'Seules les règles de style sont lues. Ce qu’un script montre au survol, et les règles des feuilles qui n’ont pas pu être lues, ne sont pas vus. Une règle de focus trouvée est une règle au même endroit${NBSP}; reste à essayer si elle montre le même contenu.'.replace('${NBSP}', '\u202F'),
  },
  copy: { en: 'Copy the result', fr: 'Copier le résultat' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

export const HOVER_CSS =
  '.hoveronly{max-width:44rem}.hoveronly h2,.hoveronly h3,.hoveronly h4,.hoveronly h5{line-height:1.25}' +
  '.hoveronly button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.hoveronly button[aria-pressed="true"]{font-weight:700;border-width:3px}' +
  '.hoveronly .hover-group,.hoveronly .hover-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}' +
  '.hoveronly p,.hoveronly li{overflow-wrap:anywhere}' +
  '.hoveronly button:focus-visible,.hoveronly [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

export function hoverModelOf(s: HoverPanelState): HoverModel | null {
  return s.facts ? buildHover(s.facts) : null;
}

const ABILITIES: readonly HoverAbility[] = ['can', 'cannot', 'unsure'];

function resultHtml(s: HoverPanelState, m: HoverModel, lang: Lang, h: number): string {
  const listed = m.findings.slice(0, HOVER_LISTED);
  const rest = m.findings.length - listed.length;
  const advice = hoverAdvice(m, lang);
  return (
    `<h${h} id="hover-result-h" tabindex="-1">${tx('result', lang)}</h${h}>` +
    hoverSummary(m, s.ability, lang)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('') +
    (listed.length === 0 ? '' : `<h${h + 1} id="hover-rules-h">${tx('rules', lang)}</h${h + 1}><ul aria-labelledby="hover-rules-h">${listed.map((f) => `<li>${escapeHtml(hoverFindingText(f, lang))}</li>`).join('')}</ul>`) +
    (rest > 0 ? `<p>${escapeHtml(`… ${lang === 'fr' ? 'et' : 'and'} ${rest} `)}${tx('more', lang)}</p>` : '') +
    (advice.length === 0 ? '' : `<h${h + 1} id="hover-help-h">${tx('help', lang)}</h${h + 1}><ul aria-labelledby="hover-help-h">${advice.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`) +
    `<p>${tx('limit', lang)}</p>` +
    `<p class="hover-actions"><button type="button" data-action="hover-copy">${tx('copy', lang)}</button></p>`
  );
}

export function renderHoverPanel(lang: Lang, s: HoverPanelState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  const m = hoverModelOf(s);
  const buttons = ABILITIES.map((a) => `<button type="button" data-action="hover-ability" data-value="${a}" aria-pressed="${s.ability === a ? 'true' : 'false'}">${tx(a, lang)}</button>`).join('');
  return (
    `<div class="hoveronly"><style>${HOVER_CSS}</style>` +
    `<h${h} id="hover-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(s.notice)}</div>` +
    `<p id="hover-ability-l">${tx('ability', lang)}</p><div class="hover-group" role="group" aria-labelledby="hover-ability-l">${buttons}</div>` +
    `<section aria-labelledby="hover-page-h"><h${h + 1} id="hover-page-h" tabindex="-1">${tx('page', lang)}</h${h + 1}>` +
    `<p class="hover-actions"><button type="button" data-action="hover-read">${tx(m ? 'readAgain' : 'read', lang)}</button></p>` +
    (m ? resultHtml(s, m, lang, h + 2) : '') +
    '</section></div>'
  );
}

/** The result as plain text, with every rule. */
export function hoverResultText(s: HoverPanelState, lang: Lang): string {
  const m = hoverModelOf(s);
  const lines: string[] = [T.title[lang]];
  if (m) {
    lines.push(...hoverSummary(m, s.ability, lang), ...m.findings.map((f) => `- ${hoverFindingText(f, lang)}`));
    const advice = hoverAdvice(m, lang);
    if (advice.length > 0) lines.push('', `${T.help[lang]}${lang === 'fr' ? `${NBSP}:` : ':'}`, ...advice.map((a) => `- ${a}`));
  }
  lines.push('', T.limit[lang]);
  return `${lines.join('\n')}\n`;
}

export type HoverAction = 'hover-ability' | 'hover-read';

export function isHoverAction(a: string | null): a is HoverAction {
  return a === 'hover-ability' || a === 'hover-read';
}

export interface HoverStep {
  readonly state: HoverPanelState;
  readonly focus: string;
}

export function hoverStep(s: HoverPanelState, action: HoverAction, value: string | null, lang: Lang, read: () => HoverFacts): HoverStep {
  if (action === 'hover-ability') {
    if (value !== 'can' && value !== 'cannot' && value !== 'unsure') return { state: s, focus: '' };
    return { state: { ...s, ability: value, notice: T.set[lang] }, focus: `[data-action="hover-ability"][data-value="${value}"]` };
  }
  try {
    return { state: { ...s, facts: read(), notice: T.readDone[lang] }, focus: '#hover-result-h' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { state: { ...s, notice: `${T.failed[lang]}${lang === 'fr' ? `${NBSP}:` : ':'} ${why}` }, focus: '#hover-page-h' };
  }
}

/** One line for the barrier text, once the person said whether they can hover. */
export function hoverNoteOf(s: HoverPanelState, lang: Lang): string {
  return hoverNote(hoverModelOf(s), s.ability, lang);
}

/** Whether the person can hover, for the access summary; nothing about this page. */
export function hoverAbilityNoteOf(s: HoverPanelState, lang: Lang): string {
  return hoverNote(null, s.ability, lang);
}

/** Whether being unable to hover asks the site for something: only when the person said they cannot. */
export const hoverNeedsSite = (s: HoverPanelState): boolean => s.ability === 'cannot';

/** The panel itself, so its own style rules and buttons are left out of the reading. */
export const HOVER_EXCLUDE = '.hoveronly';

export function mountHoverPanel(opts: HoverOptions): { getState(): HoverPanelState; note(): string } {
  const lang = opts.lang;
  const read = opts.read ?? ((): HoverFacts => hoverInPage({ ...HOVER_ARGS, exclude: HOVER_EXCLUDE }));
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;
  let state: HoverPanelState = opts.state ? { ...opts.state, notice: '' } : initialHoverState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderHoverPanel(lang, state, opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === 'hover-copy') {
      if (!state.facts) return;
      const text = hoverResultText(state, lang);
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('[data-action="hover-copy"]');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
        }
        render('[data-action="hover-copy"]');
      })();
      return;
    }
    if (!isHoverAction(action)) return;
    const step = hoverStep(state, action, target.getAttribute?.('data-value') ?? null, lang, read);
    if (step.focus === '') return;
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => state, note: () => hoverNoteOf(state, lang) };
}

export const hoverPanel = { title: T.title, mount: mountHoverPanel } as const;
