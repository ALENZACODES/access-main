import type { Language } from "./regionDownload";
import type { ReadinessReason, ReadinessState, SuggestedStep } from "./readinessReview";

export const READINESS_COPY = {
  en: {
    title: "Offline readiness check",
    description: "Inspect saved copies on this device. This check does not describe physical accessibility.",
    open: "Open readiness check",
    close: "Close readiness check",
    refresh: "Read local copies again",
    busy: "Reading the device records…",
    unavailable: "This device's storage information is unavailable.",
    complete: "All listed cells have matching saved copies.",
    partial: "Some listed cells are not saved on this device.",
    unknownRegion: "The status of some offline cells is UNKNOWN.",
    saved: "Matching saved copies",
    unknown: "UNKNOWN cells",
    missing: "Not downloaded",
    stale: "Out of date",
    unreadable: "Unreadable local record",
    different: "Source or size differs from the listing",
    extra: "Not in the current listing",
    invalid: "Listing needs attention",
    present: "Matching saved copy",
    search: "Search cell ID, source or date",
    filter: "Show cells",
    all: "All listed and observed cells",
    onlySaved: "Matching saved copies",
    onlyUnknown: "UNKNOWN cells",
    download: "Missing or older copies",
    inspect: "Records needing inspection",
    sourceFilter: "Source differences",
    sort: "Sort cells",
    listed: "Listed order",
    byId: "Cell ID",
    smaller: "Smallest listed size",
    larger: "Largest listed size",
    previous: "Previous page",
    next: "Next page",
    noCells: "No matching cells.",
    source: "Source",
    licence: "Licence",
    date: "Data date",
    tier: "Evidence tier",
    size: "Listed bytes",
    observed: "Device record source",
    state: "Local state",
    advice: "Next step",
    noAction: "No additional step suggested.",
    retry: "Use the region download control to request the current copy.",
    investigate: "Inspect local data before relying on it offline.",
    compare: "Compare the listing with the saved source details.",
    quota: "Estimated free storage",
    needed: "Bytes not saved in the listing",
    reserve: "Reserved storage margin",
    enough: "The storage estimate suggests enough space. A write may still fail.",
    low: "The storage estimate suggests insufficient space.",
    noEstimate: "Storage estimate UNKNOWN. No storage capacity is assumed.",
    export: "Save readiness details as JSON",
    exportError: "The report could not be saved.",
    dataOnly: "This report contains metadata, not downloaded content.",
    unknownTier: "UNKNOWN",
    locationNotice: "Saved bytes are not evidence of accessibility at a location.",
    rowCount: "Matching cells",
  },
  fr: {
    title: "Examen de la disponibilité hors ligne",
    description: "Examinez les copies enregistrées sur cet appareil. Cet examen ne décrit pas l’accessibilité physique.",
    open: "Ouvrir l’examen hors ligne",
    close: "Fermer l’examen hors ligne",
    refresh: "Relire les copies locales",
    busy: "Lecture des enregistrements de l’appareil…",
    unavailable: "Les renseignements du stockage de cet appareil sont indisponibles.",
    complete: "Toutes les cellules répertoriées ont une copie enregistrée correspondante.",
    partial: "Certaines cellules répertoriées ne sont pas enregistrées sur cet appareil.",
    unknownRegion: "L’état de certaines cellules hors ligne est INCONNU.",
    saved: "Copies enregistrées correspondantes",
    unknown: "Cellules à état INCONNU",
    missing: "Non téléchargée",
    stale: "Copie périmée",
    unreadable: "Enregistrement local illisible",
    different: "La source ou la taille diffère de la liste",
    extra: "Absente de la liste actuelle",
    invalid: "La liste nécessite un examen",
    present: "Copie enregistrée correspondante",
    search: "Rechercher une cellule, une source ou une date",
    filter: "Afficher les cellules",
    all: "Toutes les cellules répertoriées et observées",
    onlySaved: "Copies enregistrées correspondantes",
    onlyUnknown: "Cellules à état INCONNU",
    download: "Copies manquantes ou anciennes",
    inspect: "Enregistrements à examiner",
    sourceFilter: "Différences de source",
    sort: "Trier les cellules",
    listed: "Ordre de la liste",
    byId: "Identifiant de cellule",
    smaller: "Plus petite taille indiquée",
    larger: "Plus grande taille indiquée",
    previous: "Page précédente",
    next: "Page suivante",
    noCells: "Aucune cellule correspondante.",
    source: "Source",
    licence: "Licence",
    date: "Date des données",
    tier: "Niveau de documentation",
    size: "Octets indiqués",
    observed: "Source de l’enregistrement de l’appareil",
    state: "État local",
    advice: "Prochaine étape",
    noAction: "Aucune autre étape suggérée.",
    retry: "Utilisez la commande de téléchargement de la région pour demander la copie actuelle.",
    investigate: "Examinez les données locales avant de les utiliser hors ligne.",
    compare: "Comparez la liste avec les renseignements sur la source enregistrée.",
    quota: "Espace libre estimé",
    needed: "Octets non enregistrés dans la liste",
    reserve: "Marge de stockage réservée",
    enough: "L’estimation suggère assez d’espace. Une écriture peut tout de même échouer.",
    low: "L’estimation suggère un espace insuffisant.",
    noEstimate: "Estimation du stockage INCONNUE. Aucune capacité n’est présumée.",
    export: "Enregistrer les détails en JSON",
    exportError: "Le rapport n’a pas pu être enregistré.",
    dataOnly: "Ce rapport contient des métadonnées et non le contenu téléchargé.",
    unknownTier: "INCONNU",
    locationNotice: "Les octets enregistrés ne constituent pas une preuve d’accessibilité d’un lieu.",
    rowCount: "Cellules correspondantes",
  },
} as const;

