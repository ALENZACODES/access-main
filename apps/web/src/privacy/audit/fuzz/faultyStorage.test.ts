import { describe, expect, it } from "vitest";
import { FakeBlockedError, FakeQuotaError, createFaultyStorage, outsideTouches } from "./faultyStorage";

describe("a storage with no faults", () => {
  it("stores, reads, lists and removes like the memory storage", () => {
    const s = createFaultyStorage({ a: "1" });
    s.setItem("b", "2");
    expect(s.getItem("a")).toBe("1");
    expect(s.length).toBe(2);
    expect([s.key(0), s.key(1), s.key(2)]).toEqual(["a", "b", null]);
    s.removeItem("a");
    expect(s.snapshot()).toEqual({ b: "2" });
  });
  it("writes down each call, in order", () => {
    const s = createFaultyStorage();
    s.setItem("x", "1");
    s.getItem("x");
    s.removeItem("x");
    expect(s.ops).toEqual([
      { kind: "set", key: "x", ok: true },
      { kind: "get", key: "x", ok: true },
      { kind: "remove", key: "x", ok: true },
    ]);
  });
  it("clears the log without clearing the data", () => {
    const s = createFaultyStorage({ a: "1" });
    s.getItem("a");
    s.clearOps();
    expect(s.ops).toEqual([]);
    expect(s.snapshot()).toEqual({ a: "1" });
  });
});

describe("failing a write", () => {
  it("throws on the nth write and works again after it", () => {
    const s = createFaultyStorage({}, { failWriteNumber: 2 });
    s.setItem("a", "1");
    expect(() => s.setItem("b", "2")).toThrow(FakeQuotaError);
    s.setItem("c", "3");
    expect(s.snapshot()).toEqual({ a: "1", c: "3" });
    expect(s.ops.filter((o) => !o.ok)).toEqual([{ kind: "set", key: "b", ok: false }]);
  });
  it("throws for every write the rule picks, and leaves the old value in place", () => {
    const s = createFaultyStorage({ k: "old" }, { failWriteWhen: (key) => key === "k" });
    expect(() => s.setItem("k", "new")).toThrow("quota");
    expect(s.getItem("k")).toBe("old");
  });
  it("names the error like the browser does, so code that checks the name still matches", () => {
    const s = createFaultyStorage({}, { failWriteWhen: () => true });
    try {
      s.setItem("a", "1");
    } catch (e) {
      expect((e as Error).name).toBe("QuotaExceededError");
    }
  });
  it("can ignore a write without an error, as some private modes do", () => {
    const s = createFaultyStorage({}, { dropWriteWhen: () => true });
    expect(() => s.setItem("a", "1")).not.toThrow();
    expect(s.getItem("a")).toBeNull();
    expect(s.ops[0]).toEqual({ kind: "set", key: "a", ok: true });
  });
});

describe("the quota", () => {
  it("counts keys and values together, and refuses a write that would pass it", () => {
    const s = createFaultyStorage({}, { quotaChars: 10 });
    s.setItem("ab", "cdef");
    expect(() => s.setItem("gh", "ijklmn")).toThrow(FakeQuotaError);
    expect(s.snapshot()).toEqual({ ab: "cdef" });
  });
  it("counts a replaced value once, not twice", () => {
    const s = createFaultyStorage({}, { quotaChars: 10 });
    s.setItem("ab", "cdefgh");
    expect(() => s.setItem("ab", "ijklmn")).not.toThrow();
    expect(s.getItem("ab")).toBe("ijklmn");
  });
  it("allows a write that fits exactly", () => {
    const s = createFaultyStorage({}, { quotaChars: 6 });
    expect(() => s.setItem("ab", "cdef")).not.toThrow();
  });
});

describe("failing a remove", () => {
  it("throws, and the value stays", () => {
    const s = createFaultyStorage({ a: "1" }, { failRemoveWhen: () => true });
    expect(() => s.removeItem("a")).toThrow(FakeBlockedError);
    expect(s.getItem("a")).toBe("1");
  });
  it("can do nothing without an error, so a check that the value is gone is needed", () => {
    const s = createFaultyStorage({ a: "1" }, { dropRemoveWhen: () => true });
    s.removeItem("a");
    expect(s.getItem("a")).toBe("1");
  });
});

describe("failing a read", () => {
  it("throws for the names picked and not for others", () => {
    const s = createFaultyStorage({ a: "1", b: "2" }, { failReadWhen: (k) => k === "a" });
    expect(() => s.getItem("a")).toThrow(FakeBlockedError);
    expect(s.getItem("b")).toBe("2");
    expect(s.ops.filter((o) => !o.ok)).toEqual([{ kind: "get", key: "a", ok: false }]);
  });
});

describe("setFaults", () => {
  it("changes what fails from then on, and clears every fault when given nothing", () => {
    const s = createFaultyStorage();
    s.setFaults({ failWriteWhen: () => true });
    expect(() => s.setItem("a", "1")).toThrow();
    s.setFaults();
    expect(() => s.setItem("a", "1")).not.toThrow();
  });
  it("restarts the count for the nth write", () => {
    const s = createFaultyStorage();
    s.setItem("a", "1");
    s.setFaults({ failWriteNumber: 1 });
    expect(() => s.setItem("b", "2")).toThrow();
  });
});

describe("what was touched", () => {
  it("lists written and removed names, sorted and without repeats, including calls that failed", () => {
    const s = createFaultyStorage({ z: "1" }, { failWriteWhen: (k) => k === "m" });
    s.setItem("b", "1");
    s.setItem("b", "2");
    try {
      s.setItem("m", "1");
    } catch {
      // expected
    }
    s.removeItem("z");
    s.getItem("read-only");
    expect(s.touched()).toEqual(["b", "m", "z"]);
    expect(s.writesAttempted()).toEqual(["b", "m"]);
  });
  it("finds names outside the allowed ones", () => {
    const s = createFaultyStorage();
    s.setItem("app.a", "1");
    s.setItem("other", "1");
    s.removeItem("site.theme");
    expect(outsideTouches(s, (k) => k.startsWith("app."))).toEqual(["other", "site.theme"]);
    expect(outsideTouches(s, () => true)).toEqual([]);
  });
});
