import type { RecoveryLocale } from "./index";
import type { MatrixChoice, MatrixCondition, MatrixIssue, MatrixOperation, MatrixStatus, MatrixTier } from "./recoveryDecisionMatrix";

export interface MatrixCopy {
  readonly title: string;
  readonly introduction: string;
  readonly warning: string;
  readonly pack: string;
  readonly operation: string;
  readonly condition: string;
  readonly choice: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: string;
  readonly reference: string;
  readonly reason: string;
  readonly add: string;
  readonly review: string;
  readonly defer: string;
  readonly note: string;
  readonly import: string;
  readonly export: string;
  readonly apply: string;
  readonly cancel: string;
  readonly search: string;
  readonly all: string;
  readonly list: string;
  readonly empty: string;
  readonly status: string;
  readonly total: string;
  readonly unknown: string;
  readonly conflict: string;
  readonly saved: string;
  readonly failed: string;
  readonly staged: string;
  readonly inspect: string;
  readonly events: string;
  readonly matches: string;
  readonly operationNames: Readonly<Record<MatrixOperation, string>>;
  readonly conditionNames: Readonly<Record<MatrixCondition, string>>;
  readonly choiceNames: Readonly<Record<MatrixChoice, string>>;
  readonly tierNames: Readonly<Record<MatrixTier, string>>;
  readonly statusNames: Readonly<Record<MatrixStatus, string>>;
  readonly issueNames: Readonly<Record<MatrixIssue, string>>;
}

const issuesEn: Record<MatrixIssue, string> = {
  format: "The file format is unsupported.", limit: "The local file exceeds the supported limit.",
  identifier: "A pack or entry ID is invalid.", duplicate: "Two entries use the same ID.",
  date: "The supplied date is not valid.", source: "Source details are incomplete.",
  licence: "This licence is not supported.", text: "The note contains unsupported text.",
  condition: "The condition is not supported.", choice: "The choice is not supported.",
  tier: "The evidence tier is not supported.", state: "The review state is not supported.",
  transition: "A completed review cannot be changed.", conflict: "This import conflicts with local history.",
  time: "The review time is before the entry time.", "invalid-link": "The review refers to a missing entry.",
  missing: "No matching local entry was found.",
};
const issuesFr: Record<MatrixIssue, string> = {
  format: "Le format du fichier n’est pas pris en charge.", limit: "Le fichier dépasse la limite permise.",
  identifier: "Un identifiant d’ensemble ou d’entrée est invalide.", duplicate: "Deux entrées partagent un identifiant.",
  date: "La date indiquée est invalide.", source: "Les renseignements sur la source sont incomplets.",
  licence: "Cette licence n’est pas prise en charge.", text: "La note contient du texte non pris en charge.",
  condition: "L’état déclaré n’est pas pris en charge.", choice: "Le choix n’est pas pris en charge.",
  tier: "Le niveau de preuve n’est pas pris en charge.", state: "L’état d’examen n’est pas pris en charge.",
  transition: "Un examen terminé ne peut pas être modifié.", conflict: "L’importation entre en conflit avec l’historique local.",
  time: "L’heure de l’examen précède celle de l’entrée.", "invalid-link": "L’examen renvoie à une entrée absente.",
  missing: "Aucune entrée locale correspondante.",
};

const EN: MatrixCopy = {
  title: "Manual recovery decision matrix", introduction: "Compare possible next steps for pack, download and export problems without starting an operation.",
  warning: "A selected step is not proof that a pack is ready. Missing information stays UNKNOWN.",
  pack: "Pack", operation: "Operation", condition: "Reported condition", choice: "Possible next step",
  source: "Source", licence: "Open licence", date: "Source date", tier: "Evidence tier", reference: "Reference",
  reason: "Reason", add: "Add local choice", review: "Mark reviewed", defer: "Defer", note: "Review note",
  import: "Choose local JSON", export: "Save local JSON", apply: "Add non-conflicting entries", cancel: "Cancel preview",
  search: "Search local choices", all: "All", list: "Local choices", empty: "No local choices yet",
  status: "Review status", total: "Choices", unknown: "UNKNOWN", conflict: "Conflicting entries were not imported.",
  saved: "Local file saved.", failed: "The local operation could not be completed.", staged: "Selected file is ready for review.",
  inspect: "Inspect saved packs before adding a choice.", events: "Review history", matches: "Matching entries",
  operationNames: { pack: "Pack", download: "Download", export: "Export" },
  conditionNames: { UNKNOWN: "UNKNOWN", missing: "Missing", damaged: "Damaged", interrupted: "Interrupted", storage: "Storage", permission: "Permission" },
  choiceNames: { inspect: "Inspect local files", "retry-later": "Consider retrying later", "review-source": "Review source", "free-space": "Review storage", defer: "Defer" },
  tierNames: { UNKNOWN: "UNKNOWN", "user-observation": "User observation", "source-document": "Source document", "file-metadata": "File metadata" },
  statusNames: { draft: "Draft", reviewed: "Reviewed", deferred: "Deferred" }, issueNames: issuesEn,
};
const FR: MatrixCopy = {
  title: "Tableau des décisions de récupération", introduction: "Comparez les prochaines étapes possibles sans lancer de téléchargement ni d’exportation.",
  warning: "Une étape choisie ne signifie pas qu’un ensemble est prêt. Les renseignements manquants restent UNKNOWN.",
  pack: "Ensemble", operation: "Opération", condition: "État déclaré", choice: "Prochaine étape possible",
  source: "Source", licence: "Licence ouverte", date: "Date de la source", tier: "Niveau de preuve", reference: "Référence",
  reason: "Raison", add: "Ajouter un choix local", review: "Marquer comme examiné", defer: "Reporter", note: "Note d’examen",
  import: "Choisir un fichier JSON local", export: "Enregistrer un fichier JSON local", apply: "Ajouter les entrées sans conflit", cancel: "Annuler l’aperçu",
  search: "Rechercher les choix locaux", all: "Tous", list: "Choix locaux", empty: "Aucun choix local pour le moment",
  status: "État de l’examen", total: "Choix", unknown: "UNKNOWN", conflict: "Les entrées contradictoires n’ont pas été importées.",
  saved: "Fichier local enregistré.", failed: "L’opération locale n’a pas pu être terminée.", staged: "Le fichier sélectionné est prêt pour examen.",
  inspect: "Examinez les ensembles enregistrés avant d’ajouter un choix.", events: "Historique des examens", matches: "Entrées correspondantes",
  operationNames: { pack: "Ensemble", download: "Téléchargement", export: "Exportation" },
  conditionNames: { UNKNOWN: "UNKNOWN", missing: "Manquant", damaged: "Endommagé", interrupted: "Interrompu", storage: "Stockage", permission: "Autorisation" },
  choiceNames: { inspect: "Examiner les fichiers", "retry-later": "Envisager une nouvelle tentative", "review-source": "Examiner la source", "free-space": "Examiner le stockage", defer: "Reporter" },
  tierNames: { UNKNOWN: "UNKNOWN", "user-observation": "Observation personnelle", "source-document": "Document source", "file-metadata": "Métadonnées du fichier" },
  statusNames: { draft: "Brouillon", reviewed: "Examiné", deferred: "Reporté" }, issueNames: issuesFr,
};
export function recoveryDecisionCopy(locale: RecoveryLocale): MatrixCopy {
  return locale === "fr" ? FR : EN;
}
