import { describe, expect, it } from "vitest";
import {
  ORDER_HISTORY_LIMIT,
  commitOrderDraft,
  createOrderDraft,
  isOrderDirty,
  reduceOrderDraft,
  type MoveDirection,
  type OrderAction,
  type OrderDraft,
  type Placement,
} from "./orderDraft.ts";

const ids = ["entrance", "path", "lift", "exit"];
const move = (direction: MoveDirection): OrderAction => ({ type: "move", direction });
const select = (id: string): OrderAction => ({ type: "select", id });
const place = (side: Placement, anchorId: string): OrderAction => ({ type: "place", anchorId, side });
const undo: OrderAction = { type: "undo" };
const redo: OrderAction = { type: "redo" };

function apply(start: OrderDraft, ...actions: OrderAction[]): OrderDraft {
  return actions.reduce(reduceOrderDraft, start);
}

function assertInvariants(state: OrderDraft) {
  expect([...state.order].sort()).toEqual([...state.original].sort());
  expect(new Set(state.order).size).toBe(state.original.length);
  if (state.order.length > 0) expect(state.order).toContain(state.selectedId);
  else expect(state.selectedId).toBeNull();
  expect(state.undoStack.length + state.redoStack.length).toBeLessThanOrEqual(ORDER_HISTORY_LIMIT);
  expect(isOrderDirty(state)).toBe(state.order.some((id, i) => id !== state.original[i]));
  expect(commitOrderDraft(state, state.original)).toEqual({ ok: true, order: state.order });
}

describe("opening an order draft", () => {
  it("starts in journey order and selects its first step", () => {
    const draft = createOrderDraft(ids);
    expect(draft.original).toEqual(ids);
    expect(draft.order).toEqual(ids);
    expect(draft.selectedId).toBe("entrance");
    expect(draft.undoStack).toEqual([]);
    expect(draft.redoStack).toEqual([]);
    expect(isOrderDirty(draft)).toBe(false);
  });

  it("correlates focus to a stable identity when the caller supplies one", () => {
    const draft = createOrderDraft(ids, "lift");
    expect(draft.selectedId).toBe("lift");
    expect(apply(draft, move("first")).order).toEqual(["lift", "entrance", "path", "exit"]);
  });

  it.each([undefined, null, "", "deleted"])("falls back to the first step for selection %s", (selection) => {
    expect(createOrderDraft(ids, selection).selectedId).toBe("entrance");
  });

  it("captures a copy of the current IDs", () => {
    const source = [...ids];
    const draft = createOrderDraft(source);
    source.reverse();
    source.pop();
    expect(draft.order).toEqual(ids);
    expect(draft.original).toEqual(ids);
    expect(commitOrderDraft(draft, source)).toEqual({ ok: false, reason: "stale" });
  });

  it("treats an empty list as a valid draft with no available actions", () => {
    const draft = createOrderDraft([]);
    const attempted = apply(draft, select("entrance"), move("last"), place("after", "exit"), undo, redo);
    expect(attempted).toBe(draft);
    assertInvariants(attempted);
  });

  it.each([
    ["duplicate IDs", ["path", "path"]],
    ["empty ID", [""]],
    ["uppercase", ["EXIT"]],
    ["internal whitespace", ["extra step"]],
    ["leading hyphen", ["-exit"]],
    ["an otherwise valid collection with a malformed entry", ["path", "lift", "exit-"]],
  ] as const)("leaves %s intact and fails closed when asked to commit", (_label, input) => {
    const submitted = input;
    const draft = createOrderDraft(submitted, "path");
    expect(draft.original).toEqual(submitted);
    expect(draft.order).toEqual(submitted);
    expect(draft.selectedId).toBeNull();
    expect(apply(draft, select("path"), move("last"), undo)).toBe(draft);
    expect(commitOrderDraft(draft, submitted)).toEqual({ ok: false, reason: "invalid" });
  });

  it("uses ID values literally even when they are also object member names", () => {
    const names = ["constructor", "to-string", "prototype"];
    const draft = apply(createOrderDraft(names, "prototype"), place("before", "constructor"));
    expect(commitOrderDraft(draft, names)).toEqual({ ok: true, order: ["prototype", "constructor", "to-string"] });
  });
});

