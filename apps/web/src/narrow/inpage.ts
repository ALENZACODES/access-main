import type { Rect } from './types.js';

/**
 * Functions in this file run inside the page (serialised by evaluate), so each
 * must be self-contained: no use of anything from the enclosing module. They
 * read layout and computed styles. focusProbeInPage moves focus and
 * textSpacingProbeInPage adds a temporary style element; both put things back.
 */

export const MAX_ELEMENTS = 3000;

export interface ElSnap {
  readonly id: string;
  readonly tag: string;
  readonly role: string | null;
  readonly rect: Rect;
  /** Approximate accessible name (aria-label, labelledby, alt, value, label, text, title). */
  readonly name: string;
  /** Visible text of the control. */
  readonly text: string;
}

export interface TextSnap {
  readonly id: string;
  readonly text: string;
  readonly fg: string;
  /** Background colours from the element outwards, up to the first opaque layer. */
  readonly bgLayers: readonly string[];
  readonly bgImage: boolean;
  readonly fontSizePx: number;
  readonly fontWeight: number;
}

export interface DocSnap {
  readonly lang: string;
  readonly innerWidth: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly hasManifest: boolean;
}

export interface Snapshot {
  readonly doc: DocSnap;
  readonly interactive: readonly ElSnap[];
  readonly texts: readonly TextSnap[];
  /** Interactive elements that were hidden or had no size, so were not measured. */
  readonly unmeasured: number;
  readonly truncated: boolean;
}

export interface SnapshotArgs {
  readonly selector: string;
  readonly maxElements: number;
}

export interface FocusProbe {
  readonly id: string;
  readonly rect: Rect;
  readonly covers: readonly Rect[];
  readonly focused: boolean;
}

export interface ClipProbe {
  readonly id: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

export interface TextSpacingResult {
  readonly checked: number;
  readonly newlyClipped: readonly ClipProbe[];
}

export function snapshotInPage(args: SnapshotArgs): Snapshot {
  interface N {
    nodeType: number;
    textContent: string | null;
  }
  interface Cs {
    display: string;
    visibility: string;
    color: string;
    backgroundColor: string;
    backgroundImage: string;
    fontSize: string;
    fontWeight: string;
  }
  interface El {
    id: string;
    tagName: string;
    parentElement: El | null;
    childNodes: ArrayLike<N>;
    textContent: string | null;
    value?: string;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    getAttribute(n: string): string | null;
    getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
  }
  interface G {
    document: {
      querySelectorAll(s: string): ArrayLike<El>;
      querySelector(s: string): unknown;
      getElementById(id: string): El | null;
      body: { querySelectorAll(s: string): ArrayLike<El> };
      documentElement: { scrollWidth: number; clientWidth: number; getAttribute(n: string): string | null };
    };
    getComputedStyle(e: El): Cs;
    innerWidth?: number;
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const attr = (e: El, n: string): string => (e.getAttribute(n) ?? '').trim();
  const flat = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const visible = (e: El): boolean => {
    const cs = g.getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  };
  const labelText = (e: El): string => {
    const labs = e.labels;
    if (!labs || labs.length === 0) return '';
    const out: string[] = [];
    for (let i = 0; i < labs.length; i++) out.push(flat(labs[i]?.textContent ?? ''));
    return out.join(' ').trim();
  };
  const textOf = (e: El): string => {
    const tag = e.tagName.toLowerCase();
    if (tag === 'input') {
      const ty = attr(e, 'type').toLowerCase();
      return ty === 'button' || ty === 'submit' || ty === 'reset' ? attr(e, 'value') : '';
    }
    if (tag === 'select' || tag === 'textarea') return '';
    return flat(e.textContent);
  };
  const nameOf = (e: El): string => {
    const al = attr(e, 'aria-label');
    if (al) return al;
    const lb = attr(e, 'aria-labelledby');
    if (lb) {
      const parts = lb.split(/\s+/).map((id) => flat(doc.getElementById(id)?.textContent ?? ''));
      const joined = parts.join(' ').trim();
      if (joined) return joined;
    }
    const tag = e.tagName.toLowerCase();
    if (tag === 'img') return attr(e, 'alt');
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const v = textOf(e);
      if (v) return v;
      const l = labelText(e);
      if (l) return l;
      return attr(e, 'title');
    }
    return textOf(e) || attr(e, 'title');
  };

  const interactive: ElSnap[] = [];
  let unmeasured = 0;
  let truncated = false;
  const found = doc.querySelectorAll(args.selector);
  for (let i = 0; i < found.length; i++) {
    const el = found[i];
    if (!el) continue;
    if (i >= args.maxElements) {
      truncated = true;
      break;
    }
    if (el.getAttribute('disabled') !== null) continue;
    const r = el.getBoundingClientRect();
    if (!visible(el) || (r.width === 0 && r.height === 0)) {
      unmeasured++;
      continue;
    }
    interactive.push({
      id: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${i}]`,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      name: nameOf(el),
      text: textOf(el),
    });
  }

  const skip = ['script', 'style', 'noscript', 'svg', 'template'];
  const isOpaque = (c: string): boolean => /^rgb\(/.test(c) || /,\s*1\)$/.test(c);
  const texts: TextSnap[] = [];
  const all = doc.body.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!el) continue;
    if (i >= args.maxElements) {
      truncated = true;
      break;
    }
    if (skip.includes(el.tagName.toLowerCase())) continue;
    let own = '';
    for (let k = 0; k < el.childNodes.length; k++) {
      const n = el.childNodes[k];
      if (n && n.nodeType === 3) own += n.textContent ?? '';
    }
    own = flat(own);
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.width === 0 || r.height === 0) continue;
    const cs = g.getComputedStyle(el);
    const bgLayers: string[] = [];
    let bgImage = false;
    for (let p: El | null = el; p; p = p.parentElement) {
      const pcs = g.getComputedStyle(p);
      bgLayers.push(pcs.backgroundColor);
      if (pcs.backgroundImage && pcs.backgroundImage !== 'none') bgImage = true;
      if (isOpaque(pcs.backgroundColor)) break;
    }
    const w = cs.fontWeight === 'bold' ? 700 : parseInt(cs.fontWeight, 10);
    texts.push({
      id: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${i}]`,
      text: own,
      fg: cs.color,
      bgLayers,
      bgImage,
      fontSizePx: parseFloat(cs.fontSize),
      fontWeight: Number.isFinite(w) ? w : 400,
    });
  }

