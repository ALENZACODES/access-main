import { colorDistance, oklchToRgb, rgbToOklch, toHex } from './colorspace.js';
import { auditContrast, composite, contrastRatio, isLargeText, parseColor, resolveBackground, type Rgba } from './contrast.js';
import type { TextSnap } from './inpage.js';
import { NBSP, num, type CheckResult, type Entry, type Lang } from './types.js';

/**
 * Suggestions for a pair of colours whose contrast is below a minimum: the
 * closest lighter and darker colour that reaches it, for the text or for the
 * background, with the hue kept.
 *
 * A suggestion is arithmetic on the two colours that were measured. It is an
 * example, worded as one, and a designer still has to choose. Where no
 * colour can reach the minimum (a mid-tone background can be too light for
 * white text and too dark for black), there is no suggestion and the result
 * says so.
 */

export type Direction = 'darker' | 'lighter';

export interface Candidate {
  /** The suggested colour, as `#rrggbb`. */
  readonly hex: string;
  readonly color: Rgba;
  readonly direction: Direction;
  /** Contrast with the other colour of the pair, cut (never rounded up) to two decimals. */
  readonly ratio: number;
  /** How far the suggestion is from the colour it replaces. Smaller is closer. */
  readonly distance: number;
}

const EPS = 1e-9;
const reaches = (a: Rgba, b: Rgba, required: number): boolean => contrastRatio(a, b) + EPS >= required;
const cut = (ratio: number): number => Math.floor(ratio * 100 + 1e-7) / 100;

/** The ratio as it is shown: two decimals, cut so that 4.499 never reads 4.50. */
export function shownRatio(a: Rgba, b: Rgba): number {
  return cut(contrastRatio(a, b));
}

/** The most contrast any colour can have against this one: black or white, whichever is further. */
export function maxRatioAgainst(color: Rgba): number {
  return Math.max(contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, color), contrastRatio({ r: 255, g: 255, b: 255, a: 1 }, color));
}

/**
 * The colour closest to `color`, in the given direction, that has at least
 * `required` contrast with `against`. It moves along lightness only. Null
 * when even black (darker) or white (lighter) does not reach it.
 */
export function adjust(color: Rgba, against: Rgba, required: number, direction: Direction): Candidate | null {
  const start = rgbToOklch(color);
  const end = direction === 'darker' ? 0 : 1;
  const at = (l: number): Rgba => oklchToRgb({ l, c: start.c, h: start.h });
  if (!reaches(at(end), against, required)) return null;
  if (reaches(color, against, required)) {
    return { hex: toHex(color), color: { ...color, a: 1 }, direction, ratio: shownRatio(color, against), distance: 0 };
  }
  // From a colour that fails, contrast crosses the minimum once on the way to black or to white, so a bisection finds the edge.
  let near = start.l;
  let far = end;
  for (let i = 0; i < 30; i += 1) {
    const mid = (near + far) / 2;
    if (reaches(at(mid), against, required)) far = mid;
    else near = mid;
  }
  // Whole channels can land a hair under the minimum. Step on until the colour that is written down reaches it.
  let l = far;
  let found = at(l);
  const step = direction === 'darker' ? -0.002 : 0.002;
  for (let i = 0; i < 600 && !reaches(found, against, required); i += 1) {
    l = Math.min(1, Math.max(0, l + step));
    found = at(l);
  }
  if (!reaches(found, against, required)) found = at(end);
  return { hex: toHex(found), color: found, direction, ratio: shownRatio(found, against), distance: colorDistance(color, found) };
}

export interface Fix {
  /** Contrast of the pair as given, cut to two decimals. */
  readonly ratio: number;
  readonly required: number;
  readonly meets: boolean;
  /** Text colours that reach the minimum on this background, closest first. Empty when the pair already meets it or none can. */
  readonly text: readonly Candidate[];
  /** Background colours that reach the minimum under this text, closest first. */
  readonly background: readonly Candidate[];
}

