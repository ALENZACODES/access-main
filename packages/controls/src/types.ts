export const CONTROL_MODES = ["keyboard", "switch", "voice", "gaze"] as const;
export type ControlMode = (typeof CONTROL_MODES)[number];

/** The one action set every mode must expose. */
export const ACTION_IDS = ["next", "previous", "choose", "confirm", "clear"] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export function isActionId(value: unknown): value is ActionId {
  return typeof value === "string" && (ACTION_IDS as readonly string[]).includes(value);
}

export type AdapterResult =
  | { kind: "action"; action: ActionId }
  /** Switch scanning moved to a new highlighted action. Nothing was run. */
  | { kind: "scan"; highlighted: ActionId }
  /** Voice: the person asked for the command list. */
  | { kind: "help" }
  /** Voice: the words matched no command. Nothing was run. */
  | { kind: "unknown"; heard: string }
  /** Input that this adapter does not use (or a dwell still in progress). */
  | { kind: "ignored" };

export interface ControlAdapter<Input> {
  readonly mode: ControlMode;
  handle(input: Input): AdapterResult;
  /** Inputs that, fed to a fresh adapter, end in exactly this action and in no earlier action. */
  plan(action: ActionId): Input[];
  reset(): void;
}
