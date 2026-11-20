import { issue, textOrUnknown, UNKNOWN, type Finding, type JourneyEvent, type LiveAnnouncement, type Locale } from "./p20ak-types.ts";

/** Localized diagnostic copy. UNKNOWN is always the literal sentinel. */
export type CopyKey = "offline" | "online" | "unknown" | "loading" | "ready" | "empty" | "error" | "retry" | "dismiss" | "back" | "forward" | "refresh" | "source" | "licence" | "retrievedOn" | "tier" | "notAvailable" | "focus" | "dialog" | "export" | "cache" | "noResults" | "continue" | "search" | "clear" | "status" | "outcome" | "help" | "details" | "open" | "close";
export const COPY: Readonly<Record<Locale, Readonly<Record<CopyKey, string>>>> = {
  en: {
    offline: "Offline. Some information may be unavailable.", online: "Connection available.", unknown: UNKNOWN,
    loading: "Loading…", ready: "Results are ready.", empty: "No results.", error: "Something went wrong.",
    retry: "Try again", dismiss: "Dismiss", back: "Go back", forward: "Go forward", refresh: "Refresh",
    source: "Source", licence: "Licence", retrievedOn: "Retrieved on", tier: "Evidence tier",
    notAvailable: "Information unavailable", focus: "Keyboard focus", dialog: "Dialog", export: "Export",
    cache: "Saved information", noResults: "No results found", continue: "Continue", search: "Search",
    clear: "Clear search", status: "Status", outcome: "Outcome", help: "Help", details: "Details", open: "Open", close: "Close",
  },
  fr: {
    offline: "Hors ligne. Certaines informations peuvent être indisponibles.", online: "Connexion disponible.", unknown: UNKNOWN,
    loading: "Chargement…", ready: "Les résultats sont prêts.", empty: "Aucun résultat.", error: "Une erreur s’est produite.",
    retry: "Réessayer", dismiss: "Fermer", back: "Retour", forward: "Suivant", refresh: "Actualiser",
    source: "Source", licence: "Licence", retrievedOn: "Date de consultation", tier: "Niveau de preuve",
    notAvailable: "Information indisponible", focus: "Focus du clavier", dialog: "Fenêtre de dialogue", export: "Exporter",
    cache: "Information enregistrée", noResults: "Aucun résultat trouvé", continue: "Continuer", search: "Rechercher",
    clear: "Effacer la recherche", status: "État", outcome: "Résultat", help: "Aide", details: "Détails", open: "Ouvrir", close: "Fermer",
  },
};
export function localCopy(language: Locale, key: CopyKey): string {
  return COPY[language][key];
}
export function localeTag(value: string | null): Locale | "UNKNOWN" {
  if (value === null) return UNKNOWN;
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(value.trim());
  const candidate = match?.[1]?.toLowerCase();
  return candidate === "en" || candidate === "fr" ? candidate : UNKNOWN;
}
export function frenchTypographyFindings(value: string): Finding[] {
  const findings: Finding[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") findings.push(issue("fr-apostrophe", "copy", `Use U+2019 at ${index}`));
    if (character === ":" && index > 0 && value[index - 1] !== "\u00A0") findings.push(issue("fr-colon", "copy", `Use U+00A0 at ${index}`));
    if ([";", "!", "?"].includes(character ?? "") && index > 0 && value[index - 1] !== "\u202F") findings.push(issue("fr-thin-space", "copy", `Use U+202F at ${index}`));
    if (character === "«" && value[index + 1] !== "\u202F") findings.push(issue("fr-guillemet-open", "copy", `Use U+202F at ${index}`));
    if (character === "»" && value[index - 1] !== "\u202F") findings.push(issue("fr-guillemet-close", "copy", `Use U+202F at ${index}`));
  }
  return findings;
}
export function copyTableFindings(): Finding[] {
  const findings: Finding[] = [];
  const en = Object.keys(COPY.en).sort();
  const fr = Object.keys(COPY.fr).sort();
  if (en.join("|") !== fr.join("|")) findings.push(issue("locale-copy-keys", "copy", "EN/FR key sets differ"));
  for (const language of ["en", "fr"] as const) {
    for (const [key, value] of Object.entries(COPY[language])) {
      if (!value.trim()) findings.push(issue("locale-copy-empty", `${language}/${key}`, "Copy missing"));
      if (language === "fr") findings.push(...frenchTypographyFindings(value).map((finding) => ({ ...finding, scope: `${language}/${key}` })));
    }
  }
  return findings;
}
export function announcementFindings(messages: readonly LiveAnnouncement[], expected: Locale | "UNKNOWN", step = 0): Finding[] {
  const findings: Finding[] = [];
  const keys = new Set<string>();
  const audible = new Set<string>();
  for (const message of messages) {
    if (keys.has(message.key)) findings.push(issue("announcement-key-repeated", message.key, "Duplicate status identifier", step));
    keys.add(message.key);
    if (!message.visible) continue;
    if (!message.text.trim() && message.politeness !== "off") findings.push(issue("announcement-empty", message.key, "Visible live region empty", step));
    if (message.language !== expected && message.language !== UNKNOWN && expected !== UNKNOWN) findings.push(issue("announcement-language", message.key, "Status language differs from document", step));
    if (message.language === UNKNOWN) findings.push(issue("announcement-language-unknown", message.key, "Status language UNKNOWN", step, "information"));
    if (!Number.isFinite(message.observedAt) || message.observedAt < 0) findings.push(issue("announcement-time", message.key, "Invalid timestamp", step));
    if (message.politeness === UNKNOWN) findings.push(issue("announcement-politeness-unknown", message.key, "Live-region mode UNKNOWN", step, "information"));
    if (message.busy === true && message.politeness === "assertive") findings.push(issue("announcement-busy-assertive", message.key, "Busy status is assertive", step, "warning"));
    if (message.politeness !== "off" && message.text.trim()) {
      const fingerprint = `${message.politeness}|${message.text.trim().toLowerCase()}`;
      if (audible.has(fingerprint)) findings.push(issue("announcement-duplicate", message.key, "Repeated simultaneous announcement", step));
      audible.add(fingerprint);
    }
  }
  return findings;
}
export function localeFindings(language: Locale | "UNKNOWN", scope: string, step = 0): Finding[] {
  if (language === UNKNOWN) return [issue("document-language-unknown", scope, "Language UNKNOWN", step, "information")];
  return [];
}
export function languageEventFindings(event: JourneyEvent, step = 0): Finding[] {
  const findings: Finding[] = [];
  const { before, after } = event;
  if (before.language === after.language) findings.push(issue("locale-not-changed", event.id, "Language switch had no observable effect", step));
  if (before.route !== after.route) findings.push(issue("locale-route-reset", event.id, "Language switch changed route", step));
  if (after.language === UNKNOWN) findings.push(issue("locale-target-unknown", event.id, "Language after switch UNKNOWN", step, "information"));
  return findings;
}
export function localizedAccessibleName(language: Locale, key: CopyKey): RegExp {
  const escaped = localCopy(language, key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}
export function normalizedAnnouncement(value: string | null): string {
  return textOrUnknown(value);
}
export function statusChanged(before: readonly LiveAnnouncement[], after: readonly LiveAnnouncement[]): boolean {
  const previous = new Set(before.filter((message) => message.visible && message.politeness !== "off").map((message) => message.text.trim()));
  return after.some((message) => message.visible && message.politeness !== "off" && !previous.has(message.text.trim()));
}
export function languageCoverage(messages: readonly LiveAnnouncement[]): { en: number; fr: number; unknown: number } {
  return { en: messages.filter((message) => message.language === "en").length,
    fr: messages.filter((message) => message.language === "fr").length,
    unknown: messages.filter((message) => message.language === UNKNOWN).length };
}
