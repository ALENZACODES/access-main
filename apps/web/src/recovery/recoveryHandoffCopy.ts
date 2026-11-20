import type { RecoveryLocale } from "./index";
import type { HandoffCondition, HandoffDecision, HandoffIssue, HandoffOperation, HandoffTier } from "./recoveryHandoff";

export interface HandoffCopy {
  readonly heading: string;
  readonly explanation: string;
  readonly localOnly: string;
  readonly inspectFirst: string;
  readonly pack: string;
  readonly operation: string;
  readonly condition: string;
  readonly summary: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: string;
  readonly reference: string;
  readonly add: string;
  readonly review: string;
  readonly note: string;
  readonly decision: string;
  readonly recordDecision: string;
  readonly importFile: string;
  readonly exportFile: string;
  readonly apply: string;
  readonly cancel: string;
  readonly all: string;
  readonly search: string;
  readonly noCases: string;
  readonly noResults: string;
  readonly count: string;
  readonly pending: string;
  readonly closed: string;
  readonly unknown: string;
  readonly lastUpdated: string;
  readonly fileReady: string;
  readonly imported: string;
  readonly saved: string;
  readonly readError: string;
  readonly saveError: string;
  readonly collisions: string;
  readonly added: string;
  readonly unchanged: string;
  readonly issues: Readonly<Record<HandoffIssue, string>>;
  readonly operations: Readonly<Record<HandoffOperation, string>>;
  readonly conditions: Readonly<Record<HandoffCondition, string>>;
  readonly decisions: Readonly<Record<HandoffDecision, string>>;
  readonly tiers: Readonly<Record<HandoffTier, string>>;
}

const sharedIssues: Readonly<Record<HandoffIssue, string>> = {
  format: "Unsupported document format",
  limit: "The document exceeds a local limit",
  identifier: "An identifier is unsupported",
  duplicate: "An identifier is repeated",
  text: "A text field is unsafe or too long",
  source: "Source details are missing or unsupported",
  licence: "The licence is unsupported",
  date: "The date cannot be used",
  tier: "The evidence tier is unsupported",
  condition: "The reported condition is unsupported",
  decision: "The selected decision is unsupported",
  transition: "That decision change is not allowed",
  collision: "An existing case has a different history",
  time: "The timestamp is invalid",
  sequence: "Events are out of order",
  "unknown-pack": "The selected case is not available",
  unavailable: "The local action could not be completed",
};
const frIssues: Readonly<Record<HandoffIssue, string>> = {
  format: "Format de document non pris en charge",
  limit: "Le document dépasse une limite locale",
  identifier: "Un identifiant n’est pas pris en charge",
  duplicate: "Un identifiant est répété",
  text: "Un champ de texte est invalide ou trop long",
  source: "Les renseignements sur la source sont absents ou non pris en charge",
  licence: "La licence n’est pas prise en charge",
  date: "La date ne peut pas être utilisée",
  tier: "Le niveau de preuve n’est pas pris en charge",
  condition: "L’état déclaré n’est pas pris en charge",
  decision: "La décision n’est pas prise en charge",
  transition: "Ce changement de décision n’est pas permis",
  collision: "Un cas existant présente un historique différent",
  time: "L’horodatage est invalide",
  sequence: "Les événements ne sont pas dans le bon ordre",
  "unknown-pack": "Le cas sélectionné n’est pas disponible",
  unavailable: "L’action locale n’a pas pu être terminée",
};

