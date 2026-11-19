import { isFocusable } from './handlers.js';
import { parseHtml } from './htmllint.js';
import { attrOf, inFileOrder, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry } from './types.js';

/**
 * Style rules written in the page itself: style elements and style
 * attributes (WCAG 2.4.7, 1.4.12, 1.3.4, 1.4.4 and 1.4.10). It reads the text
 * of the CSS and applies nothing, so it cannot tell which rule wins or what a
 * linked style sheet adds. Every finding is UNKNOWN: a prompt to look at the
 * rule, never a measured failure. The focus-visible, text-spacing, parity and
 * reflow checks measure the same things in a browser.
 */

export type CssRuleId =
  | 'focus-outline-removed'
  | 'outline-reset'
  | 'spacing-important'
  | 'orientation-lock'
  | 'motion-no-reduce'
  | 'root-scroll-locked'
  | 'zoom-blocked';

export const CSS_RULE_IDS: readonly CssRuleId[] = [
  'focus-outline-removed', 'outline-reset', 'spacing-important', 'orientation-lock', 'motion-no-reduce', 'root-scroll-locked', 'zoom-blocked',
];

export interface CssDeclaration {
  readonly prop: string;
  readonly value: string;
  readonly important: boolean;
}

export interface CssStyleRule {
  readonly selector: string;
  readonly declarations: readonly CssDeclaration[];
  /** Preludes of the at-rules around the rule, outermost first: `@media (orientation: portrait)`. */
  readonly context: readonly string[];
  /** Line in the file. */
  readonly line: number;
}

export interface StyleBlock {
  readonly css: string;
  /** Line of the first character of the CSS. */
  readonly line: number;
  /** Value of the media attribute of the style element, or empty. */
  readonly media: string;
}

/** At-rules whose body holds more rules. */
const GROUPING = new Set(['media', 'supports', 'layer', 'container', 'scope', 'document', 'starting-style']);

