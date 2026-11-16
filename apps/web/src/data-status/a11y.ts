/**
 * Badge palette and WCAG 2.2 contrast helpers. Status is always also shown as text;
 * colour is never the only signal.
 */
import { MIN_TARGET_PX, type FreshnessState } from './dataStatus';

export interface BadgeColours {
  fg: string;
  bg: string;
  border: string;
}

export const PAGE_BG = '#FFFFFF';

export const BADGE_PALETTE: Readonly<Record<FreshnessState, BadgeColours>> = {
  fresh: { fg: '#0B3D1E', bg: '#E6F4EA', border: '#2E7D32' },
  stale: { fg: '#5C3B00', bg: '#FFF4D6', border: '#8A5A00' },
  unknown: { fg: '#1F2937', bg: '#E5E7EB', border: '#4B5563' },
};

function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m || m[1] === undefined) throw new Error(`Invalid colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 1.4.3: 4.5:1 for normal text, 3:1 for large text. */
export function meetsTextAA(fg: string, bg: string, large = false): boolean {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

/** WCAG 1.4.11: 3:1 for UI component boundaries. */
export function meetsNonTextAA(a: string, b: string): boolean {
  return contrastRatio(a, b) >= 3;
}

/** Colour problems for the whole palette; empty when every state passes. */
export function paletteProblems(palette: Readonly<Record<string, BadgeColours>> = BADGE_PALETTE): string[] {
  const out: string[] = [];
  for (const [state, c] of Object.entries(palette)) {
    if (!meetsTextAA(c.fg, c.bg)) out.push(`${state}: text contrast below 4.5:1`);
    if (!meetsNonTextAA(c.border, PAGE_BG)) out.push(`${state}: border contrast below 3:1 on page`);
  }
  return out;
}

export function badgeInlineStyle(state: FreshnessState): string {
  const c = BADGE_PALETTE[state];
  return (
    `display:inline-flex;align-items:center;min-height:${MIN_TARGET_PX}px;padding:0 12px;` +
    `border:2px solid ${c.border};border-radius:6px;background:${c.bg};color:${c.fg}`
  );
}

export function buttonInlineStyle(): string {
  return `min-width:${MIN_TARGET_PX}px;min-height:${MIN_TARGET_PX}px;padding:0 16px;font:inherit`;
}
