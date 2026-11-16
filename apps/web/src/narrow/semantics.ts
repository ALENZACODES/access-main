/**
 * Facts about the rendered page that the form, sign-in, status, media, fixed
 * bar and clipping checks read. One pass over the document, run in the
 * browser, so it must not use anything outside its own body. The checks
 * themselves are pure and live in their own files.
 */

export interface FieldFact {
  readonly id: string;
  readonly kind: 'input' | 'select' | 'textarea';
  readonly type: string;
  readonly name: string;
  /** Visible label text, or an empty string when the field has none. */
  readonly label: string;
  readonly placeholder: string;
  readonly required: boolean;
  readonly autocomplete: string;
  readonly inputmode: string;
  /** True when the field points to its hint with aria-describedby. */
  readonly described: boolean;
  /** A hint-like element sits next to the field and is not linked to it. */
  readonly hintUnlinked: boolean;
  readonly invalid: boolean;
  /** The error element the field points to, when there is one. */
  readonly error: { readonly text: string; readonly announced: boolean } | null;
}

export interface PasswordFact {
  readonly id: string;
  readonly autocomplete: string;
  readonly pasteBlocked: boolean;
  readonly hasUsername: boolean;
}

export interface OneTimeFact {
  readonly id: string;
  readonly autocomplete: string;
}

export interface LiveFact {
  readonly id: string;
  readonly role: string;
  readonly live: string;
  readonly hidden: boolean;
}

export interface ProgressFact {
  readonly id: string;
  readonly named: boolean;
}

export interface MediaFact {
  readonly id: string;
  readonly tag: 'audio' | 'video' | 'embed';
  readonly autoplay: boolean;
  /** true or false when the browser said, null when it did not. */
  readonly playing: boolean | null;
  readonly muted: boolean;
  readonly loop: boolean;
  readonly controls: boolean;
  /** Seconds, or null when unknown or not finite. */
  readonly duration: number | null;
  readonly hasCaptions: boolean;
  readonly host: string;
}

export interface FixedFact {
  readonly id: string;
  readonly position: 'fixed' | 'sticky';
  readonly edge: 'top' | 'bottom' | 'other';
  readonly height: number;
  readonly width: number;
}

export interface ClipFact {
  readonly id: string;
  readonly axis: 'x' | 'y';
  readonly ellipsis: boolean;
  readonly text: string;
}

export interface SemanticFacts {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly fields: readonly FieldFact[];
  /** True when the page says what the required mark means. */
  readonly requiredNote: boolean;
  readonly passwords: readonly PasswordFact[];
  readonly oneTime: readonly OneTimeFact[];
  readonly captchas: readonly string[];
  readonly live: readonly LiveFact[];
  readonly toasts: readonly string[];
  readonly progress: readonly ProgressFact[];
  readonly media: readonly MediaFact[];
  readonly fixed: readonly FixedFact[];
  readonly clips: readonly ClipFact[];
  readonly truncated: boolean;
}

export const EMPTY_FACTS: SemanticFacts = {
  viewport: { width: 0, height: 0 },
  fields: [],
  requiredNote: false,
  passwords: [],
  oneTime: [],
  captchas: [],
  live: [],
  toasts: [],
  progress: [],
  media: [],
  fixed: [],
  clips: [],
  truncated: false,
};

