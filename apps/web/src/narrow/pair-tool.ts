import { readColor } from './colorspace.js';
import { fixContrast, minimumText, ratioText, shownRatio, type Candidate, type Fix } from './contrast-fix.js';
import { composite } from './contrast.js';
import { DEFAULT_REQUIRED, auditPalette, pairSentence, themesFromCss, type PageCss, type ThemePairs } from './palette.js';
import { escapeHtml } from './report.js';
import { NBSP, clip, type Lang } from './types.js';

/**
 * "Compare two colours": a tool inside the audit panel. A person types a
 * text colour and a background colour and gets the contrast of the pair,
 * which minimums it reaches, and the closest colours that would reach the
 * one it misses. A second button reads the colour tokens of the page and
 * measures the pairs their names put together.
 *
 * Everything is computed on the device from what was typed or from the
 * style sheets of the page. The tool states ratios. It does not say that a
 * page conforms to anything, and it says so.
 */

export type PairField = 'text' | 'background';

export interface PairError {
  readonly field: PairField;
  readonly message: string;
}

export type Outcome =
  | { readonly kind: 'measured'; readonly text: string; readonly background: string; readonly large: boolean; readonly fix: Fix; readonly blended: boolean }
  | { readonly kind: 'unknown'; readonly background: string };

export interface TokenView {
  readonly themes: readonly ThemePairs[];
  readonly unreadable: number;
}

export interface PairState {
  readonly text: string;
  readonly background: string;
  readonly large: boolean;
  readonly errors: readonly PairError[];
  readonly outcome: Outcome | null;
  readonly tokens: TokenView | null;
  readonly notice: string;
}

export const EMPTY_PAIR: PairState = { text: '', background: '', large: false, errors: [], outcome: null, tokens: null, notice: '' };

/** What a person typed, as read from the form before a re-render. A missing member keeps the state. */
export interface PairInputs {
  readonly text?: string;
  readonly background?: string;
  readonly large?: boolean;
}

export const PAIR_SELECTORS = { text: '#pair-text', background: '#pair-background', large: '#pair-large' } as const;

export function withInputs(state: PairState, inputs: PairInputs): PairState {
  return { ...state, text: inputs.text ?? state.text, background: inputs.background ?? state.background, large: inputs.large ?? state.large };
}

