import type { Language } from "./regionDownload";
import type { DrillCause, DrillFilter, DrillScenario, DrillSort } from "./continuityDrill";

export const CONTINUITY_COPY = {
  en: {
    title: "Offline continuity drill",
    intro: "Explore hypothetical local storage changes. Nothing is downloaded, removed or changed.",
    privacy: "This drill stays on this device. It does not describe a place’s accessibility.",
    open: "Show continuity drill",
    close: "Hide continuity drill",
    run: "Run local drill",
    refresh: "Read current inventory again",
    result: "Hypothetical outcome",
    saved: "Matching saved cells",
    unknown: "UNKNOWN",
    before: "Before",
    after: "After",
    affected: "Affected cells",
    missing: "Not downloaded",
    stale: "Out of date",
    unreadable: "Unable to read local record",
    source: "Source",
    licence: "Licence",
    date: "Source date",
    tier: "Source tier",
    bytes: "Listed bytes",
    reason: "Reason",
    scenario: "Scenario",
    quantity: "Cells to affect",
    reduction: "Hypothetical capacity decrease, in bytes",
    reserve: "Reserved storage space, in bytes",
    quota: "Estimated free storage",
    projected: "Hypothetical free storage",
    unknownQuota: "Storage estimate is UNKNOWN.",
    search: "Search cell or source",
    filter: "Show",
    sort: "Sort",
    all: "All cells",
    onlySaved: "Saved after drill",
    onlyUnknown: "UNKNOWN after drill",
    onlyAffected: "Affected cells",
    onlyUnaffected: "Unaffected cells",
    listed: "Listed order",
    id: "Cell identifier",
    size: "Largest first",
    status: "Offline state",
    sourceSort: "Source name",
    previous: "Previous page",
    next: "Next page",
    exportText: "Save text report",
    exportJson: "Save JSON report",
    noRecords: "No matching cells.",
    unavailable: "Current local inventory is UNKNOWN.",
    incomplete: "This drill has UNKNOWN inputs. No positive conclusion is available.",
    complete: "All listed copies remain saved in this hypothetical scenario.",
    partial: "Some listed copies would not be available offline in this scenario.",
    note: "This is only a planning exercise. Browser storage may change independently.",
    error: "The drill could not be completed.",
    reportError: "The report could not be saved.",
    active: "Calculating local scenario…",
    baseline: "No simulated changes",
    evictLargest: "Simulate loss of largest saved copies",
    evictOldest: "Simulate loss of oldest saved copies",
    sourceChange: "Simulate changes to selected source records",
    quotaReduction: "Simulate reduced free storage",
    present: "Matching saved copy",
    unlisted: "Cell not listed",
    inventoryUnavailable: "Inventory unavailable",
    inventoryConflict: "Inventory details conflict",
    invalidManifest: "Listing contains invalid metadata",
    simulatedEviction: "Hypothetical loss of local copy",
    simulatedSourceChange: "Hypothetical change in source metadata",
    simulatedCapacity: "Hypothetical loss caused by reduced space",
    affectedCount: "Cells affected",
    listedCount: "Cells listed",
    unavailableCopy: "Current copy remains UNKNOWN",
    localOnly: "Metadata report only. No cell contents are included.",
    statusUnknown: "UNKNOWN",
    unsupported: "This device cannot estimate storage.",
    used: "This drill never modifies storage.",
    noChange: "No simulated change applies to this cell.",
    sourceDetail: "Exact source, licence and date are shown when listed.",
  },
  fr: {
    title: "Exercice de continuité hors ligne",
    intro: "Explorez des changements hypothétiques du stockage local. Aucun téléchargement, retrait ou changement n’est effectué.",
    privacy: "Cet exercice reste sur cet appareil. Il ne décrit pas l’accessibilité d’un lieu.",
    open: "Afficher l’exercice de continuité",
    close: "Masquer l’exercice de continuité",
    run: "Lancer l’exercice local",
    refresh: "Relire l’inventaire actuel",
    result: "Résultat hypothétique",
    saved: "Cellules enregistrées correspondantes",
    unknown: "UNKNOWN",
    before: "Avant",
    after: "Après",
    affected: "Cellules touchées",
    missing: "Non téléchargée",
    stale: "Périmée",
    unreadable: "Enregistrement local illisible",
    source: "Source",
    licence: "Licence",
    date: "Date de la source",
    tier: "Niveau de source",
    bytes: "Octets répertoriés",
    reason: "Raison",
    scenario: "Scénario",
    quantity: "Nombre de cellules touchées",
    reduction: "Diminution hypothétique de la capacité, en octets",
    reserve: "Espace de stockage réservé, en octets",
    quota: "Stockage libre estimé",
    projected: "Stockage libre hypothétique",
    unknownQuota: "L’estimation du stockage est UNKNOWN.",
    search: "Rechercher une cellule ou une source",
    filter: "Afficher",
    sort: "Trier",
    all: "Toutes les cellules",
    onlySaved: "Enregistrées après l’exercice",
    onlyUnknown: "UNKNOWN après l’exercice",
    onlyAffected: "Cellules touchées",
    onlyUnaffected: "Cellules non touchées",
    listed: "Ordre de la liste",
    id: "Identifiant de cellule",
    size: "Les plus grandes d’abord",
    status: "État hors ligne",
    sourceSort: "Nom de la source",
    previous: "Page précédente",
    next: "Page suivante",
    exportText: "Enregistrer le rapport texte",
    exportJson: "Enregistrer le rapport JSON",
    noRecords: "Aucune cellule correspondante.",
    unavailable: "L’inventaire local actuel est UNKNOWN.",
    incomplete: "Cet exercice comporte des données UNKNOWN. Aucune conclusion positive n’est possible.",
    complete: "Toutes les copies répertoriées restent enregistrées dans ce scénario hypothétique.",
    partial: "Certaines copies répertoriées ne seraient pas disponibles hors ligne dans ce scénario.",
    note: "Il s’agit uniquement d’un exercice de planification. Le stockage du navigateur peut changer indépendamment.",
    error: "Impossible de terminer l’exercice.",
    reportError: "Impossible d’enregistrer le rapport.",
    active: "Calcul du scénario local…",
    baseline: "Aucun changement simulé",
    evictLargest: "Simuler la perte des plus grandes copies enregistrées",
    evictOldest: "Simuler la perte des copies enregistrées les plus anciennes",
    sourceChange: "Simuler les changements des sources sélectionnées",
    quotaReduction: "Simuler une diminution du stockage libre",
    present: "Copie enregistrée correspondante",
    unlisted: "Cellule non répertoriée",
    inventoryUnavailable: "Inventaire indisponible",
    inventoryConflict: "Renseignements d’inventaire contradictoires",
    invalidManifest: "La liste contient des métadonnées invalides",
    simulatedEviction: "Perte hypothétique de la copie locale",
    simulatedSourceChange: "Changement hypothétique des métadonnées de source",
    simulatedCapacity: "Perte hypothétique causée par une baisse d’espace",
    affectedCount: "Cellules touchées",
    listedCount: "Cellules répertoriées",
    unavailableCopy: "La copie actuelle reste UNKNOWN",
    localOnly: "Rapport de métadonnées uniquement. Aucun contenu de cellule n’est inclus.",
    statusUnknown: "UNKNOWN",
    unsupported: "Cet appareil ne peut pas estimer le stockage.",
    used: "Cet exercice ne modifie jamais le stockage.",
    noChange: "Aucun changement simulé ne concerne cette cellule.",
    sourceDetail: "La source, la licence et la date exactes figurent dans la liste lorsqu’elles sont indiquées.",
  },
} as const;
export type ContinuityCopy = Readonly<Record<keyof typeof CONTINUITY_COPY.en, string>>;
export function continuityCopy(language: Language): ContinuityCopy {
  return CONTINUITY_COPY[language];
}
export const DRILL_SCENARIOS: readonly DrillScenario[] = [
  "baseline", "evict-largest", "evict-oldest", "source-change", "quota-reduction",
];
export const DRILL_FILTERS: readonly DrillFilter[] = ["all", "saved", "UNKNOWN", "affected", "unaffected"];
export const DRILL_SORTS: readonly DrillSort[] = ["listed", "id", "bytes-desc", "status", "source"];
export function continuityScenarioLabel(scenario: DrillScenario, language: Language): string {
  const c = continuityCopy(language);
  switch (scenario) {
    case "baseline": return c.baseline;
    case "evict-largest": return c.evictLargest;
    case "evict-oldest": return c.evictOldest;
    case "source-change": return c.sourceChange;
    case "quota-reduction": return c.quotaReduction;
  }
}
export function continuityFilterLabel(filter: DrillFilter, language: Language): string {
  const c = continuityCopy(language);
  switch (filter) {
    case "all": return c.all;
    case "saved": return c.onlySaved;
    case "UNKNOWN": return c.onlyUnknown;
    case "affected": return c.onlyAffected;
    case "unaffected": return c.onlyUnaffected;
  }
}
export function continuitySortLabel(sort: DrillSort, language: Language): string {
  const c = continuityCopy(language);
  switch (sort) {
    case "listed": return c.listed;
    case "id": return c.id;
    case "bytes-desc": return c.size;
    case "status": return c.status;
    case "source": return c.sourceSort;
  }
}
export function continuityReasonLabel(reason: DrillCause, language: Language): string {
  const c = continuityCopy(language);
  switch (reason) {
    case "present": return c.present;
    case "missing": return c.missing;
    case "stale": return c.stale;
    case "unreadable": return c.unreadable;
    case "unlisted": return c.unlisted;
    case "inventory-unavailable": return c.inventoryUnavailable;
    case "inventory-conflict": return c.inventoryConflict;
    case "invalid-manifest": return c.invalidManifest;
    case "simulated-eviction": return c.simulatedEviction;
    case "simulated-source-change": return c.simulatedSourceChange;
    case "simulated-capacity": return c.simulatedCapacity;
  }
}
export function continuityFormatBytes(bytes: number | null, language: Language): string {
  if (bytes === null || !Number.isSafeInteger(bytes) || bytes < 0) return "UNKNOWN";
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(bytes)} B`;
}
/** Fails on missing translations and unsafe punctuation. */
export function auditContinuityCopy(): readonly string[] {
  const errors: string[] = [];
  const en: Record<string, string> = CONTINUITY_COPY.en;
  const fr: Record<string, string> = CONTINUITY_COPY.fr;
  for (const key of new Set([...Object.keys(en), ...Object.keys(fr)])) {
    if (!en[key]?.trim() || !fr[key]?.trim()) errors.push(`missing-language:${key}`);
  }
  for (const [key, text] of Object.entries(fr)) {
    if (text.includes("'")) errors.push(`apostrophe:${key}`);
    if (/(?<!\u00a0):/u.test(text)) errors.push(`colon:${key}`);
    if (/(?<!\u202f)[;!?]/u.test(text)) errors.push(`punctuation:${key}`);
    if (text.includes("INCONNU")) errors.push(`wrong-unknown-token:${key}`);
  }
  return errors;
}
