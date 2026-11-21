import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { NBSP } from './types.js';
import {
  DRAG_END,
  DRAG_TRIES,
  dragDone,
  dragIsHard,
  dragNote,
  dragResult,
  dragSummary,
  dragTrialStep,
  emptyDragTrial,
  giveUpDrag,
  pointerWords,
  type DragEvent,
  type DragTrial,
  type DragTry,
} from './drag-trial.js';

const run = (t: DragTrial, events: readonly DragEvent[]): DragTrial => events.reduce(dragTrialStep, t);
const reach = (start: number, ms: number, pointerType = 'touch'): DragEvent[] => [
  { kind: 'down', x: 0, at: start, pointerType },
  { kind: 'move', x: 0.5, at: start + ms / 2 },
  { kind: 'move', x: 0.95, at: start + ms },
];
const short = (start: number, to: number, pointerType = 'touch'): DragEvent[] => [
  { kind: 'down', x: 0, at: start, pointerType },
  { kind: 'move', x: to, at: start + 300 },
  { kind: 'up', x: to, at: start + 400 },
];
const tr = (reached: boolean, ms: number, furthest = reached ? 1 : 0.4, pointerType = 'touch'): DragTry => ({ start: 0, end: ms, reached, furthest, pointerType });

describe('dragTrialStep', () => {
  it('starts a try on press, follows the handle and ends it when the end is reached', () => {
    let t = dragTrialStep(emptyDragTrial(), { kind: 'down', x: 0, at: 100, pointerType: 'mouse' });
    expect(t.current).toEqual({ start: 100, at: 0, pointerType: 'mouse' });
    t = dragTrialStep(t, { kind: 'move', x: 0.4, at: 300 });
    expect(t.current?.at).toBe(0.4);
    expect(t.tries).toEqual([]);
    t = dragTrialStep(t, { kind: 'move', x: DRAG_END, at: 900 });
    expect(t.tries).toEqual([{ start: 100, end: 900, reached: true, furthest: DRAG_END, pointerType: 'mouse' }]);
    expect(t.current).toBeNull();
  });

  it('ends a try that is let go short, keeping how far it got, even after moving back', () => {
    const t = run(emptyDragTrial(), [
      { kind: 'down', x: 0, at: 0, pointerType: 'pen' },
      { kind: 'move', x: 0.7, at: 100 },
      { kind: 'move', x: 0.2, at: 200 },
      { kind: 'up', x: 0.2, at: 300 },
    ]);
    expect(t.tries).toEqual([{ start: 0, end: 300, reached: false, furthest: 0.7, pointerType: 'pen' }]);
  });

  it('counts a let-go at the end as reached', () => {
    expect(run(emptyDragTrial(), [{ kind: 'down', x: 0, at: 0, pointerType: 'touch' }, { kind: 'up', x: 1.4, at: 50 }]).tries[0]?.reached).toBe(true);
  });

  it('ends a cancelled pointer where it got to', () => {
    const t = run(emptyDragTrial(), [{ kind: 'down', x: 0, at: 0, pointerType: 'touch' }, { kind: 'move', x: 0.3, at: 10 }, { kind: 'cancel', at: 20 }]);
    expect(t.tries[0]).toEqual({ start: 0, end: 20, reached: false, furthest: 0.3, pointerType: 'touch' });
  });

  it('ignores moves and let-goes with no press, a second press, and wrong numbers', () => {
    const t0 = emptyDragTrial();
    expect(dragTrialStep(t0, { kind: 'move', x: 1, at: 1 })).toBe(t0);
    expect(dragTrialStep(t0, { kind: 'up', x: 1, at: 1 })).toBe(t0);
    const t1 = dragTrialStep(t0, { kind: 'down', x: 0, at: 0, pointerType: '' });
    expect(t1.current?.pointerType).toBe('UNKNOWN');
    expect(dragTrialStep(t1, { kind: 'down', x: 0, at: 5, pointerType: 'mouse' })).toBe(t1);
    expect(dragTrialStep(t1, { kind: 'move', x: Number.NaN, at: 5 }).current?.at).toBe(0);
    expect(dragTrialStep(t1, { kind: 'move', x: -3, at: 5 }).current?.at).toBe(0);
  });

  it('stops after the last try, and after giving up', () => {
    const t = run(emptyDragTrial(), [...reach(0, 1_000), ...reach(2_000, 1_000), ...reach(4_000, 1_000)]);
    expect(t.tries).toHaveLength(DRAG_TRIES);
    expect(dragDone(t)).toBe(true);
    expect(dragTrialStep(t, { kind: 'down', x: 0, at: 9_000, pointerType: 'touch' })).toBe(t);
    const g = giveUpDrag(dragTrialStep(emptyDragTrial(), { kind: 'down', x: 0, at: 0, pointerType: 'touch' }));
    expect(g).toEqual({ tries: [], current: null, gaveUp: true });
    expect(dragDone(g)).toBe(true);
  });
});

