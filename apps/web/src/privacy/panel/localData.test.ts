import { describe, expect, it } from "vitest";
import { eraseLocalData, exportLocalData, listKeys } from "./localData";
import { createMemoryStorage, type StorageLike } from "./storage";

const NOW = new Date(2026, 10, 15, 20, 5, 0); // local time, month is 0-based

function seeded(): StorageLike {
  return createMemoryStorage({
    "app.b": "2",
    "app.a": "1",
    "other.x": "keep me",
    "application": "not ours",
  });
}

describe("listKeys", () => {
  it("returns only prefixed keys, sorted", () => {
    expect(listKeys(seeded(), "app.")).toEqual(["app.a", "app.b"]);
  });
  it("returns nothing for an empty store", () => {
    expect(listKeys(createMemoryStorage(), "app.")).toEqual([]);
  });
});

describe("exportLocalData", () => {
  it("exports prefixed items as JSON with raw string values", () => {
    const f = exportLocalData(seeded(), "app.", NOW, "en");
    const parsed = JSON.parse(f.text) as Record<string, unknown>;
    expect(parsed.format).toBe("app-local-data");
    expect(parsed.version).toBe(1);
    expect(parsed.prefix).toBe("app.");
    expect(parsed.items).toEqual({ "app.a": "1", "app.b": "2" });
    expect(f.count).toBe(2);
    expect(f.mime).toBe("application/json");
    expect(f.text.endsWith("\n")).toBe(true);
  });
  it("never includes keys outside the prefix", () => {
    expect(exportLocalData(seeded(), "app.", NOW, "en").text).not.toContain("keep me");
  });
  it("names the file in the chosen language with the local date", () => {
    expect(exportLocalData(seeded(), "app.", NOW, "en").filename).toBe("the-app-data-2026-11-15.json");
    expect(exportLocalData(seeded(), "app.", NOW, "fr").filename).toBe("l-app-donnees-2026-11-15.json");
  });
  it("records when it was made", () => {
    const parsed = JSON.parse(exportLocalData(seeded(), "app.", NOW, "en").text) as { exportedAt: string };
    expect(parsed.exportedAt).toBe(NOW.toISOString());
  });
  it("reports a count of zero when nothing is stored", () => {
    expect(exportLocalData(createMemoryStorage(), "app.", NOW, "en").count).toBe(0);
  });
});

describe("eraseLocalData", () => {
  it("removes prefixed keys and leaves the rest", () => {
    const s = seeded();
    expect(eraseLocalData(s, "app.")).toEqual({ removed: 2, failed: [] });
    expect(listKeys(s, "app.")).toEqual([]);
    expect(s.getItem("other.x")).toBe("keep me");
    expect(s.getItem("application")).toBe("not ours");
  });
  it("is safe to run twice", () => {
    const s = seeded();
    eraseLocalData(s, "app.");
    expect(eraseLocalData(s, "app.")).toEqual({ removed: 0, failed: [] });
  });
  it("reports a key that throws on removal", () => {
    const inner = seeded();
    const s: StorageLike = {
      get length() {
        return inner.length;
      },
      key: (i) => inner.key(i),
      getItem: (k) => inner.getItem(k),
      setItem: (k, v) => inner.setItem(k, v),
      removeItem: (k) => {
        if (k === "app.a") throw new Error("blocked");
        inner.removeItem(k);
      },
    };
    expect(eraseLocalData(s, "app.")).toEqual({ removed: 1, failed: ["app.a"] });
  });
  it("reports a key that is still present after removal", () => {
    const inner = seeded();
    const s: StorageLike = {
      get length() {
        return inner.length;
      },
      key: (i) => inner.key(i),
      getItem: (k) => inner.getItem(k),
      setItem: (k, v) => inner.setItem(k, v),
      removeItem: (k) => {
        if (k !== "app.b") inner.removeItem(k);
      },
    };
    expect(eraseLocalData(s, "app.")).toEqual({ removed: 1, failed: ["app.b"] });
  });
});
