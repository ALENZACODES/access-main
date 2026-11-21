/**
 * The controls of the page that is running the code that may ask for a drag
 * or a gesture: sliders, elements that can be dragged, carousels, canvases and
 * applications, areas that take touch for themselves, and strips that scroll
 * sideways and snap. For each, the buttons found in it or around it that may
 * do the same with a single tap or click.
 *
 * It reads only. It does not scroll the page, move focus or start a drag.
 */

export type GestureKind = 'slider' | 'draggable' | 'carousel' | 'canvas' | 'touch-none' | 'sideways';

export interface GestureItem {
  readonly id: string;
  readonly kind: GestureKind;
  /** The name, close to what assistive technology gets, on one line, shortened. */
  readonly name: string;
  /** Names of the buttons nearby that look like a single-tap way to do the same. */
  readonly alternatives: readonly string[];
  /** Whether it can be reached by keyboard: true, false, or null when that cannot be told from the markup. */
  readonly keyboard: boolean | null;
}

export interface GestureFacts {
  readonly items: readonly GestureItem[];
  readonly truncated: boolean;
}

export interface GestureArgs {
  readonly maxItems: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const GESTURE_ARGS: GestureArgs = { maxItems: 200, exclude: '' };

/** Runs in the page (serialised by evaluate, so it takes one argument and is self-contained). Reads only. */
export function gestureInPage(args: GestureArgs): GestureFacts {
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    value?: string;
    tabIndex?: number;
    scrollWidth?: number;
    clientWidth?: number;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): { width: number; height: number };
    contains(o: El): boolean;
    querySelectorAll(s: string): ArrayLike<El>;
  }
  interface Style {
    display: string;
    visibility: string;
    overflowX: string;
    touchAction?: string;
    scrollSnapType?: string;
  }
  interface G {
    document: { body: El; querySelector(s: string): El | null; getElementById(id: string): El | null };
    getComputedStyle(e: El): Style;
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const short = (n: string): string => (n.length > 60 ? `${n.slice(0, 59)}…` : n);
  const nameOf = (e: El): string => {
    let n = one(e.getAttribute('aria-label'));
    if (n === '') {
      const by = one(e.getAttribute('aria-labelledby'));
      if (by !== '') n = one(by.split(' ').map((id) => doc.getElementById(id)?.textContent ?? '').join(' '));
    }
    if (n === '' && e.labels && e.labels.length > 0) n = one(e.labels[0]?.textContent);
    if (n === '' && e.tagName.toLowerCase() !== 'input') n = one(e.textContent);
    if (n === '') n = one(e.getAttribute('title') ?? e.getAttribute('alt'));
    return short(n);
  };
  const hidden = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      if (g.getComputedStyle(p).display === 'none' || p.hasAttribute('hidden') || p.hasAttribute('inert')) return true;
    }
    if (g.getComputedStyle(e).visibility === 'hidden') return true;
    const r = e.getBoundingClientRect();
    return r.width <= 0 || r.height <= 0;
  };
  const focusable = (e: El): boolean | null => {
    const tag = e.tagName.toLowerCase();
    const ti = e.getAttribute('tabindex');
    if (ti !== null) return Number(ti) >= 0;
    if (['input', 'select', 'textarea', 'button'].includes(tag)) return e.disabled !== true;
    if (tag === 'a' && e.hasAttribute('href')) return true;
    return false;
  };
  // Words a single-tap way to do the same is often named with.
  const WORDS: Record<GestureKind, RegExp> = {
    slider: /^[+\-−–]$|increase|decrease|augmenter|diminuer|\b(more|less|plus|moins|raise|lower|up|down|haut|bas)\b/i,
    draggable: /move|déplacer|monter|descendre|reorder|réordonner|\b(up|down|left|right|first|last|before|after|gauche|droite|premier|dernier|avant|après)\b/i,
    carousel: /next|previous|prev|suivant|précédent|^[‹›<>«»←→]$|slide|diapositive/i,
    canvas: /zoom|^[+\-−–]$|agrandir|réduire|rapprocher|éloigner|recentrer|centrer|center|\b(pan|left|right|up|down|gauche|droite|haut|bas)\b/i,
    'touch-none': /./,
    sideways: /next|previous|suivant|précédent|scroll|défiler|^[‹›<>«»←→]$|\b(prev|more|plus)\b/i,
  };
  const altsFor = (e: El, kind: GestureKind): string[] => {
    // The element itself and up to two levels around it, never the whole page or its main part. An area that takes
    // touch for itself is looked into only: any button around it could look like a way out.
    let scope: El = e;
    const wide = (p: El): boolean => p === doc.body || p.tagName.toLowerCase() === 'main' || p.getAttribute('role') === 'main';
    for (let i = 0; kind !== 'touch-none' && i < 2 && scope.parentElement && !wide(scope.parentElement); i++) scope = scope.parentElement;
    const found: string[] = [];
    const buttons = scope.querySelectorAll('button,[role="button"],input[type="button"],input[type="number"],[role="spinbutton"],[role="tab"],a[href]');
    for (let i = 0; i < buttons.length && found.length < 6; i++) {
      const b = buttons[i];
      if (!b || b === e || hidden(b) || b.disabled === true) continue;
      const tag = b.tagName.toLowerCase();
      const type = (b.getAttribute('type') ?? '').toLowerCase();
      const role = b.getAttribute('role') ?? '';
      const n = tag === 'input' ? nameOf(b) || one(b.value ?? b.getAttribute('value')) : nameOf(b);
      // A number field or a spin button next to a slider does the same by typing.
      const typed = kind === 'slider' && ((tag === 'input' && type === 'number') || role === 'spinbutton');
      const tab = kind === 'carousel' && role === 'tab';
      if (typed || tab || (n !== '' && WORDS[kind].test(n))) found.push(n === '' ? 'UNKNOWN' : n);
    }
    return [...new Set(found)];
  };

  const items: GestureItem[] = [];
  const seen: El[] = [];
  let truncated = false;
  const counts: Record<string, number> = {};
  const add = (e: El, kind: GestureKind, keyboard: boolean | null): void => {
    const tag = e.tagName.toLowerCase();
    const n = counts[tag] ?? 0;
    counts[tag] = n + 1;
    if (seen.includes(e) || (excluded && excluded.contains(e)) || hidden(e)) return;
    // Something inside an item already found is part of it.
    if (seen.some((s) => s.contains(e))) return;
    if (items.length >= args.maxItems) {
      truncated = true;
      return;
    }
    seen.push(e);
    items.push({ id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`, kind, name: nameOf(e), alternatives: altsFor(e, kind), keyboard });
  };
  const each = (selector: string, fn: (e: El) => void): void => {
    const list = doc.body.querySelectorAll(selector);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e) fn(e);
    }
  };

  each('[aria-roledescription]', (e) => {
    if (/carousel|carrousel|slider show|diaporama/i.test(e.getAttribute('aria-roledescription') ?? '')) add(e, 'carousel', null);
  });
  each('canvas,[role="application"]', (e) => {
    const r = e.getBoundingClientRect();
    if (r.width >= 100 && r.height >= 100) add(e, 'canvas', focusable(e));
  });
  each('input[type="range"],[role="slider"]', (e) => {
    if (e.disabled !== true) add(e, 'slider', focusable(e));
  });
  each('[draggable="true"],[aria-grabbed]', (e) => add(e, 'draggable', focusable(e)));
  each('body *', (e) => {
    const s = g.getComputedStyle(e);
    const r = e.getBoundingClientRect();
    if (s.touchAction === 'none' && r.width >= 44 && r.height >= 44) add(e, 'touch-none', focusable(e));
    else if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && /x|inline|both/.test(s.scrollSnapType ?? '') && (e.scrollWidth ?? 0) > (e.clientWidth ?? 0) + 1) add(e, 'sideways', focusable(e));
  });
  return { items, truncated };
}