/** Replaces comments by spaces and keeps the line breaks, so offsets and line numbers stay true. */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Index of the brace that closes the one at `open`, or the end of the text when it is never closed. */
function closingBrace(css: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < css.length; i++) {
    const c = css[i] ?? '';
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

/** One declaration from `prop: value !important`, or null when the text is not one. */
export function parseDeclaration(text: string): CssDeclaration | null {
  const colon = text.indexOf(':');
  if (colon <= 0) return null;
  const prop = text.slice(0, colon).trim().toLowerCase();
  if (!/^-{0,2}[a-z_][a-z0-9_-]*$/.test(prop)) return null;
  let value = text.slice(colon + 1).trim();
  const important = /!\s*important\s*$/i.test(value);
  if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
  if (value === '') return null;
  return { prop, value: prop.startsWith('--') ? value : value.toLowerCase(), important };
}

/** Declarations of a style attribute or of a rule body with no nested rules. */
export function parseDeclarations(text: string): CssDeclaration[] {
  const out: CssDeclaration[] = [];
  let quote = '';
  let depth = 0;
  let start = 0;
  const push = (end: number): void => {
    const d = parseDeclaration(text.slice(start, end));
    if (d) out.push(d);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(text.length);
  return out;
}

function joinSelector(parent: string | null, own: string): string {
  const s = own.replace(/\s+/g, ' ').trim();
  if (parent === null) return s;
  return s
    .split(',')
    .map((part) => (part.includes('&') ? part.trim().replace(/&/g, parent) : `${parent} ${part.trim()}`))
    .join(', ');
}

/**
 * Reads the style rules of a style sheet. It follows media, supports, layer
 * and container blocks and nested rules, and skips keyframes, font faces and
 * anything it does not know. It is forgiving: broken CSS gives fewer rules,
 * never an error.
 */
export function parseCss(source: string, firstLine = 1): CssStyleRule[] {
  const css = stripCssComments(source);
  const rules: CssStyleRule[] = [];
  const breaks: number[] = [];
  for (let k = css.indexOf('\n'); k !== -1; k = css.indexOf('\n', k + 1)) breaks.push(k);
  /** Line of an offset: the number of line breaks before it, found by halving. */
  const lineAt = (offset: number): number => {
    let lo = 0;
    let hi = breaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((breaks[mid] ?? 0) < offset) lo = mid + 1;
      else hi = mid;
    }
    return firstLine + lo;
  };

  const walk = (from: number, to: number, context: readonly string[], parent: string | null, sink: CssDeclaration[] | null, guard: number): void => {
    if (guard > 12) return;
    let i = from;
    let start = from;
    let quote = '';
    let paren = 0;
    while (i < to) {
      const c = css[i] ?? '';
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
        i++;
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(') paren++;
      else if (c === ')') paren = Math.max(0, paren - 1);
      else if (c === ';' && paren === 0) {
        if (sink) {
          const d = parseDeclaration(css.slice(start, i));
          if (d) sink.push(d);
        }
        start = i + 1;
      } else if (c === '}' && paren === 0) {
        start = i + 1;
      } else if (c === '{' && paren === 0) {
        const prelude = css.slice(start, i).trim();
        const close = Math.min(closingBrace(css, i), to);
        const preludeAt = start + (css.slice(start, i).length - css.slice(start, i).trimStart().length);
        if (prelude.startsWith('@')) {
          const name = /^@([a-z-]+)/i.exec(prelude)?.[1]?.toLowerCase() ?? '';
          if (GROUPING.has(name)) walk(i + 1, close, [...context, prelude.replace(/\s+/g, ' ')], parent, null, guard + 1);
        } else if (prelude !== '') {
          const selector = joinSelector(parent, prelude);
          const declarations: CssDeclaration[] = [];
          const rule: CssStyleRule = { selector, declarations, context, line: lineAt(preludeAt) };
          rules.push(rule);
          walk(i + 1, close, context, selector, declarations, guard + 1);
        }
        i = close;
        start = close + 1;
      }
      i++;
    }
    if (sink && start < to) {
      const d = parseDeclaration(css.slice(start, to));
      if (d) sink.push(d);
    }
  };
  walk(0, css.length, [], null, null, 0);
  return rules;
}

const STYLE_OR_SKIP = /<!--[\s\S]*?(?:-->|$)|<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)|<style\b([^>]*)>([\s\S]*?)(?:<\/style\s*>|$)/gi;

/** The CSS of every style element, with the line it starts on. Style text inside a comment or a script is not CSS and is left out. */
export function styleBlocks(html: string): StyleBlock[] {
  const out: StyleBlock[] = [];
  for (const m of html.matchAll(STYLE_OR_SKIP)) {
    const css = m[2];
    if (css === undefined || !/^<style/i.test(m[0])) continue;
    const openLength = m[0].indexOf('>') + 1;
    const line = html.slice(0, (m.index ?? 0) + openLength).split('\n').length;
    const media = /\bmedia\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1] ?? '');
    out.push({ css, line, media: (media?.[1] ?? media?.[2] ?? media?.[3] ?? '').trim() });
  }
  return out;
}

const find = (ds: readonly CssDeclaration[], prop: string): CssDeclaration | undefined => {
  for (let i = ds.length - 1; i >= 0; i--) if (ds[i]?.prop === prop) return ds[i];
  return undefined;
};

const ZERO = /^0(?:px|em|rem|pt)?$/;

/** True when the declarations switch the outline off. */
export function removesOutline(ds: readonly CssDeclaration[]): boolean {
  const outline = find(ds, 'outline');
  if (outline) {
    const parts = outline.value.split(/\s+/);
    if (parts.includes('none') || parts.some((p) => ZERO.test(p))) return true;
  }
  const style = find(ds, 'outline-style');
  if (style && style.value === 'none') return true;
  const width = find(ds, 'outline-width');
  return width !== undefined && ZERO.test(width.value);
}

