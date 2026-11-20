import type { ScrollFacts, ScrollMark } from './scroll-inpage.js';
import { NBSP, type Lang } from './types.js';

/**
 * Scroll effort: how far down the page things sit, counted in screens of the
 * window as it is now, less what fixed or sticky bars keep covered. Every
 * screen is a swipe, a few turns of a wheel, or a Page Down: for a person who
 * scrolls with effort, a long way between headings, a page with no way back
 * to the top, or bars that cover a large part of the window all cost more.
 *
 * Screens are a measure of the page, not of how anyone scrolls: how far one
 * swipe or one key press goes differs from device to device.
 */

/** A page longer than this, in screens, is pointed out. */
export const LONG_PAGE = 8;
/** A stretch of the page with no heading longer than this, in screens, is pointed out. */
export const LONG_STRETCH = 3;
/** Bars covering this share of the window or more are pointed out. */
export const COVERED_SHARE = 0.25;
/** Main content starting further down than this, in screens, is pointed out. */
export const MAIN_FAR = 1;
/** A back-to-top link is looked for on pages longer than this, in screens. */
export const TO_TOP_FROM = 3;

/** One tenth of a screen. */
const tenth = (n: number): number => Math.round(n * 10) / 10;

export interface ScrollPlace {
  readonly name: string;
  readonly kind: 'heading' | 'submit' | 'last';
  readonly level: number | null;
  /** Screens of scrolling to bring it into view from the top of the page. 0 when it is on the first screen. */
  readonly screens: number;
}

export interface ScrollModel {
  readonly width: number;
  readonly height: number;
  /** The part of the window left between the bars, in CSS pixels. */
  readonly usable: number;
  /** The page, in screens of the usable part. */
  readonly pageScreens: number;
  readonly coveredShare: number;
  readonly places: readonly ScrollPlace[];
  /** The longest stretch with no heading, in screens, and the heading it ends at (null when it runs to the end of the page). */
  readonly stretch: { readonly screens: number; readonly endsAt: string | null };
  readonly headings: number;
  readonly toTop: number;
  /** Screens down to the first heading inside main, or null when no heading is in main. */
  readonly mainStart: number | null;
}

export type ScrollCheck = { readonly kind: 'model'; readonly model: ScrollModel } | { readonly kind: 'no-size' } | { readonly kind: 'covered' };

/** Screens of scrolling to bring something at `top` into view. */
export function screensTo(top: number, height: number, coveredTop: number, coveredBottom: number): number {
  const usable = height - coveredTop - coveredBottom;
  const visibleEnd = height - coveredBottom;
  if (top < visibleEnd) return 0;
  // Scrolled by more than (top - visibleEnd) pixels, the top of it shows; counted up to the next tenth of a screen.
  return Math.max(0.1, Math.ceil(((top - visibleEnd + 1) / usable) * 10 - 1e-9) / 10);
}

export function buildScroll(f: ScrollFacts): ScrollCheck {
  const w = f.viewportWidth;
  const h = f.viewportHeight;
  if (w === null || h === null) return { kind: 'no-size' };
  const usable = h - f.coveredTop - f.coveredBottom;
  if (usable <= 0) return { kind: 'covered' };
  const to = (top: number): number => screensTo(top, h, f.coveredTop, f.coveredBottom);
  const places: ScrollPlace[] = [
    ...f.headings.map((x) => ({ name: x.text, kind: 'heading' as const, level: x.level, screens: to(x.top), top: x.top })),
    ...f.submits.map((x: ScrollMark) => ({ name: x.name, kind: 'submit' as const, level: null, screens: to(x.top), top: x.top })),
    ...(f.lastControl ? [{ name: f.lastControl.name, kind: 'last' as const, level: null, screens: to(f.lastControl.top), top: f.lastControl.top }] : []),
  ]
    .sort((a, b) => a.top - b.top)
    .map((x) => ({ name: x.name, kind: x.kind, level: x.level, screens: x.screens }));
  // The stretches between headings, from the top of the page to the end.
  const tops = [0, ...f.headings.map((x) => x.top).sort((a, b) => a - b), f.pageHeight];
  const sorted = [...f.headings].sort((a, b) => a.top - b.top);
  let stretch = { screens: 0, endsAt: null as string | null };
  for (let i = 1; i < tops.length; i += 1) {
    const len = tenth(((tops[i] ?? 0) - (tops[i - 1] ?? 0)) / usable);
    if (len > stretch.screens) stretch = { screens: len, endsAt: i - 1 < sorted.length ? (sorted[i - 1]?.text ?? null) : null };
  }
  return {
    kind: 'model',
    model: {
      width: w,
      height: h,
      usable,
      pageScreens: tenth(f.pageHeight / usable),
      coveredShare: Math.round(((f.coveredTop + f.coveredBottom) / h) * 100) / 100,
      places,
      stretch,
      headings: f.headings.length,
      toTop: f.toTop,
      mainStart: ((): number | null => {
        const first = sorted.find((x) => x.inMain);
        return first ? to(first.top) : null;
      })(),
    },
  };
}

