import { describe, expect, it } from 'vitest';
import {
  auditContrast,
  composite,
  contrastRatio,
  evaluateContrast,
  isLargeText,
  parseColor,
  resolveBackground,
} from './contrast.js';
import type { TextSnap } from './inpage.js';

const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };

describe('parseColor', () => {
  it('reads hex, rgb and rgba forms', () => {
    expect(parseColor('#fff')).toEqual(WHITE);
    expect(parseColor('#000000')).toEqual(BLACK);
    expect(parseColor('#00000080')?.a).toBeCloseTo(0.5, 1);
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('rgb(100%, 0%, 0%)')?.r).toBeCloseTo(255, 5);
    expect(parseColor('transparent')?.a).toBe(0);
  });
  it('rejects things it cannot read', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor('hsl(10, 10%, 10%)')).toBeNull();
    expect(parseColor('rgb(1, 2)')).toBeNull();
    expect(parseColor('var(--x)')).toBeNull();
  });
});

describe('ratios', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    const grey = parseColor('#767676');
    const lighter = parseColor('#777777');
    expect(grey && contrastRatio(grey, WHITE)).toBeGreaterThan(4.5);
    expect(lighter && contrastRatio(lighter, WHITE)).toBeLessThan(4.5);
  });
  it('composites alpha over a backdrop', () => {
    const out = composite({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE);
    expect(out.r).toBeCloseTo(127.5, 5);
    expect(out.a).toBe(1);
  });
  it('knows what large text is', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 400)).toBe(false);
    expect(isLargeText(16, 700)).toBe(false);
  });
});

describe('resolveBackground', () => {
  it('uses the first opaque layer and composites above it', () => {
    const bg = resolveBackground(['rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    expect(bg?.r).toBeCloseTo(127.5, 5);
  });
  it('is unknown when no layer is opaque or a layer cannot be read', () => {
    expect(resolveBackground(['rgba(0, 0, 0, 0)'])).toBeNull();
    expect(resolveBackground(['rgba(0, 0, 0, 0)', 'var(--x)'])).toBeNull();
    expect(resolveBackground([])).toBeNull();
  });
});

describe('evaluateContrast', () => {
  const base = { bgLayers: ['rgb(255, 255, 255)'], bgImage: false, fontSizePx: 16, fontWeight: 400 };
  it('passes, fails and uses the large text threshold', () => {
    expect(evaluateContrast({ ...base, fg: '#000' }).status).toBe('pass');
    expect(evaluateContrast({ ...base, fg: '#777' }).status).toBe('fail');
    expect(evaluateContrast({ ...base, fg: '#777', fontSizePx: 24 }).status).toBe('pass');
  });
  it('reports unknown for images and unreadable colours, never a pass', () => {
    expect(evaluateContrast({ ...base, fg: '#000', bgImage: true }).status).toBe('unknown');
    expect(evaluateContrast({ ...base, fg: 'currentcolor' }).status).toBe('unknown');
    expect(evaluateContrast({ ...base, fg: '#000', bgLayers: ['rgba(0, 0, 0, 0)'] }).status).toBe('unknown');
  });
  it('floors the displayed ratio so 4.5 never hides a fail', () => {
    const v = evaluateContrast({ ...base, fg: '#777' });
    expect(v.ratio).toBeLessThan(4.5);
  });
});

describe('auditContrast', () => {
  const el = (id: string, fg: string): TextSnap => ({
    id,
    text: 'x',
    fg,
    bgLayers: ['rgb(255, 255, 255)'],
    bgImage: false,
    fontSizePx: 16,
    fontWeight: 400,
  });
  it('returns entries only for fails and unknowns', () => {
    const r = auditContrast([el('a', '#000'), el('b', '#777'), el('c', 'nope')]);
    expect(r.checked).toBe(3);
    expect(r.entries.map((e) => [e.id, e.status])).toEqual([
      ['b', 'fail'],
      ['c', 'unknown'],
    ]);
    expect(r.entries[0]?.message.fr).toContain('contraste');
  });
});
