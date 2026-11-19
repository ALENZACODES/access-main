import { describe, expect, it } from "vitest";
import {
  SEEN_TTL_DAYS,
  diffInventory,
  fingerprintEntry,
  fingerprintText,
  loadSeen,
  saveSeen,
  seenKey,
  snapshot,
} from "./changes";
import { putExpiring } from "./expiry";
import type { InventoryEntry } from "./inventory";
import { createMemoryStorage, type StorageLike } from "./storage";

const E = (id: string, patch: Partial<InventoryEntry> = {}): InventoryEntry => ({
  id,
  label: { en: `Item ${id}`, fr: `Élément ${id}` },
  where: "on-device",
  purpose: { en: "Why", fr: "Pourquoi" },
  source: { en: "Test fixture", fr: "Données d’essai" },
  recordedOn: "2026-11-15",
  ...patch,
});

const NOW = new Date(2026, 10, 15, 9, 0, 0);

describe("fingerprints", () => {
  it("is stable and 8 hex digits", () => {
    expect(fingerprintText("hello")).toBe("4f9f2cab");
    expect(fingerprintText("")).toBe("811c9dc5");
    expect(fingerprintText("a")).toMatch(/^[0-9a-f]{8}$/);
  });
  it("changes when anything a person reads changes", () => {
    const base = fingerprintEntry(E("a"));
    expect(fingerprintEntry(E("a", { where: "sent-to-server" }))).not.toBe(base);
    expect(fingerprintEntry(E("a", { purpose: { en: "Other", fr: "Autre" } }))).not.toBe(base);
    expect(fingerprintEntry(E("a", { keptFor: { en: "A week", fr: "Une semaine" } }))).not.toBe(base);
    expect(fingerprintEntry(E("a", { label: { en: "New", fr: "Nouveau" } }))).not.toBe(base);
    expect(fingerprintEntry(E("a", { storageKeys: ["k"] }))).not.toBe(base);
  });
  it("does not change for source, date, licence or key order", () => {
    const base = fingerprintEntry(E("a", { storageKeys: ["x", "y"] }));
    expect(fingerprintEntry(E("a", { storageKeys: ["y", "x"] }))).toBe(base);
    expect(fingerprintEntry(E("a", { storageKeys: ["x", "y"], recordedOn: "2027-01-01", licence: "CC0-1.0" }))).toBe(base);
  });
  it("tells a missing location from a stated one", () => {
    expect(fingerprintEntry(E("a", { where: undefined as never }))).not.toBe(fingerprintEntry(E("a")));
  });
});

describe("diffInventory", () => {
  const list = [E("a"), E("b")];
  const seen = snapshot(list, "2026-11-01");

  it("says nothing can be compared the first time", () => {
    expect(diffInventory(null, list)).toEqual({ kind: "first-view" });
  });
  it("reports no change", () => {
    expect(diffInventory(seen, list)).toEqual({ kind: "none", seenOn: "2026-11-01" });
  });
  it("reports added, changed and removed entries by label", () => {
    const now = [E("a", { where: "sent-to-server" }), E("c")];
    const d = diffInventory(seen, now);
    expect(d).toEqual({
      kind: "diff",
      seenOn: "2026-11-01",
      added: [{ en: "Item c", fr: "Élément c" }],
      changed: [{ en: "Item a", fr: "Élément a" }],
      removed: [{ en: "Item b", fr: "Élément b" }],
    });
  });
  it("does not report a change when only the order differs", () => {
    expect(diffInventory(seen, [E("b"), E("a")]).kind).toBe("none");
  });
  it("names a removed entry from the stored label, not from the current list", () => {
    const d = diffInventory(seen, [E("a")]);
    expect(d.kind === "diff" && d.removed[0]?.fr).toBe("Élément b");
  });
});

describe("loadSeen and saveSeen", () => {
  it("round-trips", () => {
    const s = createMemoryStorage();
    const list = snapshot([E("a")], "2026-11-15");
    expect(saveSeen(s, "app.", list, NOW)).toBe(true);
    expect(loadSeen(s, "app.", NOW)).toEqual(list);
  });
  it("expires a year after it was last saved", () => {
    const s = createMemoryStorage();
    saveSeen(s, "app.", snapshot([E("a")], "2026-11-15"), NOW);
    const day = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);
    expect(loadSeen(s, "app.", day(SEEN_TTL_DAYS - 1))).not.toBeNull();
    expect(loadSeen(s, "app.", day(SEEN_TTL_DAYS))).toBeNull();
  });
  it("returns null for missing storage, nothing stored, or a value that is not an envelope", () => {
    expect(loadSeen(null, "app.", NOW)).toBeNull();
    expect(loadSeen(createMemoryStorage(), "app.", NOW)).toBeNull();
    expect(loadSeen(createMemoryStorage({ [seenKey("app.")]: "{}" }), "app.", NOW)).toBeNull();
  });
  it.each([
    "not json",
    "null",
    "[]",
    '{"seenOn":"yesterday","entries":{}}',
    '{"seenOn":"2026-11-15"}',
    '{"seenOn":"2026-11-15","entries":{"a":"x"}}',
    '{"seenOn":"2026-11-15","entries":{"a":{"h":1,"label":{"en":"a","fr":"a"}}}}',
    '{"seenOn":"2026-11-15","entries":{"a":{"h":"x","label":{"en":"a"}}}}',
  ])("returns null for damaged content %s", (v) => {
    const s = createMemoryStorage();
    putExpiring(s, seenKey("app."), v, NOW, 5);
    expect(loadSeen(s, "app.", NOW)).toBeNull();
  });
  it("reports a failed save", () => {
    const s: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(saveSeen(s, "app.", snapshot([], "2026-11-15"), NOW)).toBe(false);
    expect(saveSeen(null, "app.", snapshot([], "2026-11-15"), NOW)).toBe(false);
  });
});
