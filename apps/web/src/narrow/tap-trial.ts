import { NBSP, clip, type Lang } from './types.js';

/**
 * A short test a person can take to find the button size at which their
 * taps land on this screen: a few targets at each of four sizes, one tap
 * each. From the result the tool can say which browser zoom brings the
 * controls of the App to that size, and which controls of the page are
 * smaller than it.
 *
 * The test measures taps, on this screen, today. It says nothing about the
 * person, and no text here does. With too few taps the result is UNKNOWN,
 * and it is never rounded towards a size that was not tried. Nothing is
 * stored or sent.
 */

/** The sizes tried, in CSS pixels, largest first. None is smaller than the 44 pixels the checks of the App look for. */
export const TAP_SIZES: readonly number[] = [96, 72, 56, 44];

/** Targets shown at each size. */
export const TAPS_PER_SIZE = 4;

/** The smallest target the checks of the App accept. */
export const APP_MINIMUM = 44;

/** Height of the area the targets appear in, in CSS pixels. */
export const AREA_HEIGHT = 240;

export interface TapTarget {
  /** Position in the whole test, from 0. */
  readonly index: number;
  readonly size: number;
  /** Where the target sits in the free space of the area, each from 0 to 1. */
  readonly x: number;
  readonly y: number;
}

/**
 * Places for the targets. They are fixed, so the test is the same every
 * time and for everyone, and they reach the corners and the middle, since
 * where a target is counts as much as how large it is.
 */
const PLACES: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.5],
  [0.08, 0.12],
  [0.92, 0.85],
  [0.9, 0.1],
  [0.1, 0.9],
  [0.35, 0.2],
  [0.7, 0.6],
  [0.2, 0.55],
];

/** Every target of the test, in the order they are shown. */
export function tapPlan(sizes: readonly number[] = TAP_SIZES, perSize: number = TAPS_PER_SIZE): TapTarget[] {
  const out: TapTarget[] = [];
  for (const size of sizes) {
    for (let i = 0; i < perSize; i += 1) {
      const place = PLACES[out.length % PLACES.length] ?? [0.5, 0.5];
      out.push({ index: out.length, size, x: place[0], y: place[1] });
    }
  }
  return out;
}

export type TapOutcome = 'hit' | 'miss';

export interface Tap {
  readonly size: number;
  readonly outcome: TapOutcome;
}

export type TapPhase = 'idle' | 'running' | 'done';

export interface TapState {
  readonly phase: TapPhase;
  /** Taps so far, in order. */
  readonly taps: readonly Tap[];
  /** True when the person stopped before the last target. */
  readonly stopped: boolean;
}

export const TAP_IDLE: TapState = { phase: 'idle', taps: [], stopped: false };

export const startTaps = (): TapState => ({ phase: 'running', taps: [], stopped: false });

/** The target on screen, or null when the test is not running. */
export function currentTarget(state: TapState): TapTarget | null {
  if (state.phase !== 'running') return null;
  return tapPlan()[state.taps.length] ?? null;
}

/** Records one tap on the target on screen, or beside it, and moves to the next target. The test ends after the last one. */
export function recordTap(state: TapState, outcome: TapOutcome): TapState {
  const target = currentTarget(state);
  if (!target) return state;
  const taps = [...state.taps, { size: target.size, outcome }];
  return { phase: taps.length >= tapPlan().length ? 'done' : 'running', taps, stopped: false };
}

/** Ends the test early. What was tapped so far still counts. */
export function stopTaps(state: TapState): TapState {
  return state.phase === 'running' ? { ...state, phase: 'done', stopped: true } : state;
}

export interface SizeTally {
  readonly size: number;
  readonly attempts: number;
  readonly hits: number;
  /** True when every target of this size was tapped, and each tap landed. */
  readonly allLanded: boolean;
  /** True when every target of this size got its tap. */
  readonly complete: boolean;
}

export function tallyTaps(taps: readonly Tap[]): SizeTally[] {
  return TAP_SIZES.map((size) => {
    const mine = taps.filter((t) => t.size === size);
    const hits = mine.filter((t) => t.outcome === 'hit').length;
    const complete = mine.length >= TAPS_PER_SIZE;
    return { size, attempts: mine.length, hits, complete, allLanded: complete && hits === mine.length };
  });
}

export type TapResult =
  /** The smallest size at which every tap landed, with every tap landing at each larger size too. */
  | { readonly kind: 'size'; readonly px: number }
  /** Taps missed even at the largest size tried. */
  | { readonly kind: 'above'; readonly px: number }
  /** Too few taps to say. */
  | { readonly kind: 'unknown' };

