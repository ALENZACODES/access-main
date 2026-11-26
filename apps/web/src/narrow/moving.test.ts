import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import type { MovingAnimation, MovingControl, MovingLook } from './moving-inpage.js';
import { AIM_SECONDS, DEFAULT_AIM, MOVE_PX, aimNote, animationText, compareLooks, movedText, movingAdvice, movingNote, movingNotes, movingSummary, type MovingModel } from './moving.js';
import { NBSP, NNBSP } from './types.js';

const c = (name: string, left: number, top: number, id = `button[${name}]`, width = 80, height = 44): MovingControl => ({ id, name, left, top, width, height });
const look = (at: number, controls: MovingControl[], extra: Partial<MovingLook> = {}): MovingLook => ({ at, controls, animations: [], pauseControls: [], reduceMotion: false, truncated: false, ...extra });
const anim = (name: string, endless: boolean, control: boolean): MovingAnimation => ({ target: 'div#x', name, endless, control });

const FIRST = look(1_000, [c('Send', 0, 300), c('Menu', 0, 0), c('Close', 200, 0), c('Old', 0, 400)]);
const SECOND = look(6_000, [c('Send', 0, 380), c('Menu', 4, 3), c('Close', 200, 0, undefined, 80, 60), c('New', 0, 500)]);

describe('the settings', () => {
  it('offers short, middle and long times to aim, with the middle by default', () => {
    expect(AIM_SECONDS).toEqual([2, 5, 10]);
    expect(DEFAULT_AIM).toBe(5);
    expect(MOVE_PX).toBe(8);
  });
});

describe('compareLooks', () => {
  const m = compareLooks(FIRST, SECOND);

  it('finds controls that moved or changed size, the ones that left their place first', () => {
    expect(m.moved.map((x) => [x.control.name, x.dx, x.dy, x.distance, x.left])).toEqual([
      ['Send', 0, 80, 80, true],
      ['Close', 0, 0, 0, false],
    ]);
  });

  it('ignores a move smaller than the limit', () => {
    expect(m.moved.map((x) => x.control.name)).not.toContain('Menu');
  });

  it('finds controls that appeared and went, by id and name', () => {
    expect(m.appeared.map((x) => x.name)).toEqual(['New']);
    expect(m.gone.map((x) => x.name)).toEqual(['Old']);
    const renamed = compareLooks(look(0, [c('A', 0, 0, 'button[0]')]), look(1, [c('B', 0, 0, 'button[0]')]));
    expect([renamed.appeared.length, renamed.gone.length]).toEqual([1, 1]);
  });

  it('gives the seconds between the looks and the counts', () => {
    expect([m.seconds, m.controls, m.endless, m.endlessControls, m.reduceMotion, m.truncated]).toEqual([5, 4, 0, 0, false, false]);
  });

  it('counts endless animations, and those on controls, from the second look', () => {
    const x = compareLooks(look(0, []), look(100, [], { animations: [anim('spin', true, true), anim('fade', false, true), anim('marquee', true, false)], pauseControls: ['Pause'] }));
    expect([x.endless, x.endlessControls, x.pauseControls]).toEqual([2, 1, ['Pause']]);
  });

  it('keeps animations UNKNOWN when the browser could not list them, and says when a look was cut short', () => {
    const x = compareLooks(look(0, [], { truncated: true }), look(100, [], { animations: null, reduceMotion: null }));
    expect([x.animations, x.endless, x.reduceMotion, x.truncated]).toEqual([null, 0, null, true]);
  });
});

describe('the words', () => {
  const m = compareLooks(FIRST, SECOND);

  it('says how far a control moved and whether a resting pointer now misses it', () => {
    expect(movedText(m.moved[0]!, 'en')).toBe('“Send” moved 80 px. A pointer resting where it was now misses it.');
    expect(movedText(m.moved[1]!, 'fr')).toBe(`«${NNBSP}Close${NNBSP}» a changé de taille. Elle couvre encore le milieu de son ancienne place.`);
  });

  it('says what an animation is on and whether it stops', () => {
    expect(animationText(anim('spin', true, true), 'en')).toBe('“spin”, on a control (div#x): never stops.');
    expect(animationText(anim('', false, false), 'fr')).toBe(`UNKNOWN, sur un élément (div#x)${NBSP}: s’arrête d’elle-même.`);
  });

  it('sums up the watch', () => {
    expect(movingSummary(m, 5, 'en')).toEqual([
      'Two looks 5 s apart, over 4 controls. You said you take about 5 s to aim.',
      'Controls that moved: 2. Appeared: 1. Gone: 1.',
      'Animations running: 0, of which 0 never stop and 0 are on controls.',
    ]);
  });

  it('says what is UNKNOWN: animations the browser cannot list, and motion slower than the watch', () => {
    const short = compareLooks(look(0, [], { truncated: true }), look(1_500, [], { animations: null }));
    const lines = movingSummary(short, 10, 'en');
    expect(lines[0]).toBe('Two looks 1.5 s apart, over 0 controls (the reading stopped before the end). You said you take about 10 s to aim.');
    expect(lines[2]).toBe('This browser does not list animations, so what is animated is UNKNOWN.');
    expect(lines[3]).toBe('The looks cover less than your time to aim, so what moves more slowly is UNKNOWN.');
  });
});

