/**
 * The controls of the page that is running the code, as a person using voice
 * control meets them: what each one shows on screen, and the name it gives
 * to assistive technology, which is what voice control tools match a spoken
 * command against.
 *
 * It reads only. It does not scroll the page or move focus.
 */

export type VoiceRole = 'button' | 'link' | 'field' | 'choice' | 'other';

export interface VoiceControl {
  readonly id: string;
  readonly role: VoiceRole;
  /** The accessible name, close to what the browser computes, on one line. */
  readonly name: string;
  /** The text a person sees on or next to the control: its text, its value, or its label. */
  readonly visible: string;
}

export interface VoiceFacts {
  readonly controls: readonly VoiceControl[];
  readonly truncated: boolean;
}

export interface VoiceArgs {
  readonly maxControls: number;
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const VOICE_ARGS: VoiceArgs = { maxControls: 600, exclude: '' };

/** Runs in the page (serialised by evaluate, so it takes one argument). Reads only. */
export function voiceInPage(args: VoiceArgs): VoiceFacts {
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    parentElement: El | null;
    disabled?: boolean;
    type?: string;
    value?: string;
    labels?: ArrayLike<El> | null;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): { width: number; height: number };
    contains(o: El): boolean;
    querySelectorAll(s: string): ArrayLike<El>;
  }
  interface G {
    document: {
      body: El;
      querySelector(s: string): El | null;
      getElementById(id: string): El | null;
    };
    getComputedStyle(e: El): { display: string; visibility: string };
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);

  /** Text of an element without what is hidden from everyone or from assistive technology. */
  const textOf = (e: El): string => {
    let out = '';
    const walk = (n: El): void => {
      const kids = n as unknown as { childNodes: ArrayLike<{ nodeType: number; nodeValue: string | null }> };
      for (let i = 0; i < kids.childNodes.length; i++) {
        const c = kids.childNodes[i];
        if (!c) continue;
        if (c.nodeType === 3) out += c.nodeValue ?? '';
        else if (c.nodeType === 1) {
          const el = c as unknown as El;
          if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true' || g.getComputedStyle(el).display === 'none') continue;
          const tag = el.tagName.toLowerCase();
          if (tag === 'img') out += ` ${el.getAttribute('alt') ?? ''} `;
          else if (tag !== 'svg' && tag !== 'style' && tag !== 'script') walk(el);
        }
      }
    };
    walk(e);
    return one(out);
  };
  /** Text a person sees: like textOf, but an image shows no words, while aria-hidden text still shows. */
  const seenOf = (e: El): string => {
    let out = '';
    const walk = (n: El): void => {
      const kids = n as unknown as { childNodes: ArrayLike<{ nodeType: number; nodeValue: string | null }> };
      for (let i = 0; i < kids.childNodes.length; i++) {
        const c = kids.childNodes[i];
        if (!c) continue;
        if (c.nodeType === 3) out += c.nodeValue ?? '';
        else if (c.nodeType === 1) {
          const el = c as unknown as El;
          const cs = g.getComputedStyle(el);
          if (el.hasAttribute('hidden') || cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          // Text clipped down to a pixel or so is there for screen readers, not for the eye.
          if (r.width <= 1 && r.height <= 1) continue;
          const tag = el.tagName.toLowerCase();
          if (tag !== 'svg' && tag !== 'style' && tag !== 'script' && tag !== 'img') walk(el);
        }
      }
    };
    walk(e);
    return one(out);
  };

  const roleOf = (e: El): VoiceRole => {
    const role = one(e.getAttribute('role')).split(' ')[0] ?? '';
    if (role === 'button' || role === 'link') return role;
    if (['checkbox', 'radio', 'switch', 'option', 'tab', 'menuitem'].includes(role)) return 'choice';
    if (['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider'].includes(role)) return 'field';
    const tag = e.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'input') {
      const type = (e.getAttribute('type') ?? 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      if (type === 'checkbox' || type === 'radio') return 'choice';
      return 'field';
    }
    if (tag === 'select' || tag === 'textarea') return 'field';
    return 'other';
  };

  const labelText = (e: El): string => {
    const labels = e.labels;
    if (!labels || labels.length === 0) return '';
    const parts: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      if (l) parts.push(textOf(l));
    }
    return one(parts.join(' '));
  };

  const nameOf = (e: El, role: VoiceRole): string => {
    const by = one(e.getAttribute('aria-labelledby'));
    if (by !== '') {
      const parts = by.split(' ').map((id) => {
        const t = doc.getElementById(id);
        return t ? textOf(t) : '';
      });
      const n = one(parts.join(' '));
      if (n !== '') return n;
    }
    const aria = one(e.getAttribute('aria-label'));
    if (aria !== '') return aria;
    const tag = e.tagName.toLowerCase();
    const type = (e.getAttribute('type') ?? '').toLowerCase();
    if (tag === 'input' && ['button', 'submit', 'reset'].includes(type)) return one(e.value ?? e.getAttribute('value')) || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : '');
    if (tag === 'input' && type === 'image') return one(e.getAttribute('alt'));
    if (role === 'field' || role === 'choice') {
      const l = labelText(e);
      if (l !== '') return l;
    }
    if (role !== 'field') {
      const t = textOf(e);
      if (t !== '') return t;
    }
    return one(e.getAttribute('title') ?? e.getAttribute('placeholder'));
  };

  const visibleOf = (e: El, role: VoiceRole): string => {
    const tag = e.tagName.toLowerCase();
    const type = (e.getAttribute('type') ?? '').toLowerCase();
    if (tag === 'input' && ['button', 'submit', 'reset'].includes(type)) return one(e.value ?? e.getAttribute('value')) || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : '');
    if (role === 'field' || role === 'choice') {
      const labels = e.labels;
      const parts: string[] = [];
      if (labels) for (let i = 0; i < labels.length; i++) if (labels[i]) parts.push(seenOf(labels[i] as El));
      const l = one(parts.join(' '));
      return l !== '' ? l : one(e.getAttribute('placeholder'));
    }
    return seenOf(e);
  };

  const all = doc.body.querySelectorAll(
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"],[role="textbox"],[role="combobox"],[role="slider"]',
  );
  const counts: Record<string, number> = {};
  const controls: VoiceControl[] = [];
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
      if (g.getComputedStyle(p).display === 'none' || p.hasAttribute('hidden') || p.hasAttribute('inert') || p.getAttribute('aria-hidden') === 'true') {
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
    const role = roleOf(e);
    controls.push({ id: `${tag}${e.id ? '#' + e.id : ''}[${n}]`, role, name: nameOf(e, role), visible: visibleOf(e, role) });
  }
  return { controls, truncated };
}
