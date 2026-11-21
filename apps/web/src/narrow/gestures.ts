import { NBSP, NNBSP, type Lang } from './types.js';
import type { GestureFacts, GestureItem, GestureKind } from './gesture-inpage.js';

/**
 * What the drag and gesture controls of a page may mean for a person who
 * cannot drag, or cannot do a path or a pinch: for each, whether a
 * single-tap way to do the same was found nearby (WCAG 2.5.1 and 2.5.7 ask
 * for one). A way found is a button whose name suggests it; whether it really
 * does the same stays to be tried. A way by keyboard alone is said, but does
 * not count as a single-tap way.
 */

export type GestureStatus = 'alternative-found' | 'none-found';

export interface GestureFinding {
  readonly item: GestureItem;
  readonly status: GestureStatus;
}

export interface GestureModel {
  readonly findings: readonly GestureFinding[];
  readonly found: number;
  readonly none: number;
  readonly truncated: boolean;
  readonly byKind: Readonly<Record<GestureKind, number>>;
}

export const GESTURE_KINDS: readonly GestureKind[] = ['slider', 'draggable', 'carousel', 'canvas', 'touch-none', 'sideways'];

export function buildGestures(facts: GestureFacts): GestureModel {
  const byKind = Object.fromEntries(GESTURE_KINDS.map((k) => [k, 0])) as Record<GestureKind, number>;
  const findings = facts.items.map((item): GestureFinding => {
    byKind[item.kind] += 1;
    return { item, status: item.alternatives.length > 0 ? 'alternative-found' : 'none-found' };
  });
  // Those with no way found come first: they are what to look at.
  const ordered = [...findings.filter((f) => f.status === 'none-found'), ...findings.filter((f) => f.status === 'alternative-found')];
  return { findings: ordered, found: findings.length - findings.filter((f) => f.status === 'none-found').length, none: findings.filter((f) => f.status === 'none-found').length, truncated: facts.truncated, byKind };
}

const KIND: Record<GestureKind, { en: string; fr: string }> = {
  slider: { en: 'Slider', fr: 'Curseur' },
  draggable: { en: 'Item to drag', fr: 'Élément à glisser' },
  carousel: { en: 'Carousel', fr: 'Carrousel' },
  canvas: { en: 'Drawing area or map', fr: 'Zone de dessin ou carte' },
  'touch-none': { en: 'Area that takes touch for itself', fr: 'Zone qui garde le toucher pour elle' },
  sideways: { en: 'Strip that scrolls sideways', fr: 'Bande qui défile de côté' },
};

const WHAT: Record<GestureKind, { en: string; fr: string }> = {
  slider: { en: 'its thumb is dragged', fr: 'on en glisse le bouton' },
  draggable: { en: 'it is dragged', fr: 'on le glisse' },
  carousel: { en: 'it may be swiped', fr: 'on peut le balayer' },
  canvas: { en: 'it may be dragged or pinched', fr: 'on peut la glisser ou la pincer' },
  'touch-none': { en: 'it may wait for a drag or a gesture', fr: 'elle peut attendre un glissement ou un geste' },
  sideways: { en: 'it is swiped to see the rest', fr: 'on la balaie pour voir le reste' },
};

export const kindWord = (k: GestureKind, lang: Lang): string => KIND[k][lang];

const q = (name: string, lang: Lang): string => (name === '' ? 'UNKNOWN' : lang === 'fr' ? `«${NNBSP}${name}${NNBSP}»` : `“${name}”`);