  const de = doc.documentElement;
  return {
    doc: {
      lang: (de.getAttribute('lang') ?? '').trim(),
      innerWidth: g.innerWidth ?? de.clientWidth,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      hasManifest: doc.querySelector('link[rel="manifest"]') !== null,
    },
    interactive,
    texts,
    unmeasured,
    truncated,
  };
}

/**
 * Moves focus to each control (up to max) and records which fixed or sticky
 * boxes overlap it. Restores focus and scroll position afterwards.
 */
export function focusProbeInPage(args: { readonly selector: string; readonly max: number }): FocusProbe[] {
  interface El {
    id: string;
    tagName: string;
    getAttribute(n: string): string | null;
    getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
    contains(o: El): boolean;
    focus(): void;
    blur?(): void;
  }
  interface G {
    document: {
      querySelectorAll(s: string): ArrayLike<El>;
      body: { querySelectorAll(s: string): ArrayLike<El> };
      activeElement: El | null;
    };
    getComputedStyle(e: El): { position: string; display: string; visibility: string };
    scrollX?: number;
    scrollY?: number;
    scrollTo?(x: number, y: number): void;
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const prev = doc.activeElement;
  const sx = g.scrollX ?? 0;
  const sy = g.scrollY ?? 0;
  const out: FocusProbe[] = [];
  try {
    const sticky: El[] = [];
    const all = doc.body.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (!e) continue;
      const cs = g.getComputedStyle(e);
      if ((cs.position === 'fixed' || cs.position === 'sticky') && cs.display !== 'none' && cs.visibility !== 'hidden') {
        sticky.push(e);
      }
    }
    const found = doc.querySelectorAll(args.selector);
    for (let i = 0; i < found.length && out.length < args.max; i++) {
      const el = found[i];
      if (!el || el.getAttribute('disabled') !== null) continue;
      const before = el.getBoundingClientRect();
      if (before.width === 0 && before.height === 0) continue;
      el.focus();
      const r = el.getBoundingClientRect();
      const covers: Rect[] = [];
      for (const s of sticky) {
        if (s === el || s.contains(el)) continue;
        const c = s.getBoundingClientRect();
        if (c.width > 0 && c.height > 0) covers.push({ left: c.left, top: c.top, right: c.right, bottom: c.bottom });
      }
      out.push({
        id: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${i}]`,
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        covers,
        focused: doc.activeElement === el,
      });
    }
  } finally {
    if (prev) prev.focus();
    else if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
    if (g.scrollTo) g.scrollTo(sx, sy);
  }
  return out;
}

/**
 * Applies the WCAG 1.4.12 text spacing values in a temporary style element and
 * returns the elements that become clipped because of it. The style element is
 * always removed.
 */
export function textSpacingProbeInPage(args: { readonly css: string; readonly maxElements: number }): TextSpacingResult {
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    scrollWidth: number;
    clientWidth: number;
    scrollHeight: number;
    clientHeight: number;
  }
  interface Style {
    textContent: string | null;
    remove(): void;
  }
  interface G {
    document: {
      body: { querySelectorAll(s: string): ArrayLike<El> };
      head: { appendChild(s: Style): unknown };
      createElement(tag: string): Style;
    };
    getComputedStyle(e: El): { overflowX: string; overflowY: string };
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const clips = (v: string): boolean => v === 'hidden' || v === 'clip';
  const measure = (): Map<string, ClipProbe> => {
    const map = new Map<string, ClipProbe>();
    const all = doc.body.querySelectorAll('*');
    for (let i = 0; i < all.length && i < args.maxElements; i++) {
      const e = all[i];
      if (!e || !(e.textContent ?? '').trim()) continue;
      const cs = g.getComputedStyle(e);
      const wide = clips(cs.overflowX) && e.scrollWidth > e.clientWidth + 1;
      const tall = clips(cs.overflowY) && e.scrollHeight > e.clientHeight + 1;
      if (wide || tall) {
        const id = `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}[${i}]`;
        map.set(id, {
          id,
          scrollWidth: e.scrollWidth,
          clientWidth: e.clientWidth,
          scrollHeight: e.scrollHeight,
          clientHeight: e.clientHeight,
        });
      }
    }
    return map;
  };
  const checked = Math.min(doc.body.querySelectorAll('*').length, args.maxElements);
  const before = measure();
  const style = doc.createElement('style');
  style.textContent = args.css;
  doc.head.appendChild(style);
  try {
    const after = measure();
    const newlyClipped: ClipProbe[] = [];
    for (const [id, probe] of after) if (!before.has(id)) newlyClipped.push(probe);
    return { checked, newlyClipped };
  } finally {
    style.remove();
  }
}

/** WCAG 1.4.12 values: line height 1.5, paragraph spacing 2em, letter 0.12em, word 0.16em. */
export const TEXT_SPACING_CSS =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }' +
  ' p { margin-bottom: 2em !important; }';
