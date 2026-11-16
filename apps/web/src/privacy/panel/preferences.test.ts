import { describe, expect, it } from "vitest";
import { detectLocale, loadPrefs, prefsKey, savePrefs } from "./preferences";
import { createMemoryStorage, safeLocalStorage, type StorageLike } from "./storage";

describe("detectLocale", () => {
  it.each([
    [["fr-CA", "en-CA"], "fr"],
    [["en-CA", "fr"], "en"],
    [["FR"], "fr"],
    [["de", "fr-FR"], "fr"],
    [["de"], "en"],
    [[], "en"],
  ] as const)("%j -> %s", (langs, expected) => {
    expect(detectLocale(langs)).toBe(expected);
  });
  it("does not treat tags that merely start with f as French", () => {
    expect(detectLocale(["fi", "fil"])).toBe("en");
  });
});

describe("loadPrefs and savePrefs", () => {
  it("round-trips", () => {
    const s = createMemoryStorage();
    expect(loadPrefs(s, "app.")).toBeNull();
    expect(savePrefs(s, "app.", { locale: "fr" })).toBe(true);
    expect(s.getItem(prefsKey("app."))).toBe('{"locale":"fr"}');
    expect(loadPrefs(s, "app.")).toEqual({ locale: "fr" });
  });
  it.each(["not json", "null", "[]", '{"locale":"de"}', '{"locale":3}', "{}"])(
    "ignores unreadable stored value %s",
    (raw) => {
      const s = createMemoryStorage({ [prefsKey("app.")]: raw });
      expect(loadPrefs(s, "app.")).toBeNull();
    },
  );
  it("ignores extra fields", () => {
    const s = createMemoryStorage({ [prefsKey("app.")]: '{"locale":"en","x":1}' });
    expect(loadPrefs(s, "app.")).toEqual({ locale: "en" });
  });
  it("handles a missing store", () => {
    expect(loadPrefs(null, "app.")).toBeNull();
    expect(savePrefs(null, "app.", { locale: "en" })).toBe(false);
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
    expect(savePrefs(s, "app.", { locale: "en" })).toBe(false);
  });
  it("reports a throwing read as no preference", () => {
    const s: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadPrefs(s, "app.")).toBeNull();
  });
});

describe("memory storage and safeLocalStorage", () => {
  it("behaves like Storage", () => {
    const s = createMemoryStorage({ a: "1" });
    s.setItem("b", "2");
    expect(s.length).toBe(2);
    expect(s.key(0)).toBe("a");
    expect(s.key(5)).toBeNull();
    s.removeItem("a");
    expect(s.getItem("a")).toBeNull();
  });
  it("returns null when there is no localStorage", () => {
    expect(safeLocalStorage()).toBeNull();
  });
});
