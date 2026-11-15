import { ACTION_IDS, type ActionId, type AdapterResult, type ControlAdapter } from "../types.ts";

export type SwitchInput = { type: "step" } | { type: "select" };

/** Two-switch scanning: Step moves the highlight over the action list (wrapping), Select runs it. */
export class SwitchAdapter implements ControlAdapter<SwitchInput> {
  readonly mode = "switch" as const;
  private cursor = 0;

  highlighted(): ActionId {
    return ACTION_IDS[this.cursor] as ActionId;
  }

  handle(input: SwitchInput): AdapterResult {
    if (input.type === "step") {
      this.cursor = (this.cursor + 1) % ACTION_IDS.length;
      return { kind: "scan", highlighted: this.highlighted() };
    }
    if (input.type === "select") return { kind: "action", action: this.highlighted() };
    return { kind: "ignored" };
  }

  plan(action: ActionId): SwitchInput[] {
    const steps = ACTION_IDS.indexOf(action);
    return [...Array.from({ length: steps }, (): SwitchInput => ({ type: "step" })), { type: "select" }];
  }

  reset(): void {
    this.cursor = 0;
  }
}

/** Hardware switch interfaces often send keys. 1 steps and 2 selects. */
export function switchInputFromKey(key: string): SwitchInput | null {
  if (key === "1") return { type: "step" };
  if (key === "2") return { type: "select" };
  return null;
}
