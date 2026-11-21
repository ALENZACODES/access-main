import type { HtmlNode } from './htmllint.js';
import type { Entry } from './types.js';

/**
 * Small helpers shared by the checks that read parsed markup. They only read
 * the node list that parseHtml returns.
 */

/** Tag, id when there is one, and the line in the file: `button#save@L12`. */
export const nodeLabel = (n: HtmlNode): string => `${n.tag}${n.attrs['id'] ? '#' + n.attrs['id'] : ''}@L${n.line}`;

/** Attribute value with the outer white space removed. Empty when the attribute is absent. */
export const attrOf = (n: HtmlNode, name: string): string => (n.attrs[name] ?? '').trim();

/** Ancestors of a node, nearest first. Stops if the parent links ever loop. */
export function ancestorsOf(nodes: readonly HtmlNode[], n: HtmlNode): HtmlNode[] {
  const out: HtmlNode[] = [];
  const seen = new Set<number>([n.index]);
  for (let p = nodes[n.parent]; p && !seen.has(p.index); p = nodes[p.parent]) {
    seen.add(p.index);
    out.push(p);
  }
  return out;
}

/** First element for each id. A repeated id keeps the first one, as browsers do. */
export function idIndex(nodes: readonly HtmlNode[]): Map<string, HtmlNode> {
  const map = new Map<string, HtmlNode>();
  for (const n of nodes) {
    const id = n.attrs['id'];
    if (id !== undefined && id !== '' && !map.has(id)) map.set(id, n);
  }
  return map;
}

/** True when the element or one of its ancestors is hidden from everyone or from assistive technology. */
export function isHiddenNode(nodes: readonly HtmlNode[], n: HtmlNode): boolean {
  return [n, ...ancestorsOf(nodes, n)].some((a) => a.attrs['hidden'] !== undefined || attrOf(a, 'aria-hidden').toLowerCase() === 'true');
}

/** Line number read back from an entry id made by nodeLabel, or 0. */
export const lineOfEntry = (e: Entry): number => Number(/@L(\d+)(?:$|:)/.exec(e.id)?.[1] ?? 0);

/** Entries in the order of the file. The sort is stable, so entries on one line keep their order. */
export function inFileOrder(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => lineOfEntry(a) - lineOfEntry(b));
}

/** White-space separated tokens of an attribute value. */
export const tokensOf = (value: string): string[] => value.split(/\s+/).filter((x) => x !== '');

/** English and French list of code words: `a, b and c` and `a, b et c`. */
export function listBoth(items: readonly string[]): { en: string; fr: string } {
  if (items.length <= 1) return { en: items[0] ?? '', fr: items[0] ?? '' };
  const head = items.slice(0, -1).join(', ');
  const last = items[items.length - 1] ?? '';
  return { en: `${head} and ${last}`, fr: `${head} et ${last}` };
}
