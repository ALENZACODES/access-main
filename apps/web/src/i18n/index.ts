import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

export const LANGUAGE_STORAGE_KEY = "access.language";
export const LANGUAGE_SET_KEY = "access.language.set";

export type AppLanguage = "en" | "fr";

export function readStoredLanguage(): AppLanguage | null {
  try {
    const value = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    if (value === "en" || value === "fr") return value;
  } catch {
    return null;
  }
  return null;
}

export function languageWasChosen(): boolean {
  try {
    return globalThis.localStorage?.getItem(LANGUAGE_SET_KEY) === "1";
  } catch {
    return false;
  }
}

export function detectLanguage(): AppLanguage {
  const stored = readStoredLanguage();
  if (stored) return stored;
  const nav = globalThis.navigator?.language?.toLowerCase() ?? "";
  if (nav.startsWith("fr")) return "fr";
  return "en";
}

export function initI18n(): typeof i18n {
  if (i18n.isInitialized) return i18n;
  const lng = detectLanguage();
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  });
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
  return i18n;
}

export async function applyLanguage(lng: AppLanguage, explicit: boolean): Promise<void> {
  await i18n.changeLanguage(lng);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    if (explicit) localStorage.setItem(LANGUAGE_SET_KEY, "1");
  } catch {
    /* Storage can be blocked. The in-memory language still changes. */
  }
  if (typeof document !== "undefined") document.documentElement.lang = lng;
}
