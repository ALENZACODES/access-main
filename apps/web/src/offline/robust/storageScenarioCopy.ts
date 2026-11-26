import type { Language } from "./regionDownload.ts";
import type { CandidateReason, ScenarioStatus, CellDisposition, BlockReason } from "./storageScenario.ts";

/** Keep all display text inside this bilingual catalogue. */
export const STORAGE_SCENARIO_COPY = {
  en: {
    title: "Storage planning scenarios",
    intro: "Explore a storage estimate before choosing which offline cells to download. This tool does not change saved files.",
    privacy: "This plan stays on your device. It describes saved data, not the accessibility of places.",
    open: "Show storage planning",
    close: "Hide storage planning",
    update: "Refresh storage estimate",
    working: "Reading local storage…",
    error: "Storage information could not be read.",
    unknown: "UNKNOWN",
    available: "Estimated space may be sufficient. A download can still fail.",
    insufficient: "The selected margin leaves insufficient estimated space.",
    uncertain: "The available storage or some cell information is UNKNOWN.",
    blocked: "This proposal is unavailable because the listing or local inventory is inconsistent.",
    noInventory: "Local inventory is unavailable.",
    reserve: "Keep free space (MiB)",
    overhead: "Additional cost per cell (KiB)",
    batchSize: "Cells in each group",
    search: "Find a cell, source or licence",
    filter: "Show cells",
    sort: "Sort cells",
    all: "All cells",
    candidate: "Download candidates",
    saved: "Saved locally",
    blockedCells: "Blocked cells",
    unknownCells: "UNKNOWN cells",
    listed: "Listed order",
    byId: "Cell identifier",
    largest: "Largest first",
    smallest: "Smallest first",
    reason: "Reason",
    source: "Source",
    licence: "Licence",
    date: "Source date",
    tier: "Source tier",
    size: "Listed bytes",
    planned: "Estimated download bytes",
    savedCount: "Saved cells",
    candidateCount: "Candidates",
    unknownCount: "UNKNOWN cells",
    freeSpace: "Estimated free storage",
    reserveSpace: "Protected storage margin",
    totalCost: "Estimated batch cost",
    groupCount: "Suggested groups",
    group: "Group",
    groupBytes: "Estimated group bytes",
    afterGroup: "Estimated space after group",
    first: "First page",
    previous: "Previous page",
    next: "Next page",
    last: "Last page",
    page: "Page",
    noCells: "No matching cells.",
    exportText: "Save plan as text",
    exportJson: "Save plan as JSON",
    exportError: "Unable to save the plan.",
    advisory: "Storage measurements and overhead are estimates. They do not reserve space or assert that a download will finish.",
    current: "Current scenario",
    smallMargin: "Smaller margin",
    largeMargin: "Larger margin",
    compare: "Compare margins",
    scenario: "Scenario",
    perSource: "Source groups",
    onlyWhenReady: "A proposal does not download or delete any files.",
    recordDetails: "This cell has declared source, licence and date. Its source tier is UNKNOWN unless supplied separately.",
    unknownCell: "A missing or unreadable device record is not treated as saved.",
    estimated: "Estimated",
    save: "Saved",
    missing: "Not downloaded",
    stale: "Out of date",
    unreadable: "Unable to read local record",
    notInspected: "Cell was not inspected",
    conflict: "Listing and local record differ",
    duplicate: "Cell appears more than once",
    invalid: "Invalid listed data",
    unlisted: "Not in this region listing",
    manifestInvalid: "The region listing is invalid.",
    inventoryUnavailable: "The local inventory is unavailable.",
    inventoryRegionMismatch: "The inventory belongs to another region.",
    duplicateInventory: "The inventory contains duplicate cells.",
    unlistedInventory: "The inventory contains unlisted cells.",
    inventoryInconsistent: "Inventory totals are inconsistent.",
  },
  fr: {
    title: "Scénarios de planification du stockage",
    intro: "Examinez une estimation du stockage avant de choisir les cellules hors ligne à télécharger. Cet outil ne modifie pas les fichiers enregistrés.",
    privacy: "Ce plan reste sur votre appareil. Il décrit des données enregistrées, et non l’accessibilité des lieux.",
    open: "Afficher la planification du stockage",
    close: "Masquer la planification du stockage",
    update: "Actualiser l’estimation du stockage",
    working: "Lecture du stockage local…",
    error: "Impossible de lire les renseignements sur le stockage.",
    unknown: "UNKNOWN",
    available: "L’espace estimé pourrait être suffisant. Le téléchargement peut tout de même échouer.",
    insufficient: "La marge choisie laisse un espace estimé insuffisant.",
    uncertain: "L’espace disponible ou certains renseignements sur les cellules sont UNKNOWN.",
    blocked: "Cette proposition est indisponible, car la liste ou l’inventaire local est incohérent.",
    noInventory: "L’inventaire local est indisponible.",
    reserve: "Conserver de l’espace libre (Mio)",
    overhead: "Coût supplémentaire par cellule (Kio)",
    batchSize: "Cellules par groupe",
    search: "Rechercher une cellule, une source ou une licence",
    filter: "Afficher les cellules",
    sort: "Trier les cellules",
    all: "Toutes les cellules",
    candidate: "Cellules à télécharger",
    saved: "Enregistrées localement",
    blockedCells: "Cellules bloquées",
    unknownCells: "Cellules UNKNOWN",
    listed: "Ordre de la liste",
    byId: "Identifiant de cellule",
    largest: "Les plus grandes d’abord",
    smallest: "Les plus petites d’abord",
    reason: "Motif",
    source: "Source",
    licence: "Licence",
    date: "Date de la source",
    tier: "Niveau de source",
    size: "Octets indiqués",
    planned: "Octets estimés à télécharger",
    savedCount: "Cellules enregistrées",
    candidateCount: "Cellules proposées",
    unknownCount: "Cellules UNKNOWN",
    freeSpace: "Stockage libre estimé",
    reserveSpace: "Marge de stockage protégée",
    totalCost: "Coût estimé des groupes",
    groupCount: "Groupes proposés",
    group: "Groupe",
    groupBytes: "Octets estimés du groupe",
    afterGroup: "Espace estimé après le groupe",
    first: "Première page",
    previous: "Page précédente",
    next: "Page suivante",
    last: "Dernière page",
    page: "Page",
    noCells: "Aucune cellule correspondante.",
    exportText: "Enregistrer le plan en texte",
    exportJson: "Enregistrer le plan en JSON",
    exportError: "Impossible d’enregistrer le plan.",
    advisory: "Les mesures du stockage et les coûts supplémentaires sont des estimations. Ils ne réservent pas d’espace et n’assurent pas la fin du téléchargement.",
    current: "Scénario actuel",
    smallMargin: "Marge plus petite",
    largeMargin: "Marge plus grande",
    compare: "Comparer les marges",
    scenario: "Scénario",
    perSource: "Groupes de sources",
    onlyWhenReady: "Une proposition ne télécharge ni ne supprime de fichiers.",
    recordDetails: "Cette cellule présente une source, une licence et une date déclarées. Son niveau de source reste UNKNOWN s’il n’est pas fourni séparément.",
    unknownCell: "Un enregistrement absent ou illisible n’est pas considéré comme enregistré.",
    estimated: "Estimé",
    save: "Enregistrée",
    missing: "Non téléchargée",
    stale: "Périmée",
    unreadable: "Enregistrement local illisible",
    notInspected: "Cellule non examinée",
    conflict: "La liste et l’enregistrement local diffèrent",
    duplicate: "Cellule présente plusieurs fois",
    invalid: "Données de liste invalides",
    unlisted: "Absente de la liste régionale",
    manifestInvalid: "La liste de la région est invalide.",
    inventoryUnavailable: "L’inventaire local est indisponible.",
    inventoryRegionMismatch: "L’inventaire concerne une autre région.",
    duplicateInventory: "L’inventaire contient des cellules en double.",
    unlistedInventory: "L’inventaire contient des cellules non répertoriées.",
    inventoryInconsistent: "Les totaux de l’inventaire sont incohérents.",
  },
} as const;

