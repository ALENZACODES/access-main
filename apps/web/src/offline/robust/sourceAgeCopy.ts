import type { Language } from "./regionDownload";
import type { AgeBand, AgeIssue, CopyBand } from "./sourceAgeReview";

/** Source publication age must not become an assertion of site accessibility. */
export const SOURCE_AGE_COPY = {
  en: {
    title: "Offline source dates",
    intro: "Compare the dates of listed sources with today's date. Older data does not describe a place's accessibility.",
    show: "Review source dates",
    hide: "Hide source date review",
    refresh: "Refresh source date review",
    ageThreshold: "Age threshold in days",
    thresholdHelp: "Choose a review threshold from 1 to 3,650 days. This is not an expiry date.",
    today: "Review date",
    todayHelp: "Dates use the device's calendar day. They describe source metadata, not conditions at a place.",
    search: "Search cell ID, source, licence or date",
    filter: "Filter cells",
    sort: "Sort cells",
    all: "All listed cells",
    recent: "Within review threshold",
    older: "Beyond review threshold",
    future: "Source date is in the future",
    unknown: "UNKNOWN",
    unknownOnly: "Cells with UNKNOWN information",
    attention: "Cells needing attention",
    saved: "Saved copy matches listing",
    missing: "Not downloaded",
    stale: "Saved copy is out of date",
    unreadable: "Unable to read local copy",
    noRows: "No matching cells.",
    total: "Cells listed",
    available: "Matching saved copies",
    missingCount: "Missing copies",
    staleCount: "Out-of-date copies",
    unreadableCount: "Unreadable or UNKNOWN copies",
    recentCount: "Within threshold",
    olderCount: "Beyond threshold",
    futureCount: "Future dates",
    unknownCount: "UNKNOWN source dates",
    group: "Source groups",
    source: "Source",
    licence: "Licence",
    sourceDate: "Source date",
    age: "Days since source date",
    status: "Offline copy status",
    issue: "Review finding",
    tier: "Evidence tier",
    size: "Listed bytes",
    firstPage: "First page",
    previous: "Previous page",
    next: "Next page",
    lastPage: "Last page",
    page: "Page",
    orderManifest: "Listed order",
    orderOldest: "Oldest first",
    orderNewest: "Newest first",
    orderSource: "Source name",
    orderStatus: "Copy status",
    exportText: "Save text report",
    exportJson: "Save JSON report",
    exportFailed: "Unable to save this report.",
    checking: "Reading local source details…",
    error: "Local source details are unavailable. Status UNKNOWN.",
    ready: "Source date review is ready. A date is not a statement about accessibility.",
    caution: "Some source information is UNKNOWN. No missing information was filled in.",
    noAction: "No action suggested.",
    inspect: "Inspect the local record and listed source.",
    reviewSource: "Review the source date and licence before relying on the data.",
    disclaimer: "A matching offline copy is not evidence of physical accessibility. This review does not change downloaded content.",
    none: "None",
    year: "year",
    days: "days",
    invalidManifest: "Listing information is incomplete or inconsistent.",
    invalidDate: "The source date is not a valid calendar date.",
    invalidLicence: "The listed licence is not supported for redistribution.",
    futureDate: "The source date is later than the review date.",
    missingInventory: "The local inventory could not be read.",
    regionMismatch: "The inventory belongs to another region.",
    duplicateManifest: "The listing contains repeated cell IDs.",
    duplicateInventory: "The local inventory contains repeated cell IDs.",
    unlistedInventory: "The inventory contains a cell missing from the listing.",
    missingCopy: "This cell is not downloaded on the device.",
    staleCopy: "This saved copy does not match the latest listing.",
    unreadableCopy: "This local copy could not be read.",
    mismatch: "The local metadata differs from the listed source.",
  },
  fr: {
    title: "Dates des sources hors ligne",
    intro: "Comparez les dates des sources répertoriées à la date du jour. Des données anciennes ne décrivent pas l’accessibilité d’un lieu.",
    show: "Examiner les dates des sources",
    hide: "Masquer l’examen des dates",
    refresh: "Actualiser l’examen des dates",
    ageThreshold: "Seuil d’âge en jours",
    thresholdHelp: "Choisissez un seuil de 1 à 3 650 jours. Ce seuil n’est pas une date d’expiration.",
    today: "Date de l’examen",
    todayHelp: "Les dates suivent le calendrier de l’appareil. Elles décrivent la source, non les conditions d’un lieu.",
    search: "Rechercher une cellule, une source, une licence ou une date",
    filter: "Filtrer les cellules",
    sort: "Trier les cellules",
    all: "Toutes les cellules répertoriées",
    recent: "Dans le seuil d’examen",
    older: "Au-delà du seuil d’examen",
    future: "Date de source future",
    unknown: "UNKNOWN",
    unknownOnly: "Cellules avec des renseignements UNKNOWN",
    attention: "Cellules à examiner",
    saved: "La copie enregistrée correspond à la liste",
    missing: "Non téléchargée",
    stale: "Copie enregistrée périmée",
    unreadable: "Copie locale illisible",
    noRows: "Aucune cellule correspondante.",
    total: "Cellules répertoriées",
    available: "Copies enregistrées correspondantes",
    missingCount: "Copies manquantes",
    staleCount: "Copies périmées",
    unreadableCount: "Copies illisibles ou UNKNOWN",
    recentCount: "Dans le seuil",
    olderCount: "Au-delà du seuil",
    futureCount: "Dates futures",
    unknownCount: "Dates de source UNKNOWN",
    group: "Groupes de sources",
    source: "Source",
    licence: "Licence",
    sourceDate: "Date de source",
    age: "Jours depuis la date de source",
    status: "État de la copie hors ligne",
    issue: "Constat de l’examen",
    tier: "Niveau de preuve",
    size: "Octets répertoriés",
    firstPage: "Première page",
    previous: "Page précédente",
    next: "Page suivante",
    lastPage: "Dernière page",
    page: "Page",
    orderManifest: "Ordre de la liste",
    orderOldest: "Les plus anciennes d’abord",
    orderNewest: "Les plus récentes d’abord",
    orderSource: "Nom de source",
    orderStatus: "État de la copie",
    exportText: "Enregistrer le rapport texte",
    exportJson: "Enregistrer le rapport JSON",
    exportFailed: "Impossible d’enregistrer le rapport.",
    checking: "Lecture des sources locales…",
    error: "Les sources locales sont indisponibles. État UNKNOWN.",
    ready: "L’examen des dates est prêt. Une date n’indique pas l’accessibilité d’un lieu.",
    caution: "Certains renseignements sont UNKNOWN. Aucune donnée manquante n’a été supposée.",
    noAction: "Aucune action suggérée.",
    inspect: "Examinez le document local et la source répertoriée.",
    reviewSource: "Examinez la date et la licence de la source avant d’utiliser les données.",
    disclaimer: "Une copie hors ligne correspondante ne prouve pas l’accessibilité physique. Cet examen ne modifie pas le contenu téléchargé.",
    none: "Aucun",
    year: "année",
    days: "jours",
    invalidManifest: "Les renseignements de la liste sont incomplets ou contradictoires.",
    invalidDate: "La date de source n’est pas une date civile valide.",
    invalidLicence: "La licence répertoriée ne permet pas la redistribution prévue.",
    futureDate: "La date de source est postérieure à la date de l’examen.",
    missingInventory: "L’inventaire local est illisible.",
    regionMismatch: "L’inventaire appartient à une autre région.",
    duplicateManifest: "La liste contient des identifiants répétés.",
    duplicateInventory: "L’inventaire local contient des identifiants répétés.",
    unlistedInventory: "Une cellule de l’inventaire est absente de la liste.",
    missingCopy: "Cette cellule n’est pas téléchargée sur cet appareil.",
    staleCopy: "Cette copie ne correspond pas à la liste actuelle.",
    unreadableCopy: "Cette copie locale est illisible.",
    mismatch: "Les métadonnées locales diffèrent de la source répertoriée.",
  },
} as const;

