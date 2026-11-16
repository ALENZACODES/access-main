import { composite, contrastRatio, parseColor, resolveBackground, type Rgba } from './contrast.js';
import { clip, num, t, type CheckResult, type Entry } from './types.js';

/**
 * Page probes for four more criteria, and the facts that the cross-page checks
 * read: link cues (1.4.1), the boundary of form fields (1.4.11), dragging
 * (2.5.7), and where navigation and help sit (3.2.3, 3.2.6). The in-page
 * function reads styles and layout only and changes nothing.
 */

export interface LinkFact {
  readonly id: string;
  readonly text: string;
  readonly color: string;
  readonly parentColor: string;
  readonly decoration: string;
  readonly weight: number;
  readonly parentWeight: number;
  readonly borderBottomWidth: number;
  /** Background layers behind the link, from the element outwards. Unused when the colours are enough. */
  readonly bgLayers: readonly string[];
  readonly bgImage: boolean;
}

export interface SideFact {
  readonly color: string;
  readonly width: number;
}

export interface ControlFact {
  readonly id: string;
  readonly fill: string;
  readonly sides: readonly SideFact[];
  /** Background layers of the parent, the colour the field sits on. */
  readonly bgLayers: readonly string[];
  readonly bgImage: boolean;
}

export type Region = 'header' | 'nav' | 'main' | 'aside' | 'footer' | 'body';

export interface PageFacts {
  readonly title: string;
  readonly lang: string;
  readonly links: readonly LinkFact[];
  readonly controls: readonly ControlFact[];
  readonly draggables: readonly string[];
  /** Text of the links inside navigation landmarks, in document order. */
  readonly nav: readonly string[];
  /** The first help or contact control on the page, if any. */
  readonly help: { readonly text: string; readonly region: Region; readonly afterMain: boolean } | null;
  readonly truncated: boolean;
}

export const HELP_WORDS = /\b(help|aide|support|assistance|contact|contactez)\b/i;

