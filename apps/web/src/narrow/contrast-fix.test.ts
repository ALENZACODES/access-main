import { describe, expect, it } from 'vitest';
import { colorDistance, readColor, rgbToOklch, toHex } from './colorspace.js';
import { adjust, auditContrastWithFixes, fixContrast, fixForText, fixSentence, maxRatioAgainst, minimumText, ratioText, shownRatio } from './contrast-fix.js';
import { auditContrast, contrastRatio, type Rgba } from './contrast.js';
import { noFrIssues } from './expect-fr.js';
import { frTypographyIssues } from './i18n.js';
import type { TextSnap } from './inpage.js';
import { NBSP } from './types.js';

const c = (s: string): Rgba => {
  const v = readColor(s);
  if (!v) throw new Error(s);
  return v;
};
const snap = (id: string, fg: string, bg: string, over: Partial<TextSnap> = {}): TextSnap => ({ id, text: 'Sample', fg, bgLayers: [bg], bgImage: false, fontSizePx: 16, fontWeight: 400, ...over });

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['#777777', '#ffffff'],
  ['#999999', '#fffdf8'],
  ['#ffd84a', '#ffffff'],
  ['#ff0000', '#777777'],
  ['#3d3832', '#1b1916'],
  ['#0000ff', '#000080'],
  ['#808080', '#7a7a7a'],
  ['#00ff00', '#ffff00'],
  ['#6b2d12', '#083734'],
  ['#f4f1ea', '#efe4cc'],
];

describe('shownRatio', () => {
  it('cuts to two decimals and never rounds up', () => {
    expect(shownRatio(c('#777777'), c('#ffffff'))).toBe(4.47);
    expect(contrastRatio(c('#777777'), c('#ffffff'))).toBeGreaterThan(4.47);
    expect(shownRatio(c('#000000'), c('#ffffff'))).toBe(21);
    expect(shownRatio(c('#123456'), c('#123456'))).toBe(1);
  });

  it('is the same whichever colour comes first', () => {
    expect(shownRatio(c('#083734'), c('#ffd84a'))).toBe(shownRatio(c('#ffd84a'), c('#083734')));
  });
});

describe('maxRatioAgainst', () => {
  it('is 21 against black or white and lowest against a mid grey', () => {
    expect(maxRatioAgainst(c('#ffffff'))).toBeCloseTo(21, 6);
    expect(maxRatioAgainst(c('#000000'))).toBeCloseTo(21, 6);
    expect(maxRatioAgainst(c('#777777'))).toBeLessThan(5);
    expect(maxRatioAgainst(c('#777777'))).toBeGreaterThan(4.5);
  });
});

