import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, PREFS_KEY, TEXT_SCALES, loadPreferences, preferencesFromForm, rootStyle, sanitizePreferences, savePreferences, type Preferences } from "./preferences";

class MemoryStore {
  readonly data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
}
const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("denied"); } };

describe("sanitizePreferences", () => {
  it("gives the defaults, not repaired, for nothing at all", () => {
    expect(sanitizePreferences(undefined)).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: false });
    expect(sanitizePreferences(null)).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: false });
    expect(sanitizePreferences({})).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: false });
  });
  it("gives the defaults, repaired, for something that is not an object", () => {
    for (const v of ["x", 1, true, 0, ""]) expect(sanitizePreferences(v), String(v)).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
  });
  it("keeps every good value", () => {
    for (const locale of ["auto", "en", "fr"] as const) for (const theme of ["system", "light", "dark"] as const) for (const textScale of TEXT_SCALES) for (const reduceMotion of [true, false]) {
      expect(sanitizePreferences({ locale, theme, textScale, reduceMotion })).toEqual({ prefs: { locale, theme, textScale, reduceMotion }, repaired: false });
    }
  });
  it("resets each bad value on its own and says it was repaired", () => {
    expect(sanitizePreferences({ locale: "de", theme: "dark" })).toEqual({ prefs: { ...DEFAULT_PREFERENCES, theme: "dark" }, repaired: true });
    expect(sanitizePreferences({ textScale: 110 }).prefs.textScale).toBe(100);
    expect(sanitizePreferences({ textScale: "150" }).prefs.textScale).toBe(100);
    expect(sanitizePreferences({ reduceMotion: "yes" })).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
    expect(sanitizePreferences({ theme: null }).repaired).toBe(true);
  });
  it("ignores keys it does not know", () => expect(sanitizePreferences({ locale: "fr", extra: 1 })).toEqual({ prefs: { ...DEFAULT_PREFERENCES, locale: "fr" }, repaired: false }));
  it("does not read a value planted under __proto__ in stored JSON", () => {
    const parsed: unknown = JSON.parse('{"locale":"fr","__proto__":{"theme":"dark"}}');
    expect(sanitizePreferences(parsed)).toEqual({ prefs: { ...DEFAULT_PREFERENCES, locale: "fr" }, repaired: false });
    expect(({} as Record<string, unknown>).theme).toBeUndefined();
  });
  it("treats an array as an object with none of the keys", () => expect(sanitizePreferences([1, 2]).prefs).toEqual(DEFAULT_PREFERENCES));
  it("gives a new object, not the default object itself", () => expect(sanitizePreferences({}).prefs).not.toBe(DEFAULT_PREFERENCES));
});

describe("loadPreferences and savePreferences", () => {
  it("round-trip", () => {
    const store = new MemoryStore();
    const prefs: Preferences = { locale: "fr", theme: "dark", textScale: 150, reduceMotion: true };
    savePreferences(store, prefs);
    expect(loadPreferences(store)).toEqual({ prefs, repaired: false });
  });
  it("write under one key as JSON", () => {
    const store = new MemoryStore();
    savePreferences(store, DEFAULT_PREFERENCES);
    expect([...store.data.keys()]).toEqual([PREFS_KEY]);
    expect(JSON.parse(store.data.get(PREFS_KEY)!)).toEqual(DEFAULT_PREFERENCES);
  });
  it("save only good values, whatever was passed", () => {
    const store = new MemoryStore();
    savePreferences(store, { locale: "xx", theme: "dark", textScale: 999, reduceMotion: "maybe" } as never);
    expect(JSON.parse(store.data.get(PREFS_KEY)!)).toEqual({ ...DEFAULT_PREFERENCES, theme: "dark" });
  });
  it("load the defaults, not repaired, when nothing is stored", () => expect(loadPreferences(new MemoryStore())).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: false }));
  it("load the defaults, repaired, for text that is not JSON", () => {
    const store = new MemoryStore();
    store.setItem(PREFS_KEY, "{not json");
    expect(loadPreferences(store)).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
  });
  it("repair a stored value that is not an object", () => {
    const store = new MemoryStore();
    store.setItem(PREFS_KEY, "42");
    expect(loadPreferences(store)).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
    store.setItem(PREFS_KEY, "null");
    expect(loadPreferences(store)).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: false });
  });
  it("keep the good fields of a partly bad stored value", () => {
    const store = new MemoryStore();
    store.setItem(PREFS_KEY, JSON.stringify({ locale: "fr", theme: "purple", textScale: 200 }));
    expect(loadPreferences(store)).toEqual({ prefs: { ...DEFAULT_PREFERENCES, locale: "fr", textScale: 200 }, repaired: true });
  });
  it("do not throw when storage is unavailable", () => {
    expect(loadPreferences(throwing)).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
    expect(() => savePreferences(throwing, DEFAULT_PREFERENCES)).not.toThrow();
  });
  it("do not touch other keys", () => {
    const store = new MemoryStore();
    store.setItem("other", "keep");
    savePreferences(store, DEFAULT_PREFERENCES);
    expect(store.getItem("other")).toBe("keep");
  });
});

describe("preferencesFromForm", () => {
  it("reads the fields a form sends, which are all strings", () => {
    expect(preferencesFromForm({ locale: "fr", theme: "dark", textScale: "125", reduceMotion: "on" })).toEqual({ prefs: { locale: "fr", theme: "dark", textScale: 125, reduceMotion: true }, repaired: false });
  });
  it("uses the defaults for fields that are missing, as an unchecked box sends nothing", () => expect(preferencesFromForm({})).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: false }));
  it("reads on and 1 as on, and anything else as off", () => {
    for (const v of ["on", "1"]) expect(preferencesFromForm({ reduceMotion: v }).prefs.reduceMotion).toBe(true);
    for (const v of ["off", "0", "true", "", undefined, "ON"]) expect(preferencesFromForm({ reduceMotion: v }).prefs.reduceMotion, String(v)).toBe(false);
  });
  it("repairs a text size that is not a number or not one of the sizes", () => {
    expect(preferencesFromForm({ textScale: "big" })).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
    expect(preferencesFromForm({ textScale: "130" }).repaired).toBe(true);
    expect(preferencesFromForm({ textScale: "" })).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
  });
  it("repairs a language or a theme it does not know", () => {
    expect(preferencesFromForm({ locale: "es" }).prefs.locale).toBe("auto");
    expect(preferencesFromForm({ theme: "sepia" })).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
  });
});

describe("rootStyle", () => {
  it("sets the font size as a percentage, so the user's own base size still applies", () => {
    for (const s of TEXT_SCALES) expect(rootStyle({ ...DEFAULT_PREFERENCES, textScale: s })).toBe(`font-size:${s}%`);
  });
  it("offers the sizes a person needs: normal, and up to double", () => {
    expect(TEXT_SCALES[0]).toBe(100);
    expect(TEXT_SCALES.at(-1)).toBe(200);
    expect([...TEXT_SCALES]).toEqual([...TEXT_SCALES].sort((a, b) => a - b));
  });
});
