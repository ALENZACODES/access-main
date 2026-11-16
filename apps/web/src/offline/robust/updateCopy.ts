import { type Language } from "./regionDownload";
import { type CellAssessment, type RegionAssessment, type RecoveryBudget } from "./updateAssessment";

/** Translations belong to one catalogue to make omissions fail during tests. */
export const UPDATE_COPY = {
  en: {
    title: "Offline copy review",
    intro: "Review which listed cells are saved on this device and which need attention.",
    privacy: "This review stays on this device. It does not check physical accessibility.",
    unknown: "UNKNOWN",
    saved: "Saved copy matches the listing",
    missing: "Not downloaded",
    stale: "Out-of-date copy",
    unreadable: "Unable to read local copy",
    unlisted: "Not listed in this region",
    metadata: "Listing and local details differ",
    complete: "All listed cells have matching saved copies.",
    partial: "Only part of this region is available offline.",
    unknownRegion: "Offline copy status is UNKNOWN for some cells.",
    noInventory: "Local storage information is unavailable.",
    search: "Search cell ID or source",
    filter: "Show",
    order: "Sort",
    all: "All cells",
    onlySaved: "Saved cells",
    onlyUnknown: "Cells with UNKNOWN status",
    needsDownload: "Cells needing download",
    sourceChanges: "Source changes",
    manifest: "Listed order",
    byId: "Cell ID",
    largest: "Largest first",
    smallest: "Smallest first",
    byStatus: "Offline status",
    source: "Source",
    licence: "Licence",
    date: "Data date",
    size: "Listed size",
    expected: "Current listing",
    observed: "Device record",
    notKnown: "UNKNOWN",
    download: "Review missing downloads",
    none: "No matching cells.",
    previous: "Previous page",
    next: "Next page",
    refresh: "Refresh local review",
    export: "Save review as text",
    exportJson: "Save review as JSON",
    count: "Cells listed",
    countSaved: "Matching saved copies",
    countUnknown: "Cells with UNKNOWN status",
    remaining: "Listed bytes not saved",
    quota: "Estimated available space",
    budgetEnough: "The estimate indicates space for these downloads. Storage can still change.",
    budgetLow: "Estimated space is insufficient for these downloads.",
    budgetUnknown: "Storage estimate is UNKNOWN. No space assumption has been made.",
    budgetEmpty: "No downloads suggested from this review.",
    changes: "Source and date details are shown for every listed cell.",
    inspect: "Inspect this cell before taking further action.",
    downloadAdvice: "A current copy is not saved. Use the region's download control.",
    sourceAdvice: "The listing differs from the device record. Review the source details.",
    noAction: "No recovery action suggested.",
    exportError: "Unable to save this review.",
    busy: "Reading saved cells…",
    unavailable: "The local review cannot be shown.",
    start: "Review offline copies",
    hide: "Hide offline copy review",
    page: "Review page",
    snapshot: "Snapshot taken",
    advisory: "Storage estimates are advisory. A successful download does not describe a place's accessibility.",
  },
  fr: {
    title: "Examen des copies hors ligne",
    intro: "Consultez les cellules répertoriées qui sont enregistrées sur cet appareil et celles qui nécessitent votre attention.",
    privacy: "Cet examen reste sur cet appareil. Il ne porte pas sur l’accessibilité physique.",
    unknown: "INCONNU",
    saved: "La copie enregistrée correspond à la liste",
    missing: "Non téléchargée",
    stale: "Copie périmée",
    unreadable: "Copie locale illisible",
    unlisted: "Absente de la liste de cette région",
    metadata: "Les renseignements de la liste et ceux de l’appareil diffèrent",
    complete: "Toutes les cellules répertoriées ont une copie enregistrée correspondante.",
    partial: "Seule une partie de cette région est disponible hors ligne.",
    unknownRegion: "L’état hors ligne de certaines cellules est INCONNU.",
    noInventory: "Les renseignements du stockage local sont indisponibles.",
    search: "Rechercher une cellule ou une source",
    filter: "Afficher",
    order: "Trier",
    all: "Toutes les cellules",
    onlySaved: "Cellules enregistrées",
    onlyUnknown: "Cellules à état INCONNU",
    needsDownload: "Cellules à télécharger",
    sourceChanges: "Changements de source",
    manifest: "Ordre de la liste",
    byId: "Identifiant de cellule",
    largest: "Les plus grandes d’abord",
    smallest: "Les plus petites d’abord",
    byStatus: "État hors ligne",
    source: "Source",
    licence: "Licence",
    date: "Date des données",
    size: "Taille indiquée",
    expected: "Liste actuelle",
    observed: "Enregistrement de l’appareil",
    notKnown: "INCONNU",
    download: "Examiner les téléchargements manquants",
    none: "Aucune cellule correspondante.",
    previous: "Page précédente",
    next: "Page suivante",
    refresh: "Actualiser l’examen local",
    export: "Enregistrer l’examen en texte",
    exportJson: "Enregistrer l’examen en JSON",
    count: "Cellules répertoriées",
    countSaved: "Copies enregistrées correspondantes",
    countUnknown: "Cellules à état INCONNU",
    remaining: "Octets répertoriés non enregistrés",
    quota: "Espace disponible estimé",
    budgetEnough: "L’estimation indique assez d’espace pour ces téléchargements. Le stockage peut changer.",
    budgetLow: "L’espace estimé est insuffisant pour ces téléchargements.",
    budgetUnknown: "L’estimation du stockage est INCONNUE. Aucun espace n’a été présumé.",
    budgetEmpty: "Aucun téléchargement suggéré par cet examen.",
    changes: "La source et la date sont indiquées pour chaque cellule répertoriée.",
    inspect: "Examinez cette cellule avant toute autre action.",
    downloadAdvice: "Aucune copie actuelle n’est enregistrée. Utilisez la commande de téléchargement de la région.",
    sourceAdvice: "La liste diffère de l’enregistrement de l’appareil. Examinez la source.",
    noAction: "Aucune action de récupération suggérée.",
    exportError: "Impossible d’enregistrer cet examen.",
    busy: "Lecture des cellules enregistrées…",
    unavailable: "L’examen local ne peut pas être affiché.",
    start: "Examiner les copies hors ligne",
    hide: "Masquer l’examen des copies hors ligne",
    page: "Page d’examen",
    snapshot: "Instantané pris le",
    advisory: "Les estimations de stockage sont indicatives. Un téléchargement réussi ne décrit pas l’accessibilité d’un lieu.",
  },
} as const;

