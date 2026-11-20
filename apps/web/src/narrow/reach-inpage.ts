/**
 * The stops a person meets when they move through the page that is running
 * the code with the Tab key, or with a switch that steps through the same
 * order: each stop with its name, the landmark it sits in, and, for a link
 * to a place on the same page, the stop that comes first after that place.
 *
 * It reads only. It does not move focus: the order is worked out the way
 * browsers do it (positive tabindex first, in increasing order, then the
 * rest in document order), and a group of radio buttons is one stop, since
 * the arrow keys move inside it.
 */

export type ReachLandmark = 'banner' | 'navigation' | 'main' | 'complementary' | 'contentinfo' | 'search' | 'form' | 'region' | 'none';

export interface ReachStop {
  readonly id: string;
  readonly tag: string;
  /** The name of the control, close to what assistive technology gives, shortened. Empty when there is none. */
  readonly name: string;
  /** The innermost landmark around the stop. */
  readonly landmark: ReachLandmark;
  /** Index, among the stops, of the first stop at or after the place a same-page link points to. Null for other stops, or when the place is not found. */
  readonly jumpTo: number | null;
  /** True when the place a same-page link points to exists and is the main landmark or inside it. */
  readonly jumpsToMain: boolean;
  /** True when the place a same-page link points to can take focus itself, so following the link puts focus on that stop at once. */
  readonly jumpLands: boolean;
}

export interface ReachFacts {
  readonly stops: readonly ReachStop[];
  /** Stops that have no box, so a person cannot see where focus is. They are among the stops too, since each takes a press. */
  readonly invisible: number;
  /** Stops with a positive tabindex, which come before everything else. */
  readonly positive: number;
  readonly truncated: boolean;
}

export interface ReachArgs {
  readonly maxElements: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const REACH_ARGS: ReachArgs = { maxElements: 3000, exclude: '' };

/** Runs in the page (serialised by evaluate). Reads only. */
export function reachInPage(args: ReachArgs): ReachFacts {
  interface R {
    width: number;
    height: number;
  }
  interface Cs {
    display: string;
    visibility: string;
  }
  interface El {
    id: string;
    tagName: string;
    tabIndex: number;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    type?: string;
    name?: string;
    checked?: boolean;
    inert?: boolean;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): R;
    closest(s: string): El | null;
    contains(o: El): boolean;
    compareDocumentPosition(o: El): number;
  }
  interface G {
    document: { body: { querySelectorAll(s: string): ArrayLike<El> }; getElementById(id: string): El | null; querySelector(s: string): El | null };
    getComputedStyle(e: El): Cs;
  }
  const g = globalThis as unknown as G;
  const all = g.document.body.querySelectorAll('*');
  const excluded = args.exclude === '' ? null : g.document.querySelector(args.exclude);
  const counts: Record<string, number> = {};
  const ids = new Map<El, string>();
  const limit = Math.min(all.length, args.maxElements);
  for (let i = 0; i < limit; i++) {
    const e = all[i];
    if (!e) continue;
    const k = e.tagName.toLowerCase();
    const n = counts[k] ?? 0;
    counts[k] = n + 1;
    ids.set(e, `${k}${e.id ? '#' + e.id : ''}[${n}]`);
  }

