import type { Language } from "./regionDownload";
import type { GuideAction, GuideFilter, GuideGate, GuideIssue, GuideOrder } from "./recoveryGuide";

/** English and French copy. UNKNOWN is intentionally language-invariant. */
export const RECOVERY_GUIDE_COPY = {
  en: {
    title: "Offline recovery guide",
    summary: "Check saved copies, source details and estimated storage before trying again.",
    open: "Show recovery guide", close: "Hide recovery guide",
    refresh: "Refresh recovery guide", checking: "Checking offline copies…",
    unavailable: "The local inventory is unavailable. Status UNKNOWN.",
    ready: "The listed copies can be considered for a manual retry.",
    blocked: "Estimated storage is insufficient. No retry has started.",
    unknown: "UNKNOWN",
    unknownGate: "Recovery readiness is UNKNOWN. Inspect the listed issues before acting.",
    source: "Source", licence: "Licence", date: "Source date", tier: "Evidence tier",
    size: "Listed size", state: "Offline copy", issue: "Reason", action: "Suggested next step",
    saved: "Saved copy matches the listing", unknownState: "UNKNOWN",
    listed: "Listed cells", savedCount: "Matching saved copies", unknownCount: "UNKNOWN copies",
    retryCount: "Eligible for manual retry", inspectCount: "Need inspection",
    reserve: "Reserved storage", free: "Estimated free storage", required: "Retry bytes",
    filter: "Filter cells", search: "Search ID or source", order: "Order cells",
    all: "All cells", onlySaved: "Saved", onlyUnknown: "UNKNOWN",
    retryFilter: "Eligible for retry", inspectFilter: "Need inspection", sourceFilter: "Source review",
    orderListed: "Listed order", orderId: "Cell ID", large: "Largest first",
    small: "Smallest first", byAction: "Suggested action",
    previous: "Previous page", next: "Next page", noMatches: "No matching cells.",
    select: "Select for manual retry", retry: "Download selected cells",
    exportText: "Save guide as text", exportJson: "Save guide as JSON",
    noSelection: "Choose eligible cells before continuing.",
    retryBlocked: "Unable to start this request. Review storage and source information.",
    requestStarted: "The download request was submitted. Check the updated offline status.",
    refreshError: "The recovery guide could not be refreshed.",
    exportError: "The local report could not be saved.",
    disclaimer: "Offline copy status does not describe physical accessibility. Storage estimates can change.",
    missing: "Not downloaded", stale: "Out-of-date copy", unreadable: "Local copy cannot be read",
    conflict: "Listing and device metadata differ", invalid: "Listing details are incomplete",
    noInventory: "Local inventory cannot be read", duplicate: "Repeated cell ID",
    unlisted: "Cell is not listed in this region", storageUnknown: "Storage estimate is UNKNOWN",
    storageLow: "Estimated storage is low", actionRetry: "Consider a manual retry",
    actionInspect: "Inspect local records", actionSource: "Review source details",
    actionFree: "Review available storage", actionNone: "No action suggested",
    priorityAttention: "Attention", priorityReview: "Review", priorityInformation: "Information",
    noIssue: "No issue found", position: "Page", bytesUnit: "B",
    notKnown: "UNKNOWN", downloadStatus: "Download results remain UNKNOWN until storage is checked.",
  },
  fr: {
    title: "Guide de récupération hors ligne",
    summary: "Examinez les copies enregistrées, les sources et le stockage estimé avant de réessayer.",
    open: "Afficher le guide de récupération", close: "Masquer le guide de récupération",
    refresh: "Actualiser le guide de récupération", checking: "Examen des copies hors ligne…",
    unavailable: "L’inventaire local est indisponible. État UNKNOWN.",
    ready: "Les copies répertoriées peuvent faire l’objet d’une nouvelle tentative manuelle.",
    blocked: "Le stockage estimé est insuffisant. Aucun téléchargement n’a commencé.",
    unknown: "UNKNOWN",
    unknownGate: "La préparation est UNKNOWN. Examinez les problèmes avant d’agir.",
    source: "Source", licence: "Licence", date: "Date de source", tier: "Niveau de preuve",
    size: "Taille indiquée", state: "Copie hors ligne", issue: "Raison", action: "Prochaine étape suggérée",
    saved: "La copie enregistrée correspond à la liste", unknownState: "UNKNOWN",
    listed: "Cellules répertoriées", savedCount: "Copies enregistrées correspondantes",
    unknownCount: "Copies à état UNKNOWN", retryCount: "Possibilité de réessayer manuellement",
    inspectCount: "À examiner", reserve: "Stockage réservé",
    free: "Stockage libre estimé", required: "Octets à télécharger",
    filter: "Filtrer les cellules", search: "Rechercher un identifiant ou une source",
    order: "Trier les cellules", all: "Toutes les cellules", onlySaved: "Enregistrées",
    onlyUnknown: "UNKNOWN", retryFilter: "Téléchargement possible",
    inspectFilter: "À examiner", sourceFilter: "Examen des sources",
    orderListed: "Ordre de la liste", orderId: "Identifiant", large: "Les plus grandes d’abord",
    small: "Les plus petites d’abord", byAction: "Action suggérée",
    previous: "Page précédente", next: "Page suivante", noMatches: "Aucune cellule correspondante.",
    select: "Sélectionner pour réessayer manuellement", retry: "Télécharger les cellules sélectionnées",
    exportText: "Enregistrer le guide en texte", exportJson: "Enregistrer le guide en JSON",
    noSelection: "Choisissez des cellules admissibles avant de continuer.",
    retryBlocked: "Impossible de commencer. Examinez le stockage et les sources.",
    requestStarted: "La demande de téléchargement a été envoyée. Examinez l’état hors ligne mis à jour.",
    refreshError: "Impossible d’actualiser le guide.",
    exportError: "Impossible d’enregistrer le rapport local.",
    disclaimer: "L’état des copies hors ligne ne décrit pas l’accessibilité physique. Le stockage estimé peut changer.",
    missing: "Non téléchargée", stale: "Copie périmée", unreadable: "Copie locale illisible",
    conflict: "La liste et l’appareil ont des renseignements différents",
    invalid: "La liste contient des renseignements incomplets",
    noInventory: "L’inventaire local est illisible", duplicate: "Identifiant répété",
    unlisted: "Cellule absente de la liste", storageUnknown: "Le stockage estimé est UNKNOWN",
    storageLow: "Le stockage estimé est insuffisant", actionRetry: "Envisager une nouvelle tentative manuelle",
    actionInspect: "Examiner les données locales", actionSource: "Examiner les sources",
    actionFree: "Examiner l’espace de stockage", actionNone: "Aucune action suggérée",
    priorityAttention: "Attention", priorityReview: "Examen", priorityInformation: "Information",
    noIssue: "Aucun problème signalé", position: "Page", bytesUnit: "o",
    notKnown: "UNKNOWN", downloadStatus: "Les résultats restent UNKNOWN jusqu’à la lecture du stockage.",
  },
} as const;

