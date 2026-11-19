import type { Language } from "./regionDownload";
import type { BudgetState, RecoveryReason, RecoveryState } from "./recoveryBatches";

/** Exact status token UNKNOWN is language-independent. */
export const RECOVERY_COPY = {
  en: {
    title: "Offline recovery batches",
    intro: "Plan smaller manual downloads using the device's saved-cell list and an estimated storage budget.",
    privacy: "This plan stays on this device and contains only metadata. It does not describe physical accessibility.",
    unknown: "UNKNOWN",
    open: "Show recovery batches",
    close: "Hide recovery batches",
    refresh: "Read storage estimate",
    refreshInventory: "Refresh saved-cell list",
    unavailable: "Recovery information is UNKNOWN.",
    noInventory: "The device's cell list is unavailable. No retry batch can be offered.",
    invalid: "The listing needs attention. No batch can be started.",
    noAction: "No cells need a download in the current list.",
    ready: "Recovery batches can be reviewed before downloading.",
    quotaUnknown: "Available space is UNKNOWN. Retry batches are not enabled.",
    quotaLow: "Estimated space is insufficient for every proposed batch.",
    quotaFits: "Estimated space may fit the listed batches. Storage can still change.",
    search: "Search cell ID, source, licence or date",
    filter: "Show cells",
    order: "Sort cells",
    all: "All listed cells",
    needsDownload: "Download candidates",
    inspect: "Needs inspection",
    saved: "Matching saved copies",
    sortManifest: "Listed order",
    sortId: "Cell ID",
    sortLargest: "Largest first",
    sortSmallest: "Smallest first",
    sortReason: "Reason",
    previous: "Previous page",
    next: "Next page",
    noMatch: "No matching cells.",
    regionStatus: "Region status",
    candidateCount: "Download candidates",
    blockedCount: "Needs inspection",
    savedCount: "Matching saved cells",
    missingCount: "Not downloaded",
    staleCount: "Out-of-date copies",
    unknownCount: "UNKNOWN cells",
    batchCount: "Recovery batches",
    estimatedFree: "Estimated free storage",
    reserved: "Reserved space",
    suggested: "Estimated batch bytes",
    listedSize: "Listed bytes",
    source: "Source",
    licence: "Licence",
    date: "Data date",
    tier: "Source tier",
    action: "Suggested action",
    reason: "Current device finding",
    reasonMissing: "Not downloaded",
    reasonStale: "Out of date",
    reasonUnreadable: "Local record unreadable",
    reasonConflict: "Metadata differs",
    reasonInvalid: "Listing is inconsistent",
    reasonInventory: "Local inventory unavailable",
    reasonNotInspected: "Cell not inspected",
    reasonDuplicate: "Duplicate cell",
    reasonUnlisted: "Cell not listed",
    reasonSaved: "Matching copy saved",
    actionDownload: "Candidate for manual download",
    actionInspect: "Inspect before retrying",
    actionNone: "No action suggested",
    batch: "Batch",
    batchFits: "Estimated space may fit",
    batchLow: "Not enough estimated space",
    batchUnknown: "Estimated space UNKNOWN",
    retry: "Download this batch",
    locked: "This batch cannot start until the storage estimate and inventory allow it.",
    running: "Downloading the selected cells…",
    done: "Batch request finished. Recheck the saved-cell list for the result.",
    stopped: "The batch could not start. Recheck the saved-cell list.",
    refreshBefore: "The saved-cell list changed. Review the plan again before retrying.",
    exportText: "Save plan as text",
    exportJson: "Save plan as JSON",
    exportError: "Could not save the plan.",
    notes: "Planning notes",
    emptyNotes: "No listing inconsistencies reported.",
    page: "Cell page",
    count: "Listed cells",
    counts: "Count",
    disclaimer: "A storage estimate is not a promise that a download will work. The user starts every batch.",
  },
  fr: {
    title: "Lots de récupération hors ligne",
    intro: "Planifiez de petits téléchargements manuels à partir des cellules enregistrées et d’une estimation du stockage.",
    privacy: "Ce plan reste sur cet appareil et contient seulement des métadonnées. Il ne décrit pas l’accessibilité physique.",
    unknown: "UNKNOWN",
    open: "Afficher les lots de récupération",
    close: "Masquer les lots de récupération",
    refresh: "Lire l’estimation du stockage",
    refreshInventory: "Actualiser la liste des cellules enregistrées",
    unavailable: "Les renseignements de récupération sont UNKNOWN.",
    noInventory: "La liste des cellules de l’appareil est indisponible. Aucun lot ne peut être proposé.",
    invalid: "La liste nécessite une inspection. Aucun lot ne peut commencer.",
    noAction: "Aucune cellule de la liste actuelle ne nécessite un téléchargement.",
    ready: "Examinez les lots de récupération avant de les télécharger.",
    quotaUnknown: "L’espace disponible est UNKNOWN. Les lots ne sont pas activés.",
    quotaLow: "L’espace estimé est insuffisant pour tous les lots proposés.",
    quotaFits: "L’espace estimé pourrait suffire. Le stockage peut changer.",
    search: "Rechercher une cellule, une source, une licence ou une date",
    filter: "Afficher les cellules",
    order: "Trier les cellules",
    all: "Toutes les cellules répertoriées",
    needsDownload: "Cellules à télécharger",
    inspect: "À examiner",
    saved: "Copies enregistrées correspondantes",
    sortManifest: "Ordre de la liste",
    sortId: "Identifiant de cellule",
    sortLargest: "Les plus grandes d’abord",
    sortSmallest: "Les plus petites d’abord",
    sortReason: "Raison",
    previous: "Page précédente",
    next: "Page suivante",
    noMatch: "Aucune cellule correspondante.",
    regionStatus: "État de la région",
    candidateCount: "Cellules à télécharger",
    blockedCount: "À examiner",
    savedCount: "Cellules enregistrées correspondantes",
    missingCount: "Non téléchargées",
    staleCount: "Copies périmées",
    unknownCount: "Cellules UNKNOWN",
    batchCount: "Lots de récupération",
    estimatedFree: "Stockage libre estimé",
    reserved: "Espace réservé",
    suggested: "Octets estimés des lots",
    listedSize: "Octets répertoriés",
    source: "Source",
    licence: "Licence",
    date: "Date des données",
    tier: "Niveau de source",
    action: "Action suggérée",
    reason: "Constat sur cet appareil",
    reasonMissing: "Non téléchargée",
    reasonStale: "Périmée",
    reasonUnreadable: "Enregistrement local illisible",
    reasonConflict: "Métadonnées différentes",
    reasonInvalid: "Liste incohérente",
    reasonInventory: "Inventaire local indisponible",
    reasonNotInspected: "Cellule non examinée",
    reasonDuplicate: "Cellule en double",
    reasonUnlisted: "Cellule absente de la liste",
    reasonSaved: "Copie correspondante enregistrée",
    actionDownload: "Téléchargement manuel possible",
    actionInspect: "Examiner avant de réessayer",
    actionNone: "Aucune action suggérée",
    batch: "Lot",
    batchFits: "Espace estimé potentiellement suffisant",
    batchLow: "Espace estimé insuffisant",
    batchUnknown: "Espace estimé UNKNOWN",
    retry: "Télécharger ce lot",
    locked: "Ce lot ne peut pas commencer avant un nouvel examen du stockage et de l’inventaire.",
    running: "Téléchargement des cellules sélectionnées…",
    done: "La demande est terminée. Consultez la liste des cellules pour connaître le résultat.",
    stopped: "Le lot n’a pas pu commencer. Actualisez la liste des cellules.",
    refreshBefore: "La liste a changé. Examinez le plan à nouveau avant de réessayer.",
    exportText: "Enregistrer le plan en texte",
    exportJson: "Enregistrer le plan en JSON",
    exportError: "Impossible d’enregistrer le plan.",
    notes: "Notes de planification",
    emptyNotes: "Aucune incohérence signalée dans la liste.",
    page: "Page des cellules",
    count: "Cellules répertoriées",
    counts: "Nombre",
    disclaimer: "Une estimation ne promet pas la réussite d’un téléchargement. Chaque lot est lancé par la personne.",
  },
} as const;

