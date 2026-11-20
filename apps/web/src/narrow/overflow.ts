import type { OverflowFacts, OverflowOrigin, OverflowRegion } from './overflow-inpage.js';
import { NBSP, clip, type CheckResult, type Entry, type Lang } from './types.js';

/**
 * Why a page scrolls sideways. The reflow check says that it does. This
 * turns the origins found on the page into a cause each, in words, with
 * the numbers that were measured and a way to put it right.
 *
 * A cause is read from what the browser reports about the element, so it is
 * the most likely reason and is worded as what was measured. Where a wide
 * thing may have a right to be wide (a data table, code, a map in a region
 * that scrolls on its own), the finding is UNKNOWN and a person decides.
 */

export type CauseKind =
  | 'long-word'
  | 'nowrap'
  | 'preformatted'
  | 'table'
  | 'media'
  | 'min-width'
  | 'grid-columns'
  | 'flex-nowrap'
  | 'positioned'
  | 'offset'
  | 'fixed-width'
  | 'wide-box';

export const CAUSE_KINDS: readonly CauseKind[] = ['long-word', 'nowrap', 'preformatted', 'table', 'media', 'min-width', 'grid-columns', 'flex-nowrap', 'positioned', 'offset', 'fixed-width', 'wide-box'];

/** Displays whose width follows the space they are given, so a wider box means a width was set. */
const FILLS_ITS_SPACE = ['block', 'list-item', 'flow-root', 'flex', 'grid'];

/** The most likely reason an origin is wider than the page. */
export function causeOf(o: OverflowOrigin): CauseKind {
  if (o.text) {
    if (o.tag === 'pre' || o.whiteSpace === 'pre') return 'preformatted';
    return o.whiteSpace === 'nowrap' ? 'nowrap' : 'long-word';
  }
  if (o.tableLike) return 'table';
  if (o.replaced) return 'media';
  if (o.minWidthPx > o.spacePx) return 'min-width';
  if (o.parentGridPx !== null && o.parentGridPx > o.spacePx) return 'grid-columns';
  const outOfFlow = o.position === 'absolute' || o.position === 'fixed';
  // An item of a row that cannot wrap is pushed out by the items before it, whatever its own width.
  if (o.parentFlexNoWrap && !outOfFlow) return 'flex-nowrap';
  if (o.shifted) return outOfFlow ? 'positioned' : 'offset';
  if (o.tag === 'pre') return 'preformatted';
  if (o.whiteSpace === 'nowrap' && !FILLS_ITS_SPACE.includes(o.display)) return 'nowrap';
  if (FILLS_ITS_SPACE.includes(o.display) && !o.floated && o.position !== 'absolute' && o.position !== 'fixed') return 'fixed-width';
  return 'wide-box';
}

export interface Cause {
  readonly kind: CauseKind;
  /** The element the finding is about: the origin, or its parent for a row or a grid. */
  readonly id: string;
  readonly origin: OverflowOrigin;
  /** Other origins with the same cause in the same parent. */
  readonly siblings: number;
}

/** One cause per origin. Items of the same row or grid that stick out are one cause, about their parent. */
export function causesOf(origins: readonly OverflowOrigin[]): Cause[] {
  const out: Cause[] = [];
  const grouped = new Map<string, number>();
  for (const origin of origins) {
    const kind = causeOf(origin);
    if ((kind === 'flex-nowrap' || kind === 'grid-columns') && origin.parentId !== '') {
      const key = `${kind}|${origin.parentId}`;
      const at = grouped.get(key);
      if (at !== undefined) {
        const first = out[at] as Cause;
        // The item that reaches furthest gives the number in the message.
        out[at] = { ...first, siblings: first.siblings + 1, origin: origin.overPx > first.origin.overPx ? origin : first.origin };
        continue;
      }
      grouped.set(key, out.length);
      out.push({ kind, id: origin.parentId, origin, siblings: 0 });
      continue;
    }
    out.push({ kind, id: origin.id, origin, siblings: 0 });
  }
  return out;
}

const pxText = (n: number, lang: Lang): string => (lang === 'fr' ? `${n}${NBSP}px` : `${n}px`);

/**
 * In French a colon in running text takes a no-break space before it. A CSS
 * declaration is code, so in French sentences it is written with no space
 * at all (`max-width:100%`), which is the same CSS and cannot be read as
 * punctuation.
 */
const cssInFrench = (s: string): string => s.replace(/\b(overflow-wrap|white-space|overflow-x|max-width|min-width|height|display|flex-wrap|position): /g, '$1:');

