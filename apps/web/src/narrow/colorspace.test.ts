import { describe, expect, it } from 'vitest';
import { BASIC_NAMES, colorDistance, inGamut, oklchToRgb, readColor, rgbToOklch, toHex } from './colorspace.js';
import { contrastRatio, parseColor, type Rgba } from './contrast.js';

const rgb = (hex: string): Rgba => {
  const c = parseColor(hex);
  if (!c) throw new Error(hex);
  return c;
};

describe('rgbToOklch', () => {
  it('puts black at lightness 0 and white at lightness 1, both with no chroma', () => {
    expect(rgbToOklch(rgb('#000000'))).toEqual({ l: 0, c: 0, h: 0 });
    const white = rgbToOklch(rgb('#ffffff'));
    expect(white.l).toBeCloseTo(1, 5);
    expect(white.c).toBe(0);
  });

  it('gives every grey zero chroma', () => {
    for (const v of [1, 17, 64, 128, 200, 254]) {
      const g = rgbToOklch({ r: v, g: v, b: v, a: 1 });
      expect(g.c, String(v)).toBe(0);
      expect(g.h, String(v)).toBe(0);
    }
  });

  it('orders greys by lightness', () => {
    let last = -1;
    for (let v = 0; v <= 255; v += 15) {
      const l = rgbToOklch({ r: v, g: v, b: v, a: 1 }).l;
      expect(l).toBeGreaterThan(last);
      last = l;
    }
  });

  it('matches the published values for the primaries', () => {
    const red = rgbToOklch(rgb('#ff0000'));
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
    const green = rgbToOklch(rgb('#00ff00'));
    expect(green.l).toBeCloseTo(0.8664, 3);
    expect(green.h).toBeCloseTo(142.5, 1);
    const blue = rgbToOklch(rgb('#0000ff'));
    expect(blue.l).toBeCloseTo(0.452, 3);
    expect(blue.h).toBeCloseTo(264.05, 1);
  });

  it('keeps the hue between 0 and 360', () => {
    for (const hex of ['#ff00ff', '#00ffff', '#ff8800', '#123456', '#fedcba']) {
      const h = rgbToOklch(rgb(hex)).h;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe('oklchToRgb', () => {
  it('brings every colour of a grid back to itself', () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const c: Rgba = { r, g, b, a: 1 };
          expect(toHex(oklchToRgb(rgbToOklch(c))), toHex(c)).toBe(toHex(c));
        }
      }
    }
  });

  it('brings the colours of the App back to themselves', () => {
    for (const hex of ['#f4f1ea', '#fffdf8', '#1b1916', '#3d3832', '#083734', '#ffd84a', '#6b2d12', '#efe4cc', '#084640', '#ffbf47']) {
      expect(toHex(oklchToRgb(rgbToOklch(rgb(hex))))).toBe(hex);
    }
  });

  it('gives whole channels and an opaque colour', () => {
    const c = oklchToRgb({ l: 0.5, c: 0.1, h: 200 });
    for (const v of [c.r, c.g, c.b]) expect(Number.isInteger(v)).toBe(true);
    expect(c.a).toBe(1);
  });

  it('gives up chroma, not hue or lightness, for a colour outside sRGB', () => {
    const wanted = { l: 0.9, c: 0.4, h: 29 };
    expect(inGamut(wanted)).toBe(false);
    const back = rgbToOklch(oklchToRgb(wanted));
    expect(back.c).toBeLessThan(0.4);
    expect(back.l).toBeCloseTo(0.9, 1);
    expect(Math.abs(back.h - 29)).toBeLessThan(4);
  });

  it('gives black and white at the ends whatever the chroma', () => {
    expect(toHex(oklchToRgb({ l: 0, c: 0.3, h: 120 }))).toBe('#000000');
    expect(toHex(oklchToRgb({ l: 1, c: 0.3, h: 120 }))).toBe('#ffffff');
  });

  it('clamps a lightness outside 0 to 1 and a negative chroma', () => {
    expect(toHex(oklchToRgb({ l: -2, c: 0, h: 0 }))).toBe('#000000');
    expect(toHex(oklchToRgb({ l: 3, c: 0, h: 0 }))).toBe('#ffffff');
    expect(toHex(oklchToRgb({ l: 0.5, c: -1, h: 0 }))).toBe(toHex(oklchToRgb({ l: 0.5, c: 0, h: 0 })));
  });

  it('gets darker as lightness goes down, for a fixed hue', () => {
    const white = rgb('#ffffff');
    let last = 0;
    for (let l = 0.95; l >= 0.05; l -= 0.1) {
      const ratio = contrastRatio(oklchToRgb({ l, c: 0.08, h: 250 }), white);
      expect(ratio).toBeGreaterThan(last);
      last = ratio;
    }
  });
});

describe('inGamut', () => {
  it('holds for every sRGB colour and fails for a chroma no screen in sRGB shows', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#808080']) expect(inGamut(rgbToOklch(rgb(hex))), hex).toBe(true);
    expect(inGamut({ l: 0.5, c: 0.5, h: 140 })).toBe(false);
  });
});

