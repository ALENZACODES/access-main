import { findLimit, type PageTyping } from './typing-trial.js';

/**
 * The text fields of the page that is running the code, and its text, split
 * into sentences, so a time limit the page states can be found. It reads
 * only and moves nothing.
 */

export interface TypingArgs {
  /** A selector for a part of the page to leave out, such as the panel that runs the code. Empty for none. */
  readonly exclude: string;
}

export const TYPING_ARGS: TypingArgs = { exclude: '' };

/** The raw facts, serialisable, read in the page. */
export interface TypingRaw {
  readonly fields: number;
  readonly sentences: readonly string[];
}

/** Runs in the page (serialised by evaluate, so it takes one argument and is self-contained). Reads only. */
export function typingRawInPage(args: TypingArgs): TypingRaw {
  interface El {
    tagName: string;
    parentElement: El | null;
    disabled?: boolean;
    readOnly?: boolean;
    getAttribute(n: string): string | null;
    hasAttribute(n: string): boolean;
    getBoundingClientRect(): { width: number; height: number };
    contains(o: El): boolean;
    cloneNode(deep: boolean): El & { querySelectorAll(s: string): ArrayLike<{ remove(): void; append(t: string): void }>; textContent: string | null };
  }
  interface G {
    document: { body: El & { querySelectorAll(s: string): ArrayLike<El> }; querySelector(s: string): El | null };
    getComputedStyle(e: El): { display: string; visibility: string };
  }
  const g = globalThis as unknown as G;
  const doc = g.document;
  const excluded = args.exclude === '' ? null : doc.querySelector(args.exclude);
  const TEXT_TYPES = ['', 'text', 'email', 'tel', 'number', 'search', 'url', 'password'];
  const all = doc.body.querySelectorAll('input,textarea,[contenteditable="true"],[role="textbox"]');
  let fields = 0;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e || (excluded && excluded.contains(e)) || e.disabled === true || e.readOnly === true) continue;
    if (e.tagName.toLowerCase() === 'input' && !TEXT_TYPES.includes((e.getAttribute('type') ?? '').toLowerCase())) continue;
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
    fields++;
  }
  // The text of the page without the excluded part, scripts and styles, in sentences.
  const copy = doc.body.cloneNode(true);
  const drop = copy.querySelectorAll(`script,style,noscript,template${args.exclude === '' ? '' : `,${args.exclude}`}`);
  for (let i = 0; i < drop.length; i++) drop[i]?.remove();
  // Blocks and labels end a line, so their text is not run together.
  const blocks = copy.querySelectorAll('address,article,aside,blockquote,br,dd,div,dl,dt,fieldset,figcaption,footer,form,h1,h2,h3,h4,h5,h6,header,label,legend,li,main,nav,ol,p,section,summary,td,th,tr,ul');
  for (let i = 0; i < blocks.length; i++) blocks[i]?.append('\n');
  const sentences = (copy.textContent ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s !== '');
  return { fields, sentences };
}

export function pageTypingOf(raw: TypingRaw): PageTyping {
  const limit = findLimit(raw.sentences);
  return { fields: raw.fields, limitMinutes: limit ? limit.minutes : null, limitText: limit ? limit.text : '' };
}
