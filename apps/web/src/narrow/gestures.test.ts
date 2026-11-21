import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import type { GestureFacts, GestureItem, GestureKind } from './gesture-inpage.js';
import { GESTURE_KINDS, buildGestures, findingText, gestureAdvice, gestureSummary, kindWord } from './gestures.js';
import { NBSP, NNBSP } from './types.js';

const item = (kind: GestureKind, name: string, alternatives: string[] = [], keyboard: boolean | null = null): GestureItem => ({ id: `${kind}[0]`, kind, name, alternatives, keyboard });
const FACTS: GestureFacts = {
  items: [item('slider', 'Volume', ['+', '−'], true), item('draggable', 'Stop 2'), item('carousel', 'Photos', ['Next']), item('canvas', 'Map', [], false)],
  truncated: false,
};

describe('buildGestures', () => {
  it('puts those with no single-tap way first, and counts them by kind', () => {
    const m = buildGestures(FACTS);
    expect(m.findings.map((f) => [f.item.name, f.status])).toEqual([
      ['Stop 2', 'none-found'],
      ['Map', 'none-found'],
      ['Volume', 'alternative-found'],
      ['Photos', 'alternative-found'],
    ]);
    expect([m.none, m.found, m.truncated]).toEqual([2, 2, false]);
    expect(m.byKind).toEqual({ slider: 1, draggable: 1, carousel: 1, canvas: 1, 'touch-none': 0, sideways: 0 });
  });

  it('has nothing for an empty page', () => {
    const m = buildGestures({ items: [], truncated: true });
    expect([m.findings.length, m.none, m.found, m.truncated]).toEqual([0, 0, 0, true]);
  });
});

describe('findingText', () => {
  const [stop, map, volume, photos] = buildGestures(FACTS).findings;

  it('says what the control asks for and that no way was found', () => {
    expect(findingText(stop!, 'en')).toBe('Item to drag “Stop 2”: it is dragged. No other way with a single tap was found around it.');
    expect(findingText(map!, 'en')).toBe('Drawing area or map “Map”: it may be dragged or pinched. No other way with a single tap was found around it. It cannot be reached by keyboard.');
  });

  it('names the possible ways, to try, and says keyboard alone is not enough', () => {
    expect(findingText(volume!, 'en')).toBe('Slider “Volume”: its thumb is dragged. A possible other way, to try: “+”, “−”. It can be reached by keyboard, but a pointer still needs a single-tap way.');
    expect(findingText(photos!, 'fr')).toBe(`Carrousel «${NNBSP}Photos${NNBSP}»${NBSP}: on peut le balayer. Une autre façon possible, à essayer${NBSP}: «${NNBSP}Next${NNBSP}».`);
  });

  it('says UNKNOWN for a control with no name', () => {
    expect(findingText({ item: item('sideways', ''), status: 'none-found' }, 'en')).toMatch(/^Strip that scrolls sideways UNKNOWN: /);
  });
});

describe('gestureSummary', () => {
  const m = buildGestures(FACTS);

  it('counts what was found, and says what it means after a hard drag test', () => {
    expect(gestureSummary(m, true, 'en')).toEqual([
      '4 controls found. With no single-tap way found: 2. With a possible other way, to try: 2.',
      'From your drag test, the 2 controls with no other way may block you.',
    ]);
  });

  it('says a drag that went through may still be harder elsewhere, or UNKNOWN without the test', () => {
    expect(gestureSummary(m, false, 'en')[1]).toBe('Your drag test went through, but a drag on a small target or a long hold may be harder.');
    expect(gestureSummary(m, null, 'en')[1]).toBe('The drag test was not done, so what this means for you is UNKNOWN.');
  });

  it('says when the reading stopped early, and when nothing was found', () => {
    expect(gestureSummary(buildGestures({ ...FACTS, truncated: true }), true, 'en')[0]).toContain('(the reading stopped before the end)');
    expect(gestureSummary(buildGestures({ items: [], truncated: false }), true, 'en')).toEqual([
      'No drag or gesture control was found on this page. A control built some other way may still ask for one.',
    ]);
  });

  it('adds nothing about the person when every control has a possible way', () => {
    expect(gestureSummary(buildGestures({ items: [item('slider', 'V', ['+'])], truncated: false }), true, 'en')).toHaveLength(1);
  });
});

describe('gestureAdvice', () => {
  it('gives one hint per kind of control with no way found', () => {
    expect(gestureAdvice(buildGestures(FACTS), 'en')).toEqual([
      'For an item to drag, Move up and Move down buttons, or a Move to menu.',
      'For a map or a gesture area, buttons to zoom in, zoom out and move the view.',
    ]);
    const all = buildGestures({ items: GESTURE_KINDS.map((k) => item(k, k)), truncated: false });
    expect(gestureAdvice(all, 'fr')).toHaveLength(4);
    expect(gestureAdvice(buildGestures({ items: [item('slider', 'V', ['+'])], truncated: false }), 'en')).toEqual([]);
  });
});

describe('the French wording', () => {
  it('follows French typography, names every kind, and makes no claim', () => {
    const all = buildGestures({ items: GESTURE_KINDS.flatMap((k) => [item(k, `Nom ${k}`), item(k, `Autre ${k}`, ['Suivant'], true)]), truncated: true });
    const lines = [
      ...all.findings.map((f) => findingText(f, 'fr')),
      ...gestureSummary(all, true, 'fr'),
      ...gestureSummary(all, false, 'fr'),
      ...gestureSummary(all, null, 'fr'),
      ...gestureSummary(buildGestures({ items: [], truncated: false }), null, 'fr'),
      ...gestureAdvice(all, 'fr'),
      ...GESTURE_KINDS.map((k) => kindWord(k, 'fr')),
    ];
    for (const line of lines) {
      expect(frTypographyIssues(line), line).toEqual([]);
      expect(line).not.toMatch(/\p{L}'\p{L}/u);
      expect(line.toLowerCase()).not.toMatch(/vérif|garanti|diagnos|conforme|admissib/);
    }
  });
});
