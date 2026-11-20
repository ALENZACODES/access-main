import { NBSP, type Lang } from './types.js';

/**
 * What the browser says about the screen and the settings of the person
 * using the App: width, text size, motion, contrast, pointer. It reads only
 * what the browser offers to any page and sends nothing anywhere.
 *
 * A setting the browser does not report is UNKNOWN. It is never guessed: a
 * browser with no answer for "reduced motion" is not shown as "motion on".
 */

/** The parts of the browser this module reads, so it can be driven without one. */
export interface DeviceEnv {
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  /** Returns whether a media query matches, or null when the browser cannot evaluate it. */
  readonly media?: (query: string) => boolean | null;
  /** Computed font size of the root element in CSS pixels, or null. */
  readonly rootFontSizePx?: () => number | null;
}

export type Fact<T> = { readonly known: true; readonly value: T } | { readonly known: false };

const known = <T>(value: T): Fact<T> => ({ known: true, value });
const UNKNOWN_FACT = { known: false } as const;

export interface DeviceFacts {
  /** Width of the page area in CSS pixels. */
  readonly width: Fact<number>;
  readonly height: Fact<number>;
  /** Text size against the browser default of 16 CSS pixels: 1.5 means 150%. */
  readonly textScale: Fact<number>;
  readonly reducedMotion: Fact<boolean>;
  readonly moreContrast: Fact<boolean>;
  readonly forcedColors: Fact<boolean>;
  readonly darkScheme: Fact<boolean>;
  /** A finger or another pointer that is not precise. */
  readonly coarsePointer: Fact<boolean>;
  readonly canHover: Fact<boolean>;
  readonly portrait: Fact<boolean>;
}

export const DEFAULT_FONT_PX = 16;

function size(n: number | undefined): Fact<number> {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? known(Math.round(n)) : UNKNOWN_FACT;
}

/**
 * A yes or no from a media feature. The browser has to match one of the two
 * values of the feature to count as an answer. A browser that does not know
 * the feature matches neither, and the fact stays UNKNOWN.
 */
function feature(env: DeviceEnv, yes: string, no: string): Fact<boolean> {
  if (!env.media) return UNKNOWN_FACT;
  const a = env.media(yes);
  const b = env.media(no);
  if (a === true) return known(true);
  if (b === true) return known(false);
  return UNKNOWN_FACT;
}

export function readDeviceFacts(env: DeviceEnv): DeviceFacts {
  const font = env.rootFontSizePx ? env.rootFontSizePx() : null;
  return {
    width: size(env.innerWidth),
    height: size(env.innerHeight),
    textScale: typeof font === 'number' && Number.isFinite(font) && font > 0 ? known(Math.round((font / DEFAULT_FONT_PX) * 100) / 100) : UNKNOWN_FACT,
    reducedMotion: feature(env, '(prefers-reduced-motion: reduce)', '(prefers-reduced-motion: no-preference)'),
    moreContrast: feature(env, '(prefers-contrast: more)', '(prefers-contrast: no-preference)'),
    forcedColors: feature(env, '(forced-colors: active)', '(forced-colors: none)'),
    darkScheme: feature(env, '(prefers-color-scheme: dark)', '(prefers-color-scheme: light)'),
    coarsePointer: feature(env, '(pointer: coarse)', '(pointer: fine)'),
    canHover: feature(env, '(hover: hover)', '(hover: none)'),
    portrait: feature(env, '(orientation: portrait)', '(orientation: landscape)'),
  };
}

