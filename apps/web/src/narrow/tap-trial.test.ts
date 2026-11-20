import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import {
  APP_MINIMUM,
  AREA_HEIGHT,
  TAPS_PER_SIZE,
  TAP_IDLE,
  TAP_SIZES,
  ZOOM_STEPS,
  controlLine,
  controlsBelow,
  currentTarget,
  pageSizesSentence,
  recordTap,
  resultSentence,
  startTaps,
  stopTaps,
  tallyTaps,
  tapNote,
  tapPlan,
  tapResult,
  widthAtZoom,
  zoomAdvice,
  zoomFor,
  type Tap,
  type TapResult,
  type TapState,
} from './tap-trial.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;
const total = TAP_SIZES.length * TAPS_PER_SIZE;

/** Taps for the whole test: `miss[i]` true makes the i-th tap a miss. */
function taps(miss: (i: number, size: number) => boolean = () => false): Tap[] {
  return tapPlan().map((t, i) => ({ size: t.size, outcome: miss(i, t.size) ? 'miss' : 'hit' }));
}

/** Runs the whole test through the state functions. */
function runAll(miss: (i: number, size: number) => boolean = () => false): TapState {
  let s = startTaps();
  for (let i = 0; i < total; i += 1) s = recordTap(s, miss(i, currentTarget(s)?.size ?? 0) ? 'miss' : 'hit');
  return s;
}