function both(color: Rgba, against: Rgba, required: number): Candidate[] {
  const out: Candidate[] = [];
  for (const direction of ['darker', 'lighter'] as const) {
    const c = adjust(color, against, required, direction);
    if (c && !out.some((o) => o.hex === c.hex)) out.push(c);
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/**
 * What would bring a pair of opaque colours to a minimum. A text colour with
 * transparency has to be laid over the background first (`composite`).
 */
export function fixContrast(text: Rgba, background: Rgba, required: number): Fix {
  const ratio = shownRatio(text, background);
  if (reaches(text, background, required)) return { ratio, required, meets: true, text: [], background: [] };
  return { ratio, required, meets: false, text: both(text, background, required), background: both(background, text, required) };
}

/** A measured ratio in words: `4.47:1`, and in French `4,47 : 1` with no-break spaces. */
export const ratioText = (ratio: number, lang: Lang): string => (lang === 'fr' ? `${num(ratio, 'fr')}${NBSP}:${NBSP}1` : `${num(ratio, 'en')}:1`);

/** A minimum in words, with one decimal: `4.5:1`. */
export const minimumText = (required: number, lang: Lang): string => (lang === 'fr' ? `${num(required, 'fr', 1)}${NBSP}:${NBSP}1` : `${num(required, 'en', 1)}:1`);

/** One sentence that gives the closest text colour as an example, or says that none exists on this background. */
export function fixSentence(fix: Fix, lang: Lang): string {
  if (fix.meets) return '';
  const best = fix.text[0];
  if (!best && fix.background.length === 0) {
    return lang === 'fr'
      ? 'Aucune des deux couleurs ne peut atteindre ce minimum en changeant seule. Il faut changer les deux.'
      : 'Neither colour can reach this minimum by changing alone. Both have to change.';
  }
  if (!best) {
    return lang === 'fr'
      ? 'Aucune couleur de texte n’atteint ce minimum sur cet arrière-plan. Il faut changer l’arrière-plan.'
      : 'No text colour reaches this minimum on this background. The background has to change.';
  }
  return lang === 'fr'
    ? `Par exemple, un texte en ${best.hex} donne ${ratioText(best.ratio, 'fr')} sur cet arrière-plan.`
    : `For example, text in ${best.hex} gives ${ratioText(best.ratio, 'en')} on this background.`;
}

/** The fix for one piece of text as the page snapshot holds it, or null when its colours cannot be resolved. */
export function fixForText(el: Pick<TextSnap, 'fg' | 'bgLayers' | 'bgImage' | 'fontSizePx' | 'fontWeight'>): Fix | null {
  const fg = parseColor(el.fg);
  const bg = el.bgImage ? null : resolveBackground(el.bgLayers);
  if (!fg || !bg) return null;
  return fixContrast({ ...composite(fg, bg), a: 1 }, bg, isLargeText(el.fontSizePx, el.fontWeight) ? 3 : 4.5);
}

/**
 * The contrast check, with an example colour added to each failure. Counts,
 * statuses and ids are those of `auditContrast`. Entries that could not be
 * measured stay UNKNOWN and get no suggestion.
 */
export function auditContrastWithFixes(texts: readonly TextSnap[]): CheckResult {
  const base = auditContrast(texts);
  const byId = new Map<string, TextSnap[]>();
  for (const el of texts) byId.set(el.id, [...(byId.get(el.id) ?? []), el]);
  const seen = new Map<string, number>();
  const entries: Entry[] = base.entries.map((e) => {
    if (e.status !== 'fail') return e;
    // Entries come in the order of the texts, so the n-th failure of an id belongs to its n-th failing text.
    const n = seen.get(e.id) ?? 0;
    seen.set(e.id, n + 1);
    const failing = (byId.get(e.id) ?? []).map((el) => fixForText(el)).filter((f): f is Fix => f !== null && !f.meets);
    const fix = failing[n];
    if (!fix) return e;
    return { ...e, message: { en: `${e.message.en} ${fixSentence(fix, 'en')}`, fr: `${e.message.fr} ${fixSentence(fix, 'fr')}` } };
  });
  return { checked: base.checked, entries };
}
