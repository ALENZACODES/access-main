import type { Language } from "./regionDownload";
import type { JournalCause, JournalChange, JournalEvent, JournalHealth, JournalStatus } from "./recoveryJournal";

/** All user copy is paired and independent of device locale. */
export const RECOVERY_JOURNAL_COPY = {
  en: {
    title: "Offline recovery journal",
    intro: "Capture a local snapshot of the region to compare what this device can read over time.",
    privacy: "Snapshots stay in this page until you close it. Export only if you choose. No downloaded content is included.",
    caution: "This journal describes local data copies, not physical accessibility.",
    open: "Open recovery journal",
    close: "Close recovery journal",
    capture: "Capture local snapshot",
    captureAfter: "Record after download",
    captureBefore: "Record before cleanup",
    captureReview: "Record manual review",
    clear: "Clear snapshots",
    confirmClear: "Clear all snapshots from this page?",
    confirmYes: "Clear all",
    confirmNo: "Keep snapshots",
    saveJson: "Save journal as JSON",
    saveText: "Save journal as text",
    search: "Search cell, change or source",
    filter: "Show changes",
    sort: "Sort changes",
    all: "All cells",
    onlySaved: "Saved copies",
    onlyUnknown: "UNKNOWN copies",
    onlyChanged: "Changed cells",
    needsInspection: "Needs inspection",
    listed: "Listed order",
    sortId: "Cell ID",
    sortStatus: "Offline status",
    sortSize: "Largest first",
    previous: "Previous page",
    next: "Next page",
    page: "Page",
    source: "Source",
    licence: "Licence",
    sourceDate: "Source date",
    expectedBytes: "Listed bytes",
    state: "Current status",
    prior: "Previous status",
    reason: "Reason",
    change: "Change",
    recommended: "Next step",
    titleSummary: "Local snapshot summary",
    snapshots: "Snapshots captured",
    saved: "Saved copies",
    unknown: "UNKNOWN",
    unknownCount: "UNKNOWN copies",
    missing: "Missing copies",
    stale: "Out-of-date copies",
    unreadable: "Unreadable copies",
    conflicts: "Source differences",
    lastCapture: "Last snapshot",
    lastEvent: "Snapshot type",
    lastStop: "Last download outcome",
    health: "Region copy status",
    changed: "Changed cells",
    newlySaved: "Became saved",
    newlyUnknown: "Became UNKNOWN",
    sourceChanged: "Source changed",
    sizeChanged: "Listed size changed",
    unlisted: "No longer listed",
    none: "No matching cells.",
    noSnapshots: "No snapshots yet. Choose Capture local snapshot to begin.",
    firstSnapshot: "The first snapshot has no earlier snapshot for comparison.",
    captureFailed: "Unable to capture a local snapshot. Existing snapshots remain.",
    exportFailed: "Unable to save this journal.",
    clearDone: "Snapshots cleared from this page.",
    captured: "Snapshot captured on this device.",
    limit: "Only the latest 32 snapshots are kept in this page.",
    missingSource: "UNKNOWN",
    wait: "Reading local snapshot…",
    review: "Inspect local data",
    download: "Review download options",
    reviewSource: "Review source details",
    noAction: "No action suggested",
    eventSnapshot: "Manual snapshot",
    eventAfter: "After download",
    eventBefore: "Before cleanup",
    eventReview: "Manual review",
    causePresent: "Matching local record",
    causeMissing: "Not downloaded",
    causeStale: "Out-of-date copy",
    causeUnreadable: "Local copy unreadable",
    causeNotInspected: "Local record not inspected",
    causeConflict: "Listing and device differ",
    causeUnlisted: "Not in the current listing",
    causeInvalid: "Listing cannot be used for this snapshot",
    kindNew: "First recorded",
    kindSaved: "Now saved",
    kindUnknown: "Now UNKNOWN",
    kindCause: "Offline reason changed",
    kindSource: "Source metadata changed",
    kindSize: "Listed size changed",
    kindUnchanged: "No recorded change",
    kindRemoved: "No longer listed",
    complete: "All listed copies match this device's records.",
    partial: "Only part of the listed data is saved on this device.",
    unknownHealth: "Region copy status UNKNOWN.",
  },
  fr: {
    title: "Journal de récupération hors ligne",
    intro: "Prenez un instantané local de la région pour comparer les copies lisibles par cet appareil au fil du temps.",
    privacy: "Les instantanés restent sur cette page jusqu’à sa fermeture. L’exportation est facultative. Aucun contenu téléchargé n’est inclus.",
    caution: "Ce journal décrit les copies locales, et non l’accessibilité physique.",
    open: "Ouvrir le journal de récupération",
    close: "Fermer le journal de récupération",
    capture: "Prendre un instantané local",
    captureAfter: "Noter après un téléchargement",
    captureBefore: "Noter avant un nettoyage",
    captureReview: "Noter un examen manuel",
    clear: "Effacer les instantanés",
    confirmClear: "Effacer tous les instantanés de cette page ?",
    confirmYes: "Tout effacer",
    confirmNo: "Conserver les instantanés",
    saveJson: "Enregistrer le journal au format JSON",
    saveText: "Enregistrer le journal en texte",
    search: "Rechercher une cellule, un changement ou une source",
    filter: "Afficher les changements",
    sort: "Trier les changements",
    all: "Toutes les cellules",
    onlySaved: "Copies enregistrées",
    onlyUnknown: "Copies UNKNOWN",
    onlyChanged: "Cellules modifiées",
    needsInspection: "À examiner",
    listed: "Ordre de la liste",
    sortId: "Identifiant de cellule",
    sortStatus: "État hors ligne",
    sortSize: "Les plus grandes d’abord",
    previous: "Page précédente",
    next: "Page suivante",
    page: "Page",
    source: "Source",
    licence: "Licence",
    sourceDate: "Date de la source",
    expectedBytes: "Octets indiqués",
    state: "État actuel",
    prior: "État précédent",
    reason: "Motif",
    change: "Changement",
    recommended: "Étape suivante",
    titleSummary: "Résumé des instantanés locaux",
    snapshots: "Instantanés pris",
    saved: "Copies enregistrées",
    unknown: "UNKNOWN",
    unknownCount: "Copies UNKNOWN",
    missing: "Copies manquantes",
    stale: "Copies périmées",
    unreadable: "Copies illisibles",
    conflicts: "Différences de source",
    lastCapture: "Dernier instantané",
    lastEvent: "Type d’instantané",
    lastStop: "Dernier résultat du téléchargement",
    health: "État des copies de la région",
    changed: "Cellules modifiées",
    newlySaved: "Désormais enregistrées",
    newlyUnknown: "Désormais UNKNOWN",
    sourceChanged: "Source modifiée",
    sizeChanged: "Taille indiquée modifiée",
    unlisted: "Absentes de la liste",
    none: "Aucune cellule correspondante.",
    noSnapshots: "Aucun instantané pour le moment. Choisissez Prendre un instantané local pour commencer.",
    firstSnapshot: "Le premier instantané n’a pas de comparaison antérieure.",
    captureFailed: "Impossible de prendre un instantané local. Les instantanés existants sont conservés.",
    exportFailed: "Impossible d’enregistrer ce journal.",
    clearDone: "Instantanés effacés de cette page.",
    captured: "Instantané pris sur cet appareil.",
    limit: "Seuls les 32 derniers instantanés sont conservés sur cette page.",
    missingSource: "UNKNOWN",
    wait: "Lecture de l’instantané local…",
    review: "Examiner les données locales",
    download: "Examiner les options de téléchargement",
    reviewSource: "Examiner les détails de la source",
    noAction: "Aucune action suggérée",
    eventSnapshot: "Instantané manuel",
    eventAfter: "Après un téléchargement",
    eventBefore: "Avant un nettoyage",
    eventReview: "Examen manuel",
    causePresent: "Enregistrement local correspondant",
    causeMissing: "Non téléchargée",
    causeStale: "Copie périmée",
    causeUnreadable: "Copie locale illisible",
    causeNotInspected: "Enregistrement local non examiné",
    causeConflict: "La liste et l’appareil diffèrent",
    causeUnlisted: "Absente de la liste actuelle",
    causeInvalid: "Liste inutilisable pour cet instantané",
    kindNew: "Premier enregistrement",
    kindSaved: "Maintenant enregistrée",
    kindUnknown: "Maintenant UNKNOWN",
    kindCause: "Motif hors ligne modifié",
    kindSource: "Métadonnées de source modifiées",
    kindSize: "Taille indiquée modifiée",
    kindUnchanged: "Aucun changement enregistré",
    kindRemoved: "Absente de la liste",
    complete: "Toutes les copies répertoriées correspondent aux enregistrements de l’appareil.",
    partial: "Seule une partie des données répertoriées est enregistrée sur cet appareil.",
    unknownHealth: "État des copies de la région UNKNOWN.",
  },
} as const;

