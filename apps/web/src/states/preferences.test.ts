import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES, PREFS_KEY, TEXT_SCALES, loadPreferences, preferencesFromForm, rootStyle, sanitizePreferences, savePreferences,
} from "./index";
import { MemoryStore } from "./testHelpers";

describe("sanitizePreferences", () => {
  it("returns defaults for empty input without marking repair", () => {
    expect(sanitizePreferences({})).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: false });
    expect(sanitizePreferences(undefined).repaired).toBe(false);
  });
  it("keeps valid values and resets invalid ones", () => {
    const r = sanitizePreferences({ locale: "fr", theme: "purple", textScale: 175, reduceMotion: "yes" });
    expect(r.prefs).toEqual({ locale: "fr", theme: "system", textScale: 100, reduceMotion: false });
    expect(r.repaired).toBe(true);
  });
  it("treats non-objects as repaired defaults", () => {
    expect(sanitizePreferences("junk")).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
    expect(sanitizePreferences(null).repaired).toBe(false);
  });
  it("allows scaling up to 200%", () => {
    expect(Math.max(...TEXT_SCALES)).toBe(200);
    expect(sanitizePreferences({ textScale: 200 }).prefs.textScale).toBe(200);
  });
});

describe("load and save", () => {
  it("round-trips through a store", () => {
    const store = new MemoryStore();
    savePreferences(store, { locale: "en", theme: "dark", textScale: 150, reduceMotion: true });
    expect(loadPreferences(store)).toEqual({ prefs: { locale: "en", theme: "dark", textScale: 150, reduceMotion: true }, repaired: false });
  });
  it("falls back to defaults on missing, corrupt or throwing storage", () => {
    expect(loadPreferences(new MemoryStore()).prefs).toEqual(DEFAULT_PREFERENCES);
    const bad = new MemoryStore();
    bad.setItem(PREFS_KEY, "{oops");
    expect(loadPreferences(bad)).toEqual({ prefs: DEFAULT_PREFERENCES, repaired: true });
    const throwing = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => undefined };
    expect(loadPreferences(throwing).repaired).toBe(true);
    expect(() => savePreferences(throwing, DEFAULT_PREFERENCES)).not.toThrow();
  });
});

describe("form and style", () => {
  it("parses form fields", () => {
    expect(preferencesFromForm({ locale: "fr", theme: "dark", textScale: "125", reduceMotion: "on" }).prefs).toEqual({
      locale: "fr", theme: "dark", textScale: 125, reduceMotion: true,
    });
  });
  it("flags tampered form values", () => {
    const r = preferencesFromForm({ locale: "de", textScale: "9999" });
    expect(r.repaired).toBe(true);
    expect(r.prefs.locale).toBe("auto");
  });
  it("builds the root font-size", () => {
    expect(rootStyle({ ...DEFAULT_PREFERENCES, textScale: 200 })).toBe("font-size:200%");
  });
});
