/** Unbranded, read-only messages for the offline journey audit. */
export type AuditLocale = "en" | "fr";
export type AuditMessageKey =
  | "offline" | "online" | "unknown" | "loading" | "ready" | "empty"
  | "error" | "retry" | "back" | "forward" | "search" | "clear"
  | "source" | "licence" | "retrievedOn" | "tier" | "dismiss"
  | "noCache" | "cached" | "stale" | "connectivityUnknown" | "focusLost"
  | "targetSmall" | "routeMissing" | "nameMissing" | "retryUnavailable"
  | "evidenceMissing" | "fallback" | "dialogOpen" | "dialogClosed"
  | "restore" | "noChange" | "testFailed" | "testPassed";

export const AUDIT_COPY: Readonly<Record<AuditLocale, Readonly<Record<AuditMessageKey, string>>>> = {
  en: {
    offline: "Offline. Some information may be unavailable.",
    online: "Connection available.",
    unknown: "UNKNOWN",
    loading: "Loading…",
    ready: "Results are ready.",
    empty: "No results found.",
    error: "Something went wrong.",
    retry: "Try again",
    back: "Go back",
    forward: "Go forward",
    search: "Search",
    clear: "Clear search",
    source: "Source",
    licence: "Licence",
    retrievedOn: "Retrieved on",
    tier: "Evidence tier",
    dismiss: "Dismiss",
    noCache: "No saved information available.",
    cached: "Saved information is available.",
    stale: "Saved information may be out of date.",
    connectivityUnknown: "Connection status is unknown.",
    focusLost: "Keyboard focus could not be located.",
    targetSmall: "A control is smaller than 44 by 44 pixels.",
    routeMissing: "The requested route is unavailable.",
    nameMissing: "An interactive control has no accessible name.",
    retryUnavailable: "No retry action is available.",
    evidenceMissing: "Evidence details are unknown.",
    fallback: "A fallback screen is shown.",
    dialogOpen: "Dialog opened.",
    dialogClosed: "Dialog closed.",
    restore: "Previous screen restored.",
    noChange: "No change was observed.",
    testFailed: "Audit found an issue.",
    testPassed: "Audit completed without findings.",
  },
  fr: {
    offline: "Hors ligne. Certaines informations peuvent être indisponibles.",
    online: "Connexion disponible.",
    unknown: "UNKNOWN",
    loading: "Chargement…",
    ready: "Les résultats sont prêts.",
    empty: "Aucun résultat trouvé.",
    error: "Une erreur s’est produite.",
    retry: "Réessayer",
    back: "Retour",
    forward: "Suivant",
    search: "Rechercher",
    clear: "Effacer la recherche",
    source: "Source",
    licence: "Licence",
    retrievedOn: "Date de consultation",
    tier: "Niveau de preuve",
    dismiss: "Fermer",
    noCache: "Aucune information enregistrée n’est disponible.",
    cached: "Des informations enregistrées sont disponibles.",
    stale: "Les informations enregistrées peuvent être anciennes.",
    connectivityUnknown: "L’état de la connexion est inconnu.",
    focusLost: "Le focus du clavier est introuvable.",
    targetSmall: "Une commande mesure moins de 44 sur 44 pixels.",
    routeMissing: "La page demandée est indisponible.",
    nameMissing: "Une commande interactive n’a pas de nom accessible.",
    retryUnavailable: "Aucune action pour réessayer n’est disponible.",
    evidenceMissing: "Les renseignements sur les sources sont inconnus.",
    fallback: "Une page de repli est affichée.",
    dialogOpen: "La fenêtre de dialogue est ouverte.",
    dialogClosed: "La fenêtre de dialogue est fermée.",
    restore: "La page précédente est rétablie.",
    noChange: "Aucun changement observé.",
    testFailed: "L’audit a trouvé un problème.",
    testPassed: "L’audit n’a trouvé aucun problème.",
  },
};

export interface CopyProblem {
  code: string;
  language: AuditLocale;
  key: string;
  offset: number;
}

export function auditCopy(locale: AuditLocale, key: AuditMessageKey): string {
  return AUDIT_COPY[locale][key];
}

/** Only locale-aware accessible names are allowed in role-based test selectors. */
export function accessibleName(locale: AuditLocale, key: AuditMessageKey): RegExp {
  const text = auditCopy(locale, key);
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

export function normalizeLocale(value: string | null): AuditLocale | null {
  if (value === null) return null;
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(value.trim());
  return match ? match[1]!.toLowerCase() as AuditLocale : null;
}

export function unknownValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return "UNKNOWN";
  const normalized = value.trim().replace(/\s+/g, " ");
  if (["", "unknown", "inconnu", "inconnue", "n/a", "—", "-", "null", "undefined"].includes(normalized.toLowerCase())) {
    return "UNKNOWN";
  }
  return normalized;
}

export function frenchCopyProblems(text: string): CopyProblem[] {
  const problems: CopyProblem[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "'") problems.push({ code: "apostrophe", language: "fr", key: "text", offset: i });
    if (char === ":" && i > 0 && text[i - 1] !== "\u00a0") {
      problems.push({ code: "colon-nbsp", language: "fr", key: "text", offset: i });
    }
    if ([";", "!", "?"].includes(char ?? "") && i > 0 && text[i - 1] !== "\u202f") {
      problems.push({ code: "thin-space", language: "fr", key: "text", offset: i });
    }
    if (char === "«" && text[i + 1] !== "\u202f") {
      problems.push({ code: "opening-guillemet", language: "fr", key: "text", offset: i });
    }
    if (char === "»" && text[i - 1] !== "\u202f") {
      problems.push({ code: "closing-guillemet", language: "fr", key: "text", offset: i });
    }
  }
  return problems;
}

export function allCopyProblems(): CopyProblem[] {
  const results: CopyProblem[] = [];
  for (const language of ["en", "fr"] as const) {
    for (const [key, text] of Object.entries(AUDIT_COPY[language])) {
      if (!text.trim()) results.push({ code: "empty", language, key, offset: 0 });
      if (language === "fr") results.push(...frenchCopyProblems(text).map((problem) => ({ ...problem, key })));
    }
  }
  return results;
}

export function copyPairsAreComplete(): boolean {
  const english = Object.keys(AUDIT_COPY.en).sort();
  const french = Object.keys(AUDIT_COPY.fr).sort();
  return english.length === french.length && english.every((key, i) => key === french[i]);
}

export function languageNameProblem(actual: string | null, expected: AuditLocale): string | null {
  const parsed = normalizeLocale(actual);
  if (parsed === null) return "document-language-unknown";
  return parsed === expected ? null : "document-language-mismatch";
}

/** A missing aria-label is not a failure if another accessible naming path exists. */
export function hasAccessibleName(candidate: {
  ariaLabel?: string | null;
  labelledByText?: string | null;
  visibleText?: string | null;
  associatedLabel?: string | null;
  imageAlternative?: string | null;
  title?: string | null;
}): boolean {
  return [candidate.ariaLabel, candidate.labelledByText, candidate.visibleText,
    candidate.associatedLabel, candidate.imageAlternative, candidate.title]
    .some((value) => typeof value === "string" && value.trim().length > 0);
}

export function copySummary(problems: readonly CopyProblem[], maximum = 15): string {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be a positive integer");
  const entries = [...new Set(problems.map((problem) =>
    `${problem.language}/${problem.key}: ${problem.code} at ${problem.offset}`))];
  const remaining = Math.max(0, entries.length - maximum);
  return [...entries.slice(0, maximum), ...(remaining ? [`${remaining} further findings`] : [])].join("\n");
}