const EN: HandoffCopy = {
  heading: "Manual recovery handoff",
  explanation: "Keep local notes about unresolved pack, download, export, or storage problems.",
  localOnly: "This report is stored in this session unless you choose to save it. Notes do not change pack readiness.",
  inspectFirst: "Inspect local packs before selecting one.",
  pack: "Pack", operation: "Operation", condition: "Reported condition", summary: "Issue summary",
  source: "Source", licence: "Licence", date: "Source date", tier: "Evidence tier",
  reference: "Source reference", add: "Add case", review: "Add a decision note",
  note: "Decision note", decision: "Manual decision", recordDecision: "Record decision",
  importFile: "Choose a handoff file", exportFile: "Save handoff file",
  apply: "Add non-conflicting cases", cancel: "Discard preview", all: "All",
  search: "Search cases", noCases: "No recovery cases recorded.",
  noResults: "No cases match the selected filters.", count: "Cases",
  pending: "Pending", closed: "Closed", unknown: "UNKNOWN", lastUpdated: "Latest note",
  fileReady: "The local file is ready for review.", imported: "New cases added locally.",
  saved: "Handoff file saved.", readError: "The selected file could not be read.",
  saveError: "The handoff file could not be saved.", collisions: "Conflicting IDs",
  added: "New cases", unchanged: "Unchanged cases", issues: sharedIssues,
  operations: { pack: "Pack", download: "Download", export: "Export", storage: "Storage" },
  conditions: { UNKNOWN: "UNKNOWN", missing: "Missing", damaged: "Damaged", interrupted: "Interrupted", failed: "Failed" },
  decisions: { UNKNOWN: "UNKNOWN", review: "Needs review", "retry-requested": "Retry requested", deferred: "Deferred", closed: "Closed" },
  tiers: { UNKNOWN: "UNKNOWN", "local-observation": "Local observation", "source-document": "Source document", "third-party-report": "Outside report" },
};
const FR: HandoffCopy = {
  heading: "Transmission manuelle de récupération",
  explanation: "Conservez des notes locales sur les problèmes d’ensemble, de téléchargement, d’exportation ou de stockage.",
  localOnly: "Le rapport reste dans cette session, sauf si vous décidez de l’enregistrer. Les notes ne changent pas l’état des ensembles.",
  inspectFirst: "Examinez les ensembles locaux avant d’en sélectionner un.",
  pack: "Ensemble", operation: "Opération", condition: "État déclaré", summary: "Résumé du problème",
  source: "Source", licence: "Licence", date: "Date de la source", tier: "Niveau de preuve",
  reference: "Référence de la source", add: "Ajouter un cas", review: "Ajouter une note de décision",
  note: "Note de décision", decision: "Décision manuelle", recordDecision: "Consigner la décision",
  importFile: "Choisir un fichier local", exportFile: "Enregistrer le fichier local",
  apply: "Ajouter les cas sans conflit", cancel: "Annuler l’aperçu", all: "Tous",
  search: "Rechercher les cas", noCases: "Aucun cas de récupération consigné.",
  noResults: "Aucun cas ne correspond aux filtres sélectionnés.", count: "Cas",
  pending: "En attente", closed: "Fermés", unknown: "UNKNOWN", lastUpdated: "Dernière note",
  fileReady: "Le fichier local peut être examiné.", imported: "Les nouveaux cas ont été ajoutés localement.",
  saved: "Fichier enregistré.", readError: "Le fichier sélectionné n’a pas pu être lu.",
  saveError: "Le fichier n’a pas pu être enregistré.", collisions: "Identifiants en conflit",
  added: "Nouveaux cas", unchanged: "Cas inchangés", issues: frIssues,
  operations: { pack: "Ensemble", download: "Téléchargement", export: "Exportation", storage: "Stockage" },
  conditions: { UNKNOWN: "UNKNOWN", missing: "Manquant", damaged: "Endommagé", interrupted: "Interrompu", failed: "Échec" },
  decisions: { UNKNOWN: "UNKNOWN", review: "À examiner", "retry-requested": "Nouvel essai demandé", deferred: "Reporté", closed: "Fermé" },
  tiers: { UNKNOWN: "UNKNOWN", "local-observation": "Observation locale", "source-document": "Document source", "third-party-report": "Rapport externe" },
};
export function handoffCopy(locale: RecoveryLocale): HandoffCopy {
  return locale === "fr" ? FR : EN;
}