/** What was measured and how to put it right, for one cause. */
export function causeSentence(c: Cause, lang: Lang): string {
  return lang === 'fr' ? cssInFrench(causeText(c, lang)) : causeText(c, lang);
}

function causeText(c: Cause, lang: Lang): string {
  const fr = lang === 'fr';
  const o = c.origin;
  const over = pxText(o.overPx, lang);
  const width = pxText(o.widthPx, lang);
  const space = pxText(o.spacePx, lang);
  switch (c.kind) {
    case 'long-word':
      return fr
        ? `Un mot sans point de coupure («\u202F${o.word}\u202F», ${o.wordChars} caractères) dépasse de ${over} le bord de la page. Ajoutez overflow-wrap: anywhere au bloc pour que le mot puisse se couper.`
        : `A word with no place to break (“${o.word}”, ${o.wordChars} characters) runs ${over} past the edge of the page. Add overflow-wrap: anywhere to the block so the word can break.`;
    case 'nowrap':
      return fr
        ? `Ce texte ne peut pas passer à la ligne (white-space: nowrap) et dépasse de ${over} le bord de la page. Laissez-le passer à la ligne à cette largeur.`
        : `This text may not wrap (white-space: nowrap) and runs ${over} past the edge of the page. Let it wrap at this width.`;
    case 'preformatted':
      return fr
        ? `Ce texte préformaté dépasse de ${over} le bord de la page. Laissez le bloc défiler seul (overflow-x: auto) ou passer à la ligne (white-space: pre-wrap), pour que le reste de la page ne défile pas.`
        : `This preformatted text runs ${over} past the edge of the page. Let the block scroll on its own (overflow-x: auto) or wrap (white-space: pre-wrap), so the rest of the page does not scroll.`;
    case 'table':
      return fr
        ? `Ce tableau fait ${width} de large dans un espace de ${space}, et toute la page défile de côté. Un tableau de données peut avoir besoin des deux directions, mais il devrait alors défiler dans sa propre zone. Une personne doit en décider.`
        : `This table is ${width} wide in a space of ${space}, and the whole page scrolls sideways. A data table may need both directions, but it should then scroll inside a region of its own. A person has to decide.`;
    case 'media':
      return fr
        ? `Cet élément ${o.tag} fait ${width} de large dans un espace de ${space}. Ajoutez max-width: 100% et height: auto pour qu’il rétrécisse avec la page.`
        : `This ${o.tag} is ${width} wide in a space of ${space}. Add max-width: 100% and height: auto so it shrinks with the page.`;
    case 'min-width':
      return fr
        ? `La largeur minimale de cet élément (min-width de ${pxText(o.minWidthPx, lang)}) dépasse l’espace de ${space} dont il dispose. Réduisez-la ou retirez-la à cette largeur.`
        : `The min-width of this element (${pxText(o.minWidthPx, lang)}) is more than the ${space} of space it has. Lower it or take it out at this width.`;
    case 'grid-columns':
      return fr
        ? `Les colonnes de cette grille totalisent ${pxText(o.parentGridPx ?? 0, lang)} dans un espace de ${space}. Utilisez moins de colonnes à cette largeur, ou des colonnes qui rétrécissent, comme minmax(0, 1fr).`
        : `The columns of this grid add up to ${pxText(o.parentGridPx ?? 0, lang)} in a space of ${space}. Use fewer columns at this width, or columns that shrink, such as minmax(0, 1fr).`;
    case 'flex-nowrap': {
      const n = c.siblings + 1;
      return fr
        ? `Les éléments de cette rangée ne peuvent pas passer à la ligne (display: flex sans flex-wrap), et ${n < 2 ? 'l’un d’eux dépasse' : `${n} d’entre eux dépassent`} le bord de la page, jusqu’à ${over}. Ajoutez flex-wrap: wrap, ou laissez les éléments rétrécir avec min-width: 0.`
        : `The items of this row cannot wrap (display: flex with no flex-wrap), and ${n === 1 ? 'one of them reaches' : `${n} of them reach`} past the edge of the page, by up to ${over}. Add flex-wrap: wrap, or let the items shrink with min-width: 0.`;
    }
    case 'positioned':
      return fr
        ? `Cet élément est positionné (position: ${o.position}) à ${over} au-delà du bord de la page. Gardez-le dans la page à cette largeur.`
        : `This element is positioned (position: ${o.position}) ${over} past the edge of the page. Keep it inside the page at this width.`;
    case 'offset':
      return fr
        ? `Cet élément tient dans son espace, mais une marge, un décalage ou une transformation le pousse à ${over} au-delà du bord de la page.`
        : `This element fits its space, but a margin, an offset or a transform pushes it ${over} past the edge of the page.`;
    case 'fixed-width':
      return fr
        ? `Cet élément fait ${width} de large dans un espace de ${space}, donc une largeur lui a été fixée. Remplacez-la par max-width: 100%, ou par une largeur en pourcentage.`
        : `This element is ${width} wide in a space of ${space}, so a width has been set on it. Replace it with max-width: 100%, or with a width in percent.`;
    case 'wide-box':
      return fr
        ? `Cet élément fait ${width} de large dans un espace de ${space} et dépasse de ${over} le bord de la page. Ce qu’il contient ne rétrécit pas ou ne passe pas à la ligne.`
        : `This element is ${width} wide in a space of ${space} and reaches ${over} past the edge of the page. What it holds does not shrink or wrap.`;
  }
}