/** One finding as a sentence. */
export function findingText(f: GestureFinding, lang: Lang): string {
  const fr = lang === 'fr';
  const { item } = f;
  const head = `${KIND[item.kind][lang]} ${q(item.name, lang)}${fr ? `${NBSP}: ` : ': '}${WHAT[item.kind][lang]}.`;
  const keys =
    item.keyboard === true
      ? fr
        ? ' Il se rejoint au clavier, mais un appui simple reste nécessaire pour le pointeur.'
        : ' It can be reached by keyboard, but a pointer still needs a single-tap way.'
      : item.keyboard === false
        ? fr
          ? ' Il ne se rejoint pas au clavier.'
          : ' It cannot be reached by keyboard.'
        : '';
  if (f.status === 'none-found') return head + (fr ? ' Aucune autre façon par appui simple n’a été trouvée autour.' : ' No other way with a single tap was found around it.') + keys;
  const alts = item.alternatives.map((a) => q(a, lang)).join(', ');
  return head + (fr ? ` Une autre façon possible, à essayer${NBSP}: ${alts}.` : ` A possible other way, to try: ${alts}.`) + keys;
}

/** What the page holds, in a few sentences, set against the drag test when it was done. */
export function gestureSummary(m: GestureModel, hard: boolean | null, lang: Lang): string[] {
  const fr = lang === 'fr';
  const total = m.findings.length;
  if (total === 0) {
    return [
      fr
        ? 'Aucune commande à glisser ou à geste n’a été trouvée dans cette page. Une commande faite autrement peut tout de même en demander un.'
        : 'No drag or gesture control was found on this page. A control built some other way may still ask for one.',
    ];
  }
  const lines = [
    fr
      ? `${total} ${total < 2 ? 'commande trouvée' : 'commandes trouvées'}${m.truncated ? ' (la lecture s’est arrêtée avant la fin)' : ''}. Sans autre façon par appui simple${NBSP}: ${m.none}. Avec une autre façon possible, à essayer${NBSP}: ${m.found}.`
      : `${total} ${total === 1 ? 'control' : 'controls'} found${m.truncated ? ' (the reading stopped before the end)' : ''}. With no single-tap way found: ${m.none}. With a possible other way, to try: ${m.found}.`,
  ];
  if (hard === true && m.none > 0) {
    lines.push(
      fr
        ? `D’après votre test de glissement, les ${m.none}${NBSP}commandes sans autre façon peuvent vous bloquer.`
        : `From your drag test, the ${m.none} ${m.none === 1 ? 'control' : 'controls'} with no other way may block you.`,
    );
  } else if (hard === false && m.none > 0) {
    lines.push(
      fr
        ? 'Votre test de glissement a réussi, mais un glissement sur une petite cible ou en tenant longtemps peut être plus dur.'
        : 'Your drag test went through, but a drag on a small target or a long hold may be harder.',
    );
  } else if (hard === null) {
    lines.push(fr ? 'Le test de glissement n’a pas été fait, donc ce que cela veut dire pour vous est UNKNOWN.' : 'The drag test was not done, so what this means for you is UNKNOWN.');
  }
  return lines;
}

/** General hints for the team, when something has no single-tap way found. */
export function gestureAdvice(m: GestureModel, lang: Lang): string[] {
  if (m.none === 0) return [];
  const fr = lang === 'fr';
  const kinds = new Set(m.findings.filter((f) => f.status === 'none-found').map((f) => f.item.kind));
  const out: string[] = [];
  if (kinds.has('slider')) out.push(fr ? 'Pour un curseur, des boutons plus et moins, ou un champ où taper la valeur.' : 'For a slider, plus and minus buttons, or a field to type the value in.');
  if (kinds.has('draggable')) out.push(fr ? 'Pour un élément à glisser, des boutons Monter et Descendre, ou un menu Déplacer vers.' : 'For an item to drag, Move up and Move down buttons, or a Move to menu.');
  if (kinds.has('carousel') || kinds.has('sideways')) out.push(fr ? 'Pour ce qui se balaie, des boutons Précédent et Suivant, ou tout montrer en liste.' : 'For what is swiped, Previous and Next buttons, or showing it all as a list.');
  if (kinds.has('canvas') || kinds.has('touch-none')) out.push(fr ? 'Pour une carte ou une zone de geste, des boutons pour rapprocher, éloigner et déplacer la vue.' : 'For a map or a gesture area, buttons to zoom in, zoom out and move the view.');
  return out;
}
