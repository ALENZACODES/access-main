/**
 * Facts about the structure of the rendered page that the timing, table,
 * frame, bypass, link and image checks read: tables, frames and embeds,
 * moving or timed content, the skip link, links and images. One pass
 * over the document, run in the browser, so it must not use anything outside
 * its own body. The checks themselves are pure and live in their own files.
 */

export interface TableFact {
  readonly id: string;
  readonly rows: number;
  readonly cols: number;
  /** Header cells (th) that hold text or a name. */
  readonly headers: number;
  /** Header cells with neither text nor a name. */
  readonly emptyHeaders: number;
  readonly caption: boolean;
  /** A caption, aria-label, aria-labelledby or title gives the table a name. */
  readonly named: boolean;
  readonly role: string;
  /** Header cells that carry scope or headers attributes. */
  readonly scoped: number;
  /** Any cell uses colspan or rowspan above 1. */
  readonly spans: boolean;
  /** The table sits inside another table. */
  readonly nested: boolean;
}

export type FrameTag = 'iframe' | 'canvas' | 'object' | 'embed';

export interface FrameFact {
  readonly id: string;
  readonly tag: FrameTag;
  /** Name from title, aria-label or aria-labelledby, empty when there is none. */
  readonly name: string;
  readonly role: string;
  /** aria-hidden, or a presentation or none role. */
  readonly decorative: boolean;
  /** Text inside the element that a person without the content would get. */
  readonly fallback: boolean;
  /** Host of the frame source, empty when it has none. */
  readonly host: string;
}

export interface CarouselFact {
  readonly id: string;
  /** A control inside it is named pause, stop or the French equivalent. */
  readonly pause: boolean;
}

export interface TimingFacts {
  /** Ids of marquee and blink elements. */
  readonly marquee: readonly string[];
  /** Ids of elements whose computed text decoration blinks. */
  readonly blink: readonly string[];
  readonly carousels: readonly CarouselFact[];
  /** Ids of elements whose text speaks of a time limit. */
  readonly expiry: readonly string[];
}

export interface BypassFacts {
  readonly mains: number;
  /** Ids of the visible headings of level 1. */
  readonly h1: readonly string[];
  /** Links and buttons that come before the first main landmark. */
  readonly controlsBeforeMain: number;
  readonly skip: { readonly id: string; readonly first: boolean; readonly targetFound: boolean } | null;
}

export interface AnchorFact {
  readonly id: string;
  /** Link text, or aria-label, title or the alt of an image inside it. */
  readonly name: string;
  /** The href attribute as written. */
  readonly href: string;
  readonly newTab: boolean;
  /** The name or title says the link opens a new tab or window. */
  readonly announcesNewTab: boolean;
  /** The link goes to a file (download attribute or a document extension). */
  readonly file: string | null;
  /** The name says the kind of file or that it is a download. */
  readonly announcesFile: boolean;
}

export interface PictureFact {
  readonly id: string;
  /** The alt attribute, or null when the image has none. */
  readonly alt: string | null;
  /** The browser finished loading and found no image. */
  readonly broken: boolean;
  /** Text of the link around the image, empty when it is not in a link. */
  readonly linkText: string;
}

export interface StructureFacts {
  readonly tables: readonly TableFact[];
  readonly frames: readonly FrameFact[];
  readonly timing: TimingFacts;
  readonly bypass: BypassFacts;
  readonly links: readonly AnchorFact[];
  readonly images: readonly PictureFact[];
  readonly truncated: boolean;
}

export const EMPTY_STRUCTURE: StructureFacts = {
  tables: [],
  frames: [],
  timing: { marquee: [], blink: [], carousels: [], expiry: [] },
  bypass: { mains: 0, h1: [], controlsBeforeMain: 0, skip: null },
  links: [],
  images: [],
  truncated: false,
};

