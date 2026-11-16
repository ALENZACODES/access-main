/**
 * Colour and size tokens for shell routes. Each text/background pair is checked
 * against WCAG AAA (7:1) in the test suite. Source: original values chosen for
 * this app; no third-party palette (licence: project licence, 2026-11-15).
 */

export interface ThemeTokens {
  readonly text: string;
  readonly mutedText: string;
  readonly background: string;
  readonly focusRing: string;
  readonly focusHalo: string;
}

export const LIGHT: ThemeTokens = {
  text: '#1a1a1a',
  mutedText: '#4a4a4a',
  background: '#ffffff',
  focusRing: '#003a8c',
  focusHalo: '#ffffff',
};

export const DARK: ThemeTokens = {
  text: '#f2f2f2',
  mutedText: '#c8c8c8',
  background: '#121212',
  focusRing: '#ffd54f',
  focusHalo: '#121212',
};

/** Minimum touch target edge in CSS px (project rule; WCAG 2.5.5 AAA is 44). */
export const MIN_TARGET_PX = 44;
/** Minimum gap between adjacent targets in CSS px. */
export const TARGET_GAP_PX = 8;
export const FOCUS_RING_PX = 3;
export const FOCUS_OFFSET_PX = 2;
