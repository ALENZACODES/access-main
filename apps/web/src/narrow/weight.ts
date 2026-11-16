import { clip, num, t, type CheckResult, type Entry } from './types.js';

/**
 * How much a page asks a phone to download, and which images are far bigger
 * than they are shown. People on slow or metered connections, and on older
 * devices, feel this first. There is no WCAG limit, so by default the check
 * only asks for a look (UNKNOWN). A team that sets --max-weight-kb gets a
 * failure above its own limit.
 */

export interface ResourceWeight {
  readonly url: string;
  /** Encoded size in bytes, or null when the browser did not say (most cross-origin files). */
  readonly bytes: number | null;
  readonly kind: string;
}

export interface ImageFact {
  readonly id: string;
  readonly src: string;
  readonly naturalWidth: number;
  readonly shownWidth: number;
  readonly hasSize: boolean;
}

export interface WeightFacts {
  readonly resources: readonly ResourceWeight[];
  readonly images: readonly ImageFact[];
}

export interface WeightOptions {
  /** Fail above this many kilobytes for the page and what it loaded. Default: no failure. */
  readonly maxKb?: number;
  /** Ask for a look above this many kilobytes. Default 1500. */
  readonly softKb?: number;
  /** Ask for a look at any single image above this many kilobytes. Default 300. */
  readonly imageKb?: number;
}

export const DEFAULT_SOFT_KB = 1500;
export const DEFAULT_IMAGE_KB = 300;

/** Runs in the page. Reads the resource timing list and the images in the document. */
export function weightInPage(args: { readonly max: number }): WeightFacts {
  interface Timing {
    name: string;
    initiatorType?: string;
    encodedBodySize?: number;
  }
  interface Img {
    getAttribute(n: string): string | null;
    naturalWidth?: number;
    getBoundingClientRect(): { width: number };
  }
  interface G {
    location?: { host?: string };
    performance?: { getEntriesByType?(t: string): ArrayLike<Timing> };
    document?: { querySelectorAll?(s: string): ArrayLike<Img> };
  }
  const g = globalThis as unknown as G;
  const host = g.location?.host ?? '';
  const resources: ResourceWeight[] = [];
  const list = g.performance?.getEntriesByType?.('resource');
  for (let i = 0; list && i < list.length && resources.length < args.max; i++) {
    const e = list[i];
    if (!e) continue;
    const size = e.encodedBodySize ?? 0;
    const m = /^(?:https?:)?\/\/([^/:?#]+)/i.exec(e.name);
    const sameOrigin = !m || (m[1] ?? '').toLowerCase() === host.toLowerCase().split(':')[0];
    resources.push({ url: e.name, bytes: size > 0 ? size : sameOrigin ? 0 : null, kind: e.initiatorType ?? 'other' });
  }
  const images: ImageFact[] = [];
  const imgs = g.document?.querySelectorAll?.('img');
  for (let i = 0; imgs && i < imgs.length && images.length < args.max; i++) {
    const img = imgs[i];
    if (!img) continue;
    const w = img.getBoundingClientRect().width;
    images.push({
      id: `img[${i}]`,
      src: img.getAttribute('src') ?? '',
      naturalWidth: img.naturalWidth ?? 0,
      shownWidth: w,
      hasSize: img.getAttribute('width') !== null && img.getAttribute('height') !== null,
    });
  }
  return { resources, images };
}

const kb = (bytes: number): number => bytes / 1024;
const fileOf = (url: string): string => clip(url.split(/[?#]/)[0]?.split('/').pop() || url, 40);

export function auditWeight(facts: WeightFacts, opts: WeightOptions = {}): CheckResult {
  const entries: Entry[] = [];
  const soft = opts.softKb ?? DEFAULT_SOFT_KB;
  const imageLimit = opts.imageKb ?? DEFAULT_IMAGE_KB;
  const known = facts.resources.filter((r) => r.bytes !== null);
  const total = known.reduce((n, r) => n + (r.bytes ?? 0), 0);
  const unmeasured = facts.resources.length - known.length;
  const totalKb = kb(total);

  if (opts.maxKb !== undefined && totalKb > opts.maxKb) {
    entries.push({
      check: 'weight',
      id: 'page',
      status: 'fail',
      rule: 'page-weight',
      message: t(
        `The page and what it loads weigh ${num(totalKb, 'en', 0)} KB. The limit set for this run is ${opts.maxKb} KB.`,
        `La page et ce qu’elle charge pèsent ${num(totalKb, 'fr', 0)}\u00A0Ko. La limite fixée pour cette exécution est de ${opts.maxKb}\u00A0Ko.`,
      ),
    });
  } else if (totalKb > soft) {
    entries.push({
      check: 'weight',
      id: 'page',
      status: 'unknown',
      rule: 'page-weight-high',
      message: t(
        `The page and what it loads weigh ${num(totalKb, 'en', 0)} KB, over ${soft} KB. Check that this is fine on a slow connection.`,
        `La page et ce qu’elle charge pèsent ${num(totalKb, 'fr', 0)}\u00A0Ko, au-delà de ${soft}\u00A0Ko. Contrôlez que c’est acceptable sur une connexion lente.`,
      ),
    });
  }
  for (const r of known) {
    if (r.kind === 'img' && kb(r.bytes ?? 0) > imageLimit) {
      entries.push({
        check: 'weight',
        id: `resource:${fileOf(r.url)}`,
        status: 'unknown',
        rule: 'large-image',
        message: t(
          `The image ${fileOf(r.url)} is ${num(kb(r.bytes ?? 0), 'en', 0)} KB. Check that it cannot be smaller.`,
          `L’image ${fileOf(r.url)} fait ${num(kb(r.bytes ?? 0), 'fr', 0)}\u00A0Ko. Contrôlez qu’elle ne peut pas être plus légère.`,
        ),
      });
    }
  }
  for (const im of facts.images) {
    if (im.naturalWidth > 600 && im.shownWidth > 0 && im.naturalWidth > im.shownWidth * 3) {
      entries.push({
        check: 'weight',
        id: im.id,
        status: 'unknown',
        rule: 'oversized-image',
        message: t(
          `The image is ${im.naturalWidth}px wide but shown at ${Math.round(im.shownWidth)}px. A smaller file would do.`,
          `L’image fait ${im.naturalWidth}\u00A0px de large mais s’affiche à ${Math.round(im.shownWidth)}\u00A0px. Un fichier plus petit suffirait.`,
        ),
      });
    }
    if (!im.hasSize && im.src !== '') {
      entries.push({
        check: 'weight',
        id: im.id,
        status: 'fail',
        rule: 'image-size',
        message: t(
          'The image has no width and height attributes, so the page jumps when it loads.',
          'L’image n’a pas d’attributs width et height, la page saute donc quand elle se charge.',
        ),
      });
    }
  }
  if (unmeasured > 0) {
    entries.push({
      check: 'weight',
      id: 'page',
      status: 'unknown',
      rule: 'weight-unmeasured',
      message: t(
        `${unmeasured} file(s) from other hosts did not report their size, so the total may be higher.`,
        `${unmeasured} fichier(s) d’autres hôtes n’ont pas indiqué leur taille, le total peut donc être plus élevé.`,
      ),
    });
  }
  return { checked: facts.resources.length + facts.images.length, entries };
}