/**
 * What the taps say. A size counts only when all its targets were tapped
 * and none was missed, and the result never goes below a size where a tap
 * missed, whatever happened at smaller sizes afterwards.
 */
export function tapResult(taps: readonly Tap[]): TapResult {
  const tally = tallyTaps(taps);
  const largest = tally[0];
  if (!largest || !largest.complete) return { kind: 'unknown' };
  if (!largest.allLanded) return { kind: 'above', px: largest.size };
  let px = largest.size;
  for (const t of tally.slice(1)) {
    if (!t.allLanded) break;
    px = t.size;
  }
  return { kind: 'size', px };
}

/** The zoom levels a browser offers above 100%. */
export const ZOOM_STEPS: readonly number[] = [110, 125, 150, 175, 200, 250, 300, 400];

/** The first browser zoom that brings a 44 pixel control to at least `px`. 100 when no zoom is needed, null when even 400% is not enough. */
export function zoomFor(px: number): number | null {
  if (px <= APP_MINIMUM) return 100;
  return ZOOM_STEPS.find((z) => (APP_MINIMUM * z) / 100 + 1e-9 >= px) ?? null;
}

/** How wide the page area is, in CSS pixels, once the browser is zoomed. */
export function widthAtZoom(widthPx: number, zoom: number): number {
  return Math.floor((widthPx * 100) / zoom);
}

const px = (n: number, lang: Lang): string => (lang === 'fr' ? `${n}${NBSP}pixels CSS` : `${n} CSS pixels`);
const pct = (n: number, lang: Lang): string => (lang === 'fr' ? `${n}${NBSP}%` : `${n}%`);

/** The result in one sentence. It speaks of taps and of this screen, never of the person. */
export function resultSentence(result: TapResult, lang: Lang): string {
  const fr = lang === 'fr';
  if (result.kind === 'unknown') {
    return fr
      ? 'Taille UNKNOWN. Il n’y a pas eu assez d’appuis pour le dire. Refaites le test jusqu’au bout quand vous le voulez.'
      : 'Size UNKNOWN. There were too few taps to say. Take the test to the end when you want to.';
  }
  if (result.kind === 'above') {
    return fr
      ? `Taille UNKNOWN. Des appuis ont manqué leur cible à ${px(result.px, 'fr')}, la plus grande taille essayée, donc la taille qui convient sur cet écran est au-dessus de ce que ce test mesure.`
      : `Size UNKNOWN. Taps missed at ${px(result.px, 'en')}, the largest size tried, so the size that works on this screen is above what this test measures.`;
  }
  return fr
    ? `Sur cet écran, aujourd’hui, tous les appuis ont atteint leur cible à partir de ${px(result.px, 'fr')}.`
    : `On this screen, today, every tap landed from ${px(result.px, 'en')} up.`;
}

/**
 * What the result means for the App: whether a browser zoom would bring its
 * controls to the size, and what that zoom does to the width of the page.
 * `widthPx` is the width of the page area now, or null when the browser
 * does not report it.
 */
