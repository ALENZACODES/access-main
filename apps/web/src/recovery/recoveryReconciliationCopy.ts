import type {
  ReconciliationAction, ReconciliationCondition, ReconciliationDisposition,
  ReconciliationIssue, ReconciliationOperation, ReconciliationStatus, ReconciliationTier,
} from "./recoveryReconciliation";

export interface ReconciliationCopy {
  readonly heading: string;
  readonly description: string;
  readonly caution: string;
  readonly pack: string;
  readonly title: string;
  readonly summary: string;
  readonly operation: string;
  readonly condition: string;
  readonly status: string;
  readonly disposition: string;
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: string;
  readonly reference: string;
  readonly observation: string;
  readonly activity: string;
  readonly note: string;
  readonly createdAt: string;
  readonly reason: string;
  readonly addCase: string;
  readonly addObservation: string;
  readonly addEvent: string;
  readonly requestReview: string;
  readonly defer: string;
  readonly close: string;
  readonly reopen: string;
  readonly refresh: string;
  readonly importFile: string;
  readonly exportFile: string;
  readonly exportReport: string;
  readonly acceptImport: string;
  readonly cancelImport: string;
  readonly pendingImport: string;
  readonly empty: string;
  readonly notInspected: string;
  readonly saved: string;
  readonly failed: string;
  readonly imported: string;
  readonly conflict: string;
  readonly choose: string;
  readonly filter: string;
  readonly all: string;
  readonly query: string;
  readonly onlyConflicts: string;
  readonly issueHeading: string;
  readonly unknown: "UNKNOWN";
  readonly caseCount: string;
  readonly observationCount: string;
  readonly unresolvedCount: string;
  readonly eventCount: string;
  readonly contradictionCount: string;
  readonly conflictWarning: string;
  readonly summaryLabel: string;
  readonly sortLabel: string;
  readonly conditions: Readonly<Record<ReconciliationCondition, string>>;
  readonly tiers: Readonly<Record<ReconciliationTier, string>>;
  readonly operations: Readonly<Record<ReconciliationOperation, string>>;
  readonly statuses: Readonly<Record<ReconciliationStatus, string>>;
  readonly dispositions: Readonly<Record<ReconciliationDisposition, string>>;
  readonly actions: Readonly<Record<ReconciliationAction, string>>;
  readonly issues: Readonly<Record<ReconciliationIssue, string>>;
}
const en: ReconciliationCopy = {
  heading: "Recovery reconciliation register",
  description: "Compare locally supplied observations and record manual handoff decisions. No data is transmitted by this panel.",
  caution: "UNKNOWN means no condition was established. A reviewed or closed entry does not make a pack usable.",
  pack: "Pack", title: "Case title", summary: "Case context", operation: "Operation",
  condition: "Observed condition", status: "Review state", disposition: "Document decision",
  source: "Source", licence: "Licence", retrievedOn: "Retrieved on", tier: "Evidence tier",
  reference: "Source reference", observation: "Observation", activity: "Review history",
  note: "Notes", createdAt: "Recorded at", reason: "Reason", addCase: "Add case",
  addObservation: "Record observation", addEvent: "Record activity", requestReview: "Request review",
  defer: "Defer", close: "Close record", reopen: "Reopen", refresh: "Refresh local inspection",
  importFile: "Choose a JSON file", exportFile: "Save register JSON", exportReport: "Save text summary",
  acceptImport: "Merge selected file", cancelImport: "Cancel import", pendingImport: "Review the staged file before merging.",
  empty: "No manual cases recorded.", notInspected: "Inspect installed packs before adding a new case.",
  saved: "A file was provided to the save handler.", failed: "The file could not be saved.",
  imported: "Records were merged locally.", conflict: "Matching identifiers disagree. Nothing was merged.",
  choose: "Choose", filter: "Filter cases", all: "All", query: "Search recorded cases",
  onlyConflicts: "Only conflicting observations", issueHeading: "Review findings", unknown: "UNKNOWN",
  caseCount: "Cases", observationCount: "Observations", unresolvedCount: "Pending",
  eventCount: "Events", contradictionCount: "Contradictions",
  conflictWarning: "Different observations are displayed as UNKNOWN until a person reviews the source material.",
  summaryLabel: "Summary", sortLabel: "Newest records do not replace existing observations.",
  conditions: { UNKNOWN: "UNKNOWN", unavailable: "Unavailable", incomplete: "Incomplete", interrupted: "Interrupted", "needs-review": "Needs review" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed record" },
  operations: { pack: "Pack", download: "Download", export: "Export", handoff: "Handoff" },
  statuses: { open: "Open", "in-review": "Under review", deferred: "Deferred", closed: "Closed record" },
  dispositions: { UNKNOWN: "UNKNOWN", retain: "Retain record", "seek-source": "Seek source", dispute: "Dispute observation", "document-only": "Document only" },
  actions: { opened: "Opened", noted: "Note", reviewed: "Reviewed", deferred: "Deferred", reopened: "Reopened", closed: "Closed" },
  issues: {
    format: "Unexpected JSON structure", size: "File exceeds the size limit", count: "Too many records",
    id: "Invalid identifier", duplicate: "Duplicate identifier", source: "Source information is incomplete",
    date: "Invalid retrieval date", time: "Invalid recorded timestamp", text: "Text is not acceptable",
    reference: "A referenced case is missing", transition: "This change is not allowed",
    conflict: "Conflicting record", version: "Unsupported file version",
  },
};
const fr: ReconciliationCopy = {
  heading: "Registre de rapprochement des récupérations",
  description: "Comparez les observations fournies localement et consignez les décisions de transmission. Ce panneau ne transmet aucune donnée.",
  caution: "UNKNOWN reste UNKNOWN. Un dossier examiné ou fermé ne rend pas un ensemble utilisable.",
  pack: "Ensemble", title: "Titre du dossier", summary: "Contexte du dossier", operation: "Opération",
  condition: "État observé", status: "État du contrôle", disposition: "Décision consignée",
  source: "Source", licence: "Licence", retrievedOn: "Date de récupération", tier: "Niveau de preuve",
  reference: "Référence de la source", observation: "Observation", activity: "Historique des contrôles",
  note: "Notes", createdAt: "Date de saisie", reason: "Motif", addCase: "Ajouter un dossier",
  addObservation: "Consigner l’observation", addEvent: "Consigner l’activité", requestReview: "Demander l’examen",
  defer: "Reporter", close: "Fermer le dossier", reopen: "Rouvrir", refresh: "Actualiser l’inspection locale",
  importFile: "Choisir un fichier JSON", exportFile: "Enregistrer le registre JSON", exportReport: "Enregistrer le résumé texte",
  acceptImport: "Fusionner le fichier choisi", cancelImport: "Annuler l’importation",
  pendingImport: "Examinez le fichier préparé avant de le fusionner.",
  empty: "Aucun dossier manuel consigné.", notInspected: "Inspectez les ensembles installés avant d’ajouter un dossier.",
  saved: "Le fichier a été remis au gestionnaire d’enregistrement.", failed: "Le fichier n’a pas pu être enregistré.",
  imported: "Les dossiers ont été fusionnés localement.", conflict: "Des identifiants identiques présentent des différences. Aucune fusion n’a été effectuée.",
  choose: "Choisir", filter: "Filtrer les dossiers", all: "Tous", query: "Rechercher dans les dossiers",
  onlyConflicts: "Uniquement les observations contradictoires", issueHeading: "Points à examiner", unknown: "UNKNOWN",
  caseCount: "Dossiers", observationCount: "Observations", unresolvedCount: "En attente",
  eventCount: "Évènements", contradictionCount: "Contradictions",
  conflictWarning: "Des observations divergentes restent UNKNOWN jusqu’à l’examen humain des sources.",
  summaryLabel: "Résumé", sortLabel: "Les nouveaux dossiers ne remplacent pas les observations existantes.",
  conditions: { UNKNOWN: "UNKNOWN", unavailable: "Indisponible", incomplete: "Incomplet", interrupted: "Interrompu", "needs-review": "À examiner" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Déclaré", documented: "Documenté", reviewed: "Dossier examiné" },
  operations: { pack: "Ensemble", download: "Téléchargement", export: "Exportation", handoff: "Transmission" },
  statuses: { open: "Ouvert", "in-review": "En examen", deferred: "Reporté", closed: "Dossier fermé" },
  dispositions: { UNKNOWN: "UNKNOWN", retain: "Conserver le dossier", "seek-source": "Chercher la source", dispute: "Contester l’observation", "document-only": "Consigner uniquement" },
  actions: { opened: "Ouvert", noted: "Note", reviewed: "Examiné", deferred: "Reporté", reopened: "Rouvert", closed: "Fermé" },
  issues: {
    format: "Structure JSON inattendue", size: "Le fichier dépasse la limite de taille", count: "Trop de dossiers",
    id: "Identifiant invalide", duplicate: "Identifiant en double", source: "Informations sur la source incomplètes",
    date: "Date de récupération invalide", time: "Horodatage de saisie invalide", text: "Texte non accepté",
    reference: "Un dossier référencé est absent", transition: "Ce changement n’est pas autorisé",
    conflict: "Dossiers contradictoires", version: "Version de fichier non prise en charge",
  },
};
export function reconciliationCopy(locale: "en" | "fr"): ReconciliationCopy {
  return locale === "fr" ? fr : en;
}