export function probesInPage(args: { readonly maxElements: number; readonly helpPattern: string }): PageFacts {
  interface Cs {
    display: string;
    visibility: string;
    color: string;
    backgroundColor: string;
    backgroundImage: string;
    fontWeight: string;
    textDecorationLine: string;
    borderTopColor: string;
    borderTopWidth: string;
    borderRightColor: string;
    borderRightWidth: string;
    borderBottomColor: string;
    borderBottomWidth: string;
    borderLeftColor: string;
    borderLeftWidth: string;
  }
  interface El {
    id: string;
    tagName: string;
    parentElement: El | null;
    textContent: string | null;
    childNodes: ArrayLike<{ nodeType: number; textContent: string | null }>;
    getAttribute(n: string): string | null;
  }
  interface G {
    document: { title?: string; body: { querySelectorAll(s: string): ArrayLike<El> }; documentElement: { getAttribute(n: string): string | null } };
    getComputedStyle(e: El): Cs;
  }
  const g = globalThis as unknown as G;
  const flat = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const attr = (e: El, n: string): string => (e.getAttribute(n) ?? '').trim();
  const tag = (e: El): string => e.tagName.toLowerCase();
  const all: El[] = [];
  const nodes = g.document.body.querySelectorAll('*');
  const truncated = nodes.length > args.maxElements;
  for (let i = 0; i < nodes.length && i < args.maxElements; i++) {
    const n = nodes[i];
    if (n) all.push(n);
  }
  const shown = (e: El): boolean => {
    for (let p: El | null = e; p; p = p.parentElement) {
      const cs = g.getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
  };
  const num = (s: string): number => Number.parseFloat(s) || 0;
  const layersOf = (start: El | null): { layers: string[]; image: boolean } => {
    const layers: string[] = [];
    let image = false;
    for (let p = start; p; p = p.parentElement) {
      const cs = g.getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') image = true;
      layers.push(cs.backgroundColor);
      const m = /^rgba?\(([^)]*)\)$/.exec(cs.backgroundColor.trim().toLowerCase());
      const parts = m ? (m[1] ?? '').split(/[\s,/]+/).filter(Boolean) : [];
      const opaque = cs.backgroundColor.trim().toLowerCase().startsWith('#') || (m !== null && (parts.length === 3 || parts[3] === '1'));
      if (opaque) break;
    }
    return { layers, image };
  };
  const regionOf = (e: El): 'header' | 'nav' | 'main' | 'aside' | 'footer' | 'body' => {
    for (let p: El | null = e; p; p = p.parentElement) {
      const role = attr(p, 'role');
      const t0 = tag(p);
      if (t0 === 'nav' || role === 'navigation') return 'nav';
      if (t0 === 'header' || role === 'banner') return 'header';
      if (t0 === 'footer' || role === 'contentinfo') return 'footer';
      if (t0 === 'aside' || role === 'complementary') return 'aside';
      if (t0 === 'main' || role === 'main') return 'main';
    }
    return 'body';
  };
  const helpRe = new RegExp(args.helpPattern, 'i');
  const links: LinkFact[] = [];
  const controls: ControlFact[] = [];
  const draggables: string[] = [];
  const nav: string[] = [];
  let help: PageFactsHelp | null = null;
  interface PageFactsHelp {
    text: string;
    region: 'header' | 'nav' | 'main' | 'aside' | 'footer' | 'body';
    afterMain: boolean;
  }
  const counts: Record<string, number> = {};
  const idOf = (e: El): string => {
    const k = tag(e);
    const n = counts[k] ?? 0;
    counts[k] = n + 1;
    return `${k}${e.id ? '#' + e.id : ''}[${n}]`;
  };
  let seenMain = false;
  const TEXT_TYPES = ['text', 'email', 'tel', 'password', 'search', 'url', 'number', 'date', 'time', 'datetime-local', 'month', 'week', ''];
  for (const e of all) {
    const k = tag(e);
    if (regionOf(e) === 'main') seenMain = true;
    const visible = shown(e);
    const id = idOf(e);
    if (!visible) continue;
    if (attr(e, 'draggable') === 'true') draggables.push(id);
    if (k === 'a' && e.getAttribute('href') !== null) {
      const text = flat(e.textContent);
      if (regionOf(e) === 'nav' && text) nav.push(text);
      const label = text || attr(e, 'aria-label');
      if (!help && label && helpRe.test(label)) help = { text: label.slice(0, 60), region: regionOf(e), afterMain: seenMain && regionOf(e) !== 'main' };
      const parent = e.parentElement;
      if (parent && text) {
        // Text that sits directly in the parent, next to the link. A list of links has none.
        let around = '';
        for (let c = 0; c < parent.childNodes.length; c++) {
          const node = parent.childNodes[c];
          if (node && node.nodeType === 3) around += ' ' + (node.textContent ?? '');
        }
        if (flat(around).length >= 3) {
          const cs = g.getComputedStyle(e);
          const ps = g.getComputedStyle(parent);
          const bg = layersOf(e);
          links.push({
            id,
            text: text.slice(0, 40),
            color: cs.color,
            parentColor: ps.color,
            decoration: cs.textDecorationLine,
            weight: Number.parseInt(cs.fontWeight, 10) || 400,
            parentWeight: Number.parseInt(ps.fontWeight, 10) || 400,
            borderBottomWidth: num(cs.borderBottomWidth),
            bgLayers: bg.layers,
            bgImage: bg.image,
          });
        }
      }
    }
    if (k === 'button' && !help) {
      const text = flat(e.textContent) || attr(e, 'aria-label');
      if (text && helpRe.test(text)) help = { text: text.slice(0, 60), region: regionOf(e), afterMain: seenMain && regionOf(e) !== 'main' };
    }
    const type = attr(e, 'type').toLowerCase();
    if (k === 'select' || k === 'textarea' || (k === 'input' && TEXT_TYPES.includes(type))) {
      const cs = g.getComputedStyle(e);
      const bg = layersOf(e.parentElement);
      controls.push({
        id,
        fill: cs.backgroundColor,
        sides: [
          { color: cs.borderTopColor, width: num(cs.borderTopWidth) },
          { color: cs.borderRightColor, width: num(cs.borderRightWidth) },
          { color: cs.borderBottomColor, width: num(cs.borderBottomWidth) },
          { color: cs.borderLeftColor, width: num(cs.borderLeftWidth) },
        ],
        bgLayers: bg.layers,
        bgImage: bg.image,
      });
    }
  }
  return {
    title: flat(g.document.title ?? ''),
    lang: (g.document.documentElement.getAttribute('lang') ?? '').trim(),
    links,
    controls,
    draggables,
    nav,
    help,
    truncated,
  };
}

// ---------------------------------------------------------------- 1.4.1 link cue

