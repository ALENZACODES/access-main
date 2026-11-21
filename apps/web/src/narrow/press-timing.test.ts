import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import {
  BOUNCE_MS,
  DOUBLE_PRESS_MS,
  LONG_PRESS_MS,
  PRESSES,
  initialPress,
  median,
  pressCancel,
  pressDown,
  pressFindings,
  pressNote,
  pressSettings,
  pressStats,
  pressSummary,
  pressText,
  pressUp,
  startPress,
  stopPress,
  viaText,
  type PressState,
  type PressVia,
} from './press-timing.js';
import { NBSP, NNBSP } from './types.js';

/** A test made of presses held `holds[i]` ms, `gap` ms apart. */
function run(holds: readonly number[], gap = 800, via: PressVia = 'pointer'): PressState {
  let s = startPress();
  let t = 1000;
  for (const h of holds) {
    s = pressDown(s, t, via);
    s = pressUp(s, t + h);
    t += h + gap;
  }
  return s;
}
const EIGHT = [120, 150, 180, 200, 140, 160, 170, 130];

describe('the press test', () => {
  it('starts, counts each press from down to up, and ends after the last', () => {
    expect(initialPress().phase).toBe('idle');
    let s = startPress();
    expect(s).toMatchObject({ phase: 'running', samples: [], pending: null, repeats: 0 });
    s = pressDown(s, 100, 'touch');
    expect(s.pending).toEqual({ down: 100, via: 'touch' });
    s = pressUp(s, 260);
    expect(s.samples).toEqual([{ down: 100, up: 260, via: 'touch' }]);
    expect(run(EIGHT).phase).toBe('done');
    expect(run(EIGHT).samples).toHaveLength(PRESSES);
    expect(run(EIGHT.slice(0, 7)).phase).toBe('running');
  });

  it('ignores presses before the start and after the end, an up with no down, and a second down before the up', () => {
    expect(pressDown(initialPress(), 1, 'key')).toEqual(initialPress());
    const done = run(EIGHT);
    expect(pressUp(pressDown(done, 1, 'key'), 2)).toBe(done);
    expect(pressUp(startPress(), 5)).toEqual(startPress());
    const twice = pressDown(pressDown(startPress(), 10, 'touch'), 20, 'touch');
    expect(twice.pending?.down).toBe(10);
  });

  it('counts key repeats while a key is held, and never as presses', () => {
    let s = pressDown(startPress(), 0, 'key');
    s = pressDown(s, 500, 'key', true);
    s = pressDown(s, 530, 'key', true);
    s = pressUp(s, 600);
    expect(s.repeats).toBe(2);
    expect(s.samples).toHaveLength(1);
    expect(pressDown(startPress(), 0, 'key', true).repeats).toBe(0);
  });

  it('drops a cancelled press, and keeps an up earlier than its down at zero length', () => {
    const cancelled = pressCancel(pressDown(startPress(), 10, 'touch'));
    expect(cancelled.pending).toBeNull();
    expect(cancelled.samples).toEqual([]);
    expect(pressUp(pressDown(startPress(), 50, 'key'), 40).samples[0]).toEqual({ down: 50, up: 50, via: 'key' });
  });

  it('stops early, keeping what was measured', () => {
    const s = stopPress(pressDown(run([100, 200]), 5000, 'pointer'));
    expect(s).toMatchObject({ phase: 'done', stopped: true, pending: null });
    expect(s.samples).toHaveLength(2);
    expect(stopPress(initialPress())).toEqual(initialPress());
  });
});

describe('median and pressStats', () => {
  it('takes the middle value, or the mean of the two middle ones, rounded', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 6])).toBe(3);
    expect(median([1, 2])).toBe(2);
  });

  it('gives the holds, the gaps and their ranges', () => {
    const st = pressStats(run([100, 300, 200], 400));
    expect(st.holds).toEqual([100, 300, 200]);
    expect(st.gaps).toEqual([400, 400]);
    expect([st.holdMin, st.holdMax, st.holdMedian, st.gapMin, st.gapMedian]).toEqual([100, 300, 200, 400, 400]);
    expect(st.vias).toEqual(['pointer']);
  });

  it('has UNKNOWN values, as null, with no press, and no gap with one press', () => {
    const none = pressStats(startPress());
    expect([none.count, none.holdMin, none.holdMax, none.holdMedian, none.gapMin]).toEqual([0, null, null, null, null]);
    expect(pressStats(run([100])).gaps).toEqual([]);
  });

  it('lists each way of pressing once, in the order met', () => {
    let s = run([100], 500, 'touch');
    s = pressUp(pressDown(s, 9000, 'key'), 9100);
    s = pressUp(pressDown(s, 9500, 'touch'), 9600);
    expect(pressStats(s).vias).toEqual(['touch', 'key']);
    expect(viaText(['touch', 'key'], 'en')).toBe('touch, key');
    expect(viaText(['pointer'], 'fr')).toBe('souris ou pointeur');
    expect(viaText([], 'en')).toBe('UNKNOWN');
  });
});

