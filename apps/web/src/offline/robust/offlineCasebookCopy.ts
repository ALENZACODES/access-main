import type { Language } from "./regionDownload";
import type { CaseEvidence, CaseReason, CaseStatus, CaseAction, CaseFilter, CaseOrder } from "./offlineCasebook";

/** A local issue log is a user's note, not an assessment of any location. */
export const CASEBOOK_COPY = {
  en: {
    title: "Offline issue casebook",
    intro: "Keep private notes about offline copies that need attention. Notes remain on this device until you choose to export them.",
    open: "Open issue casebook", close: "Close issue casebook",
    unknown: "UNKNOWN", saved: "Matching local copy", missing: "Not downloaded",
    stale: "Out-of-date local copy", unreadable: "Local copy could not be read",
    noInventory: "Local inventory is UNKNOWN. A note can still be recorded.",
    conflicting: "The source record differs from the current listing.",
    reason: "Issue type", status: "Case status", evidence: "Current offline evidence",
    cell: "Listed cell", date: "Source date", source: "Source", licence: "Licence",
    tier: "Evidence tier", size: "Listed size", created: "Opened", updated: "Last updated",
    comments: "Notes", enterNote: "Private note (optional)", addNote: "Add note",
    add: "Open a case", change: "Update case status", reconcile: "Recheck cases against local inventory",
    selectCase: "Choose case", selectCell: "Choose a listed cell",
    search: "Search cases or sources", filter: "Filter cases", order: "Order cases",
    all: "All cases", openCases: "Open", inReview: "In review", closed: "Closed",
    attention: "Needs attention", unknownCases: "UNKNOWN evidence",
    newest: "Most recently updated", oldest: "Least recently updated", byCell: "Cell ID", byStatus: "Case status",
    noCases: "No cases recorded.", noMatch: "No matching cases.",
    previous: "Previous page", next: "Next page", page: "Case page",
    total: "Cases recorded", openCount: "Open cases", reviewCount: "In review",
    closedCount: "Closed cases", unknownCount: "UNKNOWN evidence", inspectCount: "Needs inspection",
    retryCount: "Potential manual retry", bytes: "Total listed bytes",
    retry: "Consider a manual download", inspect: "Inspect source and local copy",
    none: "No next step suggested", sourceAdvice: "Source details should be reviewed.",
    noAdvice: "No accessibility conclusion can be drawn from a saved copy.",
    record: "Record issue", event: "Case event", opened: "Case opened", commented: "Note added",
    statusChanged: "Case status changed", reconciled: "Local evidence checked",
    savedLocally: "Case added for this session.", noteSaved: "Note saved for this session.",
    statusSaved: "Case status updated.", evidenceUpdated: "Local evidence checked.",
    export: "Save casebook JSON", exportText: "Save casebook text",
    import: "Choose casebook JSON", imported: "Casebook opened for this session.",
    importWarning: "Imported case notes are historical. They do not prove that any cell is saved now.",
    exportWarning: "Exports may include your private notes. Keep them only where you choose.",
    error: "Unable to complete that action. The current casebook is unchanged.",
    incomplete: "The local listing is incomplete. Evidence stays UNKNOWN.",
    maxCases: "Casebook limit reached. Export or start another session.",
    fullHistory: "This case has reached its note limit.",
    validation: "The selected file has invalid casebook metadata.",
    focus: "Casebook controls are keyboard accessible.",
    private: "No case information is sent to a service by this feature.",
    userAction: "Each note, recheck, import and export requires your action.",
    emptyNote: "Enter a note before adding it.",
    unchanged: "No new local evidence was observed.", changed: "Recorded evidence changes",
    blocked: "Cases requiring source inspection", remaining: "Cases unchanged",
    reasonMissing: "Cell not downloaded", reasonStale: "Saved copy out of date",
    reasonUnreadable: "Stored record unreadable", reasonConflict: "Source details differ",
    reasonQuota: "Insufficient storage reported", reasonInterrupted: "Download was interrupted",
    reasonOther: "Other offline problem", statusOpen: "Open", statusReview: "In review", statusClosed: "Closed",
    evidenceMatching: "Matching copy recorded", evidenceMissing: "No saved copy recorded",
    evidenceStale: "Saved copy out of date", evidenceUnreadable: "Saved record unreadable",
    evidenceUnknown: "UNKNOWN", actionOpened: "Opened", actionCommented: "Note added",
    actionChanged: "Status changed", actionReconciled: "Evidence rechecked",
  },
  fr: {
    title: "Carnet des problèmes hors ligne",
    intro: "Conservez des notes privées sur les copies hors ligne à examiner. Elles restent sur cet appareil jusqu’à votre choix de les exporter.",
    open: "Ouvrir le carnet", close: "Fermer le carnet",
    unknown: "UNKNOWN", saved: "Copie locale correspondante", missing: "Non téléchargée",
    stale: "Copie locale périmée", unreadable: "Copie locale illisible",
    noInventory: "L’inventaire local est UNKNOWN. Vous pouvez tout de même prendre une note.",
    conflicting: "La source diffère de la liste actuelle.",
    reason: "Type de problème", status: "État du dossier", evidence: "Données locales actuelles",
    cell: "Cellule répertoriée", date: "Date de la source", source: "Source", licence: "Licence",
    tier: "Niveau de preuve", size: "Taille répertoriée", created: "Ouvert", updated: "Dernière mise à jour",
    comments: "Notes", enterNote: "Note privée (facultative)", addNote: "Ajouter une note",
    add: "Ouvrir un dossier", change: "Modifier l’état du dossier", reconcile: "Réexaminer les dossiers selon l’inventaire local",
    selectCase: "Choisir un dossier", selectCell: "Choisir une cellule répertoriée",
    search: "Rechercher des dossiers ou des sources", filter: "Filtrer les dossiers", order: "Trier les dossiers",
    all: "Tous les dossiers", openCases: "Ouverts", inReview: "En examen", closed: "Fermés",
    attention: "À examiner", unknownCases: "Données UNKNOWN",
    newest: "Plus récemment modifiés", oldest: "Moins récemment modifiés", byCell: "Identifiant de cellule", byStatus: "État du dossier",
    noCases: "Aucun dossier enregistré.", noMatch: "Aucun dossier correspondant.",
    previous: "Page précédente", next: "Page suivante", page: "Page de dossiers",
    total: "Dossiers enregistrés", openCount: "Dossiers ouverts", reviewCount: "En examen",
    closedCount: "Fermés", unknownCount: "Données UNKNOWN", inspectCount: "À examiner",
    retryCount: "Nouvelle tentative manuelle possible", bytes: "Total des octets répertoriés",
    retry: "Envisager un téléchargement manuel", inspect: "Examiner la source et la copie locale",
    none: "Aucune prochaine étape suggérée", sourceAdvice: "Les renseignements de la source doivent être examinés.",
    noAdvice: "Une copie enregistrée ne permet aucune conclusion sur l’accessibilité.",
    record: "Consigner un problème", event: "Événement du dossier", opened: "Dossier ouvert", commented: "Note ajoutée",
    statusChanged: "État du dossier modifié", reconciled: "Données locales examinées",
    savedLocally: "Dossier ajouté pour cette session.", noteSaved: "Note enregistrée pour cette session.",
    statusSaved: "État du dossier modifié.", evidenceUpdated: "Données locales examinées.",
    export: "Enregistrer le carnet en JSON", exportText: "Enregistrer le carnet en texte",
    import: "Choisir un fichier JSON du carnet", imported: "Carnet ouvert pour cette session.",
    importWarning: "Les notes importées sont historiques. Elles ne prouvent pas qu’une cellule soit enregistrée maintenant.",
    exportWarning: "Les exportations peuvent contenir vos notes privées. Conservez-les uniquement à l’endroit choisi.",
    error: "Action impossible. Le carnet actuel reste inchangé.",
    incomplete: "La liste locale est incomplète. Les données restent UNKNOWN.",
    maxCases: "Limite du carnet atteinte. Exportez-le ou commencez une autre session.",
    fullHistory: "Ce dossier a atteint sa limite de notes.",
    validation: "Le fichier choisi contient des métadonnées de carnet non valides.",
    focus: "Les commandes du carnet sont accessibles au clavier.",
    private: "Cette fonction n’envoie aucun dossier à un service.",
    userAction: "Chaque note, examen, importation et exportation demande votre action.",
    emptyNote: "Saisissez une note avant de l’ajouter.",
    unchanged: "Aucune nouvelle donnée locale observée.", changed: "Modifications de données consignées",
    blocked: "Dossiers nécessitant l’examen de la source", remaining: "Dossiers inchangés",
    reasonMissing: "Cellule non téléchargée", reasonStale: "Copie enregistrée périmée",
    reasonUnreadable: "Enregistrement illisible", reasonConflict: "Renseignements de source différents",
    reasonQuota: "Stockage insuffisant signalé", reasonInterrupted: "Téléchargement interrompu",
    reasonOther: "Autre problème hors ligne", statusOpen: "Ouvert", statusReview: "En examen", statusClosed: "Fermé",
    evidenceMatching: "Copie correspondante consignée", evidenceMissing: "Aucune copie enregistrée consignée",
    evidenceStale: "Copie enregistrée périmée", evidenceUnreadable: "Enregistrement illisible",
    evidenceUnknown: "UNKNOWN", actionOpened: "Ouvert", actionCommented: "Note ajoutée",
    actionChanged: "État modifié", actionReconciled: "Données réexaminées",
  },
} as const;

