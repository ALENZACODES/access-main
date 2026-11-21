import { readColor } from './colorspace.js';
import { fixContrast, fixSentence, minimumText, ratioText, type Fix } from './contrast-fix.js';
import { composite, type Rgba } from './contrast.js';
import { parseCss } from './cssrules.js';
import { NBSP, clip, type CheckResult, type Entry, type Lang } from './types.js';

/**
 * The colour tokens of a style sheet (CSS custom properties such as
 * `--ink: #1b1916`) and the contrast of the pairs their names put together:
 * `--header-ink` on `--header`, `--on-accent` on `--accent`, `--ink` on
 * `--bg`. Each block that sets tokens (the root, a dark scheme, a
 * high-contrast theme) is read as a theme of its own.
 *
 * A pair is measured only when both colours are known. A token written with
 * a colour function this module does not compute, or a surface with
 * transparency, gives UNKNOWN, never a guess. Which tokens belong together
 * is read from their names, so a pair with other names is not looked at
 * unless it is passed in.
 */

export type TokenGap = 'unread' | 'reference';

export interface Token {
  /** With its two dashes: `--ink`. */
  readonly name: string;
  /** As written, after `var()` references were followed. */
  readonly value: string;
  /** Null when the value could not be turned into a colour. */
  readonly color: Rgba | null;
  readonly gap?: TokenGap;
  /** True when this block sets the token itself. False when it is taken over from the first block. */
  readonly own: boolean;
}

export interface Theme {
  /** Where the tokens are set: the at-rules around the rule, then its selector. */
  readonly label: string;
  readonly tokens: readonly Token[];
}