describe("moving and selecting a step by identity", () => {
  it.each([
    ["earlier", ["path", "entrance", "lift", "exit"]],
    ["later", ["entrance", "lift", "path", "exit"]],
    ["first", ["path", "entrance", "lift", "exit"]],
    ["last", ["entrance", "lift", "exit", "path"]],
  ] as const)("moves the selected step %s without changing the other steps' relative order", (direction, expected) => {
    const draft = createOrderDraft(ids, "path");
    const next = reduceOrderDraft(draft, move(direction));
    expect(next.order).toEqual(expected);
    expect(next.selectedId).toBe("path");
    expect(next.undoStack).toHaveLength(1);
    expect(next.redoStack).toHaveLength(0);
    expect(draft.order).toEqual(ids);
    expect(next.original).toBe(draft.original);
    assertInvariants(next);
  });

  it.each([
    ["entrance", "earlier"],
    ["entrance", "first"],
    ["exit", "later"],
    ["exit", "last"],
  ] as const)("keeps the same state when %s cannot move %s", (selected, direction) => {
    const draft = createOrderDraft(ids, selected);
    expect(reduceOrderDraft(draft, move(direction))).toBe(draft);
  });

  it("never treats an adjacent step as the selected step after moving", () => {
    const draft = createOrderDraft(ids, "path");
    const next = apply(draft, move("later"), move("later"));
    expect(next.order).toEqual(["entrance", "lift", "exit", "path"]);
    expect(next.selectedId).toBe("path");
    expect(next.undoStack).toHaveLength(2);
    expect(apply(next, move("last"))).toBe(next);
  });

  it("records selection without making the order dirty", () => {
    const draft = createOrderDraft(ids);
    const picked = apply(draft, select("exit"));
    expect(picked.selectedId).toBe("exit");
    expect(picked.order).toBe(draft.order);
    expect(picked.undoStack).toBe(draft.undoStack);
    expect(picked.redoStack).toBe(draft.redoStack);
    expect(isOrderDirty(picked)).toBe(false);
    expect(apply(picked, select("exit"), select("missing"))).toBe(picked);
  });

  it("supports a valid one-step session without adding history", () => {
    const draft = createOrderDraft(["path"]);
    const next = apply(
      draft, move("first"), move("last"), move("earlier"), move("later"),
      place("before", "path"), place("after", "path"), undo, redo,
    );
    expect(next).toBe(draft);
    expect(commitOrderDraft(next, ["path"])).toEqual({ ok: true, order: ["path"] });
  });
});

