import { OVERFLOW_ARGS, overflowInPage, type OverflowArgs, type OverflowFacts, type OverflowOrigin, type OverflowRegion } from './overflow-inpage.js';

/**
 * Test support for the overflow probe: origins and regions written by hand,
 * and a small stand-in for a laid-out document, with boxes given as numbers,
 * so the probe can be driven without a browser.
 */

export function originOf(over: Partial<OverflowOrigin> = {}): OverflowOrigin {
  return {
    id: 'div#card[0]',
    tag: 'div',
    parentId: 'body',
    overPx: 280,
    widthPx: 600,
    spacePx: 320,
    display: 'block',
    position: 'static',
    whiteSpace: 'normal',
    floated: false,
    minWidthPx: 0,
    parentFlexNoWrap: false,
    parentGridPx: null,
    replaced: false,
    tableLike: false,
    text: false,
    word: '',
    wordChars: 0,
    shifted: false,
    ...over,
  };
}

export function regionOf(over: Partial<OverflowRegion> = {}): OverflowRegion {
  return { id: 'div#scroller[0]', tag: 'div', contentPx: 600, spacePx: 320, table: false, pre: false, media: false, textBlock: false, role: '', keyboard: true, ...over };
}

export function factsOf(over: Partial<OverflowFacts> = {}): OverflowFacts {
  const origins = over.origins ?? [];
  const regions = over.regions ?? [];
  return { pageScrolls: origins.length > 0, viewportPx: 320, rtl: false, examined: 40, origins, originCount: origins.length, regions, regionCount: regions.length, truncated: false, ...over };
}

// ---------------------------------------------------------------- a document with boxes

type Style = Readonly<Record<string, string>>;

const DEFAULT_STYLE: Style = {
  display: 'block',
  visibility: 'visible',
  position: 'static',
  whiteSpace: 'normal',
  overflowX: 'visible',
  minWidth: 'auto',
  direction: 'ltr',
  flexWrap: 'nowrap',
  flexDirection: 'row',
  gridTemplateColumns: 'none',
  columnGap: 'normal',
  cssFloat: 'none',
  paddingLeft: '0px',
  paddingRight: '0px',
  borderLeftWidth: '0px',
  borderRightWidth: '0px',
};

interface Rect {
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface FakeText {
  readonly nodeType: 3;
  readonly textContent: string;
  readonly rect: Rect;
}

export interface FakeEl {
  readonly nodeType: 1;
  readonly id: string;
  readonly tagName: string;
  readonly tabIndex: number;
  parentElement: FakeEl | null;
  readonly childNodes: Array<FakeEl | FakeText>;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly style: Style;
  readonly attrs: Readonly<Record<string, string>>;
  getAttribute(n: string): string | null;
  getBoundingClientRect(): Rect;
  querySelector(s: string): FakeEl | null;
  querySelectorAll(s: string): FakeEl[];
  closest(s: string): FakeEl | null;
}

export interface BoxSpec {
  readonly id?: string;
  /** Left and right edge, in CSS pixels from the left of the page. */
  readonly at?: readonly [number, number];
  readonly height?: number;
  readonly style?: Style;
  readonly attrs?: Readonly<Record<string, string>>;
  /** Defaults to the width of the box. */
  readonly scrollWidth?: number;
  readonly clientWidth?: number;
  readonly tabIndex?: number;
}

const rectOf = (left: number, right: number, height = 20): Rect => ({ left, right, width: right - left, height });

/** A run of text with the box its glyphs take. */
export function text(content: string, at: readonly [number, number]): FakeText {
  return { nodeType: 3, textContent: content, rect: rectOf(at[0], at[1]) };
}

function matchesOne(e: FakeEl, selector: string): boolean {
  const m = /^([a-z0-9]*)((?:\[[^\]]+\])*)(?::not\((\[[^\]]+\])\))?$/i.exec(selector.trim());
  if (!m) throw new Error(`the stand-in document does not read the selector ${selector}`);
  const attr = (cond: string): boolean => {
    const a = /^\[([a-z-]+)(?:="([^"]*)")?\]$/i.exec(cond);
    if (!a) throw new Error(`the stand-in document does not read ${cond}`);
    const value = e.getAttribute(a[1] ?? '');
    return a[2] === undefined ? value !== null : value === a[2];
  };
  if (m[1] && m[1] !== '*' && e.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
  for (const cond of (m[2] ?? '').match(/\[[^\]]+\]/g) ?? []) if (!attr(cond)) return false;
  return m[3] ? !attr(m[3]) : true;
}

