import { describe, expect, it, vi } from "vitest";
import { TimeoutError, safeLoad, sanitizePlaces, withTimeout, type Timers } from "./index";
import { mkRecord } from "./testHelpers";

function fakeTimers() {
  const pending: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const timers: Timers = {
    set: (fn, ms) => { const t = { fn, ms, cleared: false }; pending.push(t); return t; },
    clear: (h) => { (h as { cleared: boolean }).cleared = true; },
  };
  return { timers, pending };
}

describe("withTimeout", () => {
  it("resolves and clears the timer when the promise wins", async () => {
    const { timers, pending } = fakeTimers();
    await expect(withTimeout(Promise.resolve(5), 100, timers)).resolves.toBe(5);
    expect(pending[0]!.cleared).toBe(true);
  });
  it("passes rejections through and clears the timer", async () => {
    const { timers, pending } = fakeTimers();
    await expect(withTimeout(Promise.reject(new Error("boom")), 100, timers)).rejects.toThrow("boom");
    expect(pending[0]!.cleared).toBe(true);
  });
  it("rejects with TimeoutError when the timer fires first", async () => {
    const { timers, pending } = fakeTimers();
    const p = withTimeout(new Promise(() => undefined), 250, timers);
    pending[0]!.fn();
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    await expect(p).rejects.toMatchObject({ ms: 250 });
  });
  it("works with the real timers", async () => {
    vi.useFakeTimers();
    try {
      const p = withTimeout(new Promise(() => undefined), 50);
      const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sanitizePlaces", () => {
  const good = mkRecord("a-1", "A", {});
  it("keeps valid records and counts the rest as dropped", () => {
    const bad = [null, 5, "x", {}, { id: "A", name: "x", features: [] }, { id: "ok-1", name: " ", features: [] }, { id: "ok-2", name: "N" }, { id: "ok-3", name: "N", features: "x" }];
    const r = sanitizePlaces([good, ...bad]);
    expect(r.places).toEqual([good]);
    expect(r.dropped).toBe(bad.length);
  });
  it("keeps the first record for a duplicated id", () => {
    const r = sanitizePlaces([good, { ...good, name: "Other" }]);
    expect(r.places.map((p) => p.name)).toEqual(["A"]);
    expect(r.dropped).toBe(1);
  });
  it("rejects ids that could break out of a URL or attribute", () => {
    const r = sanitizePlaces([{ id: '"><script>', name: "x", features: [] }, { id: "../x", name: "x", features: [] }]);
    expect(r.places).toEqual([]);
  });
});

describe("safeLoad", () => {
  it("normalises a good result and reports dropped records", async () => {
    const r = await safeLoad(async () => ({ status: "ok", places: [mkRecord("a-1", "A", {}), { junk: true }], fromSavedCopy: true }), 100);
    expect(r).toMatchObject({ status: "ok", fromSavedCopy: true, dropped: 1 });
    expect(r.status === "ok" && r.places).toHaveLength(1);
  });
  it("defaults fromSavedCopy to false and omits dropped when zero", async () => {
    const r = await safeLoad(async () => ({ status: "ok", places: [] }), 100);
    expect(r).toEqual({ status: "ok", places: [], fromSavedCopy: false });
  });
  it("keeps a valid error status and ignores a bogus one", async () => {
    expect(await safeLoad(async () => ({ status: "error", httpStatus: 503 }), 100)).toEqual({ status: "error", httpStatus: 503 });
    expect(await safeLoad(async () => ({ status: "error", httpStatus: 9999 }), 100)).toEqual({ status: "error" });
    expect(await safeLoad(async () => ({ status: "error", httpStatus: "500" }), 100)).toEqual({ status: "error" });
  });
  it("maps a malformed result to a 502", async () => {
    for (const bad of [null, undefined, 5, "ok", {}, { status: "ok" }, { status: "ok", places: "x" }]) {
      expect(await safeLoad(async () => bad, 100)).toEqual({ status: "error", httpStatus: 502 });
    }
  });
  it("maps a throw to 500 and a timeout to 504, never throwing itself", async () => {
    expect(await safeLoad(async () => { throw new Error("db down"); }, 100)).toEqual({ status: "error", httpStatus: 500 });
    const { timers, pending } = fakeTimers();
    const p = safeLoad(() => new Promise(() => undefined), 100, timers);
    pending[0]!.fn();
    expect(await p).toEqual({ status: "error", httpStatus: 504 });
  });
  it("handles a loader that throws synchronously", async () => {
    expect(await safeLoad(() => { throw new Error("sync"); }, 100)).toEqual({ status: "error", httpStatus: 500 });
  });
});
