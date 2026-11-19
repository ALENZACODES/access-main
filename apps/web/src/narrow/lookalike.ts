import { parseHtml, type HtmlNode } from './htmllint.js';
import { clip, t, type CheckResult, type Entry } from './types.js';

/**
 * Markup that looks like structure and is not (WCAG 1.3.1): a paragraph that
 * holds only bold text and acts as a heading, a run of paragraphs that start
 * with a bullet or a number and act as a list, and empty paragraphs used as
 * space. Assistive technology reads what the markup says, so a person who
 * navigates by headings or lists never finds these. It reads the markup text
 * only, and a bold line can be a real label, so every finding is UNKNOWN.
 */

export type LookalikeRule = 'fake-heading' | 'fake-list' | 'empty-paragraph';

export const LOOKALIKE_RULES: readonly LookalikeRule[] = ['fake-heading', 'fake-list', 'empty-paragraph'];

/** A bold-only line with more words than this is a sentence, not a heading. */
export const MAX_FAKE_HEADING_WORDS = 8;
/** Consecutive marked lines needed to call them a list. */
export const MIN_LIST_LINES = 3;

const BOLD = new Set(['strong', 'b']);
const BLOCKS = new Set(['p', 'div']);
/** Parents where a lone bold paragraph is normal. */
const LABEL_PARENTS = new Set(['label', 'button', 'a', 'summary', 'caption', 'figcaption', 'th', 'td', 'dt', 'legend', 'li', 'option', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const MARKER = /^(?:[•·▪◦●‣⁃*–—-]|\d{1,2}[.)])\s+\S/u;
const BULLETS = /[•·▪◦●‣⁃]/gu;
const SPACER = /^(?:&nbsp;|&#160;|\u00A0|\s)*$/u;

const idOf = (n: HtmlNode): string => `${n.tag}${n.attrs['id'] ? '#' + n.attrs['id'] : ''}@L${n.line}`;
const wordCount = (s: string): number => (s.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu) ?? []).length;

export function auditLookalike(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: LookalikeRule, en: string, fr: string): void => {
    entries.push({ check: 'lookalike', id: idOf(n), status: 'unknown', rule, message: t(en, fr) });
  };
  const grouped = new Set<number>();
  for (const n of nodes) {
    if (!BLOCKS.has(n.tag)) continue;
    const parent = nodes[n.parent];
    if (parent && LABEL_PARENTS.has(parent.tag)) continue;
    checked++;

    const onlyChild = n.children.length === 1 ? nodes[n.children[0] ?? -1] : undefined;
    if (onlyChild && BOLD.has(onlyChild.tag) && n.own.trim() === '' && onlyChild.text.trim() !== '') {
      const text = onlyChild.text.trim();
      const words = wordCount(text);
      if (words >= 1 && words <= MAX_FAKE_HEADING_WORDS && !/[.!?,;]$/u.test(text)) {
        add(
          n,
          'fake-heading',
          `The ${n.tag} “${clip(text, 36)}” holds only bold text and looks like a heading. Screen reader users who jump between headings will not find it. Use a heading element.`,
          `Le ${n.tag} «\u202F${clip(text, 36)}\u202F» ne contient que du texte en gras et ressemble à un titre. Les personnes qui naviguent par titres au lecteur d’écran ne le trouveront pas. Utilisez un élément de titre.`,
        );
      }
    }

    if ((n.tag === 'p' || n.tag === 'div') && n.children.every((c) => nodes[c]?.tag === 'br' || BOLD.has(nodes[c]?.tag ?? ''))) {
      const brs = n.children.filter((c) => nodes[c]?.tag === 'br').length;
      const bullets = (n.own.match(BULLETS) ?? []).length;
      if (brs >= 2 && bullets >= MIN_LIST_LINES) {
        add(
          n,
          'fake-list',
          `This ${n.tag} lists ${bullets} items with bullet characters and line breaks. Screen readers do not announce it as a list. Use ul and li.`,
          `Ce ${n.tag} énumère ${bullets} éléments avec des puces et des sauts de ligne. Les lecteurs d’écran ne l’annoncent pas comme une liste. Utilisez ul et li.`,
        );
      }
    }

    const ownText = n.own.trim();
    if (ownText === '' && n.children.length === 0 && (n.tag === 'p' || n.tag === 'div')) {
      if (n.tag === 'p') {
        add(
          n,
          'empty-paragraph',
          'An empty paragraph is used here, most likely as space. Screen readers can announce it as a blank paragraph. Use margin or padding in CSS.',
          'Un paragraphe vide est utilisé ici, sans doute comme espace. Les lecteurs d’écran peuvent l’annoncer comme un paragraphe vide. Utilisez une marge ou un remplissage en CSS.',
        );
      }
    } else if (n.tag === 'p' && SPACER.test(n.text) && n.children.length === 0 && ownText !== '') {
      add(
        n,
        'empty-paragraph',
        'A paragraph holding only a non-breaking space is used here as space. Use margin or padding in CSS.',
        'Un paragraphe qui ne contient qu’une espace insécable est utilisé ici comme espace. Utilisez une marge ou un remplissage en CSS.',
      );
    }
  }

  // A run of sibling paragraphs or divs that each start with a marker.
  for (const parent of nodes) {
    let run: HtmlNode[] = [];
    const flush = (): void => {
      if (run.length >= MIN_LIST_LINES) {
        const first = run[0];
        if (first && !grouped.has(first.index)) {
          for (const r of run) grouped.add(r.index);
          add(
            first,
            'fake-list',
            `${run.length} ${first.tag === 'p' ? 'paragraphs' : 'blocks'} in a row start with a bullet or a number and look like a list. Use ul or ol with li, so screen readers announce the list and its length.`,
            `${run.length} ${first.tag === 'p' ? 'paragraphes' : 'blocs'} de suite commencent par une puce ou un numéro et ressemblent à une liste. Utilisez ul ou ol avec li, pour que les lecteurs d’écran annoncent la liste et sa longueur.`,
          );
        }
      }
      run = [];
    };
    for (const ci of parent.children) {
      const c = nodes[ci];
      if (c && BLOCKS.has(c.tag) && MARKER.test(c.text.trim())) run.push(c);
      else flush();
    }
    flush();
  }
  const lineOf = (e: Entry): number => Number(/@L(\d+)$/.exec(e.id)?.[1] ?? 0);
  entries.sort((a, b) => lineOf(a) - lineOf(b));
  return { checked, entries };
}
