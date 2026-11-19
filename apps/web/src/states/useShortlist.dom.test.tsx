/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SHORTLIST, SHORTLIST_KEY } from "./shortlist";
import type { KeyValueStore } from "./submissionQueue";
import { browserStore, useShortlist, type ShortlistState } from "./useShortlist";

const TODAY = "2026-11-19";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
}

function probe(store: KeyValueStore | null, today = TODAY) {
  const ref: { current: ShortlistState | null } = { current: null };
  function Probe() {
    ref.current = useShortlist(today, store);
    return null;
  }
  const view = render(<Probe />);
  return { get: () => ref.current!, ...view };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useShortlist", () => {
  it("starts with the list that is stored", () => {
    const store = memoryStore({ [SHORTLIST_KEY]: '[{"id":"a","addedOn":"2026-11-01"}]' });
    const p = probe(store);
    expect(p.get().list).toEqual([{ id: "a", addedOn: "2026-11-01" }]);
    expect(p.get().kept).toBe(true);
  });
  it("starts empty and kept when nothing is stored", () => {
    const p = probe(memoryStore());
    expect(p.get().list).toEqual([]);
    expect(p.get().kept).toBe(true);
  });
  it("adds a place, stores it with today's date and says it was added", () => {
    const store = memoryStore();
    const p = probe(store);
    let result = "";
    act(() => void (result = p.get().add("a")));
    expect(result).toBe("added");
    expect(p.get().list).toEqual([{ id: "a", addedOn: TODAY }]);
    expect(JSON.parse(store.data[SHORTLIST_KEY]!)).toEqual([{ id: "a", addedOn: TODAY }]);
  });
  it("adds two places one after the other in the same act without losing the first", () => {
    const store = memoryStore();
    const p = probe(store);
    act(() => {
      p.get().add("a");
      p.get().add("b");
    });
    expect(p.get().list.map((e) => e.id)).toEqual(["a", "b"]);
    expect(JSON.parse(store.data[SHORTLIST_KEY]!)).toHaveLength(2);
  });
  it("says already, and writes nothing again, for a repeat", () => {
    const store = memoryStore();
    const p = probe(store);
    act(() => void p.get().add("a"));
    store.data[SHORTLIST_KEY] = "marker";
    let result = "";
    act(() => void (result = p.get().add("a")));
    expect(result).toBe("already");
    expect(store.data[SHORTLIST_KEY]).toBe("marker");
  });
  it("says full at the limit and does not add", () => {
    const p = probe(memoryStore());
    act(() => {
      for (let i = 0; i < MAX_SHORTLIST; i++) p.get().add(`p${i}`);
    });
    let result = "";
    act(() => void (result = p.get().add("extra")));
    expect(result).toBe("full");
    expect(p.get().list).toHaveLength(MAX_SHORTLIST);
  });
  it("says invalid for an id with a space", () => {
    const p = probe(memoryStore());
    let result = "";
    act(() => void (result = p.get().add("a b")));
    expect(result).toBe("invalid");
  });
  it("removes a place and clears the storage key when the list becomes empty", () => {
    const store = memoryStore();
    const p = probe(store);
    act(() => void p.get().add("a"));
    act(() => p.get().remove("a"));
    expect(p.get().list).toEqual([]);
    expect(store.data[SHORTLIST_KEY]).toBeUndefined();
  });
  it("empties the whole list", () => {
    const p = probe(memoryStore());
    act(() => {
      p.get().add("a");
      p.get().add("b");
    });
    act(() => p.get().clear());
    expect(p.get().list).toEqual([]);
  });
  it("keeps working in memory, with kept false, when there is no store", () => {
    const p = probe(null);
    expect(p.get().kept).toBe(false);
    act(() => void p.get().add("a"));
    expect(p.get().list.map((e) => e.id)).toEqual(["a"]);
    expect(p.get().kept).toBe(false);
  });
  it("turns kept false when a write is refused, and back to true when one works", () => {
    let refuse = false;
    const data: Record<string, string> = {};
    const store: KeyValueStore = {
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => {
        if (refuse) throw new Error("quota");
        data[k] = v;
      },
      removeItem: (k) => void delete data[k],
    };
    const p = probe(store);
    refuse = true;
    act(() => void p.get().add("a"));
    expect(p.get().kept).toBe(false);
    expect(p.get().list).toHaveLength(1);
    refuse = false;
    act(() => void p.get().add("b"));
    expect(p.get().kept).toBe(true);
  });
  it("picks up a change made in another tab", () => {
    const store = memoryStore();
    const p = probe(store);
    store.data[SHORTLIST_KEY] = '[{"id":"other","addedOn":"2026-11-02"}]';
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY })));
    expect(p.get().list.map((e) => e.id)).toEqual(["other"]);
  });
  it("picks up the whole storage being cleared elsewhere", () => {
    const store = memoryStore();
    const p = probe(store);
    act(() => void p.get().add("a"));
    delete store.data[SHORTLIST_KEY];
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(p.get().list).toEqual([]);
  });
  it("ignores a storage change to another key", () => {
    const store = memoryStore();
    const p = probe(store);
    act(() => void p.get().add("a"));
    store.data[SHORTLIST_KEY] = "[]";
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: "something-else" })));
    expect(p.get().list.map((e) => e.id)).toEqual(["a"]);
  });
  it("stops listening when the page goes away", () => {
    const added: EventListenerOrEventListenerObject[] = [];
    const removed: EventListenerOrEventListenerObject[] = [];
    const add = vi.spyOn(window, "addEventListener").mockImplementation((type, fn) => void (type === "storage" && added.push(fn as EventListener)));
    const remove = vi.spyOn(window, "removeEventListener").mockImplementation((type, fn) => void (type === "storage" && removed.push(fn as EventListener)));
    const p = probe(memoryStore());
    expect(added).toHaveLength(1);
    p.unmount();
    expect(removed).toEqual(added);
    add.mockRestore();
    remove.mockRestore();
  });
});

describe("browserStore", () => {
  it("is the browser's local storage when it works", () => {
    expect(browserStore()).toBe(localStorage);
  });
  it("is null when reading it throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("denied"); } });
    try {
      expect(browserStore()).toBeNull();
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
