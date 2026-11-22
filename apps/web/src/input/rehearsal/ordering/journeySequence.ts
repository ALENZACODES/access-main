import type { ControlAction, Locale, Step } from '../model.ts';
import { availableTargets, initialScan, stepScan, targetsForSteps, type ScanSnapshot } from '../scanner.ts';

export interface RehearsalSequence {
  readonly steps: readonly Step[];
  readonly scan: ScanSnapshot;
  /** The last explicitly selected step can differ from the current scan cursor. */
  readonly selectedId: string | null;
}

export type SequenceAction =
  | { readonly type: 'add' | 'edit'; readonly step: Step; readonly locale: Locale }
  | { readonly type: 'remove'; readonly id: string; readonly locale: Locale }
  | {
      readonly type: 'order';
      readonly expected: readonly string[];
      readonly order: readonly string[];
      readonly locale: Locale;
    }
  | { readonly type: 'scan'; readonly command: ControlAction; readonly locale: Locale };

export function initialSequence(): RehearsalSequence {
  return {
    steps: [],
    scan: { controls: initialScan(), selected: null, issues: [] },
    selectedId: null,
  };
}

/** Re-index the cursor after a list change. Editing a step can remove it from the scan. */
function withSteps(state: RehearsalSequence, steps: readonly Step[], locale: Locale): RehearsalSequence {
  const eligible = availableTargets(targetsForSteps(steps, locale));
  const { controls, selected } = state.scan;
  const index = eligible.findIndex(target => target.id === controls.focus);
  const stillEligible = (id: string | null) =>
    id !== null && eligible.some(target => target.id === id) ? id : null;
  return {
    steps,
    selectedId: stillEligible(state.selectedId),
    scan: {
      ...state.scan,
      selected: stillEligible(selected),
      controls: {
        ...controls,
        focus: index < 0 ? null : controls.focus,
        scanning: index >= 0 && controls.scanning,
        index,
      },
    },
  };
}

function atPosition(step: Step, sequence: number): Step {
  return sequence === step.sequence ? step : { ...step, sequence };
}

function applyOrder(
  steps: readonly Step[],
  expected: readonly string[],
  order: readonly string[],
): readonly Step[] {
  // The dialog and the parent reducer can see different updates in a React batch.
  if (expected.length !== steps.length || order.length !== steps.length) return steps;
  if (steps.some((step, i) => step.id !== expected[i])) return steps;
  if (order.every((id, i) => id === expected[i])) return steps;

  const remaining = new Map(steps.map(step => [step.id, step]));
  const reordered: Step[] = [];
  for (const id of order) {
    const step = remaining.get(id);
    if (!step) return steps;
    remaining.delete(id);
    reordered.push(atPosition(step, reordered.length));
  }
  return reordered;
}

export function sequenceReducer(state: RehearsalSequence, action: SequenceAction): RehearsalSequence {
  const { steps } = state;
  switch (action.type) {
    case 'add':
      if (steps.some(step => step.id === action.step.id)) return state;
      return withSteps(state, [...steps, atPosition(action.step, steps.length)], action.locale);
    case 'edit': {
      const index = steps.findIndex(step => step.id === action.step.id);
      if (index < 0) return state;
      const updated = steps.slice();
      updated[index] = atPosition(action.step, index);
      return withSteps(state, updated, action.locale);
    }
    case 'remove':
      if (!steps.some(step => step.id === action.id)) return state;
      return withSteps(state, steps.filter(step => step.id !== action.id).map(atPosition), action.locale);
    case 'order': {
      const reordered = applyOrder(steps, action.expected, action.order);
      return reordered === steps ? state : withSteps(state, reordered, action.locale);
    }
    case 'scan': {
      const scan = stepScan(state.scan.controls, action.command, targetsForSteps(steps, action.locale));
      const clear = action.command === 'RESET' || action.command === 'CANCEL';
      return { ...state, scan, selectedId: clear ? null : scan.selected ?? state.selectedId };
    }
  }
}