export type RegionKind = 'region-text' | 'region-content';

/** A region that scrolls sideways fails when running text in it is too wide. Otherwise a person decides. */
export function regionKind(r: OverflowRegion): RegionKind {
  return r.textBlock ? 'region-text' : 'region-content';
}

export function regionSentence(r: OverflowRegion, lang: Lang): string {
  const fr = lang === 'fr';
  const content = pxText(r.contentPx, lang);
  const space = pxText(r.spacePx, lang);
  if (regionKind(r) === 'region-text') {
    return fr
      ? `Cette zone défile de côté (${content} de contenu dans ${space}) et contient du texte courant plus large qu’elle. Le lire demande de défiler dans deux directions. Laissez le texte passer à la ligne.`
      : `This region scrolls sideways (${content} of content in ${space}) and holds running text that is wider than it. Reading it takes scrolling in two directions. Let the text wrap.`;
  }
  const holds: string[] = [];
  if (r.table) holds.push(fr ? 'un tableau' : 'a table');
  if (r.pre) holds.push(fr ? 'du code ou du texte préformaté' : 'code or preformatted text');
  if (r.media) holds.push(fr ? 'une image ou un élément intégré' : 'an image or embedded content');
  const what =
    holds.length === 0
      ? fr
        ? 'Ce qu’elle contient n’a pas été reconnu.'
        : 'What it holds was not recognised.'
      : fr
        ? `Elle contient ${holds.join(' et ')}.`
        : `It holds ${holds.join(' and ')}.`;
  const keyboard = r.keyboard
    ? ''
    : fr
      ? ' Rien dans la zone ne prend le focus du clavier, donc vérifiez aussi qu’elle peut défiler au clavier.'
      : ' Nothing in the region takes keyboard focus, so also check that it can be scrolled with the keyboard.';
  return fr
    ? `Cette zone défile de côté à cette largeur (${content} de contenu dans ${space}). ${what} Un contenu qui a besoin des deux directions peut défiler ainsi, et une personne doit décider si c’est le cas.${keyboard}`
    : `This region scrolls sideways at this width (${content} of content in ${space}). ${what} Content that needs both directions may scroll like this, and a person has to decide whether this does.${keyboard}`;
}

/**
 * The findings to add to the reflow check. A cause is a failure, apart from
 * a wide table, which a person has to judge. A page that scrolls with no
 * origin found is UNKNOWN: the cause may sit in a frame or a shadow tree.
 */
