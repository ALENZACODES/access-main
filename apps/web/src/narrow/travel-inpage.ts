/**
 * The controls of the page that is running the code, in document order, with
 * their boxes on the page and the form each belongs to, so `travel.ts` can
 * count how far a pointer moves to go from one to the next.
 *
 * It reads only. It does not scroll the page or move focus.
 */

export type TravelKind = 'field' | 'choice' | 'button' | 'link';

export interface TravelControl {
  readonly id: string;
  readonly name: string;
  readonly kind: TravelKind;
  /** The form it belongs to, by order on the page from 0, or -1 when it is in none. */
  readonly form: number;
  /** True for a button that sends its form. */
  readonly submit: boolean;
  /** The box on the page (not the window), in CSS pixels. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TravelFacts {
  readonly controls: readonly TravelControl[];
  readonly viewportWidth: number | null;
  /** The name of each form, by its order, or '' when it has none. */
  readonly forms: readonly string[];
  readonly truncated: boolean;
}

export interface TravelArgs {
  readonly maxControls: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const TRAVEL_ARGS: TravelArgs = { maxControls: 600, exclude: '' };

/** Runs in the page (serialised by evaluate, so it takes one argument). Reads only. */
export function travelInPage(args: TravelArgs): TravelFacts {
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    value?: string;
    form?: El | null;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): { left: number; top: number; width: number; height: number };
    contains(o: El): boolean;
    closest(s: string): El | null;
    querySelector(s: string): El | null;
  }
  interface G {
    document: {
      body: { querySelectorAll(s: string): ArrayLike<El> };
      documentElement: { clientWidth: number };
      querySelector(s: string): El | null;
      querySelectorAll(s: string): ArrayLike<El>;
      getElementById(id: string): El | null;
    };
    getComputedStyle(e: El): { display: string; visibility: string };
    innerWidth?: number;
    scrollX?: number;
    scrollY?: number;
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const sx = g.scrollX ?? 0;
  const sy = g.scrollY ?? 0;
  const vw = doc.documentElement.clientWidth || g.innerWidth || 0;
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const clip = (s: string): string => (s.length > 60 ? `${s.slice(0, 59)}…` : s);
  const nameOf = (e: El): string => {
    let n = one(e.getAttribute('aria-label'));
    if (n === '') {
      const by = one(e.getAttribute('aria-labelledby'));
      if (by !== '') n = one(by.split(' ').map((id) => doc.getElementById(id)?.textContent ?? '').join(' '));
    }
    if (n === '' && e.labels && e.labels.length > 0) n = one(e.labels[0]?.textContent);
    if (n === '' && e.tagName.toLowerCase() === 'input') n = one(e.value ?? e.getAttribute('value'));
    if (n === '') n = one(e.textContent);
    if (n === '') n = one(e.getAttribute('title') ?? e.getAttribute('placeholder'));
    return clip(n);
  };
  const kindOf = (e: El): TravelKind => {
    const tag = e.tagName.toLowerCase();
    const type = (e.getAttribute('type') ?? '').toLowerCase();
    const role = one(e.getAttribute('role'));
    if (tag === 'a' || role === 'link') return 'link';
    if (tag === 'button' || tag === 'summary' || role === 'button' || ['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
    if (type === 'checkbox' || type === 'radio' || ['checkbox', 'radio', 'switch'].includes(role)) return 'choice';
    return 'field';
  };

  const formEls = doc.querySelectorAll('form');
  const formList: El[] = [];
  const forms: string[] = [];
  for (let i = 0; i < formEls.length; i++) {
    const f = formEls[i];
    if (!f || (excluded && excluded.contains(f))) continue;
    formList.push(f);
    let name = one(f.getAttribute('aria-label'));
    if (name === '') {
      const by = one(f.getAttribute('aria-labelledby'));
      if (by !== '') name = one(by.split(' ').map((id) => doc.getElementById(id)?.textContent ?? '').join(' '));
    }
    if (name === '') name = one(f.querySelector('legend')?.textContent);
    forms.push(clip(name));
  }

  const all = doc.body.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"]');
  const counts: Record<string, number> = {};
  const controls: TravelControl[] = [];
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
    const owner = e.form ?? e.closest('form');
    const kind = kindOf(e);
    const type = (e.getAttribute('type') ?? (tag === 'button' ? 'submit' : '')).toLowerCase();
    controls.push({
      id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`,
      name: nameOf(e),
      kind,
      form: owner ? formList.indexOf(owner) : -1,
      submit: owner !== null && owner !== undefined && (tag === 'button' || tag === 'input') && (type === 'submit' || type === 'image'),
      left: Math.round(r.left + sx),
      top: Math.round(r.top + sy),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
  }
  return { controls, viewportWidth: vw > 0 ? vw : null, forms, truncated };
}