const matches = (e: FakeEl, selector: string): boolean => selector.split(',').some((s) => (s.trim() === '*' ? true : matchesOne(e, s)));

/** An element with a box. Children are elements or runs of text. */
export function box(tag: string, spec: BoxSpec = {}, children: ReadonlyArray<FakeEl | FakeText> = []): FakeEl {
  const [left, right] = spec.at ?? [0, 320];
  const rect = rectOf(left, right, spec.height ?? 20);
  const attrs = { ...(spec.attrs ?? {}) };
  const descendants = (root: FakeEl): FakeEl[] => root.childNodes.flatMap((c) => (c.nodeType === 1 ? [c, ...descendants(c)] : []));
  const e: FakeEl = {
    nodeType: 1,
    id: spec.id ?? '',
    tagName: tag.toUpperCase(),
    tabIndex: spec.tabIndex ?? (attrs['tabindex'] !== undefined ? Number(attrs['tabindex']) : ['a', 'button', 'input', 'select', 'textarea'].includes(tag) ? 0 : -1),
    parentElement: null,
    childNodes: [...children],
    scrollWidth: spec.scrollWidth ?? rect.width,
    clientWidth: spec.clientWidth ?? rect.width,
    style: { ...DEFAULT_STYLE, ...(tag === 'span' || tag === 'a' || tag === 'strong' || tag === 'code' ? { display: 'inline' } : {}), ...(spec.style ?? {}) },
    attrs,
    getAttribute: (n) => attrs[n] ?? null,
    getBoundingClientRect: () => rect,
    querySelector: (s) => descendants(e).find((d) => matches(d, s)) ?? null,
    querySelectorAll: (s) => descendants(e).filter((d) => matches(d, s)),
    closest: (s) => {
      for (let p: FakeEl | null = e; p; p = p.parentElement) if (matches(p, s)) return p;
      return null;
    },
  };
  for (const c of e.childNodes) if (c.nodeType === 1) c.parentElement = e;
  return e;
}

export interface PageSpec {
  /** Width of the page area. Default 320. */
  readonly viewport?: number;
  /** Width of everything on the page. Defaults to the furthest right edge of any box or text. */
  readonly scrollWidth?: number;
  readonly dir?: 'rtl';
  readonly bodyAt?: readonly [number, number];
  readonly bodyStyle?: Style;
  readonly scrollX?: number;
  /** Leave out `createRange`, as a very old browser would. */
  readonly noRange?: boolean;
}

/** Runs the probe on a document made of the given boxes, and puts the globals back afterwards. */
export function probe(children: ReadonlyArray<FakeEl | FakeText>, page: PageSpec = {}, args: OverflowArgs = OVERFLOW_ARGS): OverflowFacts {
  const viewport = page.viewport ?? 320;
  const dir: Style = page.dir === 'rtl' ? { direction: 'rtl' } : {};
  const body = box('body', { at: page.bodyAt ?? [0, viewport], style: { ...dir, ...(page.bodyStyle ?? {}) } }, children);
  const edges = (e: FakeEl): number[] => [e.getBoundingClientRect().right, ...e.childNodes.flatMap((c) => (c.nodeType === 1 ? edges(c) : [c.rect.right]))];
  const lefts = (e: FakeEl): number[] => [e.getBoundingClientRect().left, ...e.childNodes.flatMap((c) => (c.nodeType === 1 ? lefts(c) : [c.rect.left]))];
  const reach = page.dir === 'rtl' ? viewport - Math.min(0, ...lefts(body)) : Math.max(viewport, ...edges(body));
  const html = box('html', { at: [0, viewport], scrollWidth: page.scrollWidth ?? reach, clientWidth: viewport, style: dir }, [body]);
  const g = globalThis as unknown as Record<string, unknown>;
  const keys = ['document', 'getComputedStyle', 'scrollX'];
  const before = keys.map((k) => [k, k in g, g[k]] as const);
  g['document'] = {
    documentElement: html,
    body,
    ...(page.noRange
      ? {}
      : {
          createRange: () => {
            let node: FakeText | null = null;
            return {
              selectNodeContents: (n: FakeText) => {
                node = n;
              },
              getBoundingClientRect: () => node?.rect ?? rectOf(0, 0, 0),
            };
          },
        }),
  };
  g['getComputedStyle'] = (e: FakeEl) => e.style;
  g['scrollX'] = page.scrollX ?? 0;
  try {
    return overflowInPage(args);
  } finally {
    for (const [k, had, value] of before) {
      if (had) g[k] = value;
      else delete g[k];
    }
  }
}
