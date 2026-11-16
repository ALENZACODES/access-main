/**
 * Display preferences: language, theme, text size and reduced motion. Stored on the
 * device only. Text can be scaled up to 200% (WCAG 1.4.4). Anything invalid on load
 * falls back to the default for that field.
 */
import type { Locale } from "./stateCopy";
import type { Theme } from "./contrast";
import type { KeyValueStore } from "./submissionQueue";

export type LocalePref = Locale | "auto";
export type ThemePref = Theme | "system";
export const TEXT_SCALES = [100, 125, 150, 200] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export interface Preferences {
  readonly locale: LocalePref;
  readonly theme: ThemePref;
  readonly textScale: TextScale;
  readonly reduceMotion: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { locale: "auto", theme: "system", textScale: 100, reduceMotion: false };
export const PREFS_KEY = "app.preferences.v1";

const LOCALES: readonly LocalePref[] = ["auto", "en", "fr"];
const THEMES: readonly ThemePref[] = ["system", "light", "dark"];

export interface ParsedPreferences {
  readonly prefs: Preferences;
  /** True when some stored value was invalid and was reset. */
  readonly repaired: boolean;
}

export function sanitizePreferences(input: unknown): ParsedPreferences {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  let repaired = typeof input !== "object" || input === null ? input !== undefined && input !== null : false;
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T => {
    if (value === undefined) return fallback;
    if ((allowed as readonly unknown[]).includes(value)) return value as T;
    repaired = true;
    return fallback;
  };
  const prefs: Preferences = {
    locale: pick<LocalePref>(o.locale, LOCALES, DEFAULT_PREFERENCES.locale),
    theme: pick<ThemePref>(o.theme, THEMES, DEFAULT_PREFERENCES.theme),
    textScale: pick<TextScale>(o.textScale, TEXT_SCALES, DEFAULT_PREFERENCES.textScale),
    reduceMotion: pick<boolean>(o.reduceMotion, [true, false], DEFAULT_PREFERENCES.reduceMotion),
  };
  return { prefs, repaired };
}

export function loadPreferences(store: KeyValueStore): ParsedPreferences {
  try {
    const raw = store.getItem(PREFS_KEY);
    if (raw === null) return { prefs: DEFAULT_PREFERENCES, repaired: false };
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return { prefs: DEFAULT_PREFERENCES, repaired: true };
  }
}

export function savePreferences(store: KeyValueStore, prefs: Preferences): void {
  try {
    store.setItem(PREFS_KEY, JSON.stringify(sanitizePreferences(prefs).prefs));
  } catch {
    /* storage unavailable: preferences apply for this session only */
  }
}

/** Parse form fields (all strings) into preferences. */
export function preferencesFromForm(form: Readonly<Record<string, string | undefined>>): ParsedPreferences {
  return sanitizePreferences({
    locale: form.locale ?? "auto",
    theme: form.theme ?? "system",
    textScale: Number(form.textScale ?? 100),
    reduceMotion: form.reduceMotion === "on" || form.reduceMotion === "1",
  });
}

/** Inline style for the root element. */
export function rootStyle(p: Preferences): string {
  return `font-size:${p.textScale}%`;
}
