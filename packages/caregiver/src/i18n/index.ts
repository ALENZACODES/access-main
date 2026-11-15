import en from "./en.json";
import fr from "./fr.json";

export type Lang = "en" | "fr";
export type MessageKey = keyof typeof en;

export const LANGS: readonly Lang[] = ["en", "fr"];
export const CATALOGS: Record<Lang, Record<MessageKey, string>> = { en, fr };

export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = CATALOGS[lang][key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** For keys built at run time, such as `field.${name}`. Falls back to the key so a gap is visible, not blank. */
export function tDynamic(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  return key in CATALOGS[lang] ? t(lang, key as MessageKey, params) : key;
}

export function formatDateTime(lang: Lang, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(date);
}

export function formatDate(lang: Lang, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long", timeZone: "America/Toronto" }).format(date);
}
