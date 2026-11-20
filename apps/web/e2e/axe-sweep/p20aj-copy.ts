import { finding, type Finding, type Locale } from "./p20aj-types.ts";
export type MessageKey = "ready" | "loading" | "empty" | "error" | "offline" | "retry" | "clear" | "back" | "forward" | "search" | "source" | "licence" | "date" | "tier" | "unknown" | "fallback" | "focus" | "cache" | "saved" | "close" | "open" | "export";
export const MESSAGES: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = {
  en: {
    ready: "Results are ready.", loading: "Loading results…", empty: "No results found.",
    error: "An error occurred. Try again.", offline: "You are offline. Some information may be unavailable.",
    retry: "Try again", clear: "Clear search", back: "Go back", forward: "Go forward", search: "Search",
    source: "Source", licence: "Licence", date: "Retrieved on", tier: "Evidence tier", unknown: "UNKNOWN",
    fallback: "Offline information is unavailable.", focus: "Keyboard focus is unavailable.",
    cache: "Saved information status is UNKNOWN.", saved: "Saved information available.",
    close: "Close", open: "Open", export: "Export the current information",
  },
  fr: {
    ready: "Les résultats sont prêts.", loading: "Chargement des résultats…", empty: "Aucun résultat trouvé.",
    error: "Une erreur s’est produite. Réessayez.", offline: "Vous êtes hors ligne. Certaines informations peuvent être indisponibles.",
    retry: "Réessayer", clear: "Effacer la recherche", back: "Retour", forward: "Suivant", search: "Rechercher",
    source: "Source", licence: "Licence", date: "Consulté le", tier: "Niveau de preuve", unknown: "UNKNOWN",
    fallback: "Les informations hors ligne sont indisponibles.", focus: "Le focus du clavier est indisponible.",
    cache: "L’état des informations enregistrées est UNKNOWN.", saved: "Informations enregistrées disponibles.",
    close: "Fermer", open: "Ouvrir", export: "Exporter les informations actuelles",
  },
};
export function message(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key];
}
export function localeFromTag(value: string | null): Locale | "UNKNOWN" {
  if (!value) return "UNKNOWN";
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(value.trim());
  return match?.[1]?.toLowerCase() === "en" ? "en" : match?.[1]?.toLowerCase() === "fr" ? "fr" : "UNKNOWN";
}
export function frenchTypographyFindings(text: string): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'") findings.push(finding("fr-apostrophe", "copy", 0, String(i)));
    if (ch === ":" && text[i - 1] !== "\u00a0") findings.push(finding("fr-colon", "copy", 0, String(i)));
    if ([";", "!", "?"].includes(ch ?? "") && text[i - 1] !== "\u202f") findings.push(finding("fr-thin-space", "copy", 0, String(i)));
    if (ch === "«" && text[i + 1] !== "\u202f") findings.push(finding("fr-guillemet-open", "copy", 0, String(i)));
    if (ch === "»" && text[i - 1] !== "\u202f") findings.push(finding("fr-guillemet-close", "copy", 0, String(i)));
  }
  return findings;
}
export function copyFindings(): Finding[] {
  const findings: Finding[] = [];
  const enKeys = Object.keys(MESSAGES.en).sort();
  const frKeys = Object.keys(MESSAGES.fr).sort();
  if (enKeys.join("|") !== frKeys.join("|")) findings.push(finding("copy-key-mismatch", "copy", 0, "EN/FR"));
  for (const key of enKeys as MessageKey[]) {
    if (!message("en", key).trim()) findings.push(finding("copy-en-empty", "copy", 0, key));
    if (!message("fr", key).trim()) findings.push(finding("copy-fr-empty", "copy", 0, key));
    findings.push(...frenchTypographyFindings(message("fr", key)));
  }
  if (message("en", "unknown") !== "UNKNOWN" || message("fr", "unknown") !== "UNKNOWN") {
    findings.push(finding("copy-unknown", "copy", 0, "UNKNOWN must not be localized"));
  }
  return findings;
}
export function accessibleName(locale: Locale, key: MessageKey): RegExp {
  const escaped = message(locale, key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}
export function labelMatches(locale: Locale, key: MessageKey, observed: string | null): boolean {
  return observed !== null && accessibleName(locale, key).test(observed);
}
export function bilingualPairs(): Array<{ key: MessageKey; en: string; fr: string }> {
  return (Object.keys(MESSAGES.en) as MessageKey[]).map((key) => ({ key, en: message("en", key), fr: message("fr", key) }));
}
