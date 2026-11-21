/**
 * The controls of the page that is running the code, in the order the Tab
 * key reaches them, with their boxes on the page and their names, so
 * `scan-cost.ts` can count the steps a switch user needs to reach each one.
 *
 * Tab order: controls with a positive tabindex first, by that number, then
 * the others in the order of the page. Controls with tabindex -1, disabled,
 * hidden, inert or of no size are left out. It reads only: it does not
 * scroll the page or move focus.
 */

export interface ScanControl {
  readonly id: string;
  /** The name, close to what assistive technology gets, on one line, shortened. */
  readonly name: string;
  /** Whether it looks like the main action: a submit button, or a name such as Send or Continue. */
  readonly main: boolean;
  /** The box on the page (not the window), in CSS pixels. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ScanFacts {
  readonly controls: readonly ScanControl[];
  readonly truncated: boolean;
}

export interface ScanArgs {
  readonly maxControls: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const SCAN_ARGS: ScanArgs = { maxControls: 600, exclude: '' };

/** Runs in the page (serialised by evaluate, so it takes one argument and is self-contained). Reads only. */
export function scanInPage(args: ScanArgs): ScanFacts {
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
  const MAIN = /^(submit|send|continue|next|save|search|sign in|log in|pay|book|confirm|apply|done|envoyer|continuer|suivant|enregistrer|rechercher|se connecter|payer|réserver|confirmer|valider|terminer)\b/i;
  const all = doc.body.querySelectorAll(
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex],[contenteditable="true"],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"],[role="slider"]',
  );
  const counts: Record<string, number> = {};
  const found: Array<{ c: ScanControl; tab: number; at: number }> = [];
  let truncated = false;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e) continue;
    const tag = e.tagName.toLowerCase();
    const n = counts[tag] ?? 0;
    counts[tag] = n + 1;
    if (excluded && excluded.contains(e)) continue;
    if (e.disabled === true) continue;
    const ti = e.getAttribute('tabindex');
    const tab = ti === null || ti.trim() === '' ? 0 : Number(ti);
    if (!Number.isFinite(tab) || tab < 0) continue;
    // An element with a role but no tabindex is not reached by Tab, unless it is a native control.
    const native = ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag) || e.getAttribute('contenteditable') === 'true';
    if (!native && ti === null) continue;
    if (tag === 'a' && !e.hasAttribute('href') && ti === null) continue;
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
    if (found.length >= args.maxControls) {
      truncated = true;
      break;
    }
    const name = nameOf(e);
    const type = (e.getAttribute('type') ?? '').toLowerCase();
    const main = (tag === 'button' && (type === 'submit' || (type === '' && e.parentElement !== null && isInForm(e)))) || (tag === 'input' && type === 'submit') || MAIN.test(name);
    found.push({
      c: { id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`, name, main, left: Math.round(r.left + sx), top: Math.round(r.top + sy), width: Math.round(r.width), height: Math.round(r.height) },
      tab,
      at: found.length,
    });
  }
  function isInForm(e: El): boolean {
    for (let p: El | null = e.parentElement; p; p = p.parentElement) if (p.tagName.toLowerCase() === 'form') return true;
    return false;
  }
  // Positive tabindex first, by number, then the rest in page order.
  found.sort((a, b) => (a.tab > 0 ? a.tab : Infinity) - (b.tab > 0 ? b.tab : Infinity) || a.at - b.at);
  return { controls: found.map((f) => f.c), truncated };
}
