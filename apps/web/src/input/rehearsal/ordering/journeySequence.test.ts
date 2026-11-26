import { describe, expect, it } from 'vitest';
import type { ControlAction, Journey, Locale, Step } from '../model.ts';
import { targetsForJourney } from '../scanner.ts';
import { inspectSession } from '../report.ts';
import { initialSequence, sequenceReducer, type RehearsalSequence } from './journeySequence.ts';
import { createOrderDraft, reduceOrderDraft, commitOrderDraft } from './orderDraft.ts';

function step(id: string, overrides: Partial<Step> = {}): Step {
  return {
    id,
    sequence: 0,
    kind: 'custom',
    label: { en: `Step ${id}`, fr: `Étape ${id}` },
    detail: { en: 'Read the label', fr: 'Lire le libellé' },
    access: 'unknown',
    source: null,
    offline: { state: 'unknown' },
    needsReview: true,
    ...overrides,
  };
}

const first = step('first');
const second = step('second');
const third = step('third');
const fourth = step('fourth');
const ids = (state: RehearsalSequence) => state.steps.map(item => item.id);

function start(...steps: Step[]) {
  return steps.reduce(
    (state, item) => sequenceReducer(state, { type: 'add', step: item, locale: 'en' }),
    initialSequence(),
  );
}

function scan(state: RehearsalSequence, ...commands: ControlAction[]) {
  return commands.reduce(
    (current, command) => sequenceReducer(current, { type: 'scan', command, locale: 'en' }),
    state,
  );
}

function arrange(state: RehearsalSequence, order: string[], expected = ids(state)) {
  return sequenceReducer(state, { type: 'order', order, expected, locale: 'en' });
}

function remove(state: RehearsalSequence, id: string) {
  return sequenceReducer(state, { type: 'remove', id, locale: 'en' });
}

function edit(state: RehearsalSequence, replacement: Step, locale: Locale = 'en') {
  return sequenceReducer(state, { type: 'edit', step: replacement, locale });
}

function journey(state: RehearsalSequence): Journey {
  return { id: 'rehearsal', createdOn: '2026-11-21', name: { en: 'Practice', fr: 'Exercice' }, steps: state.steps };
}

describe('applying an order to the live rehearsal', () => {
  it('changes positions without swapping bilingual copy or source metadata', () => {
    const source: Step['source'] = {
      name: 'Exercise instructions',
      url: 'https://example.org/instructions',
      licence: 'CC0',
      collectedOn: '2026-11-21',
      tier: 'PRIMARY',
    };
    const documented = step('documented', {
      source,
      offline: { state: 'stored', path: 'instructions.json', savedOn: '2026-11-21' },
      needsReview: false,
    });
    const original = start(first, documented, third);
    const arranged = arrange(original, ['documented', 'first', 'third']);
    expect(arranged.steps).toEqual([
      { ...documented, sequence: 0 },
      { ...first, sequence: 1 },
      { ...third, sequence: 2 },
    ]);
    const moved = arranged.steps[0]!;
    expect(moved.label).toBe(documented.label);
    expect(moved.detail).toBe(documented.detail);
    expect(moved.source).toBe(source);
    expect(moved.offline).toBe(documented.offline);
    expect(arranged.steps[2]).toBe(original.steps[2]);
    expect(ids(original)).toEqual(['first', 'documented', 'third']);
  });

  it('applies edits made to a label without discarding them when the IDs still match', () => {
    const before = start(first, second);
    const draft = reduceOrderDraft(createOrderDraft(ids(before)), { type: 'move', direction: 'last' });
    const label = { en: 'New label', fr: 'Nouveau libellé' };
    const changed = edit(before, { ...first, label });
    const commit = commitOrderDraft(draft, ids(changed));
    if (!commit.ok) throw Error('A label change must preserve stable identities');
    const after = sequenceReducer(changed, {
      type: 'order', expected: draft.original, order: commit.order, locale: 'fr',
    });
    expect(after.steps[1]?.label).toBe(label);
    expect(targetsForJourney(journey(after), 'fr').map(target => target.name))
      .toEqual([second.label.fr, label.fr]);
  });

  it.each([
    ['a missing ID', ['third', 'first']],
    ['an extra ID', ['first', 'second', 'third', 'fourth']],
    ['a duplicate', ['second', 'first', 'second']],
    ['a replacement with the same count', ['third', 'fourth', 'first']],
  ] as const)('leaves the current sequence untouched for %s', (_, invalid) => {
    const state = scan(start(first, second, third), 'NEXT', 'SELECT');
    expect(arrange(state, [...invalid])).toBe(state);
  });

  it('rejects a stale apply after another reorder even with exactly the same IDs', () => {
    const initial = start(first, second, third);
    const concurrent = arrange(initial, ['second', 'first', 'third']);
    expect(arrange(concurrent, ['third', 'second', 'first'], ids(initial))).toBe(concurrent);
  });

  it('does not revive removed steps or lose newly added ones on a stale apply', () => {
    const initial = start(first, second);
    const replacement = sequenceReducer(remove(initial, first.id), { type: 'add', step: third, locale: 'en' });
    expect(arrange(replacement, ['second', 'first'], ids(initial))).toBe(replacement);
    expect(ids(replacement)).toEqual(['second', 'third']);
  });

  it('normalizes positions after edits and ignores repeated adds and late edits', () => {
    const state = start(first, second, third);
    const renamed = edit(state, { ...second, sequence: 99, needsReview: false });
    expect(renamed.steps[1]).toEqual({ ...second, sequence: 1, needsReview: false });
    expect(sequenceReducer(renamed, { type: 'add', step: second, locale: 'fr' })).toBe(renamed);
    const after = remove(renamed, 'second');
    expect(after.steps.map(row => [row.id, row.sequence])).toEqual([['first', 0], ['third', 1]]);
    expect(remove(after, 'second')).toBe(after);
    expect(edit(after, second)).toBe(after);
  });
});