export function auditOverflow(facts: OverflowFacts): CheckResult {
  const entries: Entry[] = [];
  const both = (make: (lang: Lang) => string): { en: string; fr: string } => ({ en: make('en'), fr: make('fr') });
  for (const cause of causesOf(facts.origins)) {
    entries.push({ check: 'reflow', rule: `cause-${cause.kind}`, id: cause.id, status: cause.kind === 'table' ? 'unknown' : 'fail', message: both((l) => causeSentence(cause, l)) });
  }
  const dropped = facts.originCount - facts.origins.length;
  if (dropped > 0) {
    entries.push({
      check: 'reflow',
      rule: 'cause-more',
      id: 'page',
      status: 'unknown',
      message: {
        en: `${dropped} more ${dropped === 1 ? 'element reaches' : 'elements reach'} past the edge of the page and ${dropped === 1 ? 'is' : 'are'} not listed. Put the causes above right and run the audit again.`,
        fr: `${dropped} ${dropped < 2 ? 'autre élément dépasse' : 'autres éléments dépassent'} le bord de la page sans figurer dans la liste. Corrigez les causes ci-dessus et relancez l’audit.`,
      },
    });
  }
  if (facts.pageScrolls && facts.originCount === 0) {
    entries.push({
      check: 'reflow',
      rule: 'cause-not-found',
      id: 'page',
      status: 'unknown',
      message: {
        en: `The page scrolls sideways and the element that causes it was not found${facts.truncated ? ' among the elements that were looked at' : ''}. It may sit in a frame or in a shadow tree. A person has to look.`,
        fr: `La page défile de côté et l’élément qui en est la cause n’a pas été trouvé${facts.truncated ? ' parmi les éléments examinés' : ''}. Il se trouve peut-être dans un cadre ou dans un arbre fantôme. Une personne doit regarder.`,
      },
    });
  }
  for (const region of facts.regions) {
    const kind = regionKind(region);
    entries.push({ check: 'reflow', rule: kind, id: region.id, status: kind === 'region-text' ? 'fail' : 'unknown', message: both((l) => regionSentence(region, l)) });
  }
  const moreRegions = facts.regionCount - facts.regions.length;
  if (moreRegions > 0) {
    entries.push({
      check: 'reflow',
      rule: 'region-more',
      id: 'page',
      status: 'unknown',
      message: {
        en: `${moreRegions} more ${moreRegions === 1 ? 'region scrolls' : 'regions scroll'} sideways and ${moreRegions === 1 ? 'is' : 'are'} not listed.`,
        fr: `${moreRegions} ${moreRegions < 2 ? 'autre zone défile' : 'autres zones défilent'} de côté sans figurer dans la liste.`,
      },
    });
  }
  return { checked: facts.examined, entries };
}

/** Adds the findings of the overflow probe to those of the reflow check. */
export function withOverflow(reflow: CheckResult, facts: OverflowFacts | undefined): CheckResult {
  if (!facts) return reflow;
  const extra = auditOverflow(facts);
  return { checked: reflow.checked + extra.checked, entries: [...reflow.entries, ...extra.entries] };
}

/** A short label for a cause, for lists and summaries. */
export const CAUSE_LABELS: Readonly<Record<CauseKind, { readonly en: string; readonly fr: string }>> = {
  'long-word': { en: 'A word that cannot break', fr: 'Un mot qui ne peut pas se couper' },
  nowrap: { en: 'Text that may not wrap', fr: 'Un texte qui ne peut pas passer à la ligne' },
  preformatted: { en: 'Preformatted text', fr: 'Du texte préformaté' },
  table: { en: 'A wide table', fr: 'Un tableau large' },
  media: { en: 'An image or embedded content that does not shrink', fr: 'Une image ou un contenu intégré qui ne rétrécit pas' },
  'min-width': { en: 'A minimum width', fr: 'Une largeur minimale' },
  'grid-columns': { en: 'Grid columns of a fixed size', fr: 'Des colonnes de grille de taille fixe' },
  'flex-nowrap': { en: 'A row that cannot wrap', fr: 'Une rangée qui ne peut pas passer à la ligne' },
  positioned: { en: 'A positioned element', fr: 'Un élément positionné' },
  offset: { en: 'A margin, an offset or a transform', fr: 'Une marge, un décalage ou une transformation' },
  'fixed-width': { en: 'A fixed width', fr: 'Une largeur fixe' },
  'wide-box': { en: 'A box that does not shrink', fr: 'Une boîte qui ne rétrécit pas' },
};

/** The causes of a page in a few lines of text: one per kind, most frequent first, with the first element of each. */
export function describeCauses(facts: OverflowFacts, lang: Lang): string {
  const causes = causesOf(facts.origins);
  if (causes.length === 0) return '';
  const by = new Map<CauseKind, Cause[]>();
  for (const c of causes) by.set(c.kind, [...(by.get(c.kind) ?? []), c]);
  const rows = [...by.entries()].sort((a, b) => b[1].length - a[1].length || CAUSE_KINDS.indexOf(a[0]) - CAUSE_KINDS.indexOf(b[0]));
  const fr = lang === 'fr';
  const head = fr ? `Pourquoi la page défile de côté à ${pxText(facts.viewportPx, 'fr')}${NBSP}:` : `Why the page scrolls sideways at ${pxText(facts.viewportPx, 'en')}:`;
  return `${[head, ...rows.map(([kind, list]) => `  ${list.length} × ${CAUSE_LABELS[kind][lang]}${fr ? `${NBSP}:` : ':'} ${clip((list[0] as Cause).id, 60)}`)].join('\n')}\n`;
}