/** Runs in the page. Reads, never writes. */
export function structureInPage(args: { readonly maxElements: number }): StructureFacts {
  interface Cs {
    display: string;
    visibility: string;
    textDecorationLine?: string;
  }
  interface N {
    nodeType: number;
    textContent: string | null;
  }
  interface El {
    id: string;
    tagName: string;
    complete?: boolean;
    naturalWidth?: number;
    parentElement: El | null;
    childNodes: ArrayLike<N>;
    textContent: string | null;
    getAttribute(n: string): string | null;
  }
  interface G {
    document: {
      body: { querySelectorAll(s: string): ArrayLike<El> };
      getElementById(id: string): El | null;
    };
    getComputedStyle(e: El): Cs;
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
    const own = cs.display === 'none' || cs.visibility === 'hidden' || attr(e, 'aria-hidden') === 'true';
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
  const nameOf = (e: El): string => {
    const by = attr(e, 'aria-labelledby');
    if (by) {
      const text = by
        .split(/\s+/)
        .map((id) => flat(g.document.getElementById(id)?.textContent ?? ''))
        .join(' ')
        .trim();
      if (text !== '') return text;
    }
    return attr(e, 'aria-label') || attr(e, 'title');
  };
  const inside = (e: El, root: El): boolean => {
    for (let p: El | null = e.parentElement; p; p = p.parentElement) if (p === root) return true;
    return false;
  };
  const ancestorTag = (e: El, name: string): El | null => {
    for (let p = e.parentElement; p; p = p.parentElement) if (tag(p) === name) return p;
    return null;
  };
  const hostOf = (src: string): string => {
    const m = /^(?:https?:)?\/\/(?:www\.)?([^/:?#]+)/i.exec(src);
    return (m?.[1] ?? '').toLowerCase();
  };

  const tables: TableFact[] = [];
  const frames: FrameFact[] = [];
  const marquee: string[] = [];
  const blink: string[] = [];
  const carousels: CarouselFact[] = [];
  const expiry: string[] = [];
  const links: AnchorFact[] = [];
  const images: PictureFact[] = [];
  const h1: string[] = [];
  let mains = 0;
  let controlsBeforeMain = 0;
  let seenMain = false;
  let firstControl: El | null = null;
  let skipLink: El | null = null;
  const SKIP = /skip|aller au|passer au|contenu principal|main content/i;
  const PAUSE = /pause|stop|arr[êe]t|suspend/i;
  const LIMIT = /(session|page|you|vous).{0,40}(expire|timed? out|logged out|signed out|d[ée]connect|expir)|time limit|d[ée]lai (d’|d')?expir|minutes? (left|remaining|restantes?)/i;
  const CAROUSEL = /(^|[\s_-])(carousel|slider|slideshow|rotator|swiper|slick)([\s_-]|$)/;

  for (const e of all) {
    const k = tag(e);
    const role = attr(e, 'role').toLowerCase();
    const gone = hidden(e);
    if (gone) continue;
    const id = idOf(e);

    const isControl = k === 'button' || (k === 'a' && has(e, 'href')) || k === 'input' || k === 'select' || k === 'textarea';
    if (isControl && !firstControl) firstControl = e;
    if (k === 'main' || role === 'main') {
      mains++;
      seenMain = true;
    } else if (isControl && !seenMain && (k === 'a' || k === 'button')) {
      controlsBeforeMain++;
    }
    if (k === 'a' && !skipLink && /^#./.test(attr(e, 'href')) && SKIP.test(flat(e.textContent) + ' ' + attr(e, 'aria-label'))) skipLink = e;

    if (k === 'h1' || (role === 'heading' && attr(e, 'aria-level') === '1')) h1.push(id);

    if (k === 'a' && has(e, 'href') && links.length < 400) {
      const imgAlt = (() => {
        for (const c of all) if (tag(c) === 'img' && inside(c, e)) return attr(c, 'alt');
        return '';
      })();
      const name = flat(e.textContent) || attr(e, 'aria-label') || attr(e, 'title') || imgAlt;
      const said = `${name} ${attr(e, 'aria-label')} ${attr(e, 'title')}`;
      const href = attr(e, 'href');
      const ext = /\.(pdf|docx?|xlsx?|pptx?|zip|csv|epub)(?:[?#].*)?$/i.exec(href);
      links.push({
        id,
        name,
        href,
        newTab: attr(e, 'target').toLowerCase() === '_blank',
        announcesNewTab: /new (tab|window)|nouvel onglet|nouvelle fen[êe]tre|external|externe/i.test(said),
        file: has(e, 'download') ? (ext?.[1]?.toLowerCase() ?? 'file') : (ext?.[1]?.toLowerCase() ?? null),
        announcesFile: /pdf|word|excel|powerpoint|zip|csv|epub|download|t[ée]l[ée]charg|\bfile\b|fichier|document|doc\b|xls|ppt/i.test(said),
      });
    }
    if (k === 'img') {
      let linkText = '';
      const parent = ancestorTag(e, 'a');
      if (parent) linkText = flat(parent.textContent);
      const src = attr(e, 'src');
      images.push({
        id,
        alt: e.getAttribute('alt'),
        broken: src !== '' && e.complete === true && e.naturalWidth === 0,
        linkText,
      });
    }

    if (k === 'table') {
      const rowEls: El[] = [];
      let cols = 0;
      let headersN = 0;
      let empty = 0;
      let scoped = 0;
      let spans = false;
      let caption = false;
      for (const c of all) {
        if (c === e || !inside(c, e) || ancestorTag(c, 'table') !== e) continue;
        const ck = tag(c);
        if (ck === 'caption' && flat(c.textContent) !== '') caption = true;
        if (ck === 'tr') rowEls.push(c);
        if (ck === 'th' || ck === 'td') {
          if (parseInt(attr(c, 'colspan'), 10) > 1 || parseInt(attr(c, 'rowspan'), 10) > 1) spans = true;
        }
        if (ck === 'th') {
          if (flat(c.textContent) !== '' || nameOf(c) !== '') headersN++;
          else empty++;
          if (has(c, 'scope') || has(c, 'headers') || has(c, 'id')) scoped++;
        }
      }
      for (const r of rowEls) {
        let n = 0;
        for (const c of all) if (c.parentElement === r && (tag(c) === 'td' || tag(c) === 'th')) n++;
        if (n > cols) cols = n;
      }
      tables.push({
        id,
        rows: rowEls.length,
        cols,
        headers: headersN,
        emptyHeaders: empty,
        caption,
        named: caption || nameOf(e) !== '',
        role,
        scoped,
        spans,
        nested: ancestorTag(e, 'table') !== null,
      });
    }

    if (k === 'iframe' || k === 'canvas' || k === 'object' || k === 'embed') {
      frames.push({
        id,
        tag: k,
        name: nameOf(e),
        role,
        decorative: role === 'presentation' || role === 'none',
        fallback: flat(e.textContent) !== '',
        host: hostOf(attr(e, 'src') || attr(e, 'data')),
      });
    }

    if (k === 'marquee' || k === 'blink') marquee.push(id);
    const cs = g.getComputedStyle(e);
    if ((cs.textDecorationLine ?? '').includes('blink')) blink.push(id);
    if (CAROUSEL.test(`${e.id} ${attr(e, 'class')} ${attr(e, 'aria-roledescription')}`.toLowerCase())) {
      let pause = false;
      for (const c of all) {
        if (c !== e && inside(c, e) && (tag(c) === 'button' || tag(c) === 'a' || attr(c, 'role') === 'button') && PAUSE.test(`${flat(c.textContent)} ${attr(c, 'aria-label')} ${attr(c, 'title')}`)) pause = true;
      }
      carousels.push({ id, pause });
    }
    const own = ownText(e);
    if (own !== '' && own.length < 400 && LIMIT.test(own)) expiry.push(id);
  }

  let skip: BypassFacts['skip'] = null;
  const sl: El | null = skipLink;
  if (sl) {
    const target = attr(sl, 'href').slice(1);
    skip = { id: idOf(sl), first: firstControl === sl, targetFound: g.document.getElementById(decodeURIComponent(target)) !== null };
  }

  return {
    tables,
    frames,
    timing: { marquee, blink, carousels, expiry },
    bypass: { mains, h1, controlsBeforeMain, skip },
    links,
    images,
    truncated: nodes.length > args.maxElements,
  };
}