export type JournalCopyKey = keyof typeof RECOVERY_JOURNAL_COPY.en;
export function journalCopy(language: Language): Readonly<Record<JournalCopyKey, string>> {
  return RECOVERY_JOURNAL_COPY[language];
}

export function journalCauseLabel(cause: JournalCause, language: Language): string {
  const c = journalCopy(language);
  switch (cause) {
    case "present": return c.causePresent;
    case "missing": return c.causeMissing;
    case "stale": return c.causeStale;
    case "unreadable": return c.causeUnreadable;
    case "not-inspected": return c.causeNotInspected;
    case "metadata-conflict": return c.causeConflict;
    case "unlisted": return c.causeUnlisted;
    case "invalid-listing": return c.causeInvalid;
  }
}
export function journalEventLabel(event: JournalEvent, language: Language): string {
  const c = journalCopy(language);
  switch (event) {
    case "snapshot": return c.eventSnapshot;
    case "after-download": return c.eventAfter;
    case "before-cleanup": return c.eventBefore;
    case "manual-review": return c.eventReview;
  }
}
export function journalChangeLabel(kind: JournalChange, language: Language): string {
  const c = journalCopy(language);
  switch (kind) {
    case "new": return c.kindNew;
    case "became-saved": return c.kindSaved;
    case "became-unknown": return c.kindUnknown;
    case "cause-changed": return c.kindCause;
    case "source-changed": return c.kindSource;
    case "size-changed": return c.kindSize;
    case "unchanged": return c.kindUnchanged;
    case "removed": return c.kindRemoved;
  }
}
export function journalStatusLabel(status: JournalStatus, language: Language): string {
  return status === "saved" ? journalCopy(language).saved : "UNKNOWN";
}
export function journalHealthLabel(health: JournalHealth, language: Language): string {
  const c = journalCopy(language);
  return health === "complete" ? c.complete : health === "partial" ? c.partial : c.unknownHealth;
}

