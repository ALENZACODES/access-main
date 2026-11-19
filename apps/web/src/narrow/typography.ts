import { clip, t, type CheckResult, type Entry } from './types.js';

/**
 * Text layout that helps people read (WCAG 1.4.8 is a level AAA criterion, so
 * these are good practice and not a conformance test): small text, justified
 * text, very long lines, tight line spacing, long italic passages. The line
 * count comes from the box height divided by the line height, so it is a guess
 * for a block with other elements inside it, and those are not measured.
 * Every finding is UNKNOWN.
 */

export interface TextLayout {
  readonly id: string;
  readonly words: number;
  readonly chars: number;
  /** Computed font size in px. */
  readonly fontSize: number;
  /** Line height divided by font size. 1.2 stands for "normal". */
  readonly leading: number;
  /** Lines the text fills, or 0 when the block holds other elements and it cannot be told. */
  readonly lines: number;
  readonly textAlign: string;
  readonly italic: boolean;
}

export interface TypographyFacts {
  readonly blocks: readonly TextLayout[];
  readonly truncated: boolean;
}

export const EMPTY_TYPOGRAPHY: TypographyFacts = { blocks: [], truncated: false };

export type TypographyRule = 'small-text' | 'justified' | 'long-line' | 'tight-leading' | 'italic-passage';

export const TYPOGRAPHY_RULES: readonly TypographyRule[] = ['small-text', 'justified', 'long-line', 'tight-leading', 'italic-passage'];

/** Text smaller than this, in px, is asked about. */
export const MIN_FONT_PX = 12;
/** Characters per line above this are asked about (the criterion says 80). */
export const MAX_LINE_CHARS = 80;
/** Line height below this multiple of the font size is asked about. */
export const MIN_LEADING = 1.2;
/** Blocks need this many words to be judged. */
export const MIN_BLOCK_WORDS = 8;
/** Italic passages of at least this many words are asked about. */
export const ITALIC_WORDS = 40;

/**
 * Runs in the page (serialised by evaluate), so it must not use anything from
 * the enclosing module. Reads only.
 */
export function typographyInPage(args: { readonly maxElements: number; readonly maxBlocks: number }): TypographyFacts {
  interface N {
    nodeType: number;
    textContent: string | null;
    tagName?: string;
  }
  interface Cs {
    display: string;
    visibility: string;
    fontSize: string;
    lineHeight: string;
    textAlign: string;
    fontStyle: string;
  }
  interface El {
    id: string;
    tagName: string;
    parentElement: El | null;
    childNodes: ArrayLike<N>;
    getBoundingClientRect(): { height: number };
  }
  interface G {
    document: { body: { querySelectorAll(s: string): ArrayLike<El> } };
    getComputedStyle(e: El): Cs;
  }
  const g = globalThis as unknown as G;
  const INLINE = ['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'small', 'mark', 'q', 'cite', 'time', 'sup', 'sub', 'abbr', 'dfn', 'bdi', 'bdo', 's', 'del', 'ins', 'br', 'wbr'];
  const SKIP = ['script', 'style', 'code', 'pre', 'kbd', 'samp', 'textarea', 'noscript', 'svg', 'select', 'option', 'button'];
  const nodes = g.document.body.querySelectorAll('*');
  const counts: Record<string, number> = {};
  const blocks: TextLayout[] = [];
  let truncated = false;
  const hidden = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      if (SKIP.includes(p.tagName.toLowerCase())) return true;
      const cs = g.getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    }
    return false;
  };
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
    let own = '';
    let mixed = false;
    for (let c = 0; c < e.childNodes.length; c++) {
      const node = e.childNodes[c];
      if (!node) continue;
      if (node.nodeType === 3) own += ' ' + (node.textContent ?? '');
      else if (node.nodeType === 1) {
        if (node.tagName && INLINE.includes(node.tagName.toLowerCase())) own += ' ' + (node.textContent ?? '');
        else mixed = true;
      }
    }
    const text = own.replace(/\s+/g, ' ').trim();
    const words = text === '' ? 0 : text.split(' ').length;
    if (words < 8 || hidden(e)) continue;
    if (blocks.length >= args.maxBlocks) {
      truncated = true;
      continue;
    }
    const cs = g.getComputedStyle(e);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const lh = cs.lineHeight === 'normal' ? NaN : parseFloat(cs.lineHeight);
    const leading = Number.isFinite(lh) && lh > 0 ? lh / fontSize : 1.2;
    const lineHeightPx = leading * fontSize;
    const height = e.getBoundingClientRect().height;
    const lines = mixed || !(height > 0) ? 0 : Math.max(1, Math.round(height / lineHeightPx));
    blocks.push({
      id: `${k}${e.id ? '#' + e.id : ''}[${n}]`,
      words,
      chars: text.length,
      fontSize,
      leading: Math.round(leading * 100) / 100,
      lines,
      textAlign: cs.textAlign,
      italic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
    });
  }
  return { blocks, truncated };
}