/** True when the same rule draws something else that can show focus. */
export function drawsFocusCue(ds: readonly CssDeclaration[]): boolean {
  return ds.some((d) => {
    if (d.value === 'none' || d.value === 'inherit' || d.value === 'initial' || d.value === 'unset' || ZERO.test(d.value)) return false;
    return d.prop === 'box-shadow' || d.prop === 'border' || d.prop.startsWith('border-') || d.prop === 'background' || d.prop === 'background-color' ||
      d.prop === 'text-decoration' || d.prop === 'text-decoration-line' || d.prop === 'filter';
  });
}

const selectorParts = (selector: string): string[] => selector.split(',').map((s) => s.trim()).filter((s) => s !== '');

/** Parts of the selector that match a focused element, leaving out `:focus:not(:focus-visible)`, which is how a ring is hidden for the mouse only. */
export function focusParts(selector: string): string[] {
  return selectorParts(selector).filter((p) => /:focus(?:-visible)?(?![\w-])/.test(p) && !/:focus:not\(\s*:focus-visible\s*\)/.test(p));
}

const ROOT_PART = /^(?:html|body|:root|\*|html\s+body|html\s*>\s*body)$/i;
const APP_ROOT_PART = /^(?:html|body|:root|main|#root|#app|\[role=["']?main["']?\])$/i;

const isRootSelector = (selector: string): boolean => selectorParts(selector).some((p) => ROOT_PART.test(p));

const SPACING_PROPS = ['line-height', 'letter-spacing', 'word-spacing'] as const;

/** True for an animation or transition value that moves: not none, and not a zero duration only. */
export function moves(d: CssDeclaration): boolean {
  if (d.prop !== 'animation' && d.prop !== 'animation-name' && d.prop !== 'transition' && d.prop !== 'transition-duration' && d.prop !== 'animation-duration') return false;
  if (d.value === 'none' || d.value === 'initial' || d.value === 'unset' || d.value === 'inherit') return false;
  if (d.prop === 'animation-name') return true;
  const times = d.value.match(/(?:\d*\.)?\d+m?s\b/g) ?? [];
  if (d.prop === 'transition-duration' || d.prop === 'animation-duration') return times.some((x) => Number.parseFloat(x) > 0);
  return times.length === 0 ? d.prop === 'animation' : times.some((x) => Number.parseFloat(x) > 0);
}

const QUARTER_TURN = /rotate[z]?\(\s*-?(?:90deg|270deg|0?\.25turn|0?\.75turn|100grad)\s*\)|^-?(?:90deg|270deg)$/;

function blocksZoom(d: CssDeclaration): 'touch' | 'text-size' | null {
  if (d.prop === 'touch-action') {
    const v = d.value.split(/\s+/);
    if (v.includes('auto') || v.includes('manipulation') || v.includes('pinch-zoom')) return null;
    return 'touch';
  }
  const sizeAdjust = d.prop === 'text-size-adjust' || d.prop === '-webkit-text-size-adjust' || d.prop === '-moz-text-size-adjust';
  return sizeAdjust && d.value === 'none' ? 'text-size' : null;
}

export function auditCss(html: string): CheckResult {
  const entries: Entry[] = [];
  let checked = 0;
  const add = (id: string, rule: CssRuleId, en: string, fr: string): void => {
    entries.push({ check: 'css', id, status: 'unknown', rule, message: t(en, fr) });
  };
  const blocks = styleBlocks(html);
  const allCss = blocks.map((b) => b.css).join('\n');
  const { nodes } = parseHtml(html);
  const linksSheet = nodes.some((n) => n.tag === 'link' && attrOf(n, 'rel').toLowerCase().split(/\s+/).includes('stylesheet'));
  const hasReduceBlock = /prefers-reduced-motion/i.test(stripCssComments(allCss)) || blocks.some((b) => /prefers-reduced-motion/i.test(b.media));
  let firstMoving: { id: string; sel: string } | null = null;

  for (const block of blocks) {
    const context0 = block.media ? [`@media ${block.media}`] : [];
    for (const r of parseCss(block.css, block.line)) {
      checked++;
      const ds = r.declarations;
      const sel = clip(r.selector, 40);
      const id = `style@L${r.line}:${clip(r.selector, 60)}`;
      const context = [...context0, ...r.context].join(' ').toLowerCase();

      if (removesOutline(ds)) {
        const focused = focusParts(r.selector);
        if (focused.length > 0) {
          if (!drawsFocusCue(ds)) {
            add(
              id,
              'focus-outline-removed',
              `The rule “${sel}” removes the focus outline and draws nothing else in its place. Keyboard users can lose sight of where they are. Check with the Tab key, and add a visible ring in this rule.`,
              `La règle «\u202F${sel}\u202F» retire le contour de focus et ne dessine rien d’autre à la place. Au clavier, on peut perdre de vue l’endroit où l’on se trouve. Contrôlez avec la touche Tab, et ajoutez un anneau visible dans cette règle.`,
            );
          }
        } else if (!/:focus:not\(\s*:focus-visible\s*\)/.test(r.selector)) {
          add(
            id,
            'outline-reset',
            `The rule “${sel}” removes the outline in every state, focus included. Unless another rule draws a focus ring for the same elements, keyboard focus is invisible. Check with the Tab key.`,
            `La règle «\u202F${sel}\u202F» retire le contour dans tous les états, focus compris. Si aucune autre règle ne dessine un anneau de focus pour ces éléments, le focus clavier est invisible. Contrôlez avec la touche Tab.`,
          );
        }
      }

      const locked = SPACING_PROPS.filter((p) => find(ds, p)?.important);
      if (locked.length > 0) {
        add(
          id,
          'spacing-important',
          `The rule “${sel}” sets ${locked.join(', ')} with !important. People who use their own style sheet or a tool to widen text spacing may not be able to override it. Remove !important, then check with the text-spacing check.`,
          `La règle «\u202F${sel}\u202F» fixe ${locked.join(', ')} avec la priorité important. Les personnes qui élargissent l’espacement du texte avec leur propre feuille de style ou un outil risquent de ne pas pouvoir passer outre. Retirez cette priorité, puis contrôlez avec le test d’espacement du texte.`,
        );
      }

      if (/orientation\s*:\s*(?:portrait|landscape)/.test(context)) {
        const hides = selectorParts(r.selector).some((p) => APP_ROOT_PART.test(p)) && ds.some((d) => (d.prop === 'display' && d.value === 'none') || (d.prop === 'visibility' && d.value === 'hidden'));
        const turns = ds.some((d) => (d.prop === 'transform' || d.prop === 'rotate') && QUARTER_TURN.test(d.value));
        if (hides || turns) {
          add(
            id,
            'orientation-lock',
            `Inside an orientation media query, the rule “${sel}” ${hides ? 'hides the page' : 'turns content a quarter turn'}. That can lock the page to one orientation, which shuts out people whose device is fixed to a wheelchair or a stand. Check that the page works both ways up.`,
            `Dans une requête média d’orientation, la règle «\u202F${sel}\u202F» ${hides ? 'cache la page' : 'fait pivoter le contenu d’un quart de tour'}. Cela peut bloquer la page dans une seule orientation et exclure les personnes dont l’appareil est fixé à un fauteuil roulant ou à un support. Contrôlez que la page fonctionne dans les deux sens.`,
          );
        }
      }

      if (firstMoving === null && !/prefers-reduced-motion/.test(context) && ds.some(moves)) firstMoving = { id, sel };

      if (isRootSelector(r.selector)) {
        const clipped = ['overflow', 'overflow-x', 'overflow-y'].filter((p) => {
          const v = find(ds, p)?.value ?? '';
          return v.split(/\s+/).some((x) => x === 'hidden' || x === 'clip');
        });
        if (clipped.length > 0) {
          add(
            id,
            'root-scroll-locked',
            `The rule “${sel}” sets ${clipped.join(', ')} to hidden on the whole page. Content that does not fit at 320px or at 200% zoom is then cut off with no way to scroll to it, and a reflow test can miss it. Check the page zoomed in.`,
            `La règle «\u202F${sel}\u202F» met ${clipped.join(', ')} à hidden sur toute la page. Le contenu qui ne tient pas à 320\u00A0px ou à un zoom de 200\u00A0% est alors coupé, sans moyen de défiler jusqu’à lui, et un test de réorganisation peut le manquer. Contrôlez la page avec le zoom.`,
          );
        }
      }

      const zoomKinds = new Set(ds.map(blocksZoom).filter((k) => k !== null));
      if (zoomKinds.has('text-size') || (zoomKinds.has('touch') && isRootSelector(r.selector))) {
        const textSize = zoomKinds.has('text-size');
        add(
          id,
          'zoom-blocked',
          textSize
            ? `The rule “${sel}” sets text-size-adjust to none, which stops some phone browsers from enlarging text. Use 100% in its place, then check that text grows with the device setting.`
            : `The rule “${sel}” sets touch-action on the whole page to a value without pinch-zoom. People with low vision may be unable to pinch to zoom. Check on a touch screen, or add pinch-zoom.`,
          textSize
            ? `La règle «\u202F${sel}\u202F» met text-size-adjust à none, ce qui empêche certains navigateurs mobiles d’agrandir le texte. Utilisez 100\u00A0% à la place, puis contrôlez que le texte grandit avec le réglage de l’appareil.`
            : `La règle «\u202F${sel}\u202F» donne à touch-action, sur toute la page, une valeur sans pinch-zoom. Les personnes malvoyantes risquent de ne pas pouvoir pincer pour zoomer. Contrôlez sur un écran tactile, ou ajoutez pinch-zoom.`,
        );
      }
    }
  }

  if (firstMoving !== null && !hasReduceBlock && !linksSheet) {
    add(
      firstMoving.id,
      'motion-no-reduce',
      `The page styles animate or transition (first in “${firstMoving.sel}”) and no rule answers the reduced motion setting. People who turned motion off still get it. Add a prefers-reduced-motion block, then check with the motion check.`,
      `Les styles de la page animent ou font des transitions (d’abord dans «\u202F${firstMoving.sel}\u202F») et aucune règle ne répond au réglage de réduction des animations. Les personnes qui ont coupé les animations les subissent quand même. Ajoutez un bloc prefers-reduced-motion, puis contrôlez avec le test des animations.`,
    );
  }

  for (const n of nodes) {
    const style = n.attrs['style'];
    if (style === undefined || style.trim() === '') continue;
    checked++;
    const ds = parseDeclarations(style);
    if (removesOutline(ds) && isFocusable(n)) {
      add(
        nodeLabel(n),
        'outline-reset',
        `This ${n.tag} removes its own outline in a style attribute, which a focus rule in a style sheet cannot bring back. Unless something else shows focus, keyboard users cannot see it. Check with the Tab key.`,
        `Ce ${n.tag} retire son propre contour dans un attribut style, qu’une règle de focus d’une feuille de style ne peut pas rétablir. Si rien d’autre ne montre le focus, on ne le voit pas au clavier. Contrôlez avec la touche Tab.`,
      );
    }
    const locked = SPACING_PROPS.filter((p) => find(ds, p)?.important);
    if (locked.length > 0) {
      add(
        nodeLabel(n),
        'spacing-important',
        `This ${n.tag} sets ${locked.join(', ')} with !important in a style attribute. Nothing a person adds can override that, so wider text spacing does not apply here. Remove !important.`,
        `Ce ${n.tag} fixe ${locked.join(', ')} avec la priorité important dans un attribut style. Rien de ce qu’une personne ajoute ne peut passer outre\u00A0: un espacement du texte plus large ne s’applique pas ici. Retirez cette priorité.`,
      );
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