describe('toHex', () => {
  it('writes six lower-case digits', () => {
    expect(toHex({ r: 255, g: 216, b: 74, a: 1 })).toBe('#ffd84a');
    expect(toHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
    expect(toHex({ r: 8, g: 55, b: 52, a: 1 })).toBe('#083734');
  });

  it('rounds and clamps channels, and leaves alpha out', () => {
    expect(toHex({ r: 127.5, g: -4, b: 300, a: 0.2 })).toBe('#8000ff');
  });
});

describe('colorDistance', () => {
  it('is zero for the same colour and about one from black to white', () => {
    expect(colorDistance(rgb('#123456'), rgb('#123456'))).toBe(0);
    expect(colorDistance(rgb('#000000'), rgb('#ffffff'))).toBeCloseTo(1, 3);
  });

  it('is the same in both directions and grows with the difference', () => {
    const a = rgb('#777777');
    expect(colorDistance(a, rgb('#767676'))).toBeCloseTo(colorDistance(rgb('#767676'), a), 12);
    expect(colorDistance(a, rgb('#767676'))).toBeLessThan(colorDistance(a, rgb('#555555')));
    expect(colorDistance(a, rgb('#555555'))).toBeLessThan(colorDistance(a, rgb('#000000')));
  });

  it('sees a change of hue at the same lightness', () => {
    expect(colorDistance(rgb('#ff0000'), rgb('#00ff00'))).toBeGreaterThan(0.3);
  });
});

describe('readColor', () => {
  it.each([
    ['#1b1916', '#1b1916'],
    ['1B1916', '#1b1916'],
    ['  #FFF  ', '#ffffff'],
    ['fff', '#ffffff'],
    ['rgb(27 25 22)', '#1b1916'],
    ['rgb(27, 25, 22)', '#1b1916'],
    ['white', '#ffffff'],
    ['Black', '#000000'],
    ['grey', '#808080'],
    ['gray', '#808080'],
    ['teal', '#008080'],
    ['hsl(0 100% 50%)', '#ff0000'],
    ['hsl(120, 100%, 50%)', '#00ff00'],
    ['hsl(240deg 100% 50%)', '#0000ff'],
    ['hsl(0 0% 50%)', '#808080'],
    ['hsl(60 100% 50%)', '#ffff00'],
    ['hsl(180 100% 50%)', '#00ffff'],
    ['hsl(300 100% 50%)', '#ff00ff'],
    ['hsl(-120 100% 50%)', '#0000ff'],
    ['hsl(480 100% 50%)', '#00ff00'],
    ['hsl(36 10% 10%)', '#1c1a17'],
  ])('reads %j as %s', (input, hex) => {
    const c = readColor(input);
    expect(c).not.toBeNull();
    expect(toHex(c as Rgba)).toBe(hex);
    expect((c as Rgba).a).toBe(1);
  });

  it.each(['', '   ', 'var(--ink)', 'currentColor', 'Canvas', 'rebeccapurple', 'oklch(0.5 0.1 200)', '#12', '#12345', 'ggg', 'hsl(0 100 50)', 'hsl(0 100%)', 'hsl(red 100% 50%)', 'hsl(0 100% 50% / x)', 'rgb(1 2)', 'blue-ish', '12px'])(
    'does not read %j',
    (input) => {
      expect(readColor(input)).toBeNull();
    },
  );

  it('keeps transparency from hex, rgb and hsl', () => {
    expect(readColor('#00000080')?.a).toBeCloseTo(0.502, 2);
    expect(readColor('rgb(0 0 0 / 50%)')?.a).toBe(0.5);
    expect(readColor('hsl(0 100% 50% / 0.25)')?.a).toBe(0.25);
    expect(readColor('hsla(0, 100%, 50%, 50%)')?.a).toBe(0.5);
    expect(readColor('transparent')?.a).toBe(0);
  });

  it('has the sixteen basic names, with both spellings of grey, all readable', () => {
    expect(Object.keys(BASIC_NAMES)).toHaveLength(17);
    for (const [name, hex] of Object.entries(BASIC_NAMES)) expect(toHex(readColor(name) as Rgba), name).toBe(hex);
  });
});
