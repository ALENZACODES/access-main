/**
 * One look at the page that is running the code: where its controls are,
 * what animations are running and whether they ever stop, whether a control
 * that may pause them is there, and whether the device asks for less motion.
 * Two looks some seconds apart show what moved under the pointer.
 *
 * It reads only. It does not scroll, move focus or pause anything.
 */

export interface MovingControl {
  readonly id: string;
  readonly name: string;
  /** The box on the page (not the window), in CSS pixels. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface MovingAnimation {
  /** The element that moves, as tag, id and place. */
  readonly target: string;
  readonly name: string;
  /** True when it never stops by itself. */
  readonly endless: boolean;
  /** True when the element is a control or holds one. */
  readonly control: boolean;
}

export interface MovingLook {
  readonly at: number;
  readonly controls: readonly MovingControl[];
  /** Running animations, or null when the browser cannot list them. */
  readonly animations: readonly MovingAnimation[] | null;
  /** Buttons whose name suggests they pause or stop motion. */
  readonly pauseControls: readonly string[];
  /** Whether the device asks for less motion: true, false, or null when it cannot be told. */
  readonly reduceMotion: boolean | null;
  readonly truncated: boolean;
}

export interface MovingArgs {
  readonly maxControls: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const MOVING_ARGS: MovingArgs = { maxControls: 600, exclude: '' };

/** Runs in the page (serialised by evaluate, so it takes one argument and is self-contained). Reads only. */
export function movingLookInPage(args: MovingArgs): MovingLook {
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    value?: string;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): { left: number; top: number; width: number; height: number };
    contains(o: El): boolean;
    matches?(s: string): boolean;
    querySelector?(s: string): El | null;
  }
  interface Anim {
    playState: string;
    animationName?: string;
    transitionProperty?: string;
    id?: string;
    effect: { target?: El | null; getTiming?(): { iterations?: number } } | null;
  }
  interface G {
    document: {
      body: { querySelectorAll(s: string): ArrayLike<El> };
      querySelector(s: string): El | null;
      getElementById(id: string): El | null;
      getAnimations?(): Anim[];
    };
    getComputedStyle(e: El): { display: string; visibility: string };
    matchMedia?(q: string): { matches: boolean; media: string };
    performance?: { now(): number };
    scrollX?: number;
    scrollY?: number;
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const sx = g.scrollX ?? 0;
  const sy = g.scrollY ?? 0;
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
    if (n === '' && e.tagName.toLowerCase() === 'input') n = one(e.value ?? e.getAttribute('value'));
    if (n === '') n = one(e.textContent);
    if (n === '') n = one(e.getAttribute('title') ?? e.getAttribute('alt'));
    return short(n);
  };
  const hidden = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      if (g.getComputedStyle(p).display === 'none' || p.hasAttribute('hidden') || p.hasAttribute('inert')) return true;
    }
    return g.getComputedStyle(e).visibility === 'hidden';
  };
  const CONTROL = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"],[role="slider"]';

  const all = doc.body.querySelectorAll(CONTROL);
  const counts: Record<string, number> = {};
  const controls: MovingControl[] = [];
  let truncated = false;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e) continue;
    const tag = e.tagName.toLowerCase();
    if ((excluded && excluded.contains(e)) || e.disabled === true || hidden(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (controls.length >= args.maxControls) {
      truncated = true;
      break;
    }
    // The id counts the place among controls of the same kind and name, so a control inserted
    // before it with another name does not change it: the same control has the same id in both looks.
    const name = nameOf(e);
    const key = `${tag}\u0000${e.id}\u0000${name}`;
    const n = counts[key] ?? 0;
    counts[key] = n + 1;
    controls.push({ id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`, name, left: Math.round(r.left + sx), top: Math.round(r.top + sy), width: Math.round(r.width), height: Math.round(r.height) });
  }

  let animations: MovingAnimation[] | null = null;
  if (typeof doc.getAnimations === 'function') {
    animations = [];
    for (const a of doc.getAnimations()) {
      const t = a.effect?.target;
      if (!t || a.playState !== 'running' || (excluded && excluded.contains(t)) || hidden(t)) continue;
      const iterations = a.effect?.getTiming?.().iterations ?? 1;
      const isControl = t.matches?.(CONTROL) === true || t.querySelector?.(CONTROL) != null;
      const label = one(a.animationName ?? a.transitionProperty ?? a.id ?? '');
      animations.push({
        target: `${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}`,
        name: short(label === '' ? nameOf(t) : label),
        endless: iterations === Infinity,
        control: isControl,
      });
    }
  }

  // Whole words, so that "Count the stops" or "Display" is not taken for a pause button.
  const PAUSE = /(^|[^\p{L}])(pause|stop|play|freeze|motion|animations?|arrêter|arreter|suspendre|figer|lecture|mouvement)([^\p{L}]|$)/iu;
  const pauseControls: string[] = [];
  const buttons = doc.body.querySelectorAll('button,[role="button"],[role="switch"],input[type="checkbox"]');
  for (let i = 0; i < buttons.length && pauseControls.length < 10; i++) {
    const b = buttons[i];
    if (!b || (excluded && excluded.contains(b)) || hidden(b)) continue;
    const n = nameOf(b);
    if (n !== '' && PAUSE.test(n)) pauseControls.push(n);
  }

  let reduceMotion: boolean | null = null;
  if (typeof g.matchMedia === 'function') {
    const reduce = g.matchMedia('(prefers-reduced-motion: reduce)');
    const none = g.matchMedia('(prefers-reduced-motion: no-preference)');
    reduceMotion = reduce.matches ? true : none.matches ? false : null;
  }

  return { at: Math.round(g.performance?.now() ?? 0), controls, animations, pauseControls, reduceMotion, truncated };
}
