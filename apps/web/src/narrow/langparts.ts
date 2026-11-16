import { clip, t, type CheckResult, type Entry } from './types.js';

/**
 * Language of parts (WCAG 3.1.2). A block of French text inside an English
 * page, with no lang attribute to say so, is read by a screen reader with the
 * wrong voice. The guess comes from common words, so it can be wrong for short
 * text, names and quotations. Every finding is UNKNOWN and a person decides.
 */

export interface TextBlock {
  readonly id: string;
  /** Language in force on this block: its own lang or the nearest ancestor's. Empty when none is set. */
  readonly lang: string;
  /** True when the block itself, not an ancestor, sets lang. */
  readonly own: boolean;
  readonly text: string;
}

export interface LangBlocks {
  readonly pageLang: string;
  readonly blocks: readonly TextBlock[];
}

export type LangRule = 'lang-mismatch' | 'page-lang-differs';

export const LANG_RULES: readonly LangRule[] = ['lang-mismatch', 'page-lang-differs'];

/** Blocks with fewer words than this are not judged. */
export const MIN_WORDS = 6;
/** Words that are common in one of the two languages and rare in the other. */
const EN = new Set(['the', 'and', 'of', 'to', 'is', 'are', 'for', 'with', 'you', 'your', 'this', 'that', 'from', 'not', 'have', 'will', 'can', 'we', 'our', 'be', 'it', 'on', 'or']);
const FR = new Set(['le', 'la', 'les', 'des', 'du', 'et', 'est', 'sont', 'pour', 'avec', 'vous', 'votre', 'dans', 'ce', 'cette', 'que', 'qui', 'pas', 'une', 'un', 'sur', 'au', 'aux', 'nous', 'notre', 'ou', 'il']);

const wordsOf = (text: string): string[] => text.toLowerCase().match(/[\p{L}’']+/gu) ?? [];

/** 'en' or 'fr' when the text clearly is one, otherwise null. */
export function guessLang(text: string): 'en' | 'fr' | null {
  const words = wordsOf(text);
  if (words.length < MIN_WORDS) return null;
  let en = 0;
  let fr = 0;
  for (const w of words) {
    if (EN.has(w)) en++;
    if (FR.has(w)) fr++;
  }
  if (en >= 3 && en >= fr * 2) return 'en';
  if (fr >= 3 && fr >= en * 2) return 'fr';
  return null;
}

/** The language code reduced to its first part, in lower case. */
export const primary = (lang: string): string => lang.trim().toLowerCase().split(/[-_]/)[0] ?? '';

const NAME: Record<'en' | 'fr', { en: string; fr: string }> = {
  en: { en: 'English', fr: 'anglais' },
  fr: { en: 'French', fr: 'français' },
};

/** Share of judged blocks that must differ from the page language for the page-wide finding. */
export const PAGE_SHARE = 0.7;
/** The page-wide finding needs at least this many judged blocks. */
export const PAGE_MIN_BLOCKS = 4;

export function auditLangParts(input: LangBlocks): CheckResult {
  const entries: Entry[] = [];
  const page = primary(input.pageLang);
  let judged = 0;
  let differ = 0;
  for (const b of input.blocks) {
    const guess = guessLang(b.text);
    if (!guess) continue;
    judged++;
    const effective = primary(b.lang || input.pageLang);
    if (effective !== '' && effective !== guess) {
      differ++;
      entries.push({
        check: 'lang-parts',
        id: b.id,
        status: 'unknown',
        rule: 'lang-mismatch',
        message: t(
          `The text “${clip(b.text, 28)}” looks ${NAME[guess].en} but is marked ${effective}. Check that a lang attribute is set on it.`,
          `Le texte «\u202F${clip(b.text, 28)}\u202F» semble être en ${NAME[guess].fr} mais est marqué ${effective}. Contrôlez qu’un attribut lang lui est appliqué.`,
        ),
      });
    }
  }
  if ((page === 'en' || page === 'fr') && judged >= PAGE_MIN_BLOCKS && differ / judged >= PAGE_SHARE) {
    const other = page === 'en' ? 'fr' : 'en';
    entries.push({
      check: 'lang-parts',
      id: 'html',
      status: 'unknown',
      rule: 'page-lang-differs',
      message: t(
        `Most of the text on this page looks ${NAME[other].en} but the page language is ${page}. Check the lang attribute of the page.`,
        `La plupart du texte de cette page semble être en ${NAME[other].fr} mais la langue de la page est ${page}. Contrôlez l’attribut lang de la page.`,
      ),
    });
  }
  return { checked: judged, entries };
}

/** Runs in the page. Reads text blocks of enough length and the language in force on each. */
export function langBlocksInPage(args: { readonly maxElements: number; readonly maxBlocks: number }): LangBlocks {
  interface N {
    nodeType: number;
    textContent: string | null;
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
    getAttribute(n: string): string | null;
  }
  interface G {
    document: { body: { querySelectorAll(s: string): ArrayLike<El> }; documentElement: { getAttribute(n: string): string | null } };
    getComputedStyle(e: El): Cs;
  }
  const g = globalThis as unknown as G;
  const pageLang = (g.document.documentElement.getAttribute('lang') ?? '').trim();
  const SKIP = ['script', 'style', 'code', 'pre', 'kbd', 'samp', 'textarea', 'noscript', 'svg'];
  const nodes = g.document.body.querySelectorAll('*');
  const counts: Record<string, number> = {};
  const blocks: TextBlock[] = [];
  const skipped = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      if (SKIP.includes(p.tagName.toLowerCase()) || (p.getAttribute('translate') ?? '').toLowerCase() === 'no') return true;
      const cs = g.getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    }
    return false;
  };
  for (let i = 0; i < nodes.length && i < args.maxElements; i++) {
    const e = nodes[i];
    if (!e) continue;
    const k = e.tagName.toLowerCase();
    const n = counts[k] ?? 0;
    counts[k] = n + 1;
    if (blocks.length >= args.maxBlocks) continue;
    let own = '';
    for (let c = 0; c < e.childNodes.length; c++) {
      const node = e.childNodes[c];
      if (node && node.nodeType === 3) own += ' ' + (node.textContent ?? '');
    }
    const text = own.replace(/\s+/g, ' ').trim();
    if (text.split(' ').length < 6 || skipped(e)) continue;
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
    blocks.push({ id: `${k}${e.id ? '#' + e.id : ''}[${n}]`, lang, own: ownLang, text: text.slice(0, 240) });
  }
  return { pageLang, blocks };
}