export function auditTypography(f: TypographyFacts): CheckResult {
  const entries: Entry[] = [];
  const add = (b: TextLayout, rule: TypographyRule, en: string, fr: string): void => {
    entries.push({ check: 'typography', id: b.id, status: 'unknown', rule, message: t(en, fr) });
  };
  for (const b of f.blocks) {
    if (b.words < MIN_BLOCK_WORDS) continue;
    if (b.fontSize < MIN_FONT_PX) {
      add(
        b,
        'small-text',
        `This text is ${Math.round(b.fontSize * 10) / 10}px, under ${MIN_FONT_PX}px. Small text is hard to read, even when zoom works.`,
        `Ce texte fait ${String(Math.round(b.fontSize * 10) / 10).replace('.', ',')}\u00A0px, sous les ${MIN_FONT_PX}\u00A0px. Un petit texte est difficile à lire, même quand le zoom fonctionne.`,
      );
    }
    if (b.textAlign === 'justify') {
      add(
        b,
        'justified',
        'This text is justified. The uneven gaps between words are hard to follow for many readers. Align it to the start.',
        'Ce texte est justifié. Les espaces inégaux entre les mots sont difficiles à suivre pour beaucoup de lecteurs. Alignez-le au début.',
      );
    }
    if (b.lines >= 2) {
      const perLine = Math.round(b.chars / b.lines);
      if (perLine > MAX_LINE_CHARS) {
        add(
          b,
          'long-line',
          `Lines hold about ${perLine} characters (“${clip(b.id, 24)}”). Over ${MAX_LINE_CHARS} makes it easy to lose the place. Narrow the text block.`,
          `Les lignes comptent environ ${perLine} caractères («\u202F${clip(b.id, 24)}\u202F»). Au-delà de ${MAX_LINE_CHARS}, on perd facilement sa place. Rétrécissez le bloc de texte.`,
        );
      }
      if (b.leading < MIN_LEADING) {
        add(
          b,
          'tight-leading',
          `Line spacing is ${b.leading} times the text size. Under ${MIN_LEADING} the lines crowd each other. Use 1.5 for body text.`,
          `L’interligne est de ${String(b.leading).replace('.', ',')} fois la taille du texte. Sous ${String(MIN_LEADING).replace('.', ',')}, les lignes se touchent. Utilisez 1,5 pour le texte courant.`,
        );
      }
    }
    if (b.italic && b.words >= ITALIC_WORDS) {
      add(
        b,
        'italic-passage',
        `A passage of ${b.words} words is in italics. Long italic text is harder to read. Keep italics for short emphasis.`,
        `Un passage de ${b.words} mots est en italique. Un long texte en italique est plus difficile à lire. Gardez l’italique pour une courte mise en valeur.`,
      );
    }
  }
  return { checked: f.blocks.filter((b) => b.words >= MIN_BLOCK_WORDS).length, entries };
}
