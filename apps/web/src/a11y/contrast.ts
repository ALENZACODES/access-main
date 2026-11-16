/**
 * WCAG 2.x contrast maths (relative luminance and contrast ratio).
 * Pure functions, no DOM. Formulae: https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */

export type Rgb = readonly [number, number, number];
export type ContrastLevel = 'AA' | 'AAA';

export const NON_TEXT_MIN_RATIO = 3;

export function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return null;
  let digits = m[1] ?? '';
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = Number.parseInt(digits, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function linearise(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb;
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** Throws RangeError on an unparseable colour: never guess. */
export function contrastRatio(foreground: string, background: string): number {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (fg === null || bg === null) {
    throw new RangeError(`Unsupported colour: ${fg === null ? foreground : background}`);
  }
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

export function requiredRatio(level: ContrastLevel, largeText = false): number {
  if (level === 'AAA') return largeText ? 4.5 : 7;
  return largeText ? 3 : 4.5;
}

export function meetsContrast(
  foreground: string,
  background: string,
  level: ContrastLevel = 'AAA',
  largeText = false,
): boolean {
  return contrastRatio(foreground, background) >= requiredRatio(level, largeText);
}
