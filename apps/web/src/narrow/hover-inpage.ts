/**
 * The style rules of the page that is running the code that show something
 * on hover: rules with `:hover` in a selector that set display, visibility,
 * opacity, a size, a clip or a transform. For each, whether a rule with
 * `:focus`, `:focus-within` or `:focus-visible` in the same place shows it
 * too, and what the rule hides on the page right now, controls first.
 *
 * Style sheets from another origin cannot be read; they are counted, so the
 * panel can say what stays UNKNOWN. It reads only.
 */

export interface HoverRule {
  /** The selector part with `:hover`, on one line, shortened. */
  readonly selector: string;
  /** The properties it sets that can show or hide something. */
  readonly reveals: readonly string[];
  /** True when a rule with a focus pseudo-class in the place of `:hover` exists in a sheet that was read. */
  readonly twin: boolean;
  /** Elements the selector reaches without `:hover` that are hidden right now. */
  readonly hiddenNow: number;
  /** Of those, the ones that are a control or hold one. */
  readonly controlsHidden: number;
  /** Names of some of the hidden controls. */
  readonly controlNames: readonly string[];
}

export interface HoverFacts {
  readonly rules: readonly HoverRule[];
  /** Style sheets that could not be read (from another origin, say). */
  readonly sheetsUnread: number;
  readonly sheetsRead: number;
  /** Whether the main pointer of the device can hover: true, false, or null when it cannot be told. */
  readonly deviceHover: boolean | null;
  readonly truncated: boolean;
}

export interface HoverArgs {
  readonly maxRules: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const HOVER_ARGS: HoverArgs = { maxRules: 300, exclude: '' };

/** The properties a hover rule may use to show something. */
export const REVEAL_PROPS: readonly string[] = ['display', 'visibility', 'opacity', 'max-height', 'height', 'width', 'clip', 'clip-path', 'transform'];

/** Splits a selector list at its top-level commas (not those inside parentheses). */
export function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

/**
 * A selector made comparable: spaces around combinators and runs of spaces
 * made the same, and a pseudo-class that starts a compound written as `*:x`,
 * so `nav :hover > ul` and `nav *:hover>ul` are the same.
 */
export function normalSelector(s: string): string {
  return s
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[ >+~(])(?=:)/g, '$1*');
}

/** The selector with every `:hover` taken out, so it reaches the elements whether hovered or not. */
export function withoutHover(s: string): string {
  return normalSelector(s).replace(/:hover\b/g, '');
}

/** The selectors a focus rule would have in the place of this hover rule. */
export function focusTwins(s: string): string[] {
  return [':focus', ':focus-within', ':focus-visible'].map((p) => normalSelector(s).replace(/:hover\b/g, p));
}

/** Whether a declaration can show something: not a value that hides. */
export function revealsWith(prop: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === '') return false;
  if (prop === 'display') return v !== 'none';
  if (prop === 'visibility') return v === 'visible';
  if (prop === 'opacity') return Number.parseFloat(v) > 0;
  if (prop === 'max-height' || prop === 'height' || prop === 'width') return !/^0(px|em|rem|%)?$/.test(v);
  return true;
}

