/**
 * Where the controls of the page that is running the code sit on the screen:
 * the box of each control at the current scroll, whether it stays in place
 * when the page scrolls (it is inside something fixed or sticky), and how far
 * the page can scroll. With that, `zones.ts` works out whether each control
 * can be brought into a part of the screen the person can reach.
 *
 * It reads only. It does not scroll the page or move focus.
 */

export interface ZoneControl {
  readonly id: string;
  /** The name of the control, close to what assistive technology gives, shortened. Empty when there is none. */
  readonly name: string;
  /** The box at the current scroll, in CSS pixels from the top left of the window. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** True when the control is inside something fixed or sticky, so scrolling does not move it. Sticky is taken as fixed. */
  readonly pinned: boolean;
}

export interface ZoneFacts {
  readonly controls: readonly ZoneControl[];
  /** The size of the window, or null when the browser does not give it. */
  readonly viewportWidth: number | null;
  readonly viewportHeight: number | null;
  /** How far the page is scrolled now, and how far it can scroll, down. */
  readonly scrollY: number;
  readonly maxScrollY: number;
  /**
   * Controls placed above or to the left of the page, where no scroll can
   * bring them, such as a skip link that shows only when it takes focus.
   * They are left out of the controls and counted here.
   */
  readonly offPage: number;
  readonly truncated: boolean;
}

export interface ZoneArgs {
  readonly maxControls: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
  /** The elements that count as controls. */
  readonly selector: string;
}

/** The controls a person presses: links, buttons, fields and anything given a role or a tabindex to act like one. */
export const ZONE_SELECTOR =
  'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"]),[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"]';

export const ZONE_ARGS: ZoneArgs = { maxControls: 600, exclude: '', selector: ZONE_SELECTOR };

/** Runs in the page (serialised by evaluate, so it takes one argument). Reads only. */
export function zonesInPage(args: ZoneArgs): ZoneFacts {
  interface R {
    left: number;
    top: number;
    width: number;
    height: number;
  }
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    inert?: boolean;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): R;
    contains(o: El): boolean;
  }
  interface G {
    document: {
      body: { querySelectorAll(s: string): ArrayLike<El> };
      documentElement: { clientWidth: number; clientHeight: number; scrollHeight: number };
      getElementById(id: string): El | null;
      querySelector(s: string): El | null;
    };
    getComputedStyle(e: El): { display: string; visibility: string; position: string };
    innerWidth?: number;
    innerHeight?: number;
    scrollY?: number;
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const vw = doc.documentElement.clientWidth || g.innerWidth || 0;
  const vh = doc.documentElement.clientHeight || g.innerHeight || 0;
  const scrollY = Math.max(0, g.scrollY ?? 0);
  const maxScrollY = Math.max(0, doc.documentElement.scrollHeight - vh);
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const all = doc.body.querySelectorAll(args.selector);
  const counts: Record<string, number> = {};

  const nameOf = (e: El): string => {
    let name = (e.getAttribute('aria-label') ?? '').trim();
    if (name === '') {
      const by = (e.getAttribute('aria-labelledby') ?? '').trim();
      if (by !== '') name = by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ');
    }
    if (name.trim() === '' && e.labels && e.labels.length > 0) name = e.labels[0]?.textContent ?? '';
    if (name.trim() === '') name = e.textContent ?? '';
    if (name.trim() === '') name = e.getAttribute('title') ?? e.getAttribute('placeholder') ?? e.getAttribute('alt') ?? e.getAttribute('value') ?? '';
    const one = name.replace(/\s+/g, ' ').trim();
    return one.length > 60 ? `${one.slice(0, 59)}…` : one;
  };

  const controls: ZoneControl[] = [];
  let truncated = false;
  let offPage = 0;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e) continue;
    const tag = e.tagName.toLowerCase();
    const n = counts[tag] ?? 0;
    counts[tag] = n + 1;
    if (excluded && excluded.contains(e)) continue;
    if (e.disabled === true) continue;
    let hidden = false;
    let pinned = false;
    for (let p: El | null = e; p; p = p.parentElement) {
      const cs = g.getComputedStyle(p);
      if (cs.display === 'none' || p.inert === true || p.hasAttribute('inert')) {
        hidden = true;
        break;
      }
      if (cs.position === 'fixed' || cs.position === 'sticky') pinned = true;
    }
    if (hidden || g.getComputedStyle(e).visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.left + r.width <= 0 || (!pinned && r.top + scrollY + r.height <= 0) || (pinned && r.top + r.height <= 0)) {
      offPage++;
      continue;
    }
    if (controls.length >= args.maxControls) {
      truncated = true;
      break;
    }
    controls.push({ id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`, name: nameOf(e), left: r.left, top: r.top, width: r.width, height: r.height, pinned });
  }
  return { controls, viewportWidth: vw > 0 ? vw : null, viewportHeight: vh > 0 ? vh : null, scrollY, maxScrollY, offPage, truncated };
}