export const LINK_CONTRAST_MIN = 3;

function opaqueOn(c: Rgba, backdrop: Rgba | null): Rgba | null {
  if (c.a >= 1) return c;
  return backdrop ? composite(c, backdrop) : null;
}

export function auditLinkCues(links: readonly LinkFact[]): CheckResult {
  const entries: Entry[] = [];
  for (const l of links) {
    const underline = l.decoration.includes('underline');
    const weightCue = Math.abs(l.weight - l.parentWeight) >= 300;
    if (underline || l.borderBottomWidth > 0 || weightCue) continue;
    const bg = l.bgImage ? null : resolveBackground(l.bgLayers);
    const a = parseColor(l.color);
    const b = parseColor(l.parentColor);
    const fa = a ? opaqueOn(a, bg) : null;
    const fb = b ? opaqueOn(b, bg) : null;
    if (!fa || !fb) {
      entries.push({
        check: 'link-cue',
        id: l.id,
        status: 'unknown',
        rule: 'colour',
        message: t(
          `The link "${clip(l.text, 24)}" has no underline and its colour could not be compared with the text around it.`,
          `Le lien «\u202F${clip(l.text, 24)}\u202F» n’est pas souligné et sa couleur n’a pas pu être comparée à celle du texte voisin.`,
        ),
      });
      continue;
    }
    const ratio = contrastRatio(fa, fb);
    if (ratio < LINK_CONTRAST_MIN) {
      entries.push({
        check: 'link-cue',
        id: l.id,
        status: 'fail',
        rule: 'colour-only',
        message: t(
          `The link "${clip(l.text, 24)}" is told apart from the text around it by colour alone, at ${num(ratio, 'en')}:1. It needs an underline or 3:1.`,
          `Le lien «\u202F${clip(l.text, 24)}\u202F» ne se distingue du texte voisin que par la couleur, à ${num(ratio, 'fr')}\u00A0:\u00A01. Il lui faut un soulignement ou 3\u00A0:\u00A01.`,
        ),
      });
    }
  }
  return { checked: links.length, entries };
}

// ---------------------------------------------------------------- 1.4.11 control boundary

export const CONTROL_CONTRAST_MIN = 3;

export function auditControlBoundaries(controls: readonly ControlFact[]): CheckResult {
  const entries: Entry[] = [];
  for (const c of controls) {
    const bg = c.bgImage ? null : resolveBackground(c.bgLayers);
    if (!bg) {
      entries.push({
        check: 'non-text-contrast',
        id: c.id,
        status: 'unknown',
        rule: 'backdrop',
        message: t('The field sits on an image or an unresolved background, so its boundary was not measured.', 'Le champ repose sur une image ou un fond indéterminé, sa bordure n’a donc pas été mesurée.'),
      });
      continue;
    }
    let best = 0;
    for (const s of c.sides) {
      if (s.width <= 0) continue;
      const col = parseColor(s.color);
      const over = col ? opaqueOn(col, bg) : null;
      if (over && col && col.a > 0) best = Math.max(best, contrastRatio(over, bg));
    }
    const fill = parseColor(c.fill);
    const filled = fill ? opaqueOn(fill, bg) : null;
    if (filled && fill && fill.a > 0) best = Math.max(best, contrastRatio(filled, bg));
    if (best < CONTROL_CONTRAST_MIN) {
      entries.push({
        check: 'non-text-contrast',
        id: c.id,
        status: 'fail',
        rule: 'boundary',
        message: t(
          `The field boundary has a contrast of ${num(best, 'en')}:1 against its background. It needs 3:1.`,
          `La bordure du champ a un contraste de ${num(best, 'fr')}\u00A0:\u00A01 avec son fond. Il lui faut 3\u00A0:\u00A01.`,
        ),
      });
    }
  }
  return { checked: controls.length, entries };
}

// ---------------------------------------------------------------- 2.5.7 dragging

export function auditDragging(ids: readonly string[]): CheckResult {
  return {
    checked: ids.length,
    entries: ids.map((id) => ({
      check: 'dragging' as const,
      id,
      status: 'unknown' as const,
      rule: 'draggable',
      message: t(
        'This element can be dragged. Check by hand that the same action works with a single tap or click.',
        'Cet élément peut être glissé. Contrôlez à la main que la même action fonctionne avec un simple toucher ou clic.',
      ),
    })),
  };
}
