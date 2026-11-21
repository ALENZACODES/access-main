import { t, type CheckResult } from './types.js';

/**
 * Landmarks (WCAG 1.3.1, and the ARIA guidance that all page content sits in a
 * landmark). Screen reader users move between landmarks to skip to the part
 * they want, and text outside every landmark is missed by that way of moving.
 * The check counts text blocks and controls that have no landmark above them.
 * Whether a block belongs in a landmark is a judgement, so the finding is
 * UNKNOWN. A page with no landmark at all is the static-html main rule.
 */

export interface RegionFacts {
  /** Landmark elements on the page. */
  readonly landmarks: number;
  /** Text blocks and controls looked at. */
  readonly checked: number;
  /** Ids of the first ones with no landmark above them. */
  readonly outside: readonly string[];
  /** How many there were in all, which can be more than the ids kept. */
  readonly outsideCount: number;
  readonly truncated: boolean;
}

export const EMPTY_REGIONS: RegionFacts = { landmarks: 0, checked: 0, outside: [], outsideCount: 0, truncated: false };

/** Ids kept in the facts. */
export const KEEP_OUTSIDE = 5;

/** Runs in the page (serialised by evaluate). Reads only. */
export function regionsInPage(args: { readonly maxElements: number; readonly selector: string }): RegionFacts {
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
    document: { querySelectorAll(s: string): ArrayLike<El>; body: { querySelectorAll(s: string): ArrayLike<El> } };
    getComputedStyle(e: El): Cs;
  }
  const g = globalThis as unknown as G;
  const LANDMARK_TAGS = ['nav', 'main', 'aside', 'footer', 'header'];
  const LANDMARK_ROLES = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'search', 'form'];
  const isLandmark = (e: El): boolean => {
    const role = (e.getAttribute('role') ?? '').toLowerCase();
    if (role !== '') return LANDMARK_ROLES.includes(role);
    const tag = e.tagName.toLowerCase();
    if (LANDMARK_TAGS.includes(tag)) return true;
    return (tag === 'section' || tag === 'form') && (e.getAttribute('aria-label') ?? e.getAttribute('aria-labelledby') ?? '').trim() !== '';
  };
  const interactive = new Set<El>();
  const found = g.document.querySelectorAll(args.selector);
  for (let i = 0; i < found.length; i++) {
    const f = found[i];
    if (f) interactive.add(f);
  }
  const nodes = g.document.body.querySelectorAll('*');
  const counts: Record<string, number> = {};
  const outside: string[] = [];
  let outsideCount = 0;
  let landmarks = 0;
  let checked = 0;
  let truncated = false;
  const SKIP = ['script', 'style', 'noscript', 'svg', 'template'];
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
    if (SKIP.includes(k)) continue;
    if (isLandmark(e)) landmarks++;
    let own = '';
    for (let c = 0; c < e.childNodes.length; c++) {
      const node = e.childNodes[c];
      if (node && node.nodeType === 3) own += ' ' + (node.textContent ?? '');
    }
    const hasText = own.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length >= 3;
    if (!hasText && !interactive.has(e)) continue;
    let hidden = false;
    let inside = false;
    for (let p: El | null = e; p; p = p.parentElement) {
      const cs = g.getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        hidden = true;
        break;
      }
      if (p !== e && isLandmark(p)) inside = true;
      if (p === e && isLandmark(e)) inside = true;
    }
    if (hidden) continue;
    checked++;
    if (!inside) {
      outsideCount++;
      if (outside.length < 5) outside.push(`${k}${e.id ? '#' + e.id : ''}[${n}]`);
    }
  }
  return { landmarks, checked, outside, outsideCount, truncated };
}

export function auditRegions(f: RegionFacts): CheckResult {
  if (f.landmarks === 0 || f.outsideCount === 0) return { checked: f.checked, entries: [] };
  const first = f.outside[0] ?? '';
  const n = f.outsideCount;
  return {
    checked: f.checked,
    entries: [
      {
        check: 'regions',
        id: first,
        status: 'unknown',
        rule: 'outside-landmark',
        message: t(
          `${n} text block${n === 1 ? '' : 's'} or control${n === 1 ? '' : 's'} sit${n === 1 ? 's' : ''} outside every landmark (first: ${first}). Screen reader users who jump between landmarks will miss ${n === 1 ? 'it' : 'them'}. Put the content in header, nav, main or footer.`,
          `${n} bloc${n === 1 ? '' : 's'} de texte ou contrôle${n === 1 ? '' : 's'} se trouve${n === 1 ? '' : 'nt'} hors de tout repère (premier\u00A0: ${first}). Les personnes qui sautent d’un repère à l’autre au lecteur d’écran ${n === 1 ? 'le' : 'les'} manqueront. Placez le contenu dans header, nav, main ou footer.`,
        ),
      },
    ],
  };
}
