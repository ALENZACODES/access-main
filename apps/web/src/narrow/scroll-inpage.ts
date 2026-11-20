/**
 * How far things sit down the page that is running the code: the height of
 * the window and of the page, each heading with its level and place, the
 * buttons that send a form, the last control, links back to the top, and the
 * part of the window that fixed or sticky bars keep covered.
 *
 * It reads only. It does not scroll the page or move focus.
 */

export interface ScrollHeading {
  readonly level: number;
  readonly text: string;
  /** From the top of the page, in CSS pixels. */
  readonly top: number;
  readonly inMain: boolean;
}

export interface ScrollMark {
  readonly name: string;
  readonly top: number;
}

export interface ScrollFacts {
  readonly viewportWidth: number | null;
  readonly viewportHeight: number | null;
  readonly pageHeight: number;
  readonly headings: readonly ScrollHeading[];
  /** Buttons that send a form. */
  readonly submits: readonly ScrollMark[];
  /** The last control of the page, or null when there is none. */
  readonly lastControl: ScrollMark | null;
  /** Links that lead back to the top of the page. */
  readonly toTop: number;
  /** Height of the window that fixed or sticky bars cover at the top and at the bottom, now. */
  readonly coveredTop: number;
  readonly coveredBottom: number;
}

export interface ScrollArgs {
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const SCROLL_ARGS: ScrollArgs = { exclude: '' };

/** Runs in the page (serialised by evaluate, so it takes one argument). Reads only. */
export function scrollInPage(args: ScrollArgs): ScrollFacts {
  interface R {
    left: number;
    top: number;
    width: number;
    height: number;
    bottom: number;
  }
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    type?: string;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): R;
    contains(o: El): boolean;
    closest(s: string): El | null;
  }
  interface G {
    document: {
      body: El & { querySelectorAll(s: string): ArrayLike<El> };
      documentElement: { clientWidth: number; clientHeight: number; scrollHeight: number };
      querySelector(s: string): El | null;
      getElementById(id: string): El | null;
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
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const out = (e: El): boolean => excluded !== null && excluded.contains(e);
  const shown = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      const cs = g.getComputedStyle(p);
      if (cs.display === 'none' || p.hasAttribute('hidden') || p.hasAttribute('inert')) return false;
    }
    if (g.getComputedStyle(e).visibility === 'hidden') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const text = (e: El): string => {
    const t = ((e.getAttribute('aria-label') ?? '').trim() || (e.textContent ?? '') || (e.getAttribute('value') ?? '')).replace(/\s+/g, ' ').trim();
    return t.length > 60 ? `${t.slice(0, 59)}…` : t;
  };
  const docTop = (e: El): number => Math.round(e.getBoundingClientRect().top + scrollY);

  const headings: ScrollHeading[] = [];
  const hs = doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]');
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    if (!h || out(h) || !shown(h)) continue;
    const tag = h.tagName.toLowerCase();
    const level = /^h[1-6]$/.test(tag) ? Number(tag.slice(1)) : Number(h.getAttribute('aria-level') ?? '2') || 2;
    headings.push({ level, text: text(h), top: docTop(h), inMain: h.closest('main,[role="main"]') !== null });
  }

  const submits: ScrollMark[] = [];
  const bs = doc.body.querySelectorAll('button,input[type="submit"],input[type="image"]');
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (!b || out(b) || b.disabled === true || !shown(b)) continue;
    const type = (b.getAttribute('type') ?? (b.tagName.toLowerCase() === 'button' ? 'submit' : '')).toLowerCase();
    if (type !== 'submit' && type !== 'image') continue;
    if (b.tagName.toLowerCase() === 'button' && b.closest('form') === null && !b.hasAttribute('form')) continue;
    submits.push({ name: text(b), top: docTop(b) });
  }

  let lastControl: ScrollMark | null = null;
  const cs = doc.body.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"])');
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (!c || out(c) || c.disabled === true || !shown(c)) continue;
    const top = docTop(c);
    if (top < 0) continue;
    if (!lastControl || top >= lastControl.top) lastControl = { name: text(c), top };
  }

  let toTop = 0;
  const links = doc.body.querySelectorAll('a[href^="#"]');
  for (let i = 0; i < links.length; i++) {
    const a = links[i];
    if (!a || out(a)) continue;
    const href = a.getAttribute('href') ?? '';
    if (href === '#' || href === '#top') {
      toTop++;
      continue;
    }
    const target = doc.getElementById(decodeURIComponent(href.slice(1)));
    if (target && docTop(target) < vh / 2 && docTop(a) > vh) toTop++;
  }

  let coveredTop = 0;
  let coveredBottom = 0;
  const all = doc.body.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e || out(e)) continue;
    const p = g.getComputedStyle(e).position;
    if (p !== 'fixed' && p !== 'sticky') continue;
    if (!shown(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < vw / 2) continue;
    if (r.top <= 1 && r.bottom > 0) coveredTop = Math.max(coveredTop, Math.min(r.bottom, vh));
    else if (r.bottom >= vh - 1 && r.top < vh) coveredBottom = Math.max(coveredBottom, vh - Math.max(r.top, 0));
  }

  return {
    viewportWidth: vw > 0 ? vw : null,
    viewportHeight: vh > 0 ? vh : null,
    pageHeight: Math.max(doc.documentElement.scrollHeight, vh),
    headings,
    submits,
    lastControl,
    toTop,
    coveredTop: Math.round(coveredTop),
    coveredBottom: Math.round(coveredBottom),
  };
}