export function zoomAdvice(result: TapResult, widthPx: number | null, lang: Lang): string[] {
  const fr = lang === 'fr';
  if (result.kind === 'unknown') return [];
  const out: string[] = [];
  const size = result.px;
  if (result.kind === 'size' && size <= APP_MINIMUM) {
    out.push(
      fr
        ? `Les contrôles de l’App cherchent des commandes d’au moins ${px(APP_MINIMUM, 'fr')}, la taille à laquelle tous vos appuis ont atteint leur cible. Une commande plus petite est un obstacle à nous signaler.`
        : `The checks of the App look for controls of at least ${px(APP_MINIMUM, 'en')}, the size at which all your taps landed. A smaller control is a barrier to tell us about.`,
    );
    return out;
  }
  const zoom = result.kind === 'above' ? null : zoomFor(size);
  if (result.kind === 'above' || zoom === null) {
    out.push(
      fr
        ? `Les commandes de l’App font au moins ${px(APP_MINIMUM, 'fr')}. Un zoom du navigateur les agrandit, mais ce test ne dit pas jusqu’où il faut aller. Essayez un zoom de ${pct(250, 'fr')} ou plus et refaites le test.`
        : `Controls of the App are at least ${px(APP_MINIMUM, 'en')}. A browser zoom makes them larger, but this test does not say how far to go. Try a zoom of ${pct(250, 'en')} or more and take the test again.`,
    );
    return out;
  }
  out.push(
    fr
      ? `Les commandes de l’App font au moins ${px(APP_MINIMUM, 'fr')}. Un zoom du navigateur de ${pct(zoom, 'fr')} les amène à ${px(Math.floor((APP_MINIMUM * zoom) / 100), 'fr')} ou plus.`
      : `Controls of the App are at least ${px(APP_MINIMUM, 'en')}. A browser zoom of ${pct(zoom, 'en')} brings them to ${px(Math.floor((APP_MINIMUM * zoom) / 100), 'en')} or more.`,
  );
  if (widthPx === null) {
    out.push(fr ? 'Largeur de la page UNKNOWN, donc l’effet de ce zoom sur la mise en page n’est pas connu.' : 'Width of the page UNKNOWN, so what this zoom does to the layout is not known.');
  } else {
    const after = widthAtZoom(widthPx, zoom);
    out.push(
      after >= 320
        ? fr
          ? `À ce zoom, la page disposerait de ${px(after, 'fr')} de large. L’App est contrôlée jusqu’à 320${NBSP}pixels CSS.`
          : `At that zoom the page would have ${px(after, 'en')} of width. The App is checked down to 320 CSS pixels.`
        : fr
          ? `À ce zoom, la page ne disposerait que de ${px(after, 'fr')} de large, moins que les 320${NBSP}pixels CSS jusqu’où l’App est contrôlée. Une partie du contenu pourrait défiler de côté. Si c’est le cas, signalez-le avec le formulaire «\u202FSignaler un obstacle\u202F» de cette page.`
          : `At that zoom the page would have only ${px(after, 'en')} of width, less than the 320 CSS pixels the App is checked down to. Some content may scroll sideways. If it does, tell us with the form “Tell us about a barrier” on this page.`,
    );
  }
  return out;
}

export interface ControlBox {
  readonly id: string;
  /** The name of the control as assistive technology would give it, or empty. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface PageSizes {
  /** Controls that were measured. */
  readonly measured: number;
  /** Those smaller than the size, in either direction, smallest first. */
  readonly smaller: readonly ControlBox[];
}

/** The controls of a page that are smaller than a size in either direction. Controls with no size (hidden ones) are left out. */
export function controlsBelow(controls: readonly ControlBox[], sizePx: number): PageSizes {
  const shown = controls.filter((c) => c.width > 0 || c.height > 0);
  const smaller = shown.filter((c) => Math.min(c.width, c.height) + 0.5 < sizePx).sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height));
  return { measured: shown.length, smaller };
}

/** How many controls are smaller than the size, in one sentence. */
export function pageSizesSentence(sizes: PageSizes, sizePx: number, lang: Lang): string {
  const fr = lang === 'fr';
  const n = sizes.smaller.length;
  if (sizes.measured === 0) return fr ? 'Aucune commande n’a été mesurée sur cette page.' : 'No control was measured on this page.';
  if (n === 0) {
    return fr
      ? `Aucune des ${sizes.measured} commandes mesurées sur cette page n’est plus petite que ${px(sizePx, 'fr')}.`
      : `None of the ${sizes.measured} controls measured on this page is smaller than ${px(sizePx, 'en')}.`;
  }
  return fr
    ? `${n} des ${sizes.measured} commandes mesurées sur cette page ${n < 2 ? 'est plus petite' : 'sont plus petites'} que ${px(sizePx, 'fr')}, sans zoom.`
    : `${n} of the ${sizes.measured} controls measured on this page ${n === 1 ? 'is' : 'are'} smaller than ${px(sizePx, 'en')}, with no zoom.`;
}

/** One control in words: its name, or what it is when it has no name, and its size. */
export function controlLine(c: ControlBox, lang: Lang): string {
  const name = c.name.trim() === '' ? (lang === 'fr' ? `sans nom (${clip(c.id, 30)})` : `no name (${clip(c.id, 30)})`) : `«${clip(c.name, 40)}»`;
  const label = lang === 'fr' ? name.replace('«', '«\u202F').replace('»', '\u202F»') : name.replace('«', '“').replace('»', '”');
  return `${label}, ${Math.round(c.width)} × ${Math.round(c.height)}`;
}

/** The result as one line for a report a person shares, or an empty string when there is no result yet. */
export function tapNote(state: TapState, lang: Lang): string {
  if (state.phase !== 'done') return '';
  const result = tapResult(state.taps);
  const colon = lang === 'fr' ? `${NBSP}:` : ':';
  const label = lang === 'fr' ? 'Taille de bouton où mes appuis atteignent leur cible' : 'Button size at which my taps land';
  return `${label}${colon} ${result.kind === 'size' ? px(result.px, lang) : 'UNKNOWN'}`;
}