describe('adjust', () => {
  it('finds #767676 as the closest darker grey on white for 4.5 to 1', () => {
    const found = adjust(c('#777777'), c('#ffffff'), 4.5, 'darker');
    expect(found?.hex).toBe('#767676');
    expect(found?.ratio).toBe(4.54);
    expect(found?.direction).toBe('darker');
  });

  it('gives no lighter colour when white itself does not reach the minimum', () => {
    expect(adjust(c('#777777'), c('#ffffff'), 4.5, 'lighter')).toBeNull();
    expect(adjust(c('#ffd84a'), c('#ffffff'), 3, 'lighter')).toBeNull();
  });

  it('gives no darker colour when black itself does not reach the minimum', () => {
    expect(adjust(c('#3d3832'), c('#1b1916'), 4.5, 'darker')).toBeNull();
  });

  it('gives back the same colour, at distance 0, when it already reaches the minimum', () => {
    const found = adjust(c('#1b1916'), c('#fffdf8'), 4.5, 'darker');
    expect(found?.hex).toBe('#1b1916');
    expect(found?.distance).toBe(0);
  });

  it('always reaches the minimum with the colour that is written down', () => {
    for (const [fg, bg] of PAIRS) {
      for (const required of [3, 4.5, 7]) {
        for (const direction of ['darker', 'lighter'] as const) {
          const found = adjust(c(fg), c(bg), required, direction);
          if (!found) continue;
          const written = c(found.hex);
          expect(contrastRatio(written, c(bg)) + 1e-9, `${fg} on ${bg} ${direction} ${required}`).toBeGreaterThanOrEqual(required);
          expect(found.ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(required);
        }
      }
    }
  });

  it('is null exactly when black or white does not reach the minimum', () => {
    for (const [fg, bg] of PAIRS) {
      for (const required of [3, 4.5, 7]) {
        expect(adjust(c(fg), c(bg), required, 'darker') === null, `${fg} ${bg} ${required} darker`).toBe(contrastRatio(c('#000000'), c(bg)) + 1e-9 < required);
        expect(adjust(c(fg), c(bg), required, 'lighter') === null, `${fg} ${bg} ${required} lighter`).toBe(contrastRatio(c('#ffffff'), c(bg)) + 1e-9 < required);
      }
    }
  });

  it('stops close to the edge: one step back towards the start no longer reaches the minimum', () => {
    for (const [fg, bg] of PAIRS) {
      const found = adjust(c(fg), c(bg), 4.5, 'darker') ?? adjust(c(fg), c(bg), 4.5, 'lighter');
      if (!found || found.distance === 0) continue;
      expect(found.ratio, `${fg} on ${bg}`).toBeLessThan(4.75);
    }
  });

  it('moves in the direction it names', () => {
    for (const [fg, bg] of PAIRS) {
      const start = rgbToOklch(c(fg)).l;
      const darker = adjust(c(fg), c(bg), 4.5, 'darker');
      const lighter = adjust(c(fg), c(bg), 4.5, 'lighter');
      if (darker && darker.distance > 0) expect(rgbToOklch(darker.color).l).toBeLessThan(start);
      if (lighter && lighter.distance > 0) expect(rgbToOklch(lighter.color).l).toBeGreaterThan(start);
    }
  });

  it('keeps the hue of a colour that has one', () => {
    const blue = adjust(c('#0000ff'), c('#000080'), 4.5, 'lighter');
    expect(blue).not.toBeNull();
    const before = rgbToOklch(c('#0000ff')).h;
    const after = rgbToOklch((blue as NonNullable<typeof blue>).color).h;
    expect(Math.abs(after - before)).toBeLessThan(6);
    const yellow = adjust(c('#ffd84a'), c('#ffffff'), 4.5, 'darker');
    expect(Math.abs(rgbToOklch((yellow as NonNullable<typeof yellow>).color).h - rgbToOklch(c('#ffd84a')).h)).toBeLessThan(6);
  });

  it('keeps a grey grey', () => {
    const found = adjust(c('#999999'), c('#ffffff'), 4.5, 'darker');
    expect(found?.hex).toMatch(/^#([0-9a-f]{2})\1\1$/);
  });

  it('asks for more change for a higher minimum', () => {
    const three = adjust(c('#999999'), c('#ffffff'), 3, 'darker');
    const four = adjust(c('#999999'), c('#ffffff'), 4.5, 'darker');
    const seven = adjust(c('#999999'), c('#ffffff'), 7, 'darker');
    expect((three as NonNullable<typeof three>).distance).toBeLessThan((four as NonNullable<typeof four>).distance);
    expect((four as NonNullable<typeof four>).distance).toBeLessThan((seven as NonNullable<typeof seven>).distance);
  });

  it('reports the distance from the colour it replaces', () => {
    const found = adjust(c('#999999'), c('#ffffff'), 4.5, 'darker');
    expect(found?.distance).toBeCloseTo(colorDistance(c('#999999'), c((found as NonNullable<typeof found>).hex)), 12);
  });
});

describe('fixContrast', () => {
  it('has nothing to suggest for a pair that reaches the minimum', () => {
    expect(fixContrast(c('#1b1916'), c('#fffdf8'), 4.5)).toEqual({ ratio: 17.25, required: 4.5, meets: true, text: [], background: [] });
  });

  it('treats a pair exactly at the minimum as reaching it', () => {
    const fix = fixContrast(c('#767676'), c('#ffffff'), 4.54);
    expect(fix.ratio).toBe(4.54);
    expect(fixContrast(c('#000000'), c('#ffffff'), 21).meets).toBe(true);
  });

  it('suggests a text colour and a background colour for grey on white', () => {
    const fix = fixContrast(c('#777777'), c('#ffffff'), 4.5);
    expect(fix.meets).toBe(false);
    expect(fix.ratio).toBe(4.47);
    expect(fix.text.map((x) => x.hex)).toEqual(['#767676']);
    expect(fix.background).toHaveLength(1);
    expect(fix.background[0]?.direction).toBe('darker');
  });

  it('measures a background suggestion against the text', () => {
    for (const [fg, bg] of PAIRS) {
      const fix = fixContrast(c(fg), c(bg), 4.5);
      for (const b of fix.background) expect(contrastRatio(c(b.hex), c(fg)) + 1e-9, `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const t of fix.text) expect(contrastRatio(c(t.hex), c(bg)) + 1e-9, `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('lists the closest suggestion first and never the same colour twice', () => {
    for (const [fg, bg] of PAIRS) {
      for (const required of [3, 4.5, 7]) {
        const fix = fixContrast(c(fg), c(bg), required);
        for (const list of [fix.text, fix.background]) {
          expect(list.length).toBeLessThanOrEqual(2);
          expect(new Set(list.map((x) => x.hex)).size).toBe(list.length);
          if (list.length === 2) expect((list[0] as (typeof list)[0]).distance).toBeLessThanOrEqual((list[1] as (typeof list)[1]).distance);
        }
      }
    }
  });

  it('offers both a lighter and a darker text on a mid-tone that allows both at 3 to 1', () => {
    const fix = fixContrast(c('#7a7a7a'), c('#777777'), 3);
    expect(fix.text.map((x) => x.direction).sort()).toEqual(['darker', 'lighter']);
  });

  it('has no text colour at all for 7 to 1 on a mid grey, and still a background under black text', () => {
    const fix = fixContrast(c('#000000'), c('#777777'), 7);
    expect(fix.meets).toBe(false);
    expect(fix.text).toEqual([]);
    expect(fix.background.map((x) => x.direction)).toEqual(['lighter']);
  });

  it('has nothing on either side when both colours are mid-tones and the minimum is high', () => {
    const fix = fixContrast(c('#808080'), c('#777777'), 7);
    expect(fix.text).toEqual([]);
    expect(fix.background).toEqual([]);
  });

  it('never suggests the colour that failed', () => {
    for (const [fg, bg] of PAIRS) {
      const fix = fixContrast(c(fg), c(bg), 4.5);
      if (fix.meets) continue;
      expect(fix.text.map((x) => x.hex)).not.toContain(toHex(c(fg)));
      expect(fix.background.map((x) => x.hex)).not.toContain(toHex(c(bg)));
    }
  });
});

describe('ratioText and minimumText', () => {
  it('writes a ratio with two decimals and a minimum with one', () => {
    expect(ratioText(4.47, 'en')).toBe('4.47:1');
    expect(ratioText(21, 'en')).toBe('21.00:1');
    expect(minimumText(4.5, 'en')).toBe('4.5:1');
    expect(minimumText(3, 'en')).toBe('3.0:1');
  });

  it('uses a comma and no-break spaces around the colon in French', () => {
    expect(ratioText(4.47, 'fr')).toBe(`4,47${NBSP}:${NBSP}1`);
    expect(minimumText(4.5, 'fr')).toBe(`4,5${NBSP}:${NBSP}1`);
    expect(frTypographyIssues(`Le minimum est de ${minimumText(4.5, 'fr')}.`)).toEqual([]);
  });
});

describe('fixSentence', () => {
  it('is empty for a pair that reaches the minimum', () => {
    expect(fixSentence(fixContrast(c('#000000'), c('#ffffff'), 4.5), 'en')).toBe('');
  });

  it('gives the closest text colour as an example', () => {
    const fix = fixContrast(c('#777777'), c('#ffffff'), 4.5);
    expect(fixSentence(fix, 'en')).toBe('For example, text in #767676 gives 4.54:1 on this background.');
    expect(fixSentence(fix, 'fr')).toBe(`Par exemple, un texte en #767676 donne 4,54${NBSP}:${NBSP}1 sur cet arrière-plan.`);
  });

  it('says the background has to change when no text colour reaches the minimum', () => {
    const fix = fixContrast(c('#000000'), c('#777777'), 7);
    expect(fixSentence(fix, 'en')).toBe('No text colour reaches this minimum on this background. The background has to change.');
    expect(fixSentence(fix, 'fr')).toContain('Il faut changer l’arrière-plan.');
    expect(frTypographyIssues(fixSentence(fix, 'fr'))).toEqual([]);
  });

  it('says both have to change when neither side can reach the minimum alone', () => {
    const fix = fixContrast(c('#808080'), c('#777777'), 7);
    expect(fixSentence(fix, 'en')).toBe('Neither colour can reach this minimum by changing alone. Both have to change.');
    expect(fixSentence(fix, 'fr')).toBe('Aucune des deux couleurs ne peut atteindre ce minimum en changeant seule. Il faut changer les deux.');
  });

  it('follows French typography and is worded as an example, not as the answer', () => {
    for (const [fg, bg] of PAIRS) {
      const fix = fixContrast(c(fg), c(bg), 4.5);
      if (fix.meets) continue;
      expect(frTypographyIssues(fixSentence(fix, 'fr')), `${fg} ${bg}`).toEqual([]);
      if (fix.text.length > 0) expect(fixSentence(fix, 'en')).toMatch(/^For example, /);
      expect(fixSentence(fix, 'en')).not.toMatch(/\b(must|should|pass(es)?|compliant|conforms?)\b/i);
    }
  });
});

describe('fixForText', () => {
  it('uses 4.5 to 1 for normal text and 3 to 1 for large text', () => {
    expect(fixForText(snap('p', '#777777', '#ffffff'))?.required).toBe(4.5);
    expect(fixForText(snap('h', '#777777', '#ffffff', { fontSizePx: 24 }))?.required).toBe(3);
    expect(fixForText(snap('h', '#777777', '#ffffff', { fontSizePx: 19, fontWeight: 700 }))?.required).toBe(3);
    expect(fixForText(snap('h', '#777777', '#ffffff', { fontSizePx: 24 }))?.meets).toBe(true);
  });

  it('is null when the background is an image or has no opaque layer, or a colour is not read', () => {
    expect(fixForText(snap('p', '#777777', '#ffffff', { bgImage: true }))).toBeNull();
    expect(fixForText(snap('p', '#777777', 'rgba(0, 0, 0, 0)'))).toBeNull();
    expect(fixForText(snap('p', 'nonsense', '#ffffff'))).toBeNull();
  });

  it('lays a text colour with transparency over the background before measuring', () => {
    const fix = fixForText(snap('p', 'rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)'));
    expect(fix?.ratio).toBe(shownRatio({ r: 127.5, g: 127.5, b: 127.5, a: 1 }, c('#ffffff')));
    expect(fix?.meets).toBe(false);
  });

  it('reads the layers of a background from the element outwards', () => {
    const fix = fixForText(snap('p', '#ffffff', '#ffffff', { bgLayers: ['rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)'] }));
    expect(fix?.ratio).toBe(shownRatio(c('#ffffff'), { r: 127.5, g: 127.5, b: 127.5, a: 1 }));
  });
});

describe('auditContrastWithFixes', () => {
  const texts: TextSnap[] = [
    snap('p#ok', '#1b1916', '#fffdf8'),
    snap('p#low', '#777777', '#ffffff'),
    snap('p#image', '#777777', '#ffffff', { bgImage: true }),
    snap('p#mid', '#808080', '#777777'),
    snap('h2#large', '#999999', '#ffffff', { fontSizePx: 30 }),
  ];

  it('has the counts, statuses, ids and order of the plain check', () => {
    const plain = auditContrast(texts);
    const fixed = auditContrastWithFixes(texts);
    expect(fixed.checked).toBe(plain.checked);
    expect(fixed.entries.map((e) => [e.check, e.id, e.status, e.rule])).toEqual(plain.entries.map((e) => [e.check, e.id, e.status, e.rule]));
  });

  it('adds an example colour to a failure, after the measured sentence', () => {
    const fixed = auditContrastWithFixes(texts);
    const plain = auditContrast(texts);
    const low = fixed.entries.find((e) => e.id === 'p#low');
    const lowPlain = plain.entries.find((e) => e.id === 'p#low');
    expect(low?.message.en).toBe(`${lowPlain?.message.en} For example, text in #767676 gives 4.54:1 on this background.`);
    expect(low?.message.fr).toBe(`${lowPlain?.message.fr} Par exemple, un texte en #767676 donne 4,54${NBSP}:${NBSP}1 sur cet arrière-plan.`);
  });

  it('suggests for the minimum of the text itself: 3 to 1 for large text', () => {
    const large = auditContrastWithFixes(texts).entries.find((e) => e.id === 'h2#large');
    const hex = /text in (#[0-9a-f]{6})/.exec(large?.message.en ?? '')?.[1] ?? '';
    expect(contrastRatio(c(hex), c('#ffffff'))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c(hex), c('#ffffff'))).toBeLessThan(3.3);
  });

  it('leaves an entry that could not be measured as it was: UNKNOWN, with no suggestion', () => {
    const fixed = auditContrastWithFixes(texts).entries.find((e) => e.id === 'p#image');
    const plain = auditContrast(texts).entries.find((e) => e.id === 'p#image');
    expect(fixed).toEqual(plain);
    expect(fixed?.status).toBe('unknown');
    expect(fixed?.message.en).not.toContain('#');
  });

  it('says the background has to change when no text colour can reach the minimum', () => {
    const mid = auditContrastWithFixes(texts).entries.find((e) => e.id === 'p#mid');
    expect(mid?.message.en).toMatch(/For example, text in #[0-9a-f]{6} gives 4\.5\d:1/);
    const worse = auditContrastWithFixes([snap('p#x', '#808080', '#767676')]).entries[0];
    expect(maxRatioAgainst(c('#767676'))).toBeGreaterThan(4.5);
    expect(worse?.message.en).toContain('For example');
    const none = auditContrastWithFixes([snap('p#y', '#808080', '#757575', { fontSizePx: 16 })]).entries[0];
    expect(none?.status).toBe('fail');
  });

  it('gives each failure with the same id its own suggestion', () => {
    const twice = [snap('p', '#777777', '#ffffff'), snap('p', '#1b1916', '#ffffff'), snap('p', '#aa8800', '#ffffff')];
    const out = auditContrastWithFixes(twice).entries;
    expect(out).toHaveLength(2);
    expect(out[0]?.message.en).toContain('#767676');
    expect(out[1]?.message.en).not.toContain('#767676');
    expect(out[1]?.message.en).toMatch(/text in #[0-9a-f]{6}/);
  });

  it('gives no entry and no suggestion when every text reaches its minimum', () => {
    expect(auditContrastWithFixes([snap('p', '#000000', '#ffffff')])).toEqual({ checked: 1, entries: [] });
    expect(auditContrastWithFixes([])).toEqual({ checked: 0, entries: [] });
  });

  it('has both languages, different, with French typography', () => {
    noFrIssues(auditContrastWithFixes(texts).entries);
  });
});