export type SourceAgeCopyKey = keyof typeof SOURCE_AGE_COPY.en;

export function sourceAgeCopy(language: Language): Readonly<Record<SourceAgeCopyKey, string>> {
  return SOURCE_AGE_COPY[language];
}

export function ageBandText(value: AgeBand, language: Language): string {
  const c = sourceAgeCopy(language);
  switch (value) {
    case "recent": return c.recent;
    case "older": return c.older;
    case "future": return c.future;
    case "UNKNOWN": return c.unknown;
  }
}

export function copyBandText(value: CopyBand, language: Language): string {
  const c = sourceAgeCopy(language);
  switch (value) {
    case "saved": return c.saved;
    case "missing": return c.missing;
    case "stale": return c.stale;
    case "unreadable": return c.unreadable;
    case "UNKNOWN": return c.unknown;
  }
}

export function ageIssueText(value: AgeIssue, language: Language): string {
  const c = sourceAgeCopy(language);
  switch (value) {
    case "none": return c.none;
    case "missing-inventory": return c.missingInventory;
    case "region-mismatch": return c.regionMismatch;
    case "duplicate-manifest": return c.duplicateManifest;
    case "duplicate-inventory": return c.duplicateInventory;
    case "unlisted-inventory": return c.unlistedInventory;
    case "invalid-manifest": return c.invalidManifest;
    case "unsupported-licence": return c.invalidLicence;
    case "invalid-source-date": return c.invalidDate;
    case "future-source-date": return c.futureDate;
    case "stale-copy": return c.staleCopy;
    case "missing-copy": return c.missingCopy;
    case "unreadable-copy": return c.unreadableCopy;
    case "mismatched-copy": return c.mismatch;
  }
}

export function sourceAgeCopyFindings(): readonly string[] {
  const findings: string[] = [];
  const en: Record<string, string> = SOURCE_AGE_COPY.en;
  const fr: Record<string, string> = SOURCE_AGE_COPY.fr;
  for (const key of new Set([...Object.keys(en), ...Object.keys(fr)])) {
    if (!en[key]?.trim() || !fr[key]?.trim()) findings.push(`missing:${key}`);
  }
  if (SOURCE_AGE_COPY.fr.unknown !== "UNKNOWN" || SOURCE_AGE_COPY.en.unknown !== "UNKNOWN") {
    findings.push("unknown-token");
  }
  for (const [key, value] of Object.entries(fr)) {
    if (value.includes("'")) findings.push(`apostrophe:${key}`);
    if (/(?<!\u00a0):/u.test(value)) findings.push(`colon:${key}`);
    if (/(?<!\u202f)[;!?]/u.test(value)) findings.push(`punctuation:${key}`);
  }
  return findings;
}
