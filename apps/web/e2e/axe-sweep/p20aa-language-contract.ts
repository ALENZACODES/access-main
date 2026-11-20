/** Locale-sensitive copy and state checks for an unbranded accessibility interface. */
export type Language = "en" | "fr";
export type CopyIntent = "loading" | "ready" | "empty" | "error" | "offline" | "unknown" | "retry" | "clear" | "back" | "close" | "search" | "details" | "source" | "licence" | "retrievedOn" | "tier";
export type CopyFinding = { code: string; field: string; detail: string };
export interface CopyRecord {
  intent: CopyIntent;
  language: Language;
  text: string;
  source: string | null;
  licence: string | null;
  retrievedOn: string | null;
  tier: string | null;
}
export const COPY: Readonly<Record<Language, Readonly<Record<CopyIntent, string>>>> = {
  en: {
    loading: "Loading results…",
    ready: "Results are ready.",
    empty: "No results found.",
    error: "Something went wrong. Try again.",
    offline: "You are offline. Some information may be unavailable.",
    unknown: "UNKNOWN",
    retry: "Try again",
    clear: "Clear search",
    back: "Go back",
    close: "Close dialog",
    search: "Search",
    details: "View details",
    source: "Source",
    licence: "Licence",
    retrievedOn: "Retrieved on",
    tier: "Evidence tier",
  },
  fr: {
    loading: "Chargement des résultats…",
    ready: "Les résultats sont prêts.",
    empty: "Aucun résultat trouvé.",
    error: "Une erreur s’est produite. Réessayez.",
    offline: "Vous êtes hors ligne. Certaines informations peuvent être indisponibles.",
    unknown: "UNKNOWN",
    retry: "Réessayer",
    clear: "Effacer la recherche",
    back: "Retour",
    close: "Fermer la fenêtre de dialogue",
    search: "Rechercher",
    details: "Voir les détails",
    source: "Source",
    licence: "Licence",
    retrievedOn: "Date de consultation",
    tier: "Niveau de preuve",
  },
};
const EXCLUDED_CLAIMS = ["verified", "real-time", "partnership", "guarantee"] as const;
const DEFAULT_UNKNOWN = new Set(["", "unknown", "inconnu", "inconnue", "—", "n/a", "-"]);
const finding = (code: string, field: string, detail: string): CopyFinding => ({ code, field, detail });
export function copy(language: Language, intent: CopyIntent): string {
  return COPY[language][intent];
}
export function observedOrUnknown(value: string | null | undefined): string {
  if (!value || DEFAULT_UNKNOWN.has(value.trim().toLowerCase())) return "UNKNOWN";
  return value.trim().replace(/\s+/g, " ");
}
export function documentLanguage(value: string | null): Language | null {
  if (!value) return null;
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(value.trim());
  return match ? match[1]!.toLowerCase() as Language : null;
}
export function frenchTypographyFindings(value: string): CopyFinding[] {
  const failures: CopyFinding[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'") failures.push(finding("fr-straight-apostrophe", String(index), "Use U+2019 apostrophe"));
    if (char === ":" && index > 0 && !/\s/.test(value[index - 1]!)) {
      failures.push(finding("fr-colon-space", String(index), "Use U+00A0 before colon"));
    }
    if (char === ":" && index > 0 && /\s/.test(value[index - 1]!) && value[index - 1] !== "\u00a0") {
      failures.push(finding("fr-colon-space-kind", String(index), "Colon must use U+00A0"));
    }
    if ((char === ";" || char === "!" || char === "?") && index > 0 && value[index - 1] !== "\u202f") {
      failures.push(finding("fr-thin-space", String(index), "Use U+202F before ; ! ?"));
    }
    if (char === "«" && value[index + 1] !== "\u202f") {
      failures.push(finding("fr-opening-guillemet", String(index), "Use U+202F after «"));
    }
    if (char === "»" && value[index - 1] !== "\u202f") {
      failures.push(finding("fr-closing-guillemet", String(index), "Use U+202F before »"));
    }
  }
  return failures;
}
export function forbiddenClaims(text: string): CopyFinding[] {
  const lower = text.toLowerCase();
  const failures: CopyFinding[] = [];
  for (const claim of EXCLUDED_CLAIMS) {
    if (lower.includes(claim)) failures.push(finding("claim-disallowed", claim, "Unsubstantiated claim"));
  }
  return failures;
}
export function localeCopyFindings(text: string, language: Language): CopyFinding[] {
  const failures = forbiddenClaims(text);
  if (language === "fr") failures.push(...frenchTypographyFindings(text));
  if (!text.trim()) failures.push(finding("copy-empty", language, "User-facing text is missing"));
  return failures;
}
export function statusCopyFindings(record: CopyRecord): CopyFinding[] {
  const failures = localeCopyFindings(record.text, record.language);
  if (record.intent === "unknown" && observedOrUnknown(record.text) !== "UNKNOWN") {
    failures.push(finding("unknown-promoted", record.language, "Missing data must remain UNKNOWN"));
  }
  if (record.intent === "source" && observedOrUnknown(record.source) === "UNKNOWN") {
    failures.push(finding("source-unavailable", record.language, "Source is UNKNOWN"));
  }
  if (record.intent === "licence" && observedOrUnknown(record.licence) === "UNKNOWN") {
    failures.push(finding("licence-unavailable", record.language, "Licence is UNKNOWN"));
  }
  if (record.intent === "retrievedOn" && observedOrUnknown(record.retrievedOn) === "UNKNOWN") {
    failures.push(finding("retrieval-date-unavailable", record.language, "Retrieved-on date is UNKNOWN"));
  }
  if (record.intent === "tier" && observedOrUnknown(record.tier) === "UNKNOWN") {
    failures.push(finding("tier-unavailable", record.language, "Evidence tier is UNKNOWN"));
  }
  return failures;
}
export interface TranslationPair {
  key: string;
  en: string;
  fr: string;
  required: boolean;
}
export function translationPairFindings(pairs: readonly TranslationPair[]): CopyFinding[] {
  const failures: CopyFinding[] = [];
  const keys = new Set<string>();
  for (const pair of pairs) {
    if (keys.has(pair.key)) failures.push(finding("translation-key-duplicate", pair.key, "Duplicate translation key"));
    keys.add(pair.key);
    if (pair.required && !pair.en.trim()) failures.push(finding("translation-en-empty", pair.key, "English copy missing"));
    if (pair.required && !pair.fr.trim()) failures.push(finding("translation-fr-empty", pair.key, "French copy missing"));
    if (pair.en.trim() && pair.fr.trim() && pair.en === pair.fr && pair.en !== "UNKNOWN") {
      failures.push(finding("translation-identical", pair.key, "Check identical language copy"));
    }
    if (pair.fr.trim()) failures.push(...localeCopyFindings(pair.fr, "fr").map((problem) => ({ ...problem, field: pair.key })));
    if (pair.en.trim()) failures.push(...forbiddenClaims(pair.en).map((problem) => ({ ...problem, field: pair.key })));
  }
  return failures;
}
export function copyForOutcome(language: Language, state: "loading" | "ready" | "empty" | "error" | "offline" | "unknown"): string {
  return COPY[language][state];
}
export function messageMatchesOutcome(language: Language, state: CopyIntent, message: string): boolean {
  return message.trim() === copy(language, state);
}
export function makeStatusRecord(language: Language, intent: CopyIntent, provenance: Partial<Omit<CopyRecord, "intent" | "language" | "text">> = {}): CopyRecord {
  return {
    language,
    intent,
    text: copy(language, intent),
    source: provenance.source ?? null,
    licence: provenance.licence ?? null,
    retrievedOn: provenance.retrievedOn ?? null,
    tier: provenance.tier ?? null,
  };
}
export function copyReport(findings: readonly CopyFinding[], maximum = 30): string {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be positive");
  const rows = [...new Set(findings.map((entry) => `${entry.code} ${entry.field}: ${entry.detail}`))];
  const remaining = rows.length - Math.min(rows.length, maximum);
  return [...rows.slice(0, maximum), ...(remaining ? [`${remaining} additional findings`] : [])].join("\n");
}