describe('the plan of the test', () => {
  it('tries four sizes from large to small, none below the minimum of the App', () => {
    expect(TAP_SIZES).toEqual([96, 72, 56, 44]);
    expect(Math.min(...TAP_SIZES)).toBe(APP_MINIMUM);
    expect([...TAP_SIZES].sort((a, b) => b - a)).toEqual([...TAP_SIZES]);
  });

  it('has the same number of targets at each size, in order of size', () => {
    const plan = tapPlan();
    expect(plan).toHaveLength(total);
    for (const size of TAP_SIZES) expect(plan.filter((t) => t.size === size)).toHaveLength(TAPS_PER_SIZE);
    expect(plan.map((t) => t.size)).toEqual(TAP_SIZES.flatMap((s) => Array<number>(TAPS_PER_SIZE).fill(s)));
    expect(plan.map((t) => t.index)).toEqual(plan.map((_, i) => i));
  });

  it('places the targets inside the area, and not twice in the same place at one size', () => {
    for (const size of TAP_SIZES) {
      const at = tapPlan().filter((t) => t.size === size);
      expect(new Set(at.map((t) => `${t.x},${t.y}`)).size, String(size)).toBe(at.length);
    }
    for (const t of tapPlan()) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(1);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(1);
    }
  });

  it('reaches the corners and the middle', () => {
    const xs = tapPlan().map((t) => t.x);
    const ys = tapPlan().map((t) => t.y);
    expect(Math.min(...xs)).toBeLessThan(0.15);
    expect(Math.max(...xs)).toBeGreaterThan(0.85);
    expect(Math.min(...ys)).toBeLessThan(0.15);
    expect(Math.max(...ys)).toBeGreaterThan(0.85);
    expect(tapPlan()[0]).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it('is the same every time', () => {
    expect(tapPlan()).toEqual(tapPlan());
  });

  it('can be made for other sizes and counts', () => {
    expect(tapPlan([60], 2).map((t) => t.size)).toEqual([60, 60]);
    expect(tapPlan([], 3)).toEqual([]);
  });

  it('has an area tall enough for the largest target', () => {
    expect(AREA_HEIGHT).toBeGreaterThanOrEqual(2 * (TAP_SIZES[0] ?? 0));
  });
});

describe('running the test', () => {
  it('has no target before it starts', () => {
    expect(TAP_IDLE).toEqual({ phase: 'idle', taps: [], stopped: false });
    expect(currentTarget(TAP_IDLE)).toBeNull();
    expect(recordTap(TAP_IDLE, 'hit')).toBe(TAP_IDLE);
  });

  it('starts at the first target', () => {
    const s = startTaps();
    expect(s).toEqual({ phase: 'running', taps: [], stopped: false });
    expect(currentTarget(s)).toEqual(tapPlan()[0]);
  });

  it('records each tap with the size of its target and moves on', () => {
    let s = recordTap(startTaps(), 'hit');
    s = recordTap(s, 'miss');
    expect(s.taps).toEqual([
      { size: 96, outcome: 'hit' },
      { size: 96, outcome: 'miss' },
    ]);
    expect(currentTarget(s)).toEqual(tapPlan()[2]);
  });

  it('ends after the last target, and takes no tap after that', () => {
    const s = runAll();
    expect(s.phase).toBe('done');
    expect(s.stopped).toBe(false);
    expect(s.taps).toHaveLength(total);
    expect(currentTarget(s)).toBeNull();
    expect(recordTap(s, 'miss')).toBe(s);
  });

  it('can be stopped early, keeping the taps so far', () => {
    const s = stopTaps(recordTap(recordTap(startTaps(), 'hit'), 'hit'));
    expect(s).toEqual({ phase: 'done', taps: [{ size: 96, outcome: 'hit' }, { size: 96, outcome: 'hit' }], stopped: true });
  });

  it('does nothing when stopped before it starts or after it ends', () => {
    expect(stopTaps(TAP_IDLE)).toBe(TAP_IDLE);
    const done = runAll();
    expect(stopTaps(done)).toBe(done);
  });
});

describe('tallyTaps', () => {
  it('counts attempts and hits at each size, largest first', () => {
    const t = tallyTaps(taps((i) => i === 5));
    expect(t.map((x) => [x.size, x.attempts, x.hits, x.complete, x.allLanded])).toEqual([
      [96, 4, 4, true, true],
      [72, 4, 3, true, false],
      [56, 4, 4, true, true],
      [44, 4, 4, true, true],
    ]);
  });

  it('marks a size with too few taps as not complete, and so not all landed', () => {
    const t = tallyTaps([{ size: 96, outcome: 'hit' }]);
    expect(t[0]).toEqual({ size: 96, attempts: 1, hits: 1, complete: false, allLanded: false });
    expect(t[3]).toEqual({ size: 44, attempts: 0, hits: 0, complete: false, allLanded: false });
  });

  it('ignores taps at sizes that are not tried', () => {
    expect(tallyTaps([{ size: 30, outcome: 'hit' }]).every((t) => t.attempts === 0)).toBe(true);
  });
});

describe('tapResult', () => {
  it('is the smallest size when every tap landed', () => {
    expect(tapResult(taps())).toEqual({ kind: 'size', px: 44 });
  });

  it('stops at the first size where a tap missed', () => {
    expect(tapResult(taps((_, size) => size === 44))).toEqual({ kind: 'size', px: 56 });
    expect(tapResult(taps((i) => i === 8))).toEqual({ kind: 'size', px: 72 });
    expect(tapResult(taps((i) => i === 4))).toEqual({ kind: 'size', px: 96 });
  });

  it('never goes below a size where a tap missed, whatever happened after', () => {
    // A miss at 72 and every tap landing at 56 and 44 still gives 96.
    expect(tapResult(taps((i) => i === 6))).toEqual({ kind: 'size', px: 96 });
  });

  it('is above what the test measures when a tap missed at the largest size', () => {
    expect(tapResult(taps((i) => i === 0))).toEqual({ kind: 'above', px: 96 });
    expect(tapResult(taps(() => true))).toEqual({ kind: 'above', px: 96 });
  });

  it('is UNKNOWN with too few taps at the largest size', () => {
    expect(tapResult([])).toEqual({ kind: 'unknown' });
    expect(tapResult(taps().slice(0, TAPS_PER_SIZE - 1))).toEqual({ kind: 'unknown' });
  });

  it('counts only sizes whose targets were all tapped, when the test was stopped', () => {
    expect(tapResult(taps().slice(0, TAPS_PER_SIZE))).toEqual({ kind: 'size', px: 96 });
    expect(tapResult(taps().slice(0, TAPS_PER_SIZE + 3))).toEqual({ kind: 'size', px: 96 });
    expect(tapResult(taps().slice(0, 2 * TAPS_PER_SIZE))).toEqual({ kind: 'size', px: 72 });
  });

  it('gives the same as running the test through the state functions', () => {
    for (const miss of [() => false, (i: number) => i === 9, (i: number) => i < 2, (i: number) => i % 5 === 4]) {
      expect(tapResult(runAll(miss).taps)).toEqual(tapResult(taps(miss)));
    }
  });
});

describe('zoomFor and widthAtZoom', () => {
  it('needs no zoom at or below the minimum of the App', () => {
    expect(zoomFor(44)).toBe(100);
    expect(zoomFor(30)).toBe(100);
  });

  it('gives the first zoom step that brings 44 pixels to the size', () => {
    expect(zoomFor(48)).toBe(110);
    expect(zoomFor(55)).toBe(125);
    expect(zoomFor(56)).toBe(150);
    expect(zoomFor(66)).toBe(150);
    expect(zoomFor(72)).toBe(175);
    expect(zoomFor(77)).toBe(175);
    expect(zoomFor(96)).toBe(250);
    expect(zoomFor(176)).toBe(400);
  });

  it('is null when even the largest zoom is not enough', () => {
    expect(zoomFor(177)).toBeNull();
    expect(ZOOM_STEPS.at(-1)).toBe(400);
  });

  it('every zoom it gives does bring 44 pixels to the size', () => {
    for (const size of [45, 50, 60, 70, 80, 90, 100, 120, 150, 176]) {
      const z = zoomFor(size) as number;
      expect((APP_MINIMUM * z) / 100, String(size)).toBeGreaterThanOrEqual(size);
      const before = ZOOM_STEPS[ZOOM_STEPS.indexOf(z) - 1];
      if (before !== undefined) expect((APP_MINIMUM * before) / 100, String(size)).toBeLessThan(size);
    }
  });

  it('divides the width of the page by the zoom', () => {
    expect(widthAtZoom(1280, 400)).toBe(320);
    expect(widthAtZoom(320, 175)).toBe(182);
    expect(widthAtZoom(412, 100)).toBe(412);
  });
});

describe('resultSentence', () => {
  it('speaks of taps and of this screen', () => {
    expect(resultSentence({ kind: 'size', px: 56 }, 'en')).toBe('On this screen, today, every tap landed from 56 CSS pixels up.');
    expect(resultSentence({ kind: 'size', px: 56 }, 'fr')).toBe(`Sur cet écran, aujourd’hui, tous les appuis ont atteint leur cible à partir de 56${NBSP}pixels CSS.`);
  });

  it('says UNKNOWN when there were too few taps', () => {
    expect(resultSentence({ kind: 'unknown' }, 'en')).toBe('Size UNKNOWN. There were too few taps to say. Take the test to the end when you want to.');
    expect(resultSentence({ kind: 'unknown' }, 'fr')).toMatch(/^Taille UNKNOWN\. /);
  });

  it('says UNKNOWN when taps missed at the largest size, and that the size is above what the test measures', () => {
    expect(resultSentence({ kind: 'above', px: 96 }, 'en')).toBe('Size UNKNOWN. Taps missed at 96 CSS pixels, the largest size tried, so the size that works on this screen is above what this test measures.');
    expect(resultSentence({ kind: 'above', px: 96 }, 'fr')).toContain(`à 96${NBSP}pixels CSS, la plus grande taille essayée`);
  });

  it('never speaks about the person, and gives no advice about their health', () => {
    const all: TapResult[] = [{ kind: 'size', px: 44 }, { kind: 'size', px: 96 }, { kind: 'above', px: 96 }, { kind: 'unknown' }];
    for (const r of all) {
      for (const lang of LANGS) {
        const text = [resultSentence(r, lang), ...zoomAdvice(r, 320, lang), ...zoomAdvice(r, null, lang)].join(' ');
        expect(text).not.toMatch(/disab|tremor|dexterit|condition|diagnos|medical|therap|impair|handicap|médical|tremblement|dextérité/i);
        expect(text).not.toMatch(/\byou (have|are|cannot|can't)\b|\bvous (avez|êtes|ne pouvez)\b/i);
      }
    }
  });

  it('follows French typography', () => {
    for (const r of [{ kind: 'size', px: 72 }, { kind: 'above', px: 96 }, { kind: 'unknown' }] as TapResult[]) expect(frTypographyIssues(resultSentence(r, 'fr'))).toEqual([]);
  });
});

describe('zoomAdvice', () => {
  it('has nothing to say without a result', () => {
    expect(zoomAdvice({ kind: 'unknown' }, 320, 'en')).toEqual([]);
  });

  it('says no zoom is needed when taps landed at the minimum of the App, and what to do about smaller controls', () => {
    expect(zoomAdvice({ kind: 'size', px: 44 }, 320, 'en')).toEqual([
      'The checks of the App look for controls of at least 44 CSS pixels, the size at which all your taps landed. A smaller control is a barrier to tell us about.',
    ]);
  });

  it('gives the zoom and the width the page keeps when that is at least 320 pixels', () => {
    expect(zoomAdvice({ kind: 'size', px: 56 }, 1280, 'en')).toEqual([
      'Controls of the App are at least 44 CSS pixels. A browser zoom of 150% brings them to 66 CSS pixels or more.',
      'At that zoom the page would have 853 CSS pixels of width. The App is checked down to 320 CSS pixels.',
    ]);
  });

  it('says when that zoom leaves less than 320 pixels of width, and that content may scroll sideways', () => {
    const [, width] = zoomAdvice({ kind: 'size', px: 72 }, 320, 'en');
    expect(width).toBe('At that zoom the page would have only 182 CSS pixels of width, less than the 320 CSS pixels the App is checked down to. Some content may scroll sideways. If it does, tell us with the form “Tell us about a barrier” on this page.');
  });

  it('says the width is UNKNOWN when the browser does not report it', () => {
    expect(zoomAdvice({ kind: 'size', px: 72 }, null, 'en')[1]).toBe('Width of the page UNKNOWN, so what this zoom does to the layout is not known.');
    expect(zoomAdvice({ kind: 'size', px: 72 }, null, 'fr')[1]).toBe('Largeur de la page UNKNOWN, donc l’effet de ce zoom sur la mise en page n’est pas connu.');
  });

  it('does not name a zoom when the size is above what the test measures', () => {
    const advice = zoomAdvice({ kind: 'above', px: 96 }, 320, 'en');
    expect(advice).toHaveLength(1);
    expect(advice[0]).toContain('this test does not say how far to go');
    expect(advice[0]).toContain('250% or more');
  });

  it('writes percent and pixels with no-break spaces in French, and follows French typography', () => {
    const fr = zoomAdvice({ kind: 'size', px: 72 }, 320, 'fr');
    expect(fr[0]).toContain(`175${NBSP}%`);
    expect(fr[1]).toContain('«\u202FSignaler un obstacle\u202F»');
    for (const r of [{ kind: 'size', px: 44 }, { kind: 'size', px: 56 }, { kind: 'size', px: 72 }, { kind: 'above', px: 96 }] as TapResult[]) {
      for (const w of [320, 1280, null]) for (const line of zoomAdvice(r, w, 'fr')) expect(frTypographyIssues(line), line).toEqual([]);
    }
  });

  it('is fully translated', () => {
    for (const line of zoomAdvice({ kind: 'size', px: 72 }, 320, 'fr')) expect(line).not.toMatch(/\b(the|zoom of|width)\b/);
  });
});

describe('the controls of a page', () => {
  const controls = [
    { id: 'a[0]', name: 'Help', width: 30, height: 20 },
    { id: 'button#close[0]', name: '', width: 100, height: 44 },
    { id: 'button[1]', name: 'Go', width: 60, height: 60 },
    { id: 'a#hidden[1]', name: 'Hidden', width: 0, height: 0 },
    { id: 'button[2]', name: 'Wide', width: 200, height: 55.6 },
  ];

  it('leaves out controls with no size and keeps those smaller in either direction, smallest first', () => {
    const r = controlsBelow(controls, 56);
    expect(r.measured).toBe(4);
    expect(r.smaller.map((c) => c.id)).toEqual(['a[0]', 'button#close[0]']);
  });

  it('allows half a pixel of rounding', () => {
    expect(controlsBelow(controls, 56).smaller.map((c) => c.id)).not.toContain('button[2]');
    expect(controlsBelow(controls, 57).smaller.map((c) => c.id)).toContain('button[2]');
  });

  it('says how many are smaller, or that none is', () => {
    expect(pageSizesSentence(controlsBelow(controls, 56), 56, 'en')).toBe('2 of the 4 controls measured on this page are smaller than 56 CSS pixels, with no zoom.');
    expect(pageSizesSentence(controlsBelow(controls, 30), 30, 'en')).toBe('1 of the 4 controls measured on this page is smaller than 30 CSS pixels, with no zoom.');
    expect(pageSizesSentence(controlsBelow(controls, 10), 10, 'en')).toBe('None of the 4 controls measured on this page is smaller than 10 CSS pixels.');
    expect(pageSizesSentence(controlsBelow([], 44), 44, 'en')).toBe('No control was measured on this page.');
  });

  it('says it in French with French typography', () => {
    for (const size of [10, 30, 56]) {
      const s = pageSizesSentence(controlsBelow(controls, size), size, 'fr');
      expect(frTypographyIssues(s), s).toEqual([]);
    }
    expect(pageSizesSentence(controlsBelow(controls, 30), 30, 'fr')).toBe(`1 des 4 commandes mesurées sur cette page est plus petite que 30${NBSP}pixels CSS, sans zoom.`);
    expect(pageSizesSentence(controlsBelow([], 44), 44, 'fr')).toBe('Aucune commande n’a été mesurée sur cette page.');
  });

  it('names a control by its name, or by what it is, with its size', () => {
    expect(controlLine({ id: 'a[0]', name: 'Help', width: 30.4, height: 19.6 }, 'en')).toBe('“Help”, 30 × 20');
    expect(controlLine({ id: 'a[0]', name: 'Aide', width: 30, height: 20 }, 'fr')).toBe('«\u202FAide\u202F», 30 × 20');
    expect(controlLine({ id: 'button#close[0]', name: '  ', width: 100, height: 44 }, 'en')).toBe('no name (button#close[0]), 100 × 44');
    expect(controlLine({ id: 'button#close[0]', name: '', width: 100, height: 44 }, 'fr')).toBe('sans nom (button#close[0]), 100 × 44');
  });

  it('shortens a very long name', () => {
    expect(controlLine({ id: 'x', name: 'n'.repeat(200), width: 1, height: 1 }, 'en').length).toBeLessThan(60);
  });
});

describe('tapNote', () => {
  it('is empty before the test ends', () => {
    expect(tapNote(TAP_IDLE, 'en')).toBe('');
    expect(tapNote(startTaps(), 'en')).toBe('');
  });

  it('gives the size in one line, or UNKNOWN', () => {
    expect(tapNote(runAll(), 'en')).toBe('Button size at which my taps land: 44 CSS pixels');
    expect(tapNote(runAll((i) => i === 0), 'en')).toBe('Button size at which my taps land: UNKNOWN');
    expect(tapNote(stopTaps(startTaps()), 'fr')).toBe(`Taille de bouton où mes appuis atteignent leur cible${NBSP}: UNKNOWN`);
    expect(frTypographyIssues(tapNote(runAll(), 'fr'))).toEqual([]);
  });
});
