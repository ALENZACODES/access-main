import { describe, expect, it } from "vitest";
import { getExpiring, isExpired, MAX_TTL_DAYS, purgeExpired, putExpiring } from "./expiry";
import { createMemoryStorage, type StorageLike } from "./storage";

const T0 = new Date("2026-11-15T12:00:00.000Z");
const days = (n: number): Date => new Date(T0.getTime() + n * 86_400_000);

describe("putExpiring and getExpiring", () => {
  it("stores a value that is fresh until its expiry", () => {
    const s = createMemoryStorage();
    expect(putExpiring(s, "app.k", "hello", T0, 7)).toBe(true);
    expect(getExpiring(s, "app.k", days(6))).toEqual({
      state: "fresh",
      value: "hello",
      expiresAt: days(7).toISOString(),
    });
  });
  it("is expired at exactly the expiry instant and after", () => {
    const s = createMemoryStorage();
    putExpiring(s, "app.k", "hello", T0, 7);
    expect(getExpiring(s, "app.k", days(7)).state).toBe("expired");
    expect(getExpiring(s, "app.k", days(30)).state).toBe("expired");
  });
  it("reports a missing key", () => {
    expect(getExpiring(createMemoryStorage(), "app.k", T0)).toEqual({ state: "missing" });
  });
  it("reports a value with no expiry as having none, without guessing", () => {
    const s = createMemoryStorage({ "app.k": "plain text" });
    expect(getExpiring(s, "app.k", days(9999))).toEqual({ state: "no-expiry", raw: "plain text" });
  });
  it.each([0, -1, 1.5, MAX_TTL_DAYS + 1, Number.NaN])("rejects a lifetime of %s days", (ttl) => {
    expect(() => putExpiring(createMemoryStorage(), "app.k", "v", T0, ttl)).toThrow(RangeError);
  });
  it("accepts the longest allowed lifetime", () => {
    expect(putExpiring(createMemoryStorage(), "app.k", "v", T0, MAX_TTL_DAYS)).toBe(true);
  });
  it("returns false when storage refuses the write", () => {
    const s: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(putExpiring(s, "app.k", "v", T0, 1)).toBe(false);
  });
  it("keeps values that look like JSON but are not envelopes", () => {
    const s = createMemoryStorage({ "app.k": '{"v":1,"savedAt":"x"}' });
    expect(getExpiring(s, "app.k", T0).state).toBe("no-expiry");
  });
  it("isExpired compares against the expiry instant", () => {
    const env = { v: "x", savedAt: T0.toISOString(), expiresAt: days(1).toISOString() };
    expect(isExpired(env, days(0.5))).toBe(false);
    expect(isExpired(env, days(1))).toBe(true);
  });
});

describe("purgeExpired", () => {
  function store() {
    const s = createMemoryStorage({ "app.plain": "keep", "other.x": "keep" });
    putExpiring(s, "app.short", "a", T0, 1);
    putExpiring(s, "app.long", "b", T0, 30);
    putExpiring(s, "other.short", "c", T0, 1);
    s.setItem("app.broken", "{not json");
    return s;
  }
  it("removes only expired envelopes under the prefix", () => {
    const s = store();
    const r = purgeExpired(s, "app.", days(2));
    expect(r).toEqual({ purged: ["app.short"], failed: [] });
    expect(s.getItem("app.long")).not.toBeNull();
    expect(s.getItem("app.plain")).toBe("keep");
    expect(s.getItem("app.broken")).toBe("{not json");
    expect(s.getItem("other.short")).not.toBeNull();
  });
  it("removes nothing when nothing has expired", () => {
    expect(purgeExpired(store(), "app.", days(0))).toEqual({ purged: [], failed: [] });
  });
  it("can be run twice", () => {
    const s = store();
    purgeExpired(s, "app.", days(40));
    expect(purgeExpired(s, "app.", days(40))).toEqual({ purged: [], failed: [] });
  });
  it("reports a key it could not remove", () => {
    const inner = store();
    const s: StorageLike = {
      get length() {
        return inner.length;
      },
      key: (i) => inner.key(i),
      getItem: (k) => inner.getItem(k),
      setItem: (k, v) => inner.setItem(k, v),
      removeItem: (k) => {
        if (k === "app.short") throw new Error("blocked");
        inner.removeItem(k);
      },
    };
    expect(purgeExpired(s, "app.", days(2))).toEqual({ purged: [], failed: ["app.short"] });
  });
  it("skips a key whose read throws", () => {
    const inner = store();
    const s: StorageLike = {
      get length() {
        return inner.length;
      },
      key: (i) => inner.key(i),
      getItem: (k) => {
        if (k === "app.short") throw new Error("denied");
        return inner.getItem(k);
      },
      setItem: (k, v) => inner.setItem(k, v),
      removeItem: (k) => inner.removeItem(k),
    };
    expect(purgeExpired(s, "app.", days(2))).toEqual({ purged: [], failed: [] });
  });
});