describe("placing a step beside another step", () => {
  it.each([
    ["entrance", "before", "exit", ["path", "lift", "entrance", "exit"]],
    ["entrance", "after", "exit", ["path", "lift", "exit", "entrance"]],
    ["exit", "before", "entrance", ["exit", "entrance", "path", "lift"]],
    ["exit", "after", "entrance", ["entrance", "exit", "path", "lift"]],
    ["path", "after", "lift", ["entrance", "lift", "path", "exit"]],
    ["lift", "before", "path", ["entrance", "lift", "path", "exit"]],
  ] as const)("places %s %s %s", (selected, side, anchorId, expected) => {
    const draft = createOrderDraft(ids, selected);
    const next = apply(draft, place(side, anchorId));
    expect(next.order).toEqual(expected);
    expect(next.selectedId).toBe(selected);
    expect(next.undoStack).toHaveLength(1);
    expect(apply(next, undo).order).toEqual(ids);
    assertInvariants(next);
  });

  it("resolves the anchor's current position after previous edits", () => {
    const initial = createOrderDraft(ids, "exit");
    const one = apply(initial, move("first"), select("lift"));
    const two = apply(one, place("before", "exit"));
    expect(two.order).toEqual(["lift", "exit", "entrance", "path"]);
    expect(two.selectedId).toBe("lift");
    expect(two.undoStack).toHaveLength(2);
  });

  it.each([
    ["path", "before", "lift"],
    ["lift", "after", "path"],
    ["path", "before", "path"],
    ["path", "after", "path"],
    ["path", "before", "absent"],
    ["path", "after", "absent"],
  ] as const)("ignores ineffective request to place %s %s %s", (selected, side, anchorId) => {
    const draft = createOrderDraft(ids, selected);
    expect(apply(draft, place(side, anchorId))).toBe(draft);
  });

  it("keeps every unmoved step in order for every selected step and anchor", () => {
    for (const selected of ids) {
      const others = ids.filter((id) => id !== selected);
      for (const anchor of others) {
        for (const side of ["before", "after"] as const) {
          const draft = createOrderDraft(ids, selected);
          const next = apply(draft, place(side, anchor));
          const anchorPos = next.order.indexOf(anchor);
          const selectedPos = next.order.indexOf(selected);
          expect(selectedPos - anchorPos).toBe(side === "before" ? -1 : 1);
          expect(next.order.filter((id) => id !== selected)).toEqual(others);
          assertInvariants(next);
        }
      }
    }
  });
});

describe("undo and redo along a single editing branch", () => {
  it("returns each order in reverse, then in forward order", () => {
    const initial = createOrderDraft(ids, "exit");
    const movedExit = apply(initial, move("first"));
    const movedLift = apply(movedExit, select("lift"), place("after", "exit"));
    expect(movedLift.order).toEqual(["exit", "lift", "entrance", "path"]);

    const backOne = apply(movedLift, undo);
    expect(backOne.order).toEqual(movedExit.order);
    expect(backOne.selectedId).toBe("lift");
    const backTwo = apply(backOne, undo);
    expect(backTwo.order).toEqual(initial.order);
    expect(backTwo.selectedId).toBe("exit");
    expect(apply(backTwo, undo)).toBe(backTwo);

    const forwardOne = apply(backTwo, redo);
    expect(forwardOne.order).toEqual(movedExit.order);
    expect(forwardOne.selectedId).toBe("exit");
    const forwardTwo = apply(forwardOne, redo);
    expect(forwardTwo.order).toEqual(movedLift.order);
    expect(forwardTwo.selectedId).toBe("lift");
    expect(apply(forwardTwo, redo)).toBe(forwardTwo);
  });

  it("undoes the latest changed step independently of current selection", () => {
    const start = createOrderDraft(ids, "exit");
    const next = apply(start, move("first"), select("path"), undo);
    expect(next.order).toEqual(ids);
    expect(next.selectedId).toBe("exit");

    const replayed = apply(next, select("lift"), redo);
    expect(replayed.order[0]).toBe("exit");
    expect(replayed.selectedId).toBe("exit");
  });

  it("preserves redo after selection, invalid commands and boundary moves", () => {
    const draft = apply(createOrderDraft(ids), move("last"), undo);
    const next = apply(
      draft, select("exit"), select("deleted"), move("last"), move("later"),
      place("after", "lift"), place("before", "exit"),
    );
    expect(next.redoStack).toBe(draft.redoStack);
    expect(next.undoStack).toBe(draft.undoStack);
    expect(apply(next, redo).order).toEqual(["path", "lift", "exit", "entrance"]);
  });

  it("clears the abandoned future on the first genuine move after undo", () => {
    const original = createOrderDraft(ids);
    const previous = apply(original, move("last"), undo);
    const alternate = apply(previous, select("lift"), move("first"));
    expect(alternate.redoStack).toEqual([]);
    expect(alternate.order).toEqual(["lift", "entrance", "path", "exit"]);
    expect(apply(alternate, redo)).toBe(alternate);
    expect(apply(alternate, undo).order).toEqual(ids);
    expect(apply(alternate, undo, redo).order).toEqual(alternate.order);
  });

  it("can return to a clean order through a new move without erasing history", () => {
    const draft = createOrderDraft(ids);
    const originalAgain = apply(draft, move("later"), move("earlier"));
    expect(isOrderDirty(originalAgain)).toBe(false);
    expect(originalAgain.undoStack).toHaveLength(2);
    const oneBack = apply(originalAgain, undo);
    expect(isOrderDirty(oneBack)).toBe(true);
    expect(apply(oneBack, undo).order).toEqual(ids);
  });

  it("caps undo and redo memory and preserves the oldest reachable order at the boundary", () => {
    const initial = createOrderDraft(ids);
    let draft = initial;
    const snapshots: (readonly string[])[] = [initial.order];
    for (let turn = 0; turn < ORDER_HISTORY_LIMIT + 9; turn++) {
      const id = draft.order[0]!;
      draft = apply(draft, select(id), move("last"));
      snapshots.push(draft.order);
      assertInvariants(draft);
    }
    expect(draft.undoStack.length).toBe(ORDER_HISTORY_LIMIT);
    for (let index = snapshots.length - 2; index >= 9; index--) {
      draft = apply(draft, undo);
      expect(draft.order).toEqual(snapshots[index]);
      assertInvariants(draft);
    }
    expect(draft.undoStack).toHaveLength(0);
    expect(draft.redoStack).toHaveLength(ORDER_HISTORY_LIMIT);
    expect(apply(draft, undo)).toBe(draft);
    for (const snapshot of snapshots.slice(10)) {
      draft = apply(draft, redo);
      expect(draft.order).toEqual(snapshot);
      assertInvariants(draft);
    }
    expect(draft.redoStack).toHaveLength(0);
    expect(draft.undoStack).toHaveLength(ORDER_HISTORY_LIMIT);
  });
});

