/** Pure, device-independent step/select model; disabled targets are never selected. */
export interface Target {
  id: string;
  enabled: boolean;
}

export interface ScanState {
  index: number;
}

export function activeTargets(targets: readonly Target[]): Target[] {
  return targets.filter((target) => target.enabled);
}

export function normalise(state: ScanState, targets: readonly Target[]): ScanState {
  const count = activeTargets(targets).length;
  return { index: count ? ((state.index % count) + count) % count : -1 };
}

export function advance(state: ScanState, targets: readonly Target[]): ScanState {
  const enabled = activeTargets(targets);
  if (!enabled.length) return { index: -1 };
  return { index: (normalise(state, targets).index + 1) % enabled.length };
}

export function select(state: ScanState, targets: readonly Target[]): string | null {
  const enabled = activeTargets(targets);
  if (!enabled.length) return null;
  return enabled[normalise(state, targets).index]?.id ?? null;
}