export type CasebookCopyKey = keyof typeof CASEBOOK_COPY.en;
export function casebookCopy(language: Language): Readonly<Record<CasebookCopyKey, string>> {
  return CASEBOOK_COPY[language];
}

export function caseReasonText(reason: CaseReason, language: Language): string {
  const c = casebookCopy(language);
  switch (reason) {
    case "not-downloaded": return c.reasonMissing;
    case "out-of-date": return c.reasonStale;
    case "unreadable": return c.reasonUnreadable;
    case "source-conflict": return c.reasonConflict;
    case "storage-limit": return c.reasonQuota;
    case "interrupted": return c.reasonInterrupted;
    case "other": return c.reasonOther;
  }
}

export function caseStatusText(status: CaseStatus, language: Language): string {
  const c = casebookCopy(language);
  switch (status) {
    case "open": return c.statusOpen;
    case "in-review": return c.statusReview;
    case "closed": return c.statusClosed;
  }
}

export function caseEvidenceText(evidence: CaseEvidence, language: Language): string {
  const c = casebookCopy(language);
  switch (evidence) {
    case "matching": return c.evidenceMatching;
    case "missing": return c.evidenceMissing;
    case "stale": return c.evidenceStale;
    case "unreadable": return c.evidenceUnreadable;
    case "UNKNOWN": return c.unknown;
  }
}

