/**
 * The controls of the page that is running the code, with their boxes on the
 * page and their names, so `slip.ts` can find where a tap aimed at one could
 * land on another.
 *
 * It reads only. It does not scroll the page or move focus.
 */

export interface SlipControl {
  readonly id: string;
  /** The name, close to what assistive technology gets, on one line, shortened. */
  readonly name: string;
  /** The box on the page (not the window), in CSS pixels. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SlipFacts {
  readonly controls: readonly SlipControl[];
  readonly truncated: boolean;
}

export interface SlipArgs {
  readonly maxControls: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const SLIP_ARGS: SlipArgs = { maxControls: 600, exclude: '' };

/** Runs in the page (serialised by evaluate, so it takes one argument). Reads only. */
export function slipInPage(args: SlipArgs): SlipFacts {
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
  }
  interface G {
    document: {
      body: { querySelectorAll(s: string): ArrayLike<El> };
      querySelector(s: string): El | null;
      getElementById(id: string): El | null;
    };
    getComputedStyle(e: El): { display: string; visibility: string };
    scrollX?: number;
    scrollY?: number;
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const sx = g.scrollX ?? 0;
  const sy = g.scrollY ?? 0;
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const nameOf = (e: El): string => {
    let n = one(e.getAttribute('aria-label'));
    if (n === '') {
      const by = one(e.getAttribute('aria-labelledby'));
      if (by !== '') n = one(by.split(' ').map((id) => doc.getElementById(id)?.textContent ?? '').join(' '));
    }
    if (n === '' && e.labels && e.labels.length > 0) n = one(e.labels[0]?.textContent);
    if (n === '' && e.tagName.toLowerCase() === 'input') n = one(e.value ?? e.getAttribute('value'));
    if (n === '') n = one(e.textContent);
    if (n === '') n = one(e.getAttribute('title') ?? e.getAttribute('alt') ?? e.getAttribute('placeholder'));
    return n.length > 60 ? `${n.slice(0, 59)}…` : n;
  };
  const all = doc.body.querySelectorAll(
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"]',
  );
  const counts: Record<string, number> = {};
  const controls: SlipControl[] = [];
  let truncated = false;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e) continue;
    const tag = e.tagName.toLowerCase();
    const n = counts[tag] ?? 0;
    counts[tag] = n + 1;
    if (excluded && excluded.contains(e)) continue;
    if (e.disabled === true) continue;
    let hidden = false;
    for (let p: El | null = e; p; p = p.parentElement) {
      if (g.getComputedStyle(p).display === 'none' || p.hasAttribute('hidden') || p.hasAttribute('inert')) {
        hidden = true;
        break;
      }
    }
    if (hidden || g.getComputedStyle(e).visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (controls.length >= args.maxControls) {
      truncated = true;
      break;
    }
    controls.push({ id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`, name: nameOf(e), left: Math.round(r.left + sx), top: Math.round(r.top + sy), width: Math.round(r.width), height: Math.round(r.height) });
  }
  return { controls, truncated };
}
