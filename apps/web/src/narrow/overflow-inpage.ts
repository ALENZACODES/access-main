/**
 * Finds where sideways overflow starts on the page that is running the
 * code, and reads the few style facts that say why: the element that is
 * wider than the space it sits in, the text that cannot wrap, the row of
 * items that cannot break, and the regions that scroll sideways on their
 * own. It reads only, and changes nothing on the page.
 *
 * An element is an origin when it reaches past the end edge of the page and
 * also sticks out of its own parent. Its descendants are wide because of
 * it, so they are not reported again.
 */

export interface OverflowOrigin {
  readonly id: string;
  readonly tag: string;
  /** Id of the parent, for causes that belong to the parent (a flex row, a grid). */
  readonly parentId: string;
  /** CSS pixels past the end edge of the page. */
  readonly overPx: number;
  readonly widthPx: number;
  /** Width of the space the parent gives its content. */
  readonly spacePx: number;
  readonly display: string;
  readonly position: string;
  readonly whiteSpace: string;
  readonly floated: boolean;
  /** Computed min-width in CSS pixels, 0 when there is none or it is not a length. */
  readonly minWidthPx: number;
  /** The parent lays its items out in one row that cannot wrap. */
  readonly parentFlexNoWrap: boolean;
  /** Sum of the fixed column tracks and gaps of a parent grid, or null. */
  readonly parentGridPx: number | null;
  /** An image, video, canvas, embedded page or drawing. */
  readonly replaced: boolean;
  readonly tableLike: boolean;
  /** The overflow is text of this block that runs past its own edge. */
  readonly text: boolean;
  /** The longest run of that text with no space in it, shortened. */
  readonly word: string;
  readonly wordChars: number;
  /** Not wider than its space, and still past its edge: moved by a margin, an offset or a transform. */
  readonly shifted: boolean;
}

export interface OverflowRegion {
  readonly id: string;
  readonly tag: string;
  /** Width of what the region holds. */
  readonly contentPx: number;
  /** Width of the region itself. */
  readonly spacePx: number;
  readonly table: boolean;
  readonly pre: boolean;
  readonly media: boolean;
  /** A paragraph, list item or heading in the region is wider than the region. */
  readonly textBlock: boolean;
  readonly role: string;
  /** The region, or something in it, can take keyboard focus. */
  readonly keyboard: boolean;
}

export interface OverflowFacts {
  readonly pageScrolls: boolean;
  readonly viewportPx: number;
  readonly rtl: boolean;
  /** Elements looked at. */
  readonly examined: number;
  readonly origins: readonly OverflowOrigin[];
  /** All origins found, including those not kept. */
  readonly originCount: number;
  readonly regions: readonly OverflowRegion[];
  readonly regionCount: number;
  readonly truncated: boolean;
}

export const EMPTY_OVERFLOW: OverflowFacts = { pageScrolls: false, viewportPx: 0, rtl: false, examined: 0, origins: [], originCount: 0, regions: [], regionCount: 0, truncated: false };

export interface OverflowArgs {
  readonly maxElements: number;
  /** Origins and regions kept in the facts. */
  readonly keep: number;
}

export const OVERFLOW_ARGS: OverflowArgs = { maxElements: 3000, keep: 12 };