describe("committing against the live journey", () => {
  const draft = apply(createOrderDraft(ids, "exit"), move("first"));

  it("returns a detached permutation without mutating either collection", () => {
    const live = Object.freeze([...ids]);
    const result = commitOrderDraft(draft, live);
    expect(result).toEqual({ ok: true, order: ["exit", "entrance", "path", "lift"] });
    if (!result.ok) throw new Error(result.reason);
    expect(result.order).not.toBe(draft.order);
    expect(result.order).not.toBe(live);
    expect(live).toEqual(ids);
    expect(draft.original).toEqual(ids);
  });

  it.each([
    ["addition", [...ids, "extra"]],
    ["removal", ids.slice(0, -1)],
    ["one replacement", ["entrance", "other", "lift", "exit"]],
    ["different current order", ["path", "entrance", "lift", "exit"]],
    ["current order already equals the proposed order", ["exit", "entrance", "path", "lift"]],
    ["duplicate live IDs", ["entrance", "path", "path", "exit"]],
    ["cleared journey", []],
  ] as const)("rejects a stale draft after %s", (_change, live) => {
    expect(commitOrderDraft(draft, live)).toEqual({ ok: false, reason: "stale" });
    expect(draft.order).toEqual(["exit", "entrance", "path", "lift"]);
    expect(draft.original).toEqual(ids);
  });

  it("cannot treat holes in a sparse live sequence as matching positions", () => {
    const missing = new Array<string>(ids.length);
    missing[0] = ids[0]!;
    expect(commitOrderDraft(draft, missing)).toEqual({ ok: false, reason: "stale" });
    const invalid = createOrderDraft(missing);
    expect(commitOrderDraft(invalid, missing)).toEqual({ ok: false, reason: "invalid" });
  });

  it("also checks for stale sources when the draft itself is clean", () => {
    const clean = createOrderDraft(ids);
    expect(commitOrderDraft(clean, [])).toEqual({ ok: false, reason: "stale" });
    expect(commitOrderDraft(clean, [...ids])).toEqual({ ok: true, order: ids });
  });

  it.each([
    ["duplicate replaces a missing ID", ["path", "lift", "lift", "exit"]],
    ["unknown ID", ["entrance", "path", "lift", "new"]],
    ["missing ID", ids.slice(1)],
    ["excess member", [...ids, "entrance"]],
    ["removed every ID", []],
  ] as const)("rejects invalid proposals even when the baseline matches: %s", (_defect, proposed) => {
    const invalid = { ...draft, order: proposed };
    expect(commitOrderDraft(invalid, ids)).toEqual({ ok: false, reason: "invalid" });
  });

  it("prevents a second open editor from overwriting an accepted proposal", () => {
    const left = apply(createOrderDraft(ids), move("last"));
    const right = apply(createOrderDraft(ids, "exit"), move("first"));
    const first = commitOrderDraft(left, ids);
    if (!first.ok) throw new Error(first.reason);
    expect(commitOrderDraft(right, first.order)).toEqual({ ok: false, reason: "stale" });

    const reopened = apply(createOrderDraft(first.order, "exit"), move("first"));
    expect(commitOrderDraft(reopened, first.order)).toEqual({ ok: true, order: ["exit", "path", "lift", "entrance"] });
  });

  it("does not roll back fresh labels or source information when IDs remain stable", () => {
    const current = ids.map((id) => ({ id, title: `Revised ${id}`, reviewed: id === "exit" }));
    const accepted = commitOrderDraft(draft, current.map((step) => step.id));
    if (!accepted.ok) throw new Error(accepted.reason);
    const byId = new Map(current.map((step) => [step.id, step]));
    const arranged = accepted.order.map((id) => byId.get(id));
    expect(arranged[0]).toBe(current[3]);
    expect(arranged[0]).toMatchObject({ title: "Revised exit", reviewed: true });
    expect(arranged.slice(1)).toEqual(current.slice(0, 3));
  });
});

