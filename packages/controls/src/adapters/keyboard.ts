import type { ActionId, AdapterResult, ControlAdapter } from "../types.ts";

export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

const KEY_ACTIONS: Readonly<Record<string, ActionId>> = {
  ArrowDown: "next",
  ArrowRight: "next",
  ArrowUp: "previous",
  ArrowLeft: "previous",
  Enter: "choose",
  " ": "choose",
  c: "confirm",
  C: "confirm",
  Escape: "clear",
};

const PRIMARY_KEY: Readonly<Record<ActionId, string>> = {
  next: "ArrowDown",
  previous: "ArrowUp",
  choose: "Enter",
  confirm: "c",
  clear: "Escape",
};

/** Maps keys to actions. Tab is never mapped, so focus can always leave. Browser shortcuts are left alone. */
export class KeyboardAdapter implements ControlAdapter<KeyInput> {
  readonly mode = "keyboard" as const;

  handle(input: KeyInput): AdapterResult {
    if (input.ctrlKey || input.altKey || input.metaKey) return { kind: "ignored" };
    if (!Object.prototype.hasOwnProperty.call(KEY_ACTIONS, input.key)) return { kind: "ignored" };
    const action = KEY_ACTIONS[input.key];
    return action ? { kind: "action", action } : { kind: "ignored" };
  }

  plan(action: ActionId): KeyInput[] {
    return [{ key: PRIMARY_KEY[action] }];
  }

  reset(): void {}
}
