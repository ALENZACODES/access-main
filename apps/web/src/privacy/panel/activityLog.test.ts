import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TTL_DAYS,
  MAX_ACTIVITY_ENTRIES,
  activityKey,
  formatActivityTime,
  loadActivity,
  recordActivity,
} from "./activityLog";
import { putExpiring } from "./expiry";
import { createMemoryStorage, type StorageLike } from "./storage";

const T0 = new Date(2026, 10, 15, 20, 5, 0);
const after = (days: number): Date => new Date(T0.getTime() + days * 86_400_000);

describe("recordActivity and loadActivity", () => {
  it("lists entries newest first", () => {
    const s = createMemoryStorage();
    recordActivity(s, "app.", { kind: "language", lang: "fr" }, T0);
    recordActivity(s, "app.", { kind: "export", count: 3 }, after(1));
    const list = loadActivity(s, "app.", after(1));
    expect(list.map((e) => e.kind)).toEqual(["export", "language"]);
    expect(list[0]).toEqual({ at: after(1).toISOString(), kind: "export", count: 3 });
  });
  it("starts empty", () => {
    expect(loadActivity(createMemoryStorage(), "app.", T0)).toEqual([]);
  });
  it("keeps only the newest 50", () => {
    const s = createMemoryStorage();
    for (let i = 0; i < MAX_ACTIVITY_ENTRIES + 5; i += 1) recordActivity(s, "app.", { kind: "export", count: i }, T0);
    const list = loadActivity(s, "app.", T0);
    expect(list).toHaveLength(MAX_ACTIVITY_ENTRIES);
    expect(list[0]?.count).toBe(MAX_ACTIVITY_ENTRIES + 4);
    expect(list.at(-1)?.count).toBe(5);
  });
  it("expires 90 days after the latest action, and each action restarts the clock", () => {
    const s = createMemoryStorage();
    recordActivity(s, "app.", { kind: "export", count: 1 }, T0);
    expect(loadActivity(s, "app.", after(ACTIVITY_TTL_DAYS - 1))).toHaveLength(1);
    expect(loadActivity(s, "app.", after(ACTIVITY_TTL_DAYS))).toEqual([]);
    recordActivity(s, "app.", { kind: "export", count: 2 }, after(80));
    expect(loadActivity(s, "app.", after(150))).toHaveLength(2);
  });
  it("stores nothing but the entry fields", () => {
    const s = createMemoryStorage();
    recordActivity(s, "app.", { kind: "consent-granted", purposeId: "saved-places" }, T0);
    const raw = s.getItem(activityKey("app.")) ?? "";
    expect(raw).toContain("saved-places");
    expect(raw).not.toContain("Saved places");
  });
  it("reports false when storage is missing or refuses", () => {
    expect(recordActivity(null, "app.", { kind: "export" }, T0)).toBe(false);
    const s: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(recordActivity(s, "app.", { kind: "export" }, T0)).toBe(false);
  });
  it("loads nothing from storage that is missing", () => {
    expect(loadActivity(null, "app.", T0)).toEqual([]);
  });
});

describe("loadActivity with damaged data", () => {
  const put = (value: string) => {
    const s = createMemoryStorage();
    putExpiring(s, activityKey("app."), value, T0, 30);
    return s;
  };
  it.each(["not json", "{}", "null", "3"])("returns nothing for %s", (v) => {
    expect(loadActivity(put(v), "app.", T0)).toEqual([]);
  });
  it("drops malformed entries and keeps good ones", () => {
    const good = { at: T0.toISOString(), kind: "export", count: 2 };
    const list = [
      good,
      { at: "nope", kind: "export" },
      { at: T0.toISOString(), kind: "unknown-kind" },
      { at: T0.toISOString(), kind: "export", count: -1 },
      { at: T0.toISOString(), kind: "export", count: 1.5 },
      { at: T0.toISOString(), kind: "language", lang: "de" },
      { at: T0.toISOString(), kind: "list-export", format: "pdf" },
      { at: T0.toISOString(), kind: "consent-granted", purposeId: 5 },
      "text",
      null,
    ];
    expect(loadActivity(put(JSON.stringify(list)), "app.", T0)).toEqual([good]);
  });
  it("ignores a value that is not an expiring envelope", () => {
    const s = createMemoryStorage({ [activityKey("app.")]: "[]" });
    expect(loadActivity(s, "app.", T0)).toEqual([]);
  });
});

describe("formatActivityTime", () => {
  it("shows local date and time with two digits", () => {
    expect(formatActivityTime(new Date(2026, 0, 5, 7, 3).toISOString())).toBe("2026-01-05 07:03");
    expect(formatActivityTime(T0.toISOString())).toBe("2026-11-15 20:05");
  });
});