const T = {
  title: { en: 'Compare two colours', fr: 'Comparer deux couleurs' },
  intro: {
    en: 'Type a text colour and a background colour to get their contrast, and the closest colours that reach the minimum when the pair is below it.',
    fr: 'Saisissez une couleur de texte et une couleur d’arrière-plan pour obtenir leur contraste, et les couleurs les plus proches qui atteignent le minimum quand la paire est en dessous.',
  },
  text: { en: 'Text colour', fr: 'Couleur du texte' },
  background: { en: 'Background colour', fr: 'Couleur d’arrière-plan' },
  hint: { en: 'For example #1b1916, rgb(27 25 22), hsl(36 10% 10%) or white.', fr: 'Par exemple #1b1916, rgb(27 25 22), hsl(36 10% 10%) ou white.' },
  large: { en: 'The text is large: at least 24 pixels, or 18.66 pixels and bold', fr: 'Le texte est grand, soit au moins 24 pixels, ou 18,66 pixels en gras' },
  compare: { en: 'Compare the two colours', fr: 'Comparer les deux couleurs' },
  swap: { en: 'Swap text and background', fr: 'Échanger texte et arrière-plan' },
  clear: { en: 'Erase both colours and the result', fr: 'Effacer les deux couleurs et le résultat' },
  cleared: { en: 'Both colours and the result were erased.', fr: 'Les deux couleurs et le résultat ont été effacés.' },
  problems: { en: 'The colours could not be compared.', fr: 'Les couleurs n’ont pas pu être comparées.' },
  result: { en: 'Result', fr: 'Résultat' },
  use: { en: 'Use', fr: 'Usage' },
  minimum: { en: 'Minimum', fr: 'Minimum' },
  thisPair: { en: 'This pair', fr: 'Cette paire' },
  normalText: { en: 'Normal text', fr: 'Texte normal' },
  largeText: { en: 'Large text', fr: 'Grand texte' },
  parts: { en: 'Parts of controls and graphics', fr: 'Parties de commandes et éléments graphiques' },
  reaches: { en: 'reaches it', fr: 'l’atteint' },
  below: { en: 'below it', fr: 'en dessous' },
  limit: {
    en: 'The ratio is arithmetic on these two colours. It does not tell whether a text is easy to read, since size, weight and typeface also count, and it says nothing about a whole page.',
    fr: 'Le rapport est un calcul sur ces deux couleurs. Il ne dit pas si un texte est facile à lire, car la taille, la graisse et la police comptent aussi, et il ne dit rien d’une page entière.',
  },
  suggestions: { en: 'Closest colours that reach the minimum', fr: 'Couleurs les plus proches qui atteignent le minimum' },
  suggestionsNote: { en: 'These keep the hue and change the lightness. They are examples, and the choice stays with the designer.', fr: 'Elles gardent la teinte et changent la clarté. Ce sont des exemples, et le choix reste au designer.' },
  none: {
    en: 'No colour reaches the minimum by changing one side only. Both colours have to change.',
    fr: 'Aucune couleur n’atteint le minimum en changeant un seul côté. Il faut changer les deux couleurs.',
  },
  tokens: { en: 'Colour tokens of this page', fr: 'Jetons de couleur de cette page' },
  readTokens: { en: 'Read the colour tokens of this page', fr: 'Lire les jetons de couleur de cette page' },
  tokensIntro: {
    en: 'Reads the CSS custom properties of the page and measures the pairs their names put together, such as --header-ink on --header.',
    fr: 'Lit les propriétés personnalisées CSS de la page et mesure les paires que leurs noms rapprochent, comme --header-ink sur --header.',
  },
  tokensRead: { en: 'Colour tokens read.', fr: 'Jetons de couleur lus.' },
  noTokens: { en: 'No colour token was found in the style sheets of this page.', fr: 'Aucun jeton de couleur n’a été trouvé dans les feuilles de style de cette page.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);

/** Styles of the tool, scoped to its own class. Controls are at least 44 CSS pixels each way and wrap on a narrow screen. */
export const PAIR_CSS =
  '.pair{max-width:44rem}' +
  '.pair label{display:block;font-weight:600;margin-top:12px}' +
  '.pair .pair-field{display:block;width:100%;max-width:20rem;min-height:44px;box-sizing:border-box;font:inherit;padding:8px}' +
  '.pair .pair-check{display:flex;align-items:center;gap:8px;min-height:44px;font-weight:400}' +
  '.pair .pair-check input{width:44px;height:44px;margin:0;flex:none}' +
  '.pair button{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal}' +
  '.pair .pair-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.pair .pair-error{font-weight:600}.pair [aria-invalid="true"]{outline:3px solid currentColor;outline-offset:2px}' +
  '.pair table{border-collapse:collapse;width:100%;table-layout:fixed}.pair caption{text-align:left;padding:4px 0}' +
  '.pair th,.pair td{border:1px solid currentColor;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
  '.pair .pair-swatch{display:inline-block;width:1.25em;height:1.25em;border:2px solid currentColor;vertical-align:middle;margin-right:6px;forced-color-adjust:none}' +
  '.pair ul{padding-left:1.25rem}.pair li{margin:8px 0;overflow-wrap:anywhere}.pair code{overflow-wrap:anywhere}' +
  '.pair button:focus-visible,.pair input:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

const fieldError = (field: PairField, value: string, lang: Lang): string => {
  const fr = lang === 'fr';
  const which = field === 'text' ? (fr ? 'du texte' : 'text') : fr ? 'd’arrière-plan' : 'background';
  if (value.trim() === '') return fr ? `Saisissez la couleur ${which}.` : `Type the ${which} colour.`;
  return fr
    ? `«\u202F${clip(value, 30)}\u202F» n’a pas été lu comme une couleur. Écrivez la couleur ${which} comme #1b1916, rgb(27 25 22) ou hsl(36 10% 10%).`
    : `“${clip(value, 30)}” was not read as a colour. Write the ${which} colour like #1b1916, rgb(27 25 22) or hsl(36 10% 10%).`;
};

const hexOf = (c: { r: number; g: number; b: number }): string =>
  `#${[c.r, c.g, c.b].map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** Compares what is in the two fields. Errors name the field and say how to write a colour. */
export function comparePair(state: PairState, lang: Lang): PairState {
  const text = readColor(state.text);
  const background = readColor(state.background);
  const errors: PairError[] = [];
  if (!text) errors.push({ field: 'text', message: fieldError('text', state.text, lang) });
  if (!background) errors.push({ field: 'background', message: fieldError('background', state.background, lang) });
  if (!text || !background) {
    return { ...state, errors, outcome: null, notice: `${T.problems[lang]} ${errors.map((e) => e.message).join(' ')}` };
  }
  if (background.a < 1) {
    const outcome: Outcome = { kind: 'unknown', background: state.background.trim() };
    return { ...state, errors: [], outcome, notice: unknownSentence(lang) };
  }
  const blended = text.a < 1;
  const shown = { ...composite(text, background), a: 1 };
  const fix = fixContrast(shown, background, state.large ? 3 : 4.5);
  const outcome: Outcome = { kind: 'measured', text: hexOf(shown), background: hexOf(background), large: state.large, fix, blended };
  return { ...state, errors: [], outcome, notice: headline(outcome, lang) };
}

function unknownSentence(lang: Lang): string {
  return lang === 'fr'
    ? 'Contraste UNKNOWN. L’arrière-plan est en partie transparent, et ce qui se trouve derrière dépend de la page. Saisissez la couleur que l’on voit réellement derrière le texte.'
    : 'Contrast UNKNOWN. The background is partly transparent, and what is behind it depends on the page. Type the colour that is really seen behind the text.';
}

/** The result in one sentence, as it is announced. */
export function headline(outcome: Outcome, lang: Lang): string {
  if (outcome.kind === 'unknown') return unknownSentence(lang);
  const fr = lang === 'fr';
  const { fix, large } = outcome;
  const ratio = ratioText(fix.ratio, lang);
  const min = minimumText(fix.required, lang);
  const kind = large ? (fr ? 'un grand texte' : 'large text') : fr ? 'un texte normal' : 'normal text';
  if (fix.meets) return fr ? `Le contraste est de ${ratio}. Il atteint le minimum de ${min} pour ${kind}.` : `Contrast is ${ratio}. It reaches the ${min} minimum for ${kind}.`;
  return fr ? `Le contraste est de ${ratio}. Il est sous le minimum de ${min} pour ${kind}.` : `Contrast is ${ratio}. It is below the ${min} minimum for ${kind}.`;
}

export type PairAction = 'pair-compare' | 'pair-swap' | 'pair-clear' | 'pair-tokens' | `pair-use-text-${number}` | `pair-use-background-${number}`;

export function isPairAction(action: string | null): action is PairAction {
  return action !== null && /^pair-(compare|swap|clear|tokens|use-(text|background)-\d+)$/.test(action);
}

export interface PairStep {
  readonly state: PairState;
  /** Selector of the element to put focus on after the re-render. */
  readonly focus: string;
}

/**
 * What an action does to the state. The state passed in already holds what
 * is in the form. `css` is asked only for the token action.
 */
export function pairStep(state: PairState, action: PairAction, lang: Lang, css: () => PageCss): PairStep {
  if (action === 'pair-compare') {
    const next = comparePair(state, lang);
    const first = next.errors[0];
    return { state: next, focus: first ? PAIR_SELECTORS[first.field] : '#pair-result-h' };
  }
  if (action === 'pair-swap') {
    const swapped = { ...state, text: state.background, background: state.text };
    return { state: state.outcome || state.errors.length > 0 ? comparePair(swapped, lang) : swapped, focus: '[data-action="pair-swap"]' };
  }
  if (action === 'pair-clear') {
    return { state: { ...EMPTY_PAIR, tokens: state.tokens, notice: T.cleared[lang] }, focus: PAIR_SELECTORS.text };
  }
  if (action === 'pair-tokens') {
    const page = css();
    const themes = auditPalette(themesFromCss(page.text));
    return { state: { ...state, tokens: { themes, unreadable: page.unreadable }, notice: T.tokensRead[lang] }, focus: '#pair-tokens-h' };
  }
  const m = /^pair-use-(text|background)-(\d+)$/.exec(action);
  const side = m?.[1] === 'background' ? 'background' : 'text';
  const candidate = state.outcome?.kind === 'measured' ? state.outcome.fix[side][Number(m?.[2] ?? 0)] : undefined;
  if (!candidate || state.outcome?.kind !== 'measured') return { state, focus: '[data-action="pair-compare"]' };
  // The other side is written as it was measured, so a text colour with transparency is not blended a second time.
  const filled = side === 'text' ? { ...state, text: candidate.hex, background: state.outcome.background } : { ...state, text: state.outcome.text, background: candidate.hex };
  return { state: comparePair(filled, lang), focus: '#pair-result-h' };
}

const swatch = (hex: string): string => (/^#[0-9a-f]{6}$/.test(hex) ? `<span class="pair-swatch" aria-hidden="true" style="background:${hex}"></span>` : '');

function candidateItem(c: Candidate, side: PairField, index: number, lang: Lang): string {
  const fr = lang === 'fr';
  const what =
    side === 'text'
      ? c.direction === 'darker'
        ? fr ? 'Texte plus sombre' : 'Darker text'
        : fr ? 'Texte plus clair' : 'Lighter text'
      : c.direction === 'darker'
        ? fr ? 'Arrière-plan plus sombre' : 'Darker background'
        : fr ? 'Arrière-plan plus clair' : 'Lighter background';
  const line = fr ? `${what}${NBSP}: ${c.hex} donne ${ratioText(c.ratio, 'fr')}.` : `${what}: ${c.hex} gives ${ratioText(c.ratio, 'en')}.`;
  const button =
    side === 'text'
      ? fr ? `Utiliser ${c.hex} pour le texte` : `Use ${c.hex} for the text`
      : fr ? `Utiliser ${c.hex} pour l’arrière-plan` : `Use ${c.hex} for the background`;
  return `<li>${swatch(c.hex)}${escapeHtml(line)} <button type="button" data-action="pair-use-${side}-${index}">${escapeHtml(button)}</button></li>`;
}

function resultSection(outcome: Outcome, lang: Lang, h: number): string {
  const head = `<section aria-labelledby="pair-result-h"><h${h} id="pair-result-h" tabindex="-1">${tx('result', lang)}</h${h}>`;
  if (outcome.kind === 'unknown') return `${head}<p>${escapeHtml(unknownSentence(lang))}</p></section>`;
  const { fix } = outcome;
  const fr = lang === 'fr';
  // The ratio shown is cut to two decimals, so a pair is compared with each minimum by that same number.
  const row = (label: Key, required: number): string =>
    `<tr><th scope="row">${tx(label, lang)}</th><td>${escapeHtml(minimumText(required, lang))}</td><td>${tx(fix.ratio >= required ? 'reaches' : 'below', lang)}</td></tr>`;
  const blended = outcome.blended
    ? `<p>${escapeHtml(fr ? `La couleur du texte est en partie transparente. Posée sur cet arrière-plan, elle donne ${outcome.text}, et c’est cette couleur qui est mesurée.` : `The text colour is partly transparent. Laid over this background it gives ${outcome.text}, and that is the colour measured.`)}</p>`
    : '';
  let suggestions = '';
  if (!fix.meets) {
    const items = fix.text.map((c, i) => candidateItem(c, 'text', i, lang)).join('') + fix.background.map((c, i) => candidateItem(c, 'background', i, lang)).join('');
    suggestions =
      `<h${h + 1} id="pair-suggest-h">${tx('suggestions', lang)}</h${h + 1}>` +
      (items === '' ? `<p>${tx('none', lang)}</p>` : `<p>${tx('suggestionsNote', lang)}</p><ul>${items}</ul>`);
  }
  return (
    head +
    `<p>${swatch(outcome.text)}${swatch(outcome.background)}${escapeHtml(headline(outcome, lang))}</p>` +
    blended +
    `<table><caption>${escapeHtml(fr ? `${outcome.text} sur ${outcome.background}${NBSP}: ${ratioText(fix.ratio, 'fr')}` : `${outcome.text} on ${outcome.background}: ${ratioText(fix.ratio, 'en')}`)}</caption>` +
    `<thead><tr><th scope="col">${tx('use', lang)}</th><th scope="col">${tx('minimum', lang)}</th><th scope="col">${tx('thisPair', lang)}</th></tr></thead>` +
    `<tbody>${row('normalText', 4.5)}${row('largeText', 3)}${row('parts', 3)}</tbody></table>` +
    `<p>${tx('limit', lang)}</p>` +
    suggestions +
    '</section>'
  );
}

export const MAX_THEMES = 6;
export const MAX_PAIRS = 12;

function tokensSection(view: TokenView | null, lang: Lang, h: number): string {
  const fr = lang === 'fr';
  let body = '';
  if (view) {
    const shown = view.themes.slice(0, MAX_THEMES);
    if (view.themes.length === 0) body += `<p>${tx('noTokens', lang)}</p>`;
    for (const theme of shown) {
      const count = fr
        ? `${theme.colors} ${theme.colors < 2 ? 'jeton de couleur lu' : 'jetons de couleur lus'}, ${theme.pairs.length} ${theme.pairs.length < 2 ? 'paire mesurée d’après les noms' : 'paires mesurées d’après les noms'}.`
        : `${theme.colors} colour ${theme.colors === 1 ? 'token' : 'tokens'} read, ${theme.pairs.length} ${theme.pairs.length === 1 ? 'pair' : 'pairs'} measured from the names.`;
      const pairs = theme.pairs.slice(0, MAX_PAIRS);
      const more = theme.pairs.length - pairs.length;
      body +=
        `<h${h + 1}><code>${escapeHtml(clip(theme.label, 80))}</code></h${h + 1}><p>${escapeHtml(count)}</p>` +
        (pairs.length === 0 ? '' : `<ul>${pairs.map((p) => `<li>${escapeHtml(pairSentence(p, DEFAULT_REQUIRED, lang))}</li>`).join('')}</ul>`) +
        (more > 0 ? `<p>${escapeHtml(fr ? `… et ${more} de plus.` : `… and ${more} more.`)}</p>` : '');
    }
    const hidden = view.themes.length - shown.length;
    if (hidden > 0) body += `<p>${escapeHtml(fr ? `${hidden} ${hidden < 2 ? 'autre bloc de jetons n’est pas affiché' : 'autres blocs de jetons ne sont pas affichés'}.` : `${hidden} more ${hidden === 1 ? 'block of tokens is' : 'blocks of tokens are'} not shown.`)}</p>`;
    if (view.unreadable > 0) {
      body += `<p>${escapeHtml(
        fr
          ? `${view.unreadable} ${view.unreadable < 2 ? 'feuille de style n’a pas pu être lue' : 'feuilles de style n’ont pas pu être lues'} par la page. Leurs jetons sont UNKNOWN.`
          : `${view.unreadable} style ${view.unreadable === 1 ? 'sheet' : 'sheets'} could not be read by the page. Their tokens are UNKNOWN.`,
      )}</p>`;
    }
  }
  return (
    `<section aria-labelledby="pair-tokens-h"><h${h} id="pair-tokens-h" tabindex="-1">${tx('tokens', lang)}</h${h}>` +
    `<p>${tx('tokensIntro', lang)}</p>` +
    `<p class="pair-actions"><button type="button" data-action="pair-tokens">${tx('readTokens', lang)}</button></p>` +
    body +
    '</section>'
  );
}

/** The markup of the tool for a state. `headingLevel` is the level of its own heading. */
export function renderPairTool(lang: Lang, state: PairState, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  const error = (field: PairField): string => state.errors.find((e) => e.field === field)?.message ?? '';
  const field = (name: PairField): string => {
    const e = error(name);
    return (
      `<label for="pair-${name}">${tx(name, lang)}</label>` +
      `<input class="pair-field" type="text" id="pair-${name}" name="pair-${name}" value="${escapeHtml(name === 'text' ? state.text : state.background)}" ` +
      `autocomplete="off" autocapitalize="none" spellcheck="false" aria-required="true" aria-describedby="pair-hint${e ? ` pair-${name}-error` : ''}"${e ? ' aria-invalid="true"' : ''}>` +
      (e ? `<p class="pair-error" id="pair-${name}-error">${escapeHtml(e)}</p>` : '')
    );
  };
  return (
    `<div class="pair"><style>${PAIR_CSS}</style>` +
    `<h${h} id="pair-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` +
    `<p id="pair-hint">${tx('hint', lang)}</p>` +
    field('text') +
    field('background') +
    `<label class="pair-check" for="pair-large"><input type="checkbox" id="pair-large" name="pair-large"${state.large ? ' checked' : ''}> ${tx('large', lang)}</label>` +
    `<p class="pair-actions"><button type="button" data-action="pair-compare">${tx('compare', lang)}</button> ` +
    `<button type="button" data-action="pair-swap">${tx('swap', lang)}</button> ` +
    `<button type="button" data-action="pair-clear">${tx('clear', lang)}</button></p>` +
    (state.outcome ? resultSection(state.outcome, lang, h + 1) : '') +
    tokensSection(state.tokens, lang, h + 1) +
    '</div>'
  );
}

/** The ratio of two colours as typed, or null when either is not read or the background has transparency. For callers that only need the number. */
export function ratioOf(text: string, background: string): number | null {
  const t = readColor(text);
  const b = readColor(background);
  if (!t || !b || b.a < 1) return null;
  return shownRatio({ ...composite(t, b), a: 1 }, b);
}

export const pairTool = { title: T.title } as const;
