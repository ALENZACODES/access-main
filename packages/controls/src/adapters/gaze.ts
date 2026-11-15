import type { ActionId, AdapterResult, ControlAdapter } from "../types.ts";

export const DEFAULT_DWELL_MS = 800;
export const MIN_DWELL_MS = 200;
export const MAX_DWELL_MS = 8000;
export const DWELL_STEP_MS = 100;
export const DWELL_OFF_MS = 0;

/** Snap a requested dwell time to the adjustable range used in the UI. 0 turns dwell off. */
export function normalizeDwellMs(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("dwellMs must be a finite number");
  if (value <= DWELL_OFF_MS) return DWELL_OFF_MS;
  const snapped = Math.round(value / DWELL_STEP_MS) * DWELL_STEP_MS;
  return Math.min(MAX_DWELL_MS, Math.max(MIN_DWELL_MS, snapped));
}

/** Events are supplied by the caller (tests, or the pointer in the demo). No eye-tracking data is read. */
export type GazeInput =
  | { type: "gaze-at"; target: ActionId; timeMs: number }
  | { type: "gaze-away"; timeMs: number };

/**
 * SIMULATOR. Dwell selection driven by explicit events with explicit times.
 * It is not a hardware integration and does not claim eye tracking.
 * A selection fires once per dwell; look away or at another target to arm it again.
 */
export class GazeSimulatorAdapter implements ControlAdapter<GazeInput> {
  readonly mode = "gaze" as const;
  private target: ActionId | null = null;
  private startMs = 0;
  private fired = false;

  dwellMs: number;

  constructor(dwellMs: number = DEFAULT_DWELL_MS) {
    if (!Number.isFinite(dwellMs) || dwellMs <= 0) throw new RangeError("dwellMs must be a positive number");
    this.dwellMs = dwellMs;
  }

  /** Updates the dwell and restarts any dwell in progress. */
  setDwellMs(value: number): number {
    this.dwellMs = normalizeDwellMs(value);
    this.reset();
    return this.dwellMs;
  }

  handle(input: GazeInput): AdapterResult {
    if (input.type === "gaze-away") {
      this.reset();
      return { kind: "ignored" };
    }
    if (input.type !== "gaze-at") return { kind: "ignored" };
    if (this.dwellMs === DWELL_OFF_MS) return { kind: "ignored" };
    if (this.target !== input.target || input.timeMs < this.startMs) {
      this.target = input.target;
      this.startMs = input.timeMs;
      this.fired = false;
    }
    if (!this.fired && input.timeMs - this.startMs >= this.dwellMs) {
      this.fired = true;
      return { kind: "action", action: input.target };
    }
    return { kind: "ignored" };
  }

  /** Fraction of the dwell completed (0 to 1) for the current target, or null. */
  progress(nowMs: number): { target: ActionId; fraction: number } | null {
    if (this.dwellMs === DWELL_OFF_MS || this.target === null) return null;
    if (this.fired) return { target: this.target, fraction: 1 };
    return { target: this.target, fraction: Math.min(1, Math.max(0, (nowMs - this.startMs) / this.dwellMs)) };
  }

  plan(action: ActionId): GazeInput[] {
    return [
      { type: "gaze-at", target: action, timeMs: 0 },
      { type: "gaze-at", target: action, timeMs: this.dwellMs },
    ];
  }

  reset(): void {
    this.target = null;
    this.startMs = 0;
    this.fired = false;
  }
}
