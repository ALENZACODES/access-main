/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { KeyValueStore } from "./submissionQueue";
import { useVisitMarks } from "./useVisitMarks";
import { VISIT_MARKS_KEY } from "./visitMarks";

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}
afterEach(cleanup);

describe("useVisitMarks", () => {
  it("starts empty and kept for an empty store", () => {
    const { result } = renderHook(() => useVisitMarks("2026-11-21", memory()));
    expect(result.current.marks).toEqual([]);
    expect(result.current.kept).toBe(true);
  });
  it("is not kept without a store but still holds marks", () => {
    const { result } = renderHook(() => useVisitMarks("2026-11-21", null));
    expect(result.current.kept).toBe(false);
    act(() => { result.current.set("a", "been"); });
    expect(result.current.marks).toHaveLength(1);
    expect(result.current.kept).toBe(false);
  });
  it("returns the result of setting and only stores a real change", () => {
    const store = memory();
    const { result } = renderHook(() => useVisitMarks("2026-11-21", store));
    let r = "";
    act(() => { r = result.current.set("a", "been"); });
    expect(r).toBe("set");
    const before = store.data[VISIT_MARKS_KEY];
    act(() => { r = result.current.set("a", "been"); });
    expect(r).toBe("same");
    expect(store.data[VISIT_MARKS_KEY]).toBe(before);
    act(() => { r = result.current.set("bad id", "been"); });
    expect(r).toBe("invalid");
  });
  it("keeps two sets made in one turn", () => {
    const { result } = renderHook(() => useVisitMarks("2026-11-21", memory()));
    act(() => { result.current.set("a", "been"); result.current.set("b", "to-visit"); });
    expect(result.current.marks.map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("clears one mark and ignores clearing one that is not there", () => {
    const store = memory();
    const { result } = renderHook(() => useVisitMarks("2026-11-21", store));
    act(() => { result.current.set("a", "been"); });
    const before = store.data[VISIT_MARKS_KEY];
    act(() => { result.current.clear("nope"); });
    expect(store.data[VISIT_MARKS_KEY]).toBe(before);
    act(() => { result.current.clear("a"); });
    expect(result.current.marks).toEqual([]);
    expect(VISIT_MARKS_KEY in store.data).toBe(false);
  });
  it("keeps only the ids given", () => {
    const { result } = renderHook(() => useVisitMarks("2026-11-21", memory()));
    act(() => { result.current.set("a", "been"); result.current.set("b", "been"); });
    act(() => { result.current.keepOnly(new Set(["b"])); });
    expect(result.current.marks.map((m) => m.id)).toEqual(["b"]);
  });
  it("reports not kept when the store refuses to write, and recovers when it can again", () => {
    let fail = true;
    const data: Record<string, string> = {};
    const store: KeyValueStore = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { if (fail) throw new Error("full"); data[k] = v; }, removeItem: (k) => { delete data[k]; } };
    const { result } = renderHook(() => useVisitMarks("2026-11-21", store));
    act(() => { result.current.set("a", "been"); });
    expect(result.current.kept).toBe(false);
    fail = false;
    act(() => { result.current.set("b", "been"); });
    expect(result.current.kept).toBe(true);
  });
  it("stops listening to storage when it is removed", () => {
    const store = memory();
    const { result, unmount } = renderHook(() => useVisitMarks("2026-11-21", store));
    unmount();
    store.data[VISIT_MARKS_KEY] = JSON.stringify([{ id: "a", status: "been" }]);
    window.dispatchEvent(new StorageEvent("storage", { key: VISIT_MARKS_KEY }));
    expect(result.current.marks).toEqual([]);
  });
});
