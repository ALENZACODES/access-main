import type { LangBlocks } from './langparts.js';

/**
 * Running text of a page, for the checks that read what the words say (plain
 * language, date and number formats, instructions that point at a colour or a
 * place). langparts.ts keeps 240 characters per block, which is too short to
 * judge a sentence or a paragraph, so this collector keeps whole paragraphs.
 */

export interface HeadingFact {
  readonly id: string;
  /** 1 to 6, from the tag or aria-level. */
  readonly level: number;
  readonly text: string;
}

export interface ProseFacts extends LangBlocks {
  /** Headings in document order, with their text. */
  readonly headings: readonly HeadingFact[];
  /** The document title. */
  readonly title: string;
  /** Text of abbr and dfn elements that carry an explanation, so those abbreviations count as explained. */
  readonly abbrs: readonly string[];
  /** True when the page had more elements or blocks than the limits, so the end was not read. */
  readonly truncated: boolean;
}

export const EMPTY_PROSE: ProseFacts = { pageLang: '', blocks: [], abbrs: [], headings: [], title: '', truncated: false };

/** Characters kept for one block. A paragraph of about 250 words. */
export const MAX_BLOCK_CHARS = 1800;

/**
 * Runs in the page (serialised by evaluate), so it must not use anything from
 * the enclosing module. Reads only. A block is an element with its own text;
 * text inside inline children (links, emphasis, quotations) is part of it, and
 * text inside block children belongs to those children.
 */
export function proseInPage(args: { readonly maxElements: number; readonly maxBlocks: number; readonly maxChars: number }): ProseFacts {
  interface N {
    nodeType: number;
    textContent: string | null;
    tagName?: string;
  }
  interface Cs {
    display: string;
    visibility: string;
  }
  interface El {
    id: string;
    tagName: string;
    parentElement: El | null;
    childNodes: ArrayLike<N>;
    textContent: string | null;
    getAttribute(n: string): string | null;
  }
  interface G {
    document: { title: string; body: { querySelectorAll(s: string): ArrayLike<El> }; documentElement: { getAttribute(n: string): string | null } };
    getComputedStyle(e: El): Cs;
  }
  const g = globalThis as unknown as G;
  const pageLang = (g.document.documentElement.getAttribute('lang') ?? '').trim();
  const SKIP = ['script', 'style', 'code', 'pre', 'kbd', 'samp', 'textarea', 'noscript', 'svg', 'select', 'option', 'button'];
  const INLINE = ['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'small', 'mark', 'q', 'cite', 'time', 'sup', 'sub', 'abbr', 'dfn', 'bdi', 'bdo', 's', 'del', 'ins', 'label'];
  const nodes = g.document.body.querySelectorAll('*');
  const counts: Record<string, number> = {};
  const blocks: LangBlocks['blocks'][number][] = [];
  const abbrs: string[] = [];
  const headings: HeadingFact[] = [];
  let truncated = false;
  const skipped = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      if (SKIP.includes(p.tagName.toLowerCase()) || (p.getAttribute('translate') ?? '').toLowerCase() === 'no') return true;
      const cs = g.getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    }
    return false;
  };
  const flat = (s: string): string => s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < nodes.length; i++) {
    if (i >= args.maxElements) {
      truncated = true;
      break;
    }
    const e = nodes[i];
    if (!e) continue;
    const k = e.tagName.toLowerCase();
    const n = counts[k] ?? 0;
    counts[k] = n + 1;
    const role = (e.getAttribute('role') ?? '').toLowerCase();
    const tagLevel = /^h[1-6]$/.test(k) ? Number(k.slice(1)) : 0;
    if ((tagLevel > 0 || role === 'heading') && !skipped(e) && headings.length < 200) {
      const level = tagLevel > 0 ? tagLevel : Math.min(6, Math.max(1, Number(e.getAttribute('aria-level')) || 2));
      headings.push({ id: `${k}${e.id ? '#' + e.id : ''}[${n}]`, level, text: flat(e.textContent ?? '').slice(0, 200) });
    }
    if ((k === 'abbr' || k === 'dfn') && flat(e.getAttribute('title') ?? '') !== '') {
      const a = flat(e.textContent ?? '');
      if (a !== '' && !abbrs.includes(a)) abbrs.push(a);
    }
    // An inline element is read as part of the element that holds it.
    if (INLINE.includes(k) && e.parentElement) continue;
    let text = '';
    for (let c = 0; c < e.childNodes.length; c++) {
      const node = e.childNodes[c];
      if (!node) continue;
      if (node.nodeType === 3) text += ' ' + (node.textContent ?? '');
      else if (node.nodeType === 1 && node.tagName && INLINE.includes(node.tagName.toLowerCase())) text += ' ' + (node.textContent ?? '');
    }
    text = flat(text);
    if (text.split(' ').length < 6 || skipped(e)) continue;
    if (blocks.length >= args.maxBlocks) {
      truncated = true;
      continue;
    }
    let lang = '';
    let ownLang = false;
    for (let p: El | null = e; p; p = p.parentElement) {
      const l = (p.getAttribute('lang') ?? '').trim();
      if (l) {
        lang = l;
        ownLang = p === e;
        break;
      }
    }
    blocks.push({ id: `${k}${e.id ? '#' + e.id : ''}[${n}]`, lang, own: ownLang, text: text.slice(0, args.maxChars) });
  }
  return { pageLang, blocks, abbrs, headings, title: flat(g.document.title ?? ''), truncated };
}
