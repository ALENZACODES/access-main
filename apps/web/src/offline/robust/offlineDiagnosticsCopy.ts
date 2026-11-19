import type { Language } from "./regionDownload";
import type { DiagnosticAction, DiagnosticReason } from "./offlineDiagnostics";

export const DIAGNOSTIC_COPY = {
  en: {
    title: "Offline copy diagnostics",
    intro: "Review local copies against the current region listing. This does not describe physical accessibility.",
    refresh: "Read device copies again",
    inspect: "Show offline diagnostics",
    hide: "Hide offline diagnostics",
    search: "Search cells and sources",
    filter: "Filter cells",
    order: "Sort cells",
    all: "All cells",
    savedOnly: "Saved cells",
    unknownOnly: "UNKNOWN cells",
    downloadOnly: "Needs download",
    inspectOnly: "Needs inspection",
    listed: "Listed order",
    id: "Cell ID",
    large: "Largest first",
    small: "Smallest first",
    byReason: "Reason",
    saved: "Matching saved copy",
    unknown: "UNKNOWN",
    region: "Region status",
    count: "Cells shown",
    total: "Listed cells",
    savedCount: "Saved cells",
    unknownCount: "UNKNOWN cells",
    free: "Estimated free space",
    source: "Source",
    licence: "Licence",
    date: "Source date",
    tier: "Documentation tier",
    size: "Listed bytes",
    observed: "Device source",
    reason: "Local finding",
    action: "Suggested next step",
    noAction: "No action suggested",
    reDownload: "Use the region download control",
    inspectCell: "Inspect the local record",
    reviewSource: "Review source details before retrying",
    missing: "Not downloaded",
    stale: "Out-of-date copy",
    unreadable: "Local record cannot be read",
    notInspected: "No local cell observation",
    metadataConflict: "Listing and device record differ",
    unlisted: "Not listed in this region",
    duplicate: "Repeated identifier in local inventory",
    invalidListing: "Invalid listing metadata",
    inventoryUnavailable: "Region inventory unavailable",
    complete: "All listed copies match this device's inventory.",
    partial: "Only part of this region is available offline.",
    uncertain: "Some cell states remain UNKNOWN.",
    absent: "No cells match the current search.",
    previous: "Previous page",
    next: "Next page",
    page: "Page",
    export: "Save local diagnostics as JSON",
    exportFailed: "Unable to save this report.",
    storageUnknown: "UNKNOWN",
    advisory: "Browser space figures are estimates. Copy status never establishes a place's accessibility.",
  },
  fr: {
    title: "Diagnostic des copies hors ligne",
    intro: "Comparez les copies locales avec la liste actuelle de la région. Cela ne décrit pas l’accessibilité physique.",
    refresh: "Relire les copies de l’appareil",
    inspect: "Afficher le diagnostic hors ligne",
    hide: "Masquer le diagnostic hors ligne",
    search: "Rechercher des cellules et des sources",
    filter: "Filtrer les cellules",
    order: "Trier les cellules",
    all: "Toutes les cellules",
    savedOnly: "Cellules enregistrées",
    unknownOnly: "Cellules UNKNOWN",
    downloadOnly: "Téléchargement nécessaire",
    inspectOnly: "Examen nécessaire",
    listed: "Ordre de la liste",
    id: "Identifiant de cellule",
    large: "Les plus grandes d’abord",
    small: "Les plus petites d’abord",
    byReason: "Motif",
    saved: "Copie enregistrée correspondante",
    unknown: "UNKNOWN",
    region: "État de la région",
    count: "Cellules affichées",
    total: "Cellules répertoriées",
    savedCount: "Cellules enregistrées",
    unknownCount: "Cellules UNKNOWN",
    free: "Espace libre estimé",
    source: "Source",
    licence: "Licence",
    date: "Date de la source",
    tier: "Niveau de documentation",
    size: "Octets répertoriés",
    observed: "Source de l’appareil",
    reason: "Constat local",
    action: "Prochaine étape suggérée",
    noAction: "Aucune action suggérée",
    reDownload: "Utiliser la commande de téléchargement de la région",
    inspectCell: "Examiner l’enregistrement local",
    reviewSource: "Examiner la source avant de réessayer",
    missing: "Non téléchargée",
    stale: "Copie périmée",
    unreadable: "Enregistrement local illisible",
    notInspected: "Aucune observation locale de cellule",
    metadataConflict: "La liste et l’enregistrement diffèrent",
    unlisted: "Absente de la liste de la région",
    duplicate: "Identifiant répété dans l’inventaire local",
    invalidListing: "Métadonnées de la liste invalides",
    inventoryUnavailable: "Inventaire de la région indisponible",
    complete: "Toutes les copies répertoriées correspondent à l’inventaire de cet appareil.",
    partial: "Seule une partie de cette région est disponible hors ligne.",
    uncertain: "Certains états de cellules restent UNKNOWN.",
    absent: "Aucune cellule ne correspond à cette recherche.",
    previous: "Page précédente",
    next: "Page suivante",
    page: "Page",
    export: "Enregistrer le diagnostic local en JSON",
    exportFailed: "Impossible d’enregistrer ce rapport.",
    storageUnknown: "UNKNOWN",
    advisory: "Les chiffres de stockage sont des estimations. L’état d’une copie n’établit pas l’accessibilité d’un lieu.",
  },
} as const;

export type DiagnosticCopyKey = keyof typeof DIAGNOSTIC_COPY.en;

export function diagnosticCopy(language: Language): Readonly<Record<DiagnosticCopyKey, string>> {
  return DIAGNOSTIC_COPY[language];
}

export function diagnosticReasonText(reason: DiagnosticReason, language: Language): string {
  const c = diagnosticCopy(language);
  switch (reason) {
    case "saved": return c.saved;
    case "missing": return c.missing;
    case "stale": return c.stale;
    case "unreadable": return c.unreadable;
    case "not-inspected": return c.notInspected;
    case "metadata-conflict": return c.metadataConflict;
    case "unlisted": return c.unlisted;
    case "duplicate": return c.duplicate;
    case "invalid-listing": return c.invalidListing;
    case "inventory-unavailable": return c.inventoryUnavailable;
  }
}

export function diagnosticActionText(action: DiagnosticAction, language: Language): string {
  const c = diagnosticCopy(language);
  switch (action) {
    case "none": return c.noAction;
    case "download": return c.reDownload;
    case "inspect": return c.inspectCell;
    case "review-source": return c.reviewSource;
  }
}

export function diagnosticCopyFindings(): readonly string[] {
  const failures: string[] = [];
  const en = DIAGNOSTIC_COPY.en as Record<string, string>;
  const fr = DIAGNOSTIC_COPY.fr as Record<string, string>;
  for (const key of new Set([...Object.keys(en), ...Object.keys(fr)])) {
    if (!en[key]?.trim() || !fr[key]?.trim()) failures.push(`missing:${key}`);
  }
  for (const [key, value] of Object.entries(fr)) {
    if (value.includes("'")) failures.push(`apostrophe:${key}`);
    if (/(?<!\u00a0):/u.test(value)) failures.push(`colon:${key}`);
    if (/(?<!\u202f)[;!?]/u.test(value)) failures.push(`punctuation:${key}`);
  }
  return failures;
}