/** Fail the language audit if any copy lacks its partner or introduces overclaims. */
export function auditRecoveryJournalCopy(): readonly string[] {
  const findings: string[] = [];
  const english: Record<string, string> = RECOVERY_JOURNAL_COPY.en;
  const french: Record<string, string> = RECOVERY_JOURNAL_COPY.fr;
  for (const key of new Set([...Object.keys(english), ...Object.keys(french)])) {
    if (!english[key]?.trim() || !french[key]?.trim()) findings.push(`missing:${key}`);
  }
  for (const [language, copy] of Object.entries(RECOVERY_JOURNAL_COPY)) {
    for (const [key, value] of Object.entries(copy)) {
      if (/(?<![\p{L}\p{N}])(?:verif\p{L}*|vérif\p{L}*|real-time|partnership|guarantee|aaa-conformant)(?![\p{L}\p{N}])/iu.test(value)) {
        findings.push(`claim:${language}:${key}`);
      }
      if (language === "fr") {
        if (value.includes("'")) findings.push(`apostrophe:${key}`);
        if (/(?<!\u00a0):/u.test(value)) findings.push(`colon:${key}`);
        if (/(?<!\u202f)[;!?]/u.test(value)) findings.push(`punctuation:${key}`);
      }
    }
  }
  return findings;
}