/** Runs in the page (serialised by evaluate). Reads only. */
export function overflowInPage(args: OverflowArgs): OverflowFacts {
  interface R {
    left: number;
    right: number;
    width: number;
    height: number;
  }
  interface N {
    nodeType: number;
    textContent: string | null;
  }
  interface Cs {
    display: string;
    visibility: string;
    position: string;
    whiteSpace: string;
    overflowX: string;
    minWidth: string;
    direction: string;
    flexWrap: string;
    flexDirection: string;
    gridTemplateColumns: string;
    columnGap: string;
    cssFloat?: string;
    paddingLeft: string;
    paddingRight: string;
    borderLeftWidth: string;
    borderRightWidth: string;
  }
  interface El {
    id: string;
    tagName: string;
    tabIndex?: number;
    parentElement: El | null;
    childNodes: ArrayLike<N>;
    scrollWidth: number;
    clientWidth: number;
    getAttribute(n: string): string | null;
    getBoundingClientRect(): R;
    querySelector(s: string): El | null;
    querySelectorAll(s: string): ArrayLike<El>;
    closest?(s: string): El | null;
  }
  interface G {
    document: {
      documentElement: El;
      body: El;
      createRange?(): { selectNodeContents(n: N): void; getBoundingClientRect(): R };
    };
    getComputedStyle(e: El): Cs;
    scrollX?: number;
  }
  const g = globalThis as unknown as G;
  const de = g.document.documentElement;
  const body = g.document.body;
  const vw = de.clientWidth;
  const sx = g.scrollX ?? 0;
  const EDGE = 0.5;
  const px = (s: string): number => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const rtl = g.getComputedStyle(body).direction === 'rtl' || g.getComputedStyle(de).direction === 'rtl';
  const pageScrolls = de.scrollWidth > de.clientWidth + EDGE;

  const SKIP = ['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'br', 'wbr'];
  const REPLACED = ['img', 'video', 'canvas', 'svg', 'iframe', 'object', 'embed', 'picture'];
  const CLIPS = ['hidden', 'clip', 'auto', 'scroll'];

  /** How far a box reaches past the end edge of the page. Negative when it does not. */
  const past = (r: R): number => (rtl ? -(r.left + sx) : r.right + sx - vw);
  /** The space a parent gives its content, and its end edge. */
  const inner = (p: El): { end: number; space: number } => {
    const r = p.getBoundingClientRect();
    const cs = g.getComputedStyle(p);
    const left = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const right = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
    return { end: rtl ? left : right, space: Math.max(0, right - left) };
  };
  /** How far a box sticks out of an end edge. */
  const beyond = (r: R, end: number): number => (rtl ? end - r.left : r.right - end);

  const clipped = new Map<El, boolean>();
  /** True when an ancestor other than the body clips or scrolls its content sideways, so the element cannot widen the page. */
  const inClip = (e: El): boolean => {
    const p = e.parentElement;
    if (!p || p === body || p === de) return false;
    const known = clipped.get(p);
    if (known !== undefined) return known;
    const value = CLIPS.includes(g.getComputedStyle(p).overflowX) || inClip(p);
    clipped.set(p, value);
    return value;
  };

  const ids = new Map<El, string>();
  const counts: Record<string, number> = {};
  const nodes = body.querySelectorAll('*');
  const limit = Math.min(nodes.length, args.maxElements);
  for (let i = 0; i < limit; i++) {
    const e = nodes[i];
    if (!e) continue;
    const k = e.tagName.toLowerCase();
    const n = counts[k] ?? 0;
    counts[k] = n + 1;
    ids.set(e, `${k}${e.id ? '#' + e.id : ''}[${n}]`);
  }
  ids.set(body, 'body');
  const idOf = (e: El): string => ids.get(e) ?? e.tagName.toLowerCase();

  const origins: OverflowOrigin[] = [];
  const regions: OverflowRegion[] = [];
  let originCount = 0;
  let regionCount = 0;
  let examined = 0;
  const textDone = new Set<El>();

  const describe = (e: El, r: R, cs: Cs, text: boolean, word: string, textPast = 0): OverflowOrigin => {
    const tag = e.tagName.toLowerCase();
    const p = e.parentElement;
    const box = p ? inner(p) : { end: rtl ? 0 : vw, space: vw };
    const pcs = p ? g.getComputedStyle(p) : null;
    const flexRow = pcs !== null && (pcs.display === 'flex' || pcs.display === 'inline-flex') && pcs.flexWrap === 'nowrap' && !pcs.flexDirection.startsWith('column');
    let grid: number | null = null;
    if (pcs !== null && (pcs.display === 'grid' || pcs.display === 'inline-grid')) {
      const tracks = pcs.gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
      if (tracks.length > 0 && tracks.every((t) => /^\d*\.?\d+px$/.test(t))) {
        grid = tracks.reduce((sum, t) => sum + parseFloat(t), 0) + px(pcs.columnGap) * (tracks.length - 1);
      }
    }
    return {
      id: idOf(e),
      tag,
      parentId: p ? idOf(p) : '',
      overPx: Math.ceil(text ? textPast : past(r)),
      widthPx: Math.round(r.width),
      spacePx: Math.round(text ? inner(e).space : box.space),
      display: cs.display,
      position: cs.position,
      whiteSpace: cs.whiteSpace,
      floated: (cs.cssFloat ?? 'none') !== 'none',
      minWidthPx: /px$/.test(cs.minWidth) ? Math.round(px(cs.minWidth)) : 0,
      parentFlexNoWrap: flexRow,
      parentGridPx: grid === null ? null : Math.round(grid),
      replaced: REPLACED.includes(tag),
      tableLike: tag === 'table' || cs.display === 'table' || cs.display === 'inline-table',
      text,
      word: word.length > 40 ? `${word.slice(0, 39)}…` : word,
      wordChars: word.length,
      shifted: !text && r.width <= box.space + EDGE,
    };
  };

  if (pageScrolls) {
    const br = body.getBoundingClientRect();
    if (past(br) > EDGE) {
      originCount++;
      origins.push({ ...describe(body, br, g.getComputedStyle(body), false, ''), spacePx: vw, parentId: '', shifted: br.width <= vw + EDGE });
    }
  }

  for (let i = 0; i < limit; i++) {
    const e = nodes[i];
    if (!e) continue;
    const tag = e.tagName.toLowerCase();
    if (SKIP.includes(tag)) continue;
    const cs = g.getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    examined++;

    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1) {
      regionCount++;
      if (regions.length < args.keep) {
        let textBlock = false;
        const blocks = e.querySelectorAll('p,li,dd,blockquote,h1,h2,h3,h4,h5,h6');
        for (let b = 0; b < blocks.length && !textBlock; b++) {
          const block = blocks[b];
          if (!block || (block.closest && block.closest('table,pre') !== null)) continue;
          if (block.getBoundingClientRect().width > e.clientWidth + 1 || block.scrollWidth > block.clientWidth + 1) textBlock = true;
        }
        regions.push({
          id: idOf(e),
          tag,
          contentPx: Math.round(e.scrollWidth),
          spacePx: Math.round(e.clientWidth),
          table: tag === 'table' || e.querySelector('table,[role="table"],[role="grid"],[role="treegrid"]') !== null,
          pre: tag === 'pre' || e.querySelector('pre,code,samp,kbd') !== null,
          media: e.querySelector('img,svg,canvas,video,iframe,object,embed,[role="img"],[role="application"]') !== null,
          textBlock,
          role: (e.getAttribute('role') ?? '').toLowerCase(),
          keyboard: (e.tabIndex ?? -1) >= 0 || e.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])') !== null,
        });
      }
    }

    if (!pageScrolls || inClip(e)) continue;
    const p = e.parentElement;
    if (!p) continue;

    // The box of an inline element is the box of its text, and text is looked at with its block below.
    const boxed = cs.display !== 'inline' || REPLACED.includes(tag);
    if (boxed && past(r) > EDGE && beyond(r, inner(p).end) > EDGE) {
      // A child of an origin that is as wide as its parent is wide because of the parent. One that sticks out of it starts overflow of its own.
      originCount++;
      if (origins.length < args.keep) origins.push(describe(e, r, cs, false, ''));
      continue;
    }

    // Text that runs past the edge of its own block: a word that cannot break, or text that may not wrap.
    if (!g.document.createRange || cs.display === 'inline' || cs.display === 'contents' || textDone.has(e)) continue;
    if (cs.overflowX !== 'visible') continue;
    let longest = '';
    let over = false;
    let furthest = 0;
    const own = inner(e);
    const walk = (el: El): void => {
      for (let c = 0; c < el.childNodes.length; c++) {
        const node = el.childNodes[c];
        if (!node) continue;
        if (node.nodeType === 3) {
          const t = node.textContent ?? '';
          if (t.trim() === '') continue;
          const range = (g.document.createRange as NonNullable<G['document']['createRange']>)();
          range.selectNodeContents(node);
          const tr = range.getBoundingClientRect();
          if (tr.width > 0 && past(tr) > EDGE && beyond(tr, own.end) > EDGE) {
            over = true;
            furthest = Math.max(furthest, past(tr));
            for (const w of t.split(/\s+/)) if (w.length > longest.length) longest = w;
          }
        } else if (node.nodeType === 1) {
          // Text of inline children belongs to this block. A child that is a block of its own is looked at in its turn.
          const child = node as unknown as El;
          const d = g.getComputedStyle(child).display;
          if (d === 'inline' || d === 'contents') walk(child);
        }
      }
    };
    walk(e);
    if (over) {
      textDone.add(e);
      originCount++;
      if (origins.length < args.keep) origins.push(describe(e, r, cs, true, longest, furthest));
    }
  }

  return { pageScrolls, viewportPx: vw, rtl, examined, origins, originCount, regions, regionCount, truncated: nodes.length > limit };
}