export type RecoveryCopyKey = keyof typeof RECOVERY_GUIDE_COPY.en;
export function recoveryGuideCopy(language: Language): Readonly<Record<RecoveryCopyKey, string>> {
  return RECOVERY_GUIDE_COPY[language];
}

export function recoveryIssueLabel(issue: GuideIssue | null, language: Language): string {
  const c = recoveryGuideCopy(language);
  switch (issue) {
    case "missing": return c.missing;
    case "stale": return c.stale;
    case "unreadable": return c.unreadable;
    case "metadata-conflict": return c.conflict;
    case "invalid-listing": return c.invalid;
    case "inventory-unavailable": return c.noInventory;
    case "duplicate": return c.duplicate;
    case "unlisted": return c.unlisted;
    case "storage-unknown": return c.storageUnknown;
    case "storage-low": return c.storageLow;
    default: return c.noIssue;
  }
}

export function recoveryActionLabel(action: GuideAction, language: Language): string {
  const c = recoveryGuideCopy(language);
  switch (action) {
    case "retry": return c.actionRetry;
    case "inspect": return c.actionInspect;
    case "review-source": return c.actionSource;
    case "free-space": return c.actionFree;
    default: return c.actionNone;
  }
}

export function recoveryGateLabel(gate: GuideGate, language: Language): string {
  const c = recoveryGuideCopy(language);
  return gate === "ready" ? c.ready : gate === "blocked" ? c.blocked : c.unknownGate;
}

export const RECOVERY_FILTERS: readonly GuideFilter[] = [
  "all", "saved", "unknown", "retry", "inspect", "source",
];
export const RECOVERY_ORDERS: readonly GuideOrder[] = [
  "listed", "id", "bytes-large", "bytes-small", "action",
];
export function recoveryFilterLabel(filter: GuideFilter, language: Language): string {
  const c = recoveryGuideCopy(language);
  switch (filter) {
    case "all": return c.all;
    case "saved": return c.onlySaved;
    case "unknown": return c.onlyUnknown;
    case "retry": return c.retryFilter;
    case "inspect": return c.inspectFilter;
    case "source": return c.sourceFilter;
  }
}
export function recoveryOrderLabel(order: GuideOrder, language: Language): string {
  const c = recoveryGuideCopy(language);
  switch (order) {
    case "listed": return c.orderListed;
    case "id": return c.orderId;
    case "bytes-large": return c.large;
    case "bytes-small": return c.small;
    case "action": return c.byAction;
  }
}
export function recoveryBytes(value: number | null, language: Language): string {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return "UNKNOWN";
  return `${value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA")} ${recoveryGuideCopy(language).bytesUnit}`;
}

/** Guard bilingual additions against disallowed copy and French punctuation. */
export function auditRecoveryGuideCopy(): readonly string[] {
  const errors: string[] = [];
  const en = RECOVERY_GUIDE_COPY.en;
  const fr = RECOVERY_GUIDE_COPY.fr;
  for (const key of new Set([...Object.keys(en), ...Object.keys(fr)])) {
    const english = (en as Record<string, string>)[key];
    const french = (fr as Record<string, string>)[key];
    if (!english?.trim() || !french?.trim()) errors.push(`missing:${key}`);
    if (french?.includes("'")) errors.push(`apostrophe:${key}`);
    if (french && /(?<!\u00a0):|(?<!\u202f)[;!?]/u.test(french)) errors.push(`punctuation:${key}`);
  }
  return errors;
}