const num = (n: number, lang: Lang): string => (lang === 'fr' ? String(n).replace('.', ',') : String(n));

/** A number of screens in words. */
export function screensText(n: number, lang: Lang): string {
  const fr = lang === 'fr';
  if (n === 0) return fr ? 'sur le premier écran' : 'on the first screen';
  return fr ? `${num(n, 'fr')}${NBSP}${n < 2 ? 'écran' : 'écrans'} plus bas` : `${num(n, 'en')} ${n === 1 ? 'screen' : 'screens'} down`;
}

export function scrollSummary(c: ScrollCheck, lang: Lang): string[] {
  const fr = lang === 'fr';
  if (c.kind === 'no-size') return [fr ? 'Taille de la fenêtre UNKNOWN, donc rien n’a été compté.' : 'Window size UNKNOWN, so nothing was counted.'];
  if (c.kind === 'covered') {
    return [fr ? 'Des barres fixes couvrent toute la fenêtre, donc la page ne peut pas être lue en défilant. L’effort est UNKNOWN.' : 'Fixed bars cover the whole window, so the page cannot be read by scrolling. The effort is UNKNOWN.'];
  }
  const m = c.model;
  const lines = [
    fr
      ? `La page fait ${num(m.pageScreens, 'fr')}${NBSP}${m.pageScreens < 2 ? 'écran' : 'écrans'} de haut, dans cette fenêtre de ${Math.round(m.width)} sur ${Math.round(m.height)} pixels CSS${m.usable < m.height ? `, dont ${Math.round(m.usable)} restent libres entre les barres fixes` : ''}.`
      : `The page is ${num(m.pageScreens, 'en')} ${m.pageScreens === 1 ? 'screen' : 'screens'} tall, in this window of ${Math.round(m.width)} by ${Math.round(m.height)} CSS pixels${m.usable < m.height ? `, of which ${Math.round(m.usable)} are left free between fixed bars` : ''}.`,
  ];
  lines.push(
    m.headings === 0
      ? fr
        ? 'La page n’a aucun titre pour sauter d’une partie à l’autre.'
        : 'The page has no heading to jump from one part to the next.'
      : fr
        ? `Elle a ${m.headings} ${m.headings < 2 ? 'titre' : 'titres'}. Le plus long passage sans titre fait ${num(m.stretch.screens, 'fr')}${NBSP}${m.stretch.screens < 2 ? 'écran' : 'écrans'}.`
        : `It has ${m.headings} ${m.headings === 1 ? 'heading' : 'headings'}. The longest stretch with no heading is ${num(m.stretch.screens, 'en')} ${m.stretch.screens === 1 ? 'screen' : 'screens'}.`,
  );
  if (m.mainStart !== null) {
    lines.push(fr ? `Le premier titre du contenu principal est ${screensText(m.mainStart, 'fr')}.` : `The first heading of the main content is ${screensText(m.mainStart, 'en')}.`);
  }
  const last = m.places.find((p) => p.kind === 'last');
  if (last) {
    lines.push(fr ? `La dernière commande est ${screensText(last.screens, 'fr')}.` : `The last control is ${screensText(last.screens, 'en')}.`);
  }
  return lines;
}

export type ScrollNoteKind = 'long-page' | 'main-far' | 'long-stretch' | 'covered' | 'no-to-top' | 'no-headings' | 'submit-far';