  const hidden = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      const cs = g.getComputedStyle(p);
      if (cs.display === 'none') return true;
      if (p.inert === true || p.hasAttribute('inert')) return true;
    }
    return g.getComputedStyle(e).visibility === 'hidden';
  };
  const tabbable = (e: El): boolean => {
    if (e.tabIndex < 0) return false;
    if (e.disabled === true) return false;
    const tag = e.tagName.toLowerCase();
    if (tag === 'input' && (e.type ?? '').toLowerCase() === 'hidden') return false;
    // Some browsers give a link with no href a tabIndex of 0, but it cannot take focus.
    if ((tag === 'a' || tag === 'area') && !e.hasAttribute('href') && !e.hasAttribute('tabindex')) return false;
    // A closed details element shows its summary only.
    const details = e.closest('details');
    if (details && !details.hasAttribute('open') && tag !== 'summary') {
      const summary = e.closest('summary');
      if (!summary) return false;
    }
    return true;
  };

  const LANDMARK_TAGS: Record<string, ReachLandmark> = { main: 'main', nav: 'navigation', aside: 'complementary', search: 'search' };
  const ROLES: readonly ReachLandmark[] = ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'form', 'region'];
  const landmarkOf = (e: El): ReachLandmark => {
    for (let p: El | null = e; p; p = p.parentElement) {
      const role = (p.getAttribute('role') ?? '').toLowerCase();
      if ((ROLES as readonly string[]).includes(role)) return role as ReachLandmark;
      const tag = p.tagName.toLowerCase();
      const t = LANDMARK_TAGS[tag];
      if (t) return t;
      // A header or footer is a landmark only when it is not inside an article, aside, main, nav or section.
      if ((tag === 'header' || tag === 'footer') && p.parentElement && p.parentElement.closest('article,aside,main,nav,section') === null) return tag === 'header' ? 'banner' : 'contentinfo';
      const named = (p.getAttribute('aria-label') ?? p.getAttribute('aria-labelledby') ?? '').trim() !== '';
      if ((tag === 'section' && named) || (tag === 'form' && named)) return tag === 'section' ? 'region' : 'form';
    }
    return 'none';
  };
  const nameOf = (e: El): string => {
    const aria = (e.getAttribute('aria-label') ?? '').trim();
    let name = aria;
    if (name === '') {
      const by = (e.getAttribute('aria-labelledby') ?? '').trim();
      if (by !== '') name = by.split(/\s+/).map((id) => g.document.getElementById(id)?.textContent ?? '').join(' ');
    }
    if (name === '' && e.labels && e.labels.length > 0) name = e.labels[0]?.textContent ?? '';
    if (name === '') name = e.textContent ?? '';
    if (name.trim() === '') name = e.getAttribute('title') ?? e.getAttribute('placeholder') ?? e.getAttribute('alt') ?? '';
    const one = name.replace(/\s+/g, ' ').trim();
    return one.length > 60 ? `${one.slice(0, 59)}…` : one;
  };

  interface Cand {
    readonly el: El;
    readonly order: number;
    readonly dom: number;
  }
  const cands: Cand[] = [];
  let invisible = 0;
  let positive = 0;
  const radiosSeen = new Map<string, number>();
  for (let i = 0; i < limit; i++) {
    const e = all[i];
    if (!e) continue;
    if (excluded && excluded.contains(e)) continue;
    if (!tabbable(e) || hidden(e)) continue;
    // A control with no box still takes a press: it stays a stop, and is counted apart.
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) invisible++;
    const tag = e.tagName.toLowerCase();
    if (tag === 'input' && (e.type ?? '').toLowerCase() === 'radio' && (e.name ?? '') !== '') {
      // One stop per group: the checked radio, or the first one when none is checked.
      const key = e.name ?? '';
      const at = radiosSeen.get(key);
      if (at !== undefined) {
        const was = cands[at];
        if (was && e.checked === true && was.el.checked !== true) cands[at] = { el: e, order: e.tabIndex, dom: was.dom };
        continue;
      }
      radiosSeen.set(key, cands.length);
    }
    if (e.tabIndex > 0) positive++;
    cands.push({ el: e, order: e.tabIndex, dom: i });
  }
  cands.sort((a, b) => {
    const pa = a.order > 0 ? 0 : 1;
    const pb = b.order > 0 ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (pa === 0 && a.order !== b.order) return a.order - b.order;
    return a.dom - b.dom;
  });

  const stops: ReachStop[] = cands.map((c) => ({ id: ids.get(c.el) ?? c.el.tagName.toLowerCase(), tag: c.el.tagName.toLowerCase(), name: nameOf(c.el), landmark: landmarkOf(c.el), jumpTo: null, jumpsToMain: false, jumpLands: false }));
  // Same-page links: the first stop at or after the place they point to, in document order. 4 is DOCUMENT_POSITION_FOLLOWING, 16 is CONTAINED_BY.
  const withJumps = stops.map((s, i) => {
    const c = cands[i];
    if (!c || c.el.tagName.toLowerCase() !== 'a') return s;
    const href = c.el.getAttribute('href') ?? '';
    if (!/^#[^#\s]+$/.test(href)) return s;
    const target = g.document.getElementById(decodeURIComponent(href.slice(1)));
    if (!target) return s;
    let jump: number | null = null;
    let lands = false;
    for (let j = 0; j < cands.length; j++) {
      const other = cands[j];
      if (!other) continue;
      const rel = target.compareDocumentPosition(other.el);
      if (other.el === target || (rel & 16) !== 0 || (rel & 4) !== 0) {
        if (other.order <= 0) {
          jump = j;
          lands = other.el === target;
          break;
        }
      }
    }
    const main = target.closest('main,[role="main"]') !== null || target.tagName.toLowerCase() === 'main';
    return { ...s, jumpTo: jump, jumpsToMain: main, jumpLands: lands };
  });
  return { stops: withJumps, invisible, positive, truncated: all.length > limit };
}