/** The browser this code runs in, as a `DeviceEnv`. Every member is missing outside a browser. */
export function browserEnv(): DeviceEnv {
  const g = globalThis as unknown as {
    innerWidth?: number;
    innerHeight?: number;
    matchMedia?: (q: string) => { matches: boolean; media?: string };
    document?: { documentElement?: unknown };
    getComputedStyle?: (el: unknown) => { fontSize?: string };
  };
  return {
    ...(typeof g.innerWidth === 'number' ? { innerWidth: g.innerWidth } : {}),
    ...(typeof g.innerHeight === 'number' ? { innerHeight: g.innerHeight } : {}),
    ...(typeof g.matchMedia === 'function'
      ? {
          media: (query: string): boolean | null => {
            try {
              const m = (g.matchMedia as (q: string) => { matches: boolean; media?: string })(query);
              // A query the browser cannot parse comes back as "not all".
              return m.media === 'not all' ? null : m.matches;
            } catch {
              return null;
            }
          },
        }
      : {}),
    rootFontSizePx: (): number | null => {
      const root = g.document?.documentElement;
      if (!root || typeof g.getComputedStyle !== 'function') return null;
      try {
        const px = Number.parseFloat(g.getComputedStyle(root).fontSize ?? '');
        return Number.isFinite(px) && px > 0 ? px : null;
      } catch {
        return null;
      }
    },
  };
}

export type FactKey = keyof DeviceFacts;

export const FACT_ORDER: readonly FactKey[] = ['width', 'height', 'textScale', 'portrait', 'coarsePointer', 'canHover', 'reducedMotion', 'moreContrast', 'forcedColors', 'darkScheme'];

const LABELS: Readonly<Record<FactKey, { readonly en: string; readonly fr: string }>> = {
  width: { en: 'Width of the page area', fr: 'Largeur de la zone de page' },
  height: { en: 'Height of the page area', fr: 'Hauteur de la zone de page' },
  textScale: { en: 'Text size', fr: 'Taille du texte' },
  portrait: { en: 'Orientation', fr: 'Orientation' },
  coarsePointer: { en: 'Pointer', fr: 'Pointeur' },
  canHover: { en: 'Hover', fr: 'Survol' },
  reducedMotion: { en: 'Reduced motion', fr: 'Réduction des animations' },
  moreContrast: { en: 'More contrast', fr: 'Contraste accru' },
  forcedColors: { en: 'Forced colours', fr: 'Couleurs forcées' },
  darkScheme: { en: 'Colour scheme', fr: 'Jeu de couleurs' },
};

const YES_NO: Readonly<Record<'reducedMotion' | 'moreContrast' | 'forcedColors' | 'canHover', readonly [{ en: string; fr: string }, { en: string; fr: string }]>> = {
  reducedMotion: [{ en: 'asked for', fr: 'demandée' }, { en: 'not asked for', fr: 'non demandée' }],
  moreContrast: [{ en: 'asked for', fr: 'demandé' }, { en: 'not asked for', fr: 'non demandé' }],
  forcedColors: [{ en: 'on', fr: 'activées' }, { en: 'off', fr: 'désactivées' }],
  canHover: [{ en: 'available', fr: 'disponible' }, { en: 'not available', fr: 'non disponible' }],
};

export interface FactLine {
  readonly key: FactKey;
  readonly label: string;
  /** The value in words, or the token UNKNOWN. */
  readonly value: string;
  readonly known: boolean;
}

/** The value of one fact in words. A fact the browser did not report reads UNKNOWN in both languages. */
export function factValue(key: FactKey, facts: DeviceFacts, lang: Lang): string {
  const fr = lang === 'fr';
  switch (key) {
    case 'width':
    case 'height': {
      const f = facts[key];
      return f.known ? (fr ? `${f.value}${NBSP}pixels CSS` : `${f.value} CSS pixels`) : 'UNKNOWN';
    }
    case 'textScale': {
      const f = facts.textScale;
      if (!f.known) return 'UNKNOWN';
      const pct = Math.round(f.value * 100);
      return fr ? `${pct}${NBSP}% de la taille par défaut du navigateur` : `${pct}% of the browser default`;
    }
    case 'portrait': {
      const f = facts.portrait;
      return f.known ? (f.value ? 'portrait' : fr ? 'paysage' : 'landscape') : 'UNKNOWN';
    }
    case 'coarsePointer': {
      const f = facts.coarsePointer;
      return f.known ? (f.value ? (fr ? 'doigt ou pointeur peu précis' : 'finger or another coarse pointer') : fr ? 'souris ou pointeur précis' : 'mouse or another fine pointer') : 'UNKNOWN';
    }
    case 'darkScheme': {
      const f = facts.darkScheme;
      return f.known ? (f.value ? (fr ? 'sombre' : 'dark') : fr ? 'clair' : 'light') : 'UNKNOWN';
    }
    default: {
      const f = facts[key];
      return f.known ? YES_NO[key][f.value ? 0 : 1][lang] : 'UNKNOWN';
    }
  }
}

