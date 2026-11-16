import type { TextSnap } from './inpage.js';
import { NBSP, num, type CheckResult, type Entry } from './types.js';

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

function channel(tok: string): number | null {
  const m = /^(-?\d*\.?\d+)(%?)$/.exec(tok);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === '%' ? clamp(v, 0, 100) * 2.55 : clamp(v, 0, 255);
}

function alpha(tok: string): number | null {
  const m = /^(-?\d*\.?\d+)(%?)$/.exec(tok);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === '%' ? clamp(v, 0, 100) / 100 : clamp(v, 0, 1);
}

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() (comma or space syntax) and "transparent". */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1] ?? '';
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const at = (i: number): number => parseInt(h.slice(i, i + 2), 16);
    return { r: at(0), g: at(2), b: at(4), a: h.length === 8 ? at(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(s);
  if (!fn) return null;
  const parts = (fn[1] ?? '').split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const r = channel(parts[0] ?? '');
  const g = channel(parts[1] ?? '');
  const b = channel(parts[2] ?? '');
  const a = parts.length === 4 ? alpha(parts[3] ?? '') : 1;
  if (r === null || g === null || b === null || a === null) return null;
  return { r, g, b, a };
}

/** Source-over compositing of fg on bg. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (f: number, b: number): number => (f * fg.a + b * bg.a * (1 - fg.a)) / a;
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a };
}

export function luminance(c: Rgba): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** Contrast ratio of two opaque colours. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG large text: 24px, or 18.66px (14pt) and bold. */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

/**
 * Layers run from the element outwards. Finds the first opaque layer and
 * composites the layers above it. No opaque layer means the backdrop is
 * unknown (null), not white.
 */
export function resolveBackground(layers: readonly string[]): Rgba | null {
  const parsed: Rgba[] = [];
  for (const l of layers) {
    const c = parseColor(l);
    if (!c) return null;
    parsed.push(c);
  }
  const base = parsed.findIndex((c) => c.a >= 1);
  if (base === -1) return null;
  let acc = parsed[base];
  if (!acc) return null;
  for (let i = base - 1; i >= 0; i--) {
    const c = parsed[i];
    if (c) acc = composite(c, acc);
  }
  return acc;
}

export interface ContrastInput {
  readonly fg: string;
  readonly bgLayers: readonly string[];
  readonly bgImage: boolean;
  readonly fontSizePx: number;
  readonly fontWeight: number;
}

export interface ContrastVerdict {
  readonly status: 'pass' | 'fail' | 'unknown';
  readonly ratio: number | null;
  readonly required: number;
}

export function evaluateContrast(i: ContrastInput): ContrastVerdict {
  const required = isLargeText(i.fontSizePx, i.fontWeight) ? 3 : 4.5;
  const fg = parseColor(i.fg);
  const bg = i.bgImage ? null : resolveBackground(i.bgLayers);
  if (!fg || !bg) return { status: 'unknown', ratio: null, required };
  const ratio = contrastRatio(composite(fg, bg), bg);
  // Floor to 2 decimals so a displayed 4.50 never hides a fail.
  const shown = Math.floor(ratio * 100) / 100;
  return { status: ratio + 1e-9 >= required ? 'pass' : 'fail', ratio: shown, required };
}

export function auditContrast(texts: readonly TextSnap[]): CheckResult {
  const entries: Entry[] = [];
  for (const el of texts) {
    const v = evaluateContrast(el);
    if (v.status === 'pass') continue;
    if (v.status === 'unknown' || v.ratio === null) {
      entries.push({
        check: 'contrast',
        id: el.id,
        status: 'unknown',
        message: {
          en: 'Text contrast could not be measured (background is an image or cannot be resolved).',
          fr: 'Le contraste du texte n’a pas pu être mesuré (arrière-plan en image ou non déterminable).',
        },
      });
    } else {
      entries.push({
        check: 'contrast',
        id: el.id,
        status: 'fail',
        message: {
          en: `Text contrast is ${num(v.ratio, 'en')}:1, below the ${num(v.required, 'en', 1)}:1 minimum.`,
          fr: `Le contraste du texte est de ${num(v.ratio, 'fr')}${NBSP}:${NBSP}1, sous le minimum de ${num(v.required, 'fr', 1)}${NBSP}:${NBSP}1.`,
        },
      });
    }
  }
  return { checked: texts.length, entries };
}
