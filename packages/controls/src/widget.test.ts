import { describe, expect, it } from "vitest";
import { applyAction, describeNote, initialChooserState, pickIndex } from "./widget.ts";

describe("chooser widget", () => {
  it("wraps in both directions", () => {
    let s = initialChooserState;
    s = applyAction(s, "previous").state;
    expect(s.focus).toBe(2);
    s = applyAction(s, "next").state;
    expect(s.focus).toBe(0);
  });

  it("refuses to confirm before a choice and says so", () => {
    const r = applyAction(initialChooserState, "confirm");
    expect(r.state).toEqual(initialChooserState);
    expect(describeNote("en", r.note)).toBe("Choose an item before confirming.");
  });

  it("chooses, confirms, and clears", () => {
    let s = applyAction(initialChooserState, "next").state;
    s = applyAction(s, "choose").state;
    expect(s).toMatchObject({ focus: 1, chosen: 1, confirmed: false });
    const done = applyAction(s, "confirm");
    expect(done.state.confirmed).toBe(true);
    expect(describeNote("fr", done.note)).toBe("Option B : confirmé.");
    expect(applyAction(done.state, "clear").state).toMatchObject({ chosen: null, confirmed: false });
  });

  it("choosing again withdraws an earlier confirmation", () => {
    const confirmed = { focus: 1, chosen: 1, confirmed: true };
    expect(applyAction({ ...confirmed, focus: 2 }, "choose").state).toMatchObject({ chosen: 2, confirmed: false });
  });

  it("picks by index and rejects a bad index", () => {
    expect(pickIndex(initialChooserState, 2).state).toMatchObject({ focus: 2, chosen: 2 });
    expect(() => pickIndex(initialChooserState, 3)).toThrow(RangeError);
  });
});