describe('movingNotes and movingAdvice', () => {
  it('says what may make aiming hard, with hints for the team', () => {
    const m = compareLooks(FIRST, { ...SECOND, animations: [anim('spin', true, true)], reduceMotion: true });
    expect(movingNotes(m, 'en').map((n) => n.kind)).toEqual(['moved', 'appeared', 'gone', 'endless-control', 'no-pause', 'reduce-ignored']);
    expect(movingNotes(m, 'en')[0]?.text).toBe('1 control left its place while you might be aiming. A slow press may land beside it, or on something else.');
    expect(movingAdvice(m, 'en')).toEqual([
      'Keep controls in place once the page is shown: reserve room for pictures and banners, and insert nothing above what is being read.',
      'Give a visible Pause button for anything that moves without end, and stop automatic rotation.',
      'Follow the device’s “reduce motion” setting.',
    ]);
  });

  it('does not ask for a pause button when one was found, nor speak of the device setting when it is off', () => {
    const m = compareLooks(look(0, []), look(5_000, [], { animations: [anim('marquee', true, false)], pauseControls: ['Pause the news'], reduceMotion: false }));
    expect(movingNotes(m, 'en')).toEqual([]);
    expect(movingAdvice(m, 'en')).toEqual([]);
  });

  it('has nothing to say about a still page', () => {
    const still = compareLooks(look(0, [c('A', 0, 0)]), look(5_000, [c('A', 0, 0)]));
    expect(movingNotes(still, 'fr')).toEqual([]);
  });
});

describe('movingNote', () => {
  it('gives the time to aim for the barrier text, and how many controls moved here', () => {
    const m: MovingModel = compareLooks(FIRST, { ...SECOND, animations: [anim('spin', true, true)] });
    expect(movingNote(m, 10, 'en')).toBe('Things that move: I take about 10 s to aim, and controls need to stay in place for that long. Here, 2 controls moved.');
    expect(movingNote(compareLooks(look(0, []), look(1, [])), 2, 'fr')).toBe(`Ce qui bouge${NBSP}: je mets environ 2${NBSP}s à viser, et les commandes doivent rester en place pendant ce temps.`);
    expect(movingNote(null, 5, 'en')).toBe('');
  });
});

describe('the French wording of the model', () => {
  it('follows French typography, leaves no placeholder and makes no claim', () => {
    const m = compareLooks(FIRST, { ...SECOND, animations: [anim('spin', true, true), anim('fade', false, false)], reduceMotion: true });
    const lines = [
      ...movingSummary(m, 10, 'fr'),
      ...movingSummary(compareLooks(look(0, []), look(1, [], { animations: null })), 5, 'fr'),
      ...movingNotes(m, 'fr').map((n) => n.text),
      ...movingAdvice(m, 'fr'),
      ...m.moved.map((x) => movedText(x, 'fr')),
      ...(m.animations ?? []).map((a) => animationText(a, 'fr')),
      movingNote(m, 5, 'fr'),
    ];
    for (const line of lines) {
      expect(frTypographyIssues(line), line).toEqual([]);
      expect(line).not.toMatch(/\p{L}'\p{L}|\$\{/u);
      expect(line.toLowerCase()).not.toMatch(/vérif|garanti|diagnos|conforme|admissib/);
    }
  });
});

describe('aimNote', () => {
  it('gives the time to aim alone, for the access summary, with nothing about a page', () => {
    expect(aimNote(10, 'en')).toBe('Things that move: I take about 10 s to aim, and controls need to stay in place for that long.');
    expect(aimNote(2, 'fr')).toBe(`Ce qui bouge${NBSP}: je mets environ 2${NBSP}s à viser, et les commandes doivent rester en place pendant ce temps.`);
    expect(movingNote(compareLooks(look(0, []), look(1, [])), 5, 'en')).toBe(aimNote(5, 'en'));
  });
});