export type ReadinessCopyKey = keyof typeof READINESS_COPY.en;
export function readinessCopy(language: Language): Readonly<Record<ReadinessCopyKey, string>> {
  return READINESS_COPY[language];
}

export function readinessReasonText(reason: ReadinessReason, language: Language): string {
  const c = readinessCopy(language);
  switch (reason) {
    case "present": return c.present;
    case "not-downloaded": return c.missing;
    case "out-of-date": return c.stale;
    case "unreadable": return c.unreadable;
    case "mismatched-metadata": return c.different;
    case "unlisted": return c.extra;
    case "invalid-listing": return c.invalid;
  }
}

export function readinessActionText(step: SuggestedStep, language: Language): string {
  const c = readinessCopy(language);
  switch (step) {
    case "none": return c.noAction;
    case "download": return c.retry;
    case "inspect": return c.investigate;
    case "review-source": return c.compare;
  }
}

export function readinessStateText(state: ReadinessState, language: Language): string {
  return state === "saved" ? readinessCopy(language).present : readinessCopy(language).unknownTier;
}

/** Copy audit uses Unicode letters as boundaries, including accented French. */
export function auditReadinessCopy(): readonly string[] {
  const issues: string[] = [];
  const keys = new Set([...Object.keys(READINESS_COPY.en), ...Object.keys(READINESS_COPY.fr)]);
  for (const key of keys) {
    const en = (READINESS_COPY.en as Record<string, string>)[key];
    const fr = (READINESS_COPY.fr as Record<string, string>)[key];
    if (!en?.trim() || !fr?.trim()) issues.push(`missing:${key}`);
  }
  const disallowed = /(?<![\p{L}\p{N}])(?:verified|verify|verifier|vérifi\p{L}*|real-time|partnership|guarantee)(?![\p{L}\p{N}])/iu;
  for (const [language, strings] of Object.entries(READINESS_COPY)) {
    for (const [key, value] of Object.entries(strings)) {
      if (disallowed.test(value)) issues.push(`claim:${language}:${key}`);
      if (language === "fr") {
        if (value.includes("'")) issues.push(`apostrophe:${key}`);
        if (/(?<!\u00a0):/u.test(value)) issues.push(`colon:${key}`);
        if (/(?<!\u202f)[;!?]/u.test(value)) issues.push(`punctuation:${key}`);
      }
    }
  }
  return issues;
}
