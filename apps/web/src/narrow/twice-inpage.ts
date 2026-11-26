/**
 * The form fields of the page that is running the code, with what can tell
 * whether two of them ask for the same thing: the label, the input type, the
 * autocomplete token, the form and the group (fieldset legend) they are in.
 * Also the check boxes that may copy one answer to another, such as "Same as
 * shipping address".
 *
 * It reads only. It does not type, focus or submit anything.
 */

export interface TwiceField {
  readonly id: string;
  /** The label, close to what assistive technology gets, on one line, shortened. */
  readonly label: string;
  /** The input type in lower case: text, email, tel, password, textarea, select and so on. */
  readonly type: string;
  /** The autocomplete attribute in lower case with runs of spaces made one, or '' when there is none or it is off. */
  readonly token: string;
  /** Which form it is in, from 0, or -1 when it is in none. */
  readonly form: number;
  /** The legend of the fieldset it is in, or ''. */
  readonly group: string;
}

export interface TwiceFacts {
  readonly fields: readonly TwiceField[];
  /** Names of check boxes that may copy one answer to another. */
  readonly sameAs: readonly string[];
  readonly truncated: boolean;
}

export interface TwiceArgs {
  readonly maxFields: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const TWICE_ARGS: TwiceArgs = { maxFields: 400, exclude: '' };

/** Runs in the page (serialised by evaluate, so it takes one argument and is self-contained). Reads only. */
export function twiceInPage(args: TwiceArgs): TwiceFacts {
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    form?: El | null;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    contains(o: El): boolean;
    querySelector(s: string): El | null;
    getBoundingClientRect(): { width: number; height: number };
  }
  interface G {
    document: { body: { querySelectorAll(s: string): ArrayLike<El> }; querySelector(s: string): El | null; querySelectorAll(s: string): ArrayLike<El>; getElementById(id: string): El | null };
    getComputedStyle(e: El): { display: string; visibility: string };
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const short = (s: string): string => (s.length > 70 ? `${s.slice(0, 69)}…` : s);
  const labelOf = (e: El): string => {
    let n = one(e.getAttribute('aria-label'));
    if (n === '') {
      const by = one(e.getAttribute('aria-labelledby'));
      if (by !== '') n = one(by.split(' ').map((id) => doc.getElementById(id)?.textContent ?? '').join(' '));
    }
    if (n === '' && e.labels && e.labels.length > 0) n = one(Array.from(e.labels).map((l) => l.textContent ?? '').join(' '));
    if (n === '') n = one(e.getAttribute('placeholder') ?? e.getAttribute('title') ?? e.getAttribute('name'));
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
  const forms = Array.from(doc.querySelectorAll('form'));
  const SKIP = ['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'file', 'range', 'color'];

  const fields: TwiceField[] = [];
  const counts: Record<string, number> = {};
  let truncated = false;
  const all = doc.body.querySelectorAll('input,textarea,select');
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e) continue;
    const tag = e.tagName.toLowerCase();
    const n = counts[tag] ?? 0;
    counts[tag] = n + 1;
    const type = tag === 'input' ? (e.getAttribute('type') ?? 'text').toLowerCase() || 'text' : tag;
    if (SKIP.includes(type) || e.disabled === true || (excluded && excluded.contains(e)) || hidden(e)) continue;
    if (fields.length >= args.maxFields) {
      truncated = true;
      break;
    }
    const raw = one(e.getAttribute('autocomplete')).toLowerCase();
    let group = '';
    for (let p: El | null = e.parentElement; p; p = p.parentElement) {
      if (p.tagName.toLowerCase() === 'fieldset') {
        group = short(one(p.querySelector('legend')?.textContent));
        break;
      }
    }
    const form = e.form ? forms.indexOf(e.form) : -1;
    fields.push({ id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`, label: labelOf(e), type, token: raw === 'off' || raw === 'on' ? '' : raw, form, group });
  }

  const SAME = /same as|same address|use (the |my )?(same|previous|shipping|billing)|copy from|même|identique|utiliser (la |l’|l'|mon |ma )?(même|adresse)/i;
  const sameAs: string[] = [];
  const boxes = doc.body.querySelectorAll('input[type="checkbox"],[role="checkbox"],[role="switch"],button');
  for (let i = 0; i < boxes.length && sameAs.length < 10; i++) {
    const b = boxes[i];
    if (!b || (excluded && excluded.contains(b)) || hidden(b)) continue;
    const name = b.tagName.toLowerCase() === 'button' ? one(b.textContent) || labelOf(b) : labelOf(b);
    if (SAME.test(name)) sameAs.push(short(name));
  }
  return { fields, sameAs, truncated };
}