/** Runs in the page. Reads, never writes. */
export function semanticsInPage(args: { readonly maxElements: number }): SemanticFacts {
  interface Cs {
    display: string;
    visibility: string;
    position: string;
    overflowX: string;
    overflowY: string;
    textOverflow?: string;
  }
  interface N {
    nodeType: number;
    textContent: string | null;
  }
  interface El {
    id: string;
    tagName: string;
    parentElement: El | null;
    childNodes: ArrayLike<N>;
    textContent: string | null;
    labels?: ArrayLike<{ textContent: string | null }> | null;
    scrollWidth?: number;
    clientWidth?: number;
    scrollHeight?: number;
    clientHeight?: number;
    paused?: boolean;
    muted?: boolean;
    loop?: boolean;
    controls?: boolean;
    duration?: number;
    getAttribute(n: string): string | null;
    getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
  }
  interface G {
    document: { body: { querySelectorAll(s: string): ArrayLike<El> }; getElementById(id: string): El | null };
    getComputedStyle(e: El): Cs;
    innerWidth?: number;
    innerHeight?: number;
  }
  const g = globalThis as unknown as G;
  const flat = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const attr = (e: El, n: string): string => (e.getAttribute(n) ?? '').trim();
  const has = (e: El, n: string): boolean => e.getAttribute(n) !== null;
  const tag = (e: El): string => e.tagName.toLowerCase();
  const nodes = g.document.body.querySelectorAll('*');
  const all: El[] = [];
  for (let i = 0; i < nodes.length && i < args.maxElements; i++) {
    const n = nodes[i];
    if (n) all.push(n);
  }
  const counts: Record<string, number> = {};
  const ids = new Map<El, string>();
  for (const e of all) {
    const k = tag(e);
    const n = counts[k] ?? 0;
    counts[k] = n + 1;
    ids.set(e, `${k}${e.id ? '#' + e.id : ''}[${n}]`);
  }
  const idOf = (e: El): string => ids.get(e) ?? tag(e);
  const hiddenCache = new Map<El, boolean>();
  const hidden = (e: El): boolean => {
    const known = hiddenCache.get(e);
    if (known !== undefined) return known;
    const cs = g.getComputedStyle(e);
    const own = cs.display === 'none' || cs.visibility === 'hidden';
    const r = own || (e.parentElement ? hidden(e.parentElement) : false);
    hiddenCache.set(e, r);
    return r;
  };
  const ownText = (e: El): string => {
    let out = '';
    for (let i = 0; i < e.childNodes.length; i++) {
      const c = e.childNodes[i];
      if (c && c.nodeType === 3) out += ' ' + (c.textContent ?? '');
    }
    return flat(out);
  };
  const words = (e: El): string => `${e.id} ${attr(e, 'class')} ${attr(e, 'name')}`.toLowerCase();
  const labelOf = (e: El): string => {
    const out: string[] = [];
    const labs = e.labels;
    for (let i = 0; labs && i < labs.length; i++) out.push(flat(labs[i]?.textContent ?? ''));
    const by = attr(e, 'aria-labelledby');
    if (by) for (const id of by.split(/\s+/)) out.push(flat(g.document.getElementById(id)?.textContent ?? ''));
    return out.join(' ').trim() || attr(e, 'aria-label');
  };
  const resolve = (ids0: string): El[] => {
    const out: El[] = [];
    for (const id of ids0.split(/\s+/).filter(Boolean)) {
      const t0 = g.document.getElementById(id);
      if (t0) out.push(t0);
    }
    return out;
  };
  const inLive = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      const role = attr(p, 'role');
      const live = attr(p, 'aria-live');
      if (role === 'alert' || role === 'status' || role === 'log' || (live !== '' && live !== 'off')) return true;
    }
    return false;
  };
  const formOf = (e: El): El | null => {
    for (let p = e.parentElement; p; p = p.parentElement) if (tag(p) === 'form') return p;
    return null;
  };
  const within = (root: El | null, e: El): boolean => {
    if (!root) return true;
    for (let p: El | null = e; p; p = p.parentElement) if (p === root) return true;
    return false;
  };

  const fields: FieldFact[] = [];
  const passwords: PasswordFact[] = [];
  const oneTime: OneTimeFact[] = [];
  const captchas: string[] = [];
  const live: LiveFact[] = [];
  const toasts: string[] = [];
  const progress: ProgressFact[] = [];
  const media: MediaFact[] = [];
  const fixed: FixedFact[] = [];
  const clips: ClipFact[] = [];
  let requiredNote = false;
  const vw = g.innerWidth ?? 0;
  const vh = g.innerHeight ?? 0;
  const NON_TEXT = ['hidden', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color'];

  for (const e of all) {
    const k = tag(e);
    const id = idOf(e);
    const role = attr(e, 'role');
    const gone = hidden(e);
    const w = words(e);

    if (!requiredNote && !gone) {
      const own = ownText(e);
      if (own !== '' && /(\*|＊)\s*(=|:|means|indicates|marks|signals)?\s*(required|obligatoire)|required fields?|champs? obligatoires?|tous les champs/i.test(own)) requiredNote = true;
    }

    if (k === 'input' || k === 'select' || k === 'textarea') {
      const type = (attr(e, 'type') || 'text').toLowerCase();
      if (!gone && !(k === 'input' && NON_TEXT.includes(type))) {
        const by = attr(e, 'aria-describedby');
        const refs = resolve(by);
        const errTarget = resolve(attr(e, 'aria-errormessage'))[0] ?? (attr(e, 'aria-invalid') === 'true' ? refs[0] : undefined);
        let hintUnlinked = false;
        for (const s of all) {
          if (s === e || s.parentElement !== e.parentElement || hidden(s)) continue;
          if (/hint|help-?text|description|instruction/.test(`${s.id} ${attr(s, 'class')}`.toLowerCase()) && flat(s.textContent) !== '' && !refs.includes(s)) {
            hintUnlinked = true;
            break;
          }
        }
        fields.push({
          id,
          kind: k,
          type,
          name: attr(e, 'name'),
          label: labelOf(e),
          placeholder: attr(e, 'placeholder'),
          required: has(e, 'required') || attr(e, 'aria-required') === 'true',
          autocomplete: attr(e, 'autocomplete').toLowerCase(),
          inputmode: attr(e, 'inputmode').toLowerCase(),
          described: refs.length > 0,
          hintUnlinked,
          invalid: attr(e, 'aria-invalid') === 'true',
          error: errTarget ? { text: flat(errTarget.textContent), announced: inLive(errTarget) } : null,
        });
      }
      if (!gone && k === 'input' && type === 'password') {
        const form = formOf(e);
        let hasUsername = false;
        for (const o of all) {
          if (o !== e && tag(o) === 'input' && within(form, o)) {
            const ac = attr(o, 'autocomplete').toLowerCase();
            const ty = (attr(o, 'type') || 'text').toLowerCase();
            if (ac.split(/\s+/).includes('username') || ty === 'email' || /user|email|login|courriel/.test(words(o))) hasUsername = true;
          }
        }
        passwords.push({ id, autocomplete: attr(e, 'autocomplete').toLowerCase(), pasteBlocked: /return\s+false|preventDefault/.test(attr(e, 'onpaste')), hasUsername });
      }
      if (!gone && k === 'input' && (attr(e, 'autocomplete').toLowerCase().includes('one-time-code') || /otp|one-?time|2fa|mfa|totp|sms-?code|security-?code|confirm(ation)?-?code/.test(`${w} ${labelOf(e).toLowerCase()}`))) {
        oneTime.push({ id, autocomplete: attr(e, 'autocomplete').toLowerCase() });
      }
    }

    if (/recaptcha|hcaptcha|captcha|turnstile/.test(`${w} ${attr(e, 'src').toLowerCase()}`) && !gone) captchas.push(id);

    const liveAttr = attr(e, 'aria-live');
    if (role === 'alert' || role === 'status' || role === 'log' || liveAttr !== '') {
      live.push({ id, role, live: liveAttr, hidden: gone });
    } else if (!gone && flat(e.textContent) !== '' && /(^|[\s_-])(toast|snackbar|flash|notification)([\s_-]|$)/.test(`${e.id} ${attr(e, 'class')}`.toLowerCase()) && !inLive(e)) {
      toasts.push(id);
    }
    if (!gone && (role === 'progressbar' || k === 'progress')) {
      progress.push({ id, named: attr(e, 'aria-label') !== '' || attr(e, 'aria-labelledby') !== '' || attr(e, 'title') !== '' || labelOf(e) !== '' });
    }

    if (!gone && (k === 'audio' || k === 'video')) {
      const d = e.duration;
      let captions = false;
      for (const s of all) {
        if (s.parentElement === e && tag(s) === 'track' && /captions|subtitles/.test(attr(s, 'kind').toLowerCase())) captions = true;
      }
      media.push({
        id,
        tag: k,
        autoplay: has(e, 'autoplay'),
        playing: typeof e.paused === 'boolean' ? !e.paused : null,
        muted: typeof e.muted === 'boolean' ? e.muted : has(e, 'muted'),
        loop: typeof e.loop === 'boolean' ? e.loop : has(e, 'loop'),
        controls: typeof e.controls === 'boolean' ? e.controls : has(e, 'controls'),
        duration: typeof d === 'number' && Number.isFinite(d) ? d : null,
        hasCaptions: captions,
        host: '',
      });
    }
    if (!gone && k === 'iframe') {
      const m = /^(?:https?:)?\/\/(?:www\.)?([^/:?#]+)/i.exec(attr(e, 'src'));
      const host = (m?.[1] ?? '').toLowerCase();
      if (/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|dailymotion\.com)$/.test(host)) {
        media.push({ id, tag: 'embed', autoplay: /[?&]autoplay=1/.test(attr(e, 'src')), playing: null, muted: /[?&]mute=1/.test(attr(e, 'src')), loop: false, controls: true, duration: null, hasCaptions: false, host });
      }
    }

    if (!gone) {
      const cs = g.getComputedStyle(e);
      if ((cs.position === 'fixed' || cs.position === 'sticky') && vw > 0) {
        let nested = false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const pp = g.getComputedStyle(p).position;
          if (pp === 'fixed' || pp === 'sticky') nested = true;
        }
        const r = e.getBoundingClientRect();
        if (!nested && r.width > 0 && r.height > 0) {
          fixed.push({
            id,
            position: cs.position === 'fixed' ? 'fixed' : 'sticky',
            edge: r.top <= 1 ? 'top' : vh > 0 && r.bottom >= vh - 1 ? 'bottom' : 'other',
            height: r.height,
            width: r.width,
          });
        }
      }
      const text = ownText(e);
      if (text !== '' && k !== 'html' && k !== 'body') {
        const hx = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
        const hy = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
        if (hx && (e.scrollWidth ?? 0) > (e.clientWidth ?? 0) + 1) {
          clips.push({ id, axis: 'x', ellipsis: cs.textOverflow === 'ellipsis', text: text.slice(0, 40) });
        } else if (hy && (e.scrollHeight ?? 0) > (e.clientHeight ?? 0) + 1) {
          clips.push({ id, axis: 'y', ellipsis: false, text: text.slice(0, 40) });
        }
      }
    }
  }
  return {
    viewport: { width: vw, height: vh },
    fields,
    requiredNote,
    passwords,
    oneTime,
    captchas,
    live,
    toasts,
    progress,
    media,
    fixed,
    clips,
    truncated: nodes.length > args.maxElements,
  };
}
