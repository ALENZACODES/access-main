import type { WitnessAction, WitnessChannel, WitnessCondition, WitnessIssue, WitnessKind, WitnessPhase, WitnessTier } from "./recoveryTransferWitness";
export interface WitnessCopy {
  readonly heading: string;
  readonly introduction: string;
  readonly caution: string;
  readonly inspect: string;
  readonly packId: string;
  readonly label: string;
  readonly kind: string;
  readonly channel: string;
  readonly condition: string;
  readonly phase: string;
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: string;
  readonly reference: string;
  readonly note: string;
  readonly bytes: string;
  readonly digest: string;
  readonly add: string;
  readonly record: string;
  readonly open: string;
  readonly merge: string;
  readonly export: string;
  readonly report: string;
  readonly cancel: string;
  readonly empty: string;
  readonly noPacks: string;
  readonly pending: string;
  readonly saved: string;
  readonly failed: string;
  readonly staged: string;
  readonly merged: string;
  readonly unknown: "UNKNOWN";
  readonly entries: string;
  readonly events: string;
  readonly search: string;
  readonly filter: string;
  readonly all: string;
  readonly clear: string;
  readonly sourceHeading: string;
  readonly issuesHeading: string;
  readonly action: string;
  readonly files: string;
  readonly reviewNote: string;
  readonly importWarning: string;
  readonly conditionNames: Readonly<Record<WitnessCondition, string>>;
  readonly kinds: Readonly<Record<WitnessKind, string>>;
  readonly channels: Readonly<Record<WitnessChannel, string>>;
  readonly tiers: Readonly<Record<WitnessTier, string>>;
  readonly phases: Readonly<Record<WitnessPhase, string>>;
  readonly actions: Readonly<Record<WitnessAction, string>>;
  readonly issues: Readonly<Record<WitnessIssue, string>>;
}
const commonEnIssues: WitnessCopy["issues"] = {
  format: "The file or entry is not in the expected format.",
  size: "The file or collection exceeds the local size limit.",
  identity: "A required identifier is missing or unsafe.",
  duplicate: "An identifier is already recorded.",
  reference: "A transfer referenced by an event is unavailable.",
  source: "Source metadata is incomplete.",
  date: "A calendar date is missing or invalid.",
  timestamp: "An event timestamp is missing or invalid.",
  text: "A field is too long or contains unsupported characters.",
  transition: "This state change is not available from the current phase.",
  conflict: "The import contains conflicting records. Nothing was overwritten.",
  order: "An event precedes the associated transfer or an existing event.",
};
const commonFrIssues: WitnessCopy["issues"] = {
  format: "Le fichier ou l’entrée ne correspond pas au format prévu.",
  size: "Le fichier ou le registre dépasse la limite locale.",
  identity: "Un identifiant obligatoire est manquant ou non conforme.",
  duplicate: "Cet identifiant figure déjà dans le registre.",
  reference: "Le transfert indiqué par l’évènement n’est pas disponible.",
  source: "Les renseignements sur la source sont incomplets.",
  date: "La date civile est manquante ou invalide.",
  timestamp: "L’horodatage est manquant ou invalide.",
  text: "Un champ est trop long ou contient des caractères non pris en charge.",
  transition: "Ce changement d’état n’est pas disponible à cette étape.",
  conflict: "L’importation contient des divergences. Aucun dossier n’a été écrasé.",
  order: "Un évènement précède le transfert ou un évènement existant.",
};
const en: WitnessCopy = {
  heading: "Recovery transfer witness register",
  introduction: "Keep a local record of manually shared recovery information and acknowledgement notes.",
  caution: "An acknowledgement does not establish that an offline pack is complete or usable. UNKNOWN remains UNKNOWN.",
  inspect: "Inspect local packs",
  packId: "Pack", label: "Transfer label", kind: "Information type", channel: "Transfer channel",
  condition: "Reported condition", phase: "Documented phase", source: "Source name",
  licence: "Source licence", retrievedOn: "Source retrieval date", tier: "Source tier",
  reference: "Source reference", note: "Notes", bytes: "Reported bytes", digest: "Supplied digest",
  add: "Record transfer", record: "Record review event", open: "Choose JSON file", merge: "Merge staged records",
  export: "Export JSON", report: "Export text summary", cancel: "Clear staged import", empty: "No records yet.",
  noPacks: "Inspect local packs before creating a record.", pending: "Processing local file…", saved: "File saved.",
  failed: "The file could not be saved or opened.", staged: "Import staged for review.", merged: "Records merged without overwriting conflicts.",
  unknown: "UNKNOWN", entries: "Recorded transfers", events: "Recorded events", search: "Search records",
  filter: "Filter phase", all: "All phases", clear: "Clear search", sourceHeading: "Provenance",
  issuesHeading: "Review findings", action: "New event", files: "Manual file controls", reviewNote: "Review note",
  importWarning: "Examine import counts and conflicts before applying changes.",
  conditionNames: { UNKNOWN: "UNKNOWN", partial: "Partial", interrupted: "Interrupted", "not-accessible": "Not accessible", "review-needed": "Needs review" },
  kinds: { "pack-metadata": "Pack metadata", "recovery-report": "Recovery report", "handoff-note": "Handoff note", "evidence-list": "Evidence list" },
  channels: { "manual-file": "Manual file", paper: "Paper", conversation: "Conversation", UNKNOWN: "UNKNOWN" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed" },
  phases: { draft: "Draft", offered: "Offered", acknowledged: "Acknowledged", disputed: "Disputed", withdrawn: "Withdrawn" },
  actions: { created: "Created", note: "Add note", offered: "Mark offered", acknowledged: "Record acknowledgement", disputed: "Record dispute", withdrawn: "Withdraw", reopened: "Reopen" },
  issues: commonEnIssues,
};
const fr: WitnessCopy = {
  heading: "Registre des transferts de récupération",
  introduction: "Consignez localement les renseignements transmis manuellement et les avis de réception.",
  caution: "Un avis de réception n’établit pas qu’un ensemble hors ligne est complet ou utilisable\u202f; UNKNOWN reste UNKNOWN.",
  inspect: "Examiner les ensembles locaux",
  packId: "Ensemble", label: "Libellé du transfert", kind: "Type de renseignement", channel: "Mode de transfert",
  condition: "État déclaré", phase: "Étape consignée", source: "Nom de la source",
  licence: "Licence de la source", retrievedOn: "Date de consultation", tier: "Niveau de la source",
  reference: "Référence de la source", note: "Notes", bytes: "Octets déclarés", digest: "Empreinte fournie",
  add: "Consigner le transfert", record: "Consigner l’évènement", open: "Choisir un fichier JSON", merge: "Fusionner les dossiers préparés",
  export: "Exporter en JSON", report: "Exporter le résumé textuel", cancel: "Annuler l’importation", empty: "Aucun dossier pour le moment.",
  noPacks: "Examinez les ensembles locaux avant de créer un dossier.", pending: "Traitement du fichier local…", saved: "Fichier enregistré.",
  failed: "Le fichier n’a pas pu être enregistré ou ouvert.", staged: "Importation préparée pour examen.", merged: "Dossiers fusionnés sans écraser les divergences.",
  unknown: "UNKNOWN", entries: "Transferts consignés", events: "Évènements consignés", search: "Rechercher des dossiers",
  filter: "Filtrer les étapes", all: "Toutes les étapes", clear: "Effacer la recherche", sourceHeading: "Provenance",
  issuesHeading: "Points à examiner", action: "Nouvel évènement", files: "Fichiers manuels", reviewNote: "Note d’examen",
  importWarning: "Examinez les totaux et les divergences avant d’appliquer les modifications.",
  conditionNames: { UNKNOWN: "UNKNOWN", partial: "Partiel", interrupted: "Interrompu", "not-accessible": "Inaccessible", "review-needed": "À examiner" },
  kinds: { "pack-metadata": "Métadonnées de l’ensemble", "recovery-report": "Rapport de récupération", "handoff-note": "Note de transfert", "evidence-list": "Liste d’éléments" },
  channels: { "manual-file": "Fichier manuel", paper: "Papier", conversation: "Conversation", UNKNOWN: "UNKNOWN" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Déclaré", documented: "Documenté", reviewed: "Examiné" },
  phases: { draft: "Brouillon", offered: "Proposé", acknowledged: "Réception notée", disputed: "Contesté", withdrawn: "Retiré" },
  actions: { created: "Créé", note: "Ajouter une note", offered: "Marquer comme proposé", acknowledged: "Consigner la réception", disputed: "Consigner une contestation", withdrawn: "Retirer", reopened: "Rouvrir" },
  issues: commonFrIssues,
};
export function recoveryTransferWitnessCopy(locale: "en" | "fr"): WitnessCopy {
  return locale === "fr" ? fr : en;
}