export type UpdateCopyKey = keyof typeof UPDATE_COPY.en;

export function updateCopy(language: Language): Readonly<Record<UpdateCopyKey, string>> {
  return UPDATE_COPY[language];
}

export function assessmentKindText(kind: CellAssessment["kind"], language: Language): string {
  const copy = updateCopy(language);
  switch (kind) {
    case "saved": return copy.saved;
    case "not-downloaded": return copy.missing;
    case "out-of-date": return copy.stale;
    case "unreadable": return copy.unreadable;
    case "unlisted": return copy.unlisted;
    case "metadata-changed": return copy.metadata;
  }
}

export function assessmentAdviceText(advice: CellAssessment["advice"], language: Language): string {
  const copy = updateCopy(language);
  switch (advice) {
    case "none": return copy.noAction;
    case "download": return copy.downloadAdvice;
    case "inspect": return copy.inspect;
    case "review-source": return copy.sourceAdvice;
  }
}

export function assessmentSummary(assessment: RegionAssessment, language: Language): string {
  const copy = updateCopy(language);
  const description = assessment.status === "complete" ? copy.complete :
    assessment.status === "partial" ? copy.partial : copy.unknownRegion;
  const colon = language === "fr" ? "\u00a0:" : ":";
  return `${description} ${copy.countSaved}${colon} ${assessment.counts.saved}. ` +
    `${copy.countUnknown}${colon} ${assessment.counts.unknown}.`;
}

export function assessmentBudgetText(budget: RecoveryBudget, language: Language): string {
  const copy = updateCopy(language);
  if (budget.queueBytes === 0) return copy.budgetEmpty;
  if (budget.fitsEstimate === "yes") return copy.budgetEnough;
  if (budget.fitsEstimate === "no") return copy.budgetLow;
  return copy.budgetUnknown;
}

export function labelledAssessmentBytes(bytes: number | null, language: Language): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return updateCopy(language).notKnown;
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(bytes)} B`;
}

/** Explicit language-consistency audit for every user-visible value. */
export function auditUpdateCopy(): readonly string[] {
  const failures: string[] = [];
  const english = Object.keys(UPDATE_COPY.en);
  const french = Object.keys(UPDATE_COPY.fr);
  for (const key of new Set([...english, ...french])) {
    const en = (UPDATE_COPY.en as Record<string, string>)[key];
    const fr = (UPDATE_COPY.fr as Record<string, string>)[key];
    if (!en?.trim() || !fr?.trim()) failures.push(`missing-language:${key}`);
  }
  for (const [language, copy] of Object.entries(UPDATE_COPY)) {
    for (const [key, value] of Object.entries(copy)) {
      if (/\b(?:verified|verify|vérifi\p{L}*|real-time|partnership|guarantee|AAA-conformant)\b/iu.test(value)) {
        failures.push(`unsupported-word:${language}:${key}`);
      }
      if (language === "fr") {
        if (value.includes("'")) failures.push(`apostrophe:${key}`);
        if (/(?<!\u00a0):/u.test(value)) failures.push(`colon:${key}`);
        if (/(?<!\u202f)[;!?]/u.test(value)) failures.push(`punctuation:${key}`);
      }
    }
  }
  return failures;
}