describe('pressFindings', () => {
  it('has nothing to say about short, well spaced presses', () => {
    expect(pressFindings(pressStats(run(EIGHT)), 'en')).toEqual([]);
  });

  it('points to presses held long enough for a long press, with the longest', () => {
    const f = pressFindings(pressStats(run([100, LONG_PRESS_MS, 720])), 'en');
    expect(f).toEqual([
      {
        kind: 'long-hold',
        count: 2,
        text: '2 presses were held 500 ms or more, up to 720 ms. Many phones take such a press as a long press, which opens a menu in place of acting, and many keyboards then repeat the key.',
      },
    ]);
    expect(pressFindings(pressStats(run([600])), 'en')[0]?.text.startsWith('1 press was held')).toBe(true);
  });

  it('points to key repeats, presses close together and very brief presses', () => {
    let s = pressDown(startPress(), 0, 'key');
    s = pressUp(pressDown(s, 10, 'key', true), 100);
    s = pressUp(pressDown(s, 100 + DOUBLE_PRESS_MS - 1, 'key'), 100 + DOUBLE_PRESS_MS - 1 + BOUNCE_MS - 1);
    const f = pressFindings(pressStats(s), 'en');
    expect(f.map((x) => [x.kind, x.count])).toEqual([
      ['repeat', 1],
      ['close-presses', 1],
      ['bounce', 1],
    ]);
    expect(f[0]?.text).toBe('The key repeated 1 time while it was held. In a text field, that types the character more than once.');
    expect(f[1]?.text).toBe('1 press came less than 500 ms after the one before. A page or a device may take two presses that close as one double press.');
    expect(f[2]?.text).toBe('1 press was shorter than 30 ms. Some devices ignore presses that brief.');
  });

  it('counts a gap of exactly the double press time as far enough apart', () => {
    expect(pressFindings(pressStats(run([100, 100], DOUBLE_PRESS_MS)), 'en')).toEqual([]);
  });

  it('says every finding in French, with French typography', () => {
    let s = pressDown(startPress(), 0, 'key');
    s = pressDown(s, 10, 'key', true);
    s = pressDown(s, 20, 'key', true);
    s = pressUp(s, 900);
    s = pressUp(pressDown(s, 950, 'key'), 960);
    s = pressUp(pressDown(s, 1000, 'key'), 1700);
    const fr = pressFindings(pressStats(s), 'fr');
    expect(fr.map((x) => x.kind)).toEqual(['long-hold', 'repeat', 'close-presses', 'bounce']);
    expect(fr[1]?.text).toBe('La touche s’est répétée 2 fois pendant qu’elle était tenue. Dans un champ, cela écrit le caractère plusieurs fois.');
    for (const x of fr) {
      expect(frTypographyIssues(x.text), x.text).toEqual([]);
      expect(x.text).not.toMatch(/\p{L}'\p{L}/u);
    }
  });
});

describe('pressSettings', () => {
  it('names the kind of setting that may help, without a product or a promise', () => {
    const long = pressSettings(pressFindings(pressStats(run([700])), 'en'), 'en');
    expect(long).toEqual([
      'The accessibility settings of many phones let you lengthen the delay of a long press. Those of many computers let you lengthen the delay before a key repeats, or turn repeating off.',
    ]);
    const close = pressSettings(pressFindings(pressStats(run([100, 100], 100)), 'en'), 'en');
    expect(close).toEqual(['Many devices have a setting that ignores presses repeated close together, or too brief.']);
    let s = pressDown(startPress(), 0, 'key');
    s = pressUp(pressDown(s, 10, 'key', true), 400);
    expect(pressSettings(pressFindings(pressStats(s), 'en'), 'en')[0]).toBe('The accessibility settings of many computers let you lengthen the delay before a key repeats, or turn repeating off.');
    expect(pressSettings([], 'en')).toEqual([]);
  });

  it('says it in French, with French typography', () => {
    const all = [
      ...pressSettings(pressFindings(pressStats(run([700, 100], 100)), 'fr'), 'fr'),
      ...pressSettings([{ kind: 'repeat', count: 1, text: '' }], 'fr'),
    ];
    expect(all).toHaveLength(3);
    for (const line of all) expect(frTypographyIssues(line), line).toEqual([]);
  });
});

describe('pressSummary', () => {
  it('gives the count, the hold range and median, the gaps and the time the test took', () => {
    expect(pressSummary(run(EIGHT), 'en')).toEqual([
      '8 of 8 presses measured. Each press was held from 120 ms to 200 ms, median 155 ms.',
      'Time between presses: at least 800 ms, median 800 ms.',
      'The test took 6.9 s from the first press to the last.',
    ]);
  });

  it('says the test was stopped, and UNKNOWN for what could not be measured', () => {
    expect(pressSummary(stopPress(run([150])), 'en')).toEqual([
      '1 of 8 press measured, the test was stopped before the end. Each press was held from 150 ms to 150 ms, median 150 ms.',
      'Time between presses UNKNOWN, since it takes at least two presses.',
    ]);
    expect(pressSummary(stopPress(startPress()), 'en')).toEqual(['No press was measured, so the result is UNKNOWN.']);
  });

  it('says it in French, with French typography', () => {
    const lines = [...pressSummary(run(EIGHT), 'fr'), ...pressSummary(stopPress(run([150])), 'fr'), ...pressSummary(stopPress(startPress()), 'fr')];
    expect(lines[0]).toBe(`8 appuis mesurés sur 8. Durée de chaque appui${NBSP}: de 120${NBSP}ms à 200${NBSP}ms, médiane 155${NBSP}ms.`);
    expect(lines[2]).toBe(`Le test a pris 6,9${NBSP}s du premier appui au dernier.`);
    for (const l of lines) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('pressNote', () => {
  it('is empty until the test is over with at least one press', () => {
    expect(pressNote(run([100, 200]), 'en')).toBe('');
    expect(pressNote(stopPress(startPress()), 'en')).toBe('');
  });

  it('gives the hold range, the shortest gap and any repeats, for the barrier text', () => {
    expect(pressNote(run(EIGHT, 800, 'touch'), 'en')).toBe('My presses (touch): held from 120 ms to 200 ms; at least 800 ms between presses.');
    expect(pressNote(stopPress(run([300], 0, 'key')), 'en')).toBe('My presses (key): held from 300 ms to 300 ms; at least UNKNOWN between presses.');
    let s = pressDown(startPress(), 0, 'key');
    s = stopPress(pressUp(pressDown(s, 10, 'key', true), 700));
    expect(pressNote(s, 'en')).toBe('My presses (key): held from 700 ms to 700 ms; at least UNKNOWN between presses; the key repeated 1 time.');
    expect(pressNote(s, 'fr')).toBe(
      `Mes appuis (touche)${NBSP}: tenus de 700${NBSP}ms à 700${NBSP}ms${NNBSP}; au moins UNKNOWN entre deux appuis${NNBSP}; la touche s’est répétée 1${NBSP}fois.`,
    );
    expect(frTypographyIssues(pressNote(s, 'fr'))).toEqual([]);
  });
});

describe('pressText', () => {
  it('is empty before the end, and holds the title, the note, the summary, the findings, the settings and the limit after', () => {
    expect(pressText(run([100]), 'en')).toBe('');
    const lines = pressText(run([100, 700, 150, 120, 130, 140, 110, 160]), 'en').split('\n');
    expect(lines[0]).toBe('How I press');
    expect(lines[1]).toBe('My presses (mouse or pointer): held from 100 ms to 700 ms; at least 800 ms between presses.');
    expect(lines).toContain('- 1 press was held 500 ms or more, up to 700 ms. Many phones take such a press as a long press, which opens a menu in place of acting, and many keyboards then repeat the key.');
    expect(lines.at(-2)).toBe('These times are those of this screen, this way of pressing, today. They say nothing about the person.');
    expect(lines.at(-1)).toBe('');
  });

  it('says it in French, with French typography on every line', () => {
    const text = pressText(run([100, 700, 150], 200), 'fr');
    expect(text).toBe('');
    const done = pressText(stopPress(run([100, 700, 150], 200)), 'fr');
    expect(done.split('\n')[0]).toBe('Ma façon d’appuyer');
    for (const l of done.split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
  });
});