/** Runs in the page (serialised by evaluate, so it takes one argument and is self-contained). Reads only. */
export function hoverInPage(args: HoverArgs): HoverFacts {
  interface El {
    tagName: string;
    textContent: string | null;
    parentElement: El | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    contains(o: El): boolean;
    matches(s: string): boolean;
    querySelector(s: string): El | null;
    querySelectorAll(s: string): ArrayLike<El>;
  }
  interface Rule {
    type: number;
    selectorText?: string;
    style?: { length: number; [i: number]: string; getPropertyValue(p: string): string };
    cssRules?: ArrayLike<Rule>;
  }
  interface Sheet {
    cssRules: ArrayLike<Rule>;
  }
  interface G {
    document: { styleSheets: ArrayLike<Sheet>; querySelector(s: string): El | null; querySelectorAll(s: string): ArrayLike<El>; getElementById(id: string): El | null };
    getComputedStyle(e: El): { display: string; visibility: string; opacity: string };
    matchMedia?(q: string): { matches: boolean };
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const short = (s: string, n = 80): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  // The helpers above this function are copied in, since evaluate sends this function alone.
  const PROPS = ['display', 'visibility', 'opacity', 'max-height', 'height', 'width', 'clip', 'clip-path', 'transform'];
  const split = (list: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim() !== '') out.push(cur.trim());
    return out;
  };
  const norm = (s: string): string =>
    s
      .replace(/\s*([>+~])\s*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/(^|[ >+~(])(?=:)/g, '$1*');
  const bare = (s: string): string => norm(s).replace(/:hover\b/g, '');
  const twins = (s: string): string[] => [':focus', ':focus-within', ':focus-visible'].map((p) => norm(s).replace(/:hover\b/g, p));
  const reveals = (prop: string, value: string): boolean => {
    const v = value.trim().toLowerCase();
    if (v === '') return false;
    if (prop === 'display') return v !== 'none';
    if (prop === 'visibility') return v === 'visible';
    if (prop === 'opacity') return Number.parseFloat(v) > 0;
    if (prop === 'max-height' || prop === 'height' || prop === 'width') return !/^0(px|em|rem|%)?$/.test(v);
    return true;
  };
  const CONTROL = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[tabindex]';
  const nameOf = (e: El): string => {
    let n = one(e.getAttribute('aria-label'));
    if (n === '') n = one(e.textContent);
    if (n === '') n = one(e.getAttribute('title'));
    return short(n, 60);
  };
  const hiddenNow = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      const s = g.getComputedStyle(p);
      if (s.display === 'none' || p.hasAttribute('hidden')) return true;
      if (p === e && (s.visibility === 'hidden' || Number.parseFloat(s.opacity) === 0)) return true;
    }
    return false;
  };

  // Every style rule, with @media and @supports opened up.
  const all: Rule[] = [];
  let sheetsRead = 0;
  let sheetsUnread = 0;
  const walk = (rules: ArrayLike<Rule>): void => {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (!r) continue;
      if (r.selectorText !== undefined) all.push(r);
      else if (r.cssRules) walk(r.cssRules);
    }
  };
  // The sheets of the excluded part, found from its style and link elements.
  const skipSheets = new Set<unknown>();
  if (excluded) {
    const owners = excluded.querySelectorAll('style,link');
    for (let i = 0; i < owners.length; i++) {
      const sheet = (owners[i] as unknown as { sheet?: unknown } | undefined)?.sheet;
      if (sheet) skipSheets.add(sheet);
    }
  }
  for (let i = 0; i < doc.styleSheets.length; i++) {
    const sheet = doc.styleSheets[i];
    if (!sheet || skipSheets.has(sheet)) continue;
    let rules: ArrayLike<Rule> | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null;
    }
    if (!rules) {
      sheetsUnread++;
      continue;
    }
    sheetsRead++;
    walk(rules);
  }

  const selectors = new Set<string>();
  for (const r of all) for (const part of split(r.selectorText ?? '')) selectors.add(norm(part));

  const out: HoverRule[] = [];
  let truncated = false;
  for (const r of all) {
    if (!r.style) continue;
    const props: string[] = [];
    for (const p of PROPS) {
      const v = r.style.getPropertyValue(p);
      if (reveals(p, v)) props.push(p);
    }
    if (props.length === 0) continue;
    for (const part of split(r.selectorText ?? '')) {
      // A rule for what is not hovered (`:not(:hover)`) shows nothing on hover.
      if (!/:hover\b/.test(part) || /:not\([^)]*:hover/.test(part)) continue;
      if (out.length >= args.maxRules) {
        truncated = true;
        break;
      }
      let matched: ArrayLike<El> = [];
      try {
        matched = doc.querySelectorAll(bare(part));
      } catch {
        matched = [];
      }
      let hidden = 0;
      let controls = 0;
      const names: string[] = [];
      for (let j = 0; j < matched.length; j++) {
        const e = matched[j];
        if (!e || (excluded && excluded.contains(e)) || !hiddenNow(e)) continue;
        hidden++;
        const inner = e.matches(CONTROL) ? [e] : Array.from(e.querySelectorAll(CONTROL));
        if (inner.length > 0) {
          controls++;
          for (const c of inner) if (names.length < 5 && c) names.push(nameOf(c) || 'UNKNOWN');
        }
      }
      out.push({ selector: short(one(part)), reveals: props, twin: twins(part).some((t) => selectors.has(t)), hiddenNow: hidden, controlsHidden: controls, controlNames: names });
    }
  }

  let deviceHover: boolean | null = null;
  if (typeof g.matchMedia === 'function') {
    if (g.matchMedia('(hover: hover)').matches) deviceHover = true;
    else if (g.matchMedia('(hover: none)').matches) deviceHover = false;
  }
  return { rules: out, sheetsUnread, sheetsRead, deviceHover, truncated };
}
