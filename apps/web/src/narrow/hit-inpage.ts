/**
 * Where a pointer lands on each control of the page that is running the code,
 * as far as the browser can tell: for each control, it asks the browser what
 * is at five points inside the control (the middle and four points near the
 * corners). A point where something else is on top is a point where a press
 * would not reach the control.
 *
 * The browser can only answer for what is on the screen, so a control that is
 * not is scrolled to the middle of the screen first, and the page is scrolled
 * back to where it was at the end, as the focus probe of the audit does. A
 * control that still does not fit on the screen is counted, not tested. It
 * does not move focus or press anything, and changes nothing in the page.
 */

export interface HitCover {
  /** What is on top, as tag, id and the first class. */
  readonly what: string;
  /** Its name or the start of its text, or ''. */
  readonly name: string;
  /** Whether it is fixed or sticky to the screen. */
  readonly pinned: boolean;
  /** Whether it shows nothing: fully transparent, or no text, border, background or picture. */
  readonly invisible: boolean;
}

export interface HitControl {
  readonly id: string;
  readonly name: string;
  /** Of the five points, how many reach the control (or something inside it). */
  readonly reached: number;
  /** What is on top at the points that do not reach it, or null when every point reaches it. */
  readonly cover: HitCover | null;
}

export interface HitFacts {
  readonly controls: readonly HitControl[];
  /** Controls that could not be brought fully onto the screen, so not tested. */
  readonly offScreen: number;
  readonly truncated: boolean;
}

export interface HitArgs {
  readonly maxControls: number;
  /** Whether to scroll a control onto the screen to test it, and back at the end. Without it, only what is on the screen is tested. */
  readonly scroll: boolean;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const HIT_ARGS: HitArgs = { maxControls: 400, scroll: true, exclude: '' };
/** The points asked about, as fractions of the control's box. */
export const HIT_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.5],
  [0.2, 0.2],
  [0.8, 0.2],
  [0.2, 0.8],
  [0.8, 0.8],
];

/** Runs in the page (serialised by evaluate, so it takes one argument and is self-contained). Reads only. */
export function hitInPage(args: HitArgs): HitFacts {
  interface El {
    id: string;
    tagName: string;
    className?: unknown;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    value?: string;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): { left: number; top: number; width: number; height: number };
    contains(o: El | null): boolean;
    querySelector(s: string): El | null;
  }
  interface Style {
    display: string;
    visibility: string;
    opacity: string;
    position: string;
    backgroundColor: string;
    backgroundImage: string;
    borderTopWidth: string;
    borderTopStyle: string;
    pointerEvents: string;
  }
  interface G {
    document: { body: { querySelectorAll(s: string): ArrayLike<El> }; querySelector(s: string): El | null; getElementById(id: string): El | null; elementFromPoint(x: number, y: number): El | null };
    getComputedStyle(e: El): Style;
    innerWidth: number;
    innerHeight: number;
    scrollX?: number;
    scrollY?: number;
    scrollTo?(o: { left: number; top: number; behavior: string }): void;
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const POINTS = [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.2],
    [0.2, 0.8],
    [0.8, 0.8],
  ] as const;
  const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const short = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const nameOf = (e: El): string => {
    let n = one(e.getAttribute('aria-label'));
    if (n === '') {
      const by = one(e.getAttribute('aria-labelledby'));
      if (by !== '') n = one(by.split(' ').map((id) => doc.getElementById(id)?.textContent ?? '').join(' '));
    }
    if (n === '' && e.labels && e.labels.length > 0) n = one(e.labels[0]?.textContent);
    if (n === '' && e.tagName.toLowerCase() === 'input') n = one(e.value ?? e.getAttribute('value'));
    if (n === '') n = one(e.textContent);
    if (n === '') n = one(e.getAttribute('title') ?? e.getAttribute('alt'));
    return short(n);
  };
  const what = (e: El): string => {
    const cls = typeof e.className === 'string' ? (e.className.trim().split(/\s+/)[0] ?? '') : '';
    return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${cls ? '.' + cls : ''}`;
  };
  const pinnedOf = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      const pos = g.getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
    }
    return false;
  };
  const invisibleOf = (e: El): boolean => {
    const s = g.getComputedStyle(e);
    if (Number.parseFloat(s.opacity) === 0) return true;
    // An empty value is one the browser does not report: nothing set.
    const clearBg = s.backgroundColor === '' || s.backgroundColor === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(s.backgroundColor);
    const noBorder = s.borderTopStyle === '' || s.borderTopStyle === 'none' || !(Number.parseFloat(s.borderTopWidth) > 0);
    const noPicture = (s.backgroundImage === '' || s.backgroundImage === 'none') && !['img', 'svg', 'canvas', 'video', 'iframe'].includes(e.tagName.toLowerCase());
    return clearBg && noBorder && noPicture && one(e.textContent) === '';
  };
  const hidden = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      if (g.getComputedStyle(p).display === 'none' || p.hasAttribute('hidden') || p.hasAttribute('inert')) return true;
    }
    return g.getComputedStyle(e).visibility === 'hidden';
  };

  const all = doc.body.querySelectorAll(
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"],[role="slider"]',
  );
  const controls: HitControl[] = [];
  const counts: Record<string, number> = {};
  const startX = g.scrollX ?? 0;
  const startY = g.scrollY ?? 0;
  let moved = false;
  let offScreen = 0;
  let truncated = false;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e) continue;
    const tag = e.tagName.toLowerCase();
    const n = counts[tag] ?? 0;
    counts[tag] = n + 1;
    if ((excluded && excluded.contains(e)) || e.disabled === true || hidden(e)) continue;
    let r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    // Every point has to be on the screen to be asked about: bring the control to the middle of the screen if it is not.
    const fits = (b: { left: number; top: number; width: number; height: number }): boolean => b.left >= 0 && b.top >= 0 && b.left + b.width <= g.innerWidth && b.top + b.height <= g.innerHeight;
    if (!fits(r) && args.scroll && typeof g.scrollTo === 'function') {
      g.scrollTo({ left: (g.scrollX ?? 0) + r.left - (g.innerWidth - r.width) / 2, top: (g.scrollY ?? 0) + r.top - (g.innerHeight - r.height) / 2, behavior: 'instant' });
      moved = true;
      r = e.getBoundingClientRect();
    }
    if (!fits(r)) {
      offScreen++;
      continue;
    }
    if (controls.length >= args.maxControls) {
      truncated = true;
      break;
    }
    let reached = 0;
    let top: El | null = null;
    for (const [fx, fy] of POINTS) {
      const at = doc.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      // A label for the control, or something inside it, takes the press to it too.
      const reaches = at !== null && (at === e || e.contains(at) || (at.tagName.toLowerCase() === 'label' && e.labels !== undefined && Array.from(e.labels ?? []).includes(at as never)));
      if (reaches) reached++;
      else if (top === null && at !== null) top = at;
    }
    controls.push({
      id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`,
      name: nameOf(e),
      reached,
      cover: reached === POINTS.length || top === null ? null : { what: what(top), name: short(nameOf(top), 40), pinned: pinnedOf(top), invisible: invisibleOf(top) },
    });
  }
  // Put the page back where the person had it.
  if (moved) g.scrollTo?.({ left: startX, top: startY, behavior: 'instant' });
  return { controls, offScreen, truncated };
}
