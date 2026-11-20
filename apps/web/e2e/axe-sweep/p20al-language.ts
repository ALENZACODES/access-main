import { UNKNOWN, valueOrUnknown, type Finding, type Locale, finding } from "./p20al-contract.ts";

/** Audit vocabulary, not public claims about real places. */
export type MessageKey =
  | "offline" | "online" | "connecting" | "cacheUnknown" | "cacheAbsent"
  | "cachePresent" | "loading" | "ready" | "empty" | "error" | "retry"
  | "search" | "clear" | "back" | "forward" | "close" | "open"
  | "unknown" | "source" | "licence" | "retrievedOn" | "tier"
  | "focusMissing" | "focusHidden" | "focusTrapped" | "smallTarget"
  | "export" | "download" | "review" | "history" | "dismiss"
  | "routeMissing" | "evidenceMissing" | "privacy" | "noResults"
  | "requestFailed" | "requestPending" | "savedCopy" | "localOnly";

export const MESSAGES: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = {
  en: {
    offline: "Offline. Some pages may be unavailable.",
    online: "Connection available.",
    connecting: "Checking connection…",
    cacheUnknown: "Saved information status: UNKNOWN",
    cacheAbsent: "No saved copy was found.",
    cachePresent: "A saved copy was observed.",
    loading: "Loading…",
    ready: "Results are ready.",
    empty: "No results found.",
    error: "Something went wrong.",
    retry: "Try again",
    search: "Search",
    clear: "Clear search",
    back: "Go back",
    forward: "Go forward",
    close: "Close dialog",
    open: "Open details",
    unknown: UNKNOWN,
    source: "Source",
    licence: "Licence",
    retrievedOn: "Retrieved on",
    tier: "Evidence tier",
    focusMissing: "Keyboard focus: UNKNOWN",
    focusHidden: "Keyboard focus is not visible.",
    focusTrapped: "Keyboard focus could not leave the current region.",
    smallTarget: "A control is smaller than 44 by 44 pixels.",
    export: "Export evidence",
    download: "Download report",
    review: "Review findings",
    history: "History changed.",
    dismiss: "Dismiss",
    routeMissing: "The requested page could not be opened.",
    evidenceMissing: "Evidence metadata: UNKNOWN",
    privacy: "This audit does not send the observed record to a server.",
    noResults: "No matching records.",
    requestFailed: "The request did not complete.",
    requestPending: "The request has not completed.",
    savedCopy: "Saved copy",
    localOnly: "Local observation only",
  },
  fr: {
    offline: "Hors ligne. Certaines pages peuvent être indisponibles.",
    online: "Connexion disponible.",
    connecting: "Contrôle de la connexion…",
    cacheUnknown: "État des informations enregistrées\u00a0: UNKNOWN",
    cacheAbsent: "Aucune copie enregistrée n’a été trouvée.",
    cachePresent: "Une copie enregistrée a été observée.",
    loading: "Chargement…",
    ready: "Les résultats sont prêts.",
    empty: "Aucun résultat trouvé.",
    error: "Une erreur s’est produite.",
    retry: "Réessayer",
    search: "Rechercher",
    clear: "Effacer la recherche",
    back: "Retour",
    forward: "Suivant",
    close: "Fermer la fenêtre de dialogue",
    open: "Ouvrir les détails",
    unknown: UNKNOWN,
    source: "Source",
    licence: "Licence",
    retrievedOn: "Date de consultation",
    tier: "Niveau de preuve",
    focusMissing: "Focus du clavier\u00a0: UNKNOWN",
    focusHidden: "Le focus du clavier n’est pas visible.",
    focusTrapped: "Le focus du clavier ne peut pas quitter la zone actuelle.",
    smallTarget: "Une commande mesure moins de 44 sur 44 pixels.",
    export: "Exporter les renseignements",
    download: "Télécharger le rapport",
    review: "Examiner les constats",
    history: "L’historique a changé.",
    dismiss: "Fermer",
    routeMissing: "La page demandée n’a pas pu être ouverte.",
    evidenceMissing: "Métadonnées des sources\u00a0: UNKNOWN",
    privacy: "Cet examen n’envoie pas les données observées à un serveur.",
    noResults: "Aucun dossier correspondant.",
    requestFailed: "La demande n’a pas abouti.",
    requestPending: "La demande n’est pas terminée.",
    savedCopy: "Copie enregistrée",
    localOnly: "Observation locale seulement",
  },
};

