import { t, type Lang } from "./i18n/catalog.ts";
import type { ActionId } from "./types.ts";

export const ITEM_IDS = ["a", "b", "c"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export interface ChooserState {
  /** Index of the current item. */
  focus: number;
  /** Index of the chosen item, or null. */
  chosen: number | null;
  confirmed: boolean;
}

export const initialChooserState: ChooserState = { focus: 0, chosen: null, confirmed: false };

export type Note =
  | { kind: "moved" | "chosen" | "confirmed"; index: number }
  | { kind: "needChoice" }
  | { kind: "cleared" };

export function applyAction(state: ChooserState, action: ActionId): { state: ChooserState; note: Note } {
  const count = ITEM_IDS.length;
  switch (action) {
    case "next": {
      const focus = (state.focus + 1) % count;
      return { state: { ...state, focus }, note: { kind: "moved", index: focus } };
    }
    case "previous": {
      const focus = (state.focus - 1 + count) % count;
      return { state: { ...state, focus }, note: { kind: "moved", index: focus } };
    }
    case "choose":
      return { state: { ...state, chosen: state.focus, confirmed: false }, note: { kind: "chosen", index: state.focus } };
    case "confirm":
      if (state.chosen === null) return { state, note: { kind: "needChoice" } };
      return { state: { ...state, confirmed: true }, note: { kind: "confirmed", index: state.chosen } };
    case "clear":
      return { state: { ...state, chosen: null, confirmed: false }, note: { kind: "cleared" } };
  }
}

/** Pointer or touch on an item: move to it and choose it. */
export function pickIndex(state: ChooserState, index: number): { state: ChooserState; note: Note } {
  if (!Number.isInteger(index) || index < 0 || index >= ITEM_IDS.length) throw new RangeError("item index out of range");
  return applyAction({ ...state, focus: index }, "choose");
}

export function itemName(lang: Lang, index: number): string {
  return t(lang, `item.${ITEM_IDS[index] as ItemId}`);
}

export function describeNote(lang: Lang, note: Note): string {
  switch (note.kind) {
    case "moved":
      return t(lang, "msg.moved", { name: itemName(lang, note.index), position: note.index + 1, total: ITEM_IDS.length });
    case "chosen":
      return t(lang, "msg.chosen", { name: itemName(lang, note.index) });
    case "confirmed":
      return t(lang, "msg.confirmed", { name: itemName(lang, note.index) });
    case "needChoice":
      return t(lang, "msg.needChoice");
    case "cleared":
      return t(lang, "msg.cleared");
  }
}