/** Colour functions that exist in CSS and that this module does not compute. A token written with one is a colour whose value is UNKNOWN here. */
const UNREAD_FUNCTIONS = /^(oklch|oklab|lch|lab|hwb|color|color-mix|light-dark|device-cmyk)\(/i;
const SYSTEM_OR_KEYWORD = /^(currentcolor|canvas|canvastext|linktext|visitedtext|activetext|buttonface|buttontext|buttonborder|field|fieldtext|highlight|highlighttext|selecteditem|selecteditemtext|mark|marktext|graytext|accentcolor|accentcolortext)$/i;

function resolve(value: string, lookup: (name: string) => string | undefined, depth = 0): { value: string; open: boolean } {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/s.exec(value.trim());
  if (!m) return { value: value.trim(), open: false };
  if (depth > 8) return { value: value.trim(), open: true };
  const target = lookup(m[1] ?? '');
  if (target !== undefined) return resolve(target, lookup, depth + 1);
  if (m[2] !== undefined) return resolve(m[2], lookup, depth + 1);
  return { value: value.trim(), open: true };
}

/**
 * The themes of a style sheet, in the order they first appear. Rules with
 * the same selector and at-rules are one theme, and a later declaration
 * replaces an earlier one. Only tokens that hold a colour are kept. A theme
 * other than the first one is completed by the first one, as the cascade
 * would do for a token it does not set again, and such a token is marked
 * as not its own.
 */
export function themesFromCss(css: string): Theme[] {
  const raw = new Map<string, Map<string, string>>();
  for (const rule of parseCss(css)) {
    const custom = rule.declarations.filter((d) => d.prop.startsWith('--'));
    if (custom.length === 0) continue;
    const label = [...rule.context, rule.selector].join(' ').replace(/\s+/g, ' ').trim();
    const bag = raw.get(label) ?? new Map<string, string>();
    for (const d of custom) bag.set(d.prop, d.value);
    raw.set(label, bag);
  }
  const labels = [...raw.keys()];
  const base = labels[0] === undefined ? undefined : raw.get(labels[0]);
  const themes: Theme[] = [];
  labels.forEach((label, index) => {
    const own = raw.get(label) ?? new Map<string, string>();
    const merged = new Map<string, string>(index === 0 || !base ? [] : base);
    for (const [k, v] of own) merged.set(k, v);
    const tokens: Token[] = [];
    for (const [name, written] of merged) {
      const r = resolve(written, (n) => merged.get(n));
      const color = readColor(r.value);
      const isOwn = own.has(name);
      if (color) tokens.push({ name, value: r.value, color, own: isOwn });
      else if (UNREAD_FUNCTIONS.test(r.value) || SYSTEM_OR_KEYWORD.test(r.value)) tokens.push({ name, value: r.value, color: null, gap: 'unread', own: isOwn });
      else if (r.open && isColorName(name)) tokens.push({ name, value: r.value, color: null, gap: 'reference', own: isOwn });
    }
    if (tokens.some((t) => t.own)) themes.push({ label, tokens });
  });
  return themes;
}

const TEXT_WORDS = ['ink', 'text', 'fg', 'foreground'];
const SURFACE_WORDS = ['bg', 'background', 'surface'];

/** True when a token name, by its words, says it holds a colour. Used only to keep an unresolved reference in view. */
function isColorName(name: string): boolean {
  const words = name.replace(/^--/, '').split('-');
  return words.some((w) => TEXT_WORDS.includes(w) || SURFACE_WORDS.includes(w) || w === 'color' || w === 'colour' || w === 'on');
}

export interface NamedPair {
  readonly text: string;
  readonly surface: string;
}

/**
 * The pairs the names put together, text first:
 * `--x-ink`, `--x-text`, `--x-fg`, `--x-foreground` and `--on-x` on `--x`;
 * `--x-fg` or `--x-text` on `--x-bg`; and a bare `--ink`, `--text` or `--fg`
 * on each bare `--bg`, `--background` or `--surface`.
 */
export function pairsByName(names: readonly string[]): NamedPair[] {
  const has = new Set(names);
  const out: NamedPair[] = [];
  const add = (text: string, surface: string): void => {
    if (text !== surface && has.has(text) && has.has(surface) && !out.some((p) => p.text === text && p.surface === surface)) out.push({ text, surface });
  };
  for (const name of names) {
    const stem = name.replace(/^--/, '');
    for (const word of TEXT_WORDS) {
      if (stem.endsWith(`-${word}`)) {
        const x = stem.slice(0, -word.length - 1);
        add(name, `--${x}`);
        for (const s of SURFACE_WORDS) add(name, `--${x}-${s}`);
      }
      if (stem === word) for (const s of SURFACE_WORDS) add(name, `--${s}`);
    }
    if (stem.startsWith('on-')) add(name, `--${stem.slice(3)}`);
  }
  return out;
}

export type PairStatus = 'reaches' | 'below' | 'unknown';

export interface TokenPair {
  readonly text: string;
  readonly surface: string;
  readonly status: PairStatus;
  /** Cut to two decimals. Null when the pair could not be measured. */
  readonly ratio: number | null;
  /** Suggestions when the pair is below the minimum. */
  readonly fix: Fix | null;
  /** Why the pair is UNKNOWN. */
  readonly gap?: 'text-unread' | 'surface-unread' | 'surface-transparent';
}

export interface ThemePairs {
  readonly label: string;
  /** Colour tokens this block sets itself. */
  readonly colors: number;
  readonly pairs: readonly TokenPair[];
}

export interface PaletteOptions {
  /** The minimum to reach. Default 4.5, the one for normal text. */
  readonly required?: number;
  /** Pairs to look at on top of those the names give. */
  readonly pairs?: readonly NamedPair[];
}

export const DEFAULT_REQUIRED = 4.5;

export function measurePair(text: Token, surface: Token, required: number): TokenPair {
  const names = { text: text.name, surface: surface.name };
  if (!surface.color) return { ...names, status: 'unknown', ratio: null, fix: null, gap: 'surface-unread' };
  if (surface.color.a < 1) return { ...names, status: 'unknown', ratio: null, fix: null, gap: 'surface-transparent' };
  if (!text.color) return { ...names, status: 'unknown', ratio: null, fix: null, gap: 'text-unread' };
  const fix = fixContrast({ ...composite(text.color, surface.color), a: 1 }, surface.color, required);
  return { ...names, status: fix.meets ? 'reaches' : 'below', ratio: fix.ratio, fix: fix.meets ? null : fix };
}

export function auditPalette(themes: readonly Theme[], options: PaletteOptions = {}): ThemePairs[] {
  const required = options.required ?? DEFAULT_REQUIRED;
  return themes.map((theme) => {
    const by = new Map(theme.tokens.map((t) => [t.name, t]));
    const wanted = [...pairsByName(theme.tokens.map((t) => t.name))];
    for (const p of options.pairs ?? []) {
      if (by.has(p.text) && by.has(p.surface) && !wanted.some((w) => w.text === p.text && w.surface === p.surface)) wanted.push(p);
    }
    const pairs: TokenPair[] = [];
    for (const p of wanted) {
      const text = by.get(p.text);
      const surface = by.get(p.surface);
      // A pair whose two tokens both come from the first block was measured there already.
      if (text && surface && (text.own || surface.own)) pairs.push(measurePair(text, surface, required));
    }
    return { label: theme.label, colors: theme.tokens.filter((t) => t.own).length, pairs };
  });
}

/** One sentence for a pair: what was measured, or why it could not be. */
export function pairSentence(pair: TokenPair, required: number, lang: Lang): string {
  const fr = lang === 'fr';
  const names = fr ? `${pair.text} sur ${pair.surface}` : `${pair.text} on ${pair.surface}`;
  const colon = fr ? `${NBSP}:` : ':';
  if (pair.status === 'unknown' || pair.ratio === null) {
    const why =
      pair.gap === 'surface-transparent'
        ? fr
          ? 'le fond est en partie transparent, et ce qui se trouve derrière dépend de la page'
          : 'the surface is partly transparent, and what is behind it depends on the page'
        : fr
          ? `la valeur de ${pair.gap === 'text-unread' ? pair.text : pair.surface} n’a pas pu être lue comme une couleur`
          : `the value of ${pair.gap === 'text-unread' ? pair.text : pair.surface} could not be read as a colour`;
    return `${names}${colon} UNKNOWN, ${why}.`;
  }
  const min = minimumText(required, lang);
  if (pair.status === 'reaches') return fr ? `${names}${colon} ${ratioText(pair.ratio, 'fr')}, ce qui atteint ${min}.` : `${names}: ${ratioText(pair.ratio, 'en')}, which reaches ${min}.`;
  const tail = pair.fix ? ` ${fixSentence(pair.fix, lang)}` : '';
  return (fr ? `${names}${colon} ${ratioText(pair.ratio, 'fr')}, sous le minimum de ${min}.` : `${names}: ${ratioText(pair.ratio, 'en')}, below the ${min} minimum.`) + tail;
}

/**
 * The pairs as findings of the contrast check: a pair below the minimum is a
 * failure, a pair that could not be measured is UNKNOWN, and a pair that
 * reaches the minimum gives no entry. `checked` counts every pair looked at.
 */
export function paletteEntries(themes: readonly ThemePairs[], required = DEFAULT_REQUIRED): CheckResult {
  const entries: Entry[] = [];
  let checked = 0;
  for (const theme of themes) {
    for (const pair of theme.pairs) {
      checked += 1;
      if (pair.status === 'reaches') continue;
      entries.push({
        check: 'contrast',
        rule: pair.status === 'below' ? 'token-pair-low' : 'token-pair-unmeasured',
        id: `${clip(theme.label, 60)} ${pair.text} ${pair.surface}`,
        status: pair.status === 'below' ? 'fail' : 'unknown',
        message: { en: pairSentence(pair, required, 'en'), fr: pairSentence(pair, required, 'fr') },
      });
    }
  }
  return { checked, entries };
}

export interface PageCss {
  readonly text: string;
  /** Style sheets the browser would not let the page read, such as those from another site. */
  readonly unreadable: number;
}

/** The CSS of every style sheet of the current document that the page may read. Empty outside a browser. */
export function pageCss(): PageCss {
  const doc = (globalThis as unknown as { document?: { styleSheets?: ArrayLike<{ cssRules: ArrayLike<{ cssText: string }> }> } }).document;
  const sheets = doc?.styleSheets;
  if (!sheets) return { text: '', unreadable: 0 };
  const parts: string[] = [];
  let unreadable = 0;
  for (let i = 0; i < sheets.length; i += 1) {
    try {
      const rules = sheets[i]?.cssRules;
      if (!rules) continue;
      for (let j = 0; j < rules.length; j += 1) parts.push(rules[j]?.cssText ?? '');
    } catch {
      unreadable += 1;
    }
  }
  return { text: parts.join('\n'), unreadable };
}
