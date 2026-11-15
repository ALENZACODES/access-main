import { describe, expect, it } from "vitest";
import { activeTargets, advance, normalise, select } from "./state.ts";

const targets = [
  { id: "one", enabled: true },
  { id: "blocked", enabled: false },
  { id: "two", enabled: true },
];

describe("step/select scanner", () => {
  it("advances, skips disabled targets and wraps", () => {
    expect(activeTargets(targets).map((item) => item.id)).toEqual(["one", "two"]);
    expect(select({ index: 0 }, targets)).toBe("one");
    const second = advance({ index: 0 }, targets);
    expect(select(second, targets)).toBe("two");
    expect(select(advance(second, targets), targets)).toBe("one");
  });

  it("disables every target without a stale selection", () => {
    const unavailable = targets.map((target) => ({ ...target, enabled: false }));
    expect(normalise({ index: 5 }, unavailable)).toEqual({ index: -1 });
    expect(advance({ index: 0 }, unavailable)).toEqual({ index: -1 });
    expect(select({ index: 0 }, unavailable)).toBeNull();
  });

  it("renormalises when available targets change", () => {
    expect(select({ index: 12 }, targets)).toBe("one");
    expect(select({ index: -1 }, targets)).toBe("two");
  });
});
