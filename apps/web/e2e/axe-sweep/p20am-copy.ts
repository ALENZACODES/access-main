import { UNKNOWN, textOrUnknown, type Finding, type Language, finding } from "./p20am-model.ts";

export type CopyKey = "offline" | "online" | "connectionUnknown" | "cacheUnknown" | "cacheAbsent" |
  "cacheStale" | "loading" | "ready" | "empty" | "error" | "fallback" | "retry" |
  "close" | "back" | "forward" | "search" | "clear" | "source" | "licence" |
  "retrievedOn" | "tier" | "export" | "copy" | "unknown" | "focusLost" | "routeLost" |
  "evidenceLost" | "saved" | "notSaved" | "continue" | "return" | "notice";
export interface CopyPair { readonly key: CopyKey; readonly en: string; readonly fr: string; }
export const COPY: Readonly<Record<Language, Readonly<Record<CopyKey, string>>>> = {
  en: {
    offline: "Offline. Saved information may be available.",
    online: "Connection available.",
    connectionUnknown: "Connection status: UNKNOWN",
    cacheUnknown: "Saved information: UNKNOWN",
    cacheAbsent: "No saved information is available.",
    cacheStale: "Saved information may be out of date.",
    loading: "Loading…",
    ready: "Results are ready.",
    empty: "No results found.",
    error: "Unable to complete this action.",
    fallback: "Showing available information.",
    retry: "Try again",
    close: "Close dialog",
    back: "Go back",
    forward: "Go forward",
    search: "Search",
    clear: "Clear search",
    source: "Source",
    licence: "Licence",
    retrievedOn: "Retrieved on",
    tier: "Evidence tier",
    export: "Export evidence",
    copy: "Copy information",
    unknown: UNKNOWN,
    focusLost: "Keyboard focus is unavailable.",
    routeLost: "The requested page is unavailable.",
    evidenceLost: "Some source details are unavailable.",
    saved: "Information saved on this device.",
    notSaved: "Information was not saved.",
    continue: "Continue",
    return: "Return to results",
    notice: "Check the source before relying on this information.",
  },
  fr: {
    offline: "Hors ligne. Des informations enregistrées peuvent être disponibles.",
    online: "Connexion disponible.",
    connectionUnknown: "État de la connexion : UNKNOWN",
    cacheUnknown: "Informations enregistrées : UNKNOWN",
    cacheAbsent: "Aucune information enregistrée n’est disponible.",
    cacheStale: "Les informations enregistrées peuvent être anciennes.",
    loading: "Chargement…",
    ready: "Les résultats sont prêts.",
    empty: "Aucun résultat trouvé.",
    error: "Impossible de terminer cette action.",
    fallback: "Affichage des informations disponibles.",
    retry: "Réessayer",
    close: "Fermer la fenêtre de dialogue",
    back: "Retour",
    forward: "Suivant",
    search: "Rechercher",
    clear: "Effacer la recherche",
    source: "Source",
    licence: "Licence",
    retrievedOn: "Date de consultation",
    tier: "Niveau de preuve",
    export: "Exporter les renseignements",
    copy: "Copier les informations",
    unknown: UNKNOWN,
    focusLost: "Le focus du clavier est indisponible.",
    routeLost: "La page demandée est indisponible.",
    evidenceLost: "Certains renseignements sur les sources sont indisponibles.",
    saved: "Informations enregistrées sur cet appareil.",
    notSaved: "Les informations n’ont pas été enregistrées.",
    continue: "Continuer",
    return: "Retour aux résultats",
    notice: "Consultez la source avant d’utiliser ces informations.",
  },
};
export function copy(language: Language, key: CopyKey): string { return COPY[language][key]; }
export function copyPairs(): CopyPair[] {
  return (Object.keys(COPY.en) as CopyKey[]).map((key) => ({ key, en: COPY.en[key], fr: COPY.fr[key] }));
}
export function normalizeLanguage(value: string | null): Language | null {
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(value?.trim() ?? "");
  const first = match?.[1]?.toLowerCase();
  return first === "en" || first === "fr" ? first : null;
}
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function accessibleName(language: Language, key: CopyKey): RegExp {
  return new RegExp(`^${escapeRegex(copy(language, key))}$`, "i");
}
export function frenchTypographyFindings(value: string, step = 0): Finding[] {
  const issues: Finding[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const before = index > 0 ? value[index - 1] : undefined;
    const after = value[index + 1];
    if (character === "'") issues.push(finding("fr-apostrophe", step, String(index)));
    if (character === ":" && before !== "\u00a0") issues.push(finding("fr-colon-space", step, String(index)));
    if (["!", "?", ";"].includes(character ?? "") && before !== "\u202f") {
      issues.push(finding("fr-thin-space", step, String(index)));
    }
    if (character === "«" && after !== "\u202f") issues.push(finding("fr-opening-guillemet", step, String(index)));
    if (character === "»" && before !== "\u202f") issues.push(finding("fr-closing-guillemet", step, String(index)));
  }
  return issues;
}
export function copyFindings(language: Language, text: string, step = 0): Finding[] {
  const issues = language === "fr" ? frenchTypographyFindings(text, step) : [];
  if (!text.trim()) issues.push(finding("copy-empty", step, language));
  const excluded = ["verified", "real-time", "partnership", "guarantee"];
  for (const word of excluded) {
    if (text.toLowerCase().includes(word)) issues.push(finding("copy-overclaim", step, word));
  }
  return issues;
}
export function libraryFindings(): Finding[] {
  const issues: Finding[] = [];
  const english = Object.keys(COPY.en);
  const french = Object.keys(COPY.fr);
  for (const key of english) {
    if (!french.includes(key)) issues.push(finding("translation-missing-fr", 0, key));
  }
  for (const key of french) {
    if (!english.includes(key)) issues.push(finding("translation-missing-en", 0, key));
  }
  for (const pair of copyPairs()) {
    issues.push(...copyFindings("en", pair.en));
    issues.push(...copyFindings("fr", pair.fr));
    if (pair.en === pair.fr && pair.en !== UNKNOWN && !["source", "licence"].includes(pair.key)) {
      issues.push(finding("translation-identical", 0, pair.key, "warning"));
    }
  }
  return issues;
}
export function outcomeCopy(language: Language, outcome: "loading" | "ready" | "empty" | "error" | "fallback"): string {
  return copy(language, outcome);
}
export function unknownCopy(value: string | null): string { return textOrUnknown(value); }
export function labelsMatch(language: Language, key: CopyKey, observed: string): boolean {
  return accessibleName(language, key).test(observed.trim());
}
export function statusMatches(language: Language, outcome: "loading" | "ready" | "empty" | "error" | "fallback", observed: string): boolean {
  return observed.trim() === outcomeCopy(language, outcome);
}
export function allNames(language: Language, keys: readonly CopyKey[]): string[] {
  return keys.map((key) => copy(language, key));
}
export function localesHaveSameKeys(): boolean {
  return Object.keys(COPY.en).sort().join("|") === Object.keys(COPY.fr).sort().join("|");
}
export function copyFindingReport(items: readonly Finding[], limit = 20): string {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const lines = [...new Set(items.map((item) => `${item.rule}: ${item.detail}`))];
  const additional = lines.length - Math.min(lines.length, limit);
  return [...lines.slice(0, limit), ...(additional ? [`${additional} other findings`] : [])].join("\n");
}
