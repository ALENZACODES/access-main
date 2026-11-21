import { t, type CheckResult, type Entry } from './types.js';

/**
 * Visual order against reading order (WCAG 1.3.2 meaningful sequence, 2.4.3
 * focus order). A flex or grid container that shows its children in a
 * different order from the markup (row-reverse, column-reverse, or the order
 * property) makes screen readers and the Tab key follow the markup while the
 * eye follows the screen. Whether the difference matters is a judgement, so
 * every finding is UNKNOWN. Order set by absolute positioning is not measured.
 */

export interface ReorderFact {
  readonly id: string;
  readonly kind: 'reverse' | 'order';
  /** Element children of the container. */
  readonly children: number;
  /** Children (or a child's descendants) that take focus. */
  readonly focusable: number;
}

export interface OrderFacts {
  readonly reordered: readonly ReorderFact[];
  readonly truncated: boolean;
}

export const EMPTY_ORDER: OrderFacts = { reordered: [], truncated: false };

export type OrderRule = 'reverse-direction' | 'order-property';

export const ORDER_RULES: readonly OrderRule[] = ['reverse-direction', 'order-property'];

/** Runs in the page (serialised by evaluate). Reads only. */
export function orderInPage(args: { readonly maxElements: number; readonly selector: string }): OrderFacts {
  interface Cs {
    display: string;
    flexDirection: string;
    order: string;
    visibility: string;
  }
  interface El {
    id: string;
    tagName: string;
    children: ArrayLike<El>;
    tabIndex: number;
    parentElement: El | null;
  }
  interface G {
    document: { querySelectorAll(s: string): ArrayLike<El>; body: { querySelectorAll(s: string): ArrayLike<El> } };
    getComputedStyle(e: El): Cs;
  }
  const g = globalThis as unknown as G;
  const nodes = g.document.body.querySelectorAll('*');
  const counts: Record<string, number> = {};
  const reordered: ReorderFact[] = [];
  let truncated = false;
  const interactive = g.document.querySelectorAll(args.selector);
  const focusableIn = (c: El): number => {
    let n = 0;
    for (let i = 0; i < interactive.length; i++) {
      const f = interactive[i];
      for (let p: El | null = f ?? null; p; p = p.parentElement) {
        if (p === c) {
          n++;
          break;
        }
      }
    }
    return n;
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
    if (e.children.length < 2) continue;
    const cs = g.getComputedStyle(e);
    const flex = cs.display === 'flex' || cs.display === 'inline-flex';
    const grid = cs.display === 'grid' || cs.display === 'inline-grid';
    if (!flex && !grid) continue;
    const id = `${k}${e.id ? '#' + e.id : ''}[${n}]`;
    let focusable = 0;
    if (flex && cs.flexDirection.endsWith('reverse')) {
      for (let c = 0; c < e.children.length; c++) {
        const child = e.children[c];
        if (child) focusable += focusableIn(child);
      }
      reordered.push({ id, kind: 'reverse', children: e.children.length, focusable });
      continue;
    }
    let moved = 0;
    for (let c = 0; c < e.children.length; c++) {
      const child = e.children[c];
      if (child && Number(g.getComputedStyle(child).order) !== 0) {
        moved++;
        focusable += focusableIn(child);
      }
    }
    if (moved > 0) reordered.push({ id, kind: 'order', children: e.children.length, focusable });
  }
  return { reordered, truncated };
}

export function auditOrder(f: OrderFacts): CheckResult {
  const entries: Entry[] = f.reordered.map((r) => {
    const rule: OrderRule = r.kind === 'reverse' ? 'reverse-direction' : 'order-property';
    const focus = r.focusable > 0;
    const en =
      r.kind === 'reverse'
        ? `This container shows its ${r.children} children in reverse order.`
        : 'This container moves some of its children with the order property.';
    const fr =
      r.kind === 'reverse'
        ? `Ce conteneur affiche ses ${r.children} enfants en ordre inverse.`
        : 'Ce conteneur déplace certains de ses enfants avec la propriété order.';
    return {
      check: 'order',
      id: r.id,
      status: 'unknown',
      rule,
      message: t(
        `${en} Screen readers and the Tab key follow the markup, not the screen${focus ? `, and ${r.focusable} focusable control${r.focusable === 1 ? '' : 's'} sit inside` : ''}. Check that the order still makes sense, or put the markup in the visual order.`,
        `${fr} Les lecteurs d’écran et la touche Tab suivent le balisage, pas l’écran${focus ? `, et ${r.focusable} contrôle${r.focusable === 1 ? '' : 's'} focalisable${r.focusable === 1 ? '' : 's'} s’y trouve${r.focusable === 1 ? '' : 'nt'}` : ''}. Contrôlez que l’ordre garde un sens, ou placez le balisage dans l’ordre visuel.`,
      ),
    };
  });
  return { checked: f.reordered.length, entries };
}
