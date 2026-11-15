import enJson from "./en.json";
import frJson from "./fr.json";
import type { ActionId } from "../types.ts";

export const LANGS = ["en", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export type MessageKey = keyof typeof enJson;

/** Compile error here means a key is missing from the French catalog. */
const fr: Record<MessageKey, string> = frJson;
export const CATALOGS: Record<Lang, Record<MessageKey, string>> = { en: enJson, fr };

export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  return CATALOGS[lang][key].replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (!(name in params)) throw new Error(`Missing parameter "${name}" for ${key}`);
    return String(params[name]);
  });
}

export function quote(lang: Lang, text: string): string {
  return t(lang, "quote", { text });
}

export function actionLabel(lang: Lang, action: ActionId): string {
  return t(lang, `action.${action}`);
}