describe("immutable transition sequences", () => {
  it("can fork the same frozen draft without changing either sibling's history", () => {
    const source = createOrderDraft(Object.freeze([...ids]), "lift");
    const first = apply(source, move("first"));
    Object.freeze(first.original);
    Object.freeze(first.order);
    Object.freeze(first.undoStack);
    Object.freeze(first.redoStack);
    Object.freeze(first);

    const left = apply(first, move("last"), undo);
    const right = apply(first, select("exit"), place("before", "lift"));
    expect(left.order).toEqual(first.order);
    expect(right.order).toEqual(["exit", "lift", "entrance", "path"]);
    expect(first.order).toEqual(["lift", "entrance", "path", "exit"]);
    expect(first.undoStack).toHaveLength(1);
    expect(first.redoStack).toEqual([]);
    expect(left.redoStack).toHaveLength(1);
    expect(right.redoStack).toEqual([]);
  });

  it("preserves the permutation through combinations of a move, a placement, selection and replay", () => {
    for (const direction of ["first", "last", "earlier", "later"] as const) {
      for (const side of ["before", "after"] as const) {
        for (const selected of ids) {
          const draft = createOrderDraft(ids, selected);
          const first = apply(draft, move(direction));
          for (const anchor of ids) {
            const second = apply(first, place(side, anchor));
            const undoCount = second.undoStack.length;
            let current = apply(second, select("path"));
            for (let i = 0; i < undoCount; i++) current = apply(current, undo);
            expect(current.order).toEqual(ids);
            expect(isOrderDirty(current)).toBe(false);
            for (let i = 0; i < undoCount; i++) current = apply(current, redo);
            expect(current.order).toEqual(second.order);
            assertInvariants(current);
          }
        }
      }
    }
  });
});
