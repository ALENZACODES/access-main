import { describe, expect, it } from "vitest";
import { putExpiring } from "./expiry";
import type { InventoryEntry } from "./inventory";
import { matchKey, reconcile } from "./reconcile";
import { createMemoryStorage, type StorageLike } from "./storage";

const E = (id: string, patch: Partial<InventoryEntry> = {}): InventoryEntry => ({
  id,
  label: { en: id, fr: id },
  where: "on-device",
  source: { en: "Test fixture", fr: "Données d’essai" },
  recordedOn: "2026-11-15",
  ...patch,
});

const NOW = new Date(2026, 10, 15, 9, 0, 0);

describe("matchKey", () => {
  it("matches an exact name only", () => {
    expect(matchKey("prefs.v1", "prefs.v1")).toBe(true);
    expect(matchKey("prefs.v10", "prefs.v1")).toBe(false);
    expect(matchKey("xprefs.v1", "prefs.v1")).toBe(false);
  });
  it("matches a trailing * as a prefix", () => {
    expect(matchKey("cache.a", "cache.*")).toBe(true);
    expect(matchKey("cache.", "cache.*")).toBe(true);
    expect(matchKey("cach", "cache.*")).toBe(false);
  });
});

describe("reconcile", () => {
  const entries = [E("a", { storageKeys: ["a.v1"] }), E("b", { storageKeys: ["cache.*"] }), E("c")];

  it("lists names and sizes without the prefix, never the contents", () => {
    const s = createMemoryStorage({ "app.a.v1": "hello", "other.x": "no" });
    const r = reconcile(s, "app.", entries);
    expect(r.items).toEqual([{ key: "a.v1", bytes: 5, entryId: "a" }]);
    expect(JSON.stringify(r)).not.toContain("hello");
  });
  it("counts UTF-8 bytes, not characters", () => {
    const s = createMemoryStorage({ "app.a.v1": "é€" });
    expect(reconcile(s, "app.", entries).items[0]?.bytes).toBe(5);
  });
  it("splits documented and undocumented items", () => {
    const s = createMemoryStorage({ "app.a.v1": "1", "app.cache.x": "2", "app.mystery": "3" });
    const r = reconcile(s, "app.", entries);
    expect(r.documented.map((i) => i.key)).toEqual(["a.v1", "cache.x"]);
    expect(r.undocumented.map((i) => i.key)).toEqual(["mystery"]);
    expect(r.totalBytes).toBe(3);
  });
  it("assigns an item to the first entry that claims it", () => {
    const both = [E("x", { storageKeys: ["k*"] }), E("y", { storageKeys: ["k1"] })];
    expect(reconcile(createMemoryStorage({ "app.k1": "1" }), "app.", both).items[0]?.entryId).toBe("x");
  });
  it("reads the expiry date from an expiring envelope only", () => {
    const s = createMemoryStorage({ "app.plain": "1" });
    putExpiring(s, "app.a.v1", "v", NOW, 7);
    const r = reconcile(s, "app.", entries);
    const a = r.items.find((i) => i.key === "a.v1");
    expect(a?.expiresAt).toBe(new Date(NOW.getTime() + 7 * 86_400_000).toISOString());
    expect(r.items.find((i) => i.key === "plain")?.expiresAt).toBeUndefined();
  });
  it("names on-device entries that give no storage key as unmatchable, not as absent or fine", () => {
    const r = reconcile(createMemoryStorage(), "app.", [
      E("c"),
      E("d", { where: "sent-to-server" }),
      E("e", { where: undefined as never }),
      E("f", { storageKeys: [] }),
    ]);
    expect(r.unmatchable).toEqual(["c", "f"]);
  });
  it("handles missing storage and an empty store", () => {
    expect(reconcile(null, "app.", entries)).toMatchObject({ items: [], totalBytes: 0 });
    expect(reconcile(createMemoryStorage(), "app.", entries).items).toEqual([]);
  });
  it("skips a key whose read throws", () => {
    const inner = createMemoryStorage({ "app.a.v1": "1", "app.b": "2" });
    const s: StorageLike = {
      get length() {
        return inner.length;
      },
      key: (i) => inner.key(i),
      getItem: (k) => {
        if (k === "app.a.v1") throw new Error("denied");
        return inner.getItem(k);
      },
      setItem: (k, v) => inner.setItem(k, v),
      removeItem: (k) => inner.removeItem(k),
    };
    expect(reconcile(s, "app.", entries).items.map((i) => i.key)).toEqual(["b"]);
  });
});