export function describeFacts(facts: DeviceFacts, lang: Lang): FactLine[] {
  return FACT_ORDER.map((key) => ({ key, label: LABELS[key][lang], value: factValue(key, facts, lang), known: facts[key].known }));
}

/** The facts as plain text, one per line, for a report a person shares. */
export function factsAsText(facts: DeviceFacts, lang: Lang): string {
  const colon = lang === 'fr' ? `${NBSP}:` : ':';
  return describeFacts(facts, lang)
    .map((l) => `${l.label}${colon} ${l.value}`)
    .join('\n');
}

export type WidthBand = 'narrowest' | 'narrow' | 'medium' | 'wide';

/** Where a width falls. `narrowest` is the 320 CSS pixels WCAG 1.4.10 names; a page that fits there fits a phone, and a desktop zoomed to 400%. */
export function widthBand(width: number): WidthBand {
  if (width <= 320) return 'narrowest';
  if (width <= 480) return 'narrow';
  if (width <= 1024) return 'medium';
  return 'wide';
}

/**
 * One or two sentences on what the facts mean for the checks on this page.
 * They say what the checks look for at this size. They do not say that the
 * page works.
 */
export function fitNotes(facts: DeviceFacts, lang: Lang): string[] {
  const fr = lang === 'fr';
  const out: string[] = [];
  if (!facts.width.known) {
    out.push(fr ? 'Le navigateur n’indique pas la largeur de la page. Les contrôles ne peuvent pas dire à quelle largeur ils ont regardé.' : 'The browser does not report the width of the page. The checks cannot say at which width they looked.');
  } else {
    const band = widthBand(facts.width.value);
    if (band === 'narrowest') {
      out.push(
        fr
          ? 'C’est la largeur la plus étroite que nomment les WCAG (320 pixels CSS). À cette largeur, les contrôles cherchent le contenu coupé ou qui défile de côté.'
          : 'This is the narrowest width WCAG names (320 CSS pixels). At this width the checks look for content that is cut off or scrolls sideways.',
      );
    } else if (band === 'narrow') {
      out.push(fr ? 'C’est une largeur de téléphone. Les contrôles cherchent le contenu coupé ou qui défile de côté.' : 'This is a phone width. The checks look for content that is cut off or scrolls sideways.');
    } else {
      out.push(
        fr
          ? 'À cette largeur, les problèmes d’écran étroit n’apparaissent pas. Réduisez la fenêtre ou zoomez pour les faire apparaître.'
          : 'At this width, narrow-screen problems do not show. Narrow the window or zoom in to bring them out.',
      );
    }
  }
  if (facts.textScale.known && facts.textScale.value >= 1.25) {
    out.push(
      fr
        ? `Votre texte est réglé à ${Math.round(facts.textScale.value * 100)}${NBSP}% de la taille par défaut. Si un texte est coupé ou recouvert, signalez-le avec le formulaire ci-dessous.`
        : `Your text is set to ${Math.round(facts.textScale.value * 100)}% of the default size. If any text is cut off or covered, tell us with the form below.`,
    );
  }
  if (facts.coarsePointer.known && facts.coarsePointer.value) {
    out.push(fr ? 'Avec un doigt, les contrôles attendent des cibles d’au moins 44 pixels CSS.' : 'With a finger, the checks expect targets of at least 44 CSS pixels.');
  }
  return out;
}
