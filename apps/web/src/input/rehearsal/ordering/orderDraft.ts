import { validId } from "../model.ts";

/** Keep only the last 50 moves, independently of how many steps are in a rehearsal. */
export const ORDER_HISTORY_LIMIT = 50;

export type MoveDirection = "earlier" | "later" | "first" | "last";
export type Placement = "before" | "after";

interface OrderMove {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

export interface OrderDraft {
  readonly original: readonly string[];
  readonly order: readonly string[];
  readonly selectedId: string | null;
  readonly undoStack: readonly OrderMove[];
  readonly redoStack: readonly OrderMove[];
}

export type OrderAction =
  | { readonly type: "select"; readonly id: string }
  | { readonly type: "move"; readonly direction: MoveDirection }
  | { readonly type: "place"; readonly side: Placement; readonly anchorId: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" };

export type OrderCommit =
  | { readonly ok: true; readonly order: readonly string[] }
  | { readonly ok: false; readonly reason: "stale" | "invalid" };

function uniqueStepIds(ids: readonly string[]): Set<string> | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!validId(id) || seen.has(id)) return null;
    seen.add(id);
  }
  return seen;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** Take a snapshot of identities only. Labels, provenance and the steps themselves stay with the caller. */
export function createOrderDraft(ids: readonly string[], selectedId?: string | null): OrderDraft {
  const original = [...ids];
  const initial = selectedId && original.includes(selectedId) ? selectedId : original[0];
  return {
    original,
    order: original,
    selectedId: uniqueStepIds(original) ? initial ?? null : null,
    undoStack: [],
    redoStack: [],
  };
}

export function isOrderDirty(draft: OrderDraft): boolean {
  return !sameOrder(draft.original, draft.order);
}

function moveItem(order: readonly string[], from: number, to: number, id: string): string[] {
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Replaying a move restores selection to that step, even if a different step was selected afterward. */
function replayMove(draft: OrderDraft, type: "undo" | "redo"): OrderDraft {
  const undoing = type === "undo";
  const stack = undoing ? draft.undoStack : draft.redoStack;
  const move = stack.at(-1);
  if (!move) return draft;
  const from = undoing ? move.to : move.from;
  const to = undoing ? move.from : move.to;
  const order = moveItem(draft.order, from, to, move.id);
  const rest = stack.slice(0, -1);

  return {
    ...draft,
    order,
    selectedId: move.id,
    undoStack: undoing ? rest : [...draft.undoStack, move],
    redoStack: undoing ? [...draft.redoStack, move] : rest,
  };
}

function destination(
  draft: OrderDraft,
  from: number,
  action: Extract<OrderAction, { type: "move" | "place" }>,
): number {
  if (action.type === "place") {
    const anchor = draft.order.indexOf(action.anchorId);
    if (anchor < 0 || anchor === from) return from;
    // Compute the anchor's position after removing the moving step.
    const remainingAnchor = anchor > from ? anchor - 1 : anchor;
    return action.side === "before" ? remainingAnchor : remainingAnchor + 1;
  }

  switch (action.direction) {
    case "earlier":
      return Math.max(0, from - 1);
    case "later":
      return Math.min(draft.order.length - 1, from + 1);
    case "first":
      return 0;
    case "last":
      return draft.order.length - 1;
  }
}

export function reduceOrderDraft(draft: OrderDraft, action: OrderAction): OrderDraft {
  // Empty or ambiguous inputs cannot be edited until the caller starts a new draft.
  const id = draft.selectedId;
  if (id === null) return draft;
  if (action.type === "select") {
    if (action.id === id || !draft.order.includes(action.id)) return draft;
    return { ...draft, selectedId: action.id };
  }
  if (action.type === "undo" || action.type === "redo") return replayMove(draft, action.type);

  const from = draft.order.indexOf(id);
  const to = destination(draft, from, action);
  if (from === to) return draft;
  const move = { id, from, to };
  return {
    ...draft,
    order: moveItem(draft.order, from, to, id),
    undoStack: [...draft.undoStack, move].slice(-ORDER_HISTORY_LIMIT),
    redoStack: [],
  };
}

/** Compare and apply is the caller's synchronous operation. Pass current IDs immediately before applying. */
export function commitOrderDraft(draft: OrderDraft, currentIds: readonly string[]): OrderCommit {
  // A set alone would also accept repeated, missing or substituted IDs.
  const remaining = uniqueStepIds(draft.original);
  if (!remaining || draft.order.length !== draft.original.length) {
    return { ok: false, reason: "invalid" };
  }
  for (const id of draft.order) {
    if (!remaining.delete(id)) return { ok: false, reason: "invalid" };
  }
  // Equal membership is insufficient: another editor may have reordered the same steps.
  if (!sameOrder(currentIds, draft.original)) return { ok: false, reason: "stale" };
  return { ok: true, order: [...draft.order] };
}