/** What the counts point to. Each says what was counted and what it may cost a person who scrolls with effort. */
export function scrollNotes(c: ScrollCheck, lang: Lang): Array<{ readonly kind: ScrollNoteKind; readonly text: string }> {
  if (c.kind !== 'model') return [];
  const fr = lang === 'fr';
  const m = c.model;
  const out: Array<{ kind: ScrollNoteKind; text: string }> = [];
  if (m.pageScreens > LONG_PAGE) {
    out.push({
      kind: 'long-page',
      text: fr
        ? `La page dépasse ${LONG_PAGE}${NBSP}écrans. Pour une personne qui fait défiler avec effort, la couper en pages plus courtes ou ajouter une table des matières en haut réduit le défilement.`
        : `The page is longer than ${LONG_PAGE} screens. For a person who scrolls with effort, shorter pages or a table of contents at the top cut the scrolling.`,
    });
  }
  if (m.mainStart !== null && m.mainStart > MAIN_FAR) {
    out.push({
      kind: 'main-far',
      text: fr
        ? `Le contenu principal commence ${screensText(m.mainStart, 'fr')}. Ce qui le précède se fait défiler à chaque visite, sauf avec un lien d’évitement ou une partie du haut plus courte.`
        : `The main content starts ${screensText(m.mainStart, 'en')}. What comes before it is scrolled past on every visit, unless there is a skip link or a shorter top part.`,
    });
  }
  if (m.headings > 0 && m.stretch.screens > LONG_STRETCH) {
    out.push({
      kind: 'long-stretch',
      text: fr
        ? `Un passage de ${num(m.stretch.screens, 'fr')}${NBSP}écrans n’a aucun titre${m.stretch.endsAt ? `, jusqu’à «${'\u202F'}${m.stretch.endsAt}${'\u202F'}»` : ', jusqu’à la fin de la page'}. Les titres permettent de sauter d’une partie à l’autre sans tout faire défiler.`
        : `A stretch of ${num(m.stretch.screens, 'en')} screens has no heading${m.stretch.endsAt ? `, up to “${m.stretch.endsAt}”` : ', up to the end of the page'}. Headings let a person jump from part to part without scrolling through all of it.`,
    });
  }
  if (m.headings === 0 && m.pageScreens > 1) {
    out.push({
      kind: 'no-headings',
      text: fr
        ? 'Sans titres, il faut tout faire défiler pour trouver une partie de la page.'
        : 'With no headings, finding a part of the page means scrolling through all of it.',
    });
  }
  if (m.coveredShare >= COVERED_SHARE) {
    const pct = Math.round(m.coveredShare * 100);
    out.push({
      kind: 'covered',
      text: fr
        ? `Des barres fixes couvrent ${pct}${NBSP}% de la fenêtre. Chaque écran montre moins de la page, donc il faut défiler davantage, surtout avec un grand zoom.`
        : `Fixed bars cover ${pct}% of the window. Each screen shows less of the page, so it takes more scrolling, above all at a large zoom.`,
    });
  }
  if (m.pageScreens > TO_TOP_FROM && m.toTop === 0) {
    out.push({
      kind: 'no-to-top',
      text: fr
        ? 'Aucun lien ne ramène en haut de la page. Il faut tout remonter en défilant.'
        : 'No link leads back to the top of the page. Getting back there means scrolling all the way up.',
    });
  }
  const far = m.places.filter((p) => p.kind === 'submit' && p.screens > LONG_STRETCH);
  if (far.length > 0) {
    out.push({
      kind: 'submit-far',
      text: fr
        ? `${far.length < 2 ? 'Un bouton d’envoi est' : `${far.length} boutons d’envoi sont`} à plus de ${LONG_STRETCH}${NBSP}écrans du haut. Un formulaire plus court, ou en plusieurs étapes, réduit le chemin.`
        : `${far.length === 1 ? 'A send button is' : `${far.length} send buttons are`} more than ${LONG_STRETCH} screens from the top. A shorter form, or one in steps, shortens the way.`,
    });
  }
  return out;
}

/** The kind of a place, in words. */
export function placeKind(p: ScrollPlace, lang: Lang): string {
  const fr = lang === 'fr';
  if (p.kind === 'heading') return fr ? `Titre de niveau ${p.level ?? 2}` : `Heading, level ${p.level ?? 2}`;
  if (p.kind === 'submit') return fr ? 'Bouton d’envoi' : 'Send button';
  return fr ? 'Dernière commande' : 'Last control';
}

export const placeName = (p: ScrollPlace, lang: Lang): string => (p.name !== '' ? p.name : lang === 'fr' ? 'sans nom' : 'no name');

/** The counts as plain text, to paste into a message or a ticket. */
export function scrollText(c: ScrollCheck, lang: Lang, max = 40): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const lines = [fr ? 'Effort de défilement' : 'Scroll effort', ...scrollSummary(c, lang), ...scrollNotes(c, lang).map((n) => `- ${n.text}`)];
  if (c.kind === 'model') {
    const shown = c.model.places.slice(0, max);
    for (const p of shown) lines.push(`${placeKind(p, lang)}${colon} ${placeName(p, lang)}, ${screensText(p.screens, lang)}`);
    if (c.model.places.length > shown.length) lines.push(fr ? `… et ${c.model.places.length - shown.length} de plus.` : `… and ${c.model.places.length - shown.length} more.`);
  }
  lines.push(
    fr
      ? 'Un écran est la partie de la fenêtre que les barres fixes laissent libre. Ce que fait un coup de défilement varie d’un appareil à l’autre.'
      : 'A screen is the part of the window that fixed bars leave free. How far one scroll goes differs from device to device.',
  );
  return `${lines.join('\n')}\n`;
}