describe('the scan cursor when the displayed sequence changes', () => {
  it('keeps focus and explicit selection separate and moves from the correct new position', () => {
    const original = scan(start(first, second, third, fourth), 'NEXT', 'SELECT', 'NEXT');
    expect(original.scan.controls.focus).toBe('second');
    expect(original.selectedId).toBe('first');

    const changed = arrange(original, ['fourth', 'third', 'second', 'first']);
    expect(changed.scan.controls.focus).toBe('second');
    expect(changed.scan.controls.index).toBe(2);
    expect(changed.scan.controls.history).toBe(original.scan.controls.history);
    expect(changed.selectedId).toBe('first');
    expect(scan(changed, 'PREVIOUS').scan.controls.focus).toBe('third');
    expect(scan(changed, 'NEXT').scan.controls.focus).toBe('first');
  });

  it('indexes only eligible targets when a non-operable step moves', () => {
    const state = scan(start(first, { ...second, access: 'unsupported' }, third), 'NEXT', 'NEXT');
    const changed = arrange(state, ['second', 'third', 'first']);
    expect(changed.scan.controls.focus).toBe('third');
    expect(changed.scan.controls.index).toBe(0);
    expect(scan(changed, 'NEXT').scan.controls.focus).toBe('first');
    expect(scan(changed, 'PREVIOUS').scan.controls.focus).toBe('first');
  });

  it('removes a deleted cursor without implicitly selecting its neighbour', () => {
    const state = scan(start(first, second, third), 'NEXT', 'SELECT', 'NEXT');
    const changed = remove(state, 'second');
    expect(changed.scan.controls).toMatchObject({ focus: null, index: -1, scanning: false });
    expect(changed.selectedId).toBe('first');
    expect(scan(changed, 'SELECT').scan.issues.map(issue => issue.code)).toContain('scan.no-selection');
    expect(scan(changed, 'PREVIOUS').scan.controls.focus).toBe('third');
  });

  it('clears a removed selection while preserving a different current target', () => {
    const changed = remove(scan(start(first, second), 'NEXT', 'SELECT', 'NEXT'), 'first');
    expect(changed.selectedId).toBeNull();
    expect(changed.scan.controls).toMatchObject({ focus: 'second', index: 0, scanning: true });
  });

  it('never brings back a selection just because a target becomes eligible again', () => {
    const state = scan(start(first, second), 'NEXT', 'SELECT');
    const blocked = edit(state, { ...first, access: 'unsupported' });
    expect(blocked.selectedId).toBeNull();
    expect(blocked.scan.selected).toBeNull();
    expect(blocked.scan.controls.focus).toBeNull();
    const restored = edit(blocked, first);
    expect(restored.selectedId).toBeNull();
    expect(restored.scan.controls.focus).toBeNull();
    expect(scan(restored, 'NEXT', 'SELECT').selectedId).toBe('first');
  });

  it('clears the final selection on deletion and starts the next list explicitly', () => {
    const changed = remove(scan(start(first), 'NEXT', 'SELECT'), first.id);
    expect(changed.steps).toEqual([]);
    expect(changed.selectedId).toBeNull();
    expect(changed.scan.selected).toBeNull();
    expect(changed.scan.controls.history).toEqual(['NEXT', 'SELECT']);
    const added = sequenceReducer(changed, { type: 'add', step: second, locale: 'fr' });
    expect(added.scan.controls.focus).toBeNull();
    expect(scan(added, 'NEXT').scan.controls.focus).toBe(second.id);
  });

  it('exports findings against the applied positions with UNKNOWN evidence intact', () => {
    const current = arrange(start(first, second), ['second', 'first']);
    const rehearsed = scan(current, 'NEXT', 'SELECT');
    const plan = journey(rehearsed);
    const report = inspectSession({
      journey: plan, locale: 'fr', targets: targetsForJourney(plan, 'fr'),
      scan: rehearsed.scan, keyboard: [], announcements: [], notes: '',
    }, { today: '2026-11-21', maxAgeDays: 180, requireOffline: false });
    expect(report.steps.map(row => [row.id, row.status])).toEqual([['second', 'UNKNOWN'], ['first', 'UNKNOWN']]);
    expect(report.findings.some(item => item.code === 'source.missing')).toBe(true);
  });
});
