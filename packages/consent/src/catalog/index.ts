import type { Locale } from "../types.ts";
import { en, type MessageKey } from "./en.ts";
import { fr } from "./fr.ts";

export type { MessageKey };
export const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, fr };

export function format(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  return format(CATALOGS[locale][key], vars);
}
