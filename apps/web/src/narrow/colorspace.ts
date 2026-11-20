import { parseColor, type Rgba } from './contrast.js';

/**
 * Colour conversions for the contrast suggestions: sRGB to and from OKLCH,
 * so a colour can be made lighter or darker while it keeps its hue, and a
 * reader for the ways a person writes a colour by hand.
 *
 * The OKLab matrices are the published ones by Björn Ottosson (public
 * domain). Everything here is arithmetic: no colour is looked up anywhere.
 */

export interface Oklch {
  /** Lightness, 0 (black) to 1 (white). */
  readonly l: number;
  /** Chroma, 0 for a grey. */
  readonly c: number;
  /** Hue in degrees, 0 to 360. Meaningless when chroma is 0. */
  readonly h: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const toLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const fromLinear = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;

export function rgbToOklch(color: Rgba): Oklch {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  const h = c < 1e-7 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c: c < 1e-7 ? 0 : c, h };
}

/** The colour before any clipping: channels can fall below 0 or above 255 when the colour is outside sRGB. */
function oklchToRaw(color: Oklch): { r: number; g: number; b: number } {
  const hr = (color.h * Math.PI) / 180;
  const A = color.c * Math.cos(hr);
  const B = color.c * Math.sin(hr);
  const l = Math.pow(color.l + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(color.l - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(color.l - 0.0894841775 * A - 1.291485548 * B, 3);
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/** True when the colour can be shown in sRGB, within half a step of an 8-bit channel. */
export function inGamut(color: Oklch): boolean {
  const { r, g, b } = oklchToRaw(color);
  return [r, g, b].every((v) => Number.isFinite(v) && v >= -0.5 && v <= 255.5);
}

/**
 * The sRGB colour for an OKLCH colour, with whole channels. A colour outside
 * sRGB keeps its lightness and hue and gives up chroma until it fits, so a
 * suggestion never changes hue to fit.
 */
export function oklchToRgb(color: Oklch): Rgba {
  // The ends of the lightness scale are black and white whatever the chroma asked for.
  if (color.l >= 0.9999) return { r: 255, g: 255, b: 255, a: 1 };
  if (color.l <= 0.0001) return { r: 0, g: 0, b: 0, a: 1 };
  let fit: Oklch = { l: clamp(color.l, 0, 1), c: Math.max(0, color.c), h: color.h };
  if (!inGamut(fit)) {
    let lo = 0;
    let hi = fit.c;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut({ ...fit, c: mid })) lo = mid;
      else hi = mid;
    }
    fit = { ...fit, c: lo };
  }
  const { r, g, b } = oklchToRaw(fit);
  const ch = (v: number): number => clamp(Math.round(Number.isFinite(v) ? v : 0), 0, 255);
  return { r: ch(r), g: ch(g), b: ch(b), a: 1 };
}

/** `#rrggbb`, lower case. Alpha is not written: callers give an opaque colour. */
export function toHex(color: Rgba): string {
  const h = (v: number): string => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${h(color.r)}${h(color.g)}${h(color.b)}`;
}

/** How far apart two colours look, as the distance in OKLab. 0 for the same colour, about 1 from black to white. */
export function colorDistance(a: Rgba, b: Rgba): number {
  const x = rgbToOklch(a);
  const y = rgbToOklch(b);
  const ax = x.c * Math.cos((x.h * Math.PI) / 180);
  const bx = x.c * Math.sin((x.h * Math.PI) / 180);
  const ay = y.c * Math.cos((y.h * Math.PI) / 180);
  const by = y.c * Math.sin((y.h * Math.PI) / 180);
  return Math.sqrt((x.l - y.l) ** 2 + (ax - ay) ** 2 + (bx - by) ** 2);
}

/** The sixteen basic colour names of CSS. Other names are not read: the tool asks for a value instead. */
export const BASIC_NAMES: Readonly<Record<string, string>> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
};

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * Reads a colour the way a person types one: hex with or without the `#`,
 * `rgb()`, `hsl()`, a basic name, or `transparent`. Null for anything else,
 * including `var()`, `currentColor` and system colours, whose value depends
 * on where they are used.
 */
export function readColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === '') return null;
  const named = BASIC_NAMES[s];
  if (named) return parseColor(named);
  if (/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) return parseColor(`#${s}`);
  const hsl = /^hsla?\(([^)]*)\)$/.exec(s);
  if (hsl) {
    const parts = (hsl[1] ?? '').split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const hm = /^(-?\d*\.?\d+)(deg)?$/.exec(parts[0] ?? '');
    const sm = /^(\d*\.?\d+)%$/.exec(parts[1] ?? '');
    const lm = /^(\d*\.?\d+)%$/.exec(parts[2] ?? '');
    const am = parts.length === 4 ? /^(\d*\.?\d+)(%?)$/.exec(parts[3] ?? '') : null;
    if (!hm || !sm || !lm || (parts.length === 4 && !am)) return null;
    const a = am ? clamp(Number(am[1]) / (am[2] === '%' ? 100 : 1), 0, 1) : 1;
    const { r, g, b } = hslToRgb(Number(hm[1]), clamp(Number(sm[1]), 0, 100) / 100, clamp(Number(lm[1]), 0, 100) / 100);
    return { r, g, b, a };
  }
  return parseColor(s);
}