export const FINDING_MESSAGES: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {
    "record-id-missing": "The record identifier is missing.",
    "record-id-duplicate": "A record identifier occurs more than once.",
    "record-source-unknown": "The record source is UNKNOWN.",
    "record-licence-unknown": "The record licence is UNKNOWN.",
    "record-date-unknown": "The retrieval date is UNKNOWN.",
    "record-tier-unknown": "The evidence tier is UNKNOWN.",
    "record-unsupported-known": "The record claims known status without complete evidence.",
    "provenance-changed": "The source metadata changed during the journey.",
    "record-lost": "A previous record is absent from the next screen.",
    "focus-hidden": "The focused control is hidden.",
    "focus-width": "The focused control is narrower than 44 pixels.",
    "focus-height": "The focused control is shorter than 44 pixels.",
    "dialog-focus-escaped": "Keyboard focus left the open dialog.",
    "announcement-language": "A status message uses the wrong document language.",
    "offline-ready-without-cache": "The screen claims readiness without observed saved content.",
    "replay-chain-broken": "A journey step does not follow its previous state.",
    "language-route-reset": "Changing language also changed the route.",
    "unknown-promoted": "UNKNOWN evidence was promoted without complete provenance.",
    "cache-entry-budget": "A saved resource exceeds the configured entry budget.",
    "cache-present-unmeasured": "A saved resource is reported without a byte measurement.",
  },
  fr: {
    "record-id-missing": "L’identifiant du dossier est absent.",
    "record-id-duplicate": "Un identifiant apparaît plusieurs fois.",
    "record-source-unknown": "La source du dossier est UNKNOWN.",
    "record-licence-unknown": "La licence du dossier est UNKNOWN.",
    "record-date-unknown": "La date de consultation est UNKNOWN.",
    "record-tier-unknown": "Le niveau de preuve est UNKNOWN.",
    "record-unsupported-known": "Le dossier affirme un état connu sans renseignements suffisants.",
    "provenance-changed": "Les renseignements sur la source ont changé durant le parcours.",
    "record-lost": "Un dossier précédent est absent de l’écran suivant.",
    "focus-hidden": "La commande ayant le focus est masquée.",
    "focus-width": "La commande ayant le focus mesure moins de 44 pixels en largeur.",
    "focus-height": "La commande ayant le focus mesure moins de 44 pixels en hauteur.",
    "dialog-focus-escaped": "Le focus du clavier a quitté la fenêtre ouverte.",
    "announcement-language": "Un message d’état utilise la mauvaise langue.",
    "offline-ready-without-cache": "L’écran annonce un résultat prêt sans copie enregistrée observée.",
    "replay-chain-broken": "Une étape du parcours ne suit pas l’état précédent.",
    "language-route-reset": "Le changement de langue a également changé la page.",
    "unknown-promoted": "Les données UNKNOWN ont changé d’état sans renseignements suffisants.",
    "cache-entry-budget": "Une ressource enregistrée dépasse la limite prévue.",
    "cache-present-unmeasured": "Une ressource enregistrée est annoncée sans mesure de taille.",
  },
};

export interface LocalizedDiagnostic {
  readonly code: string;
  readonly scope: string;
  readonly severity: string;
  readonly label: string;
  readonly detail: string;
}
export function localizedMessage(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key];
}
export function normalizeLanguage(input: string | null): Locale | null {
  if (input === null) return null;
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(input.trim());
  return match ? (match[1]?.toLowerCase() as Locale | undefined) ?? null : null;
}
export function frenchTypography(text: string): Finding[] {
  const problems: Finding[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const previous = i > 0 ? text[i - 1] : null;
    if (char === "'") problems.push(finding("fr-apostrophe", String(i), "Use U+2019"));
    if (char === ":" && i > 0 && previous !== "\u00a0") problems.push(finding("fr-colon-nbsp", String(i), "Use U+00A0"));
    if (char !== undefined && [";", "!", "?"].includes(char) && i > 0 && previous !== "\u202f") problems.push(finding("fr-thin-space", String(i), "Use U+202F"));
    if (char === "«" && text[i + 1] !== "\u202f") problems.push(finding("fr-left-quote", String(i), "Use U+202F"));
    if (char === "»" && previous !== "\u202f") problems.push(finding("fr-right-quote", String(i), "Use U+202F"));
  }
  return problems;
}
export function messageLibraryFindings(): Finding[] {
  const problems: Finding[] = [];
  const english = Object.keys(MESSAGES.en);
  const french = Object.keys(MESSAGES.fr);
  for (const key of english) {
    if (!french.includes(key)) problems.push(finding("locale-key-missing", key, "French translation absent"));
    const en = MESSAGES.en[key as MessageKey];
    const fr = MESSAGES.fr[key as MessageKey];
    if (!en.trim() || !fr.trim()) problems.push(finding("locale-text-empty", key, "Empty translation"));
    if (key !== "unknown" && en === fr && !["source", "licence"].includes(key)) problems.push(finding("locale-text-identical", key, "Check bilingual message", "warning"));
    problems.push(...frenchTypography(fr).map((item) => ({ ...item, scope: key })));
  }
  for (const key of french) {
    if (!english.includes(key)) problems.push(finding("locale-key-extra", key, "Unpaired translation"));
  }
  return problems;
}
export function diagnosticFor(locale: Locale, findingItem: Finding): LocalizedDiagnostic {
  return {
    code: findingItem.code,
    scope: findingItem.scope,
    severity: findingItem.severity,
    label: FINDING_MESSAGES[locale][findingItem.code] ?? UNKNOWN,
    detail: valueOrUnknown(findingItem.detail),
  };
}
export function diagnosticReport(locale: Locale, items: readonly Finding[], maximum = 25): string {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new RangeError("maximum must be positive");
  const rows = items.map((item) => diagnosticFor(locale, item));
  const selected = rows.slice(0, maximum).map((item) => `${item.severity} ${item.code}: ${item.label} [${item.scope}]`);
  const remaining = Math.max(0, rows.length - maximum);
  return [...selected, ...(remaining ? [`${remaining} ${locale === "en" ? "additional findings" : "constats supplémentaires"}`] : [])].join("\n");
}
export function accessibleNamePattern(locale: Locale, key: MessageKey): RegExp {
  const text = localizedMessage(locale, key);
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}
export function controlHasName(parts: readonly (string | null | undefined)[]): boolean {
  return parts.some((part) => part !== null && part !== undefined && part.trim() !== "");
}
export function hasBilingualCoverage(keys: readonly MessageKey[]): boolean {
  return keys.every((key) => Boolean(MESSAGES.en[key]?.trim()) && Boolean(MESSAGES.fr[key]?.trim()));
}
