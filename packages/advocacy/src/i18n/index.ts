import { en, type MessageKey } from "./en.ts";
import { fr } from "./fr.ts";

export const LANGS = ["en", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export type { MessageKey };

export const catalogs: Record<Lang, Record<MessageKey, string>> = { en, fr };

/** Look up a string and fill {placeholders}. A missing placeholder is left visible so a gap is easy to spot. */
export function t(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  return catalogs[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "fr";
}
