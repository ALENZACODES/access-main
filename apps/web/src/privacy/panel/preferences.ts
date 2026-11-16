import type { Locale } from "./copyLint";
import type { StorageLike } from "./storage";

export interface PrivacyPrefs {
  locale: Locale;
}

export const PREFS_KEY_SUFFIX = "prefs.v1";

export function prefsKey(prefix: string): string {
  return `${prefix}${PREFS_KEY_SUFFIX}`;
}

/** First French tag wins; anything else, or nothing, is English. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const lower = tag.toLowerCase();
    if (lower === "fr" || lower.startsWith("fr-")) return "fr";
    if (lower === "en" || lower.startsWith("en-")) return "en";
  }
  return "en";
}

/** Stored preferences, or null when none are stored or they cannot be read. */
export function loadPrefs(storage: StorageLike | null, prefix: string): PrivacyPrefs | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(prefsKey(prefix));
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (v !== null && typeof v === "object" && "locale" in v) {
      const loc = (v as { locale: unknown }).locale;
      if (loc === "en" || loc === "fr") return { locale: loc };
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns false when the preference could not be stored. */
export function savePrefs(storage: StorageLike | null, prefix: string, prefs: PrivacyPrefs): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(prefsKey(prefix), JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