export type StorageScenarioCopy = (typeof STORAGE_SCENARIO_COPY)["en"];
export const scenarioCopy = (language: Language): Readonly<Record<keyof StorageScenarioCopy, string>> =>
  STORAGE_SCENARIO_COPY[language];

export function dispositionText(value: CellDisposition, language: Language): string {
  const c = scenarioCopy(language);
  switch (value) {
    case "saved": return c.saved;
    case "candidate": return c.candidate;
    case "blocked": return c.blockedCells;
    case "UNKNOWN": return c.unknown;
  }
}

export function candidateReasonText(value: CandidateReason, language: Language): string {
  const c = scenarioCopy(language);
  switch (value) {
    case "saved": return c.save;
    case "missing": return c.missing;
    case "stale": return c.stale;
    case "unreadable": return c.unreadable;
    case "not-inspected": return c.notInspected;
    case "metadata-conflict": return c.conflict;
    case "duplicate": return c.duplicate;
    case "invalid-listing": return c.invalid;
    case "unlisted": return c.unlisted;
  }
}

export function scenarioStatusText(value: ScenarioStatus, language: Language): string {
  const c = scenarioCopy(language);
  return value === "possible" ? c.available : value === "insufficient" ? c.insufficient : c.uncertain;
}

export function scenarioBlockText(value: BlockReason, language: Language): string {
  const c = scenarioCopy(language);
  switch (value) {
    case "manifest-invalid": return c.manifestInvalid;
    case "inventory-unavailable": return c.inventoryUnavailable;
    case "inventory-region-mismatch": return c.inventoryRegionMismatch;
    case "duplicate-inventory": return c.duplicateInventory;
    case "unlisted-inventory": return c.unlistedInventory;
    case "inventory-inconsistent": return c.inventoryInconsistent;
  }
}

/** Missing translations or disallowed wording fail a regression test. */
export function auditStorageScenarioCopy(): readonly string[] {
  const problems: string[] = [];
  const en = STORAGE_SCENARIO_COPY.en;
  const fr = STORAGE_SCENARIO_COPY.fr;
  const keys = new Set([...Object.keys(en), ...Object.keys(fr)]);
  for (const key of keys) {
    const left = (en as Record<string, string>)[key];
    const right = (fr as Record<string, string>)[key];
    if (!left?.trim() || !right?.trim()) problems.push(`translation:${key}`);
  }
  for (const [language, entries] of Object.entries(STORAGE_SCENARIO_COPY)) {
    for (const [key, value] of Object.entries(entries)) {
      if (/(?<![\p{L}\p{N}])(?:verified|verify|vérifi\p{L}*|real-time|partnership|guarantee)(?![\p{L}\p{N}])/iu.test(value)) {
        problems.push(`claim:${language}:${key}`);
      }
      if (language === "fr") {
        if (value.includes("'")) problems.push(`apostrophe:${key}`);
        if (/(?<!\u00a0):/u.test(value)) problems.push(`colon:${key}`);
        if (/(?<!\u202f)[;!?]/u.test(value)) problems.push(`punctuation:${key}`);
        if (/\bINCONNU\b/u.test(value)) problems.push(`token:${key}`);
      }
    }
  }
  return problems;
}
