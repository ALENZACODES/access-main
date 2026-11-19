/**
 * What an error state offers after Try again has failed more than once.
 *
 * The first failure shows the state as written. From the second failure in a
 * row the state also says how many times it failed and adds Help, and, when the
 * device is offline with no pack, the offline pack page. The wording never
 * blames the person or the device and never promises a fix.
 */
import { message } from "./messages";
import { ACTION_LINKS, MIN_TOUCH_TARGET_PX, type ActionId, type Locale, type StateAction, type StateView } from "./stateCopy";

/** Failures in a row before the state offers more than Try again. */
export const ESCALATE_AFTER = 2;
/** Beyond this the count is shown as is but nothing more changes; it also bounds the sentence. */
export const MAX_SHOWN_FAILURES = 99;

export interface EscalationInput {
  /** Failed results in a row, counting the current one. */
  readonly failures: number;
  readonly online: boolean;
  /** Whether a pack is stored on this device; null when not known. */
  readonly packStored: boolean | null;
}

export interface Escalation {
  readonly escalated: boolean;
  readonly shownFailures: number;
  /** Link actions added after the view's own actions, in order. */
  readonly extraActions: readonly ActionId[];
}

export function escalationFor(input: EscalationInput): Escalation {
  const failures = Number.isFinite(input.failures) ? Math.max(0, Math.floor(input.failures)) : 0;
  if (failures < ESCALATE_AFTER) return { escalated: false, shownFailures: failures, extraActions: [] };
  const extra: ActionId[] = ["help"];
  // Offline with no pack stored: the pack page is the one thing that changes that.
  if (!input.online && input.packStored === false) extra.push("download-pack");
  return { escalated: true, shownFailures: Math.min(failures, MAX_SHOWN_FAILURES), extraActions: extra };
}

const ACTION_LABEL: Readonly<Record<"help" | "download-pack", Record<Locale, string>>> = {
  help: { en: "Open help", fr: "Ouvrir l’aide" },
  "download-pack": { en: "Download an offline pack", fr: "Télécharger un pack hors ligne" },
};

/**
 * The view after repeated failures. Only error (alert) views change; an empty
 * state is returned as it is. Actions already on the view are not repeated, and
 * every added action is a link, so it works without a handler from the page.
 */
export function escalateView(view: StateView, input: EscalationInput, locale: Locale): StateView {
  if (view.role !== "alert") return view;
  const escalation = escalationFor(input);
  if (!escalation.escalated) return view;
  const present = new Set(view.actions.map((a) => a.id));
  const added: StateAction[] = escalation.extraActions
    .filter((id) => !present.has(id) && ACTION_LINKS[id] !== undefined)
    .map((id) => ({ id, label: ACTION_LABEL[id as "help" | "download-pack"][locale], minTargetPx: MIN_TOUCH_TARGET_PX }));
  const note = message("retry.stillFailing", locale, { n: escalation.shownFailures });
  return { ...view, description: `${view.description} ${note}`, actions: [...view.actions, ...added] };
}