describe('a whole test from events', () => {
  it('gives some when one of three tries stops short', () => {
    const r = dragResult(run(emptyDragTrial(), [...reach(0, 1_000), ...short(2_000, 0.5), ...reach(4_000, 3_000, 'mouse')]));
    expect(r).toEqual({ outcome: 'some', reached: 2, tries: 3, middleMs: 2_000, bestShort: 0.5, pointerTypes: ['touch', 'mouse'] });
  });
});

describe('dragResult', () => {
  it('is not done before any try', () => {
    expect(dragResult(emptyDragTrial())).toEqual({ outcome: 'not-done', reached: 0, tries: 0, middleMs: null, bestShort: null, pointerTypes: [] });
    expect(dragIsHard(dragResult(emptyDragTrial()))).toBeNull();
  });

  it('says the person cannot drag when they gave up before trying', () => {
    const r = dragResult(giveUpDrag(emptyDragTrial()));
    expect(r.outcome).toBe('cannot');
    expect(dragIsHard(r)).toBe(true);
  });

  it('gives the middle time of the tries that made it, and the best of those that did not', () => {
    const r = dragResult({ tries: [tr(true, 1_000), tr(false, 500, 0.6), tr(true, 3_000)], current: null, gaveUp: false });
    expect(r).toEqual({ outcome: 'some', reached: 2, tries: 3, middleMs: 2_000, bestShort: 0.6, pointerTypes: ['touch'] });
    expect(dragIsHard(r)).toBe(true);
    expect(dragResult({ tries: [tr(true, 1_000), tr(true, 4_000), tr(true, 2_000)], current: null, gaveUp: false }).middleMs).toBe(2_000);
  });

  it('is all when every try made it, and none when none did', () => {
    const all = dragResult({ tries: [tr(true, 1_000)], current: null, gaveUp: false });
    expect(all.outcome).toBe('all');
    expect(dragIsHard(all)).toBe(false);
    expect(dragResult({ tries: [tr(false, 1)], current: null, gaveUp: false }).outcome).toBe('none');
  });

  it('keeps every kind of pointer once, in order', () => {
    expect(dragResult({ tries: [tr(true, 1, 1, 'mouse'), tr(true, 1, 1, 'touch'), tr(true, 1, 1, 'mouse')], current: null, gaveUp: false }).pointerTypes).toEqual(['mouse', 'touch']);
  });
});

describe('the words', () => {
  it('names the pointers, and UNKNOWN for one it does not know', () => {
    expect(pointerWords(['mouse', 'touch'], 'en')).toBe('a mouse or similar pointer and touch');
    expect(pointerWords(['pen', 'UNKNOWN'], 'fr')).toBe('un stylet et UNKNOWN');
  });

  it('sums up the test in both languages', () => {
    const some = dragResult({ tries: [tr(true, 1_000), tr(false, 500, 0.6), tr(true, 3_000)], current: null, gaveUp: false });
    expect(dragSummary(some, 'en')).toEqual(['2 of 3 tries reached the end of the track, with touch.', 'Middle time of those that made it: 2 s.', 'The best try that stopped short got 60% of the way.']);
    expect(dragSummary(some, 'fr')).toEqual([
      '2 essais ont atteint le bout de la piste sur 3, avec le toucher.',
      `Temps au milieu de ceux qui ont réussi${NBSP}: 2${NBSP}s.`,
      `Le meilleur essai arrêté en route est allé à 60${NBSP}% de la piste.`,
    ]);
    expect(dragSummary(dragResult(emptyDragTrial()), 'en')[0]).toContain('UNKNOWN');
    expect(dragSummary(dragResult(giveUpDrag(emptyDragTrial())), 'en')).toEqual(['You said you cannot drag here.']);
  });

  it('gives one line for the barrier text, asking for a single-tap way when dragging was hard', () => {
    expect(dragNote(dragResult(emptyDragTrial()), 'en')).toBe('');
    expect(dragNote(dragResult(giveUpDrag(emptyDragTrial())), 'en')).toBe('Dragging: I cannot drag. I need another way to do it, with a single tap or click.');
    expect(dragNote(dragResult({ tries: [tr(true, 1_250), tr(true, 1_250)], current: null, gaveUp: false }), 'fr')).toBe(`Glisser${NBSP}: 2 essais sur 2 réussis, 1,3${NBSP}s au milieu.`);
    expect(dragNote(dragResult({ tries: [tr(false, 1)], current: null, gaveUp: false }), 'en')).toBe('Dragging: 0 of 1 tries made it. I need another way to do it, with a single tap or click.');
  });

  it('follows French typography and makes no claim', () => {
    const results = [
      dragResult(emptyDragTrial()),
      dragResult(giveUpDrag(emptyDragTrial())),
      dragResult({ tries: [tr(true, 1_000), tr(false, 500, 0.6), tr(true, 3_000)], current: null, gaveUp: false }),
      dragResult({ tries: [tr(true, 900)], current: null, gaveUp: false }),
    ];
    for (const r of results) {
      for (const line of [...dragSummary(r, 'fr'), dragNote(r, 'fr')].filter((l) => l !== '')) {
        expect(frTypographyIssues(line), line).toEqual([]);
        expect(line).not.toMatch(/\p{L}'\p{L}/u);
        expect(line.toLowerCase()).not.toMatch(/vérif|garanti|diagnos|conforme/);
      }
    }
  });
});
