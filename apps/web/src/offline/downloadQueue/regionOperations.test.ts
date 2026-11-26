import { describe, expect, it, vi } from "vitest";
import { RegionOperations } from "./regionOperations";

describe("Offline page region operations", () => {
  it("makes acquisition visible before a second action in the same render can start", () => {
    const operations = new RegionOperations();
    const seen: (string | null)[] = [];
    operations.subscribe(() => {
      seen.push(operations.getSnapshot());
      if (operations.getSnapshot() === "queue") {
        expect(operations.acquire("delete")).toBeNull();
      }
    });

    const finishQueue = operations.acquire("queue");
    expect(finishQueue).toBeTypeOf("function");
    expect(operations.acquire("inventory")).toBeNull();
    finishQueue!();
    expect(seen).toEqual(["queue", null]);
  });

  it("keeps a new owner's lock if a previous caller cleans up twice", () => {
    const operations = new RegionOperations();
    const finishFirst = operations.acquire("inventory")!;
    finishFirst();
    const finishSecond = operations.acquire("inventory")!;
    finishFirst();

    expect(operations.getSnapshot()).toBe("inventory");
    expect(operations.acquire("queue")).toBeNull();
    finishSecond();
    expect(operations.getSnapshot()).toBeNull();
  });

  it("unsubscribes an unmounted consumer without releasing another consumer's work", () => {
    const operations = new RegionOperations();
    const oldView = vi.fn();
    const unsubscribe = operations.subscribe(oldView);
    const release = operations.acquire("check")!;
    unsubscribe();

    const newView = vi.fn();
    operations.subscribe(newView);
    expect(operations.getSnapshot()).toBe("check");
    expect(operations.acquire("repair")).toBeNull();
    release();
    expect(oldView).toHaveBeenCalledTimes(1);
    expect(newView).toHaveBeenCalledTimes(1);
    expect(operations.getSnapshot()).toBeNull();
  });
});