export type RecoveryCopyKey = keyof typeof RECOVERY_COPY.en;
export function recoveryCopy(language: Language): Readonly<Record<RecoveryCopyKey, string>> {
  return RECOVERY_COPY[language];
}

export function recoveryStateText(state: RecoveryState, language: Language): string {
  const c = recoveryCopy(language);
  if (state === "ready") return c.ready;
  if (state === "no-action") return c.noAction;
  return c.invalid;
}

export function recoveryBudgetText(status: BudgetState, language: Language): string {
  const c = recoveryCopy(language);
  if (status === "fits") return c.quotaFits;
  if (status === "insufficient") return c.quotaLow;
  return c.quotaUnknown;
}

export function recoveryReasonText(reason: RecoveryReason, language: Language): string {
  const c = recoveryCopy(language);
  switch (reason) {
    case "missing": return c.reasonMissing;
    case "stale": return c.reasonStale;
    case "unreadable": return c.reasonUnreadable;
    case "metadata-conflict": return c.reasonConflict;
    case "invalid-listing": return c.reasonInvalid;
    case "inventory-unavailable": return c.reasonInventory;
    case "not-inspected": return c.reasonNotInspected;
    case "duplicate": return c.reasonDuplicate;
    case "unlisted": return c.reasonUnlisted;
    case "saved": return c.reasonSaved;
  }
}

/** Fail-on-violation scan for bilingual strings without pretending to certify UI conformance. */
export function auditRecoveryCopy(): readonly string[] {
  const findings: string[] = [];
  const en = RECOVERY_COPY.en;
  const fr = RECOVERY_COPY.fr;
  for (const key of Object.keys(en) as RecoveryCopyKey[]) {
    if (!en[key].trim() || !fr[key].trim()) findings.push(`missing:${key}`);
  }
  for (const language of [en, fr]) {
    for (const value of Object.values(language)) {
      if (/(?<![\p{L}\p{N}])(?:verified|verify|verifier|vérifi\p{L}*|real-time|partnership|guarantee)(?![\p{L}\p{N}])/iu.test(value)) {
        findings.push("unsupported-claim");
      }
    }
  }
  for (const value of Object.values(fr)) {
    if (value.includes("'")) findings.push("apostrophe");
    if (/(?<!\u00a0):/u.test(value)) findings.push("colon-spacing");
    if (/(?<!\u202f)[;!?]/u.test(value)) findings.push("punctuation-spacing");
  }
  return findings;
}