export function caseActionText(action: CaseAction, language: Language): string {
  const c = casebookCopy(language);
  switch (action) {
    case "opened": return c.actionOpened;
    case "commented": return c.actionCommented;
    case "status-changed": return c.actionChanged;
    case "reconciled": return c.actionReconciled;
  }
}

export const CASE_FILTERS: readonly CaseFilter[] = ["all", "open", "in-review", "closed", "attention", "unknown"];
export const CASE_ORDERS: readonly CaseOrder[] = ["newest", "oldest", "cell", "status"];
export const CASE_REASONS: readonly CaseReason[] = [
  "not-downloaded", "out-of-date", "unreadable", "source-conflict", "storage-limit", "interrupted", "other",
];
export const CASE_STATUSES: readonly CaseStatus[] = ["open", "in-review", "closed"];

export function caseFilterText(value: CaseFilter, language: Language): string {
  const c = casebookCopy(language);
  switch (value) {
    case "all": return c.all;
    case "open": return c.openCases;
    case "in-review": return c.inReview;
    case "closed": return c.closed;
    case "attention": return c.attention;
    case "unknown": return c.unknownCases;
  }
}

export function caseOrderText(value: CaseOrder, language: Language): string {
  const c = casebookCopy(language);
  switch (value) {
    case "newest": return c.newest;
    case "oldest": return c.oldest;
    case "cell": return c.byCell;
    case "status": return c.byStatus;
  }
}

/** Copy audits reject unsupported claims and French typographic regressions. */
export function auditCasebookCopy(): readonly string[] {
  const issues: string[] = [];
  const en: Record<string, string> = CASEBOOK_COPY.en;
  const fr: Record<string, string> = CASEBOOK_COPY.fr;
  const keys = new Set([...Object.keys(en), ...Object.keys(fr)]);
  for (const key of keys) {
    if (!en[key]?.trim() || !fr[key]?.trim()) issues.push(`missing:${key}`);
  }
  for (const [key, value] of Object.entries(fr)) {
    if (value.includes("'")) issues.push(`apostrophe:${key}`);
    if (/(?<!\u00a0):/u.test(value)) issues.push(`colon:${key}`);
    if (/(?<!\u202f)[;!?]/u.test(value)) issues.push(`punctuation:${key}`);
    if (value.includes("INCONNU")) issues.push(`unknown-token:${key}`);
  }
  for (const [locale, copy] of Object.entries(CASEBOOK_COPY)) {
    for (const [key, value] of Object.entries(copy)) {
      if (/(?<![\p{L}\p{N}])(?:verified|verify|verifier|vérifi\p{L}*|real-time|partnership|guarantee)(?![\p{L}\p{N}])/iu.test(value)) {
        issues.push(`claim:${locale}:${key}`);
      }
    }
  }
  return issues;
}
